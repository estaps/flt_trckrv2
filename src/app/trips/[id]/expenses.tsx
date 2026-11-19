import type { Expense } from "@prisma/client";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EXPENSE_CATEGORIES } from "@/lib/schemas";
import { money, shortDay } from "@/lib/ui/format";
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

export function ExpensesSection({ tripId, expenses, home, defaultDate, error }: { tripId: string; expenses: Expense[]; home: string; defaultDate: string; error?: string }) {
  const total = expenses.reduce((sum, e) => sum + Number(e.amountHome ?? 0), 0);
  const unconverted = expenses.filter((e) => e.amountHome === null).length;
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amountHome ?? 0));

  const slices = [...byCategory].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const color = (i: number) => `var(--cat-${Math.min(i + 1, 6)})`;

  return (
    <>
      <section className="card" id="expenses">
        <div className="card-head"><h3>Expenses</h3></div>
        {expenses.length === 0 ? (
          <p className="empty">No expenses yet. Add one below, or read a receipt photo or PDF.</p>
        ) : (
          <>
            <div className="spend">
              <div className="spend-total">{money(total, home)}</div>
              {slices.length > 0 ? (
                <>
                  <div className="bar" role="img" aria-label="Spend by category">
                    {slices.map(([c, n], i) => <span key={c} style={{ flex: n, ["--c" as string]: color(i) }} title={`${categoryLabel(c)} ${money(n, home)}`} />)}
                  </div>
                  <div className="legend">
                    {slices.map(([c, n], i) => <span key={c} style={{ ["--c" as string]: color(i) }}>{categoryLabel(c)}<b>{money(n, home)}</b></span>)}
                  </div>
                </>
              ) : null}
            </div>
            <div className="scroll">
              <table>
                <thead><tr><th>Date</th><th>Category</th><th>Merchant</th><th className="money">Amount</th><th className="money">{home}</th><th></th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="mono">{shortDay(e.spentOn)}</td>
                      <td>{categoryLabel(e.category)}</td>
                      <td>{e.merchant ?? ""}{e.notes ? <div className="muted small">{e.notes}</div> : null}</td>
                      <td className="money">{money(e.amount, e.currency)}</td>
                      <td className="money">{homeCell(e, home)}</td>
                      <td className="actions r">
                        {e.documentId ? <a href={`/api/documents/${e.documentId}/file`} target="_blank">receipt</a> : null}
                        <a href={`/expenses/${e.id}`}>edit</a>
                        <form action={removeExpense}>
                          <input type="hidden" name="expenseId" value={e.id} />
                          <ConfirmButton message="Delete this expense?" className="link danger">delete</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td colSpan={4}>Total ({home})</td>
                    <td className="money">{money(total, home)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {unconverted ? (
              <form action={convertExpenses} className="row" style={{ marginTop: 12 }}>
                <input type="hidden" name="tripId" value={tripId} />
                <span className="warn">{unconverted === 1 ? "1 expense in another currency is" : `${unconverted} expenses in other currencies are`} not in the total yet.</span>
                <button type="submit" className="secondary">Look up exchange rates</button>
              </form>
            ) : null}
          </>
        )}
      </section>

      <details className="adder" id="add-expense" open={Boolean(error)}>
        <summary>Add an expense</summary>
        <div className="adder-body">
          {error ? <p className="error">Expense not added. {error}</p> : null}
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
          <hr className="divider" />
          <form action={scanReceipts} className="inline">
            <input type="hidden" name="tripId" value={tripId} />
            <label>Or read receipts automatically<input name="receipts" type="file" multiple accept="image/*,application/pdf,.eml" required /></label>
            <button type="submit" className="secondary">Read and review</button>
          </form>
          <p className="hint">Read receipts go to the inbox, where you check the amount and confirm them into this trip.</p>
        </div>
      </details>
    </>
  );
}
