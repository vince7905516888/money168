import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVisiblePageKeys } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const keys = await getVisiblePageKeys(session.user.id, session.user.role);
  return NextResponse.json({ keys });
}
