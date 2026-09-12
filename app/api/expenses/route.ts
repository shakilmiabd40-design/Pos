import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError, dateRangeFilter } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const expenses = await prisma.expense.findMany({
    where: { date: dateRangeFilter(from, to) },
    include: { createdBy: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(expenses);
}

// body: { category, amount, method, note, date }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { category, amount, method, note, date } = await req.json();
  const value = Number(amount);
  if (!category || !value || value <= 0) return jsonError("Category and a positive amount are required");

  const expense = await prisma.expense.create({
    data: {
      category,
      amount: value,
      method: method || "cash",
      note: note || null,
      date: date ? new Date(date) : new Date(),
      createdById: session.userId,
    },
  });

  await logActivity(session, "CREATE", "Expense", expense.id, `${category} ৳${value}`);
  return NextResponse.json(expense, { status: 201 });
}
