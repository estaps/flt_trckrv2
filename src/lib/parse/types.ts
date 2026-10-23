import { z } from "zod";

// The common shape every parser (template, LLM) produces for one document.
// Airport fields hold what the document printed; resolve.ts turns them into codes and UTC times.

export const ParsedFlight = z.object({
  carrier: z.string(),
  flightNumber: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // local departure date
  depLabel: z.string(),
  arrLabel: z.string(),
  depTimeLocal: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  arrTimeLocal: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  cabin: z.string().optional(),
  fareClass: z.string().optional(),
  seat: z.string().optional(),
});
export type ParsedFlight = z.infer<typeof ParsedFlight>;

export const ParsedECredit = z.object({
  number: z.string(),
  amount: z.number().optional(),
  currency: z.string().length(3).optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceTicketNumber: z.string().optional(),
});
export type ParsedECredit = z.infer<typeof ParsedECredit>;

export const ParsedDocument = z.object({
  kind: z.enum(["itinerary", "ticket_receipt", "cancellation", "unknown"]),
  template: z.string(), // which parser produced it, e.g. "delta_email_receipt" or "llm"
  airline: z.string().optional(),
  sentAt: z.string().optional(),
  confirmationCode: z.string().optional(),
  ticketNumber: z.string().optional(),
  passengerName: z.string().optional(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bookingStatus: z.enum(["held", "ticketed", "cancelled"]).optional(),
  flights: z.array(ParsedFlight).default([]),
  charges: z
    .object({
      baseFare: z.number().optional(),
      taxes: z.number().optional(),
      total: z.number(),
      currency: z.string().length(3),
    })
    .optional(),
  paymentCard: z.string().optional(),
  ecreditsApplied: z.array(ParsedECredit).default([]),
  ecreditsIssued: z.array(ParsedECredit).default([]),
  cancelledTicketNumbers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type ParsedDocument = z.infer<typeof ParsedDocument>;
