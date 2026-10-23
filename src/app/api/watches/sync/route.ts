import { NextResponse } from "next/server";
import { requireToken } from "@/lib/api";
import { flightFinderClient, syncAllWatches } from "@/lib/prices/sync";

export const dynamic = "force-dynamic";

// Reads new fares for every watch now, for an external scheduler or a manual refresh.
export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  if (!flightFinderClient()) {
    return NextResponse.json({ error: "FLIGHT_FINDER_URL is not set" }, { status: 503 });
  }
  return NextResponse.json({ results: await syncAllWatches() });
}
