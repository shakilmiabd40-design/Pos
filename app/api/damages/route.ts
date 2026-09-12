import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError, dateRangeFilter } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const category = req.nextUrl.searchParams.get("category");

  const damages = await prisma.damage.findMany({
    where: {
      date: dateRangeFilter(from, to),
      variant: category ? { product: { category: { equals: category, mode: "insensitive" } } } : undefined,
    },
    include: { variant: { include: { product: true } }, createdBy: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(damages);
}

// body: { variantId, qty, reason }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { variantId, qty, reason } = await req.json();
  const damageQty = Number(qty);
  if (!variantId || damageQty <= 0) return jsonError("Product size and a positive quantity are required");

  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant) return jsonError("Product size not found");
  if (variant.stock < damageQty) return jsonError(`Only ${variant.stock} unit(s) in stock for this size`);

  const damage = await prisma.$transaction(async (tx) => {
    const created = await tx.damage.create({
      data: { variantId, qty: damageQty, reason: reason || null, createdById: session.userId },
    });
    await tx.productVariant.update({ where: { id: variantId }, data: { stock: { decrement: damageQty } } });
    return created;
  });

  await logActivity(session, "CREATE", "Damage", damage.id, `${variant.product.name} (${variant.size}) x${damageQty}`);

  return NextResponse.json(damage, { status: 201 });
}
