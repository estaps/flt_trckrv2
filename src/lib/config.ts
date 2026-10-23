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
  IMAP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  // true = TLS from the start (port 993); false = plain connection upgraded with STARTTLS (Proton Bridge).
  IMAP_SECURE: z.preprocess((v) => (v === "" || v === undefined ? undefined : v === "true"), z.boolean().default(true)),
  // Accept a self-signed certificate, as Proton Bridge uses. Only for a server on your own network.
  IMAP_TLS_INSECURE: z.preprocess((v) => v === "true", z.boolean()).default(false),
  IMAP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  IMAP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  IMAP_MAILBOX: z.string().default("INBOX"),
  IMAP_POLL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && cached) return cached;
  const parsed = ConfigSchema.parse(env);
  if (env === process.env) cached = parsed;
  return parsed;
}
