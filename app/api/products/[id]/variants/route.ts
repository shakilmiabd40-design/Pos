import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Add one more size to an existing product.
// body: { size, sku, stock, reorderAt }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { size, sku, barcode, stock, reorderAt } = await req.json();
  if (!size || !sku) return jsonError("Size and SKU are required");
  if (stock !== undefined && Number(stock) < 0) return jsonError("Stock can't be negative");
  if (reorderAt !== undefined && Number(reorderAt) < 0) return jsonError("Reorder level can't be negative");

  const existing = await prisma.productVariant.findUnique({ where: { sku } });
  if (existing) return jsonError("SKU already in use");

  if (barcode) {
    const existingBarcode = await prisma.productVariant.findUnique({ where: { barcode } });
    if (existingBarcode) return jsonError("Barcode already in use by another size");
  }

  try {
    const variant = await prisma.productVariant.create({
      data: {
        productId: params.id,
        size: String(size),
        sku,
        barcode: barcode ? String(barcode) : null,
        stock: Number(stock) || 0,
        reorderAt: Number(reorderAt) || 3,
      },
    });
    await logActivity(session, "CREATE", "ProductVariant", variant.id, `size ${size} (${sku})`);
    return NextResponse.json(variant, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return jsonError("This size already exists for this product");
    return jsonError(e?.message || "Could not add size");
  }
}
