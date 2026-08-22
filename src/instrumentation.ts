// Next.js 在建立新的伺服器實例時只會呼叫一次 register()，用來啟動背景排程。
// 只在正式環境的 Node.js runtime 執行，避免本地開發或 edge runtime 誤觸發外部 API 呼叫。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

  const { startTwStockAutoRefresh } = await import("@/lib/tw-stock-refresh-all");
  startTwStockAutoRefresh();
}
