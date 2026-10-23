// Pure logic for price watches: which sidecar fares count for a watch, how they
// collapse into one price per check, and which alerts a new price raises.

// A fare as returned by flight-finder's GET /api/queries/:id/prices.
export interface Fare {
  id?: string;
  travelDate: string;
  price: number | string;
  currency: string;
  airline: string;
  flightNumber?: string | null;
  departureTime?: string | null;
  stops?: number | null;
  bookingUrl?: string | null;
  scrapedAt: string;
}

export interface WatchCriteria {
  departDate: string; // YYYY-MM-DD
  airline?: string | null;
  flightNumber?: string | null;
  departTime?: string | null; // HH:MM
  maxStops?: number | null;
  currency: string;
}

export type MatchedBy = "flight" | "airline" | "route";

export interface PriceCheck {
  observedAt: Date;
  price: number;
  currency: string;
  airline: string | null;
  flightNumber: string | null;
  departTime: string | null;
  stops: number | null;
  bookingUrl: string | null;
  matchedBy: MatchedBy;
  fareCount: number;
}

// Fares scraped within this window of each other belong to the same check.
const RUN_GAP_MS = 15 * 60 * 1000;

export function normalizeFlightNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.toUpperCase().replace(/\s+/g, "").match(/^([A-Z0-9]{2})0*(\d{1,4}[A-Z]?)$/);
  return m ? `${m[1]}${m[2]}` : null;
}

// "10:25 AM", "2:00 PM" or "09:00" to "HH:MM".
export function clock24(value: string | null | undefined): string | null {
  const m = value?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem) hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sameAirline(fare: string, wanted: string): boolean {
  return fare.toLowerCase().includes(wanted.trim().toLowerCase());
}

// Groups fares into checks by scrape time, oldest first.
export function groupIntoChecks(fares: Fare[]): Fare[][] {
  const sorted = [...fares].sort((a, b) => Date.parse(a.scrapedAt) - Date.parse(b.scrapedAt));
  const runs: Fare[][] = [];
  let runStart = -Infinity;
  for (const fare of sorted) {
    const t = Date.parse(fare.scrapedAt);
    if (t - runStart > RUN_GAP_MS) {
      runs.push([]);
      runStart = t;
    }
    runs[runs.length - 1].push(fare);
  }
  return runs;
}

// The cheapest fare in one check that fits the watch. A watched flight is found
// by flight number, then by departure time; when the check has neither for any
// fare, the airline's cheapest fare stands in and is labelled as such.
export function cheapestForWatch(run: Fare[], watch: WatchCriteria): PriceCheck | null {
  let fares = run.filter(
    (f) =>
      f.travelDate.slice(0, 10) === watch.departDate &&
      f.currency.toUpperCase() === watch.currency.toUpperCase() &&
      Number.isFinite(Number(f.price)) &&
      (watch.maxStops == null || f.stops == null || f.stops <= watch.maxStops),
  );
  let matchedBy: MatchedBy = "route";
  if (watch.airline) {
    fares = fares.filter((f) => sameAirline(f.airline, watch.airline!));
    matchedBy = "airline";
  }
  const wantedNumber = normalizeFlightNumber(watch.flightNumber);
  if (wantedNumber) {
    const numbered = fares.filter((f) => normalizeFlightNumber(f.flightNumber) !== null);
    const timed = fares.filter((f) => clock24(f.departureTime) !== null);
    if (numbered.length > 0) {
      fares = numbered.filter((f) => normalizeFlightNumber(f.flightNumber) === wantedNumber);
      matchedBy = "flight";
    } else if (watch.departTime && timed.length > 0) {
      fares = timed.filter((f) => clock24(f.departureTime) === watch.departTime);
      matchedBy = "flight";
    }
  }
  if (fares.length === 0) return null;
  const best = fares.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  return {
    observedAt: new Date(Math.max(...run.map((f) => Date.parse(f.scrapedAt)))),
    price: Number(best.price),
    currency: best.currency.toUpperCase(),
    airline: best.airline || null,
    flightNumber: normalizeFlightNumber(best.flightNumber),
    departTime: clock24(best.departureTime),
    stops: best.stops ?? null,
    bookingUrl: best.bookingUrl || null,
    matchedBy,
    fareCount: fares.length,
  };
}

export interface AlertRules {
  targetPrice?: number | null;
  dropAmount?: number | null;
  dropPercent?: number | null; // 0.1 = 10%
  paidPrice?: number | null;
}

export interface AlertDraft {
  kind: "drop" | "target" | "below_paid";
  price: number;
  previousPrice: number | null;
}

// Alerts for a new price. Target and paid-price alerts fire when the price
// crosses below the line, so a price that stays low does not repeat them.
// Drops are measured from `baseline`, the high since the last drop alert, so a
// slow slide of small steps still adds up to an alert.
export function evaluateAlerts(
  price: number,
  previous: number | null,
  baseline: number | null,
  rules: AlertRules,
): { alerts: AlertDraft[]; baseline: number } {
  const alerts: AlertDraft[] = [];
  if (rules.paidPrice != null && price < rules.paidPrice && (previous === null || previous >= rules.paidPrice)) {
    alerts.push({ kind: "below_paid", price, previousPrice: previous });
  }
  if (rules.targetPrice != null && price <= rules.targetPrice && (previous === null || previous > rules.targetPrice)) {
    alerts.push({ kind: "target", price, previousPrice: previous });
  }
  if (baseline === null || price >= baseline) return { alerts, baseline: price };
  const drop = baseline - price;
  const byAmount = rules.dropAmount != null && rules.dropAmount > 0 && drop >= rules.dropAmount;
  const byPercent = rules.dropPercent != null && rules.dropPercent > 0 && drop / baseline >= rules.dropPercent;
  if (!byAmount && !byPercent) return { alerts, baseline };
  alerts.push({ kind: "drop", price, previousPrice: baseline });
  return { alerts, baseline: price };
}
