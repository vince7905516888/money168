// 單一使用者的資產負債總計計算：跟前台「資產總攬」(investment/overview/page.tsx) 用
// 完全一樣的公式，抽出來讓後台總覽可以逐一算出每個會員的數字再加總成「站結」全站數字，
// 兩邊才會對得起來。修改任一邊的公式時記得另一邊也要跟著改。
import { prisma } from "@/lib/prisma";
import { computeHoldings, remainingCostByAmount, remainingHoldingsByAmount, dividendMarketValue, suspenseOpenCost } from "@/lib/stock-holdings";
import { fetchCryptoTwdPrices } from "@/lib/crypto-prices";
import { computeBankSummaries } from "@/lib/bank-balances";

export interface UserAssetSummary {
  cashBalance: number;
  bankTotal: number;
  stockTotal: number;
  usstockTwdTotal: number;
  fundTwdTotal: number;
  forexTwdTotal: number;
  cryptoTotal: number;
  suspenseTotal: number;
  goldTotal: number;
  realestateTotal: number;
  insuranceTotal: number;
  positiveAssetsTotal: number;
  debtTotal: number;
  netWorth: number;
}

interface InvestmentRow {
  type: string;
  amount: number;
  quantity: number | null;
  currency: string | null;
  date: Date;
  createdAt: Date;
}

// 外匯建議匯率：跟前台一樣的時序加權平均成本法，沒有手動儲存匯率時的預設值
function computeForexSuggestedRates(forexInvestments: InvestmentRow[]): Record<string, number> {
  const byCurrency: Record<string, InvestmentRow[]> = {};
  for (const inv of forexInvestments) {
    if (!inv.currency) continue;
    (byCurrency[inv.currency] ||= []).push(inv);
  }
  const result: Record<string, number> = {};
  for (const [currency, list] of Object.entries(byCurrency)) {
    const sorted = [...list].sort((a, b) => (a.date ?? a.createdAt).getTime() - (b.date ?? b.createdAt).getTime());
    let balance = 0;
    let cost = 0;
    for (const inv of sorted) {
      const qty = inv.quantity || 0;
      if (qty >= 0) {
        balance += qty;
        if (inv.amount > 0) cost += inv.amount;
      } else {
        const rateNow = balance > 0 ? cost / balance : 0;
        const outQty = -qty;
        cost = Math.max(0, cost - rateNow * outQty);
        balance = Math.max(0, balance - outQty);
      }
    }
    result[currency] = balance > 0 ? cost / balance : 0;
  }
  return result;
}

