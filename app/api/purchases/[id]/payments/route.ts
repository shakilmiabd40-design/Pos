import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Record a payment against an existing purchase's due balance to a supplier.
// body: { amount, method }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { amount, method } = await req.json();
  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return jsonError("Enter a valid payment amount");

  const purchase = await prisma.purchase.findUnique({ where: { id: params.id } });
  if (!purchase) return jsonError("Purchase not found", 404);

  const due = purchase.totalAmount - purchase.amountPaid;
  if (payAmount > due + 0.01) {
    return jsonError(`This purchase only has ৳${due.toLocaleString()} due — can't record more than that`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.supplierPayment.create({
      data: { purchaseId: purchase.id, amount: payAmount, method: method || "cash", createdById: session.userId },
    });
    return tx.purchase.update({
      where: { id: purchase.id },
      data: { amountPaid: { increment: payAmount } },
    });
  });

  await logActivity(session, "PAYMENT", "Purchase", purchase.id, `৳${payAmount} paid against purchase ${purchase.invoiceNo || purchase.id}`);

  return NextResponse.json({ ...updated, due: Math.max(0, updated.totalAmount - updated.amountPaid) });
}
