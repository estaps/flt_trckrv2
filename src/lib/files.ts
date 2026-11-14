import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config";

export const sha256Of = (data: Buffer) => createHash("sha256").update(data).digest("hex");

// Absolute path for a stored file, or null when the relative path escapes FILES_DIR.
export function storedPath(relPath: string): string | null {
  const base = path.resolve(getConfig().FILES_DIR);
  const file = path.resolve(base, relPath);
  return file.startsWith(base + path.sep) ? file : null;
}

// Writes data under FILES_DIR/<dir>/<first two hex>/<sha256><ext>; the same bytes always land in the same place.
export async function storeFile(dir: string, data: Buffer, ext: string, sha256 = sha256Of(data)): Promise<string> {
  const relPath = path.join(dir, sha256.slice(0, 2), `${sha256}${ext}`);
  const abs = storedPath(relPath)!;
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return relPath;
}

export async function readStored(relPath: string): Promise<Buffer | null> {
  const abs = storedPath(relPath);
  return abs ? readFile(abs).catch(() => null) : null;
}

export async function removeStored(relPath: string): Promise<void> {
  const abs = storedPath(relPath);
  if (abs) await unlink(abs).catch(() => undefined);
}
