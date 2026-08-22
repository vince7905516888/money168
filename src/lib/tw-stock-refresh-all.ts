import { prisma } from "@/lib/prisma";
import { toDateStr, formatDisplayDate, fetchInstitutionalAllForDate, fetchMarginAllForDate, fetchInstitutionalRanking } from "@/lib/tw-stock-flow";
import { fetchTpexInstitutionalAllForDate, fetchTpexMarginAllForDate } from "@/lib/tw-stock-flow-tpex";
import { fetchClosePrices } from "@/lib/tw-stock-chip";
import { recordAllEpsSnapshots } from "@/lib/tw-stock-fundamentals";
import { recordAllRetailRatioSnapshots } from "@/lib/tdcc";
import { fetchFuturesPositions } from "@/lib/taifex";

// 涵蓋約2週的日曆天（含假日），確保能補到最近10個交易日左右的缺漏資料；
// 已經存在的(code,date)靠 skipDuplicates 跳過，重複執行這支函式不會出錯也不會重複累積。
const DAYS_TO_BACKFILL = 14;

export interface RefreshAllResult {
  institutionalWritten: number;
  marginWritten: number;
  epsWritten: number;
  retailRatioWritten: number;
  rankingWritten: number;
  futuresWritten: boolean;
  durationMs: number;
}

// 全市場資料一次抓取：後台「股市設定」頁的「全部抓取」按鈕、跟 instrumentation.ts 的
// 每日自動排程，都是呼叫這支同一份邏輯。
export async function refreshAllTwStockData(): Promise<RefreshAllResult> {
  const started = Date.now();
  let institutionalWritten = 0;
  let marginWritten = 0;

  const today = new Date();
  const dateStrs = Array.from({ length: DAYS_TO_BACKFILL }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return toDateStr(d);
  });

  // 上市(TWSE)、上櫃(TPEX)三大法人/融資融券：全市場一次回傳，逐日抓取即可涵蓋所有股票，
  // 不需要像單一股票查詢那樣逐檔迴圈。
  for (const dateStr of dateStrs) {
    const [twInst, twMargin, twoInst, twoMargin] = await Promise.all([
      fetchInstitutionalAllForDate(dateStr),
      fetchMarginAllForDate(dateStr),
      fetchTpexInstitutionalAllForDate(dateStr),
      fetchTpexMarginAllForDate(dateStr),
    ]);

    for (const data of [twInst, twoInst]) {
      if (data.length === 0) continue;
      const r = await prisma.stockInstitutionalSnapshot.createMany({ data, skipDuplicates: true }).catch(() => ({ count: 0 }));
      institutionalWritten += r.count;
    }
    for (const data of [twMargin, twoMargin]) {
      if (data.length === 0) continue;
      const r = await prisma.stockMarginSnapshot.createMany({ data, skipDuplicates: true }).catch(() => ({ count: 0 }));
      marginWritten += r.count;
    }
  }

  const [epsWritten, retailRatioWritten] = await Promise.all([
    recordAllEpsSnapshots().catch(() => 0),
    recordAllRetailRatioSnapshots().catch(() => 0),
  ]);

  let rankingWritten = 0;
  try {
    const ranking = await fetchInstitutionalRanking(15);
    if (ranking) {
      const closePrices = await fetchClosePrices(ranking.all.map((r) => r.code));
      const result = await prisma.marketRankingSnapshot.createMany({
        data: ranking.all.map((r) => ({
          code: r.code,
          name: r.name,
          date: ranking.date,
          closePrice: closePrices.get(r.code) ?? null,
          netLots: r.netLots,
        })),
        skipDuplicates: true,
      });
      rankingWritten = result.count;
    }
  } catch {
    // 排行榜快照失敗不影響其他資料的抓取結果
  }

  let futuresWritten = false;
  try {
    futuresWritten = (await fetchFuturesPositions()) != null;
  } catch {
    futuresWritten = false;
  }

  return {
    institutionalWritten,
    marginWritten,
    epsWritten,
    retailRatioWritten,
    rankingWritten,
    futuresWritten,
    durationMs: Date.now() - started,
  };
}

const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 每小時檢查一次

// 每天自動抓取：伺服器啟動時、之後每小時，檢查「今天」的三大法人快照存在與否——
// 存在就代表今天已經抓過了，跳過；不存在就自動跑一次全部抓取。用查資料庫現況來判斷
// 而不是自己另外記一個「上次執行時間」，這樣重啟伺服器（例如每次部署）也不會漏抓或重抓，
// 而且如果剛好在證交所還沒公布當天資料時執行導致抓到空的，下一次檢查會自動再試一次。
export function startTwStockAutoRefresh() {
  const tick = async () => {
    try {
      const todayDisplay = formatDisplayDate(toDateStr(new Date()));
      const existing = await prisma.stockInstitutionalSnapshot.findFirst({ where: { date: todayDisplay } });
      if (existing) return;

      console.log("[tw-stock-auto-refresh] 今天尚未抓過資料，開始自動抓取...");
      const result = await refreshAllTwStockData();
      console.log("[tw-stock-auto-refresh] 完成:", result);
    } catch (e) {
      console.error("[tw-stock-auto-refresh] 執行失敗:", e);
    }
  };

  tick();
  setInterval(tick, AUTO_CHECK_INTERVAL_MS);
}
