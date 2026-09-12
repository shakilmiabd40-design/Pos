import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

// Looks across products (name/brand/SKU/barcode), customers (name/phone),
// and sales (invoice number) at once — backs the top-bar search box.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ products: [], customers: [], sales: [] });

  const [products, customers, sales] = await Promise.all([
    prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
          { variants: { some: { barcode: { contains: q, mode: "insensitive" } } } },
        ],
      },
      take: 5,
      select: { id: true, name: true, brand: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.customer.findMany({
      where: {
        OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
      },
      take: 5,
      select: { id: true, name: true, phone: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.sale.findMany({
      where: { invoiceNo: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, invoiceNo: true, totalAmount: true },
      orderBy: { date: "desc" },
    }),
  ]);

  return NextResponse.json({ products, customers, sales });
}
