import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";
import { resolveCategory } from "@/lib/normalize-category";

// Updates the shared product fields only (name, brand, prices, etc).
// Sizes/stock are managed via /api/products/[id]/variants.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const body = await req.json();
  const { name, brand, category, color, costPrice, sellPrice, imageUrl, active } = body;

  if (name !== undefined && !String(name).trim()) return jsonError("Product name can't be empty");
  if (costPrice !== undefined && Number(costPrice) < 0) return jsonError("Cost price can't be negative");
  if (sellPrice !== undefined && Number(sellPrice) < 0) return jsonError("Sell price can't be negative");

  try {
    const resolvedCategory = category !== undefined ? await resolveCategory(category) : undefined;
    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        name,
        brand: brand || null,
        category: resolvedCategory,
        color: color || null,
        costPrice: costPrice !== undefined ? Number(costPrice) : undefined,
        sellPrice: sellPrice !== undefined ? Number(sellPrice) : undefined,
        imageUrl: imageUrl !== undefined ? imageUrl || null : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
      include: { variants: true },
    });
    await logActivity(session, "UPDATE", "Product", params.id, product.name);
    return NextResponse.json(product);
  } catch (e: any) {
    return jsonError(e?.message || "Update failed");
  }
}

// Deleting a product deactivates it (and its variants) if it has history,
// so past purchases/sales/damage records stay intact. We check for related
// records up front rather than attempting a hard delete and catching the
// failure — that way a normal "can't delete, has history" case never dumps
// a raw database constraint error into the server log.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const existing = await prisma.product.findUnique({ where: { id: params.id }, include: { variants: true } });
  if (!existing) return jsonError("Product not found", 404);

  const variantIds = existing.variants.map((v) => v.id);
  const [purchaseCount, saleCount, damageCount] = await Promise.all([
    prisma.purchaseItem.count({ where: { variantId: { in: variantIds } } }),
    prisma.saleItem.count({ where: { variantId: { in: variantIds } } }),
    prisma.damage.count({ where: { variantId: { in: variantIds } } }),
  ]);
  const hasHistory = purchaseCount > 0 || saleCount > 0 || damageCount > 0;

  if (hasHistory) {
    const [product] = await prisma.$transaction([
      prisma.product.update({ where: { id: params.id }, data: { active: false } }),
      prisma.productVariant.updateMany({ where: { productId: params.id }, data: { active: false } }),
    ]);
    await logActivity(session, "DEACTIVATE", "Product", params.id, `${product.name} (has purchase/sale/damage history)`);
    return NextResponse.json({ ok: true, softDeleted: true });
  }

  await prisma.product.delete({ where: { id: params.id } });
  await logActivity(session, "DELETE", "Product", params.id, existing.name);
  return NextResponse.json({ ok: true });
}
