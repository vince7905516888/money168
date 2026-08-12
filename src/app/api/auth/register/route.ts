import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "請填寫所有欄位" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密碼至少需要 6 個字元" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "此 Email 已被使用" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed },
    });

    // 建立預設分類
    const defaultCategories = [
      { name: "薪資", type: "INCOME" as const, icon: "💰", color: "#22c55e" },
      { name: "投資", type: "INCOME" as const, icon: "📈", color: "#3b82f6" },
      { name: "銀行", type: "INCOME" as const, icon: "🏦", color: "#0ea5e9" },
      { name: "其他收入", type: "INCOME" as const, icon: "💵", color: "#a855f7" },
      { name: "餐飲", type: "EXPENSE" as const, icon: "🍜", color: "#f97316" },
      { name: "交通", type: "EXPENSE" as const, icon: "🚗", color: "#6366f1" },
      { name: "購物", type: "EXPENSE" as const, icon: "🛍️", color: "#ec4899" },
      { name: "娛樂", type: "EXPENSE" as const, icon: "🎮", color: "#14b8a6" },
      { name: "醫療", type: "EXPENSE" as const, icon: "🏥", color: "#ef4444" },
      { name: "投資", type: "EXPENSE" as const, icon: "📊", color: "#6366f1" },
      { name: "銀行", type: "EXPENSE" as const, icon: "🏦", color: "#0ea5e9" },
      { name: "其他支出", type: "EXPENSE" as const, icon: "📦", color: "#78716c" },
    ];

    await prisma.category.createMany({
      data: defaultCategories.map((c) => ({ ...c, userId: user.id })),
    });

    return NextResponse.json({ message: "註冊成功" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
