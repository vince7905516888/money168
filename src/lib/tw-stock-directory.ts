// 台股代碼／中文簡稱對照表：合併證交所（上市）與櫃買中心（上櫃）的公開資料，
// 供台灣股市頁顯示中文名稱、以及用中文搜尋股票代碼使用。
// Node process 內存快取，Railway 是持續運行的 process 所以這個 module-level cache 有效；
// 6 小時內重複查詢不會再打上游 API。

export interface StockDirEntry {
  code: string;
  name: string;
  market: "TW" | "TWO";
}

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小時
let cache: { list: StockDirEntry[]; fetchedAt: number } | null = null;
let inflight: Promise<StockDirEntry[]> | null = null;

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };

// 證交所/櫃買中心的「公司基本資料」清冊，結構上只收錄公司股票，不含ETF／債券基金
// （例如00722B群益投資級債），所以另外用FinMind的證券清單（涵蓋股票+ETF+基金）補上
// 缺漏的代碼；只在證交所/櫃買清冊沒有該代碼時才採用FinMind的名稱，不影響現有正常運作
// 的一般股票搜尋結果。
async function fetchFinMindSupplement(): Promise<StockDirEntry[]> {
  try {
    const res = await fetch("https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.status !== 200 || !Array.isArray(json.data)) return [];
    return (json.data as Array<{ stock_id?: string; stock_name?: string; type?: string }>)
      .filter((r) => r.stock_id && r.stock_name)
      .map((r) => ({
        code: r.stock_id!.trim(),
        name: r.stock_name!.trim(),
        market: r.type === "tpex" ? ("TWO" as const) : ("TW" as const),
      }));
  } catch {
    return [];
  }
}

async function fetchDirectory(): Promise<StockDirEntry[]> {
  const [twseRes, tpexRes, finmindSupplement] = await Promise.all([
    fetch("https://openapi.twse.com.tw/v1/opendata/t187ap03_L", { headers: HEADERS, cache: "no-store" }).catch(() => null),
    fetch("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O", { headers: HEADERS, cache: "no-store" }).catch(() => null),
    fetchFinMindSupplement(),
  ]);

  const twseData: Array<Record<string, string>> = twseRes?.ok ? await twseRes.json() : [];
  const tpexData: Array<Record<string, string>> = tpexRes?.ok ? await tpexRes.json() : [];

  const twse: StockDirEntry[] = twseData
    .filter((r) => r["公司代號"] && r["公司簡稱"])
    .map((r) => ({ code: r["公司代號"].trim(), name: r["公司簡稱"].trim(), market: "TW" as const }));

  const tpex: StockDirEntry[] = tpexData
    .filter((r) => r["SecuritiesCompanyCode"] && r["CompanyAbbreviation"])
    .map((r) => ({ code: r["SecuritiesCompanyCode"].trim(), name: r["CompanyAbbreviation"].trim(), market: "TWO" as const }));

  const known = new Set([...twse, ...tpex].map((s) => s.code));
  // FinMind同一代碼可能有多筆歷史快照（名稱/類別隨時間變動），用Map去重取最後一筆。
  const supplementByCode = new Map(finmindSupplement.filter((s) => !known.has(s.code)).map((s) => [s.code, s]));
  const supplement = [...supplementByCode.values()];

  return [...twse, ...tpex, ...supplement];
}

export async function getStockDirectory(): Promise<StockDirEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.list;
  if (inflight) return inflight;

  inflight = fetchDirectory()
    .then((list) => {
      cache = { list, fetchedAt: Date.now() };
      return list;
    })
    .catch(() => cache?.list ?? [])
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function lookupStockName(code: string): Promise<string | null> {
  const list = await getStockDirectory();
  return list.find((s) => s.code === code)?.name ?? null;
}

export async function searchStocks(query: string, limit = 15): Promise<StockDirEntry[]> {
  const q = query.trim();
  if (!q) return [];
  const list = await getStockDirectory();
  const isNumeric = /^\d+$/.test(q);
  const results = list.filter((s) => s.code.startsWith(q) || (!isNumeric && s.name.includes(q)));
  // 代碼完全對應的排最前面，其次代碼前綴，其餘名稱包含的在後面
  results.sort((a, b) => {
    const aExact = a.code === q ? 0 : a.code.startsWith(q) ? 1 : 2;
    const bExact = b.code === q ? 0 : b.code.startsWith(q) ? 1 : 2;
    return aExact - bExact;
  });
  return results.slice(0, limit);
}
