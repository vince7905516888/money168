import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasFeatureAccess } from "@/lib/permissions";
import { syncWatchedStocks } from "@/lib/tw-stock-watchlist-sync";

const FEATURE_KEY = "feature.tw-stock-watchlist";

// 前台「同步更新」按鈕：跟 watchlist GET 背景觸發的是同一份同步邏輯，差別是這裡會等待
// 執行完成才回應，讓會員按下去有明確的完成回饋；今天已經同步過的股票內部會自動跳過，
// 所以就算會員重複按也不會一直重打外部API。
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await hasFeatureAccess(session.user.id, session.user.role, FEATURE_KEY))) {
    return NextResponse.json({ error: "您的會員等級無法使用觀察名單功能" }, { status: 403 });
  }

  const result = await syncWatchedStocks();
  return NextResponse.json(result);
}
