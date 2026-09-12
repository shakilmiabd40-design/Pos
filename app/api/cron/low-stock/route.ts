import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCronAuth } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/mailer";
import { getShopSettings } from "@/lib/settings";

// Scheduled daily (see vercel.json) — emails admins a list of sizes at or
// below their reorder point, so low stock gets caught without anyone
// having to remember to check the dashboard.
export async function GET(req: NextRequest) {
  const err = checkCronAuth(req);
  if (err) return NextResponse.json({ error: err }, { status: 401 });

  // Prisma can't compare two columns of the same row directly in a `where`
  // clause, so pull active variants and compare stock vs. reorderAt in JS.
  // Fine at shoe-shop scale (hundreds/low thousands of SKUs, not millions).
  const activeVariants = await prisma.productVariant.findMany({
    where: { active: true },
    include: { product: true },
    orderBy: { stock: "asc" },
  });
  const lowStock = activeVariants.filter((v) => v.stock <= v.reorderAt);

  if (lowStock.length === 0) {
    return NextResponse.json({ sent: false, reason: "No low-stock items", count: 0 });
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true },
  });
  const settings = await getShopSettings();
  const recipients = Array.from(
    new Set([...admins.map((a) => a.email), settings.email].filter(Boolean) as string[])
  );

  if (recipients.length === 0) {
    return NextResponse.json({ sent: false, reason: "No admin/shop email configured", count: lowStock.length });
  }

  const rows = lowStock
    .map((v) => `${v.product.name} (size ${v.size}, SKU ${v.sku}) — stock ${v.stock}, reorder at ${v.reorderAt}`)
    .join("\n");
  const html = `<p>${lowStock.length} size(s) are at or below their reorder point:</p><ul>${lowStock
    .map(
      (v) =>
        `<li>${v.product.name} (size ${v.size}, SKU ${v.sku}) — stock <b>${v.stock}</b>, reorder at ${v.reorderAt}</li>`
    )
    .join("")}</ul>`;

  const sent = await sendEmail({
    to: recipients,
    subject: `⚠ Low stock: ${lowStock.length} size(s) need reordering`,
    text: rows,
    html,
  });

  return NextResponse.json({ sent, count: lowStock.length, recipients });
}
