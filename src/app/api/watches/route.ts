import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { WatchInput, createWatch } from "@/lib/prices/watches";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  const watches = await prisma.priceWatch.findMany({
    orderBy: { departDate: "asc" },
    include: { points: { orderBy: { observedAt: "desc" }, take: 1 } },
  });
  return NextResponse.json(
    watches.map(({ points, remoteToken: _token, ...w }) => ({ ...w, latest: points[0] ?? null })),
  );
}

export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  try {
    const watch = await createWatch(WatchInput.parse(await req.json()));
    const { remoteToken: _token, ...rest } = watch;
    return NextResponse.json(rest, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
