import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ExpenseInput, ExpensePatch } from "@/lib/schemas";
import { ParsedDocument } from "@/lib/parse/types";
import { parseWithLlm } from "@/lib/parse/llm";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
});

describe("ExpenseInput", () => {
  it("reads form values", () => {
    const e = ExpenseInput.parse({ category: "meals", amount: "42.50", currency: "eur", spentOn: "2026-11-02", merchant: "", amountHome: "" });
    expect(e.amount).toBe(42.5);
    expect(e.currency).toBe("EUR");
    expect(e.merchant).toBeUndefined();
    expect(e.amountHome).toBeUndefined();
    expect(e.spentOn.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("takes the card charge in the home currency", () => {
    expect(ExpenseInput.parse({ category: "lodging", amount: 300, currency: "GBP", spentOn: "2026-11-02", amountHome: "381.12" }).amountHome).toBe(381.12);
  });

  it("rejects unknown categories, zero amounts and bad currencies", () => {
    const base = { category: "meals", amount: 10, currency: "USD", spentOn: "2026-11-02" };
    expect(() => ExpenseInput.parse({ ...base, category: "snacks" })).toThrow();
    expect(() => ExpenseInput.parse({ ...base, amount: 0 })).toThrow();
    expect(() => ExpenseInput.parse({ ...base, currency: "EURO" })).toThrow();
  });

  it("allows clearing fields in a patch", () => {
    expect(ExpensePatch.parse({ merchant: null, tripId: null })).toEqual({ merchant: null, tripId: null });
  });
});

describe("exchange rates", () => {
  it("asks Frankfurter for the day's rate", async () => {
    const { fetchRate } = await import("@/lib/fx");
    const f = vi.fn(async () => new Response(JSON.stringify({ amount: 1, base: "EUR", date: "2026-10-16", rates: { USD: 1.0842 } })));
    expect(await fetchRate("EUR", "USD", "2026-10-18", f as unknown as typeof fetch)).toBe(1.0842);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.frankfurter.dev/v1/2026-10-18?base=EUR&symbols=USD");
  });

  it("returns null for a currency the source does not carry", async () => {
    const { fetchRate } = await import("@/lib/fx");
    const f = vi.fn(async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }));
    expect(await fetchRate("XYZ", "USD", "2026-10-18", f as unknown as typeof fetch)).toBeNull();
  });

  it("keeps home-currency amounts as they are", async () => {
    const { toHome } = await import("@/lib/fx");
    const f = vi.fn();
    const home = await toHome(12.34, "USD", new Date("2026-10-18"), f as unknown as typeof fetch);
    expect(Number(home!.amountHome)).toBe(12.34);
    expect(home!.fxSource).toBe("same");
    expect(f).not.toHaveBeenCalled();
  });

  it("derives the rate from a card charge", async () => {
    const { manualHome } = await import("@/lib/fx");
    const home = manualHome(300, 381.12);
    expect(Number(home.amountHome)).toBe(381.12);
    expect(Number(home.fxRate)).toBeCloseTo(1.2704, 6);
    expect(home.fxSource).toBe("manual");
  });
});

describe("receipt parsing", () => {
  it("accepts an expense receipt from the LLM", async () => {
    const reply = { kind: "expense_receipt", expense: { category: "lodging", merchant: "Hotel Arts", total: 412.8, currency: "EUR", date: "2026-11-03" } };
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] })));
    vi.stubGlobal("fetch", f);
    try {
      const { parsed } = await parseWithLlm({ provider: "openai", baseUrl: "http://llm/v1", model: "m" }, "HOTEL ARTS ... TOTAL EUR 412,80");
      expect(parsed.kind).toBe("expense_receipt");
      expect(parsed.expense).toEqual(reply.expense);
      expect(parsed.flights).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("still parses airline documents without an expense", () => {
    expect(ParsedDocument.parse({ kind: "ticket_receipt", template: "x" }).expense).toBeUndefined();
  });
});

describe("photo thumbnails", () => {
  it("turns a sideways phone photo upright and reports its real size", async () => {
    const { makeThumbnail } = await import("@/lib/photos");
    // 1200x800 pixels stored with EXIF orientation 6: displayed as 800x1200.
    const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#3366cc" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const t = await makeThumbnail(photo);
    expect(t).not.toBeNull();
    expect([t!.width, t!.height]).toEqual([800, 1200]);
    const meta = await sharp(t!.thumb).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([320, 480]);
  });

  it("returns null for something it cannot decode", async () => {
    const { makeThumbnail } = await import("@/lib/photos");
    expect(await makeThumbnail(Buffer.from("not an image"))).toBeNull();
  });
});
