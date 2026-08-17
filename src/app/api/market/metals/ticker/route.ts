import { NextRequest, NextResponse } from "next/server";
import { fetchMetalQuote, METAL_SYMBOLS } from "@/lib/precious-metals";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const metal = (searchParams.get("metal") || "GOLD").toUpperCase();

  if (!(metal in METAL_SYMBOLS)) {
    return NextResponse.json({ error: "無效的貴金屬代碼" }, { status: 400 });
  }

  const quote = await fetchMetalQuote(metal);
  if (!quote) {
    return NextResponse.json({ error: "查無資料，或資料來源目前無法連線" }, { status: 502 });
  }

  return NextResponse.json({ metal, ...quote });
}
