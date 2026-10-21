import { getConfig } from "../config";
import type { LlmSettings } from ".";

export function llmSettingsFromEnv(): LlmSettings | null {
  const c = getConfig();
  if (!c.LLM_MODEL) return null;
  return {
    provider: c.LLM_PROVIDER,
    baseUrl: c.LLM_BASE_URL,
    apiKey: c.LLM_API_KEY,
    model: c.LLM_MODEL,
    visionModel: c.LLM_VISION_MODEL,
  };
}
