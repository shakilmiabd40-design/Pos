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

  const purchases = await prisma.purchase.findMany({
    where: {
      date: dateRangeFilter(from, to),
      items: category ? { some: { variant: { product: { category: { equals: category, mode: "insensitive" } } } } } : undefined,
    },
    include: {
      supplier: true,
      items: { include: { variant: { include: { product: true } } } },
      payments: true,
      createdBy: true,
    },
    orderBy: { date: "desc" },
  });
  const withDue = purchases.map((p) => ({ ...p, due: Math.max(0, p.totalAmount - p.amountPaid) }));
  return NextResponse.json(withDue);
}

// body: { supplierId, invoiceNo, note, date, items: [{ variantId, qty, unitCost }] }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const body = await req.json();
  const { supplierId, invoiceNo, note, date, items, paidAmount } = body;

  if (!supplierId) return jsonError("Supplier is required");
  if (!Array.isArray(items) || items.length === 0) return jsonError("Add at least one item");

  for (const it of items) {
    if (!it.variantId) return jsonError("Every line needs a product size");
    if (!(Number(it.qty) > 0)) return jsonError("Quantity must be greater than 0 for every line");
    if (Number(it.unitCost) < 0) return jsonError("Unit cost can't be negative");
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return jsonError("Supplier not found");

  const variantIds = items.map((it: any) => it.variantId);
  const foundVariants = await prisma.productVariant.findMany({ where: { id: { in: variantIds } } });
  if (foundVariants.length !== new Set(variantIds).size) {
    return jsonError("One of the selected sizes could not be found");
  }

  const totalAmount = items.reduce((sum: number, it: any) => sum + Number(it.qty) * Number(it.unitCost), 0);
  const initialPaid = Math.min(Math.max(0, Number(paidAmount) || 0), totalAmount);

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          supplierId,
          invoiceNo: invoiceNo || null,
          note: note || null,
          date: date ? new Date(date) : new Date(),
          totalAmount,
          amountPaid: initialPaid,
          createdById: session.userId,
          items: {
            create: items.map((it: any) => ({
              variantId: it.variantId,
              qty: Number(it.qty),
              unitCost: Number(it.unitCost),
            })),
          },
        },
        include: { items: true },
      });

      if (initialPaid > 0) {
        await tx.supplierPayment.create({
          data: { purchaseId: created.id, amount: initialPaid, method: "cash", createdById: session.userId },
        });
      }

      for (const it of items) {
        await tx.productVariant.update({
          where: { id: it.variantId },
          data: { stock: { increment: Number(it.qty) } },
        });
      }

      return created;
    });

    await logActivity(session, "CREATE", "Purchase", purchase.id, `৳${totalAmount} from supplier ${supplierId}`);

    return NextResponse.json(purchase, { status: 201 });
  } catch (e: any) {
    return jsonError(e?.message || "Could not record purchase");
  }
}
