import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateStr, fetchInstitutionalDays, fetchMarginDays } from "@/lib/tw-stock-flow";

// 法人買賣超趨勢圖用的區間：證交所沒有「單一股票歷史區間」查詢功能，長區間（1年/3年）
// 一樣得靠逐日累積（見 institutional/route.ts）；但 1個月~6個月（約120個交易日內）在使用者
// 主動切換到該區間時，願意多花一點時間主動往回補歷史，不用整整等好幾個月才有資料。
const PERIOD_CUTOFF_DAYS: Record<string, number> = {
  "1m": 31,
  "3m": 92,
  "6m": 183,
  "1y": 366,
  "3y": 1097,
};
const PERIOD_TRADING_DAYS: Record<string, number> = {
  "1m": 22,
  "3m": 65,
  "6m": 125,
  "1y": 250,
  "3y": 750,
};
const ON_DEMAND_BACKFILL_CAP = 125; // 最多主動幫忙補到 6 個月（125 個交易日），更長的區間交給逐日累積

// 證交所對短時間內大量併發請求會直接擋（實測回應 428），就算是先前驗證過安全的 40天/併發4
// 這組參數，只要跟另一個路由的請求「同時」打，一樣會被擋。所以補歷史一次只抓一小批（20個日曆日、
// 併發2），且只有使用者主動切換到超過1個月的區間時才觸發，靠使用者多次操作慢慢把歷史補齊，
// 不奢望一次補滿，換取穩定不被證交所封鎖。
const BACKFILL_BATCH_CALENDAR_DAYS = 20;
// 一個批次約補14個交易日；同一個請求裡連續補好幾批（批次之間停一下，不是同時併發），比起「每次
// 只補一批、要使用者手動切來切去點很多次才補得到」體驗好很多。實測過兩組參數（併發2/間隔1.2秒、
// 併發1/間隔3.5秒），都是補了約3批（~40個交易日）後連續兩批就開始被證交所擋（回應變空）——代表
// 這是證交所在一段時間內的「累計」請求量限制，不是單批併發數或間隔快慢的問題，放慢節奏並沒有明顯
// 幫助，所以維持較快的參數（時間換不到更多資料，不用讓使用者多等）。碰到連續空批次就提早停止
// （見下方 consecutiveEmptyBatches），不會傻傻補到 MAX 批次。
const BACKFILL_CONCURRENCY = 2;
const MAX_BACKFILL_BATCHES_PER_REQUEST = 6;
const BACKFILL_BATCH_DELAY_MS = 1200;

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillIfNeeded(cleanCode: string, period: string) {
  if (period === "1m") return; // 預設區間不額外補，避免跟 institutional/route.ts 的請求同時打

  const target = Math.min(PERIOD_TRADING_DAYS[period] ?? PERIOD_TRADING_DAYS["1m"], ON_DEMAND_BACKFILL_CAP);

  let consecutiveEmptyBatches = 0;
  for (let iter = 0; iter < MAX_BACKFILL_BATCHES_PER_REQUEST; iter++) {
    const [instCount, oldestInst] = await Promise.all([
      prisma.stockInstitutionalSnapshot.count({ where: { code: cleanCode } }),
      prisma.stockInstitutionalSnapshot.findFirst({ where: { code: cleanCode }, orderBy: { date: "asc" } }),
    ]);
    if (instCount >= target) return; // 已經累積夠了，不用再往回補

    const walkStart = oldestInst ? new Date(`${oldestInst.date}T00:00:00`) : new Date();
    if (oldestInst) walkStart.setDate(walkStart.getDate() - 1); // 從已累積的最早一天再往前一天開始補一小批

    const candidateDates = Array.from({ length: BACKFILL_BATCH_CALENDAR_DAYS }, (_, i) => {
      const d = new Date(walkStart);
      d.setDate(d.getDate() - i);
      return toDateStr(d);
    });

    const [institutional, margin] = await Promise.all([
      fetchInstitutionalDays(cleanCode, candidateDates, BACKFILL_CONCURRENCY),
      fetchMarginDays(cleanCode, candidateDates, BACKFILL_CONCURRENCY),
    ]);

    await Promise.all([
      ...institutional.map((row) =>
        prisma.stockInstitutionalSnapshot
          .upsert({
            where: { code_date: { code: cleanCode, date: row.date } },
            update: { ...row },
            create: { code: cleanCode, ...row },
          })
          .catch(() => {})
      ),
      ...margin.map((row) =>
        prisma.stockMarginSnapshot
          .upsert({
            where: { code_date: { code: cleanCode, date: row.date } },
            update: { ...row },
            create: { code: cleanCode, ...row },
          })
          .catch(() => {})
      ),
    ]);

    // 連續兩批都完全沒補到新資料，代表可能已經到資料源最早範圍或暫時被擋，停止避免白等
    if (institutional.length === 0 && margin.length === 0) {
      consecutiveEmptyBatches++;
      if (consecutiveEmptyBatches >= 2) return;
    } else {
      consecutiveEmptyBatches = 0;
    }

    if (iter < MAX_BACKFILL_BATCHES_PER_REQUEST - 1) await sleep(BACKFILL_BATCH_DELAY_MS);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const periodParam = req.nextUrl.searchParams.get("period") ?? "1m";

  await backfillIfNeeded(cleanCode, periodParam);

  const days = PERIOD_CUTOFF_DAYS[periodParam] ?? PERIOD_CUTOFF_DAYS["1m"];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = toDateOnly(cutoff);

  const [institutional, margin] = await Promise.all([
    prisma.stockInstitutionalSnapshot.findMany({
      where: { code: cleanCode, date: { gte: cutoffStr } },
      orderBy: { date: "asc" },
    }),
    prisma.stockMarginSnapshot.findMany({
      where: { code: cleanCode, date: { gte: cutoffStr } },
      orderBy: { date: "asc" },
    }),
  ]);

  return NextResponse.json({ institutional, margin, requestedFrom: cutoffStr });
}
