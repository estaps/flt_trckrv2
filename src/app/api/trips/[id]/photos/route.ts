import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { addPhoto, PhotoError } from "@/lib/photos";
import { PhotoPatch } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  const photos = await prisma.tripPhoto.findMany({ where: { tripId: id }, orderBy: { createdAt: "asc" } }).catch(() => []);
  return NextResponse.json(photos);
}

// multipart/form-data: one or more "file" fields, plus optional "kind", "caption" and "flightId".
export async function POST(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await prisma.trip.findUniqueOrThrow({ where: { id } });
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return NextResponse.json({ error: "no file field" }, { status: 400 });
    const meta = PhotoPatch.parse({
      kind: form.get("kind") || undefined,
      caption: form.get("caption") || undefined,
      flightId: form.get("flightId") || undefined,
    });
    const photos = [];
    for (const f of files) {
      photos.push(
        await addPhoto({
          tripId: id,
          data: Buffer.from(await f.arrayBuffer()),
          filename: f.name,
          mimeType: f.type,
          kind: meta.kind,
          caption: meta.caption,
          flightId: meta.flightId ?? undefined,
        }),
      );
    }
    return NextResponse.json(photos, { status: 201 });
  } catch (err) {
    if (err instanceof PhotoError) return NextResponse.json({ error: err.message }, { status: 415 });
    return errorResponse(err);
  }
}
