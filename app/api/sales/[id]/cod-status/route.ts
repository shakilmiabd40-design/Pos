import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Moves a COD/delivery order through its lifecycle:
//   PENDING → SHIPPED — handed to the courier, in transit. Just a status
//               marker, no stock/payment side effects.
//   → DELIVERED — courier handed it over and collected the cash (including
//               the delivery charge, which is already counted as revenue
//               on this sale). But the courier company deducts their own
//               fee for making the delivery — a real cost separate from
//               that revenue. Pass courierCharge (what the courier
//               actually charged/deducted) and, if greater than 0, it's
//               booked as a "Courier charge" expense. Omit it (or pass 0)
//               and nothing is booked — the old default, for shops that
//               don't track this.
//   → RETURNED / REFUSED — the product comes back either way (stock is
//               restored). What differs is the money: pass actualReturnCost
//               (what the return actually cost — courier's return fee, or
//               what was actually collected/paid) and it's compared against
//               this order's original deliveryCharge:
//                 deliveryCharge - actualReturnCost > 0  → booked as a loss
//                 deliveryCharge - actualReturnCost < 0  → booked as a gain
//               as a "Courier loss" expense (signed — a gain is a negative
//               expense, which nets out correctly in P&L). If
//               actualReturnCost is omitted, it defaults to 0 for REFUSED
//               (nothing at all was collected — the old default) and to the
//               full deliveryCharge for RETURNED (already collected before
//               the return — no loss, the old default).
// DELIVERED/RETURNED/REFUSED are final — to correct a mistake, delete the
// sale entirely and re-enter it, the same as any other sale correction.
//
// body: { status: "SHIPPED" | "DELIVERED" | "RETURNED" | "REFUSED", actualReturnCost?, courierCharge? }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { status, actualReturnCost, courierCharge } = await req.json();
  if (!["SHIPPED", "DELIVERED", "RETURNED", "REFUSED"].includes(status)) {
    return jsonError("Status must be SHIPPED, DELIVERED, RETURNED, or REFUSED");
  }

  const sale = await prisma.sale.findUnique({ where: { id: params.id }, include: { items: true } });
  if (!sale) return jsonError("Sale not found", 404);

  if (status === "SHIPPED") {
    if (sale.codStatus !== "PENDING") {
      return jsonError(`Can't mark shipped — this order is already ${sale.codStatus.toLowerCase()}.`);
    }
    const updated = await prisma.sale.update({ where: { id: sale.id }, data: { codStatus: "SHIPPED" } });
    await logActivity(session, "COD_STATUS", "Sale", sale.id, `Invoice ${sale.invoiceNo} → SHIPPED`);
    return NextResponse.json(updated);
  }

  // DELIVERED / RETURNED / REFUSED are final outcomes — only reachable
  // while the order is still in flight (pending or shipped).
  if (!["PENDING", "SHIPPED"].includes(sale.codStatus)) {
    return jsonError(`This order is already marked ${sale.codStatus.toLowerCase()} and can't be changed here.`);
  }

  if (status === "DELIVERED") {
    const courierChargeAmount = Math.max(0, Number(courierCharge) || 0);

    const updated = await prisma.$transaction(async (tx) => {
      const stillDue = Math.max(0, sale.totalAmount - sale.amountPaid);
      if (stillDue > 0) {
        await tx.payment.create({
          data: { saleId: sale.id, amount: stillDue, method: "cod", createdById: session.userId },
        });
      }
      if (courierChargeAmount > 0) {
        await tx.expense.create({
          data: {
            category: "Courier charge",
            amount: courierChargeAmount,
            method: "cash",
            note: `COD delivered — invoice ${sale.invoiceNo}: courier charged ৳${courierChargeAmount} for delivery (customer was charged ৳${sale.deliveryCharge})`,
            createdById: session.userId,
          },
        });
      }
      return tx.sale.update({ where: { id: sale.id }, data: { codStatus: "DELIVERED", amountPaid: sale.totalAmount } });
    });

    await logActivity(
      session,
      "COD_STATUS",
      "Sale",
      sale.id,
      `Invoice ${sale.invoiceNo} → DELIVERED${courierChargeAmount > 0 ? ` (৳${courierChargeAmount} courier charge booked)` : ""}`
    );
    return NextResponse.json(updated);
  }

  // Was an actual return cost given? Falls back to the historical default
  // per status if not (see comment above).
  const hasProvidedCost =
    actualReturnCost !== undefined && actualReturnCost !== null && actualReturnCost !== "" && !isNaN(Number(actualReturnCost));
  const defaultCost = status === "REFUSED" ? 0 : sale.deliveryCharge;
  const actualCost = hasProvidedCost ? Math.max(0, Number(actualReturnCost)) : defaultCost;
  // Positive = the return cost less than what was charged for delivery → loss.
  // Negative = it cost more / more came back than expected → gain.
  const diff = sale.deliveryCharge - actualCost;

  const updated = await prisma.$transaction(async (tx) => {
    // RETURNED and REFUSED both bring the stock back and both may book a
    // loss/gain from the delivery-charge vs. actual-return-cost difference.
    for (const it of sale.items) {
      await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.qty } } });
    }

    if (status === "RETURNED") {
      const stillDue = Math.max(0, sale.totalAmount - sale.amountPaid);
      if (stillDue > 0) {
        await tx.payment.create({
          data: { saleId: sale.id, amount: stillDue, method: "cod", createdById: session.userId },
        });
      }
    }

    if (diff !== 0) {
      await tx.expense.create({
        data: {
          category: "Courier loss",
          amount: diff,
          method: "cash",
          note: `COD ${status.toLowerCase()} — invoice ${sale.invoiceNo}: charged ৳${sale.deliveryCharge} delivery, actual return cost ৳${actualCost} (${
            diff > 0 ? "loss" : "gain"
          } ৳${Math.abs(diff)})`,
          createdById: session.userId,
        },
      });
    }

    return tx.sale.update({
      where: { id: sale.id },
      data: status === "RETURNED" ? { codStatus: status, amountPaid: sale.totalAmount } : { codStatus: status },
    });
  });

  await logActivity(
    session,
    "COD_STATUS",
    "Sale",
    sale.id,
    `Invoice ${sale.invoiceNo} → ${status}${diff !== 0 ? ` (৳${Math.abs(diff)} courier ${diff > 0 ? "loss" : "gain"} booked)` : ""}`
  );

  return NextResponse.json(updated);
}
