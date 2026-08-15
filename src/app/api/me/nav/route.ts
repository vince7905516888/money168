import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVisiblePageKeys, getVisibleFeatureKeys } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const [pageKeys, featureKeys] = await Promise.all([
    getVisiblePageKeys(session.user.id, session.user.role),
    getVisibleFeatureKeys(session.user.id, session.user.role),
  ]);
  return NextResponse.json({ keys: [...pageKeys, ...featureKeys] });
}
