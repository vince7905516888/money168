// 上櫃(TPEX)版本的三大法人買賣超／融資融券。跟 tw-stock-flow.ts（上市/TWSE版）算的是
// 同一件事，但資料來源、欄位結構完全不同（TWSE是陣列+固定欄位順序，TPEX是另一組舊版
// 網頁報表，日期格式也是民國年），分開一個檔案避免把兩邊的欄位索引混在一起搞錯。
import { formatDisplayDate, fetchWithConcurrency, type InstitutionalDayRow, type MarginDayRow } from "./tw-stock-flow";

const TPEX_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };
const num = (s: string | undefined) => (s ? parseInt(s.replace(/,/g, ""), 10) : 0);

// YYYYMMDD -> 民國 "YYY/MM/DD"
function toRocDate(dateStr: string): string {
  const y = parseInt(dateStr.slice(0, 4), 10) - 1911;
  return `${y}/${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)}`;
}

// 欄位順序（0-based）：0代號 1名稱 2-4外資及陸資(不含自營商) 5-7外資自營商 8-10外資合計
// 11-13投信 14-16自營商自行 17-19自營商避險 20-22自營商合計 23三大法人合計。
// 買賣超股數（單位：股），跟TWSE的T86一樣要/1000換算成張。
export async function fetchTpexInstitutionalDays(
  cleanCode: string,
  dateStrs: string[],
  concurrency = 4
): Promise<InstitutionalDayRow[]> {
  const fetched = await fetchWithConcurrency(dateStrs, concurrency, async (dateStr) => {
    try {
      const res = await fetch(
        `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&se=EW&t=D&d=${toRocDate(dateStr)}&s=0,asc`,
        { headers: TPEX_HEADERS, cache: "no-store" }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const rows: string[][] | undefined = json?.tables?.[0]?.data;
      if (!rows || rows.length === 0) return null;
      const r = rows.find((row) => row[0]?.trim() === cleanCode);
      if (!r) return null;
      const foreignNet = num(r[10]);
      const trustNet = num(r[13]);
      const dealerNet = num(r[22]);
      const totalNet = num(r[23]);
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

// 欄位順序：0代號 1名稱 2前資餘額 3資買 4資賣 5現償 6資餘額 ... 10前券餘額 ... 14券餘額 ...
// 單位已經是張，不用像三大法人那樣/1000。
export async function fetchTpexMarginDays(
  cleanCode: string,
  dateStrs: string[],
  concurrency = 4
): Promise<MarginDayRow[]> {
  const fetched = await fetchWithConcurrency(dateStrs, concurrency, async (dateStr) => {
    try {
      const res = await fetch(
        `https://www.tpex.org.tw/web/stock/margin_trading/margin_balance/margin_bal_result.php?l=zh-tw&d=${toRocDate(dateStr)}&s=0,asc`,
        { headers: TPEX_HEADERS, cache: "no-store" }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const rows: string[][] | undefined = json?.tables?.[0]?.data;
      if (!rows || rows.length === 0) return null;
      const r = rows.find((row) => row[0]?.trim() === cleanCode);
      if (!r) return null;
      const marginPrevBalance = num(r[2]);
      const marginBalance = num(r[6]);
      const shortPrevBalance = num(r[10]);
      const shortBalance = num(r[14]);
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
