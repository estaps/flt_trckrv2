// Display helpers shared by pages.

export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export function money(amount: unknown, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  const n = Number(amount);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

export const KIND_LABELS: Record<string, string> = {
  itinerary: "Itinerary (not yet ticketed)",
  ticket_receipt: "Ticket receipt",
  cancellation: "Cancellation",
  expense_receipt: "Receipt",
  unknown: "Unrecognized",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Fri 19 Dec" (dates are stored as UTC midnight). */
export const dayLabel = (d: Date | null | undefined, withYear = false) =>
  d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}` : "";

/** "19 Dec" */
export const shortDay = (d: Date | null | undefined) => (d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "");

/** "Fri 19 Dec → Tue 23 Dec 2026 · 5 days" */
export function tripDates(start: Date | null | undefined, end: Date | null | undefined, withLength = true): string {
  if (!start) return "No dates yet";
  if (!end || end.getTime() === start.getTime()) return dayLabel(start, true);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${dayLabel(start, !sameYear)} → ${dayLabel(end, true)}${withLength ? ` · ${days} days` : ""}`;
}

/** Colour for a status pill. */
export function statusTone(status: string): "good" | "warn" | "bad" | "dim" | "" {
  switch (status) {
    case "confirmed":
    case "imported":
    case "active":
      return "good";
    case "needs_review":
    case "paused":
    case "changed":
    case "held":
      return "warn";
    case "failed":
    case "cancelled":
    case "error":
      return "bad";
    case "ignored":
    case "expired":
    case "flown":
    case "used":
      return "dim";
    default:
      return "";
  }
}

export const statusLabel = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
