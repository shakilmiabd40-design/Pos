import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCronAuth } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/mailer";
import { getShopSettings } from "@/lib/settings";

// Scheduled weekly (see vercel.json) — dumps the core business tables to
// JSON and emails them to the admins as an attachment. This is a
// lightweight safety net on top of Neon's own database backups, giving you
// an off-platform copy you can restore from or inspect by hand.
export async function GET(req: NextRequest) {
  const err = checkCronAuth(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  const [
    products,
    variants,
    customers,
    suppliers,
    purchases,
    purchaseItems,
    supplierPayments,
    sales,
    saleItems,
    payments,
    returns,
    damages,
    warranties,
    expenses,
    dayClosings,
  ] = await Promise.all([
    prisma.product.findMany(),
    prisma.productVariant.findMany(),
    prisma.customer.findMany(),
    prisma.supplier.findMany(),
    prisma.purchase.findMany(),
    prisma.purchaseItem.findMany(),
    prisma.supplierPayment.findMany(),
    prisma.sale.findMany(),
    prisma.saleItem.findMany(),
    prisma.payment.findMany(),
    prisma.return.findMany(),
    prisma.damage.findMany(),
    prisma.warranty.findMany(),
    prisma.expense.findMany(),
    prisma.dayClosing.findMany(),
  ]);

  const backup = {
    generatedAt: new Date().toISOString(),
    products,
    variants,
    customers,
    suppliers,
    purchases,
    purchaseItems,
    supplierPayments,
    sales,
    saleItems,
    payments,
    returns,
    damages,
    warranties,
    expenses,
    dayClosings,
  };

  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  const settings = await getShopSettings();
  const recipients = Array.from(
    new Set([...admins.map((a) => a.email), settings.email].filter(Boolean) as string[])
  );

  const json = JSON.stringify(backup, null, 2);
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (recipients.length === 0) {
    return NextResponse.json({ sent: false, reason: "No admin/shop email configured", sizeBytes: json.length });
  }

  const sent = await sendEmail({
    to: recipients,
    subject: `Shoe Shop POS — weekly backup (${dateStamp})`,
    text: `Attached: a full JSON export of your shop data as of ${dateStamp}. Keep it somewhere safe.`,
    attachments: [{ filename: `shoe-pos-backup-${dateStamp}.json`, content: json }],
  });

  return NextResponse.json({ sent, sizeBytes: json.length, recipients });
}
