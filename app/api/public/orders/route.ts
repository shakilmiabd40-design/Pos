import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicApiKey } from "@/lib/public-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { genInvoiceNo, oneYearLater } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Called by your website's checkout flow to turn a web order into a Sale.
// body: {
//   customerName, customerPhone, paymentMethod, deliveryCharge,
//   items: [{ sku, qty }]   // sku identifies the exact product+size (from the public catalog)
// }
// Set paymentMethod: "cod" for cash-on-delivery orders — these start with
// nothing collected yet (amountPaid: 0) and a PENDING delivery status. Any
// other paymentMethod (card/bkash/nagad/online) is assumed already charged
// via a payment gateway before this endpoint is called.
export async function POST(req: NextRequest) {
  const err = await checkPublicApiKey(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  const rateErr = await checkRateLimit(req.headers.get("x-api-key") || "legacy");
  if (rateErr) return NextResponse.json({ error: rateErr }, { status: 429 });

  const body = await req.json();
  const { customerName, customerPhone, paymentMethod, deliveryCharge, items } = body;
  const isCod = String(paymentMethod || "").toLowerCase() === "cod";

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Order must have at least one item" }, { status: 400 });
  }

  const skus = items.map((it: any) => it.sku);
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, active: true },
    include: { product: true },
  });
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));

  for (const it of items) {
    const variant = variantBySku.get(it.sku);
    if (!variant) return NextResponse.json({ error: `Unknown SKU: ${it.sku}` }, { status: 400 });
    if (!(Number(it.qty) > 0)) {
      return NextResponse.json({ error: `Quantity must be greater than 0 for ${it.sku}` }, { status: 400 });
    }
    if (variant.stock < Number(it.qty)) {
      return NextResponse.json(
        { error: `Not enough stock for ${variant.product.name} size ${variant.size} (have ${variant.stock}, need ${it.qty})` },
        { status: 400 }
      );
    }
  }

  const saleDate = new Date();
  const deliveryChargeValue = Math.max(0, Number(deliveryCharge) || 0);
  const itemsTotal = items.reduce((sum: number, it: any) => {
    const variant = variantBySku.get(it.sku)!;
    return sum + variant.product.sellPrice * Number(it.qty);
  }, 0);
  // Delivery charge is charged to the customer, so it's part of the total
  // they owe — not just a side note for loss-tracking.
  const totalAmount = itemsTotal + deliveryChargeValue;

  const sale = await prisma.$transaction(async (tx) => {
    let customerId: string | null = null;
    if (customerPhone) {
      const existingCustomer = await tx.customer.findUnique({ where: { phone: customerPhone } });
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const created = await tx.customer.create({
          data: { name: customerName || customerPhone, phone: customerPhone },
        });
        customerId = created.id;
      }
    }

    const created = await tx.sale.create({
      data: {
        invoiceNo: genInvoiceNo("WEB"),
        customerId,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        totalAmount,
        // COD orders collect nothing until the courier hands over the
        // parcel — non-COD orders are assumed already paid via a gateway.
        amountPaid: isCod ? 0 : totalAmount,
        paymentMethod: paymentMethod || "online",
        deliveryCharge: deliveryChargeValue,
        codStatus: "PENDING",
        source: "WEBSITE",
        date: saleDate,
      },
    });

    if (!isCod && totalAmount > 0) {
      await tx.payment.create({
        data: { saleId: created.id, amount: totalAmount, method: paymentMethod || "online", date: saleDate },
      });
    }

    for (const it of items) {
      const variant = variantBySku.get(it.sku)!;
      const qty = Number(it.qty);
      const saleItem = await tx.saleItem.create({
        data: {
          saleId: created.id,
          variantId: variant.id,
          qty,
          unitPrice: variant.product.sellPrice,
          subtotal: variant.product.sellPrice * qty,
        },
      });
      await tx.productVariant.update({ where: { id: variant.id }, data: { stock: { decrement: qty } } });
      await tx.warranty.create({
        data: {
          saleItemId: saleItem.id,
          variantId: variant.id,
          startDate: saleDate,
          endDate: oneYearLater(saleDate),
          status: "ACTIVE",
        },
      });
    }

    return tx.sale.findUnique({ where: { id: created.id }, include: { items: true } });
  });

  await logActivity(null, "CREATE", "Sale", sale?.id, `Website order, invoice ${sale?.invoiceNo}, total ৳${totalAmount}`);

  return NextResponse.json({ ok: true, invoiceNo: sale?.invoiceNo, saleId: sale?.id }, { status: 201 });
}
