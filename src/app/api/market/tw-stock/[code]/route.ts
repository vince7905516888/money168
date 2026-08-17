import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lookupStockName, getStockDirectory } from "@/lib/tw-stock-directory";
import { fetchLiveQuote } from "@/lib/shioaji-gateway";

// K線週期對應的 Yahoo Finance interval/range：週期越大，抓的歷史範圍越長，
// 方便搭配前端新增的縮放(Brush)功能回顧更長的歷史。
// 只有 60分K 還走這條路，日/週/月線已改用 FinMind（見下方 fetchFinMindDaily）。
const INTERVAL_CONFIG: Record<string, { interval: string; range: string; intraday: boolean }> = {
  "60m": { interval: "60m", range: "1y", intraday: true },
};

// 免費、不需金鑰的 Yahoo Finance chart 端點，資料可能延遲且非正式授權來源，僅供個人參考使用。
// 上市股票用 .TW 後綴、上櫃股票用 .TWO 後綴，依序嘗試。
async function fetchYahooChart(symbol: string, config: { interval: string; range: string }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  return result;
}

// 60分K要顯示到時分，其餘週期只顯示到日期；一律轉成台北時間，避免主機時區（Railway 預設 UTC）跟台股盤中時間對不上。
function formatBarDate(ts: number, intraday: boolean): string {
  const d = new Date(ts * 1000);
  if (intraday) {
    return d.toLocaleString("sv-SE", { timeZone: "Asia/Taipei", hour12: false }).slice(0, 16);
  }
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

interface DailyQuote {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

// FinMind 統一提供上市(TWSE)＋上櫃(TPEX)的官方日線資料，不用像 Yahoo 那樣先猜 .TW 再猜 .TWO，
// 且是收盤後才會出現的正式收盤價，不會有「今天這筆 close 是 null」被前端過濾掉的問題。
// 免費額度只到日線，沒有分鐘K，60分K仍走上面的 Yahoo Finance。
async function fetchFinMindDaily(code: string, startDate: string): Promise<DailyQuote[] | null> {
  const token = process.env.FINMIND_TOKEN;
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startDate}${
    token ? `&token=${token}` : ""
  }`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.status !== 200 || !Array.isArray(json.data)) return null;

  return json.data.map(
    (row: { date: string; open: number | null; max: number | null; min: number | null; close: number | null; Trading_Volume: number | null }) => ({
      date: row.date,
      open: row.open,
      high: row.max,
      low: row.min,
      close: row.close,
      volume: row.Trading_Volume,
    })
  );
}

function finMindStartDate(interval: string): string {
  const now = new Date();
  if (interval === "1wk") now.setFullYear(now.getFullYear() - 5);
  else if (interval === "1mo") now.setFullYear(now.getFullYear() - 40); // 抓全部歷史，月線資料量小無妨
  else now.setFullYear(now.getFullYear() - 2); // 1d
  return now.toISOString().slice(0, 10);
}

// 把日K依週/月分組彙整：開盤取區間第一筆、收盤取最後一筆、高低取極值、量加總。
function aggregateDaily(daily: DailyQuote[], bucketKey: (date: string) => string): DailyQuote[] {
  const order: string[] = [];
  const groups = new Map<string, DailyQuote[]>();
  for (const q of daily) {
    const key = bucketKey(q.date);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(q);
  }
  return order.map((key) => {
    const rows = groups.get(key)!;
    const highs = rows.map((r) => r.high).filter((v): v is number => v != null);
    const lows = rows.map((r) => r.low).filter((v): v is number => v != null);
    return {
      date: rows[rows.length - 1].date,
      open: rows[0].open,
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      close: rows[rows.length - 1].close,
      volume: rows.reduce((s, r) => s + (r.volume ?? 0), 0),
    };
  });
}

function weekBucket(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay() || 7; // 週一=1 ... 週日=7
  d.setUTCDate(d.getUTCDate() - day + 1); // 回推到該週週一
  return d.toISOString().slice(0, 10);
}

function monthBucket(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const intervalParam = req.nextUrl.searchParams.get("interval") ?? "1d";

  let market: "TW" | "TWO" = "TW";
  let quotes: DailyQuote[];

  if (intervalParam === "60m") {
    const config = INTERVAL_CONFIG["60m"];
    let result = await fetchYahooChart(`${cleanCode}.TW`, config);
    if (!result) {
      result = await fetchYahooChart(`${cleanCode}.TWO`, config);
      market = "TWO";
    }
    if (!result) {
      return NextResponse.json({ error: "查無此股票代碼" }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    quotes = timestamps
      .map((ts, i) => ({
        date: formatBarDate(ts, config.intraday),
        open: quote.open?.[i] ?? null,
        high: quote.high?.[i] ?? null,
        low: quote.low?.[i] ?? null,
        close: quote.close?.[i] ?? null,
        volume: quote.volume?.[i] ?? null,
      }))
      .filter((q) => q.open != null && q.close != null);
  } else {
    const directory = await getStockDirectory();
    market = directory.find((s) => s.code === cleanCode)?.market ?? "TW";

    const startDate = finMindStartDate(intervalParam);
    const daily = await fetchFinMindDaily(cleanCode, startDate);
    if (!daily || daily.length === 0) {
      return NextResponse.json({ error: "查無此股票代碼" }, { status: 404 });
    }
    const cleanDaily = daily.filter((q) => q.open != null && q.close != null);

    if (intervalParam === "1wk") quotes = aggregateDaily(cleanDaily, weekBucket);
    else if (intervalParam === "1mo") quotes = aggregateDaily(cleanDaily, monthBucket);
    else quotes = cleanDaily;
  }

  if (quotes.length === 0) {
    return NextResponse.json({ error: "此股票目前沒有可用的歷史資料" }, { status: 404 });
  }

  const [chineseName, liveQuote] = await Promise.all([
    lookupStockName(cleanCode).catch(() => null),
    fetchLiveQuote(cleanCode),
  ]);

  return NextResponse.json({
    code: cleanCode,
    market,
    name: chineseName || cleanCode,
    currency: "TWD",
    quotes,
    liveQuote,
  });
}
