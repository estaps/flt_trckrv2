import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { TripInput } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  const trips = await prisma.trip.findMany({
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { flights: true, expenses: true } } },
  });
  return NextResponse.json(trips);
}

export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  try {
    const input = TripInput.parse(await req.json());
    const trip = await prisma.trip.create({ data: input });
    return NextResponse.json(trip, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
