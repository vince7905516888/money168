import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MIN_DAYS = 2;
const MAX_DAYS = 20;

// 連續N日三大法人買超／賣超、以及「連續N日賣超轉買超（反轉）」排行：資料來源是「全市場
// 買賣超」排行榜頁面每次被打開時順手存的 MarketRankingSnapshot 快照（見
// institutional-ranking/route.ts），不是另外即時爬證交所。
// - 連續買超／賣超：近N個交易日方向要完全一致（全買或全賣）
// - 反轉：最近那1天之前的N天要全部同一個方向，然後最近那1天翻到另一個方向，才算反轉
//   （所以反轉需要 N+1 個交易日的資料，比單純連續多抓一天）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), MIN_DAYS), MAX_DAYS) : 3;

  const distinctDates = await prisma.marketRankingSnapshot.findMany({
    distinct: ["date"],
    select: { date: true },
    orderBy: { date: "desc" },
    take: days + 1,
  });
  if (distinctDates.length < days) {
    return NextResponse.json(
      { error: `目前累積的資料只有 ${distinctDates.length} 個交易日，不足 ${days} 天，請選少一點天數或晚點再試`, availableDays: distinctDates.length },
      { status: 404 }
    );
  }
  const dateList = distinctDates.map((d) => d.date); // 新到舊：dateList[0]=最近一天
  const streakDates = dateList.slice(0, days); // 連續買超/賣超用：近N天
  const hasReversalWindow = dateList.length >= days + 1;
  const reversalPriorDates = dateList.slice(1, days + 1); // 反轉用：最近一天「之前」的N天

  const allDatesNeeded = hasReversalWindow ? dateList : streakDates;
  const rows = await prisma.marketRankingSnapshot.findMany({
    where: { date: { in: allDatesNeeded } },
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
  const sellToBuy: StreakItem[] = [];
  const buyToSell: StreakItem[] = [];

  for (const [code, entry] of byCode) {
    const streakValues = streakDates.map((d) => entry.byDate.get(d));
    if (!streakValues.some((v) => v == null)) {
      const nums = streakValues as number[];
      const allBuy = nums.every((v) => v > 0);
      const allSell = nums.every((v) => v < 0);
      if (allBuy || allSell) {
        const item = { code, name: entry.name, totalNetLots: nums.reduce((s, v) => s + v, 0), closePrice: entry.closePrice };
        (allBuy ? buyStreak : sellStreak).push(item);
      }
    }

    if (hasReversalWindow) {
      const today = entry.byDate.get(dateList[0]);
      const priorValues = reversalPriorDates.map((d) => entry.byDate.get(d));
      if (today == null || priorValues.some((v) => v == null)) continue;
      const priorNums = priorValues as number[];
      const priorAllSell = priorNums.every((v) => v < 0);
      const priorAllBuy = priorNums.every((v) => v > 0);
      const item = { code, name: entry.name, totalNetLots: priorNums.reduce((s, v) => s + v, 0) + today, closePrice: entry.closePrice };
      if (priorAllSell && today > 0) sellToBuy.push(item);
      else if (priorAllBuy && today < 0) buyToSell.push(item);
    }
  }

  buyStreak.sort((a, b) => b.totalNetLots - a.totalNetLots);
  sellStreak.sort((a, b) => a.totalNetLots - b.totalNetLots);
  sellToBuy.sort((a, b) => b.totalNetLots - a.totalNetLots);
  buyToSell.sort((a, b) => a.totalNetLots - b.totalNetLots);

  return NextResponse.json({
    days,
    dates: [...streakDates].reverse(),
    buyStreak,
    sellStreak,
    reversalAvailable: hasReversalWindow,
    reversalDate: hasReversalWindow ? dateList[0] : null,
    sellToBuy,
    buyToSell,
  });
}
