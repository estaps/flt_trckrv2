// Template parsers for Delta Air Lines documents, built against real samples:
// emails printed to PDF from webmail (itinerary, eTicket receipt, cancellation)
// and the receipt PDF downloaded from delta.com My Trips.
// Input is text from `pdftotext -layout`, so table columns are separated by runs of spaces.

import { inferYear, isoDate, monthIndex, to24h } from "../time";
import type { ParsedDocument, ParsedECredit, ParsedFlight } from "./types";

const TIME = /^\d{1,2}:\d{2}[AP]M$/i;

export function cleanText(text: string): string {
  return text
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    // Drop webmail print headers and page footers.
    .filter((l) => !/^\S.* Mail - .*https?:\/\//.test(l) && !/^\d+ of \d+\s{2,}\d{1,2}\/\d{1,2}\/\d{2}, /.test(l))
    .join("\n");
}

const cells = (line: string) => line.trim().split(/\s{2,}/).filter(Boolean);

function money(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/,/g, "").match(/-?\$?\s*(-?\d+(?:\.\d{2})?)/);
  return m ? Number(m[1]) : undefined;
}

// "19OCT26" -> "2026-10-19"
function ddMonYy(s: string): string {
  const m = s.match(/^(\d{2})([A-Z]{3})(\d{2})$/i)!;
  return isoDate(2000 + Number(m[3]), monthIndex(m[2]), Number(m[1]));
}

function firstMatch(text: string, re: RegExp): string | undefined {
  return text.match(re)?.[1]?.trim();
}

// Set by parseDelta from the email's Date header when the text itself does not print one.
let fallbackSent: Date | undefined;

function sentDate(text: string): Date | undefined {
  const m = text.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) at /);
  return m ? new Date(Date.UTC(Number(m[3]), monthIndex(m[1]), Number(m[2]))) : fallbackSent;
}

function blankDoc(template: string, kind: ParsedDocument["kind"]): ParsedDocument {
  return {
    kind,
    template,
    airline: "DL",
    flights: [],
    ecreditsApplied: [],
    ecreditsIssued: [],
    cancelledTicketNumbers: [],
    warnings: [],
  };
}

// Flight blocks in Delta emails:
//   Tuesday, 27Oct               DEPART                  ARRIVE
//   DELTA 1245                   INDIANAPOLIS            ATLANTA
//   Delta First Classic (Z)      06:52PM                 08:34PM
// Long city labels wrap ("WASHINGTON-" then "REAGAN"), pushing the time to the next line.
function emailFlights(text: string, reference: Date | undefined, warnings: string[]): ParsedFlight[] {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const flights: ParsedFlight[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^\s*\w+,\s*(\d{1,2})\s*([A-Za-z]{3})\s{2,}DEPART\s{2,}ARRIVE\s*$/);
    if (!head) continue;
    const first = cells(lines[i + 1] ?? "");
    const fl = first[0]?.match(/^DELTA\s+(\d{1,4})$/i);
    if (!fl || first.length < 3) {
      warnings.push(`could not read the flight block at line ${i + 1}`);
      continue;
    }
    let dep = first[1];
    let arr = first[2];
    let cabin: string | undefined;
    const times: string[] = [];
    for (let j = i + 2; j < Math.min(i + 6, lines.length) && times.length < 2; j++) {
      const row = cells(lines[j]);
      row.forEach((cell, k) => {
        if (TIME.test(cell)) times.push(cell);
        else if (j === i + 2 && k === 0) cabin = cell;
        else if (dep.endsWith("-")) dep += cell;
        else if (arr.endsWith("-")) arr += cell;
      });
    }
    const month = monthIndex(head[2]);
    const day = Number(head[1]);
    const year = reference ? inferYear(month, day, reference) : new Date().getUTCFullYear();
    if (!reference) warnings.push("no sent date found; assumed the current year for flight dates");
    const fareClass = cabin?.match(/\(([A-Z])\)\s*$/)?.[1];
    flights.push({
      carrier: "DL",
      flightNumber: fl[1],
      date: isoDate(year, month, day),
      depLabel: dep,
      arrLabel: arr,
      depTimeLocal: times[0] ? to24h(times[0]) : undefined,
      arrTimeLocal: times[1] ? to24h(times[1]) : undefined,
      cabin: cabin?.replace(/\s*\([A-Z]\)\s*$/, ""),
      fareClass,
    });
  }
  // Seats are listed separately: "FLIGHT   SEAT" then "DELTA 1245   01B".
  for (const m of text.matchAll(/^\s*DELTA\s+(\d{1,4})\s{2,}(\d{1,2}[A-K])\s*$/gim)) {
    const f = flights.find((x) => x.flightNumber === m[1]);
    if (f) f.seat = m[2].replace(/^0/, "");
  }
  return flights;
}

