// 回傳台灣時區（Asia/Taipei）的今天日期字串（YYYY-MM-DD），給「新增記錄」表單的預設日期用。
// 不可用 new Date().toISOString().split("T")[0]：toISOString 是 UTC，台灣時間 00:00–07:59
// 時會少一天；且若寫成模組層級常數只在模組載入時算一次，伺服器沒重啟就會一直卡在舊日期。
export function getTodayTW() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}
