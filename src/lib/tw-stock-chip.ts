// 個股籌碼面／公司治理補充資料：外資持股比率、借券賣出、當沖比、注意/處置股警示、
// 除權息預告、重大訊息。都是證交所公開資料（部分走 openapi.twse.com.tw 開放資料、
// 部分走原本T86那套 rwd 舊式查詢端點），免金鑰、不需付費。
import { toDateStr, formatDisplayDate } from "./tw-stock-flow";

const TWSE_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };
const numStr = (s: string | undefined) => (s ? parseFloat(s.replace(/,/g, "")) : 0);

// openapi.twse.com.tw 部分端點（announcement/punish、t187ap04_L 等）的日期是民國年7碼
// （例如1150811=民國115年08月11日=西元2026-08-11），跟T86/MI_MARGN那套西元8碼格式不一樣，
// 不能沿用 formatDisplayDate，要另外轉換。
function formatRocDate(rocDateStr: string | undefined): string {
  if (!rocDateStr || rocDateStr.length !== 7) return rocDateStr ?? "";
  const rocYear = parseInt(rocDateStr.slice(0, 3), 10);
  const month = rocDateStr.slice(3, 5);
  const day = rocDateStr.slice(5, 7);
  return `${rocYear + 1911}-${month}-${day}`;
}

