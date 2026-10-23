import type { Expense } from "@prisma/client";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EXPENSE_CATEGORIES } from "@/lib/schemas";
import { money, ymd } from "@/lib/ui/format";
import { addExpense, convertExpenses, removeExpense, scanReceipts } from "./actions";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "MXN", "JPY", "AUD", "CHF", "CNY", "KRW", "INR", "BRL", "SEK", "NOK", "DKK", "NZD", "SGD", "HKD", "THB", "ZAR"];

export const categoryLabel = (c: string) => EXPENSE_CATEGORIES[c as keyof typeof EXPENSE_CATEGORIES] ?? c;

export function CurrencyList() {
  return (
    <datalist id="currencies">
      {CURRENCIES.map((c) => <option key={c} value={c} />)}
    </datalist>
  );
}

function homeCell(e: Expense, home: string) {
  if (e.amountHome === null) return <span className="warn" title="No exchange rate yet">not converted</span>;
  if (e.currency === home) return money(e.amountHome, home);
  const how = e.fxSource === "manual" ? "from the card charge" : "ECB rate";
  return <span title={`1 ${e.currency} = ${Number(e.fxRate).toFixed(4)} ${home} (${how})`}>{money(e.amountHome, home)}</span>;
}

export function ExpensesSection({ tripId, expenses, home, defaultDate }: { tripId: string; expenses: Expense[]; home: string; defaultDate: string }) {
  const total = expenses.reduce((sum, e) => sum + Number(e.amountHome ?? 0), 0);
  const unconverted = expenses.filter((e) => e.amountHome === null).length;
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amountHome ?? 0));

  return (
    <>
      <section className="card" id="expenses">
        <h3>Expenses</h3>
        {expenses.length === 0 ? (
          <p className="muted">No expenses yet.</p>
        ) : (
          <>
            <p className="row">
              <strong>{money(total, home)}</strong>
              {[...byCategory].filter(([, n]) => n !== 0).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <span key={c} className="tag">{categoryLabel(c)} {money(n, home)}</span>
              ))}
            </p>
            <div className="scroll">
              <table>
                <thead><tr><th>Date</th><th>Category</th><th>Merchant</th><th>Amount</th><th>{home}</th><th>Receipt</th><th></th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{ymd(e.spentOn)}</td>
                      <td>{categoryLabel(e.category)}</td>
                      <td>{e.merchant ?? ""}{e.notes ? <div className="muted small">{e.notes}</div> : null}</td>
                      <td>{money(e.amount, e.currency)}</td>
                      <td>{homeCell(e, home)}</td>
                      <td>{e.documentId ? <a href={`/api/documents/${e.documentId}/file`} target="_blank">view</a> : ""}</td>
                      <td className="actions">
                        <a href={`/expenses/${e.id}`}>edit</a>
                        <form action={removeExpense}>
                          <input type="hidden" name="expenseId" value={e.id} />
                          <ConfirmButton message="Delete this expense?" className="link">delete</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4}><strong>Total ({home})</strong></td>
                    <td colSpan={3}><strong>{money(total, home)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {unconverted ? (
              <form action={convertExpenses} className="row">
                <input type="hidden" name="tripId" value={tripId} />
                <span className="muted">{unconverted} in other currencies are not in the total yet.</span>
                <button type="submit" className="secondary">Look up exchange rates</button>
              </form>
            ) : null}
          </>
        )}
      </section>

      <section className="card">
        <h3>Add an expense</h3>
        <form action={addExpense} className="inline">
          <input type="hidden" name="tripId" value={tripId} />
          <label>Category
            <select name="category" defaultValue="meals">
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Merchant<input name="merchant" /></label>
          <label>Date<input name="spentOn" type="date" defaultValue={defaultDate} required /></label>
          <label>Amount<input name="amount" inputMode="decimal" size={8} required /></label>
          <label>Currency<input name="currency" list="currencies" defaultValue={home} size={4} required /></label>
          <label title="Leave empty to use the day's exchange rate">Charged in {home}<input name="amountHome" inputMode="decimal" size={8} placeholder="optional" /></label>
          <label>Notes<input name="notes" /></label>
          <label>Receipt<input name="receipt" type="file" accept="image/*,application/pdf" /></label>
          <button type="submit">Add expense</button>
        </form>
        <CurrencyList />
        <form action={scanReceipts} className="inline" style={{ marginTop: 16 }}>
          <input type="hidden" name="tripId" value={tripId} />
          <label>Or read receipts automatically<input name="receipts" type="file" multiple accept="image/*,application/pdf,.eml" required /></label>
          <button type="submit" className="secondary">Read and review</button>
        </form>
        <p className="muted small">Read receipts go to the inbox, where you check the amount and confirm them into this trip.</p>
      </section>
    </>
  );
}
