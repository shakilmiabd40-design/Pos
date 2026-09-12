import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError, genInvoiceNo, oneYearLater, dateRangeFilter } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { computeItemsSubtotal, scaleSplitPayments } from "@/lib/sale-math";
import { bdDateString, bdDateWithCurrentTime } from "@/lib/bd-time";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const dueOnly = req.nextUrl.searchParams.get("dueOnly");
  const category = req.nextUrl.searchParams.get("category");

  const sales = await prisma.sale.findMany({
    where: {
      date: dateRangeFilter(from, to),
      items: category ? { some: { variant: { product: { category: { equals: category, mode: "insensitive" } } } } } : undefined,
    },
    include: {
      items: { include: { variant: { include: { product: true } }, warranty: true, returns: true } },
      payments: true,
      customer: true,
      createdBy: true,
    },
    orderBy: { date: "desc" },
  });

  const withDue = sales.map((s) => ({
    ...s,
    due: ["RETURNED", "REFUSED"].includes(s.codStatus) ? 0 : Math.max(0, s.totalAmount - s.amountPaid),
  }));
  const result = dueOnly === "1" ? withDue.filter((s) => s.due > 0) : withDue;

  return NextResponse.json(result);
}

// body: {
//   customerName, customerPhone, paymentMethod, discount, items: [{ variantId, qty, unitPrice, discount }],
//   paidAmount,      // how much the customer is paying right now; defaults to the full total (no due)
//   payments,        // optional: [{ method, amount }, ...] to split the payment received now across
//                     // multiple methods (e.g. part cash, part bKash). If given, this replaces
//                     // paymentMethod/paidAmount for how the initial payment is recorded.
//   isCod,           // true = manually recorded COD/pending-delivery order (e.g. phone order arranged
//                     // before wiring up the website API) — starts unpaid with codStatus PENDING,
//                     // manage it from the Sales page exactly like a website COD order
//   deliveryCharge,  // courier cost, relevant when isCod is true
// }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const body = await req.json();
  const { customerName, customerPhone, paymentMethod, discount, items, paidAmount, payments, deliveryCharge, isCod, saleDate: saleDateStr } = body;

  if (!Array.isArray(items) || items.length === 0) return jsonError("Add at least one item to the sale");

  if (saleDateStr && saleDateStr > bdDateString()) {
    return jsonError("Sale date can't be in the future");
  }

  const variantIds = items.map((it: any) => it.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  for (const it of items) {
    if (!(Number(it.qty) > 0)) return jsonError("Every item must have a quantity greater than 0");
    if (Number(it.unitPrice) < 0) return jsonError("Unit price can't be negative");
    if (it.discount !== undefined && Number(it.discount) < 0) return jsonError("Item discount can't be negative");
    const variant = variantMap.get(it.variantId);
    if (!variant) return jsonError("Product size not found");
    if (variant.stock < Number(it.qty)) {
      return jsonError(
        `Not enough stock for ${variant.product.name} (size ${variant.size}) — have ${variant.stock}, need ${it.qty}`
      );
    }
  }

  // Split-payment rows, if provided — validated up front so a bad request
  // fails before anything is written.
  const splitPayments: { method: string; amount: number }[] = Array.isArray(payments)
    ? payments
        .map((p: any) => ({ method: String(p.method || "cash"), amount: Number(p.amount) || 0 }))
        .filter((p) => p.amount > 0)
    : [];

  const subtotal = computeItemsSubtotal(items.map((it: any) => ({ qty: Number(it.qty), unitPrice: Number(it.unitPrice), discount: Number(it.discount) || 0 })));
  const discountValue = Math.max(0, Number(discount) || 0);
  const deliveryChargeValue = Math.max(0, Number(deliveryCharge) || 0);
  // Delivery charge is charged to the customer, so it's part of the total
  // they owe — not just a side note for loss-tracking.
  const totalAmount = Math.max(0, subtotal - discountValue) + deliveryChargeValue;
  // A manual COD order collects nothing yet — it's pending until marked
  // Delivered (which auto-collects the cash) on the Sales page.
  const amountPaid = isCod
    ? 0
    : splitPayments.length > 0
    ? Math.min(splitPayments.reduce((s, p) => s + p.amount, 0), totalAmount)
    : paidAmount !== undefined
    ? Math.min(Math.max(Number(paidAmount) || 0, 0), totalAmount)
    : totalAmount;
  const saleDate = saleDateStr ? bdDateWithCurrentTime(saleDateStr) : new Date();
  const displayPaymentMethod = isCod
    ? "cod"
    : splitPayments.length > 1
    ? "split"
    : splitPayments.length === 1
    ? splitPayments[0].method
    : paymentMethod || "cash";

  const sale = await prisma.$transaction(async (tx) => {
    // Auto-create/find the customer profile by phone so history and dues
    // can be tracked, without staff having to manage a customer list by hand.
    let customerId: string | null = null;
    if (customerPhone) {
      const existingCustomer = await tx.customer.findUnique({ where: { phone: customerPhone } });
      if (existingCustomer) {
        customerId = existingCustomer.id;
        if (customerName && customerName !== existingCustomer.name) {
          await tx.customer.update({ where: { id: existingCustomer.id }, data: { name: customerName } });
        }
      } else {
        const created = await tx.customer.create({
          data: { name: customerName || customerPhone, phone: customerPhone },
        });
        customerId = created.id;
      }
    }

    const created = await tx.sale.create({
      data: {
        invoiceNo: genInvoiceNo("INV"),
        customerId,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        discount: discountValue,
        totalAmount,
        amountPaid,
        paymentMethod: displayPaymentMethod,
        source: "POS",
        deliveryCharge: deliveryChargeValue,
        codStatus: isCod ? "PENDING" : "DELIVERED",
        date: saleDate,
        createdById: session.userId,
      },
    });

    if (splitPayments.length > 0) {
      const scaled = scaleSplitPayments(splitPayments, amountPaid);
      for (const p of scaled) {
        await tx.payment.create({
          data: { saleId: created.id, amount: p.amount, method: p.method, date: saleDate, createdById: session.userId },
        });
      }
    } else if (amountPaid > 0) {
      await tx.payment.create({
        data: {
          saleId: created.id,
          amount: amountPaid,
          method: paymentMethod || "cash",
          date: saleDate,
          createdById: session.userId,
        },
      });
    }

    for (const it of items) {
      const qty = Number(it.qty);
      const unitPrice = Number(it.unitPrice);
      const lineDiscount = Math.max(0, Number(it.discount) || 0);
      const saleItem = await tx.saleItem.create({
        data: {
          saleId: created.id,
          variantId: it.variantId,
          qty,
          unitPrice,
          discount: lineDiscount,
          subtotal: Math.max(0, qty * unitPrice - lineDiscount),
        },
      });

      await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { decrement: qty } } });

      // Warranty auto-starts the moment the product is sold and runs 1 year.
      await tx.warranty.create({
        data: {
          saleItemId: saleItem.id,
          variantId: it.variantId,
          startDate: saleDate,
          endDate: oneYearLater(saleDate),
          status: "ACTIVE",
        },
      });
    }

    return tx.sale.findUnique({
      where: { id: created.id },
      include: { items: { include: { variant: { include: { product: true } }, warranty: true } }, payments: true },
    });
  });

  await logActivity(session, "CREATE", "Sale", sale?.id, `Invoice ${sale?.invoiceNo}, total ৳${totalAmount}`);

  return NextResponse.json(sale, { status: 201 });
}
