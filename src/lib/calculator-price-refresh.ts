import { prisma } from "@/lib/prisma";
import { fetchLiveStockAndCryptoPrices } from "@/lib/strategy-live-prices";

// 投資試算表「目前市值」的股價來源：跟投資策略頁共用同一套報價邏輯
// （見 lib/strategy-live-prices.ts），只處理台股，美股沒有整合報價來源。
export async function refreshCalculatorPlanPrices(
  where: { userId?: string } = {}
): Promise<{ checked: number; matched: number }> {
  const plans = await prisma.calculatorPlan.findMany({
    where: { ...where, stockCode: { not: null } },
    select: { id: true, stockCode: true },
  });
  if (plans.length === 0) return { checked: 0, matched: 0 };

  const codes = [...new Set(plans.map((p) => p.stockCode!.trim()).filter(Boolean))];
  const priceMap = await fetchLiveStockAndCryptoPrices(codes, []);

  let matched = 0;
  const now = new Date();
  for (const plan of plans) {
    const close = priceMap.get(`STOCK:${plan.stockCode!.trim()}`);
    if (close == null || close <= 0) continue;
    await prisma.calculatorPlan.update({
      where: { id: plan.id },
      data: { currentPrice: close, currentPriceUpdatedAt: now },
    });
    matched += 1;
  }

  return { checked: codes.length, matched };
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 每小時檢查一次（盤中價格會跟著變動，收盤後就固定在當天收盤價，足以涵蓋「每日自動更新」的需求）

let running = false;

// 範圍只鎖定「有填股票代號」的試算方案，量級跟 batch-alert-check.ts 同一等級，
// 不是全市場排程（見 instrumentation.ts 的說明，避免重演全市場排程記憶體爆掉的問題）。
async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await refreshCalculatorPlanPrices({});
    if (result.checked > 0) console.log("[calculator-price-auto-refresh] 完成:", result);
  } catch (e) {
    console.error("[calculator-price-auto-refresh] 執行失敗:", e);
  } finally {
    running = false;
  }
}

export function startCalculatorPriceAutoRefresh() {
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
