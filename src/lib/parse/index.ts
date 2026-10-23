import type { LlmImage, LlmSettings } from "../llm";
import { parseDelta } from "./delta";
import { parseWithLlm } from "./llm";
import { resolveDocument, type ResolvedDocument } from "./resolve";

export type ParseOutcome =
  | { ok: true; method: "template" | "llm"; model?: string; result: ResolvedDocument }
  | { ok: false; reason: string };

// Known templates first: they are exact and free. The LLM handles everything else.
export async function parseText(
  text: string,
  llm: LlmSettings | null,
  opts: { sentAt?: string; images?: LlmImage[] } = {},
): Promise<ParseOutcome> {
  const template = text ? parseDelta(text, opts.sentAt) : null;
  if (template) return { ok: true, method: "template", result: resolveDocument(template) };
  if (!llm) return { ok: false, reason: "no template matched and no LLM is configured" };
  try {
    const { parsed, model } = await parseWithLlm(llm, text, opts.sentAt, opts.images);
    return { ok: true, method: "llm", model, result: resolveDocument(parsed) };
  } catch (err) {
    return { ok: false, reason: `LLM extraction failed: ${(err as Error).message}` };
  }
}
