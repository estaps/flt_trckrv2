import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { sha256Of, storeFile } from "./files";
import { manualHome, toHome, type HomeAmount } from "./fx";
import { mimeFromName } from "./ingest/extract";
import type { ExpenseInput, ExpensePatch } from "./schemas";

async function homeFor(amount: number, currency: string, spentOn: Date, amountHome?: number): Promise<HomeAmount | null> {
  if (amountHome !== undefined) return manualHome(amount, amountHome);
  return toHome(amount, currency, spentOn).catch(() => null);
}

export async function createExpense(input: ExpenseInput) {
  const { amountHome, ...rest } = input;
  const home = await homeFor(input.amount, input.currency, input.spentOn, amountHome);
  return prisma.expense.create({ data: { ...rest, ...(home ?? {}) } });
}

// Changing the amount, currency or date re-derives the home amount unless one is given.
// A rate taken from a card charge is kept unless dropRate says the user cleared it.
export async function updateExpense(id: string, patch: ExpensePatch, { dropRate = false } = {}) {
  const { amountHome, ...rest } = patch;
  const current = await prisma.expense.findUniqueOrThrow({ where: { id } });
  const data: Prisma.ExpenseUncheckedUpdateInput = { ...rest };
  const amount = patch.amount ?? Number(current.amount);
  const currency = patch.currency ?? current.currency;
  const spentOn = patch.spentOn ?? current.spentOn;
  const moneyChanged = patch.amount !== undefined || patch.currency !== undefined || patch.spentOn !== undefined;
  if (amountHome !== undefined || moneyChanged || dropRate) {
    const keepManual = !dropRate && amountHome === undefined && current.fxSource === "manual" && currency === current.currency;
    const home = keepManual
      ? manualHome(amount, Number(current.fxRate) * amount)
      : await homeFor(amount, currency, spentOn, amountHome);
    Object.assign(data, home ?? { amountHome: null, fxRate: null, fxSource: null });
  }
  return prisma.expense.update({ where: { id }, data });
}

// Keeps a receipt the user attached by hand. It is stored as a confirmed document so it is
// never parsed into a second expense; the same file uploaded twice is stored once.
export async function storeReceipt(data: Buffer, filename: string, mimeType?: string): Promise<string> {
  const sha256 = sha256Of(data);
  const existing = await prisma.document.findUnique({ where: { sha256 } });
  if (existing) return existing.id;
  const ext = path.extname(filename).toLowerCase() || ".bin";
  const storagePath = await storeFile("", data, ext, sha256);
  const doc = await prisma.document.create({
    data: { source: "upload", sha256, mimeType: mimeFromName(filename, mimeType), subject: filename, storagePath, status: "confirmed" },
  });
  return doc.id;
}
