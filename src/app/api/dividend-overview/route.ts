import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCryptoDividend } from "@/lib/stock-holdings";
import { computeForexSuggestedRates } from "@/lib/user-asset-summary";
import { fetchCryptoTwdPrices } from "@/lib/crypto-prices";

// 配息總攬：彙整全站各欄目實際記錄的「配息」——股票／基金配息入帳（DividendEntry，排除
// 再買進負數列）、虛擬貨幣配息／質押收益（Investment type=CRYPTO 的配息慣例，見
// isCryptoDividend）、外匯利息收入（Investment type=FOREX 且 name="利息收入"，外匯頁面
// 沒有「配息」這個詞但概念等同於配息），依日期彙整成單一清單，純讀取用的紀錄頁面，
// 不影響其他頁面的資產計算。每筆都換算一個台幣金額（twdAmount）方便跨幣別比較加總：
// 股票／基金視為已經是台幣（DividendEntry 沒有幣別欄位）；虛擬貨幣用目前即時台幣價格換算
// （跟資產總攬的配息市值算法一致，非當時歷史價格）；外匯用已儲存匯率、沒有則用時序加權
// 平均建議匯率（跟資產總攬同一套邏輯）。
export interface DividendOverviewRecord {
  id: string;
  source: "STOCK" | "FUND" | "CRYPTO" | "FOREX";
  name: string;
  code: string | null; // 虛擬貨幣：幣種代碼；外匯：幣別
  date: string;
  amount: number | null; // 股票／基金：配息入帳金額（台幣）
  quantity: number | null; // 虛擬貨幣：配息收到的幣數；外匯：利息收到的外幣金額
  twdAmount: number; // 統一換算的台幣金額，方便跨幣別比較加總
  note: string | null;
}

const SOURCE_LABEL: Record<DividendOverviewRecord["source"], string> = {
  STOCK: "股票",
  FUND: "基金",
  CRYPTO: "虛擬貨幣",
  FOREX: "外匯",
};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const [dividendEntries, cryptoInvestments, forexInvestments, savedRates] = await Promise.all([
    prisma.dividendEntry.findMany({ where: { userId: session.user.id, amount: { gt: 0 } } }),
    prisma.investment.findMany({ where: { userId: session.user.id, type: "CRYPTO" } }),
    prisma.investment.findMany({ where: { userId: session.user.id, type: "FOREX" } }),
    prisma.userExchangeRate.findMany({ where: { userId: session.user.id } }),
  ]);

  const cryptoDividends = cryptoInvestments.filter(isCryptoDividend);
  const forexInterest = forexInvestments.filter((i) => i.name === "利息收入");

  const cryptoCodes = [...new Set(cryptoDividends.map((i) => (i.code || i.name || "").toUpperCase()).filter(Boolean))];
  const { prices: cryptoPrices } =
    cryptoCodes.length > 0 ? await fetchCryptoTwdPrices(cryptoCodes) : { prices: {} as Record<string, number> };

  const savedRateMap = new Map(savedRates.map((r) => [r.currency, r.rate]));
  const suggestedRates = computeForexSuggestedRates(
    forexInvestments.map((i) => ({ ...i, date: i.date ?? i.createdAt }))
  );
  const rateFor = (currency: string | null) => {
    if (!currency) return 0;
    return savedRateMap.get(currency) ?? suggestedRates[currency] ?? 0;
  };

  const records: DividendOverviewRecord[] = [
    ...dividendEntries.map((e) => ({
      id: e.id,
      source: e.type as "STOCK" | "FUND",
      name: e.name,
      code: e.code,
      date: e.date.toISOString(),
      amount: e.amount,
      quantity: null,
      twdAmount: e.amount,
      note: e.note,
    })),
    ...cryptoDividends.map((i) => {
      const code = (i.code || i.name || "").toUpperCase();
      const price = cryptoPrices[code] ?? 0;
      return {
        id: i.id,
        source: "CRYPTO" as const,
        name: i.name || i.code || "(未命名)",
        code: i.code,
        date: i.date.toISOString(),
        amount: null,
        quantity: i.quantity,
        twdAmount: (i.quantity ?? 0) * price,
        note: i.note,
      };
    }),
    ...forexInterest.map((i) => ({
      id: i.id,
      source: "FOREX" as const,
      name: i.currency ? `${i.currency} 利息收入` : "利息收入",
      code: i.currency,
      date: i.date.toISOString(),
      amount: null,
      quantity: i.quantity,
      twdAmount: (i.quantity ?? 0) * rateFor(i.currency),
      note: i.note,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const years = Array.from(new Set(records.map((r) => new Date(r.date).getFullYear()))).sort((a, b) => b - a);

  return NextResponse.json({ records, years, sourceLabel: SOURCE_LABEL });
}
