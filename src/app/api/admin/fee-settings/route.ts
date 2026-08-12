import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_FEES = [
  { key: "bank_transfer", label: "銀行轉帳手續費", rate: 0, fixedAmount: 0 },
  { key: "stock_commission", label: "股票交易手續費", rate: 0.1425, fixedAmount: 0 },
  { key: "fund_commission", label: "基金申購手續費", rate: 1.5, fixedAmount: 0 },
  { key: "forex_spread", label: "外匯交易點差費", rate: 0, fixedAmount: 0 },
  { key: "crypto_fee", label: "虛擬貨幣交易費", rate: 0.1, fixedAmount: 0 },
  { key: "gold_fee", label: "黃金交易手續費", rate: 0, fixedAmount: 0 },
];

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  // Ensure all default fee keys exist
  for (const fee of DEFAULT_FEES) {
    await prisma.feeSetting.upsert({
      where: { key: fee.key },
      create: fee,
      update: {},
    });
  }

  const fees = await prisma.feeSetting.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(fees);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, rate, fixedAmount, note } = await req.json();

  const updated = await prisma.feeSetting.update({
    where: { id },
    data: {
      rate: parseFloat(rate) || 0,
      fixedAmount: parseFloat(fixedAmount) || 0,
      note: note ?? null,
    },
  });

  return NextResponse.json(updated);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { key, label, rate, fixedAmount, note } = await req.json();
  if (!key || !label) {
    return NextResponse.json({ error: "key 和 label 為必填" }, { status: 400 });
  }

  const fee = await prisma.feeSetting.upsert({
    where: { key },
    create: { key, label, rate: parseFloat(rate) || 0, fixedAmount: parseFloat(fixedAmount) || 0, note },
    update: { label, rate: parseFloat(rate) || 0, fixedAmount: parseFloat(fixedAmount) || 0, note },
  });

  return NextResponse.json(fee);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await req.json();
  await prisma.feeSetting.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
