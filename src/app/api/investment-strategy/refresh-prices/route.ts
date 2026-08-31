import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchClosePrices } from "@/lib/tw-stock-chip";
import { fetchLiveQuote } from "@/lib/shioaji-gateway";
import { SYMBOL_TO_PAIR, firstResultValue } from "@/lib/kraken";
import { fetchTwelveQuote } from "@/lib/twelvedata";

interface KrakenTicker {
  c: [string, string]; // 最新成交價, 成交量
}

async function fetchKrakenPrice(symbol: string): Promise<number | null> {
  const pair = SYMBOL_TO_PAIR[symbol];
  if (!pair) return null;
  try {
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error?.length) return null;
    const ticker = firstResultValue<KrakenTicker>(json.result);
    const price = ticker ? parseFloat(ticker.c[0]) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// 「當前」欄位：
// 台股 —— 優先打永豐 Shioaji 閘道抓即時報價（開盤期間會是最新成交價，收盤後就是當天收盤價），
// 閘道抓不到（沒設定/逾時/該代碼沒有報價）的代碼才退回用證交所 STOCK_DAY_ALL 的收盤價補齊。
// 虛擬貨幣 —— 打 Kraken 公開行情（回傳美元價），只涵蓋 SYMBOL_TO_PAIR 裡列的幣別（見 lib/kraken.ts），
// 再乘上 Twelve Data 抓到的即時美元兌台幣匯率換算成台幣存起來，跟「虛擬貨幣投資」頁台幣計價的
// 投入成本才是同一個幣別，盈虧試算才不會錯；匯率抓不到的話這輪就先不更新虛擬貨幣價格，
// 避免把美元原始價存成台幣。抓不到報價的幣別維持使用者手動輸入的值不動。
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

  const priceMap = new Map<string, number>(); // key: `${assetType}:${code}`

  if (stockCodes.length > 0) {
    const shioajiResults = await Promise.all(
      stockCodes.map(async (code) => [code, await fetchLiveQuote(code)] as const)
    );
    const missing: string[] = [];
    for (const [code, quote] of shioajiResults) {
      if (quote && quote.close > 0) priceMap.set(`STOCK:${code}`, quote.close);
      else missing.push(code);
    }
    if (missing.length > 0) {
      const fallback = await fetchClosePrices(missing);
      for (const [code, close] of fallback) {
        if (close > 0) priceMap.set(`STOCK:${code}`, close);
      }
    }
  }

  if (cryptoCodes.length > 0) {
    const usdTwdQuote = await fetchTwelveQuote("USD/TWD");
    const usdToTwd = usdTwdQuote && usdTwdQuote.lastPrice > 0 ? usdTwdQuote.lastPrice : null;
    if (usdToTwd) {
      const krakenResults = await Promise.all(
        cryptoCodes.map(async (code) => [code, await fetchKrakenPrice(code)] as const)
      );
      for (const [code, price] of krakenResults) {
        if (price != null) priceMap.set(`CRYPTO:${code}`, price * usdToTwd);
      }
    }
  }

  const lookupKey = (e: { assetType: string; stockCode: string | null }) =>
    e.assetType === "CRYPTO" ? `CRYPTO:${e.stockCode!.trim().toUpperCase()}` : `${e.assetType}:${e.stockCode!.trim()}`;

  const updated = await Promise.all(
    entries
      .filter((e) => e.stockCode && (priceMap.get(lookupKey(e)) ?? 0) > 0)
      .map(async (e) => {
        const close = priceMap.get(lookupKey(e))!;
        const row = await prisma.investmentStrategyEntry.update({
          where: { id: e.id },
          data: { currentPrice: close },
        });
        return row;
      })
  );

  return NextResponse.json({ updated, checked: stockCodes.length + cryptoCodes.length, matched: updated.length });
}
