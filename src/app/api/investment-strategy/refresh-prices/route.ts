import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchClosePrices } from "@/lib/tw-stock-chip";

// 抓證交所當日收盤價，自動帶入投資策略表格的「當前」欄位，不用每天手動輸入
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.investmentStrategyEntry.findMany({
    where: { userId: session.user.id, stockCode: { not: null } },
    select: { id: true, stockCode: true },
  });

  const codes = [...new Set(entries.map((e) => e.stockCode!.trim()).filter(Boolean))];
  if (codes.length === 0) return NextResponse.json({ updated: [] });

  const priceMap = await fetchClosePrices(codes);

  const updated = await Promise.all(
    entries
      .filter((e) => e.stockCode && (priceMap.get(e.stockCode.trim()) ?? 0) > 0)
      .map(async (e) => {
        const close = priceMap.get(e.stockCode!.trim())!;
        const row = await prisma.investmentStrategyEntry.update({
          where: { id: e.id },
          data: { currentPrice: close },
        });
        return row;
      })
  );

  return NextResponse.json({ updated, checked: codes.length, matched: updated.length });
}
