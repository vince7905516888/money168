import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// 登入頁第一步用：只驗證帳密是否正確、該帳號是否需要輸入兩步驟驗證碼，不建立 session。
// 真正的登入（session 建立）仍然由 NextAuth authorize() 統一把關。
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return NextResponse.json({ ok: false });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true, needsCode: user.twoFactorEnabled });
}
