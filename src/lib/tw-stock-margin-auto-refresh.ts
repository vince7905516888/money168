import { prisma } from "@/lib/prisma";
import { toDateStr, formatDisplayDate, fetchMarginAllForDate } from "@/lib/tw-stock-flow";
import { fetchTpexMarginAllForDate } from "@/lib/tw-stock-flow-tpex";

// 只自動排程融資融券這一項——跟之前導致開機當機的全市場排程（tw-stock-refresh-all.ts，
// 見 instrumentation.ts 的說明）完全不同量級：融資融券是「單一日期、全部股票」的日報表，
// 上市、上櫃各一支API（一次拿整個市場），不像三大法人排程裡的EPS/集保股權分散表快照
// 需要逐檔股票各打一次API（上千筆請求才是真正造成OOM的原因）。
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 每小時檢查一次
const DAYS_TO_BACKFILL = 14; // 涵蓋約2週日曆天，補到最近的交易日缺漏；已存在的(code,date)靠 skipDuplicates 跳過

export async function refreshMarginSnapshots(): Promise<number> {
  let written = 0;
  const today = new Date();
  for (let i = 0; i < DAYS_TO_BACKFILL; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toDateStr(d);

    const [twMargin, twoMargin] = await Promise.all([
      fetchMarginAllForDate(dateStr),
      fetchTpexMarginAllForDate(dateStr),
    ]);
    for (const data of [twMargin, twoMargin]) {
      if (data.length === 0) continue;
      const r = await prisma.stockMarginSnapshot.createMany({ data, skipDuplicates: true }).catch(() => ({ count: 0 }));
      written += r.count;
    }
  }
  return written;
}

export function startMarginAutoRefresh() {
  const tick = async () => {
    try {
      const todayDisplay = formatDisplayDate(toDateStr(new Date()));
      const existing = await prisma.stockMarginSnapshot.findFirst({ where: { date: todayDisplay } });
      if (existing) return;

      console.log("[margin-auto-refresh] 今天尚未抓過融資融券資料，開始自動抓取...");
      const written = await refreshMarginSnapshots();
      console.log("[margin-auto-refresh] 完成: 已存", written, "筆");
    } catch (e) {
      console.error("[margin-auto-refresh] 執行失敗:", e);
    }
  };

  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}
