import { prisma } from "@/lib/prisma";

// Given a category the user typed, reuse the exact casing of an existing
// category if one matches case-insensitively (trimmed) — otherwise treat
// it as a brand-new category. This keeps category filtering (which does
// exact-string matches) actually working instead of "Sneakers" and
// "sneakers" silently splitting into two separate categories.
export async function resolveCategory(input: string | null | undefined): Promise<string | null> {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;

  const existing = await prisma.product.findFirst({
    where: { category: { equals: trimmed, mode: "insensitive" } },
    select: { category: true },
  });

  return existing?.category || trimmed;
}
