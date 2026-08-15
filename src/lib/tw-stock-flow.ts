// 三大法人買賣超(T86)／融資融券(MI_MARGN)：免費、不需金鑰的證交所公開資訊觀測站端點，
// 僅提供上市股票（不含上櫃），資料可能延遲，僅供參考。都是「單一日期、全部股票」的日報表，
// 沒有「單一股票、歷史區間」查詢功能，只能逐日一天一天查、篩出該股票那一列。
// institutional/route.ts（近20日顯示）跟 flow-history/route.ts（補歷史給趨勢圖用）共用這裡的抓取邏輯。

const TWSE_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };

export function toDateStr(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDisplayDate(dateStr: string) {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

export async function fetchWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const num = (s: string | undefined) => (s ? parseInt(s.replace(/,/g, ""), 10) : 0);

export interface InstitutionalDayRow {
  date: string;
  foreignNetLots: number;
  trustNetLots: number;
  dealerNetLots: number;
  totalNetLots: number;
}

export interface MarginDayRow {
  date: string;
  marginBalance: number;
  marginChange: number;
  shortBalance: number;
  shortChange: number;
}

// T86 欄位（單位：股）：0代號 1名稱 2-4外陸資(不含自營商) 5-7外資自營商 8-10投信 11自營商合計 12-17自營商細項 18三大法人合計
export async function fetchInstitutionalDays(
  cleanCode: string,
  dateStrs: string[],
  concurrency = 4
): Promise<InstitutionalDayRow[]> {
  const fetched = await fetchWithConcurrency(dateStrs, concurrency, async (dateStr) => {
    try {
      const res = await fetch(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${dateStr}&selectType=ALL&response=json`, {
        headers: TWSE_HEADERS,
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = await res.json();
      const rows: string[][] | undefined = json?.data;
      if (!rows || rows.length === 0) return null;
      const r = rows.find((row) => row[0]?.trim() === cleanCode);
      if (!r) return null;
      const foreignNet = num(r[4]) + num(r[7]);
      const trustNet = num(r[10]);
      const dealerNet = num(r[11]);
      const totalNet = num(r[18]);
      return {
        date: formatDisplayDate(dateStr),
        foreignNetLots: Math.round(foreignNet / 1000),
        trustNetLots: Math.round(trustNet / 1000),
        dealerNetLots: Math.round(dealerNet / 1000),
        totalNetLots: Math.round(totalNet / 1000),
      };
    } catch {
      return null;
    }
  });
  return fetched.filter((r): r is InstitutionalDayRow => r != null);
}

// MI_MARGN 融資融券彙總欄位（單位：張）：0代號 1名稱 2-7融資(買進/賣出/現金償還/前日餘額/今日餘額/限額) 8-13融券(同上) 14資券互抵
export async function fetchMarginDays(cleanCode: string, dateStrs: string[], concurrency = 4): Promise<MarginDayRow[]> {
  const fetched = await fetchWithConcurrency(dateStrs, concurrency, async (dateStr) => {
    try {
      const res = await fetch(
        `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${dateStr}&selectType=ALL&response=json`,
        { headers: TWSE_HEADERS, cache: "no-store" }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const rows: string[][] | undefined = json?.tables?.[1]?.data;
      if (!rows || rows.length === 0) return null;
      const r = rows.find((row) => row[0]?.trim() === cleanCode);
      if (!r) return null;
      const marginPrevBalance = num(r[5]);
      const marginBalance = num(r[6]);
      const shortPrevBalance = num(r[11]);
      const shortBalance = num(r[12]);
      return {
        date: formatDisplayDate(dateStr),
        marginBalance,
        marginChange: marginBalance - marginPrevBalance,
        shortBalance,
        shortChange: shortBalance - shortPrevBalance,
      };
    } catch {
      return null;
    }
  });
  return fetched.filter((r): r is MarginDayRow => r != null);
}
