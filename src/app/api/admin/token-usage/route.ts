import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 依會員彙總 TokenUsageLog（目前只有智能助理會寫入），供後台「TOKEN使用量」頁面顯示。
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const grouped = await prisma.tokenUsageLog.groupBy({
    by: ["userId"],
    _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rows = grouped.map((g) => {
    const u = userMap.get(g.userId);
    return {
      userId: g.userId,
      name: u?.name ?? "(已刪除帳號)",
      email: u?.email ?? "",
      role: u?.role ?? "",
      requestCount: g._count._all,
      promptTokens: g._sum.promptTokens ?? 0,
      completionTokens: g._sum.completionTokens ?? 0,
      totalTokens: g._sum.totalTokens ?? 0,
      lastUsedAt: g._max.createdAt,
    };
  });

  const grandTotal = rows.reduce((s, r) => s + r.totalTokens, 0);

  return NextResponse.json({ rows, grandTotal });
}
