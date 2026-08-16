import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchInstitutionalRanking } from "@/lib/tw-stock-flow";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const ranking = await fetchInstitutionalRanking();
  if (!ranking) {
    return NextResponse.json({ error: "查無資料" }, { status: 404 });
  }
  return NextResponse.json(ranking);
}
