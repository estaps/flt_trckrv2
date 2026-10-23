import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse, requireToken } from "@/lib/api";
import { updateExpense } from "@/lib/expenses";
import { ExpensePatch } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json(await prisma.expense.findUniqueOrThrow({ where: { id } }));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return NextResponse.json(await updateExpense(id, ExpensePatch.parse(await req.json())));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await prisma.expense.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
