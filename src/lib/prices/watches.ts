import { z } from "zod";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { airlineName } from "./airlines";
import { flightFinderClient, syncWatch } from "./sync";

const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "expected a 3-letter IATA code");
const amount = z.coerce.number().nonnegative();
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

const RuleFields = {
  label: optional(z.string().trim().max(120)),
  paidPrice: optional(amount),
  targetPrice: optional(amount),
  dropAmount: optional(amount),
  // Fraction: 0.1 means 10%.
  dropPercent: optional(z.coerce.number().gt(0).lt(1)),
};

export const WatchInput = z
  .object({
    flightId: optional(z.string().uuid()),
    origin: optional(iata),
    destination: optional(iata),
    departDate: optional(z.coerce.date()),
    returnDate: optional(z.coerce.date()),
    cabin: optional(z.enum(["economy", "premium_economy", "business", "first"])),
    airline: optional(z.string().trim().max(100)),
    flightNumber: optional(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/, "expected a flight like DL1234")),
    departTime: optional(z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM")),
    maxStops: optional(z.coerce.number().int().min(0).max(3)),
    currency: optional(z.string().trim().toUpperCase().length(3)),
    ...RuleFields,
  })
  .refine((w) => w.flightId || (w.origin && w.destination && w.departDate), {
    message: "give a flightId, or origin, destination and departDate",
    path: ["origin"],
  })
  .refine((w) => !w.returnDate || !w.departDate || w.returnDate > w.departDate, {
    message: "returnDate must be after departDate",
    path: ["returnDate"],
  });

// In a patch, an empty value clears the field.
const clearable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());

export const WatchPatch = z.object({
  label: clearable(z.string().trim().max(120)),
  paidPrice: clearable(amount),
  targetPrice: clearable(amount),
  dropAmount: clearable(amount),
  dropPercent: clearable(z.coerce.number().gt(0).lt(1)),
  status: optional(z.enum(["active", "paused"])),
});

export async function createWatch(input: z.infer<typeof WatchInput>) {
  const { flightId, ...fields } = input;
  const data = { ...fields, currency: fields.currency ?? getConfig().HOME_CURRENCY };

  if (flightId) {
    const flight = await prisma.flight.findUniqueOrThrow({
      where: { id: flightId },
      include: { booking: { include: { _count: { select: { flights: true } } } } },
    });
    data.origin ??= flight.depAirport;
    data.destination ??= flight.arrAirport;
    data.departDate ??= flight.depDate;
    data.airline ??= airlineName(flight.carrier) ?? flight.carrier;
    data.flightNumber ??= `${flight.carrier}${flight.flightNumber}`;
    data.departTime ??= flight.depTimeLocal ?? undefined;
    // A one-flight booking's total is what was paid for this flight.
    const b = flight.booking;
    if (data.paidPrice === undefined && b?.totalAmount && b._count.flights === 1 && b.currency === data.currency) {
      data.paidPrice = Number(b.totalAmount);
    }
  }

  const watch = await prisma.priceWatch.create({
    data: {
      ...data,
      flightNumber: data.flightNumber?.replace(/\s+/g, ""),
      origin: data.origin!,
      destination: data.destination!,
      departDate: data.departDate!,
      flightId: flightId ?? null,
    },
  });

  // Create the sidecar tracker straight away so the first scrape starts now.
  const client = flightFinderClient();
  if (client) void syncWatch(watch.id, client).catch((err) => console.error("[prices] first sync failed:", err));
  return watch;
}

export async function updateWatch(id: string, patch: z.infer<typeof WatchPatch>) {
  const rulesChanged = (["paidPrice", "targetPrice", "dropAmount", "dropPercent"] as const).some((k) => patch[k] !== undefined);
  return prisma.priceWatch.update({
    where: { id },
    data: {
      ...patch,
      // New rules measure drops from the next price seen.
      ...(rulesChanged ? { dropBaseline: null } : {}),
    },
  });
}

export async function deleteWatch(id: string) {
  const watch = await prisma.priceWatch.delete({ where: { id } });
  const client = flightFinderClient();
  if (client && watch.remoteQueryId && watch.remoteToken) {
    await client.deleteTracker(watch.remoteQueryId, watch.remoteToken).catch(() => undefined);
  }
  return watch;
}
