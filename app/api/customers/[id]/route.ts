import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Returns the customer profile plus their full sale history (for a
// "view history" screen).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      sales: {
        include: { items: { include: { variant: { include: { product: true } } } } },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!customer) return jsonError("Customer not found", 404);

  const sales = customer.sales.map((s) => ({
    ...s,
    due: ["RETURNED", "REFUSED"].includes(s.codStatus) ? 0 : Math.max(0, s.totalAmount - s.amountPaid),
  }));
  return NextResponse.json({ ...customer, sales });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { name, address, notes } = await req.json();
  const customer = await prisma.customer.update({
    where: { id: params.id },
    data: { name: name || undefined, address: address ?? undefined, notes: notes ?? undefined },
  });
  await logActivity(session, "UPDATE", "Customer", params.id, customer.name);
  return NextResponse.json(customer);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const salesCount = await prisma.sale.count({ where: { customerId: params.id } });
  if (salesCount > 0) {
    return jsonError("This customer has sales history and can't be deleted. Edit their details instead.");
  }

  await prisma.customer.delete({ where: { id: params.id } });
  await logActivity(session, "DELETE", "Customer", params.id);
  return NextResponse.json({ ok: true });
}
