import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

// Closing in-hand stock report: current stock per product+size, plus stock
// value at cost price and at sell price. Optional ?category= filter.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const category = req.nextUrl.searchParams.get("category");

  const variants = await prisma.productVariant.findMany({
    where: {
      active: true,
      product: { active: true, category: category ? { equals: category, mode: "insensitive" } : undefined },
    },
    include: { product: true },
    orderBy: [{ product: { name: "asc" } }, { size: "asc" }],
  });

  const rows = variants.map((v) => ({
    id: v.id,
    name: v.product.name,
    sku: v.sku,
    size: v.size,
    category: v.product.category,
    stock: v.stock,
    lowStock: v.stock <= v.reorderAt,
    costValue: v.stock * v.product.costPrice,
    sellValue: v.stock * v.product.sellPrice,
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      units: acc.units + r.stock,
      costValue: acc.costValue + r.costValue,
      sellValue: acc.sellValue + r.sellValue,
    }),
    { units: 0, costValue: 0, sellValue: 0 }
  );

  const allCategories = await prisma.product.findMany({
    where: { active: true, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
  });

  return NextResponse.json({ rows, totals, categories: allCategories.map((c) => c.category).filter(Boolean) });
}
