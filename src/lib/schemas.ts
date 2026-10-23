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
  flightNumber: z.string().trim().regex(/^\d{1,4}[A-Z]?$/, "expected a flight number like 1234"),
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
const optionalNumber = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().finite().optional());

export const ExpenseFields = z.object({
  tripId: z.string().uuid().optional(),
  category: z.enum(categoryKeys),
  merchant: optionalText,
  notes: optionalText,
  // Negative for refunds.
  amount: z.coerce.number().finite().refine((n) => n !== 0, "amount cannot be zero"),
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
