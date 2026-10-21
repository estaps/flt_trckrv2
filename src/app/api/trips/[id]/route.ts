import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { TripInput } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const trip = await prisma.trip.findUniqueOrThrow({
      where: { id },
      include: { flights: { orderBy: { depTimeUtc: "asc" } }, expenses: true, bookings: true },
    });
    return NextResponse.json(trip);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const input = TripInput.partial().parse(await req.json());
    const trip = await prisma.trip.update({ where: { id }, data: input });
    return NextResponse.json(trip);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await prisma.trip.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
