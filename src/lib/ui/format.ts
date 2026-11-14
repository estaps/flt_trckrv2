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
