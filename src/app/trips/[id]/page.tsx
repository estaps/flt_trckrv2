import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { FlightInput } from "@/lib/schemas";
import { money, tripDates, ymd } from "@/lib/ui/format";
import { FlightPass } from "@/components/FlightPass";
import { ExpensesSection } from "./expenses";
import { PhotosSection } from "./photos";

export const dynamic = "force-dynamic";

async function addFlight(formData: FormData) {
  "use server";
  const tripId = String(formData.get("tripId"));
  const parsed = FlightInput.safeParse({
    tripId,
    carrier: formData.get("carrier"),
    flightNumber: formData.get("flightNumber"),
    depAirport: formData.get("depAirport"),
    arrAirport: formData.get("arrAirport"),
    depDate: formData.get("depDate"),
    depTimeLocal: formData.get("depTimeLocal") || undefined,
    seat: formData.get("seat") || undefined,
  });
  const back = (msg: string) => redirect(`/trips/${tripId}?flightError=${encodeURIComponent(msg)}#add-flight`);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    back(`${issue?.path.join(".") || "form"}: ${issue?.message ?? "check the form"}`);
    return;
  }
  try {
    await prisma.flight.create({ data: parsed.data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const f = parsed.data;
      back(`${f.carrier} ${f.flightNumber} on ${f.depDate.toISOString().slice(0, 10)} is already saved.`);
    }
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; expenseError?: string; flightError?: string }>;
}) {
  const { id } = await params;
  const { error, expenseError, flightError } = await searchParams;
  const trip = await prisma.trip
    .findUnique({
      where: { id },
      include: {
        flights: { orderBy: [{ depDate: "asc" }, { depTimeLocal: "asc" }], include: { booking: true } },
        expenses: { orderBy: [{ spentOn: "asc" }, { createdAt: "asc" }] },
        photos: { orderBy: { createdAt: "asc" } },
      },
    })
    .catch(() => null);
  if (!trip) notFound();
  const home = getConfig().HOME_CURRENCY;

  const spent = trip.expenses.reduce((sum, e) => sum + Number(e.amountHome ?? 0), 0);

  return (
    <>
      <div className="crumb"><a href="/">All trips</a> / {trip.name}</div>
      <div className="page-head">
        <div>
          <h2>{trip.name}</h2>
          <p className="sub">{tripDates(trip.startDate, trip.endDate)}</p>
        </div>
        <div className="kpis">
          <div><small>Flights</small><b>{trip.flights.length}</b></div>
          <div><small>Spent</small><b>{money(spent, home)}</b></div>
          <div><small>Photos</small><b>{trip.photos.length}</b></div>
        </div>
      </div>

      <section id="flights">
        <h3>Flights</h3>
        {trip.flights.length === 0 ? (
          <p className="empty">No flights yet. Add one below, or upload a confirmation and confirm it into this trip.</p>
        ) : (
          <div className="passes">
            {trip.flights.map((f) => <FlightPass key={f.id} flight={f} />)}
          </div>
        )}
      </section>

      <details className="adder" id="add-flight" open={Boolean(flightError)}>
        <summary>Add a flight</summary>
        <div className="adder-body">
          {flightError ? <p className="error">Flight not added. {flightError}</p> : null}
          <form action={addFlight} className="inline">
            <input type="hidden" name="tripId" value={trip.id} />
            <label>Airline<input name="carrier" defaultValue="DL" size={3} required /></label>
            <label>Number<input name="flightNumber" size={5} required /></label>
            <label>From<input name="depAirport" size={4} required placeholder="ATL" /></label>
            <label>To<input name="arrAirport" size={4} required placeholder="SEA" /></label>
            <label>Date<input name="depDate" type="date" required /></label>
            <label>Departs (local)<input name="depTimeLocal" type="time" /></label>
            <label>Seat<input name="seat" size={4} /></label>
            <button type="submit">Add flight</button>
          </form>
        </div>
      </details>

      <ExpensesSection tripId={trip.id} expenses={trip.expenses} home={home} defaultDate={ymd(trip.startDate)} error={expenseError} />
      <PhotosSection tripId={trip.id} photos={trip.photos} flights={trip.flights} error={error} />
    </>
  );
}
