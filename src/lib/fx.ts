import { Prisma } from "@prisma/client";
import { getConfig } from "./config";
import { prisma } from "./db";

type Fetch = typeof fetch;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Rate from one currency to another on a day (ECB reference rates via Frankfurter).
// Weekends and holidays get the last published rate before them. Null when unknown.
export async function fetchRate(from: string, to: string, day: string, fetchImpl: Fetch = fetch): Promise<number | null> {
  const base = getConfig().FX_API_URL;
  if (!base || base === "off") return null;
  const res = await fetchImpl(`${base.replace(/\/$/, "")}/${day}?base=${from}&symbols=${to}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { rates?: Record<string, number> };
  const rate = json.rates?.[to];
  return typeof rate === "number" && rate > 0 ? rate : null;
}

// Cached lookup. Future dates use today's rate.
export async function getRate(from: string, to: string, day: Date, fetchImpl: Fetch = fetch): Promise<number | null> {
  if (from === to) return 1;
  const today = ymd(new Date());
  const key = ymd(day) > today ? today : ymd(day);
  const where = { day_base_quote: { day: new Date(`${key}T00:00:00Z`), base: from, quote: to } };
  const cached = await prisma.fxRate.findUnique({ where });
  if (cached) return Number(cached.rate);
  const rate = await fetchRate(from, to, key, fetchImpl).catch(() => null);
  if (rate === null) return null;
  // Today's rate can still change, so only past days are cached.
  if (key < today) {
    const data = { ...where.day_base_quote, rate: new Prisma.Decimal(rate) };
    await prisma.fxRate.upsert({ where, create: data, update: data });
  }
  return rate;
}

export interface HomeAmount {
  amountHome: Prisma.Decimal;
  fxRate: Prisma.Decimal;
  fxSource: "same" | "ecb" | "manual";
}

export const roundCents = (n: number) => Math.round(n * 100) / 100;

// What an amount in a foreign currency comes to in the home currency, or null when no rate is available.
export async function toHome(amount: number, currency: string, day: Date, fetchImpl: Fetch = fetch): Promise<HomeAmount | null> {
  const home = getConfig().HOME_CURRENCY;
  if (currency === home) {
    return { amountHome: new Prisma.Decimal(amount), fxRate: new Prisma.Decimal(1), fxSource: "same" };
  }
  const rate = await getRate(currency, home, day, fetchImpl);
  if (rate === null) return null;
  return { amountHome: new Prisma.Decimal(roundCents(amount * rate)), fxRate: new Prisma.Decimal(rate), fxSource: "ecb" };
}

// The rate implied by what the card statement actually charged.
export function manualHome(amount: number, amountHome: number): HomeAmount {
  return {
    amountHome: new Prisma.Decimal(roundCents(amountHome)),
    fxRate: new Prisma.Decimal(amount === 0 ? 1 : (amountHome / amount).toFixed(8)),
    fxSource: "manual",
  };
}

// Converts every matching expense that has no home amount yet. Returns how many are still unconverted.
export async function fillHomeAmounts(where: Prisma.ExpenseWhereInput, fetchImpl: Fetch = fetch): Promise<number> {
  const pending = await prisma.expense.findMany({ where: { ...where, amountHome: null } });
  let left = 0;
  for (const e of pending) {
    const home = await toHome(Number(e.amount), e.currency, e.spentOn, fetchImpl);
    if (home) await prisma.expense.update({ where: { id: e.id }, data: home });
    else left++;
  }
  return left;
}
