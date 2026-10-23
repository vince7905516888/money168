"use client";

import { useEffect, useMemo, useState } from "react";

interface DividendRecord {
  id: string;
  source: "STOCK" | "FUND" | "CRYPTO" | "FOREX" | "BANK";
  name: string;
  code: string | null;
  date: string;
  amount: number | null;
  quantity: number | null;
  twdAmount: number;
  note: string | null;
}

const SOURCE_LABEL: Record<DividendRecord["source"], string> = {
  STOCK: "股票",
  FUND: "基金",
  CRYPTO: "虛擬貨幣",
  FOREX: "外匯",
  BANK: "銀行",
};

const SOURCE_BADGE: Record<DividendRecord["source"], string> = {
  STOCK: "bg-emerald-100 text-emerald-700",
  FUND: "bg-sky-100 text-sky-700",
  CRYPTO: "bg-amber-100 text-amber-700",
  FOREX: "bg-cyan-100 text-cyan-700",
  BANK: "bg-indigo-100 text-indigo-700",
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function DividendOverviewPage() {
  const [records, setRecords] = useState<DividendRecord[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/dividend-overview");
      const data = await res.json();
      setRecords(Array.isArray(data.records) ? data.records : []);
      setYears(Array.isArray(data.years) ? data.years : []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const d = new Date(r.date);
      if (yearFilter && d.getFullYear() !== Number(yearFilter)) return false;
      if (monthFilter && d.getMonth() + 1 !== Number(monthFilter)) return false;
      return true;
    });
  }, [records, yearFilter, monthFilter]);

  const fmtTwd = (n: number) =>
    new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
  const fmtQty = (n: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 8 }).format(n);

  const overallTotal = filtered.reduce((s, r) => s + r.twdAmount, 0);

  const bySourceTotal = useMemo(() => {
    const map = new Map<DividendRecord["source"], number>();
    for (const r of filtered) map.set(r.source, (map.get(r.source) ?? 0) + r.twdAmount);
    return map;
  }, [filtered]);

  // 依投資標的彙整：同一檔股票/基金/幣種/幣別在這段期間配了多少，一律換算成台幣方便互相比較
  interface HoldingRow { key: string; source: DividendRecord["source"]; name: string; code: string | null; twdAmount: number; originalQty: number | null; originalAmount: number | null }
  const byHolding = useMemo(() => {
    const map = new Map<string, HoldingRow>();
    for (const r of filtered) {
      const key = `${r.source}|${r.code || r.name}`;
      if (!map.has(key)) map.set(key, { key, source: r.source, name: r.name, code: r.code, twdAmount: 0, originalQty: null, originalAmount: null });
      const row = map.get(key)!;
      row.twdAmount += r.twdAmount;
      if (r.quantity != null) row.originalQty = (row.originalQty ?? 0) + r.quantity;
      if (r.amount != null) row.originalAmount = (row.originalAmount ?? 0) + r.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.twdAmount - a.twdAmount);
  }, [filtered]);

  return (
    <div className="w-full max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">配息總攬</h1>
        <p className="text-slate-500 text-sm mt-1">
          彙整股票／基金配息入帳（配息複利滾存）、虛擬貨幣配息、外匯利息與銀行利息收入，一律換算成台幣方便比較。
          虛擬貨幣用目前即時價格換算、外匯與銀行外幣用目前儲存/建議匯率換算，並非配息當時的歷史價格。純記錄用途，不影響資產總攬的計算
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 transition-colors bg-white"
        >
          <option value="">全部年份</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 transition-colors bg-white"
        >
          <option value="">全部月份</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}月
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">載入中...</div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4">
            <p className="text-xs text-slate-400 mb-1">
              本期配息總額（{yearFilter ? `${yearFilter}年` : "全部年份"}{monthFilter ? `${monthFilter}月` : ""}，一律換算成台幣）
            </p>
            <p className="text-2xl font-bold text-emerald-600">{fmtTwd(overallTotal)}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {(["STOCK", "FUND", "CRYPTO", "FOREX", "BANK"] as const)
                .filter((s) => (bySourceTotal.get(s) ?? 0) !== 0)
                .map((s) => (
                  <span key={s} className={`text-xs px-2.5 py-1 rounded-full font-medium ${SOURCE_BADGE[s]}`}>
                    {SOURCE_LABEL[s]} {fmtTwd(bySourceTotal.get(s) ?? 0)}
                  </span>
                ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">依投資標的彙整（台幣）</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">類型</th>
                    <th className="text-left font-semibold px-4 py-3">名稱</th>
                    <th className="text-right font-semibold px-4 py-3">原始數量／金額</th>
                    <th className="text-right font-semibold px-5 py-3">換算台幣</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {byHolding.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-400 py-10">
                        這段期間沒有配息記錄
                      </td>
                    </tr>
                  ) : (
                    byHolding.map((h) => (
                      <tr key={h.key} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${SOURCE_BADGE[h.source]}`}>
                            {SOURCE_LABEL[h.source]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {h.name}
                          {h.code ? <span className="text-slate-400">（{h.code}）</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {h.originalQty != null ? fmtQty(h.originalQty) : fmtTwd(h.originalAmount ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-600">{fmtTwd(h.twdAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">逐筆記錄</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">日期</th>
                    <th className="text-left font-semibold px-4 py-3">類型</th>
                    <th className="text-left font-semibold px-4 py-3">名稱</th>
                    <th className="text-right font-semibold px-4 py-3">原始數量／金額</th>
                    <th className="text-right font-semibold px-4 py-3">換算台幣</th>
                    <th className="text-left font-semibold px-5 py-3">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-slate-400 py-10">
                        這段期間沒有配息記錄
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 text-slate-600">{new Date(r.date).toLocaleDateString("zh-TW")}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${SOURCE_BADGE[r.source]}`}>
                            {SOURCE_LABEL[r.source]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {r.name}
                          {r.code ? <span className="text-slate-400">（{r.code}）</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {r.quantity != null ? `+${fmtQty(r.quantity)}` : fmtTwd(r.amount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">{fmtTwd(r.twdAmount)}</td>
                        <td className="px-5 py-3 text-slate-400">{r.note || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
