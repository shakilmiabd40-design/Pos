import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { computeExpectedCash } from "@/lib/cash-closing";
import { bdDayRangeFromDateString } from "@/lib/bd-time";

// GET /api/closing/preview?date=YYYY-MM-DD
// Shows the cash breakdown for a day before it's actually closed, and
// suggests an opening balance from the previous day's closing.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam) return jsonError("date query param is required");

  // Must resolve to the exact same instant as the POST route's `day`, since
  // that instant is used as the DayClosing.date unique lookup key.
  const { start: day } = bdDayRangeFromDateString(dateParam);

  const [{ cashIn, cashOut }, previousClosing, existingClosing] = await Promise.all([
    computeExpectedCash(day),
    prisma.dayClosing.findFirst({ where: { date: { lt: day } }, orderBy: { date: "desc" } }),
    prisma.dayClosing.findUnique({ where: { date: day } }),
  ]);

  const suggestedOpening = previousClosing?.actualCash ?? 0;

  return NextResponse.json({
    cashIn,
    cashOut,
    suggestedOpening,
    existingClosing,
  });
}
