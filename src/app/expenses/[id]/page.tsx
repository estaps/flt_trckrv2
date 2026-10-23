import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { EXPENSE_CATEGORIES } from "@/lib/schemas";
import { ymd } from "@/lib/ui/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { removeExpense, saveExpense } from "@/app/trips/[id]/actions";
import { CurrencyList } from "@/app/trips/[id]/expenses";

export const dynamic = "force-dynamic";

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.expense.findUnique({ where: { id }, include: { trip: true } }).catch(() => null);
  if (!e) notFound();
  const home = getConfig().HOME_CURRENCY;

  return (
    <>
      <p>{e.trip ? <a href={`/trips/${e.trip.id}`}>{e.trip.name}</a> : <a href="/">All trips</a>}</p>
      <section className="card">
        <h2>Edit expense</h2>
        <form action={saveExpense} className="inline">
          <input type="hidden" name="expenseId" value={e.id} />
          <label>Category
            <select name="category" defaultValue={e.category}>
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Merchant<input name="merchant" defaultValue={e.merchant ?? ""} /></label>
          <label>Date<input name="spentOn" type="date" defaultValue={ymd(e.spentOn)} required /></label>
          <label>Amount<input name="amount" inputMode="decimal" size={8} defaultValue={String(e.amount)} required /></label>
          <label>Currency<input name="currency" list="currencies" defaultValue={e.currency} size={4} required /></label>
          <label title="Leave empty to use the day's exchange rate">
            Charged in {home}
            <input name="amountHome" inputMode="decimal" size={8} placeholder="optional" defaultValue={e.fxSource === "manual" ? String(e.amountHome) : ""} />
          </label>
          <label>Notes<input name="notes" defaultValue={e.notes ?? ""} /></label>
          <label>{e.documentId ? "Replace receipt" : "Receipt"}<input name="receipt" type="file" accept="image/*,application/pdf" /></label>
          <button type="submit">Save</button>
        </form>
        <CurrencyList />
        {e.documentId ? <p><a href={`/api/documents/${e.documentId}/file`} target="_blank">View current receipt</a></p> : null}
        <form action={removeExpense}>
          <input type="hidden" name="expenseId" value={e.id} />
          <ConfirmButton message="Delete this expense?" className="secondary">Delete expense</ConfirmButton>
        </form>
      </section>
    </>
  );
}
