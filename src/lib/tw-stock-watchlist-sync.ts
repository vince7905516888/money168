import { prisma } from "@/lib/prisma";
import {
  toDateStr,
  formatDisplayDate,
  fetchWithConcurrency,
  fetchInstitutionalDays,
  fetchMarginDays,
} from "@/lib/tw-stock-flow";
import { fetchTpexInstitutionalDays, fetchTpexMarginDays } from "@/lib/tw-stock-flow-tpex";
import { getStockDirectory } from "@/lib/tw-stock-directory";

// 只同步「全站會員觀察名單」涵蓋到的股票（去重後通常只有幾十檔），不是全市場，
// 用量遠小於後台「全部抓取」（見 tw-stock-refresh-all.ts 開機OOM當機的教訓），
// 可以安全地在會員瀏覽觀察名單時順手觸發，讓「有人在關注」的股票資料保持最新，
// 而且資料表是全站共用，一個人查過其他關注同一檔的會員也會受惠。
const CANDIDATE_CALENDAR_DAYS = 40;
const CONCURRENCY = 4;
// 安全上限：就算觀察名單股票暴增，單次觸發最多同步這麼多檔，其餘留到下次有人開啟觀察名單時再補，
// 避免單一請求觸發過多外部API呼叫（見 tw-stock-refresh-all.ts 全市場版本開機OOM當機的教訓）。
const MAX_CODES_PER_RUN = 100;

export async function syncWatchedStocks(): Promise<{ codesSynced: number; distinctCodes: number }> {
  const watched = await prisma.userWatchStock.findMany({
    select: { code: true },
    distinct: ["code"],
  });
  const codes = watched.map((w) => w.code);
  if (codes.length === 0) return { codesSynced: 0, distinctCodes: 0 };

  // 今天已經同步過的股票不用再打一次外部API，避免會員一多、同一天被反覆觸發
  const todayDisplay = formatDisplayDate(toDateStr(new Date()));
  const alreadySynced = await prisma.stockInstitutionalSnapshot.findMany({
    where: { code: { in: codes }, date: todayDisplay },
    select: { code: true },
  });
  const syncedSet = new Set(alreadySynced.map((r) => r.code));
  const toSync = codes.filter((c) => !syncedSet.has(c)).slice(0, MAX_CODES_PER_RUN);
  if (toSync.length === 0) return { codesSynced: 0, distinctCodes: codes.length };

  const directory = await getStockDirectory();
  const today = new Date();
  const candidateDates = Array.from({ length: CANDIDATE_CALENDAR_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return toDateStr(d);
  });

  await fetchWithConcurrency(toSync, CONCURRENCY, async (code) => {
    const isTwo = directory.find((s) => s.code === code)?.market === "TWO";
    const fetchInstDays = isTwo ? fetchTpexInstitutionalDays : fetchInstitutionalDays;
    const fetchMgnDays = isTwo ? fetchTpexMarginDays : fetchMarginDays;

    const [institutional, margin] = await Promise.all([
      fetchInstDays(code, candidateDates),
      fetchMgnDays(code, candidateDates),
    ]);

    await Promise.all([
      ...institutional.map((row) =>
        prisma.stockInstitutionalSnapshot
          .upsert({
            where: { code_date: { code, date: row.date } },
            update: { ...row },
            create: { code, ...row },
          })
          .catch(() => {})
      ),
      ...margin.map((row) =>
        prisma.stockMarginSnapshot
          .upsert({
            where: { code_date: { code, date: row.date } },
            update: { ...row },
            create: { code, ...row },
          })
          .catch(() => {})
      ),
    ]);
  });

  return { codesSynced: toSync.length, distinctCodes: codes.length };
}
