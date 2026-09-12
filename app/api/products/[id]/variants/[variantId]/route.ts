import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Edit a size's SKU / opening stock / reorder level.
// Note: stock here is a direct correction (stock-take), not a sale/purchase —
// use Purchases/Sales/Damage for normal stock movement so history stays accurate.
export async function PUT(req: NextRequest, { params }: { params: { variantId: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { size, sku, barcode, stock, reorderAt, active } = await req.json();
  if (stock !== undefined && Number(stock) < 0) return jsonError("Stock can't be negative");
  if (reorderAt !== undefined && Number(reorderAt) < 0) return jsonError("Reorder level can't be negative");
  try {
    const variant = await prisma.productVariant.update({
      where: { id: params.variantId },
      data: {
        size: size !== undefined ? String(size) : undefined,
        sku: sku || undefined,
        barcode: barcode !== undefined ? (barcode ? String(barcode) : null) : undefined,
        stock: stock !== undefined ? Number(stock) : undefined,
        reorderAt: reorderAt !== undefined ? Number(reorderAt) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
    });
    await logActivity(session, "UPDATE", "ProductVariant", variant.id, `size ${variant.size} (${variant.sku})`);
    return NextResponse.json(variant);
  } catch (e: any) {
    if (e?.code === "P2002") return jsonError("That size or SKU already exists for this product");
    return jsonError(e?.message || "Update failed");
  }
}

// Remove a size. If it has purchase/sale/damage history it's deactivated instead.
export async function DELETE(_req: NextRequest, { params }: { params: { variantId: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const existing = await prisma.productVariant.findUnique({ where: { id: params.variantId } });
  if (!existing) return jsonError("Size not found", 404);

  const [purchaseCount, saleCount, damageCount] = await Promise.all([
    prisma.purchaseItem.count({ where: { variantId: params.variantId } }),
    prisma.saleItem.count({ where: { variantId: params.variantId } }),
    prisma.damage.count({ where: { variantId: params.variantId } }),
  ]);

  if (purchaseCount > 0 || saleCount > 0 || damageCount > 0) {
    const variant = await prisma.productVariant.update({ where: { id: params.variantId }, data: { active: false } });
    await logActivity(session, "DEACTIVATE", "ProductVariant", params.variantId, `size ${variant.size} (has history)`);
    return NextResponse.json({ ok: true, softDeleted: true });
  }

  await prisma.productVariant.delete({ where: { id: params.variantId } });
  await logActivity(session, "DELETE", "ProductVariant", params.variantId, `size ${existing.size}`);
  return NextResponse.json({ ok: true });
}
