import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MIN_DAYS = 2;
const MAX_DAYS = 20;

// 連續N日三大法人買超／賣超排行：資料來源是「全市場買賣超」排行榜頁面每次被打開時
// 順手存的 MarketRankingSnapshot 快照（見 institutional-ranking/route.ts），不是另外
// 即時爬證交所——用近N個「實際有存到資料」的交易日，同一檔股票這N天的買賣超方向
// 要完全一致（全買或全賣）才算連續，中間缺資料或方向不一致就不算。
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), MIN_DAYS), MAX_DAYS) : 3;

  const distinctDates = await prisma.marketRankingSnapshot.findMany({
    distinct: ["date"],
    select: { date: true },
    orderBy: { date: "desc" },
    take: days,
  });
  if (distinctDates.length < days) {
    return NextResponse.json(
      { error: `目前累積的資料只有 ${distinctDates.length} 個交易日，不足 ${days} 天，請選少一點天數或晚點再試`, availableDays: distinctDates.length },
      { status: 404 }
    );
  }
  const dateList = distinctDates.map((d) => d.date);

  const rows = await prisma.marketRankingSnapshot.findMany({
    where: { date: { in: dateList } },
    select: { code: true, name: true, date: true, netLots: true, closePrice: true },
  });

  const byCode = new Map<string, { name: string; byDate: Map<string, number>; closePrice: number | null }>();
  for (const r of rows) {
    if (!byCode.has(r.code)) byCode.set(r.code, { name: r.name, byDate: new Map(), closePrice: null });
    const entry = byCode.get(r.code)!;
    entry.byDate.set(r.date, r.netLots);
    if (r.closePrice != null) entry.closePrice = r.closePrice;
  }

  interface StreakItem { code: string; name: string; totalNetLots: number; closePrice: number | null }
  const buyStreak: StreakItem[] = [];
  const sellStreak: StreakItem[] = [];

  for (const [code, entry] of byCode) {
    const values = dateList.map((d) => entry.byDate.get(d));
    if (values.some((v) => v == null)) continue; // 這N天裡有缺資料的那天，不算連續
    const nums = values as number[];
    const allBuy = nums.every((v) => v > 0);
    const allSell = nums.every((v) => v < 0);
    if (!allBuy && !allSell) continue;
    const item = { code, name: entry.name, totalNetLots: nums.reduce((s, v) => s + v, 0), closePrice: entry.closePrice };
    (allBuy ? buyStreak : sellStreak).push(item);
  }

  buyStreak.sort((a, b) => b.totalNetLots - a.totalNetLots);
  sellStreak.sort((a, b) => a.totalNetLots - b.totalNetLots);

  return NextResponse.json({ days, dates: [...dateList].reverse(), buyStreak, sellStreak });
}
