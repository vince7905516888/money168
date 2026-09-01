// Next.js 在建立新的伺服器實例時只會呼叫一次 register()，用來啟動背景排程。
// 只在正式環境的 Node.js runtime 執行，避免本地開發或 edge runtime 誤觸發外部 API 呼叫。
//
// 注意：這裡只掛期貨未平倉這一項輕量排程（見 taifex-auto-refresh.ts），
// 之前掛過全市場資料排程（tw-stock-refresh-all.ts 的 startTwStockAutoRefresh）
// 導致開機時記憶體用量暴增、JavaScript heap out of memory、不斷重開機當機，
// 已經移除；不要在這裡加回全市場等級的重量級排程。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

  const { startFuturesAutoRefresh } = await import("@/lib/taifex-auto-refresh");
  startFuturesAutoRefresh();

  // 投資策略加碼價通知：只掃有填加碼目標價的列（見 batch-alert-check.ts），量級跟上面
  // 期貨未平倉排程同等級，不是全市場排程。
  const { startBatchAlertCheck } = await import("@/lib/batch-alert-check");
  startBatchAlertCheck();
}
