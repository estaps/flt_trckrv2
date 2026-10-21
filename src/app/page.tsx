import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { TripInput } from "@/lib/schemas";

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

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function Home() {
  const trips = await prisma.trip.findMany({
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { flights: true } } },
  });

  return (
    <>
      <section className="card">
        <h2>New trip</h2>
        <form action={createTrip} className="inline">
          <label>Name<input name="name" required /></label>
          <label>Start<input name="startDate" type="date" /></label>
          <label>End<input name="endDate" type="date" /></label>
          <button type="submit">Add trip</button>
        </form>
      </section>
      <section className="card">
        <h2>Trips</h2>
        {trips.length === 0 ? (
          <p className="muted">No trips yet.</p>
        ) : (
          <table>
            <thead><tr><th>Trip</th><th>Dates</th><th>Flights</th></tr></thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id}>
                  <td><a href={`/trips/${t.id}`}>{t.name}</a></td>
                  <td>{day(t.startDate)}{t.endDate ? ` to ${day(t.endDate)}` : ""}</td>
                  <td>{t._count.flights}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
