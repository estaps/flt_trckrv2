// Provider-neutral LLM client used by the extraction pipeline.
// Endpoints and models come from settings so they can be swapped without code changes.

export type LlmProvider = "openai" | "anthropic";

export interface LlmSettings {
  provider: LlmProvider;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  visionModel?: string;
}

export interface LlmImage {
  mediaType: string; // e.g. "image/png"
  base64: string;
}

export interface ExtractRequest {
  system: string;
  prompt: string;
  images?: LlmImage[];
  maxTokens?: number;
}

export interface ExtractResult<T = unknown> {
  data: T;
  model: string;
  raw: string;
}

type Fetch = typeof fetch;

const ANTHROPIC_DEFAULT_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

export class LlmError extends Error {}

// Pulls the first JSON object or array out of a model reply, tolerating code fences and prose.
export function parseJsonReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[{[]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new LlmError("model reply did not contain JSON");
  }
}

function pickModel(settings: LlmSettings, req: ExtractRequest): string {
  return req.images?.length && settings.visionModel ? settings.visionModel : settings.model;
}

async function callOpenAi(settings: LlmSettings, req: ExtractRequest, model: string, fetchImpl: Fetch) {
  if (!settings.baseUrl) throw new LlmError("LLM_BASE_URL is required for the openai provider");
  const content: unknown[] = [{ type: "text", text: req.prompt }];
  for (const img of req.images ?? []) {
    content.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } });
  }
  const res = await fetchImpl(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.images?.length ? content : req.prompt },
      ],
    }),
  });
  if (!res.ok) throw new LlmError(`LLM request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(settings: LlmSettings, req: ExtractRequest, model: string, fetchImpl: Fetch) {
  if (!settings.apiKey) throw new LlmError("LLM_API_KEY is required for the anthropic provider");
  const content: unknown[] = (req.images ?? []).map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));
  content.push({ type: "text", text: req.prompt });
  const base = (settings.baseUrl ?? ANTHROPIC_DEFAULT_URL).replace(/\/$/, "");
  const res = await fetchImpl(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new LlmError(`LLM request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return json.content?.find((b) => b.type === "text")?.text ?? "";
}

export async function extractJson<T = unknown>(
  settings: LlmSettings,
  req: ExtractRequest,
  fetchImpl: Fetch = fetch,
): Promise<ExtractResult<T>> {
  const model = pickModel(settings, req);
  const raw =
    settings.provider === "anthropic"
      ? await callAnthropic(settings, req, model, fetchImpl)
      : await callOpenAi(settings, req, model, fetchImpl);
  return { data: parseJsonReply(raw) as T, model, raw };
}
