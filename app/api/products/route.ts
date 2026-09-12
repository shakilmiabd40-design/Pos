import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { resolveCategory } from "@/lib/normalize-category";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const q = req.nextUrl.searchParams.get("q") || "";
  const category = req.nextUrl.searchParams.get("category");
  const products = await prisma.product.findMany({
    where: {
      category: category ? { equals: category, mode: "insensitive" } : undefined,
      OR: q
        ? [
            { name: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
            { variants: { some: { barcode: { contains: q, mode: "insensitive" } } } },
          ]
        : undefined,
    },
    include: { variants: { orderBy: { size: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(products);
}

// body: {
//   name, brand, category, color, costPrice, sellPrice,
//   variants: [{ size, sku, stock, reorderAt }, ...]   // up to 8+ sizes at once
// }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const body = await req.json();
  const { name, brand, category, color, costPrice, sellPrice, imageUrl, variants } = body;

  if (!name) return jsonError("Product name is required");
  if (costPrice !== undefined && Number(costPrice) < 0) return jsonError("Cost price can't be negative");
  if (sellPrice !== undefined && Number(sellPrice) < 0) return jsonError("Sell price can't be negative");
  const cleanVariants = (variants || []).filter((v: any) => v.size && v.sku);
  if (cleanVariants.length === 0) return jsonError("Add at least one size with a SKU");

  const skus = cleanVariants.map((v: any) => v.sku);
  const duplicateWithinSubmission = skus.filter((s: string, i: number) => skus.indexOf(s) !== i);
  if (duplicateWithinSubmission.length > 0) {
    return jsonError(`Duplicate SKU in this form: ${[...new Set(duplicateWithinSubmission)].join(", ")}`);
  }

  const existing = await prisma.productVariant.findMany({ where: { sku: { in: skus } } });
  if (existing.length > 0) {
    return jsonError(`SKU already in use: ${existing.map((e) => e.sku).join(", ")}`);
  }

  const resolvedCategory = await resolveCategory(category);

  try {
    const product = await prisma.product.create({
      data: {
        name,
        brand: brand || null,
        category: resolvedCategory,
        color: color || null,
        costPrice: Number(costPrice) || 0,
        sellPrice: Number(sellPrice) || 0,
        imageUrl: imageUrl || null,
        variants: {
          create: cleanVariants.map((v: any) => ({
            size: String(v.size),
            sku: v.sku,
            barcode: v.barcode ? String(v.barcode) : null,
            stock: Number(v.stock) || 0,
            reorderAt: Number(v.reorderAt) || 3,
          })),
        },
      },
      include: { variants: true },
    });

    await logActivity(session, "CREATE", "Product", product.id, `${name} (${cleanVariants.length} size${cleanVariants.length > 1 ? "s" : ""})`);

    return NextResponse.json(product, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return jsonError("One of these SKUs is already in use");
    return jsonError(e?.message || "Could not create product");
  }
}
