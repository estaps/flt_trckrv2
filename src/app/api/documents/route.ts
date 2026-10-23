import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { ingestFile } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const docs = await prisma.document.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return NextResponse.json(docs);
}

// multipart/form-data with one or more "file" fields.
export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "no file field" }, { status: 400 });
    const results = [];
    for (const f of files) {
      results.push(
        await ingestFile({ data: Buffer.from(await f.arrayBuffer()), filename: f.name, mimeType: f.type, source: "api" }),
      );
    }
    return NextResponse.json(results, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
