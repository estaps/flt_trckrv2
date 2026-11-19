import { prisma } from "@/lib/db";
import type { ResolvedDocument } from "@/lib/parse/resolve";
import { KIND_LABELS, statusLabel, statusTone } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const showAll = (await searchParams).all === "1";
  const docs = await prisma.document.findMany({
    where: showAll ? undefined : { status: { in: ["needs_review", "failed"] } },
    orderBy: { receivedAt: "desc" },
    take: 200,
    include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <>
    <div className="page-head">
      <div>
        <h2>Inbox</h2>
        <p className="sub">{showAll ? `${docs.length} documents` : `${docs.length} to review`}</p>
      </div>
      <a href={showAll ? "/inbox" : "/inbox?all=1"}>{showAll ? "Show items to review" : "Show everything"}</a>
    </div>
    <section className="card">
      {docs.length === 0 ? (
        <p className="empty">Nothing to review. <a href="/upload">Upload a confirmation or receipt</a>.</p>
      ) : (
        <div className="scroll">
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>Confirmation</th><th>Flights</th><th>Status</th></tr></thead>
          <tbody>
            {docs.map((d) => {
              const raw = d.extractions[0]?.rawJson as unknown as ResolvedDocument | { error: string } | undefined;
              const r = raw && "parsed" in raw ? raw : undefined;
              return (
                <tr key={d.id}>
                  <td><a href={`/inbox/${d.id}`}>{d.subject ?? "Untitled"}</a></td>
                  <td>{r ? KIND_LABELS[r.parsed.kind] : ""}</td>
                  <td className="mono">{r?.parsed.confirmationCode ?? ""}</td>
                  <td className="mono small">{r?.flights.map((f) => `${f.carrier}${f.flightNumber} ${f.depAirport ?? "?"}-${f.arrAirport ?? "?"}`).join(", ")}</td>
                  <td>
                    <span className={`tag ${statusTone(d.status)}`}>{statusLabel(d.status)}</span>
                    {r && r.warnings.length > 0 ? <div className="warn small">{r.warnings.length === 1 ? "1 warning" : `${r.warnings.length} warnings`}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
    </>
  );
}
