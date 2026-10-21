import { describe, expect, it, vi } from "vitest";
import { extractJson, parseJsonReply, type LlmSettings } from "@/lib/llm";

function fakeFetch(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe("parseJsonReply", () => {
  it("parses plain JSON", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses JSON inside a code fence", () => {
    expect(parseJsonReply('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("parses JSON surrounded by prose", () => {
    expect(parseJsonReply('Result: {"flights":[]} done')).toEqual({ flights: [] });
  });
  it("throws when there is no JSON", () => {
    expect(() => parseJsonReply("no idea")).toThrow();
  });
});

describe("extractJson", () => {
  it("calls an OpenAI-compatible endpoint", async () => {
    const settings: LlmSettings = { provider: "openai", baseUrl: "http://ollama:11434/v1/", model: "llama3.1" };
    const f = fakeFetch({ choices: [{ message: { content: '{"ok":true}' } }] });
    const res = await extractJson(settings, { system: "s", prompt: "p" }, f as unknown as typeof fetch);
    expect(res.data).toEqual({ ok: true });
    expect(res.model).toBe("llama3.1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://ollama:11434/v1/chat/completions");
    expect(JSON.parse(String(init.body)).messages[1].content).toBe("p");
  });

  it("uses the vision model and image parts when images are sent", async () => {
    const settings: LlmSettings = {
      provider: "openai",
      baseUrl: "https://example.test/v1",
      apiKey: "k",
      model: "text-model",
      visionModel: "vision-model",
    };
    const f = fakeFetch({ choices: [{ message: { content: "{}" } }] });
    const res = await extractJson(
      settings,
      { system: "s", prompt: "p", images: [{ mediaType: "image/png", base64: "AAAA" }] },
      f as unknown as typeof fetch,
    );
    expect(res.model).toBe("vision-model");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    const parts = JSON.parse(String(init.body)).messages[1].content;
    expect(parts[1].image_url.url).toBe("data:image/png;base64,AAAA");
  });

  it("calls the Anthropic Messages API", async () => {
    const settings: LlmSettings = { provider: "anthropic", apiKey: "sk", model: "claude-model" };
    const f = fakeFetch({ content: [{ type: "text", text: '{"pnr":"ABC123"}' }] });
    const res = await extractJson(settings, { system: "s", prompt: "p" }, f as unknown as typeof fetch);
    expect(res.data).toEqual({ pnr: "ABC123" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk");
  });
});
