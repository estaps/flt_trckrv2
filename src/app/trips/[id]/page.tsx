import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { FlightInput } from "@/lib/schemas";
import { money, ymd } from "@/lib/ui/format";

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

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip
    .findUnique({
      where: { id },
      include: {
        flights: { orderBy: [{ depDate: "asc" }, { depTimeLocal: "asc" }], include: { booking: true } },
        expenses: { orderBy: { spentOn: "asc" } },
      },
    })
    .catch(() => null);
  if (!trip) notFound();
  const home = getConfig().HOME_CURRENCY;
  const total = trip.expenses.reduce((sum, e) => sum + Number(e.amountHome ?? 0), 0);
  const unconverted = trip.expenses.filter((e) => e.amountHome === null).length;

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
      <section className="card">
        <h3>Expenses</h3>
        {trip.expenses.length === 0 ? (
          <p className="muted">No expenses yet.</p>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Merchant</th><th>Amount</th></tr></thead>
            <tbody>
              {trip.expenses.map((e) => (
                <tr key={e.id}>
                  <td>{ymd(e.spentOn)}</td>
                  <td>{e.category}</td>
                  <td>{e.merchant ?? ""}</td>
                  <td>{money(e.amount, e.currency)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}><strong>Total ({home})</strong>{unconverted ? <span className="muted"> · {unconverted} in other currencies not included</span> : null}</td>
                <td><strong>{money(total, home)}</strong></td>
              </tr>
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
          <label>Date<input name="depDate" type="date" required /></label>
          <label>Departs (local)<input name="depTimeLocal" type="time" /></label>
          <label>Seat<input name="seat" size={4} /></label>
          <button type="submit">Add flight</button>
        </form>
      </section>
    </>
  );
}
