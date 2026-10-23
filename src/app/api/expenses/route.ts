import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { createExpense, storeReceipt } from "@/lib/expenses";
import { ExpenseInput } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  const tripId = new URL(req.url).searchParams.get("tripId") ?? undefined;
  const expenses = await prisma.expense.findMany({
    where: tripId ? { tripId } : undefined,
    orderBy: { spentOn: "desc" },
    take: 500,
  });
  return NextResponse.json(expenses);
}

// JSON body, or multipart/form-data with the same fields plus an optional "receipt" file.
export async function POST(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  try {
    let body: Record<string, unknown>;
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData();
      body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
      const receipt = form.get("receipt");
      if (receipt instanceof File && receipt.size > 0) {
        body.documentId = await storeReceipt(Buffer.from(await receipt.arrayBuffer()), receipt.name, receipt.type);
      }
    } else {
      body = await req.json();
    }
    const expense = await createExpense(ExpenseInput.parse(body));
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
