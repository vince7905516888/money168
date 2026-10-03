import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runBinanceAutoBook } from "@/lib/binance-autobook";

// 把切點之後新的幣安成交／閃兌／利息／股票代幣變動入帳（重複呼叫不會重複入帳）。
// 虛擬貨幣、美股、資產總攬頁載入時呼叫。
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    return NextResponse.json(await runBinanceAutoBook(session.user.id));
  } catch (e) {
    console.error("binance autobook failed:", e);
    return NextResponse.json({ error: "自動作帳失敗" }, { status: 500 });
  }
}
