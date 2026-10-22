"use client";

import { useEffect, useMemo, useState } from "react";

interface DividendRecord {
  id: string;
  source: "STOCK" | "FUND" | "CRYPTO" | "FOREX";
  name: string;
  code: string | null;
  date: string;
  amount: number | null;
  quantity: number | null;
  note: string | null;
}

const QUANTITY_SOURCES: DividendRecord["source"][] = ["CRYPTO", "FOREX"];

const SOURCE_LABEL: Record<DividendRecord["source"], string> = {
  STOCK: "股票",
  FUND: "基金",
  CRYPTO: "虛擬貨幣",
  FOREX: "外匯",
};

const SOURCE_BADGE: Record<DividendRecord["source"], string> = {
  STOCK: "bg-emerald-100 text-emerald-700",
  FUND: "bg-sky-100 text-sky-700",
  CRYPTO: "bg-amber-100 text-amber-700",
  FOREX: "bg-cyan-100 text-cyan-700",
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

  const twdTotal = filtered
    .filter((r) => r.source === "STOCK" || r.source === "FUND")
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  const groupByCode = (source: DividendRecord["source"]) => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      if (r.source !== source) continue;
      const key = r.code || r.name;
      map.set(key, (map.get(key) ?? 0) + (r.quantity ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  };
  const cryptoByCode = useMemo(() => groupByCode("CRYPTO"), [filtered]);
  const forexByCurrency = useMemo(() => groupByCode("FOREX"), [filtered]);

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">配息總攬</h1>
        <p className="text-slate-500 text-sm mt-1">
          彙整股票／基金配息入帳（配息複利滾存）、虛擬貨幣配息與外匯利息收入，純記錄用途，不影響資產總攬的計算
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400 mb-1">股票＋基金配息入帳（此區間）</p>
              <p className="text-xl font-bold text-emerald-600">{fmtTwd(twdTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400 mb-2">虛擬貨幣配息（此區間，依幣種）</p>
              {cryptoByCode.length === 0 ? (
                <p className="text-sm text-slate-400">無</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {cryptoByCode.map(([code, qty]) => (
                    <span key={code} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                      {code} {fmtQty(qty)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs text-slate-400 mb-2">外匯利息收入（此區間，依幣別）</p>
              {forexByCurrency.length === 0 ? (
                <p className="text-sm text-slate-400">無</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {forexByCurrency.map(([currency, qty]) => (
                    <span key={currency} className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 font-medium">
                      {currency} {fmtQty(qty)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-semibold px-5 py-3">日期</th>
                    <th className="text-left font-semibold px-4 py-3">類型</th>
                    <th className="text-left font-semibold px-4 py-3">名稱</th>
                    <th className="text-right font-semibold px-4 py-3">配息</th>
                    <th className="text-left font-semibold px-5 py-3">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400 py-10">
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
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">
                          {QUANTITY_SOURCES.includes(r.source) ? `+${fmtQty(r.quantity ?? 0)}` : fmtTwd(r.amount ?? 0)}
                        </td>
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
