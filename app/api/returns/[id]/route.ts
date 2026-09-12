import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const ret = await prisma.return.findUnique({ where: { id: params.id }, include: { saleItem: true } });
  if (!ret) return jsonError("Return not found", 404);

  await prisma.$transaction(async (tx) => {
    if (ret.restocked) {
      await tx.productVariant.update({ where: { id: ret.saleItem.variantId }, data: { stock: { decrement: ret.qty } } });
    }
    await tx.return.delete({ where: { id: params.id } });
  });

  await logActivity(session, "DELETE", "Return", params.id);

  return NextResponse.json({ ok: true });
}
