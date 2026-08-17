import { NextRequest, NextResponse } from "next/server";

// 跟 klines route 同理，改用不限地區的 CoinGecko 取代被美國機房擋掉的 Binance。
const ALLOWED_SYMBOLS = new Set(["bitcoin", "ethereum", "binancecoin", "solana", "ripple", "dogecoin"]);

interface CoinGeckoMarket {
  current_price: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  total_volume: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "bitcoin";

  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return NextResponse.json({ error: "無效的幣別代碼" }, { status: 400 });
  }

  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${symbol}`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      console.error(`CoinGecko markets ${res.status}: ${await res.text().catch(() => "")}`);
      return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
    }
    const data: CoinGeckoMarket[] = await res.json();
    const market = data[0];
    if (!market) {
      return NextResponse.json({ error: "查無此幣別" }, { status: 404 });
    }

    return NextResponse.json({
      symbol,
      lastPrice: market.current_price,
      priceChangePercent: market.price_change_percentage_24h,
      highPrice: market.high_24h,
      lowPrice: market.low_24h,
      volume: market.total_volume,
    });
  } catch (e) {
    console.error("CoinGecko markets fetch failed:", e);
    return NextResponse.json({ error: "連線資料來源失敗" }, { status: 502 });
  }
}
