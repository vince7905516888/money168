import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  return NextResponse.json({ role: session.user.role, id: session.user.id });
}
