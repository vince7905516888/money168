import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchInstitutionalRanking, fetchClosePrices } from "@/lib/tw-stock-flow";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const ranking = await fetchInstitutionalRanking();
  if (!ranking) {
    return NextResponse.json({ error: "查無資料" }, { status: 404 });
  }

  // 全市場買賣超逐日存檔：把當天有買賣超的股票（含收盤價）都存一筆，用code+date當key，
  // 已經存過的當天資料會被 skipDuplicates 跳過，重複呼叫這個API不會出錯也不會重複累積。
  try {
    const closePrices = await fetchClosePrices(ranking.all.map((r) => r.code));
    await prisma.marketRankingSnapshot.createMany({
      data: ranking.all.map((r) => ({
        code: r.code,
        name: r.name,
        date: ranking.date,
        closePrice: closePrices.get(r.code) ?? null,
        netLots: r.netLots,
      })),
      skipDuplicates: true,
    });
  } catch {
    // 存檔失敗不影響排行榜本身的顯示
  }

  return NextResponse.json({ date: ranking.date, buyTop: ranking.buyTop, sellTop: ranking.sellTop });
}
