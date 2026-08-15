import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await params;
  const { isActive, role, tier, isSuperAdmin, password, disableTwoFactor } = await req.json();

  if ((tier !== undefined || isSuperAdmin !== undefined) && !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "只有超級管理員可以調整等級" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (isActive !== undefined) data.isActive = isActive;
  if (role !== undefined) data.role = role;
  if (tier !== undefined) data.tier = tier;
  if (isSuperAdmin !== undefined) data.isSuperAdmin = isSuperAdmin;
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: "密碼至少需要 6 個字元" }, { status: 400 });
    }
    data.password = await bcrypt.hash(password, 12);
  }
  // 管理員代為解除會員的兩步驟驗證綁定，供帳號救援使用（會員自己被鎖在外面、忘了驗證器裝置等情況）
  if (disableTwoFactor) {
    data.twoFactorEnabled = false;
    data.twoFactorSecret = null;
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tier: true,
      isSuperAdmin: true,
      isActive: true,
      twoFactorEnabled: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "不能刪除自己" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
