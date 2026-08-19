import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_STEPS = 8;

function parseRatios(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length < 2 || input.length > MAX_STEPS) return null;
  const ratios = input.map((v) => parseFloat(v));
  if (ratios.some((v) => isNaN(v) || v <= 0)) return null;
  return ratios;
}

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const strategies = await prisma.martingaleStrategy.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { name, ratios, note } = await req.json();
  const parsedRatios = parseRatios(ratios);
  if (!name?.trim() || !parsedRatios) {
    return NextResponse.json({ error: "請填寫方案名稱，並提供 2～8 組大於 0 的比例數值" }, { status: 400 });
  }

  const strategy = await prisma.martingaleStrategy.create({
    data: { name: name.trim(), ratios: parsedRatios, note: note?.trim() || null },
  });
  return NextResponse.json(strategy, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id, name, ratios, note } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  if (ratios !== undefined && !parseRatios(ratios)) {
    return NextResponse.json({ error: "請提供 2～8 組大於 0 的比例數值" }, { status: 400 });
  }

  const updated = await prisma.martingaleStrategy.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(ratios !== undefined && { ratios: parseRatios(ratios)! }),
      ...(note !== undefined && { note: note?.trim() || null }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "無權限" }, { status: 403 });
  }

  const { id } = await req.json();
  await prisma.martingaleStrategy.delete({ where: { id } });
  return NextResponse.json({ message: "已刪除" });
}
