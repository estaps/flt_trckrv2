import { Prisma } from "@prisma/client";
import { getConfig } from "../config";
import { prisma } from "../db";
import type { ResolvedDocument } from "../parse/resolve";

const AIRLINES: Record<string, string> = { DL: "Delta Air Lines" };

export type TripChoice = { tripId: string } | { newTripName: string } | null;

export class ConfirmError extends Error {}

export async function latestResolved(documentId: string): Promise<ResolvedDocument | null> {
  const ex = await prisma.extraction.findFirst({ where: { documentId }, orderBy: { createdAt: "desc" } });
  const raw = ex?.rawJson as unknown as ResolvedDocument | { error: string } | undefined;
  return raw && "parsed" in raw ? raw : null;
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

// Fields whose change on an existing flight is recorded in flight_changes.
const TRACKED = ["depAirport", "arrAirport", "depTimeLocal", "arrTimeLocal", "seat"] as const;
const SCHEDULE: string[] = ["depAirport", "arrAirport", "depTimeLocal", "arrTimeLocal"];

// Writes a reviewed document into bookings, flights, expenses and eCredits.
export async function confirmDocument(documentId: string, trip: TripChoice): Promise<void> {
  const resolved = await latestResolved(documentId);
  if (!resolved) throw new ConfirmError("this document has no parsed result to confirm");
  const { parsed, flights } = resolved;
  const missing = flights.filter((f) => !f.depAirport || !f.arrAirport);
  if (missing.length) {
    throw new ConfirmError(`airports unknown for ${missing.map((f) => `${f.carrier} ${f.flightNumber}`).join(", ")}`);
  }

  await prisma.$transaction(async (tx) => {
    // Trip: attach to an existing one, or create one spanning the flights.
    let tripId: string | undefined;
    const dates = flights.map((f) => f.depDate).sort();
    if (trip && "newTripName" in trip) {
      const created = await tx.trip.create({
        data: {
          name: trip.newTripName,
          startDate: dates.length ? day(dates[0]) : undefined,
          endDate: dates.length ? day(dates[dates.length - 1]) : undefined,
        },
      });
      tripId = created.id;
    } else if (trip && "tripId" in trip) {
      const existing = await tx.trip.findUniqueOrThrow({ where: { id: trip.tripId } });
      tripId = existing.id;
      if (dates.length) {
        const start = existing.startDate && existing.startDate < day(dates[0]) ? existing.startDate : day(dates[0]);
        const lastDay = day(dates[dates.length - 1]);
        const end = existing.endDate && existing.endDate > lastDay ? existing.endDate : lastDay;
        await tx.trip.update({ where: { id: tripId }, data: { startDate: start, endDate: end } });
      }
    }

    // Cancellation: the tickets are void and their value becomes eCredits.
    for (const ticket of parsed.cancelledTicketNumbers) {
      const booking = await tx.booking.findUnique({ where: { ticketNumber: ticket } });
      if (booking) {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled" } });
        await tx.flight.updateMany({ where: { bookingId: booking.id }, data: { status: "cancelled" } });
      }
    }

    let bookingId: string | undefined;
    if (parsed.confirmationCode) {
      const existing = await tx.booking.findUnique({ where: { confirmationCode: parsed.confirmationCode } });
      // A hold never downgrades a booking that is already ticketed.
      const status = existing?.status === "ticketed" && parsed.bookingStatus === "held" ? "ticketed" : parsed.bookingStatus;
      const data = {
        tripId,
        ticketNumber: parsed.ticketNumber,
        status,
        airlineOrAgency: parsed.airline ? (AIRLINES[parsed.airline] ?? parsed.airline) : undefined,
        passengerName: parsed.passengerName,
        bookedAt: parsed.issuedOn ? day(parsed.issuedOn) : undefined,
        totalAmount: parsed.charges ? new Prisma.Decimal(parsed.charges.total) : undefined,
        currency: parsed.charges?.currency,
        documentId,
      };
      const booking = existing
        ? await tx.booking.update({ where: { id: existing.id }, data })
        : await tx.booking.create({ data: { confirmationCode: parsed.confirmationCode, ...data } });
      bookingId = booking.id;
    }

    for (const f of flights) {
      const key = { carrier: f.carrier, flightNumber: f.flightNumber, depDate: day(f.depDate) };
      const data = {
        depAirport: f.depAirport!,
        arrAirport: f.arrAirport!,
        depTimeLocal: f.depTimeLocal,
        arrTimeLocal: f.arrTimeLocal,
        depTimeUtc: f.depTimeUtc ? new Date(f.depTimeUtc) : undefined,
        arrTimeUtc: f.arrTimeUtc ? new Date(f.arrTimeUtc) : undefined,
        cabin: f.cabin,
        fareClass: f.fareClass,
        seat: f.seat,
        bookingId,
        tripId,
      };
      const existing = await tx.flight.findUnique({ where: { carrier_flightNumber_depDate: key } });
      if (!existing) {
        await tx.flight.create({ data: { ...key, ...data } });
        continue;
      }
      // Only fields the document states can change an existing flight.
      const changes = TRACKED.filter((k) => f[k] !== undefined && f[k] !== existing[k]);
      for (const field of changes) {
        await tx.flightChange.create({
          data: { flightId: existing.id, documentId, field, oldValue: existing[field] ?? null, newValue: String(f[field]) },
        });
      }
      const rescheduled = changes.some((c) => SCHEDULE.includes(c));
      await tx.flight.update({
        where: { id: existing.id },
        data: {
          ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
          status: parsed.bookingStatus === "cancelled" ? "cancelled" : rescheduled ? "changed" : existing.status,
        },
      });
    }

    if (parsed.charges && bookingId) {
      const home = getConfig().HOME_CURRENCY;
      const amount = new Prisma.Decimal(parsed.charges.total);
      const spentOn = day(parsed.issuedOn ?? parsed.sentAt ?? new Date().toISOString().slice(0, 10));
      const data = {
        tripId,
        merchant: parsed.airline ? (AIRLINES[parsed.airline] ?? parsed.airline) : undefined,
        amount,
        currency: parsed.charges.currency,
        amountHome: parsed.charges.currency === home ? amount : null,
        spentOn,
        documentId,
      };
      await tx.expense.upsert({
        where: { bookingId_category: { bookingId, category: "airfare" } },
        create: { bookingId, category: "airfare", ...data },
        update: data,
      });
    }

    for (const c of parsed.ecreditsApplied) {
      await tx.eCredit.upsert({
        where: { number: c.number },
        create: { number: c.number, airline: parsed.airline, status: "used", documentId },
        update: { status: "used" },
      });
    }
    for (const c of parsed.ecreditsIssued) {
      const data = {
        airline: parsed.airline,
        amount: c.amount !== undefined ? new Prisma.Decimal(c.amount) : undefined,
        currency: c.currency,
        expiresOn: c.expiresOn ? day(c.expiresOn) : undefined,
        sourceTicketNumber: c.sourceTicketNumber,
        documentId,
      };
      const existing = await tx.eCredit.findUnique({ where: { number: c.number } });
      if (!existing) await tx.eCredit.create({ data: { number: c.number, ...data } });
      // Keep known values when a later document leaves them out; never revive a used credit.
      else
        await tx.eCredit.update({
          where: { id: existing.id },
          data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
        });
    }

    await tx.document.update({ where: { id: documentId }, data: { status: "confirmed" } });
  });
}
