import { describe, expect, it } from "vitest";
import { FlightInput } from "@/lib/schemas";

describe("FlightInput", () => {
  it("normalizes codes to upper case", () => {
    const f = FlightInput.parse({
      carrier: "dl",
      flightNumber: "1234",
      depAirport: "atl",
      arrAirport: "lax",
      depTimeUtc: "2026-11-01T14:00:00Z",
    });
    expect(f.carrier).toBe("DL");
    expect(f.depAirport).toBe("ATL");
    expect(f.depTimeUtc.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("rejects a bad airport code", () => {
    expect(() =>
      FlightInput.parse({ carrier: "DL", flightNumber: "1", depAirport: "ATLX", arrAirport: "LAX", depTimeUtc: "2026-11-01" }),
    ).toThrow();
  });
});
