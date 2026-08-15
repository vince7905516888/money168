import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// 免費、不需金鑰的證交所公開資訊觀測站端點，僅提供上市股票（不含上櫃），資料可能延遲，僅供參考。
const TWSE_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };
const DAYS_TO_SHOW = 20;
const CANDIDATE_CALENDAR_DAYS = 40; // 涵蓋假日/連續假期，確保能湊到 20 個交易日

function toDateStr(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr: string) {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

async function fetchWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

// T86／MI_MARGN 都是「當日全部股票」的日報表，遇到假日/尚未收盤結算會是空的，
// 逐一嘗試最近 40 個日曆日、篩出有資料且找得到該股票的交易日，取最近 20 筆。
async function fetchRecentDaysReport(
  urlBuilder: (dateStr: string) => string,
  cleanCode: string
): Promise<Array<{ dateStr: string; row: string[] }>> {
  const today = new Date();
  const candidateDates = Array.from({ length: CANDIDATE_CALENDAR_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return toDateStr(d);
  });

  const fetched = await fetchWithConcurrency(candidateDates, 4, async (dateStr) => {
    try {
      const res = await fetch(urlBuilder(dateStr), { headers: TWSE_HEADERS, cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      const rows: string[][] | undefined = json?.data ?? json?.tables?.[1]?.data;
      if (!rows || rows.length === 0) return null;
      const row = rows.find((r) => r[0]?.trim() === cleanCode);
      if (!row) return null;
      return { dateStr, row };
    } catch {
      return null;
    }
  });

  return fetched
    .filter((r): r is { dateStr: string; row: string[] } => r != null)
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
    .slice(0, DAYS_TO_SHOW);
}

const num = (s: string | undefined) => (s ? parseInt(s.replace(/,/g, ""), 10) : 0);

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const [institutionalRows, marginRows] = await Promise.all([
    fetchRecentDaysReport(
      (dateStr) => `https://www.twse.com.tw/rwd/zh/fund/T86?date=${dateStr}&selectType=ALL&response=json`,
      cleanCode
    ),
    fetchRecentDaysReport(
      (dateStr) => `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${dateStr}&selectType=ALL&response=json`,
      cleanCode
    ),
  ]);

  if (institutionalRows.length === 0 && marginRows.length === 0) {
    return NextResponse.json({ error: "查無此股票的法人／融資融券資料（可能是上櫃股票，此資料源僅涵蓋上市）" }, { status: 404 });
  }

  // T86 欄位（單位：股）：0代號 1名稱 2-4外陸資(不含自營商) 5-7外資自營商 8-10投信 11自營商合計 12-17自營商細項 18三大法人合計
  const institutional = institutionalRows.map(({ dateStr, row: r }) => {
    const foreignNet = num(r[4]) + num(r[7]); // 外資+外資自營商 買賣超合計
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
  });

  // MI_MARGN 融資融券彙總欄位（單位：張）：0代號 1名稱 2-7融資(買進/賣出/現金償還/前日餘額/今日餘額/限額) 8-13融券(同上) 14資券互抵
  const margin = marginRows.map(({ dateStr, row: r }) => {
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
  });

  return NextResponse.json({ institutional, margin });
}
