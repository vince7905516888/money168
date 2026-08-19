import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 前台會員頁面用的公開唯讀端點，顯示後台設定的馬丁格爾策略模版。
// 寫入（新增/編輯/刪除模版）一律走 /api/admin/martingale-strategies，需要 ADMIN 權限。
export async function GET() {
  const strategies = await prisma.martingaleStrategy.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(strategies);
}
