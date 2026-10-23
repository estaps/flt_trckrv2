// Keeps price watches in step with the flight-finder sidecar: creates a tracker
// for each new watch, reads back fares, records one price per check and raises alerts.
import type { PriceWatch } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { money, ymd } from "@/lib/ui/format";
import { FlightFinderClient, FlightFinderError } from "./flight-finder";
import { cheapestForWatch, evaluateAlerts, groupIntoChecks, type AlertDraft } from "./match";
import { sendNotice } from "./notify";

export function flightFinderClient(): FlightFinderClient | null {
  const { FLIGHT_FINDER_URL, FLIGHT_FINDER_TOKEN } = getConfig();
  return FLIGHT_FINDER_URL ? new FlightFinderClient(FLIGHT_FINDER_URL, FLIGHT_FINDER_TOKEN) : null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function watchTitle(w: Pick<PriceWatch, "label" | "origin" | "destination" | "departDate" | "returnDate" | "flightNumber">): string {
  if (w.label) return w.label;
  const route = `${w.origin} to ${w.destination}${w.returnDate ? " round trip" : ""}`;
  return `${w.flightNumber ? `${w.flightNumber} ` : ""}${route}, ${ymd(w.departDate)}`;
}

export function alertMessage(w: PriceWatch, a: AlertDraft): string {
  const at = (n: number) => money(n, w.currency);
  const title = watchTitle(w);
  switch (a.kind) {
    case "drop":
      return `${title}: ${at(a.price)}, down ${at(a.previousPrice! - a.price)} from ${at(a.previousPrice!)}.`;
    case "target":
      return `${title}: ${at(a.price)}, at or below your ${at(num(w.targetPrice)!)} target.`;
    case "below_paid": {
      const paid = num(w.paidPrice)!;
      const credit = /delta/i.test(w.airline ?? "")
        ? " Changing to the same flight on delta.com may return the difference as an eCredit (not on Basic Economy)."
        : " Check whether the airline will return the difference as a credit.";
      return `${title}: ${at(a.price)}, ${at(paid - a.price)} below the ${at(paid)} you paid.${credit}`;
    }
  }
}

const ALERT_TITLES = { drop: "Price drop", target: "Target price reached", below_paid: "Below what you paid" } as const;

function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface SyncResult {
  watchId: string;
  status: PriceWatch["status"];
  newPoints: number;
  alerts: number;
  error?: string;
}

const inFlight = new Map<string, Promise<SyncResult>>();

// One sync per watch at a time, so a watch never gets two sidecar trackers.
export function syncWatch(watchId: string, client: FlightFinderClient, now = new Date()): Promise<SyncResult> {
  let pending = inFlight.get(watchId);
  if (!pending) {
    pending = syncWatchOnce(watchId, client, now).finally(() => inFlight.delete(watchId));
    inFlight.set(watchId, pending);
  }
  return pending;
}

async function syncWatchOnce(watchId: string, client: FlightFinderClient, now: Date): Promise<SyncResult> {
  let watch = await prisma.priceWatch.findUniqueOrThrow({ where: { id: watchId } });
  const result: SyncResult = { watchId, status: watch.status, newPoints: 0, alerts: 0 };
  if (watch.status === "paused" || watch.status === "expired") return result;

  // Departed: stop tracking and free the sidecar tracker.
  if (watch.departDate < utcToday(now)) {
    if (watch.remoteQueryId && watch.remoteToken) {
      await client.deleteTracker(watch.remoteQueryId, watch.remoteToken).catch(() => undefined);
    }
    await prisma.priceWatch.update({ where: { id: watchId }, data: { status: "expired", remoteQueryId: null, remoteToken: null } });
    return { ...result, status: "expired" };
  }

  try {
    if (!watch.remoteQueryId) {
      const tracker = await client.createTracker({
        origin: watch.origin,
        destination: watch.destination,
        departDate: ymd(watch.departDate),
        returnDate: watch.returnDate ? ymd(watch.returnDate) : null,
        cabin: watch.cabin,
        currency: watch.currency,
        airline: watch.airline,
        maxStops: watch.maxStops,
        label: watchTitle(watch),
      });
      watch = await prisma.priceWatch.update({
        where: { id: watchId },
        data: { remoteQueryId: tracker.id, remoteToken: tracker.deleteToken, syncedThrough: null },
      });
    }

    const { fares } = await client.fares(watch.remoteQueryId!);
    const since = watch.syncedThrough?.getTime() ?? -Infinity;
    const fresh = fares.filter((f) => Date.parse(f.scrapedAt) > since);
    const last = await prisma.pricePoint.findFirst({ where: { watchId }, orderBy: { observedAt: "desc" } });
    let previous = num(last?.price);
    let baseline = num(watch.dropBaseline);
    const rules = {
      targetPrice: num(watch.targetPrice),
      dropAmount: num(watch.dropAmount),
      dropPercent: watch.dropPercent,
      paidPrice: num(watch.paidPrice),
    };
    const criteria = {
      departDate: ymd(watch.departDate),
      airline: watch.airline,
      flightNumber: watch.flightNumber,
      departTime: watch.departTime,
      maxStops: watch.maxStops,
      currency: watch.currency,
    };

    for (const run of groupIntoChecks(fresh)) {
      const check = cheapestForWatch(run, criteria);
      if (!check) continue;
      const exists = await prisma.pricePoint.findUnique({
        where: { watchId_observedAt: { watchId, observedAt: check.observedAt } },
      });
      if (exists) continue;
      await prisma.pricePoint.create({ data: { watchId, ...check } });
      result.newPoints++;
      const evaluated = evaluateAlerts(check.price, previous, baseline, rules);
      baseline = evaluated.baseline;
      previous = check.price;
      for (const draft of evaluated.alerts) {
        const message = alertMessage(watch, draft);
        const alert = await prisma.priceAlert.create({
          data: { watchId, kind: draft.kind, price: draft.price, previousPrice: draft.previousPrice, currency: watch.currency, message },
        });
        result.alerts++;
        const sent = await sendNotice({
          title: ALERT_TITLES[draft.kind],
          message,
          kind: draft.kind,
          watchId,
          price: draft.price,
          previousPrice: draft.previousPrice,
          currency: watch.currency,
        });
        if (sent) await prisma.priceAlert.update({ where: { id: alert.id }, data: { notifiedAt: new Date() } });
      }
    }

    const newest = fresh.reduce((m, f) => Math.max(m, Date.parse(f.scrapedAt)), since);
    await prisma.priceWatch.update({
      where: { id: watchId },
      data: {
        status: "active",
        lastError: null,
        lastCheckedAt: now,
        dropBaseline: baseline,
        ...(Number.isFinite(newest) ? { syncedThrough: new Date(newest) } : {}),
      },
    });
    return { ...result, status: "active" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof FlightFinderError && err.status === 410) {
      await prisma.priceWatch.update({ where: { id: watchId }, data: { status: "expired", lastCheckedAt: now } });
      return { ...result, status: "expired" };
    }
    // The sidecar lost the tracker (for example a fresh sidecar database): make a new one next time.
    const lost = err instanceof FlightFinderError && err.status === 404;
    await prisma.priceWatch.update({
      where: { id: watchId },
      data: {
        status: "error",
        lastError: message,
        lastCheckedAt: now,
        ...(lost ? { remoteQueryId: null, remoteToken: null } : {}),
      },
    });
    return { ...result, status: "error", error: message };
  }
}

let running: Promise<SyncResult[]> | null = null;

// Syncs every active or failing watch, one at a time. Overlapping calls share one run.
export function syncAllWatches(): Promise<SyncResult[]> {
  const client = flightFinderClient();
  if (!client) return Promise.resolve([]);
  running ??= (async () => {
    try {
      const watches = await prisma.priceWatch.findMany({
        where: { status: { in: ["active", "error"] } },
        select: { id: true },
        orderBy: { departDate: "asc" },
      });
      const results: SyncResult[] = [];
      for (const w of watches) results.push(await syncWatch(w.id, client));
      return results;
    } finally {
      running = null;
    }
  })();
  return running;
}
