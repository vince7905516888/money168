import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ITEMS = ["自營商", "投信", "外資及陸資"];

// 期交所OpenAPI只給「最新一天」、他們自己網站的查詢頁又需要瀏覽器連線狀態沒辦法單純用網址抓，
// 遇到這兩邊都補不到的缺漏日期，只能請管理員自己去官網查、把畫面上的數字手動貼進來補登。
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { date, contractCode, entries } = await req.json().catch(() => ({}));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    return NextResponse.json({ error: "日期格式錯誤，請用 YYYY-MM-DD" }, { status: 400 });
  }
  const code = String(contractCode ?? "臺股期貨").trim();
  if (!code) {
    return NextResponse.json({ error: "請填寫契約名稱" }, { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "請至少填寫一筆身份別資料" }, { status: 400 });
  }

  const rows: { date: string; contractCode: string; item: string; longOpenInterest: number; shortOpenInterest: number; netOpenInterest: number }[] = [];
  for (const e of entries) {
    if (!VALID_ITEMS.includes(e?.item)) {
      return NextResponse.json({ error: `身份別必須是 ${VALID_ITEMS.join("／")} 其中之一` }, { status: 400 });
    }
    const long = Number(e.longOpenInterest);
    const short = Number(e.shortOpenInterest);
    if (!Number.isFinite(long) || !Number.isFinite(short)) {
      return NextResponse.json({ error: `${e.item} 的多方／空方口數必須是數字` }, { status: 400 });
    }
    rows.push({ date, contractCode: code, item: e.item, longOpenInterest: long, shortOpenInterest: short, netOpenInterest: long - short });
  }

  const saved = await Promise.all(
    rows.map((row) =>
      prisma.futuresPositionSnapshot.upsert({
        where: { date_contractCode_item: { date: row.date, contractCode: row.contractCode, item: row.item } },
        update: row,
        create: row,
      })
    )
  );

  return NextResponse.json({ saved: saved.length });
}
