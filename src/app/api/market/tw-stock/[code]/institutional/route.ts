import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateStr, fetchInstitutionalDays, fetchMarginDays } from "@/lib/tw-stock-flow";

const DAYS_TO_SHOW = 20;
const CANDIDATE_CALENDAR_DAYS = 40; // 涵蓋假日/連續假期，確保能湊到 20 個交易日

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await params;
  const cleanCode = code.trim();
  if (!/^\d{4,6}$/.test(cleanCode)) {
    return NextResponse.json({ error: "股票代碼格式錯誤" }, { status: 400 });
  }

  const today = new Date();
  const candidateDates = Array.from({ length: CANDIDATE_CALENDAR_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return toDateStr(d);
  });

  const [institutionalAll, marginAll] = await Promise.all([
    fetchInstitutionalDays(cleanCode, candidateDates),
    fetchMarginDays(cleanCode, candidateDates),
  ]);

  const institutional = institutionalAll.sort((a, b) => b.date.localeCompare(a.date)).slice(0, DAYS_TO_SHOW);
  const margin = marginAll.sort((a, b) => b.date.localeCompare(a.date)).slice(0, DAYS_TO_SHOW);

  if (institutional.length === 0 && margin.length === 0) {
    return NextResponse.json({ error: "查無此股票的法人／融資融券資料（可能是上櫃股票，此資料源僅涵蓋上市）" }, { status: 404 });
  }

  // 逐日存進快照表，累積歷史供「法人買賣超趨勢圖」的近3個月/6個月/1年/3年區間使用（見 flow-history）
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

  return NextResponse.json({ institutional, margin });
}
