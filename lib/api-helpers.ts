import { NextResponse } from "next/server";
import { bdDayRangeFromDateString } from "@/lib/bd-time";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function withErrorHandling<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return NextResponse.json(data);
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") return jsonError("Login required", 401);
    if (err?.message === "FORBIDDEN") return jsonError("Admin only", 403);
    console.error(err);
    return jsonError(err?.message || "Something went wrong", 400);
  }
}

export function genInvoiceNo(prefix: string) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${stamp}-${rand}`;
}

export function oneYearLater(date: Date) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

// Turns "from"/"to" query params (plain "YYYY-MM-DD" strings from a date
// picker) into a Prisma date-range filter, treating them as Bangladesh
// calendar days rather than UTC ones — see lib/bd-time.ts for why that
// distinction matters on a UTC-hosted server.
export function dateRangeFilter(from: string | null, to: string | null) {
  return {
    gte: from ? bdDayRangeFromDateString(from).start : undefined,
    lte: to ? bdDayRangeFromDateString(to).end : undefined,
  };
}
