import { z } from "zod";

const isoDate = z.coerce.date();
const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "expected a 3-letter IATA code");

export const TripInput = z.object({
  name: z.string().trim().min(1),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  notes: z.string().optional(),
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM");

export const FlightFields = z.object({
  tripId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  carrier: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,3}$/, "expected an airline code like DL"),
  // Leading zeros dropped so "0567" and "567" are the same flight.
  flightNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{1,4}[A-Z]?$/, "expected a flight number like 1234")
    .transform((n) => n.replace(/^0+(?=\d)/, "")),
  depAirport: iata,
  arrAirport: iata,
  depDate: isoDate.optional(), // local departure date
  depTimeLocal: hhmm.optional(),
  arrTimeLocal: hhmm.optional(),
  depTimeUtc: isoDate.optional(),
  arrTimeUtc: isoDate.optional(),
  seat: z.string().optional(),
  cabin: z.string().optional(),
  fareClass: z.string().max(2).optional(),
  status: z.enum(["scheduled", "changed", "cancelled", "flown"]).optional(),
});

// Creating a flight needs its departure date, given directly or taken from the UTC departure time.
export const FlightInput = FlightFields.refine((f) => f.depDate || f.depTimeUtc, {
  message: "depDate or depTimeUtc is required",
  path: ["depDate"],
}).transform((f) => ({ ...f, depDate: f.depDate ?? new Date(f.depTimeUtc!.toISOString().slice(0, 10)) }));

export const FlightPatch = FlightFields.partial();

// Expense categories, in the order the form lists them.
export const EXPENSE_CATEGORIES = {
  airfare: "Airfare",
  lodging: "Lodging",
  ground: "Taxi, rideshare and transit",
  car_rental: "Car rental",
  meals: "Meals",
  baggage: "Bags and seats",
  parking: "Parking",
  fuel: "Fuel",
  connectivity: "Wi-Fi and phone",
  fees: "Visas and fees",
  other: "Other",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
const categoryKeys = Object.keys(EXPENSE_CATEGORIES) as [ExpenseCategory, ...ExpenseCategory[]];

const optionalText = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().optional());
// Accepts amounts as people type them: "23,50" and "1.234,56" (decimal comma), "1,234.56", "$12".
export function normalizeAmount(v: unknown): unknown {
  if (typeof v !== "string") return v;
  let s = v.trim().replace(/[\s\u00a0$€£¥]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  return s;
}
const amountNumber = z.preprocess(normalizeAmount, z.coerce.number({ invalid_type_error: "enter an amount like 23.50" }).finite());
const optionalNumber = z.preprocess((v) => (v === "" || v === null ? undefined : normalizeAmount(v)), z.coerce.number({ invalid_type_error: "enter an amount like 23.50" }).finite().optional());

export const ExpenseFields = z.object({
  tripId: z.string().uuid().optional(),
  category: z.enum(categoryKeys),
  merchant: optionalText,
  notes: optionalText,
  // Negative for refunds.
  amount: amountNumber.refine((n) => n !== 0, "amount cannot be zero"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "expected a currency code like USD or EUR"),
  spentOn: isoDate,
  // What the card was actually charged in the home currency; overrides the looked-up rate.
  amountHome: optionalNumber,
  documentId: z.string().uuid().optional(),
});
export const ExpenseInput = ExpenseFields;
export const ExpensePatch = ExpenseFields.partial().extend({
  tripId: z.string().uuid().nullable().optional(),
  merchant: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;
export type ExpensePatch = z.infer<typeof ExpensePatch>;

export const PHOTO_KINDS = { ticket: "Ticket", boarding_pass: "Boarding pass", receipt: "Receipt", other: "Other" } as const;
export const PhotoPatch = z.object({
  kind: z.enum(["ticket", "boarding_pass", "receipt", "other"]).optional(),
  caption: optionalText,
  flightId: z.string().uuid().nullable().optional(),
});
