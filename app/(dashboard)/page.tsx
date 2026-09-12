import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { startOfBdDay, endOfBdDay } from "@/lib/bd-time";
import { computePnl } from "@/lib/pnl";
import { isWidgetEnabled } from "@/lib/dashboard-widgets";
import DashboardCustomizer from "@/components/DashboardCustomizer";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  const session = await getSession();
  const today = startOfBdDay();
  const monthStart = startOfBdDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const user = session ? await prisma.user.findUnique({ where: { id: session.userId }, select: { dashboardWidgets: true } }) : null;
  const widgets = user?.dashboardWidgets ?? null;
  const show = (key: string) => isWidgetEnabled(widgets, key);

  const [
    todaySales,
    activeWarranties,
    totalStockAgg,
    damageMonthAgg,
    allSalesForDue,
    expiringWarranties,
    pendingCodCount,
    courierLossMonthAgg,
    dailyPnl,
    monthlyPnl,
  ] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      _count: { _all: true },
      where: { date: { gte: today } },
    }),
    prisma.warranty.count({ where: { status: "ACTIVE" } }),
    prisma.productVariant.aggregate({ _sum: { stock: true }, where: { active: true, product: { active: true } } }),
    prisma.damage.aggregate({ _sum: { qty: true }, where: { date: { gte: monthStart } } }),
    prisma.sale.findMany({ select: { totalAmount: true, amountPaid: true, codStatus: true } }),
    prisma.warranty.findMany({
      where: { status: "ACTIVE", endDate: { gte: today, lte: in30Days } },
      include: { variant: { include: { product: true } }, saleItem: { include: { sale: true } } },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.sale.count({ where: { codStatus: { in: ["PENDING", "SHIPPED"] } } }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { category: "Courier loss", date: { gte: monthStart } },
    }),
    computePnl({ gte: today, lte: endOfBdDay() }),
    computePnl({ gte: monthStart, lte: endOfBdDay() }),
  ]);

  // Low stock and total due are computed in app code since Prisma can't
  // compare two columns of the same row in a where filter.
  const variants = await prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    include: { product: true },
  });
  const lowStockVariants = variants.filter((v) => v.stock <= v.reorderAt).slice(0, 10);
  const lowStockCount = variants.filter((v) => v.stock <= v.reorderAt).length;

  const totalDue = allSalesForDue.reduce(
    (sum, s) => (["RETURNED", "REFUSED"].includes(s.codStatus) ? sum : sum + Math.max(0, s.totalAmount - s.amountPaid)),
    0
  );

  const cards = [
    { key: "todaySales", label: "Today's sales", value: `৳ ${(todaySales._sum.totalAmount || 0).toLocaleString()}`, sub: `${todaySales._count._all} invoice(s)` },
    { key: "closingStock", label: "Closing stock (units)", value: `${totalStockAgg._sum.stock || 0}`, sub: `${lowStockCount} low-stock item(s)` },
    { key: "activeWarranties", label: "Active warranties", value: `${activeWarranties}`, sub: "1 year from sale" },
    { key: "totalDue", label: "Total due", value: `৳${totalDue.toLocaleString()}`, sub: `${damageMonthAgg._sum.qty || 0} damaged units this month` },
    { key: "pendingCod", label: "Pending COD deliveries", value: `${pendingCodCount}`, sub: "awaiting delivery/return" },
    { key: "courierLoss", label: "Courier loss this month", value: `৳${(courierLossMonthAgg._sum.amount || 0).toLocaleString()}`, sub: "from returned/refused COD" },
    { key: "courierCharge", label: "Courier charge this month", value: `৳${monthlyPnl.courierCharge.toLocaleString()}`, sub: "courier's cut on delivered COD orders" },
    {
      key: "dailyPnl",
      label: "Today's profit & loss",
      value: `৳${dailyPnl.netProfit.toLocaleString()}`,
      sub: `revenue ৳${dailyPnl.revenue.toLocaleString()} · ${dailyPnl.invoiceCount} invoice(s)`,
    },
    {
      key: "monthlyPnl",
      label: "This month's profit & loss",
      value: `৳${monthlyPnl.netProfit.toLocaleString()}`,
      sub: `revenue ৳${monthlyPnl.revenue.toLocaleString()} · ${monthlyPnl.invoiceCount} invoice(s)`,
    },
  ].filter((c) => show(c.key));

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Dashboard</h1>
      <p className="text-sm text-ink/60 mb-4">Quick snapshot of today's shop activity.</p>
      {searchParams?.denied && (
        <div className="mb-4 text-sm text-clay bg-clay/10 border border-clay/30 rounded-md px-3 py-2">
          You don't have access to that section. Ask an admin to enable it for your account.
        </div>
      )}

      <DashboardCustomizer initialWidgets={widgets as string[] | null} />

      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {cards.map((c) => (
            <div key={c.key} className="card">
              <div className="text-xs text-ink/50">{c.label}</div>
              <div className="text-2xl font-serif text-ink mt-1">{c.value}</div>
              <div className="text-xs text-ink/50 mt-1">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {(show("lowStockList") || show("warrantyExpiringList")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {show("lowStockList") && (
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-ink">Low stock</div>
                <Link href="/products" className="text-xs text-moss hover:underline">
                  View products
                </Link>
              </div>
              {lowStockVariants.length === 0 ? (
                <div className="text-sm text-ink/40 py-3">Nothing low on stock right now.</div>
              ) : (
                <div className="space-y-1">
                  {lowStockVariants.map((v) => (
                    <div key={v.id} className="flex justify-between text-sm py-1 border-b border-line/60 last:border-0">
                      <span>
                        {v.product.name} <span className="text-ink/40">(size {v.size})</span>
                      </span>
                      <span className="text-clay font-medium">{v.stock} left</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {show("warrantyExpiringList") && (
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-ink">Warranty expiring in 30 days</div>
                <Link href="/warranties" className="text-xs text-moss hover:underline">
                  View all
                </Link>
              </div>
              {expiringWarranties.length === 0 ? (
                <div className="text-sm text-ink/40 py-3">No warranties expiring soon.</div>
              ) : (
                <div className="space-y-1">
                  {expiringWarranties.map((w) => (
                    <div key={w.id} className="flex justify-between text-sm py-1 border-b border-line/60 last:border-0">
                      <span>
                        {w.variant.product.name} <span className="text-ink/40">(size {w.variant.size})</span>
                      </span>
                      <span className="text-ink/60">{new Date(w.endDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
