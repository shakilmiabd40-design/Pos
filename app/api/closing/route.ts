import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { computeExpectedCash } from "@/lib/cash-closing";
import { bdDayRangeFromDateString } from "@/lib/bd-time";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const closings = await prisma.dayClosing.findMany({
    include: { closedBy: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(closings);
}

// body: { date, openingCash, actualCash, notes }
// expectedCash is always recomputed server-side, never trusted from the client.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { date, openingCash, actualCash, notes } = await req.json();
  if (!date) return jsonError("Date is required");

  // `date` is a "YYYY-MM-DD" string from a date picker — treat it as a
  // Bangladesh calendar day, not a UTC one (the server may run in UTC).
  const { start: day } = bdDayRangeFromDateString(date);

  const opening = Number(openingCash) || 0;
  const actual = Number(actualCash) || 0;
  const { cashIn, cashOut } = await computeExpectedCash(day);
  const expectedCash = opening + cashIn - cashOut;
  const difference = actual - expectedCash;

  const closing = await prisma.dayClosing.upsert({
    where: { date: day },
    create: {
      date: day,
      openingCash: opening,
      expectedCash,
      actualCash: actual,
      difference,
      notes: notes || null,
      closedById: session.userId,
    },
    update: {
      openingCash: opening,
      expectedCash,
      actualCash: actual,
      difference,
      notes: notes || null,
      closedById: session.userId,
    },
  });

  await logActivity(session, "CLOSE_DAY", "DayClosing", closing.id, `${day.toDateString()} — diff ৳${difference.toFixed(2)}`);

  return NextResponse.json(closing, { status: 201 });
}
