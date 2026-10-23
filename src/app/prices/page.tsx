import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { money, ymd } from "@/lib/ui/format";
import { WatchInput, createWatch } from "@/lib/prices/watches";
import { syncAllWatches, watchTitle } from "@/lib/prices/sync";
import { Sparkline } from "./chart";

export const dynamic = "force-dynamic";

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : undefined;
};
const percent = (v: string | undefined) => (v ? Number(v) / 100 : undefined);

async function addRouteWatch(formData: FormData) {
  "use server";
  const watch = await createWatch(
    WatchInput.parse({
      origin: field(formData, "origin"),
      destination: field(formData, "destination"),
      departDate: field(formData, "departDate"),
      returnDate: field(formData, "returnDate"),
      airline: field(formData, "airline"),
      cabin: field(formData, "cabin"),
      maxStops: field(formData, "maxStops"),
      targetPrice: field(formData, "targetPrice"),
      dropAmount: field(formData, "dropAmount"),
      dropPercent: percent(field(formData, "dropPercent")),
    }),
  );
  redirect(`/prices/${watch.id}`);
}

async function addFlightWatch(formData: FormData) {
  "use server";
  const watch = await createWatch(
    WatchInput.parse({
      flightId: field(formData, "flightId"),
      paidPrice: field(formData, "paidPrice"),
      dropAmount: field(formData, "dropAmount"),
    }),
  );
  redirect(`/prices/${watch.id}`);
}

async function checkNow() {
  "use server";
  await syncAllWatches();
  revalidatePath("/prices");
}

async function markAlertsRead() {
  "use server";
  await prisma.priceAlert.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/prices");
}

const MATCH_NOTE: Record<string, string> = {
  airline: "cheapest on this airline; the flight itself was not listed",
  route: "cheapest on any airline",
};

export default async function PricesPage() {
  const config = getConfig();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const [watches, alerts, flights] = await Promise.all([
    prisma.priceWatch.findMany({
      orderBy: [{ status: "asc" }, { departDate: "asc" }],
      include: { points: { orderBy: { observedAt: "asc" }, select: { observedAt: true, price: true, matchedBy: true } } },
    }),
    prisma.priceAlert.findMany({
      where: { readAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.flight.findMany({
      where: { depDate: { gte: today }, status: { not: "cancelled" }, watches: { none: {} } },
      orderBy: { depDate: "asc" },
      take: 50,
    }),
  ]);

  return (
    <>
      {!config.FLIGHT_FINDER_URL ? (
        <section className="card warn">
          Price checks are off because <code>FLIGHT_FINDER_URL</code> is not set. Watches can be added and will be
          checked once the flight-finder sidecar is configured.
        </section>
      ) : null}

      {alerts.length > 0 ? (
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>New price alerts</h3>
            <form action={markAlertsRead}><button className="secondary" type="submit">Mark all read</button></form>
          </div>
          <ul>
            {alerts.map((a) => (
              <li key={a.id}>
                <a href={`/prices/${a.watchId}`}>{a.message}</a>{" "}
                <span className="muted">{a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Price watches</h2>
          {config.FLIGHT_FINDER_URL ? (
            <form action={checkNow}><button className="secondary" type="submit">Check now</button></form>
          ) : null}
        </div>
        {watches.length === 0 ? (
          <p className="muted">Nothing watched yet. Add a booked flight or a route below.</p>
        ) : (
          <table>
            <thead><tr><th>Watch</th><th>Latest</th><th>Lowest</th><th>Paid</th><th>Trend</th><th>Status</th></tr></thead>
            <tbody>
              {watches.map((w) => {
                const prices = w.points.map((p) => Number(p.price));
                const latest = w.points[w.points.length - 1];
                return (
                  <tr key={w.id}>
                    <td><a href={`/prices/${w.id}`}>{watchTitle(w)}</a></td>
                    <td>
                      {latest ? money(latest.price, w.currency) : <span className="muted">none yet</span>}
                      {latest && w.flightNumber && MATCH_NOTE[latest.matchedBy] ? (
                        <span className="muted" title={MATCH_NOTE[latest.matchedBy]}> *</span>
                      ) : null}
                    </td>
                    <td>{prices.length ? money(Math.min(...prices), w.currency) : ""}</td>
                    <td>{w.paidPrice !== null ? money(w.paidPrice, w.currency) : ""}</td>
                    <td><Sparkline points={w.points.map((p) => ({ t: p.observedAt, price: Number(p.price) }))} /></td>
                    <td>
                      <span className="tag">{w.status}</span>
                      {w.lastError ? <div className="error" style={{ fontSize: 12 }}>{w.lastError}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {watches.some((w) => w.flightNumber && MATCH_NOTE[w.points[w.points.length - 1]?.matchedBy]) ? (
          <p className="muted" style={{ fontSize: 12 }}>
            * The fare site did not list the watched flight, so this is the airline&apos;s cheapest fare that day.
          </p>
        ) : null}
      </section>

      <section className="card">
        <h3>Watch a booked flight</h3>
        {flights.length === 0 ? (
          <p className="muted">No upcoming flights that are not already watched.</p>
        ) : (
          <form action={addFlightWatch} className="inline">
            <label>Flight
              <select name="flightId" required>
                {flights.map((f) => (
                  <option key={f.id} value={f.id}>
                    {ymd(f.depDate)} {f.carrier}{f.flightNumber} {f.depAirport} to {f.arrAirport}
                  </option>
                ))}
              </select>
            </label>
            <label>Paid ({config.HOME_CURRENCY})<input name="paidPrice" type="number" step="0.01" min="0" size={7} placeholder="from booking" /></label>
            <label>Alert on drop of<input name="dropAmount" type="number" step="1" min="0" defaultValue="25" size={5} /></label>
            <button type="submit">Watch</button>
          </form>
        )}
      </section>

      <section className="card">
        <h3>Watch a route</h3>
        <form action={addRouteWatch} className="inline">
          <label>From<input name="origin" size={4} required /></label>
          <label>To<input name="destination" size={4} required /></label>
          <label>Depart<input name="departDate" type="date" required /></label>
          <label>Return (optional)<input name="returnDate" type="date" /></label>
          <label>Airline<input name="airline" defaultValue="Delta" size={10} placeholder="any" /></label>
          <label>Cabin
            <select name="cabin" defaultValue="economy">
              <option value="economy">Economy</option>
              <option value="premium_economy">Premium economy</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </select>
          </label>
          <label>Max stops
            <select name="maxStops" defaultValue="">
              <option value="">Any</option>
              <option value="0">Nonstop</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label>Target price<input name="targetPrice" type="number" step="1" min="0" size={6} /></label>
          <label>Drop of<input name="dropAmount" type="number" step="1" min="0" defaultValue="25" size={5} /></label>
          <label>or drop %<input name="dropPercent" type="number" step="1" min="1" max="99" size={4} /></label>
          <button type="submit">Watch</button>
        </form>
      </section>
    </>
  );
}
