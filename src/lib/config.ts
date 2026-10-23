import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HOME_CURRENCY: z.string().length(3).default("USD"),
  API_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  FILES_DIR: z.string().default("/data/files"),
  // Daily exchange rates for converting expenses; Frankfurter serves ECB rates without a key. "off" disables.
  FX_API_URL: z.string().default("https://api.frankfurter.dev/v1"),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_VISION_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && cached) return cached;
  const parsed = ConfigSchema.parse(env);
  if (env === process.env) cached = parsed;
  return parsed;
}
