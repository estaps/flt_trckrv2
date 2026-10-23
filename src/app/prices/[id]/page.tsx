import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { money, ymd } from "@/lib/ui/format";
import { WatchPatch, deleteWatch, updateWatch } from "@/lib/prices/watches";
import { flightFinderClient, syncWatch, watchTitle } from "@/lib/prices/sync";
import { PriceChart } from "../chart";

export const dynamic = "force-dynamic";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

async function saveRules(formData: FormData) {
  "use server";
  const id = text(formData, "id");
  const pct = text(formData, "dropPercent");
  await updateWatch(
    id,
    WatchPatch.parse({
      label: text(formData, "label"),
      paidPrice: text(formData, "paidPrice"),
      targetPrice: text(formData, "targetPrice"),
      dropAmount: text(formData, "dropAmount"),
      dropPercent: pct ? Number(pct) / 100 : "",
    }),
  );
  revalidatePath(`/prices/${id}`);
}

async function setStatus(formData: FormData) {
  "use server";
  const id = text(formData, "id");
  await updateWatch(id, WatchPatch.parse({ status: text(formData, "status") }));
  revalidatePath(`/prices/${id}`);
}

async function checkNow(formData: FormData) {
  "use server";
  const id = text(formData, "id");
  const client = flightFinderClient();
  if (client) await syncWatch(id, client);
  revalidatePath(`/prices/${id}`);
}

async function remove(formData: FormData) {
  "use server";
  await deleteWatch(text(formData, "id"));
  redirect("/prices");
}

const MATCHED: Record<string, string> = {
  flight: "this flight",
  airline: "airline's cheapest",
  route: "cheapest",
};

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const watch = await prisma.priceWatch
    .findUnique({
      where: { id },
      include: {
        points: { orderBy: { observedAt: "asc" } },
        alerts: { orderBy: { createdAt: "desc" }, take: 50 },
        flight: { select: { tripId: true } },
      },
    })
    .catch(() => null);
  if (!watch) notFound();
  if (watch.alerts.some((a) => !a.readAt)) {
    await prisma.priceAlert.updateMany({ where: { watchId: id, readAt: null }, data: { readAt: new Date() } });
  }

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const prices = watch.points.map((p) => Number(p.price));
  const latest = watch.points[watch.points.length - 1];
  const paid = num(watch.paidPrice);
  const live = watch.status === "active" || watch.status === "error";

  return (
    <>
      <p><a href="/prices">All price watches</a></p>
      <section className="card">
        <h2>{watchTitle(watch)}</h2>
        <p className="muted">
          {watch.origin} to {watch.destination} · {ymd(watch.departDate)}
          {watch.returnDate ? ` returning ${ymd(watch.returnDate)} (round-trip fares)` : " (one way)"}
          {watch.airline ? ` · ${watch.airline}` : " · any airline"}
          {watch.flightNumber ? ` · ${watch.flightNumber}` : ""}
          {watch.departTime ? ` departing ${watch.departTime}` : ""}
          {` · ${watch.cabin.replace("_", " ")}`}
          {watch.maxStops !== null ? ` · up to ${watch.maxStops} stops` : ""}
          {watch.flight?.tripId ? <> · <a href={`/trips/${watch.flight.tripId}`}>trip</a></> : null}
        </p>
        <div className="row">
          <span className="tag">{watch.status}</span>
          {latest ? <span>Latest {money(latest.price, watch.currency)}</span> : null}
          {prices.length ? <span className="muted">Lowest {money(Math.min(...prices), watch.currency)}</span> : null}
          {latest && paid !== null ? (
            <span className={Number(latest.price) < paid ? "" : "muted"}>
              {Number(latest.price) < paid
                ? `${money(paid - Number(latest.price), watch.currency)} below what you paid`
                : `Paid ${money(paid, watch.currency)}`}
            </span>
          ) : null}
          <span className="muted">
            {watch.lastCheckedAt ? `Checked ${stamp(watch.lastCheckedAt)} UTC` : "Not checked yet"}
          </span>
        </div>
        {watch.lastError ? <p className="error">{watch.lastError}</p> : null}
        <PriceChart
          points={watch.points.map((p) => ({ t: p.observedAt, price: Number(p.price) }))}
          currency={watch.currency}
          paid={paid}
          target={num(watch.targetPrice)}
        />
        <div className="row">
          {live ? (
            <form action={checkNow}>
              <input type="hidden" name="id" value={watch.id} />
              <button className="secondary" type="submit">Check now</button>
            </form>
          ) : null}
          {watch.status !== "expired" ? (
            <form action={setStatus}>
              <input type="hidden" name="id" value={watch.id} />
              <input type="hidden" name="status" value={watch.status === "paused" ? "active" : "paused"} />
              <button className="secondary" type="submit">{watch.status === "paused" ? "Resume" : "Pause"}</button>
            </form>
          ) : null}
          <form action={remove}>
            <input type="hidden" name="id" value={watch.id} />
            <button className="secondary" type="submit">Delete</button>
          </form>
        </div>
      </section>

      <section className="card">
        <h3>Alerts</h3>
        <form action={saveRules} className="inline">
          <input type="hidden" name="id" value={watch.id} />
          <label>Name<input name="label" defaultValue={watch.label ?? ""} size={18} /></label>
          <label>Paid<input name="paidPrice" type="number" step="0.01" min="0" defaultValue={paid ?? ""} size={7} /></label>
          <label>Target price<input name="targetPrice" type="number" step="1" min="0" defaultValue={num(watch.targetPrice) ?? ""} size={6} /></label>
          <label>Drop of<input name="dropAmount" type="number" step="1" min="0" defaultValue={num(watch.dropAmount) ?? ""} size={5} /></label>
          <label>or drop %<input name="dropPercent" type="number" step="1" min="1" max="99" defaultValue={watch.dropPercent ? Math.round(watch.dropPercent * 100) : ""} size={4} /></label>
          <button type="submit">Save</button>
        </form>
        <p className="muted" style={{ fontSize: 12 }}>
          You get an alert when the fare drops by the amount or percent since its last high, reaches the target, or goes
          below what you paid.
        </p>
        {watch.alerts.length === 0 ? null : (
          <ul>
            {watch.alerts.map((a) => (
              <li key={a.id}>
                {a.message} <span className="muted">{stamp(a.createdAt)} UTC{a.notifiedAt ? " · sent" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>History</h3>
        {watch.points.length === 0 ? (
          <p className="muted">No prices yet. The sidecar checks every few hours.</p>
        ) : (
          <table>
            <thead><tr><th>Checked (UTC)</th><th>Price</th><th>Fare</th><th>Stops</th><th></th></tr></thead>
            <tbody>
              {[...watch.points].reverse().map((p) => (
                <tr key={p.id}>
                  <td>{stamp(p.observedAt)}</td>
                  <td>{money(p.price, p.currency)}</td>
                  <td>
                    {[p.airline, p.flightNumber, p.departTime].filter(Boolean).join(" ")}{" "}
                    <span className="muted">({MATCHED[p.matchedBy] ?? p.matchedBy}, {p.fareCount} {p.fareCount === 1 ? "fare" : "fares"})</span>
                  </td>
                  <td>{p.stops ?? ""}</td>
                  <td>{p.bookingUrl && /^https?:\/\//.test(p.bookingUrl) ? <a href={p.bookingUrl} target="_blank" rel="noreferrer">Book</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
