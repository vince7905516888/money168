import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupStockName } from "@/lib/tw-stock-directory";
import { hasFeatureAccess } from "@/lib/permissions";
import { syncWatchedStocks } from "@/lib/tw-stock-watchlist-sync";

const FEATURE_KEY = "feature.tw-stock-watchlist";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await hasFeatureAccess(session.user.id, session.user.role, FEATURE_KEY))) {
    return NextResponse.json({ error: "您的會員等級無法使用觀察名單功能" }, { status: 403 });
  }

  const list = await prisma.userWatchStock.findMany({
    where: { userId: session.user.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  // 會員打開觀察名單時，順手同步全站觀察名單涵蓋到的股票（去重、只補今天還沒抓過的），
  // 不等待完成再回應，不影響這次請求的回應速度。
  syncWatchedStocks().catch((e) => console.error("watchlist sync failed:", e));

  // 附上每檔股票目前資料庫裡最新一筆三大法人快照的日期，前台顯示「最後更新」，
  // 讓會員看得到資料確實有在同步，不是完全沒感覺的背景動作。
  const codes = list.map((w) => w.code);
  const latestByCode = new Map<string, string>();
  if (codes.length > 0) {
    const latest = await prisma.stockInstitutionalSnapshot.groupBy({
      by: ["code"],
      where: { code: { in: codes } },
      _max: { date: true },
    });
    for (const row of latest) {
      if (row._max.date) latestByCode.set(row.code, row._max.date);
    }
  }
  const listWithLastUpdated = list.map((w) => ({ ...w, lastUpdated: latestByCode.get(w.code) ?? null }));

  return NextResponse.json(listWithLastUpdated);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await hasFeatureAccess(session.user.id, session.user.role, FEATURE_KEY))) {
    return NextResponse.json({ error: "您的會員等級無法使用觀察名單功能" }, { status: 403 });
  }

  const { code } = await req.json();
  const cleanCode = String(code ?? "").trim();
  if (!/^\d{4,6}[A-Z]?$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const name = await lookupStockName(cleanCode).catch(() => null);

  const last = await prisma.userWatchStock.findFirst({
    where: { userId: session.user.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const item = await prisma.userWatchStock.upsert({
    where: { userId_code: { userId: session.user.id, code: cleanCode } },
    update: {},
    create: { userId: session.user.id, code: cleanCode, name, order: (last?.order ?? -1) + 1 },
  });
  return NextResponse.json(item);
}
