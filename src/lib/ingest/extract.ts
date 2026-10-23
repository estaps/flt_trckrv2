import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { simpleParser } from "mailparser";
import type { LlmImage } from "../llm";

const run = promisify(execFile);

export interface ExtractedContent {
  text: string;
  images: LlmImage[];
  subject?: string;
  sender?: string;
  messageId?: string;
  sentAt?: string; // YYYY-MM-DD
}

// PDF text with columns kept in place (poppler's pdftotext), which the airline templates rely on.
export async function pdfToText(buf: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ft-pdf-"));
  try {
    const file = path.join(dir, "in.pdf");
    await writeFile(file, buf);
    const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "   ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

export function mimeFromName(name: string, given?: string): string {
  if (given && given !== "application/octet-stream") return given;
  const ext = path.extname(name).toLowerCase();
  return (
    { ".pdf": "application/pdf", ".eml": "message/rfc822", ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext] ??
    "application/octet-stream"
  );
}

export async function extractContent(buf: Buffer, mimeType: string): Promise<ExtractedContent> {
  if (mimeType === "application/pdf") return { text: await pdfToText(buf), images: [] };
  if (mimeType.startsWith("text/")) return { text: buf.toString("utf8"), images: [] };
  if (mimeType.startsWith("image/")) return { text: "", images: [{ mediaType: mimeType, base64: buf.toString("base64") }] };
  if (mimeType === "message/rfc822") {
    const mail = await simpleParser(buf);
    const parts = [mail.text || (mail.html ? htmlToText(mail.html) : "")];
    const images: LlmImage[] = [];
    for (const a of mail.attachments) {
      if (a.contentType === "application/pdf") parts.push(await pdfToText(a.content));
      else if (a.contentType.startsWith("image/") && a.contentDisposition === "attachment") {
        images.push({ mediaType: a.contentType, base64: a.content.toString("base64") });
      }
    }
    const from = mail.from?.value[0];
    return {
      text: parts.join("\n\n"),
      images,
      subject: mail.subject,
      sender: from ? `${from.name ?? ""} <${from.address ?? ""}>`.trim() : undefined,
      messageId: mail.messageId,
      sentAt: mail.date?.toISOString().slice(0, 10),
    };
  }
  throw new Error(`unsupported file type: ${mimeType}`);
}