function parseEmailItinerary(text: string): ParsedDocument {
  const doc = blankDoc("delta_email_itinerary", "itinerary");
  const sent = sentDate(text);
  doc.sentAt = sent?.toISOString().slice(0, 10);
  doc.confirmationCode = firstMatch(text, /Trip Confirmation #:\s*([A-Z0-9]{6})/);
  doc.passengerName = firstMatch(text, /Passenger Name:\s*(.+)/);
  // "This information is a copy of your itinerary and not a receipt": a hold, not yet ticketed.
  doc.bookingStatus = /not a receipt/i.test(text) ? "held" : "ticketed";
  doc.flights = emailFlights(text, sent, doc.warnings);
  return doc;
}

function parseEmailReceipt(text: string): ParsedDocument {
  const doc = blankDoc("delta_email_receipt", "ticket_receipt");
  const sent = sentDate(text);
  doc.sentAt = sent?.toISOString().slice(0, 10);
  doc.bookingStatus = "ticketed";
  doc.confirmationCode = firstMatch(text, /Confirmation Number\s*\n\s*([A-Z0-9]{6})\b/);
  doc.passengerName = firstMatch(text, /^\s*Name:\s*(.+)$/m);
  doc.ticketNumber = firstMatch(text, /Ticket #:\s*(\d{13})/);
  const issued = firstMatch(text, /Issue Date:\s*(\d{2}[A-Z]{3}\d{2})/);
  if (issued) doc.issuedOn = ddMonYy(issued);
  doc.flights = emailFlights(text, sent, doc.warnings);

  const total = money(firstMatch(text, /TICKET AMOUNT\s+(\S+)/));
  const base = money(firstMatch(text, /Base Fare\s+(\S+)/));
  if (total !== undefined) {
    doc.charges = {
      total,
      baseFare: base,
      taxes: base !== undefined ? Math.round((total - base) * 100) / 100 : undefined,
      currency: firstMatch(text, /TICKET AMOUNT\s+\S+\s+([A-Z]{3})/) ?? "USD",
    };
  }
  const card = text.match(/FOP\s+([A-Z]{2})\*+(\d{4})/);
  if (card) doc.paymentCard = `${card[1]} ${card[2]}`;

  const applied = firstMatch(text, /eCredits Number\s+(\d{13})/);
  if (applied) {
    doc.ecreditsApplied.push({
      number: applied,
      amount: money(firstMatch(text, /Amount Applied\s+(\S+)/)),
      currency: "USD",
    });
  }
  const issuedCredit = firstMatch(text, /New eCredit #:\s*(\d{13})/);
  if (issuedCredit) {
    const expires = firstMatch(text, /eCredit Expiration:\s*(\d{2}[A-Z]{3}\d{2})/);
    const remaining = text.slice(text.indexOf("New eCredit #"));
    doc.ecreditsIssued.push({
      number: issuedCredit,
      amount: money(firstMatch(remaining, /TOTAL:\s*(\S+)/)),
      currency: "USD",
      expiresOn: expires ? ddMonYy(expires) : undefined,
      sourceTicketNumber: applied,
    });
  }
  return doc;
}

function parseCancellation(text: string): ParsedDocument {
  const doc = blankDoc("delta_email_cancellation", "cancellation");
  doc.sentAt = sentDate(text)?.toISOString().slice(0, 10);
  doc.bookingStatus = "cancelled";
  const block = text.slice(text.search(/Ticket\/Document Number/));
  for (const m of block.matchAll(/^\s*([A-Z][A-Z' -]+?)\s{2,}(\d{13})\s*$/gm)) {
    doc.passengerName ??= m[1].trim();
    doc.cancelledTicketNumbers.push(m[2]);
    // The cancelled ticket's value becomes an eCredit under the same number.
    doc.ecreditsIssued.push({ number: m[2], sourceTicketNumber: m[2], currency: "USD" });
  }
  if (doc.cancelledTicketNumbers.length === 0) doc.warnings.push("no ticket numbers found in the cancellation");
  return doc;
}

// delta.com "receiptDetails" PDF. Flights look like:
//   ATL>ORD                OPEN     T     Delta Main
//       to
//   Mon 05Oct2026 DL 2738
function parseWebReceipt(text: string): ParsedDocument {
  const doc = blankDoc("delta_web_receipt", "ticket_receipt");
  doc.bookingStatus = "ticketed";
  const purchased = text.match(/Date of Purchase:\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
  if (purchased) doc.issuedOn = isoDate(Number(purchased[3]), monthIndex(purchased[1]), Number(purchased[2]));
  doc.confirmationCode = firstMatch(text, /Confirmation Number:\s*([A-Z0-9]{6})/);
  doc.ticketNumber = firstMatch(text, /Ticket Number:\s*(\d{13})/);
  doc.passengerName = firstMatch(text, /PASSENGER INFORMATION\s*\n\s*(.+?)\s{2,}/);

  const re =
    /^\s*([A-Z]{3})>([A-Z]{3})\s{2,}\S+\s{2,}([A-Z])\s{2,}(.+)\n(?:\s*to\s*\n)?\s*\w{3} (\d{2})([A-Za-z]{3})(\d{4}) ([A-Z0-9]{2}) (\d{1,4})/gm;
  for (const m of text.matchAll(re)) {
    doc.flights.push({
      carrier: m[8],
      flightNumber: m[9],
      date: isoDate(Number(m[7]), monthIndex(m[6]), Number(m[5])),
      depLabel: m[1],
      arrLabel: m[2],
      fareClass: m[3],
      cabin: m[4].trim(),
    });
  }
  if (doc.flights.length === 0) doc.warnings.push("no flights found in the receipt");

  const total = money(firstMatch(text, /Total Price:\s*(\S+)/));
  const base = money(firstMatch(text, /Base Fare:\s*(\S+)/));
  if (total !== undefined) {
    doc.charges = {
      total,
      baseFare: base,
      taxes: base !== undefined ? Math.round((total - base) * 100) / 100 : undefined,
      currency: firstMatch(text, /Total Price:\s*\S+\s+([A-Z]{3})/) ?? "USD",
    };
  }
  const card = firstMatch(text, /Paid with (.+?\*+\d{4})/);
  if (card) doc.paymentCard = card.replace(/\s*\*+/, " ");

  for (const m of text.matchAll(/Applied ECredit\s*\((\d{13})\)\s+\$?([\d.,]+)/g)) {
    doc.ecreditsApplied.push({ number: m[1], amount: money(m[2]), currency: "USD" });
  }
  for (const m of text.matchAll(/Remaining ECredit Balance\s*\((\d{13})\)\s+\$?([\d.,]+)/g)) {
    const credit: ParsedECredit = { number: m[1], amount: money(m[2]), currency: "USD" };
    if (doc.ecreditsApplied[0]) credit.sourceTicketNumber = doc.ecreditsApplied[0].number;
    doc.ecreditsIssued.push(credit);
  }
  return doc;
}

// Returns null when the text is not a recognized Delta document.
export function parseDelta(raw: string, sentAt?: string): ParsedDocument | null {
  fallbackSent = sentAt ? new Date(`${sentAt}T00:00:00Z`) : undefined;
  const text = cleanText(raw);
  const fromDelta = /delta\.com|Delta Air Lines/i.test(text);
  if (!fromDelta) return null;
  if (/Cancel Itinerary Confirmation/i.test(text)) return parseCancellation(text);
  if (/Date of Purchase:/.test(text) && /Flight Receipt for/.test(text)) return parseWebReceipt(text);
  if (/Ticket #:\s*\d{13}/.test(text) && /TICKET AMOUNT/.test(text)) return parseEmailReceipt(text);
  if (/Trip Confirmation #:/.test(text)) return parseEmailItinerary(text);
  return null;
}
