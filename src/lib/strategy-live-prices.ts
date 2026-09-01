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

// 投資策略頁「當前」欄位的報價來源，refresh-prices API（使用者手動/進頁面觸發）與
// batch-alert-check 背景排程（見 lib/batch-alert-check.ts）共用同一套邏輯：
// 台股 —— 優先打永豐 Shioaji 閘道抓即時報價，抓不到才退回用證交所 STOCK_DAY_ALL 的收盤價補齊。
// 虛擬貨幣 —— 打 Kraken 公開行情（回傳美元價），再乘上 Twelve Data 抓到的即時美元兌台幣匯率
// 換算成台幣，才能跟「虛擬貨幣投資」頁台幣計價的投入成本用同一個幣別比較；
// 匯率抓不到的話這輪就完全不回傳虛擬貨幣價格，避免把美元原始價誤存成台幣。
// 美股沒有整合報價來源，不在這支函式的處理範圍內。
export async function fetchLiveStockAndCryptoPrices(
  stockCodes: string[],
  cryptoCodes: string[]
): Promise<Map<string, number>> {
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

  return priceMap;
}

export function strategyPriceLookupKey(e: { assetType: string; stockCode: string | null }): string {
  return e.assetType === "CRYPTO"
    ? `CRYPTO:${e.stockCode!.trim().toUpperCase()}`
    : `${e.assetType}:${e.stockCode!.trim()}`;
}
