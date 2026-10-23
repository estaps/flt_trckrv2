import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireToken } from "@/lib/api";
import { fillHomeAmounts } from "@/lib/fx";

export const dynamic = "force-dynamic";

const Body = z.object({ tripId: z.string().uuid().optional() });

// Retries the exchange-rate lookup for expenses that have no home-currency amount yet.
export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  try {
    const { tripId } = Body.parse(await req.json().catch(() => ({})));
    const unconverted = await fillHomeAmounts(tripId ? { tripId } : {});
    return NextResponse.json({ unconverted });
  } catch (err) {
    return errorResponse(err);
  }
}