export async function computeUserAssetSummary(userId: string): Promise<UserAssetSummary> {
  const [investments, debts, cashTransactions, savedRates, bankTransactions, suspenseEntries] = await Promise.all([
    prisma.investment.findMany({ where: { userId } }),
    prisma.debt.findMany({ where: { userId } }),
    prisma.transaction.findMany({ where: { userId, source: "CASH" } }),
    prisma.userExchangeRate.findMany({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId, source: "BANK" },
      include: { category: { select: { name: true } } },
    }),
    prisma.suspenseEntry.findMany({ where: { userId } }),
  ]);

  const savedRateMap = new Map(savedRates.map((r) => [r.currency, r.rate]));
  const byType = (t: string) => investments.filter((i) => i.type === t);
  const sumAmount = (list: typeof investments) => list.reduce((s, i) => s + i.amount, 0);

  // 現金結餘：TWD 直接加總，非TWD用已儲存匯率換算（沒儲存過就是 0，跟前台輸入框空白時一致）
  const cashCurrencyBalances: Record<string, number> = {};
  for (const t of cashTransactions) {
    const cur = t.currency || "TWD";
    if (t.type === "INCOME") cashCurrencyBalances[cur] = (cashCurrencyBalances[cur] || 0) + t.amount;
    else if (t.type === "EXPENSE") cashCurrencyBalances[cur] = (cashCurrencyBalances[cur] || 0) - t.amount;
  }
  let cashBalance = cashCurrencyBalances.TWD || 0;
  for (const [cur, bal] of Object.entries(cashCurrencyBalances)) {
    if (cur === "TWD") continue;
    cashBalance += bal * (savedRateMap.get(cur) ?? 0);
  }

  // 銀行資產：跟 /api/banks/summary 同一套計算（src/lib/bank-balances.ts），非台幣帳戶依已儲存匯率換算
  const bankTotal = computeBankSummaries(bankTransactions, savedRateMap).reduce((s, b) => s + b.balance, 0);

  // 股票、美股、虛擬貨幣、黃金：目前仍持有部位的投入成本，跟前台資產總攬同一套算法
  // （不用買賣金額直接加總，否則賣出獲利/虧損會讓已出清的標的留下殘值，成本調整也會被算進去）
  const toHoldingInput = (list: typeof investments) => list.map((i) => ({ ...i, action: i.action ?? "BUY", date: i.date ?? i.createdAt }));
  // 股票、美股用含成本調整的 cost，跟前台資產總攬一致（成本調整（用其他持股的獲利攤平虧損）視為把那筆已入帳的獲利拿去降低這檔的投入資金：）
  const stockTotal = computeHoldings(toHoldingInput(byType("STOCK"))).reduce((s, h) => s + h.cost, 0);
  // 虛擬貨幣：持有成本＋配息的即時市值，跟前台資產總攬一致（價格有 60 秒快取，逐一計算會員時不會重複打 API）
  const cryptoHoldings = remainingHoldingsByAmount(byType("CRYPTO"));
  const dividendCodes = cryptoHoldings.filter((h) => h.dividendQty > 0).map((h) => h.code);
  const { prices: cryptoPrices } = dividendCodes.length > 0 ? await fetchCryptoTwdPrices(dividendCodes) : { prices: {} };
  const cryptoTotal = remainingCostByAmount(byType("CRYPTO")) + dividendMarketValue(cryptoHoldings, cryptoPrices);
  const goldTotal = remainingCostByAmount(byType("GOLD"));
  // 暫計帳（待賺回）：跟前台資產總攬一樣，尚未回補的部分以扣除當下成本計入資產
  const suspenseTotal = suspenseOpenCost(suspenseEntries);

  // 美股：各幣別持有成本，非TWD用已儲存匯率換算
  const usstockInvestments = byType("USSTOCK");
  let usstockTwdTotal = 0;
  for (const cur of new Set(usstockInvestments.map((i) => i.currency || "USD"))) {
    const cost = computeHoldings(toHoldingInput(usstockInvestments.filter((i) => (i.currency || "USD") === cur)))
      .reduce((s, h) => s + h.cost, 0);
    usstockTwdTotal += cur === "TWD" ? cost : cost * (savedRateMap.get(cur) ?? 0);
  }
  const realestateTotal = sumAmount(byType("REALESTATE"));
  const insuranceTotal = sumAmount(byType("INSURANCE"));

  // 基金：依幣別加總原幣金額（amount 本來就是原幣），非TWD用已儲存匯率換算
  const fundCurrencyBalances: Record<string, number> = {};
  for (const i of byType("FUND")) {
    const cur = i.currency || "TWD";
    fundCurrencyBalances[cur] = (fundCurrencyBalances[cur] || 0) + i.amount;
  }
  let fundTwdTotal = fundCurrencyBalances.TWD || 0;
  for (const [cur, bal] of Object.entries(fundCurrencyBalances)) {
    if (cur === "TWD") continue;
    fundTwdTotal += bal * (savedRateMap.get(cur) ?? 0);
  }

  // 外匯：依幣別加總 quantity 餘額，換算台幣。優先用已儲存匯率，沒儲存過就退回時序加權平均建議匯率
  // （跟前台輸入框「有儲存值用儲存值、沒有就帶入建議值」的預設行為一致，數字才會對得起來）
  const forexInvestments = byType("FOREX") as unknown as InvestmentRow[];
  const forexCurrencyBalances: Record<string, number> = {};
  for (const i of forexInvestments) {
    if (!i.currency) continue;
    forexCurrencyBalances[i.currency] = (forexCurrencyBalances[i.currency] || 0) + (i.quantity || 0);
  }
  const forexSuggestedRates = computeForexSuggestedRates(forexInvestments);
  let forexTwdTotal = 0;
  for (const [cur, bal] of Object.entries(forexCurrencyBalances)) {
    const rate = savedRateMap.get(cur) ?? forexSuggestedRates[cur] ?? 0;
    forexTwdTotal += bal * rate;
  }

  const debtTotal = debts.reduce((s, d) => s + d.amount, 0);

  const positiveAssetsTotal =
    cashBalance + bankTotal + stockTotal + usstockTwdTotal + fundTwdTotal + forexTwdTotal + cryptoTotal + suspenseTotal + goldTotal + realestateTotal + insuranceTotal;
  const netWorth = positiveAssetsTotal - debtTotal;

  return {
    cashBalance,
    bankTotal,
    stockTotal,
    usstockTwdTotal,
    fundTwdTotal,
    forexTwdTotal,
    cryptoTotal,
    suspenseTotal,
    goldTotal,
    realestateTotal,
    insuranceTotal,
    positiveAssetsTotal,
    debtTotal,
    netWorth,
  };
}

export function emptyAssetSummary(): UserAssetSummary {
  return {
    cashBalance: 0,
    bankTotal: 0,
    stockTotal: 0,
    usstockTwdTotal: 0,
    fundTwdTotal: 0,
    forexTwdTotal: 0,
    cryptoTotal: 0,
    suspenseTotal: 0,
    goldTotal: 0,
    realestateTotal: 0,
    insuranceTotal: 0,
    positiveAssetsTotal: 0,
    debtTotal: 0,
    netWorth: 0,
  };
}

export function sumAssetSummaries(list: UserAssetSummary[]): UserAssetSummary {
  return list.reduce((acc, s) => ({
    cashBalance: acc.cashBalance + s.cashBalance,
    bankTotal: acc.bankTotal + s.bankTotal,
    stockTotal: acc.stockTotal + s.stockTotal,
    usstockTwdTotal: acc.usstockTwdTotal + s.usstockTwdTotal,
    fundTwdTotal: acc.fundTwdTotal + s.fundTwdTotal,
    forexTwdTotal: acc.forexTwdTotal + s.forexTwdTotal,
    cryptoTotal: acc.cryptoTotal + s.cryptoTotal,
    suspenseTotal: acc.suspenseTotal + s.suspenseTotal,
    goldTotal: acc.goldTotal + s.goldTotal,
    realestateTotal: acc.realestateTotal + s.realestateTotal,
    insuranceTotal: acc.insuranceTotal + s.insuranceTotal,
    positiveAssetsTotal: acc.positiveAssetsTotal + s.positiveAssetsTotal,
    debtTotal: acc.debtTotal + s.debtTotal,
    netWorth: acc.netWorth + s.netWorth,
  }), emptyAssetSummary());
}
