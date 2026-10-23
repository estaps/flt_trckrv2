import { prisma } from "@/lib/db";
import { money, ymd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function ECreditsPage() {
  const credits = await prisma.eCredit.findMany({ orderBy: [{ status: "asc" }, { expiresOn: "asc" }] });
  return (
    <section className="card">
      <h2>eCredits</h2>
      {credits.length === 0 ? (
        <p className="muted">No eCredits yet. They are picked up from receipts and cancellation emails.</p>
      ) : (
        <table>
          <thead><tr><th>Number</th><th>Airline</th><th>Amount</th><th>Expires</th><th>From ticket</th><th>Status</th></tr></thead>
          <tbody>
            {credits.map((c) => (
              <tr key={c.id}>
                <td>{c.number}</td>
                <td>{c.airline ?? ""}</td>
                <td>{c.amount !== null ? money(c.amount, c.currency) : <span className="muted">not stated</span>}</td>
                <td>{ymd(c.expiresOn)}</td>
                <td>{c.sourceTicketNumber && c.sourceTicketNumber !== c.number ? c.sourceTicketNumber : ""}</td>
                <td><span className="tag">{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
