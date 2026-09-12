import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const suppliers = await prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
    include: { purchases: { select: { totalAmount: true, amountPaid: true } } },
  });
  const withDue = suppliers.map(({ purchases, ...s }) => ({
    ...s,
    due: purchases.reduce((sum, p) => sum + Math.max(0, p.totalAmount - p.amountPaid), 0),
  }));
  return NextResponse.json(withDue);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const { name, phone, address, notes } = await req.json();
  if (!name) return jsonError("Supplier name is required");
  const supplier = await prisma.supplier.create({ data: { name, phone, address, notes } });
  return NextResponse.json(supplier, { status: 201 });
}
