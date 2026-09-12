import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { ALL_DASHBOARD_WIDGET_KEYS } from "@/lib/dashboard-widgets";

// Self-service — every logged-in user manages their own dashboard layout,
// no admin permission needed for this (it only affects what they see).
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { dashboardWidgets: true },
  });

  return NextResponse.json({ widgets: user?.dashboardWidgets ?? null });
}

// body: { widgets: string[] | null }  — null means "show everything"
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const { widgets } = await req.json();
  const clean =
    widgets === null
      ? null
      : Array.isArray(widgets)
      ? widgets.filter((w) => ALL_DASHBOARD_WIDGET_KEYS.includes(w))
      : null;

  await prisma.user.update({
    where: { id: session.userId },
    data: { dashboardWidgets: clean === null ? Prisma.DbNull : clean },
  });

  return NextResponse.json({ widgets: clean });
}
