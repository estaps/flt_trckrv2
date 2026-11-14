import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { deletePhoto } from "@/lib/photos";
import { PhotoPatch } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const photo = await prisma.tripPhoto.update({ where: { id }, data: PhotoPatch.parse(await req.json()) });
    return NextResponse.json(photo);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await deletePhoto(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
