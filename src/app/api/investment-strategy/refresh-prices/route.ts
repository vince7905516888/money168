import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchLiveStockAndCryptoPrices, strategyPriceLookupKey } from "@/lib/strategy-live-prices";

// 「當前」欄位的報價來源說明見 lib/strategy-live-prices.ts；
// 美股目前沒有整合報價來源，「當前」一律手動輸入，這支API不處理。
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.investmentStrategyEntry.findMany({
    where: { userId: session.user.id, stockCode: { not: null } },
    select: { id: true, stockCode: true, assetType: true },
  });
  if (entries.length === 0) return NextResponse.json({ updated: [] });

  const stockCodes = [...new Set(entries.filter((e) => e.assetType === "STOCK").map((e) => e.stockCode!.trim()).filter(Boolean))];
  const cryptoCodes = [...new Set(entries.filter((e) => e.assetType === "CRYPTO").map((e) => e.stockCode!.trim().toUpperCase()).filter(Boolean))];

  const priceMap = await fetchLiveStockAndCryptoPrices(stockCodes, cryptoCodes);

  const updated = await Promise.all(
    entries
      .filter((e) => e.stockCode && (priceMap.get(strategyPriceLookupKey(e)) ?? 0) > 0)
      .map(async (e) => {
        const close = priceMap.get(strategyPriceLookupKey(e))!;
        const row = await prisma.investmentStrategyEntry.update({
          where: { id: e.id },
          data: { currentPrice: close },
        });
        return row;
      })
  );

  return NextResponse.json({ updated, checked: stockCodes.length + cryptoCodes.length, matched: updated.length });
}
