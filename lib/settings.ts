import { prisma } from "@/lib/prisma";

// There's only ever meant to be one ShopSettings row. Create it with
// defaults the first time anything asks for it. If a race ever created more
// than one (two first-requests at once), always resolve to the oldest one
// consistently rather than picking arbitrarily.
export async function getShopSettings() {
  const existing = await prisma.shopSettings.findFirst({ orderBy: { updatedAt: "asc" } });
  if (existing) return existing;
  return prisma.shopSettings.create({ data: {} });
}
