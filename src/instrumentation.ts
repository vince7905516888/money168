// 自動排程暫時停用：伺服器啟動時立刻觸發全市場資料抓取，跟正常開機流程搶記憶體，
// 導致正式環境 JavaScript heap out of memory、開機即當機、不斷重開機循環（見事故記錄）。
// 手動的「全部抓取」按鈕（/admin/config/stock-market）維持可用，之後要重新啟用自動排程
// 需要先解決記憶體用量問題（例如錯開時間、分批執行、避免開機當下就跑）。
export async function register() {}
