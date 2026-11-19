import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { WatchPatch, deleteWatch, updateWatch } from "@/lib/prices/watches";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const { remoteToken: _token, ...watch } = await prisma.priceWatch.findUniqueOrThrow({
      where: { id },
      include: { points: { orderBy: { observedAt: "asc" } }, alerts: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json(watch);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const { remoteToken: _token, ...watch } = await updateWatch(id, WatchPatch.parse(await req.json()));
    return NextResponse.json(watch);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await deleteWatch(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
