"use client";

import { useEffect, useMemo, useState } from "react";

// 投資試算表：純試算工具，不寫入資料庫，純前端用固定參數模擬「每月定額買進＋固定配息」
// 每月流程：先用「上個月底的持股」算這個月配息（本月新買的股數要下個月才開始領配息），
// 配息不拿去再買股，只當現金累加；接著本月投入金額扣手續費後依固定買進價買進股數、累加進持股。
// 推估總資產＝（累計持股×買進價，當作目前市值）＋累計配息現金。

const STORAGE_KEY = "dividend-calculator-inputs-v1";

const DEFAULT_INPUTS = {
  label: "",
  startYear: new Date().getFullYear(),
  startMonth: new Date().getMonth() + 1,
  monthlyInvestment: "150",
  fee: "0.17",
  price: "54.8484",
  dividendPerShare: "0.6339",
  afterTaxRate: "70",
  years: "10",
  targetAmount: "",
};

interface Row {
  year: number;
  month: number;
  investment: number;
  holdingShares: number; // 本月買進後的累計持股
  fee: number;
  price: number;
  sharesBought: number;
  dividendRate: number;
  afterTaxRate: number;
  dividend: number;
  cumulativeDividend: number;
  assetValue: number;
}

export default function InvestmentCalculatorPage() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setInputs({ ...DEFAULT_INPUTS, ...JSON.parse(saved) });
    } catch {
      // 讀取失敗就用預設值，不中斷頁面
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs, loaded]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
  const fmtQty = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(n);

  const monthlyInvestment = parseFloat(inputs.monthlyInvestment) || 0;
  const fee = parseFloat(inputs.fee) || 0;
  const price = parseFloat(inputs.price) || 0;
  const dividendRate = parseFloat(inputs.dividendPerShare) || 0;
  const afterTaxRate = (parseFloat(inputs.afterTaxRate) || 0) / 100;
  const years = Math.max(1, Math.min(50, parseInt(inputs.years) || 10));
  const targetAmount = parseFloat(inputs.targetAmount) || 0;
  const totalMonths = years * 12;

  const { rows, targetRow } = useMemo(() => {
    const list: Row[] = [];
    let holdingShares = 0;
    let cumulativeDividend = 0;
    let foundTarget: Row | null = null;
    let y = inputs.startYear;
    let m = inputs.startMonth;

    for (let i = 0; i < totalMonths; i++) {
      // 先用上個月底的持股算這個月配息，本月新買的股數下個月才開始領配息
      const dividend = holdingShares * dividendRate * afterTaxRate;
      cumulativeDividend += dividend;

      const sharesBought = price > 0 ? Math.max(0, monthlyInvestment - fee) / price : 0;
      holdingShares += sharesBought;

      const assetValue = holdingShares * price + cumulativeDividend;

      const row: Row = {
        year: y, month: m, investment: monthlyInvestment, holdingShares, fee, price,
        sharesBought, dividendRate, afterTaxRate, dividend, cumulativeDividend, assetValue,
      };
      list.push(row);

      if (!foundTarget && targetAmount > 0 && assetValue >= targetAmount) foundTarget = row;

      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }

    return { rows: list, targetRow: foundTarget };
  }, [inputs.startYear, inputs.startMonth, monthlyInvestment, fee, price, dividendRate, afterTaxRate, totalMonths, targetAmount]);

  const last = rows[rows.length - 1];
  const totalPrincipal = monthlyInvestment * rows.length;

  return (
    <div className="w-full max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">投資試算表</h1>
        <p className="text-slate-500 text-sm mt-1">模擬每月定額買進＋固定配息，推估多久能滾存到目標資產（純試算，不會寫入任何記帳資料）</p>
      </div>

      {/* 參數輸入 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">試算參數</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 md:col-span-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">股票／基金名稱（選填，純標示）</label>
            <input value={inputs.label} onChange={(e) => setInputs({ ...inputs, label: e.target.value })}
              placeholder="例如：元大高股息 0056"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">起始年份</label>
            <input type="number" value={inputs.startYear}
              onChange={(e) => setInputs({ ...inputs, startYear: parseInt(e.target.value) || inputs.startYear })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">起始月份</label>
            <select value={inputs.startMonth} onChange={(e) => setInputs({ ...inputs, startMonth: parseInt(e.target.value) })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => <option key={mo} value={mo}>{mo} 月</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">試算年數（最多 50）</label>
            <input type="number" min="1" max="50" value={inputs.years}
              onChange={(e) => setInputs({ ...inputs, years: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">每月投入金額</label>
            <input type="number" min="0" step="any" value={inputs.monthlyInvestment}
              onChange={(e) => setInputs({ ...inputs, monthlyInvestment: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">買進價格（固定）</label>
            <input type="number" min="0" step="any" value={inputs.price}
              onChange={(e) => setInputs({ ...inputs, price: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">手續費（每月固定）</label>
            <input type="number" min="0" step="any" value={inputs.fee}
              onChange={(e) => setInputs({ ...inputs, fee: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">每股配息（月，固定）</label>
            <input type="number" min="0" step="any" value={inputs.dividendPerShare}
              onChange={(e) => setInputs({ ...inputs, dividendPerShare: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">抽稅後可得配息百分比（%）</label>
            <input type="number" min="0" max="100" step="any" value={inputs.afterTaxRate}
              onChange={(e) => setInputs({ ...inputs, afterTaxRate: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">目標資產（選填）</label>
            <input type="number" min="0" step="any" value={inputs.targetAmount}
              onChange={(e) => setInputs({ ...inputs, targetAmount: e.target.value })} placeholder="例如：1000000"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-indigo-400 transition-colors" />
          </div>
        </div>
      </div>

      {/* 目標達成預估 */}
      {targetAmount > 0 && (
        <div className={`rounded-2xl p-5 border shadow-sm mb-6 ${targetRow ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
          {targetRow ? (
            <>
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">預估達成時間</div>
              <div className="text-2xl font-bold text-emerald-700">
                {targetRow.year} 年 {targetRow.month} 月
                <span className="text-sm font-medium text-emerald-600 ml-2">
                  （投入開始後第 {rows.indexOf(targetRow) + 1} 個月，約 {((rows.indexOf(targetRow) + 1) / 12).toFixed(1)} 年）
                </span>
              </div>
              <div className="text-xs text-emerald-600 mt-1">當月推估總資產 {fmt(targetRow.assetValue)}</div>
            </>
          ) : (
            <div className="text-sm text-amber-700">
              在設定的 {years} 年試算期間內，推估總資產尚未達到目標 {fmt(targetAmount)}，可以拉長「試算年數」再試算一次。
            </div>
          )}
        </div>
      )}

      {/* 試算結束時總覽 */}
      {last && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{years} 年後累計持股</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{fmtQty(last.holdingShares)} 股</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">累計投入本金</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{fmt(totalPrincipal)}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1">累計配息現金</div>
            <div className="text-xl font-bold text-emerald-600 mt-1">{fmt(last.cumulativeDividend)}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">推估總資產</div>
            <div className="text-xl font-bold text-indigo-600 mt-1">{fmt(last.assetValue)}</div>
          </div>
        </div>
      )}

      {/* 逐月明細表 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-semibold text-slate-900">逐月試算明細{inputs.label ? `（${inputs.label}）` : ""}</h2>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-semibold">年份</th>
                <th className="px-4 py-2.5 text-left font-semibold">月份</th>
                <th className="px-4 py-2.5 text-right font-semibold">每月投入金額</th>
                <th className="px-4 py-2.5 text-right font-semibold">持有股數</th>
                <th className="px-4 py-2.5 text-right font-semibold">手續費</th>
                <th className="px-4 py-2.5 text-right font-semibold">買進價格</th>
                <th className="px-4 py-2.5 text-right font-semibold">買進股數</th>
                <th className="px-4 py-2.5 text-right font-semibold">配息</th>
                <th className="px-4 py-2.5 text-right font-semibold">抽稅後可得配息百分比</th>
                <th className="px-4 py-2.5 text-right font-semibold">實際配息</th>
                <th className="px-4 py-2.5 text-right font-semibold">累計配息</th>
                <th className="px-4 py-2.5 text-right font-semibold">推估總資產</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => (
                <tr key={i} className={`hover:bg-slate-50 transition-colors ${targetRow === r ? "bg-emerald-50" : ""}`}>
                  <td className="px-4 py-2 text-slate-700">{i === 0 || r.month === 1 ? r.year : ""}</td>
                  <td className="px-4 py-2 text-slate-700">{r.month}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{fmtQty(r.investment)}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{fmtQty(r.holdingShares)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtQty(r.fee)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtQty(r.price)}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{fmtQty(r.sharesBought)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmtQty(r.dividendRate)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{(r.afterTaxRate * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmtQty(r.dividend)}</td>
                  <td className="px-4 py-2 text-right text-emerald-700 font-semibold">{fmtQty(r.cumulativeDividend)}</td>
                  <td className="px-4 py-2 text-right text-indigo-600 font-semibold">{fmt(r.assetValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
