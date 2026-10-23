import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HOME_CURRENCY: z.string().length(3).default("USD"),
  API_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  FILES_DIR: z.string().default("/data/files"),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_VISION_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  FLIGHT_FINDER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  FLIGHT_FINDER_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  PRICE_SYNC_MINUTES: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(60)),
  ALERT_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ALERT_WEBHOOK_FORMAT: z.preprocess(emptyToUndefined, z.enum(["ntfy", "json"]).default("ntfy")),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && cached) return cached;
  const parsed = ConfigSchema.parse(env);
  if (env === process.env) cached = parsed;
  return parsed;
}
