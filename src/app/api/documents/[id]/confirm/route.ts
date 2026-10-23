import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireToken } from "@/lib/api";
import { ConfirmError, confirmDocument } from "@/lib/ingest/apply";

export const dynamic = "force-dynamic";

const Body = z
  .object({ tripId: z.string().uuid().optional(), newTripName: z.string().min(1).optional() })
  .refine((b) => !(b.tripId && b.newTripName), "give tripId or newTripName, not both");

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    await confirmDocument(id, body.tripId ? { tripId: body.tripId } : body.newTripName ? { newTripName: body.newTripName } : null);
    return NextResponse.json({ status: "confirmed" });
  } catch (err) {
    if (err instanceof ConfirmError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
