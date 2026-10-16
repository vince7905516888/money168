import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.dividendEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { type, name, code, amount, quantity, price, fee, date, note } = await req.json();

  if (!type || !name || amount === undefined || amount === null || amount === "") {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }
  if (type !== "STOCK" && type !== "FUND") {
    return NextResponse.json({ error: "類型僅限股票或基金" }, { status: 400 });
  }

  const entry = await prisma.dividendEntry.create({
    data: {
      type,
      name,
      code: code || null,
      amount: parseFloat(amount),
      quantity: quantity !== undefined && quantity !== "" ? parseFloat(quantity) : null,
      price: price !== undefined && price !== "" ? parseFloat(price) : null,
      fee: fee !== undefined && fee !== "" ? parseFloat(fee) : null,
      date: date ? new Date(date) : undefined,
      note: note || null,
      userId: session.user.id,
    },
  });

  await logMemberActivity(session.user.id, "CREATE_DIVIDEND", "dividend-reinvest", `新增配息記錄「${entry.name}」${entry.amount}`);

  return NextResponse.json(entry, { status: 201 });
}
