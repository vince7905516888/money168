"use client";

import { useEffect, useState, useCallback } from "react";

type InvestmentType = "STOCK" | "FUND" | "FOREX" | "CRYPTO" | "GOLD" | "REALESTATE" | "INSURANCE";

interface Investment {
  id: string;
  type: InvestmentType;
  name?: string;
  code?: string;
  amount: number;
  quantity?: number;
  currency?: string;
  exchangeRate?: number;
  note?: string;
  transactionId?: string;
  date?: string;
  createdAt: string;
}

interface BankSummary {
  name: string;
  balance: number;
}

interface Debt {
  id: string;
  category: string;
  amount: number;
}

interface CashTransaction {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
}

interface ExchangeRateRow {
  id: string;
  currency: string;
  rate: number;
}

const TYPE_LABEL: Record<InvestmentType, string> = {
  STOCK: "股票",
  FUND: "基金",
  FOREX: "外匯",
  CRYPTO: "虛擬貨幣",
  GOLD: "黃金",
  REALESTATE: "不動產",
  INSURANCE: "保險",
};

export default function InvestmentOverviewPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [savedRates, setSavedRates] = useState<ExchangeRateRow[]>([]);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [rateSavingCurrency, setRateSavingCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [invRes, bankRes, debtRes, rateRes, cashRes] = await Promise.all([
      fetch("/api/investments"),
      fetch("/api/banks/summary"),
      fetch("/api/debts"),
      fetch("/api/user-exchange-rates"),
      fetch("/api/transactions?source=CASH"),
    ]);
    const [invData, bankData, debtData, rateData, cashData] = await Promise.all([
      invRes.json(), bankRes.json(), debtRes.json(), rateRes.json(), cashRes.json(),
    ]);
    setInvestments(Array.isArray(invData) ? invData : []);
    setBanks(Array.isArray(bankData) ? bankData : []);
    setDebts(Array.isArray(debtData) ? debtData : []);
    setSavedRates(Array.isArray(rateData) ? rateData : []);
    setCashTransactions(Array.isArray(cashData) ? cashData : []);
    setLoading(false);
  }, []);

  // 每次進入頁面都重新抓取，確保各細項餘額有變動時這裡會同步顯示最新金額
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

  const byType = (t: InvestmentType) => investments.filter((i) => i.type === t);
  const sumAmount = (list: Investment[]) => list.reduce((s, i) => s + i.amount, 0);

  // 外匯各幣別「目前餘額」（時序，含息）：加總所有外匯記錄的外幣數量，等同外匯投資頁的餘額
  const forexInvestments = byType("FOREX");
  const forexCurrencyBalances: Record<string, number> = {};
  for (const i of forexInvestments) {
    if (!i.currency) continue;
    forexCurrencyBalances[i.currency] = (forexCurrencyBalances[i.currency] || 0) + (i.quantity || 0);
  }
  const forexCurrencyList = Object.keys(forexCurrencyBalances).sort();

  // 建議匯率：沿用外匯投資頁「時序加權平均」邏輯，作為手動匯率欄位的預設值（可被使用者輸入覆蓋）
  const forexSuggestedRate: Record<string, number> = {};
  {
    const byCurrency: Record<string, Investment[]> = {};
    for (const inv of forexInvestments) {
      if (!inv.currency) continue;
      (byCurrency[inv.currency] ||= []).push(inv);
    }
    for (const [currency, list] of Object.entries(byCurrency)) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.date ?? a.createdAt).getTime() - new Date(b.date ?? b.createdAt).getTime()
      );
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
      forexSuggestedRate[currency] = balance > 0 ? cost / balance : 0;
    }
  }

  // 基金各幣別「淨投入」原幣金額：基金頁存的 amount 就是原幣金額（未換算台幣）
  const fundInvestments = byType("FUND");
  const fundCurrencyBalances: Record<string, number> = {};
  for (const i of fundInvestments) {
    const cur = i.currency || "TWD";
    fundCurrencyBalances[cur] = (fundCurrencyBalances[cur] || 0) + i.amount;
  }
  const fundCurrencyList = Object.keys(fundCurrencyBalances).filter((c) => c !== "TWD").sort();

  // 手動匯率輸入欄位第一次出現時，帶入已儲存的匯率，沒有的話帶入建議匯率。
  // 外匯與基金共用同一份匯率（依幣別鍵值對應），任一邊修改都會同步反映到另一邊。
  useEffect(() => {
    if (loading) return;
    setRateInputs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const currency of new Set([...forexCurrencyList, ...fundCurrencyList])) {
        if (next[currency] === undefined) {
          const saved = savedRates.find((r) => r.currency === currency);
          next[currency] = saved ? String(saved.rate) : (forexSuggestedRate[currency] ? forexSuggestedRate[currency].toFixed(4) : "");
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, investments, savedRates]);

  const handleRateChange = (currency: string, value: string) => {
    setRateInputs((prev) => ({ ...prev, [currency]: value }));
  };

  const handleRateBlur = async (currency: string) => {
    const rateVal = parseFloat(rateInputs[currency] ?? "");
    if (isNaN(rateVal)) return;
    const existing = savedRates.find((r) => r.currency === currency);
    if (existing && existing.rate === rateVal) return;
    setRateSavingCurrency(currency);
    const res = await fetch("/api/user-exchange-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, rate: rateVal }),
    });
    setRateSavingCurrency(null);
    if (res.ok) {
      const updated = await res.json();
      setSavedRates((prev) => [...prev.filter((r) => r.currency !== currency), updated]);
    }
  };

  // 外匯總計（台幣）＝各幣別餘額 × 手動輸入的匯率加總，這個金額才會列入正資產總計
  const forexTwdTotal = forexCurrencyList.reduce((s, currency) => {
    const rate = parseFloat(rateInputs[currency] ?? "") || 0;
    return s + forexCurrencyBalances[currency] * rate;
  }, 0);

  // 基金總計（台幣）＝各幣別淨投入原幣金額 × 手動輸入的匯率加總（與外匯投資共用同一份匯率）
  const fundHasUnratedCurrency = fundCurrencyList.some((c) => !parseFloat(rateInputs[c] ?? ""));
  const fundTwdTotal = fundCurrencyList.reduce((s, currency) => {
    const rate = parseFloat(rateInputs[currency] ?? "") || 0;
    return s + fundCurrencyBalances[currency] * rate;
  }, 0) + (fundCurrencyBalances.TWD || 0);

  // 現金結餘：取自收支記錄頁「現金」來源的收入減支出（不含轉帳），跟收支記錄頁的「結餘」卡片同一套算法
  const cashBalance = cashTransactions.reduce((s, t) => {
    if (t.type === "INCOME") return s + t.amount;
    if (t.type === "EXPENSE") return s - t.amount;
    return s;
  }, 0);

  // 黃金投資依名稱分組（代碼優先、trim 比對），跟黃金投資頁的「依名稱統計」同一套邏輯
  const goldInvestments = byType("GOLD");
  const goldGroups = goldInvestments.reduce((acc, i) => {
    const name = i.name?.trim() || "(未命名)";
    const code = i.code?.trim() || undefined;
    const key = code || name;
    if (!acc[key]) acc[key] = { name, code, count: 0, amount: 0 };
    acc[key].count += 1;
    acc[key].amount += i.amount;
    return acc;
  }, {} as Record<string, { name: string; code?: string; count: number; amount: number }>);
  const goldGroupList = Object.values(goldGroups);

  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const stockTotal = sumAmount(byType("STOCK"));
  const cryptoTotal = sumAmount(byType("CRYPTO"));
  const goldTotal = sumAmount(goldInvestments);
  const realestateTotal = sumAmount(byType("REALESTATE"));
  const insuranceTotal = sumAmount(byType("INSURANCE"));
  const debtTotal = debts.reduce((s, d) => s + d.amount, 0);

  const positiveAssetsTotal = cashBalance + bankTotal + stockTotal + fundTwdTotal + forexTwdTotal + cryptoTotal + goldTotal + realestateTotal + insuranceTotal;
  // 資產負債總計＝正資產總計 − 負債表總額
  const netWorth = positiveAssetsTotal - debtTotal;

  const assetBreakdown = [
    { label: "現金結餘", amount: cashBalance },
    { label: "銀行資產", amount: bankTotal },
    { label: "股票投資", amount: stockTotal },
    { label: "基金投資（已換算台幣）", amount: fundTwdTotal },
    { label: "外匯投資（已換算台幣）", amount: forexTwdTotal },
    { label: "虛擬貨幣", amount: cryptoTotal },
    { label: "黃金投資", amount: goldTotal },
    { label: "不動產投資", amount: realestateTotal },
    { label: "保險投資", amount: insuranceTotal },
  ];

  const debtByCategory = debts.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + d.amount;
    return acc;
  }, {} as Record<string, number>);

  const total = investments.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">資產總攬</h1>
        <p className="text-slate-500 text-sm mt-1">銀行、投資與負債一覽</p>
      </div>

      {/* 淨資產三大卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">正資產總計</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(positiveAssetsTotal)}</div>
        </div>
        <div className="bg-red-50 rounded-2xl p-5 border border-red-100 shadow-sm">
          <div className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">負債總額</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{fmt(debtTotal)}</div>
        </div>
        <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100 shadow-sm">
          <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">資產負債總計</div>
          <div className={`text-2xl font-bold mt-1 ${netWorth >= 0 ? "text-indigo-700" : "text-red-600"}`}>{fmt(netWorth)}</div>
          <div className="text-xs text-slate-400 mt-0.5">正資產總計 − 負債總額</div>
        </div>
      </div>

      {/* 各項資產明細 */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">各項資產明細</div>
        <div className="divide-y divide-slate-50">
          {assetBreakdown.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-semibold text-slate-900">{fmt(row.amount)}</span>
            </div>
          ))}
        </div>
        {fundHasUnratedCurrency && (
          <p className="text-[11px] text-slate-400 mt-2">部分基金幣別尚未在下方設定匯率，暫以 0 計算，請至下方外匯/基金區塊輸入匯率</p>
        )}
      </div>

      {/* 外匯投資：各幣別餘額 + 手動匯率換算 */}
      {forexCurrencyList.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">外匯投資（各幣別餘額與換算匯率）</div>
          <div className="space-y-3">
            {forexCurrencyList.map((currency) => {
              const balance = forexCurrencyBalances[currency];
              const rateStr = rateInputs[currency] ?? "";
              const rate = parseFloat(rateStr) || 0;
              const twd = balance * rate;
              return (
                <div key={currency} className="flex items-center gap-3 text-sm">
                  <span className="w-14 font-medium text-slate-700 shrink-0">{currency}</span>
                  <span className="flex-1 text-slate-500 text-right">
                    {new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(balance)}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-slate-400">匯率</span>
                    <input
                      type="number" min="0" step="any" value={rateStr}
                      onChange={(e) => handleRateChange(currency, e.target.value)}
                      onBlur={() => handleRateBlur(currency)}
                      placeholder="0"
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-indigo-400 transition-colors"
                    />
                    {rateSavingCurrency === currency && <span className="text-[10px] text-slate-400">儲存中...</span>}
                  </div>
                  <span className="w-28 text-right font-semibold text-slate-900 shrink-0">{fmt(twd)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-200 text-sm">
            <span className="font-semibold text-slate-900">外匯總計（台幣）</span>
            <span className="font-bold text-slate-900">{fmt(forexTwdTotal)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">匯率預設帶入外匯投資頁的時序平均匯率，可手動修改；異動後會自動儲存，離開欄位即更新台幣金額與正資產總計</p>
        </div>
      )}

      {/* 基金投資：各幣別餘額 + 手動匯率換算（與外匯投資共用同一份匯率，任一邊修改會同步） */}
      {fundCurrencyList.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">基金投資（各幣別餘額與換算匯率）</div>
          <div className="space-y-3">
            {fundCurrencyList.map((currency) => {
              const balance = fundCurrencyBalances[currency];
              const rateStr = rateInputs[currency] ?? "";
              const rate = parseFloat(rateStr) || 0;
              const twd = balance * rate;
              return (
                <div key={currency} className="flex items-center gap-3 text-sm">
                  <span className="w-14 font-medium text-slate-700 shrink-0">{currency}</span>
                  <span className="flex-1 text-slate-500 text-right">
                    {new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(balance)}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-slate-400">匯率</span>
                    <input
                      type="number" min="0" step="any" value={rateStr}
                      onChange={(e) => handleRateChange(currency, e.target.value)}
                      onBlur={() => handleRateBlur(currency)}
                      placeholder="0"
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right focus:border-indigo-400 transition-colors"
                    />
                    {rateSavingCurrency === currency && <span className="text-[10px] text-slate-400">儲存中...</span>}
                  </div>
                  <span className="w-28 text-right font-semibold text-slate-900 shrink-0">{fmt(twd)}</span>
                </div>
              );
            })}
            {(fundCurrencyBalances.TWD || 0) !== 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="w-14 font-medium text-slate-700 shrink-0">TWD</span>
                <span className="flex-1 text-slate-500 text-right">
                  {new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(fundCurrencyBalances.TWD)}
                </span>
                <span className="w-[104px] text-xs text-slate-400 text-right shrink-0">無需換算</span>
                <span className="w-28 text-right font-semibold text-slate-900 shrink-0">{fmt(fundCurrencyBalances.TWD)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-200 text-sm">
            <span className="font-semibold text-slate-900">基金總計（台幣）</span>
            <span className="font-bold text-slate-900">{fmt(fundTwdTotal)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">匯率與上方外匯投資共用同一份設定：修改任一邊的匯率，兩邊金額都會同步更新並自動儲存</p>
        </div>
      )}

      {/* 黃金投資：依名稱統計 */}
      {goldGroupList.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">黃金投資（依名稱統計）</div>
          <div className="divide-y divide-slate-50">
            {goldGroupList.map((g) => (
              <div key={g.code || g.name} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-700 truncate">{g.name}</span>
                  {g.code && <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{g.code}</span>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-slate-400">{g.count} 筆</span>
                  <span className={`font-semibold ${g.amount >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(g.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-200 text-sm">
            <span className="font-semibold text-slate-900">合計（{goldGroupList.length} 項）</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400">{goldInvestments.length} 筆</span>
              <span className={`font-bold ${goldTotal >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(goldTotal)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* 銀行別餘額 */}
        {banks.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">銀行別餘額</div>
            <div className="space-y-2">
              {banks.map((b) => (
                <div key={b.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{b.name}</span>
                  <span className={`font-semibold ${b.balance >= 0 ? "text-slate-900" : "text-red-500"}`}>{fmt(b.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 負債分類明細 */}
        {Object.keys(debtByCategory).length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">負債分類明細</div>
            <div className="space-y-2">
              {Object.entries(debtByCategory).map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{category}</span>
                  <span className={`font-semibold ${amount > 0 ? "text-red-500" : "text-slate-900"}`}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 投資類型筆數統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">總投資（不含銀行/負債）</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmt(total)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{investments.length} 筆</div>
        </div>
        {(["STOCK", "FUND", "FOREX", "CRYPTO", "GOLD", "REALESTATE", "INSURANCE"] as InvestmentType[]).map((type) => (
          <div key={type} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{TYPE_LABEL[type]}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {fmt(byType(type).reduce((s, i) => s + i.amount, 0))}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{byType(type).length} 筆</div>
          </div>
        ))}
      </div>
    </div>
  );
}
