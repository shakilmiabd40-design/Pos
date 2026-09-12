import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const { name, phone, address, notes } = await req.json();
  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: { name: name || undefined, phone: phone ?? undefined, address: address ?? undefined, notes: notes ?? undefined },
  });
  return NextResponse.json(supplier);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  try {
    await prisma.supplier.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Cannot delete: supplier has purchase history. Remove related purchases first.");
  }
}
