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
