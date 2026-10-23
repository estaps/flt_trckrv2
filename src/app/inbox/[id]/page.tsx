import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { airportByIata } from "@/lib/airports";
import { ConfirmError, confirmDocument, latestResolved } from "@/lib/ingest/apply";
import { KIND_LABELS, money, ymd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

async function confirm(formData: FormData) {
  "use server";
  const id = String(formData.get("documentId"));
  const choice = String(formData.get("trip") ?? "");
  const newName = String(formData.get("newTripName") ?? "").trim();
  const trip = choice === "new" ? { newTripName: newName || "New trip" } : choice ? { tripId: choice } : null;
  try {
    await confirmDocument(id, trip);
  } catch (err) {
    if (err instanceof ConfirmError) redirect(`/inbox/${id}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }
  revalidatePath("/inbox");
  redirect("/inbox");
}

async function ignore(formData: FormData) {
  "use server";
  await prisma.document.update({ where: { id: String(formData.get("documentId")) }, data: { status: "ignored" } });
  revalidatePath("/inbox");
  redirect("/inbox");
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const doc = await prisma.document.findUnique({ where: { id } }).catch(() => null);
  if (!doc) notFound();
  const resolved = await latestResolved(id);
  const failure = resolved
    ? null
    : ((await prisma.extraction.findFirst({ where: { documentId: id }, orderBy: { createdAt: "desc" } }))?.rawJson as {
        error?: string;
      } | null);

  const flights = resolved?.flights ?? [];
  const dates = flights.map((f) => f.depDate).sort();
  const trips = await prisma.trip.findMany({ orderBy: { startDate: "desc" }, take: 50 });
  // Suggest a trip whose dates overlap these flights, give or take two days.
  const pad = 2 * 86400000;
  const suggested = dates.length
    ? trips.find(
        (t) =>
          t.startDate &&
          t.endDate &&
          t.startDate.getTime() - pad <= Date.parse(dates[dates.length - 1]) &&
          t.endDate.getTime() + pad >= Date.parse(dates[0]),
      )
    : undefined;
  const firstArrival = flights[0]?.arrAirport ? airportByIata(flights[0].arrAirport) : undefined;
  const suggestedName = firstArrival ? `${titleCase(firstArrival.city)} ${dates[0]?.slice(5) ?? ""}`.trim() : "New trip";
  const p = resolved?.parsed;

  return (
    <>
      <p><a href="/inbox">Inbox</a></p>
      <section className="card">
        <h2>{doc.subject ?? "Document"}</h2>
        <p className="muted">
          <span className="tag">{doc.status.replace("_", " ")}</span>{" "}
          {doc.sender ? `${doc.sender} · ` : ""}received {ymd(doc.receivedAt)} ·{" "}
          <a href={`/api/documents/${doc.id}/file`} target="_blank">open original</a>
        </p>
        {error ? <p className="error">{error}</p> : null}
        {failure?.error ? <p className="error">Could not parse: {failure.error}</p> : null}
        {p ? (
          <>
            <p>
              <strong>{KIND_LABELS[p.kind]}</strong>
              {p.confirmationCode ? ` · confirmation ${p.confirmationCode}` : ""}
              {p.ticketNumber ? ` · ticket ${p.ticketNumber}` : ""}
              {p.passengerName ? ` · ${p.passengerName}` : ""}
              <span className="muted"> · read by {p.template === "llm" ? "the LLM" : `the ${p.template} template`}</span>
            </p>
            {resolved!.warnings.length > 0 ? (
              <ul className="warn">{resolved!.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            ) : null}
          </>
        ) : null}
      </section>

      {flights.length > 0 ? (
        <section className="card">
          <h3>Flights</h3>
          <table>
            <thead><tr><th>Flight</th><th>Date</th><th>Route</th><th>Departs</th><th>Arrives</th><th>Cabin</th><th>Seat</th></tr></thead>
            <tbody>
              {flights.map((f) => (
                <tr key={`${f.carrier}${f.flightNumber}${f.depDate}`}>
                  <td>{f.carrier} {f.flightNumber}</td>
                  <td>{f.depDate}</td>
                  <td>{f.depAirport ?? "?"} to {f.arrAirport ?? "?"}</td>
                  <td>{f.depTimeLocal ?? ""}</td>
                  <td>{f.arrTimeLocal ?? ""}</td>
                  <td>{[f.cabin, f.fareClass && `(${f.fareClass})`].filter(Boolean).join(" ")}</td>
                  <td>{f.seat ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Times are local to each airport.</p>
        </section>
      ) : null}

      {p && (p.charges || p.ecreditsApplied.length || p.ecreditsIssued.length || p.cancelledTicketNumbers.length) ? (
        <section className="card">
          <h3>Money</h3>
          <table>
            <tbody>
              {p.charges ? (
                <>
                  {p.charges.baseFare !== undefined ? <tr><td>Base fare</td><td>{money(p.charges.baseFare, p.charges.currency)}</td></tr> : null}
                  {p.charges.taxes !== undefined ? <tr><td>Taxes and fees</td><td>{money(p.charges.taxes, p.charges.currency)}</td></tr> : null}
                  <tr><td><strong>Total</strong></td><td><strong>{money(p.charges.total, p.charges.currency)}</strong>{p.paymentCard ? ` · ${p.paymentCard}` : ""}</td></tr>
                </>
              ) : null}
              {p.ecreditsApplied.map((c) => (
                <tr key={`a${c.number}`}><td>eCredit applied</td><td>{c.number}{c.amount !== undefined ? ` · ${money(c.amount, c.currency)}` : ""}</td></tr>
              ))}
              {p.ecreditsIssued.map((c) => (
                <tr key={`i${c.number}`}>
                  <td>eCredit issued</td>
                  <td>{c.number}{c.amount !== undefined ? ` · ${money(c.amount, c.currency)}` : " · amount not stated"}{c.expiresOn ? ` · expires ${c.expiresOn}` : ""}</td>
                </tr>
              ))}
              {p.cancelledTicketNumbers.map((t) => <tr key={`c${t}`}><td>Ticket cancelled</td><td>{t}</td></tr>)}
            </tbody>
          </table>
        </section>
      ) : null}

      {doc.status === "needs_review" && resolved ? (
        <section className="card">
          <form action={confirm}>
            <input type="hidden" name="documentId" value={doc.id} />
            {flights.length > 0 ? (
              <div className="row">
                <label>
                  Trip
                  <select name="trip" defaultValue={suggested?.id ?? "new"}>
                    <option value="new">New trip</option>
                    {trips.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({ymd(t.startDate)})</option>
                    ))}
                    <option value="">No trip</option>
                  </select>
                </label>
                <label>
                  New trip name
                  <input name="newTripName" defaultValue={suggestedName} />
                </label>
              </div>
            ) : null}
            <p className="row">
              <button type="submit">Confirm</button>
              <button type="submit" formAction={ignore} className="secondary">Ignore</button>
            </p>
          </form>
        </section>
      ) : null}
    </>
  );
}
