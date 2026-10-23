import path from "node:path";
import sharp from "sharp";
import type { AttachmentKind } from "@prisma/client";
import { prisma } from "./db";
import { readStored, removeStored, sha256Of, storeFile } from "./files";
import { ingestFile } from "./ingest";
import { mimeFromName } from "./ingest/extract";

export class PhotoError extends Error {}

const THUMB_PX = 480;

export interface PhotoInput {
  tripId: string;
  data: Buffer;
  filename: string;
  mimeType?: string;
  kind?: AttachmentKind;
  caption?: string;
  flightId?: string;
}

// Upright, downsized WebP for the gallery grid. Null when the format cannot be decoded (HEIC, for one).
export async function makeThumbnail(data: Buffer): Promise<{ thumb: Buffer; width: number; height: number } | null> {
  try {
    const { data: thumb, info } = await sharp(data)
      .rotate()
      .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer({ resolveWithObject: true });
    const meta = await sharp(data).metadata();
    // EXIF orientations 5 to 8 are quarter turns, so the stored width and height swap.
    const turned = (meta.orientation ?? 1) >= 5;
    return {
      thumb,
      width: (turned ? meta.height : meta.width) ?? info.width,
      height: (turned ? meta.width : meta.height) ?? info.height,
    };
  } catch {
    return null;
  }
}

// Stores a photo with a trip. Uploading the same image to the same trip again returns the existing photo.
export async function addPhoto(input: PhotoInput) {
  const mimeType = mimeFromName(input.filename, input.mimeType);
  if (!mimeType.startsWith("image/")) throw new PhotoError(`${input.filename} is not an image`);
  const sha256 = sha256Of(input.data);
  const existing = await prisma.tripPhoto.findUnique({ where: { tripId_sha256: { tripId: input.tripId, sha256 } } });
  if (existing) return existing;

  const ext = path.extname(input.filename).toLowerCase() || `.${mimeType.split("/")[1] ?? "img"}`;
  const storagePath = await storeFile("photos", input.data, ext, sha256);
  const t = await makeThumbnail(input.data);
  const thumbnailPath = t ? await storeFile("photos/thumbs", t.thumb, ".webp", sha256) : null;
  return prisma.tripPhoto.create({
    data: {
      tripId: input.tripId,
      flightId: input.flightId,
      kind: input.kind ?? "ticket",
      caption: input.caption,
      filename: input.filename,
      mimeType,
      sha256,
      storagePath,
      thumbnailPath,
      width: t?.width,
      height: t?.height,
    },
  });
}

// Deletes the row, and the files once no other trip uses the same image.
export async function deletePhoto(id: string) {
  const photo = await prisma.tripPhoto.delete({ where: { id } });
  const others = await prisma.tripPhoto.count({ where: { sha256: photo.sha256 } });
  if (others === 0) {
    await removeStored(photo.storagePath);
    if (photo.thumbnailPath) await removeStored(photo.thumbnailPath);
  }
  return photo;
}

// Sends the photo through the same parser as uploads, so a ticket or receipt photo can
// become flights or an expense after review in the inbox. Returns the document id.
export async function parsePhoto(id: string): Promise<string> {
  const photo = await prisma.tripPhoto.findUniqueOrThrow({ where: { id } });
  if (photo.documentId) return photo.documentId;
  const data = await readStored(photo.storagePath);
  if (!data) throw new PhotoError("the photo file is missing from storage");
  const result = await ingestFile({ data, filename: photo.filename ?? path.basename(photo.storagePath), mimeType: photo.mimeType, source: "upload" });
  await prisma.tripPhoto.update({ where: { id }, data: { documentId: result.documentId } });
  return result.documentId;
}
