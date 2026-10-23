import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { FlightPatch } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const flight = await prisma.flight.findUniqueOrThrow({ where: { id }, include: { changes: true } });
    return NextResponse.json(flight);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const input = FlightPatch.parse(await req.json());
    const flight = await prisma.flight.update({ where: { id }, data: input });
    return NextResponse.json(flight);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await prisma.flight.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
