import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logMemberActivity } from "@/lib/activity-log";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const entries = await prisma.suspenseEntry.findMany({
    where: { userId: session.user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { name, amount, date, note } = await req.json();

  if (!name || amount === undefined || amount === null || amount === "") {
    return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
  }

  const entry = await prisma.suspenseEntry.create({
    data: {
      name,
      amount: parseFloat(amount),
      date: date ? new Date(date) : undefined,
      note: note || null,
      userId: session.user.id,
    },
  });

  await logMemberActivity(session.user.id, "CREATE_SUSPENSE", "suspense-entries", `新增暫計帳「${entry.name}」${entry.amount}`);

  return NextResponse.json(entry, { status: 201 });
}
