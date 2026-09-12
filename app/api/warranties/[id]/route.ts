import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

// body: { status: "ACTIVE" | "EXPIRED" | "CLAIMED" | "VOID" }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const { status } = await req.json();
  if (!["ACTIVE", "EXPIRED", "CLAIMED", "VOID"].includes(status)) return jsonError("Invalid status");
  const warranty = await prisma.warranty.update({ where: { id: params.id }, data: { status } });
  return NextResponse.json(warranty);
}
