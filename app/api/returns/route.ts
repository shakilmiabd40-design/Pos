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
  const category = req.nextUrl.searchParams.get("category");

  const returns = await prisma.return.findMany({
    where: {
      date: dateRangeFilter(from, to),
      saleItem: category ? { variant: { product: { category: { equals: category, mode: "insensitive" } } } } : undefined,
    },
    include: { saleItem: { include: { variant: { include: { product: true } } } }, sale: true, createdBy: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(returns);
}

// body: { saleItemId, qty, reason, refundAmount, restock }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const body = await req.json();
  const { saleItemId, qty, reason, refundAmount, restock } = body;

  const saleItem = await prisma.saleItem.findUnique({
    where: { id: saleItemId },
    include: { returns: true, variant: true },
  });
  if (!saleItem) return jsonError("Sale item not found");

  const alreadyReturned = saleItem.returns.reduce((sum, r) => sum + r.qty, 0);
  const remaining = saleItem.qty - alreadyReturned;
  const returnQty = Number(qty);

  if (returnQty <= 0) return jsonError("Return quantity must be greater than 0");
  if (returnQty > remaining) return jsonError(`Only ${remaining} unit(s) can still be returned for this item`);

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.return.create({
      data: {
        saleId: saleItem.saleId,
        saleItemId,
        qty: returnQty,
        reason: reason || null,
        refundAmount: Math.max(0, Number(refundAmount) || 0),
        restocked: Boolean(restock),
        createdById: session.userId,
      },
    });

    if (restock) {
      await tx.productVariant.update({ where: { id: saleItem.variantId }, data: { stock: { increment: returnQty } } });
    }

    return ret;
  });

  await logActivity(session, "CREATE", "Return", created.id, `qty ${returnQty}, refund ৳${created.refundAmount}`);

  return NextResponse.json(created, { status: 201 });
}
