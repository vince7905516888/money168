// 單一使用者的資產負債總計計算：跟前台「資產總攬」(investment/overview/page.tsx) 用
// 完全一樣的公式，抽出來讓後台總覽可以逐一算出每個會員的數字再加總成「站結」全站數字，
// 兩邊才會對得起來。修改任一邊的公式時記得另一邊也要跟著改。
import { prisma } from "@/lib/prisma";

export interface UserAssetSummary {
  cashBalance: number;
  bankTotal: number;
  stockTotal: number;
  fundTwdTotal: number;
  forexTwdTotal: number;
  cryptoTotal: number;
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
  const [investments, debts, cashTransactions, savedRates, bankTransactions] = await Promise.all([
    prisma.investment.findMany({ where: { userId } }),
    prisma.debt.findMany({ where: { userId } }),
    prisma.transaction.findMany({ where: { userId, source: "CASH" } }),
    prisma.userExchangeRate.findMany({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId, source: "BANK" },
      include: { category: { select: { name: true } } },
    }),
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

  // 銀行資產：跟 /api/banks/summary 完全一樣的 note 字串解析邏輯
  const bankMap: Record<string, { income: number; expense: number; transferIn: number; transferOut: number }> = {};
  const ensureBank = (name: string) => {
    if (!bankMap[name]) bankMap[name] = { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
  };
  for (const t of bankTransactions) {
    if (t.type === "EXPENSE" && t.note?.startsWith("支付:銀行:")) {
      const name = t.note.split(":")[2];
      if (name) { ensureBank(name); bankMap[name].expense += t.amount; }
    } else if (t.type === "EXPENSE" && t.category?.name === "銀行" && t.note) {
      const name = t.note.split(" · ")[0];
      if (name) { ensureBank(name); bankMap[name].expense += t.amount; }
    } else if (t.type === "INCOME" && t.category?.name === "銀行" && t.note) {
      const name = t.note.split(" · ")[0];
      if (name) { ensureBank(name); bankMap[name].income += t.amount; }
    } else if (t.type === "TRANSFER" && t.note) {
      const match = t.note.match(/FROM:([^:]+):?([^|]*)\|TO:([^:]+):?(.*)/);
      if (match) {
        const [, fromType, fromDetail, toType, toDetail] = match;
        if (fromType === "銀行" && fromDetail) { ensureBank(fromDetail); bankMap[fromDetail].transferOut += t.amount; }
        if (toType === "銀行" && toDetail) { ensureBank(toDetail); bankMap[toDetail].transferIn += t.amount; }
      }
    }
  }
  const bankTotal = Object.values(bankMap).reduce((s, d) => s + d.income + d.transferIn - d.expense - d.transferOut, 0);

  const stockTotal = sumAmount(byType("STOCK"));
  const cryptoTotal = sumAmount(byType("CRYPTO"));
  const goldTotal = sumAmount(byType("GOLD"));
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
    cashBalance + bankTotal + stockTotal + fundTwdTotal + forexTwdTotal + cryptoTotal + goldTotal + realestateTotal + insuranceTotal;
  const netWorth = positiveAssetsTotal - debtTotal;

  return {
    cashBalance,
    bankTotal,
    stockTotal,
    fundTwdTotal,
    forexTwdTotal,
    cryptoTotal,
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
    fundTwdTotal: 0,
    forexTwdTotal: 0,
    cryptoTotal: 0,
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
    fundTwdTotal: acc.fundTwdTotal + s.fundTwdTotal,
    forexTwdTotal: acc.forexTwdTotal + s.forexTwdTotal,
    cryptoTotal: acc.cryptoTotal + s.cryptoTotal,
    goldTotal: acc.goldTotal + s.goldTotal,
    realestateTotal: acc.realestateTotal + s.realestateTotal,
    insuranceTotal: acc.insuranceTotal + s.insuranceTotal,
    positiveAssetsTotal: acc.positiveAssetsTotal + s.positiveAssetsTotal,
    debtTotal: acc.debtTotal + s.debtTotal,
    netWorth: acc.netWorth + s.netWorth,
  }), emptyAssetSummary());
}
