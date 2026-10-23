"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createExpense, storeReceipt, updateExpense } from "@/lib/expenses";
import { fillHomeAmounts } from "@/lib/fx";
import { ingestFile } from "@/lib/ingest";
import { addPhoto, deletePhoto, parsePhoto, PhotoError } from "@/lib/photos";
import { ExpenseInput, ExpensePatch, PhotoPatch } from "@/lib/schemas";

const file = (v: FormDataEntryValue | null) => (v instanceof File && v.size > 0 ? v : null);
const bytes = async (f: File) => Buffer.from(await f.arrayBuffer());

function expenseFields(formData: FormData) {
  return {
    category: formData.get("category"),
    merchant: formData.get("merchant"),
    notes: formData.get("notes"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    spentOn: formData.get("spentOn"),
    amountHome: formData.get("amountHome"),
  };
}

export async function addExpense(formData: FormData) {
  const tripId = String(formData.get("tripId"));
  const receipt = file(formData.get("receipt"));
  const documentId = receipt ? await storeReceipt(await bytes(receipt), receipt.name, receipt.type) : undefined;
  await createExpense(ExpenseInput.parse({ ...expenseFields(formData), tripId, documentId }));
  revalidatePath(`/trips/${tripId}`);
}

export async function saveExpense(formData: FormData) {
  const id = String(formData.get("expenseId"));
  const receipt = file(formData.get("receipt"));
  const documentId = receipt ? await storeReceipt(await bytes(receipt), receipt.name, receipt.type) : undefined;
  const fields = expenseFields(formData);
  // An emptied field on the edit form clears it.
  const patch = ExpensePatch.parse({ ...fields, merchant: fields.merchant || null, notes: fields.notes || null, documentId });
  const expense = await updateExpense(id, patch, { dropRate: !fields.amountHome });
  redirect(expense.tripId ? `/trips/${expense.tripId}` : "/");
}

export async function removeExpense(formData: FormData) {
  const expense = await prisma.expense.delete({ where: { id: String(formData.get("expenseId")) } });
  redirect(expense.tripId ? `/trips/${expense.tripId}` : "/");
}

export async function convertExpenses(formData: FormData) {
  const tripId = String(formData.get("tripId"));
  await fillHomeAmounts({ tripId });
  revalidatePath(`/trips/${tripId}`);
}

// Receipts read by the parser go to the inbox, with this trip picked for the confirm step.
export async function scanReceipts(formData: FormData) {
  const tripId = String(formData.get("tripId"));
  const files = formData.getAll("receipts").map(file).filter((f): f is File => f !== null);
  if (files.length === 0) return;
  const results = [];
  for (const f of files) {
    results.push(await ingestFile({ data: await bytes(f), filename: f.name, mimeType: f.type, source: "upload" }));
  }
  redirect(results.length === 1 ? `/inbox/${results[0].documentId}?trip=${tripId}` : "/inbox");
}

export async function uploadPhotos(formData: FormData) {
  const tripId = String(formData.get("tripId"));
  const meta = PhotoPatch.parse({ kind: formData.get("kind") || undefined, caption: formData.get("caption") || undefined });
  const files = formData.getAll("photos").map(file).filter((f): f is File => f !== null);
  const skipped: string[] = [];
  for (const f of files) {
    try {
      await addPhoto({ tripId, data: await bytes(f), filename: f.name, mimeType: f.type, kind: meta.kind, caption: meta.caption });
    } catch (err) {
      if (!(err instanceof PhotoError)) throw err;
      skipped.push(f.name);
    }
  }
  revalidatePath(`/trips/${tripId}`);
  if (skipped.length) redirect(`/trips/${tripId}?error=${encodeURIComponent(`Not an image: ${skipped.join(", ")}`)}#photos`);
}

export async function editPhoto(formData: FormData) {
  const id = String(formData.get("photoId"));
  const photo = await prisma.tripPhoto.update({
    where: { id },
    data: {
      ...PhotoPatch.parse({ kind: formData.get("kind") || undefined, flightId: formData.get("flightId") || null }),
      caption: String(formData.get("caption") ?? "").trim() || null,
    },
  });
  revalidatePath(`/trips/${photo.tripId}`);
}

export async function removePhoto(formData: FormData) {
  const photo = await deletePhoto(String(formData.get("photoId")));
  revalidatePath(`/trips/${photo.tripId}`);
}

export async function readPhoto(formData: FormData) {
  const id = String(formData.get("photoId"));
  const photo = await prisma.tripPhoto.findUniqueOrThrow({ where: { id } });
  const documentId = await parsePhoto(id);
  redirect(`/inbox/${documentId}${photo.tripId ? `?trip=${photo.tripId}` : ""}`);
}
