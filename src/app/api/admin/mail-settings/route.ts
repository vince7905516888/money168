import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN" || !session.user.isSuperAdmin) return null;
  return session;
}

export async function GET() {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "無權限" }, { status: 403 });

  const setting = await prisma.mailSetting.findFirst();
  return NextResponse.json({
    gmailUser: setting?.gmailUser ?? "",
    hasPassword: !!setting?.gmailPass,
    updatedAt: setting?.updatedAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "無權限" }, { status: 403 });

  const { gmailUser, gmailPass } = await req.json();
  if (!gmailUser) return NextResponse.json({ error: "請填寫 Gmail 帳號" }, { status: 400 });

  const existing = await prisma.mailSetting.findFirst();
  const updated = existing
    ? await prisma.mailSetting.update({
        where: { id: existing.id },
        // 密碼留空代表不修改，避免每次改帳號都要重打一次應用程式密碼
        data: { gmailUser, ...(gmailPass ? { gmailPass } : {}) },
      })
    : await prisma.mailSetting.create({
        data: { gmailUser, gmailPass: gmailPass || "" },
      });

  return NextResponse.json({ gmailUser: updated.gmailUser, hasPassword: !!updated.gmailPass });
}

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "無權限" }, { status: 403 });

  const { to } = await req.json().catch(() => ({ to: undefined }));
  const target = to || session.user.email;
  if (!target) return NextResponse.json({ error: "請提供收件信箱" }, { status: 400 });

  const result = await sendMail(target, "【MoneyFlow】測試信件", "這是一封測試信件，收到代表寄信設定正確。");
  if (!result.ok) return NextResponse.json({ error: result.error || "寄送失敗" }, { status: 500 });
  return NextResponse.json({ message: `已寄出測試信至 ${target}` });
}
