import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicApiKey } from "@/lib/public-auth";
import { checkRateLimit } from "@/lib/rate-limit";

// Customer-facing warranty lookup: GET /api/public/warranty?invoice=INV-xxxx
// or ?phone=017xxxxxxxx to see warranty status on a website "check warranty" page.
export async function GET(req: NextRequest) {
  const err = await checkPublicApiKey(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  const rateErr = await checkRateLimit(req.headers.get("x-api-key") || "legacy");
  if (rateErr) return NextResponse.json({ error: rateErr }, { status: 429 });

  const invoice = req.nextUrl.searchParams.get("invoice");
  const phone = req.nextUrl.searchParams.get("phone");

  if (!invoice && !phone) {
    return NextResponse.json({ error: "Provide an invoice number or phone number" }, { status: 400 });
  }

  const sales = await prisma.sale.findMany({
    where: {
      invoiceNo: invoice || undefined,
      customerPhone: phone || undefined,
    },
    include: { items: { include: { variant: { include: { product: true } }, warranty: true } } },
  });

  const warranties = sales.flatMap((sale) =>
    sale.items.map((item) => ({
      invoiceNo: sale.invoiceNo,
      product: item.variant.product.name,
      size: item.variant.size,
      sku: item.variant.sku,
      saleDate: sale.date,
      warrantyStatus: item.warranty?.status,
      warrantyEndDate: item.warranty?.endDate,
    }))
  );

  return NextResponse.json({ warranties });
}
