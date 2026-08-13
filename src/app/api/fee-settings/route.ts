import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 給前台會員讀取目前的手續費設定（唯讀，異動請走 /api/admin/fee-settings）
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const fees = await prisma.feeSetting.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(fees);
}
