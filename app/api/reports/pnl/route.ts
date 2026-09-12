import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { jsonError, dateRangeFilter } from "@/lib/api-helpers";
import { computePnl } from "@/lib/pnl";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Login required", 401);

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const dateWhere = dateRangeFilter(from, to);

  const result = await computePnl(dateWhere);
  return NextResponse.json(result);
}
