import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const damage = await prisma.damage.findUnique({ where: { id: params.id } });
  if (!damage) return jsonError("Damage record not found", 404);

  await prisma.$transaction(async (tx) => {
    await tx.productVariant.update({ where: { id: damage.variantId }, data: { stock: { increment: damage.qty } } });
    await tx.damage.delete({ where: { id: params.id } });
  });

  await logActivity(session, "DELETE", "Damage", params.id);

  return NextResponse.json({ ok: true, note: "Stock restored" });
}
