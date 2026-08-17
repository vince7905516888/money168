import { NextRequest, NextResponse } from "next/server";

// Binance 的公開 API 會擋美國地區的連線（法規限制），Railway 部署在美國機房，
// 打 Binance 一律被 451 擋掉，改用不限地區、免金鑰的 CoinGecko。
// 代價是只能拿到官方預先聚合好的K棒粒度（依查詢天數自動決定），不能像 Binance
// 那樣自由指定 15分/1小時等任意週期，因此前端週期選單改成「天數區間」。
const DAYS_BY_INTERVAL: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

const ALLOWED_SYMBOLS = new Set(["bitcoin", "ethereum", "binancecoin", "solana", "ripple", "dogecoin"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "bitcoin";
  const interval = searchParams.get("interval") || "1d";

  if (!ALLOWED_SYMBOLS.has(symbol)) {
    return NextResponse.json({ error: "無效的幣別代碼" }, { status: 400 });
  }
  const days = DAYS_BY_INTERVAL[interval];
  if (!days) {
    return NextResponse.json({ error: "無效的時間週期" }, { status: 400 });
  }

  const url = `https://api.coingecko.com/api/v3/coins/${symbol}/ohlc?vs_currency=usd&days=${days}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.error(`CoinGecko OHLC ${res.status}: ${await res.text().catch(() => "")}`);
      return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
    }
    const raw: [number, number, number, number, number][] = await res.json();

    const candles = raw.map(([time, open, high, low, close]) => ({
      time: Math.floor(time / 1000),
      open,
      high,
      low,
      close,
    }));

    return NextResponse.json({ symbol, interval, candles });
  } catch (e) {
    console.error("CoinGecko OHLC fetch failed:", e);
    return NextResponse.json({ error: "連線資料來源失敗" }, { status: 502 });
  }
}
