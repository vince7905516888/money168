// 回傳台灣時區（Asia/Taipei）的今天日期字串（YYYY-MM-DD），給「新增記錄」表單的預設日期用。
// 不可用 new Date().toISOString().split("T")[0]：toISOString 是 UTC，台灣時間 00:00–07:59
// 時會少一天；且若寫成模組層級常數只在模組載入時算一次，伺服器沒重啟就會一直卡在舊日期。
export function getTodayTW() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

// 連續月份清單（含頭尾，"YYYY-MM" 格式，由舊到新），給「依月份顯示持股狀況」這類月份選單用，
// 確保沒有交易的月份也能選到（持股是累計到當月，不是只看當月有沒有異動）
export function monthRange(startMonth: string, endMonth: string): string[] {
  const result: string[] = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [endY, endM] = endMonth.split("-").map(Number);
  while (y < endY || (y === endY && m <= endM)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}
