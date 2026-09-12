import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

// Distinct product categories, for filter dropdowns across the app.
// Postgres DISTINCT is case-sensitive, so "Sneakers" and "sneakers" would
// otherwise both show up as separate categories — dedupe case-insensitively
// here instead, keeping whichever casing was used first.
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const rows = await prisma.product.findMany({
    where: { active: true, category: { not: null } },
    select: { category: true },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Map<string, string>();
  for (const r of rows) {
    const raw = (r.category || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  }

  const categories = [...seen.values()].sort((a, b) => a.localeCompare(b));
  return NextResponse.json(categories);
}
