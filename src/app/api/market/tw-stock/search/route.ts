import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchStocks } from "@/lib/tw-stock-directory";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchStocks(q);
  return NextResponse.json(results);
}
