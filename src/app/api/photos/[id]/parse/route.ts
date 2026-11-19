import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { parsePhoto, PhotoError } from "@/lib/photos";

export const dynamic = "force-dynamic";

// Runs the photo through the parser; the result waits in the review inbox.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const documentId = await parsePhoto(id);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    return NextResponse.json({ documentId, status: doc.status });
  } catch (err) {
    if (err instanceof PhotoError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
