import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicApiKey } from "@/lib/public-auth";
import { checkRateLimit } from "@/lib/rate-limit";

// Public product catalog for the website's storefront: each product with
// its available sizes, per-size SKU and stock. No cost price exposed.
export async function GET(req: NextRequest) {
  const err = await checkPublicApiKey(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  const rateErr = await checkRateLimit(req.headers.get("x-api-key") || "legacy");
  if (rateErr) return NextResponse.json({ error: rateErr }, { status: 429 });

  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      color: true,
      sellPrice: true,
      variants: {
        where: { active: true },
        select: { size: true, sku: true, stock: true },
        orderBy: { size: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const withAvailability = products.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({ ...v, inStock: v.stock > 0 })),
  }));

  return NextResponse.json({ products: withAvailability });
}
