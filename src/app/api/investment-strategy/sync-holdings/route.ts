import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHoldings } from "@/lib/stock-holdings";

// 把「股票投資」「美股投資」頁面算出來的目前持股（代碼/名稱/股數/均價）同步進投資策略表，
// 已存在同代碼（同市場）的列只更新這幾個欄位，券商/方案/未來目標價等其他手動欄位維持不變；
// 找不到對應列的持股才新增一筆。台股/美股用 assetType 分開比對，避免代碼剛好相同時互相蓋掉。
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const [stockInvestments, usstockInvestments] = await Promise.all([
    prisma.investment.findMany({
      where: { userId: session.user.id, type: "STOCK" },
      select: { code: true, name: true, quantity: true, price: true, amount: true, action: true, date: true },
    }),
    prisma.investment.findMany({
      where: { userId: session.user.id, type: "USSTOCK" },
      select: { code: true, name: true, quantity: true, price: true, amount: true, action: true, date: true },
    }),
  ]);

  const holdingsByType = [
    { assetType: "STOCK", holdings: computeHoldings(stockInvestments).filter((h) => h.code && h.code !== "—") },
    { assetType: "USSTOCK", holdings: computeHoldings(usstockInvestments).filter((h) => h.code && h.code !== "—") },
  ];

  const existingEntries = await prisma.investmentStrategyEntry.findMany({
    where: { userId: session.user.id },
  });
  const byKey = new Map(
    existingEntries
      .filter((e) => e.stockCode)
      .map((e) => [`${e.assetType}:${e.stockCode!.trim()}`, e])
  );
  let nextOrder = existingEntries.reduce((max, e) => Math.max(max, e.order), -1) + 1;

  const results = await Promise.all(
    holdingsByType.flatMap(({ assetType, holdings }) =>
      holdings.map((h) => {
        const existing = byKey.get(`${assetType}:${h.code.trim()}`);
        if (existing) {
          return prisma.investmentStrategyEntry.update({
            where: { id: existing.id },
            data: { stockCode: h.code, stockName: h.name, shares: h.quantity, avgPrice: h.avgPrice },
          });
        }
        const order = nextOrder++;
        return prisma.investmentStrategyEntry.create({
          data: {
            userId: session.user.id,
            assetType,
            stockCode: h.code,
            stockName: h.name,
            shares: h.quantity,
            avgPrice: h.avgPrice,
            order,
          },
        });
      })
    )
  );

  return NextResponse.json({ synced: results.length, entries: results });
}
