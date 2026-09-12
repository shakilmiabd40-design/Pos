import { prisma } from "@/lib/prisma";

// Real Profit & Loss for a date range:
//   Net Sales = Revenue (already net of discount) - Returns refunded
//   Gross Profit = Net Sales - COGS (cost of the items actually sold)
//   Net Profit = Gross Profit - Damage loss (cost of written-off stock) - Expenses
// Sales cancelled via COD return/refusal are excluded from Revenue and
// COGS entirely — the goods came back and no sale really happened. Their
// courier cost still shows up as a normal Expense, and is broken out
// separately as "courierLoss" for visibility (it's already counted inside
// totalExpenses, not subtracted twice).
export async function computePnl(dateWhere: { gte?: Date; lte?: Date }) {
  const [sales, returns, damages, expenses, courierLossAgg] = await Promise.all([
    prisma.sale.findMany({
      where: { date: dateWhere, codStatus: { notIn: ["RETURNED", "REFUSED"] } },
      include: { items: { include: { variant: { include: { product: true } } } } },
    }),
    prisma.return.aggregate({ where: { date: dateWhere }, _sum: { refundAmount: true } }),
    prisma.damage.findMany({ where: { date: dateWhere }, include: { variant: { include: { product: true } } } }),
    prisma.expense.aggregate({ where: { date: dateWhere }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { date: dateWhere, category: "Courier loss" }, _sum: { amount: true } }),
  ]);

  const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const discountGiven = sales.reduce((sum, s) => sum + s.discount, 0);
  const cogs = sales.reduce(
    (sum, s) => sum + s.items.reduce((a, it) => a + it.qty * it.variant.product.costPrice, 0),
    0
  );
  const returnsRefunded = returns._sum.refundAmount || 0;
  const damageLoss = damages.reduce((sum, d) => sum + d.qty * d.variant.product.costPrice, 0);
  const totalExpenses = expenses._sum.amount || 0;
  const courierLoss = courierLossAgg._sum.amount || 0;

  const netSales = revenue - returnsRefunded;
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - damageLoss - totalExpenses;

  return {
    revenue,
    discountGiven,
    returnsRefunded,
    netSales,
    cogs,
    grossProfit,
    damageLoss,
    totalExpenses,
    courierLoss,
    netProfit,
    invoiceCount: sales.length,
  };
}
