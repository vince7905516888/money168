// 美股報價/K線/基本面資料：免費、不需金鑰的 Yahoo Finance 端點，資料可能延遲且非正式授權來源，
// 僅供個人參考使用。跟台股頁面用的是同一套 v8/finance/chart 端點，但美股不用像台股那樣
// 分別嘗試 .TW/.TWO 後綴、也不需要另外接 FinMind——單一端點就能涵蓋日/週/月線的完整歷史。

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };

export interface UsQuoteMeta {
  symbol: string;
  longName: string | null;
  shortName: string | null;
  currency: string;
  exchangeName: string;
  regularMarketPrice: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  regularMarketVolume: number | null;
  chartPreviousClose: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface UsCandle {
  time: number; // unix seconds，直接對應 CandlestickChart 元件要的格式
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface UsChartResult {
  meta: UsQuoteMeta;
  candles: UsCandle[];
}

export async function fetchUsStockChart(symbol: string, range: string, interval: string): Promise<UsChartResult | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
      { headers: HEADERS, cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const m = result.meta ?? {};
    const meta: UsQuoteMeta = {
      symbol: m.symbol ?? symbol,
      longName: m.longName ?? null,
      shortName: m.shortName ?? null,
      currency: m.currency ?? "USD",
      exchangeName: m.fullExchangeName ?? m.exchangeName ?? "",
      regularMarketPrice: m.regularMarketPrice ?? null,
      regularMarketDayHigh: m.regularMarketDayHigh ?? null,
      regularMarketDayLow: m.regularMarketDayLow ?? null,
      regularMarketVolume: m.regularMarketVolume ?? null,
      chartPreviousClose: m.chartPreviousClose ?? m.previousClose ?? null,
      fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: m.fiftyTwoWeekLow ?? null,
    };

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const candles: UsCandle[] = timestamps
      .map((time, i) => ({
        time,
        open: quote.open?.[i] ?? null,
        high: quote.high?.[i] ?? null,
        low: quote.low?.[i] ?? null,
        close: quote.close?.[i] ?? null,
        volume: quote.volume?.[i] ?? null,
      }))
      .filter((c): c is UsCandle => c.open != null && c.high != null && c.low != null && c.close != null);

    return { meta, candles };
  } catch {
    return null;
  }
}

// Yahoo 的 quoteSummary（基本面資料）端點現在需要 cookie+crumb 才能存取，不像 chart 端點可以直接打。
// crumb 綁在 session cookie 上，快取起來重複使用，遇到401/crumb失效才重新取一次，避免每次查詢都
// 多打兩支額外的請求。
let crumbCache: { cookie: string; crumb: string; fetchedAt: number } | null = null;
const CRUMB_TTL_MS = 30 * 60 * 1000; // 30分鐘

async function getYahooCrumb(forceRefresh = false): Promise<{ cookie: string; crumb: string } | null> {
  if (!forceRefresh && crumbCache && Date.now() - crumbCache.fetchedAt < CRUMB_TTL_MS) {
    return crumbCache;
  }
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: HEADERS, redirect: "manual" });
    const setCookie = cookieRes.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : "";
    if (!cookie) return null;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...HEADERS, Cookie: cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb) return null;

    crumbCache = { cookie, crumb, fetchedAt: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}

export interface UsFundamentals {
  trailingPE: number | null;
  forwardPE: number | null;
  marketCap: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  beta: number | null;
  averageVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

function num(field: { raw?: number } | undefined): number | null {
  return typeof field?.raw === "number" ? field.raw : null;
}

async function callQuoteSummary(symbol: string, auth: { cookie: string; crumb: string }) {
  const modules = "summaryDetail,defaultKeyStatistics";
  const res = await fetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
    { headers: { ...HEADERS, Cookie: auth.cookie }, cache: "no-store" }
  );
  return res;
}

export async function fetchUsStockFundamentals(symbol: string): Promise<UsFundamentals | null> {
  let auth = await getYahooCrumb();
  if (!auth) return null;

  let res = await callQuoteSummary(symbol, auth);
  if (res.status === 401) {
    // crumb可能過期，強制重新取一次再試一次
    auth = await getYahooCrumb(true);
    if (!auth) return null;
    res = await callQuoteSummary(symbol, auth);
  }
  if (!res.ok) return null;

  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) return null;

  const summaryDetail = result.summaryDetail ?? {};
  const keyStats = result.defaultKeyStatistics ?? {};

  return {
    trailingPE: num(summaryDetail.trailingPE),
    forwardPE: num(summaryDetail.forwardPE),
    marketCap: num(summaryDetail.marketCap ?? keyStats.marketCap),
    dividendRate: num(summaryDetail.dividendRate),
    dividendYield: num(summaryDetail.dividendYield),
    payoutRatio: num(summaryDetail.payoutRatio),
    beta: num(summaryDetail.beta ?? keyStats.beta),
    averageVolume: num(summaryDetail.averageVolume),
    fiftyTwoWeekHigh: num(summaryDetail.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(summaryDetail.fiftyTwoWeekLow),
  };
}
