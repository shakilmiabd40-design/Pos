import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const { supplierId, invoiceNo, note, date } = await req.json();
  const purchase = await prisma.purchase.update({
    where: { id: params.id },
    data: {
      supplierId: supplierId || undefined,
      invoiceNo: invoiceNo ?? undefined,
      note: note ?? undefined,
      date: date ? new Date(date) : undefined,
    },
  });
  await logActivity(session, "UPDATE", "Purchase", params.id);
  return NextResponse.json(purchase);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const purchase = await prisma.purchase.findUnique({ where: { id: params.id }, include: { items: true } });
  if (!purchase) return jsonError("Purchase not found", 404);

  await prisma.$transaction(async (tx) => {
    for (const it of purchase.items) {
      await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { decrement: it.qty } } });
    }
    await tx.purchase.delete({ where: { id: params.id } });
  });

  await logActivity(session, "DELETE", "Purchase", params.id, purchase.invoiceNo || undefined);

  return NextResponse.json({ ok: true, note: "Stock reversed for deleted purchase" });
}
