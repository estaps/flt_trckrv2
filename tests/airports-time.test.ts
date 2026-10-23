import { describe, expect, it } from "vitest";
import { findAirport } from "@/lib/airports";
import { inferYear, localToUtc, to24h } from "@/lib/time";

describe("findAirport", () => {
  it.each([
    ["ATL", "ATL"],
    ["ATLANTA", "ATL"],
    ["INDIANAPOLIS", "IND"],
    ["WASHINGTON-REAGAN", "DCA"],
    ["CHICAGO-O'HARE", "ORD"],
    ["NEW YORK-JFK", "JFK"],
    ["NEW YORK-LAGUARDIA", "LGA"],
    ["MINNEAPOLIS/ST PAUL", "MSP"],
    ["SALT LAKE CITY", "SLC"],
  ])("%s -> %s", (label, code) => {
    expect(findAirport(label).airport?.iata).toBe(code);
  });
  it("returns null for nonsense", () => {
    expect(findAirport("NOWHERE-ATALL").airport).toBeNull();
  });
});

describe("time helpers", () => {
  it("converts 12-hour times", () => {
    expect(to24h("06:52PM")).toBe("18:52");
    expect(to24h("12:05AM")).toBe("00:05");
    expect(to24h("12:30PM")).toBe("12:30");
  });
  it("rolls a date into next year when it is well before the sent date", () => {
    expect(inferYear(0, 5, new Date("2026-12-20T00:00:00Z"))).toBe(2027);
    expect(inferYear(9, 27, new Date("2026-10-15T00:00:00Z"))).toBe(2026);
  });
  it("handles daylight saving time", () => {
    expect(localToUtc("2026-07-01", "12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(localToUtc("2026-12-01", "12:00", "America/New_York").toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });
});
