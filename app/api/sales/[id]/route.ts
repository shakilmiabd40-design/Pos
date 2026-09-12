import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { variant: { include: { product: true } }, warranty: true, returns: true } },
      returns: true,
      payments: { orderBy: { date: "asc" } },
      customer: true,
      createdBy: true,
    },
  });
  if (!sale) return jsonError("Sale not found", 404);
  return NextResponse.json({
    ...sale,
    due: ["RETURNED", "REFUSED"].includes(sale.codStatus) ? 0 : Math.max(0, sale.totalAmount - sale.amountPaid),
  });
}

// Edits header fields only — customer info, payment method, discount, and
// delivery charge. Line items aren't editable here (that would require
// re-touching stock and warranties); delete and re-enter the sale for
// item-level corrections.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { customerName, customerPhone, paymentMethod, discount, deliveryCharge } = await req.json();

  const sale = await prisma.sale.findUnique({ where: { id: params.id }, include: { items: true } });
  if (!sale) return jsonError("Sale not found", 404);

  const subtotal = sale.items.reduce((sum, it) => sum + it.subtotal, 0);
  const newDiscount = discount !== undefined ? Math.max(0, Number(discount) || 0) : sale.discount;
  const newDeliveryCharge = deliveryCharge !== undefined ? Math.max(0, Number(deliveryCharge) || 0) : sale.deliveryCharge;
  const totalAmount = Math.max(0, subtotal - newDiscount) + newDeliveryCharge;

  const updated = await prisma.sale.update({
    where: { id: params.id },
    data: {
      customerName: customerName !== undefined ? customerName || null : undefined,
      customerPhone: customerPhone !== undefined ? customerPhone || null : undefined,
      paymentMethod: paymentMethod || undefined,
      discount: newDiscount,
      deliveryCharge: newDeliveryCharge,
      totalAmount,
    },
  });

  await logActivity(session, "UPDATE", "Sale", params.id, `Invoice ${sale.invoiceNo}`);

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: { items: true, returns: true },
  });
  if (!sale) return jsonError("Sale not found", 404);
  if (sale.returns.length > 0) {
    return jsonError("This sale has returns recorded against it. Delete those returns first.");
  }

  await prisma.$transaction(async (tx) => {
    // If this was a COD order already marked RETURNED/REFUSED, stock was
    // already restored at that point — restocking again here would
    // double-count it.
    if (!["RETURNED", "REFUSED"].includes(sale.codStatus)) {
      for (const it of sale.items) {
        await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.qty } } });
      }
    }
    await tx.sale.delete({ where: { id: params.id } });
  });

  await logActivity(session, "DELETE", "Sale", params.id, `Invoice ${sale.invoiceNo}`);

  return NextResponse.json({ ok: true, note: "Stock restored for deleted sale" });
}
