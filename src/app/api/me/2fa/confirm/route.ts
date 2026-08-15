import { NextRequest, NextResponse } from "next/server";
import { verify } from "otplib";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "請輸入驗證碼" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.twoFactorSecret) {
    return NextResponse.json({ error: "請先產生驗證碼設定" }, { status: 400 });
  }

  const result = await verify({ token: code, secret: user.twoFactorSecret });
  if (!result.valid) {
    return NextResponse.json({ error: "驗證碼不正確" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorEnabled: true },
  });

  return NextResponse.json({ ok: true });
}
