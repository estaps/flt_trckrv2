import { prisma } from "@/lib/db";
import { money, statusLabel, statusTone, ymd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function ECreditsPage() {
  const credits = await prisma.eCredit.findMany({ orderBy: [{ status: "asc" }, { expiresOn: "asc" }] });
  return (
    <>
    <div className="page-head">
      <div>
        <h2>eCredits</h2>
        <p className="sub">{credits.filter((c) => c.status === "active").length} active</p>
      </div>
    </div>
    <section className="card">
      {credits.length === 0 ? (
        <p className="empty">No eCredits yet. They are picked up from receipts and cancellation emails.</p>
      ) : (
        <div className="scroll">
        <table>
          <thead><tr><th>Number</th><th>Airline</th><th className="money">Amount</th><th>Expires</th><th>From ticket</th><th>Status</th></tr></thead>
          <tbody>
            {credits.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.number}</td>
                <td>{c.airline ?? ""}</td>
                <td className="money">{c.amount !== null ? money(c.amount, c.currency) : <span className="muted">not stated</span>}</td>
                <td className="mono">{ymd(c.expiresOn)}</td>
                <td className="mono">{c.sourceTicketNumber && c.sourceTicketNumber !== c.number ? c.sourceTicketNumber : ""}</td>
                <td><span className={`tag ${statusTone(c.status)}`}>{statusLabel(c.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
    </>
  );
}
