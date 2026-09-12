import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getShopSettings } from "@/lib/settings";
import { jsonError } from "@/lib/api-helpers";
import { logActivity } from "@/lib/activity";

// Readable by any logged-in user (POS/receipt printing needs it too).
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  const settings = await getShopSettings();
  return NextResponse.json(settings);
}

// Editable by admins only.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);
  if (session.role !== "ADMIN") return jsonError("Admin only", 403);

  const { shopName, address, phone, email } = await req.json();
  const existing = await getShopSettings();

  const updated = await prisma.shopSettings.update({
    where: { id: existing.id },
    data: {
      shopName: shopName || "My Shoe Shop",
      address: address || null,
      phone: phone || null,
      email: email || null,
    },
  });

  await logActivity(session, "UPDATE", "ShopSettings", updated.id, updated.shopName);

  return NextResponse.json(updated);
}
