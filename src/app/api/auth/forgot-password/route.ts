import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "請輸入 Email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // 無論帳號是否存在都回傳相同訊息，避免洩漏帳號資訊
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${rawToken}`;
    const text = `我們收到了重設你 MoneyFlow 帳號密碼的請求。\n\n請點擊以下連結設定新密碼（1 小時內有效）：\n${resetUrl}\n\n如果不是你本人要求重設密碼，請忽略這封信件。`;

    const result = await sendMail(email, "【MoneyFlow】重設你的密碼", text);
    if (!result.ok) {
      console.error("寄送重設密碼信件失敗", result.error);
      return NextResponse.json({ error: "信件寄送失敗，請稍後再試或聯絡管理員" }, { status: 500 });
    }
  }

  return NextResponse.json({ message: "如果該 Email 存在，重設密碼信件已寄出" });
}
