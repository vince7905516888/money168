// 期交所（TAIFEX，跟證交所TWSE是不同單位）三大法人期貨未平倉：免費OpenAPI，不需金鑰。
// 跟集保股權分散表一樣沒有歷史查詢功能，只回傳最新一天，只能逐日snapshot累積歷史。
import { prisma } from "@/lib/prisma";

const TAIFEX_URL =
  "https://openapi.taifex.com.tw/v1/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate";

interface RawRow {
  Date: string;
  ContractCode: string;
  Item: string;
  "OpenInterest(Long)": string;
  "OpenInterest(Short)": string;
  "OpenInterest(Net)": string;
}

export interface FuturesPosition {
  contractCode: string;
  item: string;
  longOpenInterest: number;
  shortOpenInterest: number;
  netOpenInterest: number;
}

export interface FuturesPositionsResult {
  date: string;
  positions: FuturesPosition[];
}

const num = (s: string | undefined) => (s ? parseInt(s.replace(/,/g, ""), 10) : 0);

// 這支 OpenAPI 同一個網址，依來源（可能是IP或快取節點）有時回傳JSON、有時回傳CSV
// （欄位內容一樣，只是格式不同），兩種都要能解析，否則遇到CSV那次res.json()會丟例外
// 被外層catch吃掉變成「無資料」，造成排程空轉、資料停更。
function parseRows(text: string): RawRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  const [, ...dataLines] = trimmed.split(/\r?\n/).filter(Boolean);
  return dataLines.map((line) => {
    const c = line.split(",");
    return {
      Date: c[0],
      ContractCode: c[1],
      Item: c[2],
      "OpenInterest(Long)": c[9],
      "OpenInterest(Short)": c[11],
      "OpenInterest(Net)": c[13],
    };
  });
}

export async function fetchFuturesPositions(): Promise<FuturesPositionsResult | null> {
  try {
    const res = await fetch(TAIFEX_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[taifex] API 回應非200:", res.status);
      return null;
    }
    const rows: RawRow[] = parseRows(await res.text());
    if (!rows || rows.length === 0) return null;

    const rocDate = rows[0].Date; // YYYYMMDD 西元格式（跟T86一樣，非民國年）
    const date = `${rocDate.slice(0, 4)}-${rocDate.slice(4, 6)}-${rocDate.slice(6, 8)}`;

    const positions = rows.map((r) => ({
      contractCode: r.ContractCode,
      item: r.Item,
      longOpenInterest: num(r["OpenInterest(Long)"]),
      shortOpenInterest: num(r["OpenInterest(Short)"]),
      netOpenInterest: num(r["OpenInterest(Net)"]),
    }));

    // 逐日存檔：每個契約+身份別一筆，已存過的當天資料靠 skipDuplicates 跳過；
    // 順便清掉365天以前的舊資料，只保留最近一年，避免這張表無限長下去
    try {
      await prisma.futuresPositionSnapshot.createMany({
        data: positions.map((p) => ({ date, ...p })),
        skipDuplicates: true,
      });
      const retentionCutoff = new Date();
      retentionCutoff.setDate(retentionCutoff.getDate() - 365);
      const cutoffStr = `${retentionCutoff.getFullYear()}-${String(retentionCutoff.getMonth() + 1).padStart(2, "0")}-${String(retentionCutoff.getDate()).padStart(2, "0")}`;
      await prisma.futuresPositionSnapshot.deleteMany({ where: { date: { lt: cutoffStr } } });
    } catch {
      // 存檔/清理失敗不影響本次查詢結果
    }

    return { date, positions };
  } catch (e) {
    console.error("[taifex] fetchFuturesPositions 失敗:", e);
    return null;
  }
}
