import { describe, expect, it } from "vitest";
import {
  cheapestForWatch,
  clock24,
  evaluateAlerts,
  groupIntoChecks,
  normalizeFlightNumber,
  type Fare,
} from "@/lib/prices/match";
import { FlightFinderClient, FlightFinderError } from "@/lib/prices/flight-finder";

const fare = (over: Partial<Fare>): Fare => ({
  travelDate: "2026-12-01T00:00:00.000Z",
  price: 300,
  currency: "USD",
  airline: "Delta",
  stops: 0,
  scrapedAt: "2026-11-01T12:00:00.000Z",
  ...over,
});

const watch = { departDate: "2026-12-01", currency: "USD" };

describe("normalizers", () => {
  it("normalizes flight numbers", () => {
    expect(normalizeFlightNumber("DL 0345")).toBe("DL345");
    expect(normalizeFlightNumber("dl345")).toBe("DL345");
    expect(normalizeFlightNumber("Delta")).toBeNull();
  });

  it("reads 12 and 24 hour clocks", () => {
    expect(clock24("10:25 AM")).toBe("10:25");
    expect(clock24("12:05 AM")).toBe("00:05");
    expect(clock24("2:00 PM")).toBe("14:00");
    expect(clock24("09:00")).toBe("09:00");
    expect(clock24("25:00")).toBeNull();
  });
});

describe("groupIntoChecks", () => {
  it("splits fares into runs by scrape time", () => {
    const runs = groupIntoChecks([
      fare({ scrapedAt: "2026-11-01T15:00:00Z" }),
      fare({ scrapedAt: "2026-11-01T12:00:00Z" }),
      fare({ scrapedAt: "2026-11-01T12:04:00Z" }),
    ]);
    expect(runs.map((r) => r.length)).toEqual([2, 1]);
  });
});

describe("cheapestForWatch", () => {
  const run = [
    fare({ airline: "United", price: 199 }),
    fare({ airline: "Delta", price: 289, flightNumber: "DL 1200", departureTime: "7:05 AM" }),
    fare({ airline: "Delta", price: 259, flightNumber: "DL 88", departureTime: "6:00 PM" }),
    fare({ airline: "Delta", price: 150, travelDate: "2026-12-02T00:00:00Z" }),
    fare({ airline: "Delta", price: 120, currency: "EUR" }),
  ];

  it("takes the cheapest fare on the date for any airline", () => {
    expect(cheapestForWatch(run, watch)).toMatchObject({ price: 199, matchedBy: "route", fareCount: 3 });
  });

  it("filters by airline", () => {
    expect(cheapestForWatch(run, { ...watch, airline: "delta" })).toMatchObject({ price: 259, matchedBy: "airline" });
  });

  it("finds the watched flight by number", () => {
    const check = cheapestForWatch(run, { ...watch, airline: "Delta", flightNumber: "DL1200" });
    expect(check).toMatchObject({ price: 289, matchedBy: "flight", flightNumber: "DL1200", departTime: "07:05" });
  });

  it("returns nothing when the watched flight is not listed", () => {
    expect(cheapestForWatch(run, { ...watch, airline: "Delta", flightNumber: "DL5" })).toBeNull();
  });

  it("falls back to departure time, then to the airline", () => {
    const noNumbers = run.map((f) => ({ ...f, flightNumber: null }));
    expect(
      cheapestForWatch(noNumbers, { ...watch, airline: "Delta", flightNumber: "DL1200", departTime: "07:05" }),
    ).toMatchObject({ price: 289, matchedBy: "flight" });
    const bare = run.map((f) => ({ ...f, flightNumber: null, departureTime: null }));
    expect(cheapestForWatch(bare, { ...watch, airline: "Delta", flightNumber: "DL1200" })).toMatchObject({
      price: 259,
      matchedBy: "airline",
    });
  });

  it("respects max stops", () => {
    const stops = [fare({ price: 100, stops: 2 }), fare({ price: 180, stops: 0 })];
    expect(cheapestForWatch(stops, { ...watch, maxStops: 0 })?.price).toBe(180);
  });
});

describe("evaluateAlerts", () => {
  it("adds up small drops from the last high", () => {
    let baseline: number | null = null;
    let previous: number | null = null;
    const kinds: string[][] = [];
    for (const price of [300, 290, 280, 270, 260, 280, 250]) {
      const r = evaluateAlerts(price, previous, baseline, { dropAmount: 25 });
      kinds.push(r.alerts.map((a) => a.kind));
      baseline = r.baseline;
      previous = price;
    }
    // 300 -> 270 fires; the baseline resets to 270, rises to 280, and 250 fires again.
    expect(kinds).toEqual([[], [], [], ["drop"], [], [], ["drop"]]);
  });

  it("supports percentage drops", () => {
    expect(evaluateAlerts(270, 300, 300, { dropPercent: 0.1 }).alerts.map((a) => a.kind)).toEqual(["drop"]);
    expect(evaluateAlerts(275, 300, 300, { dropPercent: 0.1 }).alerts).toEqual([]);
  });

  it("fires target and paid alerts once on crossing", () => {
    const rules = { targetPrice: 250, paidPrice: 280 };
    expect(evaluateAlerts(240, 300, 300, rules).alerts.map((a) => a.kind)).toEqual(["below_paid", "target"]);
    expect(evaluateAlerts(235, 240, 240, rules).alerts).toEqual([]);
    expect(evaluateAlerts(260, null, null, rules).alerts.map((a) => a.kind)).toEqual(["below_paid"]);
  });

  it("does nothing without rules", () => {
    expect(evaluateAlerts(100, 300, 300, {}).alerts).toEqual([]);
  });
});

describe("FlightFinderClient", () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (responses: Array<[number, unknown]>) =>
    (async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const [status, body] = responses.shift()!;
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;

  it("creates a one-way tracker with the bearer token", async () => {
    calls.length = 0;
    const client = new FlightFinderClient(
      "http://flight-finder:3003",
      "ff_secret",
      fakeFetch([[201, { ok: true, data: { queries: [{ id: "q1", deleteToken: "d1" }] } }]]),
    );
    const t = await client.createTracker({
      origin: "ATL",
      destination: "LAX",
      departDate: "2026-12-01",
      cabin: "economy",
      currency: "USD",
      airline: "Delta",
      maxStops: 0,
    });
    expect(t).toEqual({ id: "q1", deleteToken: "d1" });
    expect(calls[0].url).toBe("http://flight-finder:3003/api/queries");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer ff_secret");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      tripType: "one_way",
      dateFrom: "2026-12-01",
      dateTo: "2026-12-01",
      preferredAirlines: ["Delta"],
      maxStops: 0,
      routes: [{ origin: "ATL", destination: "LAX", date: "2026-12-01", selectedFlights: [] }],
    });
  });

  it("surfaces sidecar errors with their status", async () => {
    const client = new FlightFinderClient("http://ff", undefined, fakeFetch([[410, { ok: false, error: "This tracker has expired" }]]));
    const err = await client.fares("q1").catch((e) => e);
    expect(err).toBeInstanceOf(FlightFinderError);
    expect(err.status).toBe(410);
    expect(err.message).toBe("This tracker has expired");
  });
});
