import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const q = req.nextUrl.searchParams.get("q") || "";

  const customers = await prisma.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
      : undefined,
    include: { sales: { select: { totalAmount: true, amountPaid: true, date: true, codStatus: true } } },
    orderBy: { createdAt: "desc" },
  });

  // A customer with a habit of refusing/returning COD orders costs the shop
  // a delivery charge each time with nothing to show for it — flag them so
  // staff can ask for advance payment on future orders instead of blind COD.
  const RISK_THRESHOLD = 3;

  const withStats = customers.map((c) => {
    const visits = c.sales.length;
    const totalSpent = c.sales.reduce((s, sale) => s + sale.totalAmount, 0);
    const totalDue = c.sales.reduce(
      (s, sale) => (["RETURNED", "REFUSED"].includes(sale.codStatus) ? s : s + Math.max(0, sale.totalAmount - sale.amountPaid)),
      0
    );
    const codReturnCount = c.sales.filter((s) => ["RETURNED", "REFUSED"].includes(s.codStatus)).length;
    const lastVisit = c.sales.length
      ? c.sales.reduce((latest, sale) => (sale.date > latest ? sale.date : latest), c.sales[0].date)
      : null;
    const { sales, ...rest } = c;
    return { ...rest, visits, totalSpent, totalDue, codReturnCount, isRisk: codReturnCount >= RISK_THRESHOLD, lastVisit };
  });

  return NextResponse.json(withStats);
}

// body: { name, phone, address, notes }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { name, phone, address, notes } = await req.json();
  if (!name || !phone) return jsonError("Name and phone are required");

  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (existing) return jsonError("A customer with this phone number already exists");

  const customer = await prisma.customer.create({ data: { name, phone, address, notes } });
  await logActivity(session, "CREATE", "Customer", customer.id, name);
  return NextResponse.json(customer, { status: 201 });
}
