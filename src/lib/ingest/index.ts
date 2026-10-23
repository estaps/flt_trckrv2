import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentSource } from "@prisma/client";
import { getConfig } from "../config";
import { prisma } from "../db";
import { llmSettingsFromEnv } from "../llm/settings";
import { parseText } from "../parse";
import { extractContent, mimeFromName } from "./extract";

export interface IngestInput {
  data: Buffer;
  filename: string;
  mimeType?: string;
  source: DocumentSource;
}

export interface IngestResult {
  documentId: string;
  duplicate: boolean;
  status: string;
}

// Stores a file, extracts its text, parses it, and leaves it in the review inbox.
export async function ingestFile(input: IngestInput): Promise<IngestResult> {
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const existing = await prisma.document.findUnique({ where: { sha256 } });
  if (existing) return { documentId: existing.id, duplicate: true, status: existing.status };

  const mimeType = mimeFromName(input.filename, input.mimeType);
  const ext = path.extname(input.filename).toLowerCase() || ".bin";
  const relPath = path.join(sha256.slice(0, 2), `${sha256}${ext}`);
  const absPath = path.join(getConfig().FILES_DIR, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, input.data);

  let content;
  try {
    content = await extractContent(input.data, mimeType);
  } catch (err) {
    const doc = await prisma.document.create({
      data: { source: input.source, sha256, mimeType, subject: input.filename, storagePath: relPath, status: "failed" },
    });
    await prisma.extraction.create({
      data: { documentId: doc.id, method: "manual", rawJson: { error: (err as Error).message } },
    });
    return { documentId: doc.id, duplicate: false, status: "failed" };
  }

  if (content.messageId) {
    const sameMessage = await prisma.document.findUnique({ where: { messageId: content.messageId } });
    if (sameMessage) return { documentId: sameMessage.id, duplicate: true, status: sameMessage.status };
  }

  const outcome = await parseText(content.text, llmSettingsFromEnv(), { sentAt: content.sentAt, images: content.images });
  const doc = await prisma.document.create({
    data: {
      source: input.source,
      sha256,
      mimeType,
      messageId: content.messageId,
      subject: content.subject ?? input.filename,
      sender: content.sender,
      storagePath: relPath,
      status: outcome.ok ? "needs_review" : "failed",
    },
  });
  await prisma.extraction.create({
    data: outcome.ok
      ? {
          documentId: doc.id,
          method: outcome.method === "llm" ? "llm" : "template",
          model: outcome.method === "llm" ? outcome.model : outcome.result.parsed.template,
          rawJson: JSON.parse(JSON.stringify(outcome.result)),
        }
      : { documentId: doc.id, method: "manual", rawJson: { error: outcome.reason } },
  });
  return { documentId: doc.id, duplicate: false, status: doc.status };
}
