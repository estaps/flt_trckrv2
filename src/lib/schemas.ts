import { z } from "zod";

const isoDate = z.coerce.date();
const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "expected a 3-letter IATA code");

export const TripInput = z.object({
  name: z.string().trim().min(1),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  notes: z.string().optional(),
});

export const FlightInput = z.object({
  tripId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  carrier: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,3}$/, "expected an airline code like DL"),
  flightNumber: z.string().trim().regex(/^\d{1,4}[A-Z]?$/, "expected a flight number like 1234"),
  depAirport: iata,
  arrAirport: iata,
  depTimeUtc: isoDate,
  arrTimeUtc: isoDate.optional(),
  seat: z.string().optional(),
  cabin: z.string().optional(),
  status: z.enum(["scheduled", "changed", "cancelled", "flown"]).optional(),
});
