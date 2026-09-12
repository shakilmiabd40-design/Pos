import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError, dateRangeFilter } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const where = { date: dateRangeFilter(from, to), codStatus: { notIn: ["RETURNED", "REFUSED"] } };

  const [sales, agg] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: { include: { variant: { include: { product: true } } } } },
      orderBy: { date: "desc" },
    }),
    prisma.sale.aggregate({ where, _sum: { totalAmount: true, discount: true }, _count: { _all: true } }),
  ]);

  const unitsSold = sales.reduce((sum, s) => sum + s.items.reduce((a, it) => a + it.qty, 0), 0);

  return NextResponse.json({
    sales,
    totals: {
      invoiceCount: agg._count._all,
      revenue: agg._sum.totalAmount || 0,
      discount: agg._sum.discount || 0,
      unitsSold,
    },
  });
}
