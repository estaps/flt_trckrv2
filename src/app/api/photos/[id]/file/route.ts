import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readStored } from "@/lib/files";

export const dynamic = "force-dynamic";

// The full image, or with ?size=thumb the gallery thumbnail (falling back to the full image).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await prisma.tripPhoto.findUnique({ where: { id } }).catch(() => null);
  if (!photo) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const thumb = new URL(req.url).searchParams.get("size") === "thumb" && photo.thumbnailPath;
  const data = await readStored(thumb ? photo.thumbnailPath! : photo.storagePath);
  if (!data) return NextResponse.json({ error: "file_missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": thumb ? "image/webp" : photo.mimeType,
      "content-disposition": "inline",
      // Files are named by their hash, so a photo's bytes never change.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