// ---------- 外資持股比率 ----------
export interface ForeignHoldingRatio {
  date: string;
  issuedShares: number;
  foreignShares: number;
  foreignHoldingPercent: number;
}
export async function fetchForeignHoldingRatio(code: string, maxDaysBack = 10): Promise<ForeignHoldingRatio | null> {
  const today = new Date();
  for (let i = 0; i < maxDaysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toDateStr(d);
    try {
      const res = await fetch(
        `https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date=${dateStr}&selectType=ALLBUT0999&response=json`,
        { headers: TWSE_HEADERS, cache: "no-store" }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const rows: string[][] | undefined = json?.data;
      if (!rows || rows.length === 0) continue;
      const r = rows.find((row) => row[0]?.trim() === code);
      if (!r) continue;
      return {
        date: formatDisplayDate(dateStr),
        issuedShares: numStr(r[3]),
        foreignShares: numStr(r[5]),
        foreignHoldingPercent: parseFloat(String(r[7])),
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ---------- 當日全市場股價/成交量（STOCK_DAY_ALL，只有最新一天，沒有歷史查詢）----------
interface DailyStockStat {
  close: number;
  volume: number;
}
async function fetchDailyStockStats(codes: string[]): Promise<Map<string, DailyStockStat>> {
  const result = new Map<string, DailyStockStat>();
  if (codes.length === 0) return result;
  const wanted = new Set(codes);
  try {
    const res = await fetch("https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json", {
      headers: TWSE_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return result;
    const text = await res.text();
    const lines = text.trim().split("\n");
    for (const line of lines.slice(1)) {
      const cells = line.split('","').map((c) => c.replace(/^"|"$/g, ""));
      const code = cells[1]?.trim();
      if (!code || !wanted.has(code)) continue;
      const volume = numStr(cells[3]);
      const close = parseFloat(cells[8]);
      result.set(code, { close: Number.isFinite(close) ? close : 0, volume });
    }
  } catch {
    // 靜默放棄
  }
  return result;
}

export async function fetchClosePrices(codes: string[]): Promise<Map<string, number>> {
  const stats = await fetchDailyStockStats(codes);
  const result = new Map<string, number>();
  for (const [code, s] of stats) result.set(code, s.close);
  return result;
}

// ---------- 借券賣出（可借券餘額）----------
export interface LendingAvailability {
  availableVolume: number;
}
export async function fetchLendingAvailability(code: string): Promise<LendingAvailability | null> {
  try {
    const res = await fetch("https://openapi.twse.com.tw/v1/SBL/TWT96U", { headers: TWSE_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const rows: Record<string, string>[] = await res.json();
    const r = rows.find((row) => row.TWSECode === code);
    if (!r) return null;
    return { availableVolume: numStr(r.TWSEAvailableVolume) };
  } catch {
    return null;
  }
}

// ---------- 當沖比 ----------
export interface DayTradingRatio {
  date: string;
  dayTradingShares: number;
  totalShares: number;
  ratioPercent: number | null;
}
export async function fetchDayTradingRatio(code: string, maxDaysBack = 5): Promise<DayTradingRatio | null> {
  const today = new Date();
  for (let i = 0; i < maxDaysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toDateStr(d);
    try {
      const res = await fetch(`https://www.twse.com.tw/exchangeReport/TWTB4U?date=${dateStr}&response=json`, {
        headers: TWSE_HEADERS,
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      const rows: string[][] | undefined = json?.tables?.[1]?.data;
      if (!rows || rows.length === 0) continue;
      const r = rows.find((row) => row[0]?.trim() === code);
      // 當天報表如果還沒完全產生（例如盤中/收盤後資料尚未處理完），每一列只會有前3欄
      // （代號/名稱/註記），成交股數等欄位整個不存在（不是空字串），這種情況要當作
      // 這天還沒有資料、往前一天找，不能把 undefined 誤判成 0
      if (!r || r[3] === undefined) continue;
      const dayTradingShares = numStr(r[3]);
      const stats = await fetchDailyStockStats([code]);
      const totalShares = stats.get(code)?.volume ?? 0;
      return {
        date: formatDisplayDate(dateStr),
        dayTradingShares,
        totalShares,
        ratioPercent: totalShares > 0 ? (dayTradingShares / totalShares) * 100 : null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ---------- 注意股／處置股警示 ----------
export interface TradingAlert {
  type: "注意" | "處置";
  date: string;
  reason: string;
  detail?: string;
}
export async function fetchTradingAlerts(code: string): Promise<TradingAlert[]> {
  const alerts: TradingAlert[] = [];
  try {
    const [noticeRes, punishRes] = await Promise.all([
      fetch("https://openapi.twse.com.tw/v1/announcement/notice", { headers: TWSE_HEADERS, cache: "no-store" }),
      fetch("https://openapi.twse.com.tw/v1/announcement/punish", { headers: TWSE_HEADERS, cache: "no-store" }),
    ]);
    if (noticeRes.ok) {
      const rows: Record<string, string>[] = await noticeRes.json();
      for (const r of rows) {
        if (r.Code === code) {
          alerts.push({ type: "注意", date: formatRocDate(r.Date), reason: r.TradingInfoForAttention || "" });
        }
      }
    }
    if (punishRes.ok) {
      const rows: Record<string, string>[] = await punishRes.json();
      for (const r of rows) {
        if (r.Code === code) {
          alerts.push({
            type: "處置",
            date: formatRocDate(r.Date),
            reason: r.ReasonsOfDisposition || "",
            detail: `${r.DispositionMeasures ?? ""}（${r.DispositionPeriod ?? ""}）`,
          });
        }
      }
    }
  } catch {
    // 靜默放棄
  }
  return alerts;
}

// ---------- 除權除息預告 ----------
export interface ExDividendNotice {
  date: string;
  type: string; // 權/息/權息
  cashDividend: number | null;
  stockDividendRatio: string | null;
}
export async function fetchExDividendNotices(code: string): Promise<ExDividendNotice[]> {
  try {
    const res = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL", {
      headers: TWSE_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows: Record<string, string>[] = await res.json();
    return rows
      .filter((r) => r.Code === code)
      .map((r) => ({
        date: formatRocDate(r.Date),
        type: r.Exdividend || "",
        cashDividend: r.CashDividend ? parseFloat(r.CashDividend) : null,
        stockDividendRatio: r.StockDividendRatio || null,
      }));
  } catch {
    return [];
  }
}

// ---------- 每日重大訊息 ----------
export interface MaterialAnnouncement {
  date: string;
  subject: string;
}
export async function fetchMaterialAnnouncements(code: string): Promise<MaterialAnnouncement[]> {
  try {
    const res = await fetch("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", {
      headers: TWSE_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows: Record<string, string>[] = await res.json();
    return rows
      .filter((r) => r["公司代號"] === code)
      .map((r) => ({
        date: formatRocDate(r["發言日期"]),
        subject: (r["主旨 "] ?? r["主旨"] ?? "").trim(),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}
