import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { FlightInput } from "@/lib/schemas";
import { ymd } from "@/lib/ui/format";
import { ExpensesSection } from "./expenses";
import { PhotosSection } from "./photos";

export const dynamic = "force-dynamic";

async function addFlight(formData: FormData) {
  "use server";
  const tripId = String(formData.get("tripId"));
  const input = FlightInput.parse({
    tripId,
    carrier: formData.get("carrier"),
    flightNumber: formData.get("flightNumber"),
    depAirport: formData.get("depAirport"),
    arrAirport: formData.get("arrAirport"),
    depDate: formData.get("depDate"),
    depTimeLocal: formData.get("depTimeLocal") || undefined,
    seat: formData.get("seat") || undefined,
  });
  await prisma.flight.create({ data: input });
  revalidatePath(`/trips/${tripId}`);
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
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

  return (
    <>
      <p><a href="/">All trips</a></p>
      <section className="card">
        <h2>{trip.name}</h2>
        <p className="muted">{ymd(trip.startDate)}{trip.endDate ? ` to ${ymd(trip.endDate)}` : ""}</p>
        {trip.flights.length === 0 ? (
          <p className="muted">No flights yet.</p>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Flight</th><th>Route</th><th>Departs</th><th>Arrives</th><th>Seat</th><th>Booking</th><th>Status</th></tr></thead>
            <tbody>
              {trip.flights.map((f) => (
                <tr key={f.id}>
                  <td>{ymd(f.depDate)}</td>
                  <td>{f.carrier} {f.flightNumber}</td>
                  <td>{f.depAirport} to {f.arrAirport}</td>
                  <td>{f.depTimeLocal ?? ""}</td>
                  <td>{f.arrTimeLocal ?? ""}</td>
                  <td>{f.seat ?? ""}</td>
                  <td>{f.booking ? `${f.booking.confirmationCode}${f.booking.status !== "ticketed" ? ` (${f.booking.status})` : ""}` : ""}</td>
                  <td>{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <ExpensesSection tripId={trip.id} expenses={trip.expenses} home={home} defaultDate={ymd(trip.startDate)} />
      <PhotosSection tripId={trip.id} photos={trip.photos} flights={trip.flights} error={error} />
      <section className="card">
        <h3>Add a flight</h3>
        <form action={addFlight} className="inline">
          <input type="hidden" name="tripId" value={trip.id} />
          <label>Airline<input name="carrier" defaultValue="DL" size={3} required /></label>
          <label>Number<input name="flightNumber" size={5} required /></label>
          <label>From<input name="depAirport" size={4} required /></label>
          <label>To<input name="arrAirport" size={4} required /></label>
          <label>Date<input name="depDate" type="date" required /></label>
          <label>Departs (local)<input name="depTimeLocal" type="time" /></label>
          <label>Seat<input name="seat" size={4} /></label>
          <button type="submit">Add flight</button>
        </form>
      </section>
    </>
  );
}
