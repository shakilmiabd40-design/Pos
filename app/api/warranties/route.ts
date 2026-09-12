import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  await prisma.warranty.updateMany({
    where: { status: "ACTIVE", endDate: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  const warranties = await prisma.warranty.findMany({
    include: { variant: { include: { product: true } }, saleItem: { include: { sale: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(warranties);
}
