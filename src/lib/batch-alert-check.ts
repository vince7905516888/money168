import { prisma } from "@/lib/prisma";
import { fetchLiveStockAndCryptoPrices, strategyPriceLookupKey } from "@/lib/strategy-live-prices";
import { sendMail } from "@/lib/mailer";

// 「投資策略」頁加碼價通知：每 30 分鐘掃一次有填第N次加碼目標價的列，價格跌到目標價
// 就寄信提醒（現價 ≤ 目標價），同一批只通知一次——把這次通知時的目標價記在
// batchNNotifiedPrice，跟目前 batchN 值相同就不重複寄，使用者改了目標價才會視為新目標。
// 範圍只鎖定「有填加碼目標價」的列，不是全市場排程，量級跟 taifex-auto-refresh.ts 同一等級，
// 不會重演之前全市場排程搞到記憶體爆掉當機的問題（見 instrumentation.ts 的說明）。
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const entries = await prisma.investmentStrategyEntry.findMany({
      where: {
        stockCode: { not: null },
        OR: [
          { batch1: { not: null } },
          { batch2: { not: null } },
          { batch3: { not: null } },
          { batch4: { not: null } },
          { batch5: { not: null } },
          { batch6: { not: null } },
        ],
      },
      select: {
        id: true,
        userId: true,
        assetType: true,
        stockName: true,
        stockCode: true,
        currentPrice: true,
        batch1: true,
        batch2: true,
        batch3: true,
        batch4: true,
        batch5: true,
        batch6: true,
        batch1NotifiedPrice: true,
        batch2NotifiedPrice: true,
        batch3NotifiedPrice: true,
        batch4NotifiedPrice: true,
        batch5NotifiedPrice: true,
        batch6NotifiedPrice: true,
        user: { select: { email: true, name: true } },
      },
    });
    if (entries.length === 0) return;

    const stockCodes = [...new Set(entries.filter((e) => e.assetType === "STOCK").map((e) => e.stockCode!.trim()).filter(Boolean))];
    const cryptoCodes = [...new Set(entries.filter((e) => e.assetType === "CRYPTO").map((e) => e.stockCode!.trim().toUpperCase()).filter(Boolean))];
    const priceMap = await fetchLiveStockAndCryptoPrices(stockCodes, cryptoCodes);

    const alertsByUser = new Map<string, { email: string; items: string[] }>();

    for (const e of entries) {
      const freshPrice = priceMap.get(strategyPriceLookupKey(e));
      if (freshPrice != null && freshPrice !== e.currentPrice) {
        await prisma.investmentStrategyEntry.update({ where: { id: e.id }, data: { currentPrice: freshPrice } });
      }
      const currentPrice = freshPrice ?? e.currentPrice;
      if (currentPrice == null || !e.user.email) continue;

      const checks: { target: number | null; notified: number | null; label: string; field: string }[] = [
        { target: e.batch1, notified: e.batch1NotifiedPrice, label: "第一次", field: "batch1NotifiedPrice" },
        { target: e.batch2, notified: e.batch2NotifiedPrice, label: "第二次", field: "batch2NotifiedPrice" },
        { target: e.batch3, notified: e.batch3NotifiedPrice, label: "第三次", field: "batch3NotifiedPrice" },
        { target: e.batch4, notified: e.batch4NotifiedPrice, label: "第四次", field: "batch4NotifiedPrice" },
        { target: e.batch5, notified: e.batch5NotifiedPrice, label: "第五次", field: "batch5NotifiedPrice" },
        { target: e.batch6, notified: e.batch6NotifiedPrice, label: "第六次", field: "batch6NotifiedPrice" },
      ];

      for (const c of checks) {
        if (c.target == null) continue;
        if (currentPrice <= c.target && c.notified !== c.target) {
          await prisma.investmentStrategyEntry.update({
            where: { id: e.id },
            data: { [c.field]: c.target },
          });
          const key = e.userId;
          if (!alertsByUser.has(key)) alertsByUser.set(key, { email: e.user.email, items: [] });
          alertsByUser.get(key)!.items.push(
            `${e.stockName || e.stockCode}（${e.stockCode}）${c.label}加碼價 ${c.target} 已到價，目前價格 ${currentPrice.toFixed(2)}`
          );
        }
      }
    }

    for (const [, alert] of alertsByUser) {
      const text = `以下投資策略項目已跌到設定的加碼價：\n\n${alert.items.join("\n")}\n\n請登入 MoneyFlow 查看「投資策略」頁詳細資訊。`;
      const result = await sendMail(alert.email, "【MoneyFlow】投資策略加碼價通知", text);
      if (!result.ok) console.error("[batch-alert-check] 寄信失敗:", result.error);
    }
  } catch (e) {
    console.error("[batch-alert-check] 執行失敗:", e);
  } finally {
    running = false;
  }
}

export function startBatchAlertCheck() {
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
