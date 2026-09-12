import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError, dateRangeFilter } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const where = { date: dateRangeFilter(from, to) };

  const damages = await prisma.damage.findMany({
    where,
    include: { variant: { include: { product: true } } },
    orderBy: { date: "desc" },
  });
  const totalQty = damages.reduce((s, d) => s + d.qty, 0);
  const totalCostValue = damages.reduce((s, d) => s + d.qty * d.variant.product.costPrice, 0);

  return NextResponse.json({ damages, totals: { totalQty, totalCostValue } });
}
