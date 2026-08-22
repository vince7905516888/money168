import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshAllTwStockData } from "@/lib/tw-stock-refresh-all";

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const result = await refreshAllTwStockData();
  return NextResponse.json(result);
}
