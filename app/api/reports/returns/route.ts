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

  const returns = await prisma.return.findMany({
    where,
    include: { saleItem: { include: { variant: { include: { product: true } } } }, sale: true },
    orderBy: { date: "desc" },
  });
  const totalQty = returns.reduce((s, r) => s + r.qty, 0);
  const totalRefund = returns.reduce((s, r) => s + r.refundAmount, 0);

  return NextResponse.json({ returns, totals: { totalQty, totalRefund } });
}
