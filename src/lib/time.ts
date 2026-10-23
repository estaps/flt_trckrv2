// Date and time helpers for airline documents, which print local times without a year or zone.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function monthIndex(name: string): number {
  const i = MONTHS.indexOf(name.slice(0, 3).toUpperCase());
  if (i < 0) throw new Error(`unknown month: ${name}`);
  return i;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, monthIdx: number, day: number): string {
  return `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
}

// Picks the year for a day and month printed without one, given the date the document
// was sent: the first occurrence on or after a week before the reference date.
export function inferYear(monthIdx: number, day: number, reference: Date): number {
  const refYear = reference.getUTCFullYear();
  const cutoff = Date.UTC(refYear, reference.getUTCMonth(), reference.getUTCDate() - 7);
  return Date.UTC(refYear, monthIdx, day) >= cutoff ? refYear : refYear + 1;
}

// "06:52PM" -> "18:52"
export function to24h(time: string): string {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (!m) throw new Error(`unrecognized time: ${time}`);
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return `${pad(h)}:${m[2]}`;
}

// Offset in minutes of an IANA zone from UTC at the given instant.
function zoneOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60000;
}

// Converts a local wall-clock date and time ("2026-10-27", "18:52") in an IANA zone to UTC.
export function localToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - zoneOffsetMinutes(tz, new Date(guess)) * 60000;
  // A second pass settles instants near a daylight-saving change.
  return new Date(guess - zoneOffsetMinutes(tz, new Date(first)) * 60000);
}
