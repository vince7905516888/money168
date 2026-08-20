import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const pageSize = Math.min(Number(searchParams.get("pageSize")) || 50, 200);

  const where: Record<string, unknown> = { userId: session.user.id };
  if (category) where.category = category;
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) createdAt.lte = new Date(`${to}T23:59:59.999`);
    where.createdAt = createdAt;
  }

  const [logs, total] = await Promise.all([
    prisma.memberActivityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.memberActivityLog.count({ where }),
  ]);

  return NextResponse.json({ items: logs, total, page, pageSize });
}
