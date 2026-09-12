import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Record a payment against an existing sale's due balance.
// body: { amount, method }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { amount, method } = await req.json();
  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return jsonError("Enter a valid payment amount");

  const sale = await prisma.sale.findUnique({ where: { id: params.id } });
  if (!sale) return jsonError("Sale not found", 404);
  if (["RETURNED", "REFUSED"].includes(sale.codStatus)) {
    return jsonError("This order was returned/refused and cancelled — no payment can be recorded against it.");
  }

  const due = sale.totalAmount - sale.amountPaid;
  if (payAmount > due + 0.01) {
    return jsonError(`This sale only has ৳${due.toLocaleString()} due — can't record more than that`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: { saleId: sale.id, amount: payAmount, method: method || "cash", createdById: session.userId },
    });
    return tx.sale.update({
      where: { id: sale.id },
      data: { amountPaid: { increment: payAmount } },
    });
  });

  await logActivity(session, "PAYMENT", "Sale", sale.id, `৳${payAmount} received against invoice ${sale.invoiceNo}`);

  return NextResponse.json({ ...updated, due: Math.max(0, updated.totalAmount - updated.amountPaid) });
}
