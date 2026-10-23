import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// Serves the original upload so it can be checked against the parsed result.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } }).catch(() => null);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const base = path.resolve(getConfig().FILES_DIR);
  const file = path.resolve(base, doc.storagePath);
  if (!file.startsWith(base + path.sep)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data = await readFile(file).catch(() => null);
  if (!data) return NextResponse.json({ error: "file_missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: { "content-type": doc.mimeType, "content-disposition": "inline" },
  });
}
