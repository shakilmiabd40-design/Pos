import { prisma } from "@/lib/prisma";
import { startOfBdDay, endOfBdDay } from "@/lib/bd-time";

// Cash in/out for a single calendar day, used to compute the expected
// cash-in-drawer figure for day closing. Only "cash" method transactions
// count — card/bKash/Nagad/bank money doesn't sit in the physical drawer.
export async function computeExpectedCash(day: Date) {
  const start = startOfBdDay(day);
  const end = endOfBdDay(day);

  const [cashPayments, cashReturns, cashExpenses] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { method: "cash", date: { gte: start, lte: end } },
    }),
    prisma.return.aggregate({
      _sum: { refundAmount: true },
      where: { date: { gte: start, lte: end } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { method: "cash", date: { gte: start, lte: end } },
    }),
  ]);

  const cashIn = cashPayments._sum.amount || 0;
  // Returns are assumed refunded in cash unless you track payment method on
  // returns too — good enough for a small single-till shop.
  const cashOut = (cashReturns._sum.refundAmount || 0) + (cashExpenses._sum.amount || 0);

  return { cashIn, cashOut };
}
