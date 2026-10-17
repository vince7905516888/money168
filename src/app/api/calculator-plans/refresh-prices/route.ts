import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshCalculatorPlanPrices } from "@/lib/calculator-price-refresh";

// 投資試算表「重新整理股價」手動按鈕，只刷新目前這個使用者自己的方案。
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const result = await refreshCalculatorPlanPrices({ userId: session.user.id });
  return NextResponse.json(result);
}
