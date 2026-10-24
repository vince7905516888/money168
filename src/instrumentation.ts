// Next.js 在建立新的伺服器實例時只會呼叫一次 register()，用來啟動背景排程。
// 只在正式環境的 Node.js runtime 執行，避免本地開發或 edge runtime 誤觸發外部 API 呼叫。
//
// 注意：這裡掛的都是輕量排程（單一或兩支「全市場一次回傳」的API，不逐檔股票迴圈）。
// 之前掛過全市場資料排程（tw-stock-refresh-all.ts 的 startTwStockAutoRefresh，包含EPS／
// 集保股權分散表快照——這兩個是逐檔股票各打一次API，上千筆請求）導致開機時記憶體用量暴增、
// JavaScript heap out of memory、不斷重開機當機，已經移除；不要在這裡加回全市場逐檔迴圈等級
// 的重量級排程。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

  const { startFuturesAutoRefresh } = await import("@/lib/taifex-auto-refresh");
  startFuturesAutoRefresh();

  // 投資策略加碼價通知：只掃有填加碼目標價的列（見 batch-alert-check.ts），量級跟上面
  // 期貨未平倉排程同等級，不是全市場排程。
  const { startBatchAlertCheck } = await import("@/lib/batch-alert-check");
  startBatchAlertCheck();

  // 投資試算表「目前市值」股價：只掃有填股票代號的試算方案（見 calculator-price-refresh.ts），
  // 量級跟上面兩個排程同等級，不是全市場排程。
  const { startCalculatorPriceAutoRefresh } = await import("@/lib/calculator-price-refresh");
  startCalculatorPriceAutoRefresh();

  // 台股融資融券餘額：上市、上櫃各一支「單一日期、全部股票」的API（見
  // tw-stock-margin-auto-refresh.ts），不逐檔股票迴圈，量級跟上面幾個排程相同。
  const { startMarginAutoRefresh } = await import("@/lib/tw-stock-margin-auto-refresh");
  startMarginAutoRefresh();
}
