import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDelta } from "@/lib/parse/delta";
import { resolveDocument } from "@/lib/parse/resolve";

// Text fixtures are pdftotext -layout output of real Delta documents, with personal data replaced.
const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures/delta", name), "utf8");

describe("Delta email itinerary (hold)", () => {
  const doc = parseDelta(fixture("email-itinerary-hold.txt"))!;
  it("is recognized as a hold", () => {
    expect(doc.template).toBe("delta_email_itinerary");
    expect(doc.bookingStatus).toBe("held");
    expect(doc.confirmationCode).toBe("HLD123");
    expect(doc.passengerName).toBe("JANE TRAVELER");
  });
  it("reads the flight with year taken from the sent date", () => {
    expect(doc.flights).toEqual([
      {
        carrier: "DL",
        flightNumber: "1245",
        date: "2026-10-27",
        depLabel: "INDIANAPOLIS",
        arrLabel: "ATLANTA",
        depTimeLocal: "18:52",
        arrTimeLocal: "20:34",
        cabin: "Delta First Classic",
        fareClass: "Z",
        seat: "1B",
      },
    ]);
  });
  it("resolves airports and UTC times", () => {
    const r = resolveDocument(doc);
    expect(r.warnings).toEqual([]);
    expect(r.flights[0]).toMatchObject({
      depAirport: "IND",
      arrAirport: "ATL",
      depTimeUtc: "2026-10-27T22:52:00.000Z",
      arrTimeUtc: "2026-10-28T00:34:00.000Z",
    });
  });
});

describe("Delta email ticket receipt", () => {
  const doc = parseDelta(fixture("email-ticket-receipt.txt"))!;
  it("reads booking, ticket and charges", () => {
    expect(doc.template).toBe("delta_email_receipt");
    expect(doc.confirmationCode).toBe("TKT456");
    expect(doc.ticketNumber).toMatch(/^\d{13}$/);
    expect(doc.issuedOn).toBe("2026-10-19");
    expect(doc.charges).toEqual({ total: 848.4, baseFare: 774.88, taxes: 73.52, currency: "USD" });
    expect(doc.paymentCard).toBe("AX 4242");
  });
  it("joins a wrapped airport label and reads the seat", () => {
    expect(doc.flights[0]).toMatchObject({
      flightNumber: "926",
      date: "2026-10-21",
      depLabel: "ATLANTA",
      arrLabel: "WASHINGTON-REAGAN",
      depTimeLocal: "07:25",
      arrTimeLocal: "09:10",
      fareClass: "C",
      seat: "4D",
    });
    expect(resolveDocument(doc).flights[0]).toMatchObject({ depAirport: "ATL", arrAirport: "DCA" });
  });
  it("records the eCredit applied and the new one issued", () => {
    expect(doc.ecreditsApplied).toEqual([{ number: expect.any(String), amount: 405, currency: "USD" }]);
    expect(doc.ecreditsIssued[0]).toMatchObject({ amount: 40, expiresOn: "2027-06-09" });
  });
});

describe("Delta cancellation", () => {
  const doc = parseDelta(fixture("email-cancellation.txt"))!;
  it("lists the cancelled ticket, which becomes an eCredit", () => {
    expect(doc.kind).toBe("cancellation");
    expect(doc.cancelledTicketNumbers).toEqual(["0060000000001"]);
    expect(doc.ecreditsIssued).toEqual([{ number: "0060000000001", sourceTicketNumber: "0060000000001", currency: "USD" }]);
    expect(doc.flights).toEqual([]);
  });
});

describe("delta.com receipt", () => {
  it("reads a plain receipt", () => {
    const doc = parseDelta(fixture("web-receipt.txt"))!;
    expect(doc.template).toBe("delta_web_receipt");
    expect(doc.confirmationCode).toBe("TKT012");
    expect(doc.issuedOn).toBe("2026-10-03");
    expect(doc.flights).toEqual([
      { carrier: "DL", flightNumber: "2738", date: "2026-10-05", depLabel: "ATL", arrLabel: "ORD", fareClass: "T", cabin: "Delta Main" },
    ]);
    expect(doc.charges?.total).toBe(330.4);
    expect(doc.paymentCard).toBe("American Express 4242");
  });
  it("links the eCredit paid with to the cancelled ticket", () => {
    const doc = parseDelta(fixture("web-receipt-ecredit.txt"))!;
    expect(doc.ecreditsApplied).toEqual([{ number: "0060000000001", amount: 388.4, currency: "USD" }]);
    expect(doc.ecreditsIssued[0]).toMatchObject({ amount: 70, sourceTicketNumber: "0060000000001" });
  });
});

it("ignores text that is not from Delta", () => {
  expect(parseDelta("Your hotel reservation at the Grand")).toBeNull();
});
