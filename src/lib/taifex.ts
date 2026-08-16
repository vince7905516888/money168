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

export async function fetchFuturesPositions(): Promise<FuturesPositionsResult | null> {
  try {
    const res = await fetch(TAIFEX_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneyFlowApp/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows: RawRow[] = await res.json();
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

    // 逐日存檔：每個契約+身份別一筆，已存過的當天資料靠 skipDuplicates 跳過
    try {
      await prisma.futuresPositionSnapshot.createMany({
        data: positions.map((p) => ({ date, ...p })),
        skipDuplicates: true,
      });
    } catch {
      // 存檔失敗不影響本次查詢結果
    }

    return { date, positions };
  } catch {
    return null;
  }
}
