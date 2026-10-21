import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { FlightInput } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  const tripId = new URL(req.url).searchParams.get("tripId") ?? undefined;
  const flights = await prisma.flight.findMany({
    where: tripId ? { tripId } : undefined,
    orderBy: { depTimeUtc: "asc" },
  });
  return NextResponse.json(flights);
}

export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  try {
    const input = FlightInput.parse(await req.json());
    const flight = await prisma.flight.create({ data: input });
    return NextResponse.json(flight, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
