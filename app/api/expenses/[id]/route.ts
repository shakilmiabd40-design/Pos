import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { category, amount, method, note, date } = await req.json();
  if (amount !== undefined && !(Number(amount) > 0)) {
    return jsonError("Amount must be greater than 0");
  }
  const expense = await prisma.expense.update({
    where: { id: params.id },
    data: {
      category: category || undefined,
      amount: amount !== undefined ? Number(amount) : undefined,
      method: method || undefined,
      note: note ?? undefined,
      date: date ? new Date(date) : undefined,
    },
  });
  await logActivity(session, "UPDATE", "Expense", params.id, `${expense.category} ৳${expense.amount}`);
  return NextResponse.json(expense);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const expense = await prisma.expense.findUnique({ where: { id: params.id } });
  await prisma.expense.delete({ where: { id: params.id } });
  await logActivity(session, "DELETE", "Expense", params.id, expense ? `${expense.category} ৳${expense.amount}` : undefined);
  return NextResponse.json({ ok: true });
}
