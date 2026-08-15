// 個股基本資料：合併證交所（上市 t187ap03_L）與櫃買中心（上櫃 mopsfin_t187ap03_O）
// 公司基本資料公開資料，免費、合法的政府公開資料。產業別是文字版而不是代碼，
// 借用 tw-stock-fundamentals.ts 月營收資料集裡現成的文字欄位，不用自己維護代碼對照表。

import { getIndustryName } from "@/lib/tw-stock-fundamentals";

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" };
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小時，公司基本資料不會常變動

function makeCache<T>(fetcher: () => Promise<T[]>) {
  let cache: { list: T[]; fetchedAt: number } | null = null;
  let inflight: Promise<T[]> | null = null;
  return async (): Promise<T[]> => {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.list;
    if (inflight) return inflight;
    inflight = fetcher()
      .then((list) => {
        cache = { list, fetchedAt: Date.now() };
        return list;
      })
      .catch(() => cache?.list ?? [])
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

async function fetchJson(url: string): Promise<Array<Record<string, string>>> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

const getTwseProfiles = makeCache(() => fetchJson("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"));
const getTpexProfiles = makeCache(() => fetchJson("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"));

export interface CompanyProfile {
  code: string;
  name: string;
  englishName: string | null;
  industry: string | null;
  chairman: string | null;
  generalManager: string | null;
  spokesman: string | null;
  foundedDate: string | null; // YYYY-MM-DD
  listedDate: string | null; // YYYY-MM-DD
  capital: number | null; // 實收資本額（元）
  issuedShares: number | null; // 已發行股數
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  transferAgent: string | null;
  transferAgentPhone: string | null;
  transferAgentAddress: string | null;
}

function formatDate(s: string | undefined): string | null {
  if (!s || s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function toNum(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

export async function getCompanyProfile(code: string): Promise<CompanyProfile | null> {
  const [twseList, tpexList, industry] = await Promise.all([
    getTwseProfiles(),
    getTpexProfiles(),
    getIndustryName(code).catch(() => null),
  ]);

  const twseRow = twseList.find((r) => r["公司代號"] === code);
  if (twseRow) {
    return {
      code,
      name: twseRow["公司名稱"],
      englishName: blank(twseRow["英文簡稱"]),
      industry,
      chairman: blank(twseRow["董事長"]),
      generalManager: blank(twseRow["總經理"]),
      spokesman: blank(twseRow["發言人"]),
      foundedDate: formatDate(twseRow["成立日期"]),
      listedDate: formatDate(twseRow["上市日期"]),
      capital: toNum(twseRow["實收資本額"]),
      issuedShares: toNum(twseRow["已發行普通股數或TDR原股發行股數"]),
      address: blank(twseRow["住址"]),
      phone: blank(twseRow["總機電話"]),
      email: blank(twseRow["電子郵件信箱"]),
      website: blank(twseRow["網址"]),
      transferAgent: blank(twseRow["股票過戶機構"]),
      transferAgentPhone: blank(twseRow["過戶電話"]),
      transferAgentAddress: blank(twseRow["過戶地址"]),
    };
  }

  const tpexRow = tpexList.find((r) => r["SecuritiesCompanyCode"] === code);
  if (tpexRow) {
    return {
      code,
      name: tpexRow["CompanyName"],
      englishName: blank(tpexRow["Symbol"]),
      industry,
      chairman: blank(tpexRow["Chairman"]),
      generalManager: blank(tpexRow["GeneralManager"]),
      spokesman: blank(tpexRow["Spokesman"]),
      foundedDate: formatDate(tpexRow["DateOfIncorporation"]),
      listedDate: formatDate(tpexRow["DateOfListing"]),
      capital: toNum(tpexRow["Paidin.Capital.NTDollars"]),
      issuedShares: toNum(tpexRow["IssueShares"]),
      address: blank(tpexRow["Address"]),
      phone: blank(tpexRow["Telephone"]),
      email: blank(tpexRow["EmailAddress"]),
      website: blank(tpexRow["WebAddress"]),
      transferAgent: blank(tpexRow["StockTransferAgent"]),
      transferAgentPhone: blank(tpexRow["StockTransferAgentTelephone"]),
      transferAgentAddress: blank(tpexRow["StockTransferAgentAddress"]),
    };
  }

  return null;
}
