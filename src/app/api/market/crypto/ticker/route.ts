import { NextRequest, NextResponse } from "next/server";
import { SYMBOL_TO_PAIR, firstResultValue } from "@/lib/kraken";

interface KrakenTicker {
  c: [string, string]; // 最新成交價, 成交量
  h: [string, string]; // 今日/24h 最高
  l: [string, string]; // 今日/24h 最低
  v: [string, string]; // 今日/24h 成交量
  o: string; // 今日開盤價（Kraken沒有真正的「滾動24h開盤」，用這個估算漲跌幅）
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTC").toUpperCase();

  const pair = SYMBOL_TO_PAIR[symbol];
  if (!pair) {
    return NextResponse.json({ error: "無效的幣別代碼" }, { status: 400 });
  }

  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;

  try {
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) {
      console.error(`Kraken Ticker ${res.status}: ${await res.text().catch(() => "")}`);
      return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
    }
    const json = await res.json();
    if (json.error?.length) {
      console.error("Kraken Ticker error:", json.error);
      return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
    }

    const ticker = firstResultValue<KrakenTicker>(json.result);
    if (!ticker) {
      return NextResponse.json({ error: "查無此幣別" }, { status: 404 });
    }

    const lastPrice = parseFloat(ticker.c[0]);
    const openPrice = parseFloat(ticker.o);

    return NextResponse.json({
      symbol,
      lastPrice,
      priceChangePercent: openPrice ? ((lastPrice - openPrice) / openPrice) * 100 : 0,
      highPrice: parseFloat(ticker.h[1]),
      lowPrice: parseFloat(ticker.l[1]),
      volume: parseFloat(ticker.v[1]),
    });
  } catch (e) {
    console.error("Kraken Ticker fetch failed:", e);
    return NextResponse.json({ error: "連線資料來源失敗" }, { status: 502 });
  }
}
