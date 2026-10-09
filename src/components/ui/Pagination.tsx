"use client";

import { useState } from "react";

interface PaginationProps {
  page: number;
  pageCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageCount, totalCount, onPageChange }: PaginationProps) {
  const [jumpValue, setJumpValue] = useState("");

  if (pageCount <= 1) return null;

  const jump = () => {
    const n = parseInt(jumpValue, 10);
    if (Number.isFinite(n) && n >= 1 && n <= pageCount) onPageChange(n);
    setJumpValue("");
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t border-slate-50">
      <span className="text-xs text-slate-400">第 {page} / {pageCount} 頁・共 {totalCount} 筆</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          上一頁
        </button>
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          下一頁
        </button>
        <div className="flex items-center gap-1 ml-1">
          <input
            type="number" min={1} max={pageCount} value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); jump(); } }}
            placeholder="頁數"
            className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-indigo-400 transition-colors"
          />
          <button type="button" onClick={jump}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            跳至
          </button>
        </div>
      </div>
    </div>
  );
}
