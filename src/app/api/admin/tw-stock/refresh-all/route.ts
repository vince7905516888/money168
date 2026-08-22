import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateStr, fetchInstitutionalAllForDate, fetchMarginAllForDate, fetchInstitutionalRanking } from "@/lib/tw-stock-flow";
import { fetchTpexInstitutionalAllForDate, fetchTpexMarginAllForDate } from "@/lib/tw-stock-flow-tpex";
import { fetchClosePrices } from "@/lib/tw-stock-chip";
import { recordAllEpsSnapshots } from "@/lib/tw-stock-fundamentals";
import { recordAllRetailRatioSnapshots } from "@/lib/tdcc";
import { fetchFuturesPositions } from "@/lib/taifex";

// 涵蓋約2週的日曆天（含假日），確保能補到最近10個交易日左右的缺漏資料；
// 已經存在的(code,date)靠 skipDuplicates 跳過，重複執行這支API不會出錯也不會重複累積。
const DAYS_TO_BACKFILL = 14;

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

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

  return NextResponse.json({
    institutionalWritten,
    marginWritten,
    epsWritten,
    retailRatioWritten,
    rankingWritten,
    futuresWritten,
    durationMs: Date.now() - started,
  });
}
