import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchClosePrices } from "@/lib/tw-stock-chip";
import { fetchLiveQuote } from "@/lib/shioaji-gateway";

// 「當前」欄位：優先打永豐 Shioaji 閘道抓即時報價（開盤期間會是最新成交價，
// 收盤後就是當天收盤價），閘道抓不到（沒設定/逾時/該代碼沒有報價）的代碼
// 才退回用證交所 STOCK_DAY_ALL 的收盤價補齊
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.investmentStrategyEntry.findMany({
    where: { userId: session.user.id, stockCode: { not: null } },
    select: { id: true, stockCode: true },
  });

  const codes = [...new Set(entries.map((e) => e.stockCode!.trim()).filter(Boolean))];
  if (codes.length === 0) return NextResponse.json({ updated: [] });

  const priceMap = new Map<string, number>();
  const shioajiResults = await Promise.all(
    codes.map(async (code) => [code, await fetchLiveQuote(code)] as const)
  );
  const missing: string[] = [];
  for (const [code, quote] of shioajiResults) {
    if (quote && quote.close > 0) priceMap.set(code, quote.close);
    else missing.push(code);
  }
  if (missing.length > 0) {
    const fallback = await fetchClosePrices(missing);
    for (const [code, close] of fallback) {
      if (close > 0) priceMap.set(code, close);
    }
  }

  const updated = await Promise.all(
    entries
      .filter((e) => e.stockCode && (priceMap.get(e.stockCode.trim()) ?? 0) > 0)
      .map(async (e) => {
        const close = priceMap.get(e.stockCode!.trim())!;
        const row = await prisma.investmentStrategyEntry.update({
          where: { id: e.id },
          data: { currentPrice: close },
        });
        return row;
      })
  );

  return NextResponse.json({ updated, checked: codes.length, matched: updated.length });
}
