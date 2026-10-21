import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { FlightInput } from "@/lib/schemas";

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
    // datetime-local has no zone; the field is labeled UTC.
    depTimeUtc: `${formData.get("depTimeUtc")}Z`,
    seat: formData.get("seat") || undefined,
  });
  await prisma.flight.create({ data: input });
  revalidatePath(`/trips/${tripId}`);
}

const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip
    .findUnique({ where: { id }, include: { flights: { orderBy: { depTimeUtc: "asc" } } } })
    .catch(() => null);
  if (!trip) notFound();

  return (
    <>
      <p><a href="/">All trips</a></p>
      <section className="card">
        <h2>{trip.name}</h2>
        {trip.flights.length === 0 ? (
          <p className="muted">No flights yet.</p>
        ) : (
          <table>
            <thead><tr><th>Flight</th><th>Route</th><th>Departs</th><th>Seat</th><th>Status</th></tr></thead>
            <tbody>
              {trip.flights.map((f) => (
                <tr key={f.id}>
                  <td>{f.carrier} {f.flightNumber}</td>
                  <td>{f.depAirport} to {f.arrAirport}</td>
                  <td>{when(f.depTimeUtc)}</td>
                  <td>{f.seat ?? ""}</td>
                  <td>{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h3>Add a flight</h3>
        <form action={addFlight} className="inline">
          <input type="hidden" name="tripId" value={trip.id} />
          <label>Airline<input name="carrier" defaultValue="DL" size={3} required /></label>
          <label>Number<input name="flightNumber" size={5} required /></label>
          <label>From<input name="depAirport" size={4} required /></label>
          <label>To<input name="arrAirport" size={4} required /></label>
          <label>Departs (UTC)<input name="depTimeUtc" type="datetime-local" required /></label>
          <label>Seat<input name="seat" size={4} /></label>
          <button type="submit">Add flight</button>
        </form>
      </section>
    </>
  );
}
