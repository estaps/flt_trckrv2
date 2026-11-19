import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { TripInput } from "@/lib/schemas";
import { getConfig } from "@/lib/config";
import { Flap } from "@/components/Flap";
import { money, tripDates } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

async function createTrip(formData: FormData) {
  "use server";
  const input = TripInput.parse({
    name: formData.get("name"),
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined,
  });
  await prisma.trip.create({ data: input });
  revalidatePath("/");
}

// "ATL → SEA → ATL": the chain of airports, collapsing a connection's repeated airport.
function routeOf(flights: { depAirport: string; arrAirport: string }[]): string[] {
  const out: string[] = [];
  for (const f of flights) {
    if (out[out.length - 1] !== f.depAirport) out.push(f.depAirport);
    out.push(f.arrAirport);
  }
  return out;
}

export default async function Home() {
  const config = getConfig();
  const trips = await prisma.trip.findMany({
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: {
      flights: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ depDate: "asc" }, { depTimeLocal: "asc" }],
        select: { depAirport: true, arrAirport: true },
      },
      expenses: { select: { amountHome: true } },
      _count: { select: { flights: true, photos: true } },
    },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const when = (t: (typeof trips)[number]) => {
    if (!t.startDate) return null;
    const end = t.endDate ?? t.startDate;
    if (end < today) return <span className="tag dim">Past</span>;
    if (t.startDate <= today) return <span className="tag good">Now</span>;
    const days = Math.round((t.startDate.getTime() - today.getTime()) / 86_400_000);
    return <span className="tag">{days === 1 ? "Tomorrow" : `In ${days} days`}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Trips</h2>
          <p className="sub">{trips.length} {trips.length === 1 ? "trip" : "trips"}</p>
        </div>
      </div>
      {trips.length === 0 ? (
        <p className="empty">No trips yet. Add one below, or <a href="/upload">upload a confirmation</a> and confirm it from the inbox.</p>
      ) : (
        <div className="trips">
          {trips.map((t) => {
            const route = routeOf(t.flights);
            const spent = t.expenses.reduce((sum, e) => sum + Number(e.amountHome ?? 0), 0);
            return (
              <a key={t.id} href={`/trips/${t.id}`} className="trip">
                <div className="trip-top">
                  <div>
                    <h4>{t.name}</h4>
                    <div className="dates">{tripDates(t.startDate, t.endDate, false)}</div>
                  </div>
                  {when(t)}
                </div>
                <div className="route">
                  {route.length ? route.map((a, i) => <span key={i}>{i ? <span className="sep">→</span> : null}<Flap text={a} /></span>) : <span className="muted">No flights yet</span>}
                </div>
                <div className="trip-foot">
                  <span><b>{t._count.flights}</b> {t._count.flights === 1 ? "flight" : "flights"}</span>
                  <span><b>{money(spent, config.HOME_CURRENCY)}</b> spent</span>
                  {t._count.photos ? <span><b>{t._count.photos}</b> {t._count.photos === 1 ? "photo" : "photos"}</span> : null}
                </div>
              </a>
            );
          })}
        </div>
      )}
      <details className="adder" open={trips.length === 0}>
        <summary>New trip</summary>
        <div className="adder-body">
          <form action={createTrip} className="inline">
            <label>Name<input name="name" required placeholder="Seattle December" /></label>
            <label>Start<input name="startDate" type="date" /></label>
            <label>End<input name="endDate" type="date" /></label>
            <button type="submit">Add trip</button>
          </form>
        </div>
      </details>
    </>
  );
}
