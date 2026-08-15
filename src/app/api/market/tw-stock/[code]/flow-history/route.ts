import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 法人買賣超趨勢圖用的區間：證交所沒有「單一股票歷史區間」查詢功能，這裡查的是
// 我們自己逐日累積下來的快照表（見 institutional/route.ts），期間越長、累積滿之前資料越稀疏。
const PERIOD_DAYS: Record<string, number> = {
  "1m": 31,
  "3m": 92,
  "6m": 183,
  "1y": 366,
  "3y": 1097,
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const periodParam = req.nextUrl.searchParams.get("period") ?? "1m";
  const days = PERIOD_DAYS[periodParam] ?? PERIOD_DAYS["1m"];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = toDateStr(cutoff);

  const [institutional, margin] = await Promise.all([
    prisma.stockInstitutionalSnapshot.findMany({
      where: { code: cleanCode, date: { gte: cutoffStr } },
      orderBy: { date: "asc" },
    }),
    prisma.stockMarginSnapshot.findMany({
      where: { code: cleanCode, date: { gte: cutoffStr } },
      orderBy: { date: "asc" },
    }),
  ]);

  return NextResponse.json({ institutional, margin, requestedFrom: cutoffStr });
}
