import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { getConfig } from "./config";

// Returns a 401 response when API_TOKEN is set and the request does not carry it.
export function requireToken(req: Request): NextResponse | null {
  const token = getConfig().API_TOKEN;
  if (!token) return null;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${token}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "invalid_request", issues: err.issues }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err.code === "P2002") return NextResponse.json({ error: "conflict" }, { status: 409 });
  }
  console.error(err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
