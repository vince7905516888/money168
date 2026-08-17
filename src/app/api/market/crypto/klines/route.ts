import { NextRequest, NextResponse } from "next/server";
import { SYMBOL_TO_PAIR } from "@/lib/kraken";

// Kraken公開API：免金鑰、不限地區（不像Binance會擋美國機房），支援任意時間週期，
// 且OHLC一次最多回傳最近720根，範圍夠深，不像CoinGecko只給固定一段歷史。
// 缺點是沒有BNB（競爭對手交易所自家代幣，Kraken不上架）。
const INTERVAL_MINUTES: Record<string, number> = {
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTC").toUpperCase();
  const interval = searchParams.get("interval") || "1d";

  const pair = SYMBOL_TO_PAIR[symbol];
  if (!pair) {
    return NextResponse.json({ error: "無效的幣別代碼" }, { status: 400 });
  }
  const intervalMinutes = INTERVAL_MINUTES[interval];
  if (!intervalMinutes) {
    return NextResponse.json({ error: "無效的時間週期" }, { status: 400 });
  }

  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${intervalMinutes}`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      console.error(`Kraken OHLC ${res.status}: ${await res.text().catch(() => "")}`);
      return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
    }
    const json = await res.json();
    if (json.error?.length) {
      console.error("Kraken OHLC error:", json.error);
      return NextResponse.json({ error: "查無此幣別，或資料來源目前無法連線" }, { status: 502 });
    }

    // result裡除了資料本身還有一個"last"欄位（分頁用的游標），資料的key是Kraken內部代號（例如XXBTZUSD），
    // 不等於我們查詢用的pair名稱，抓第一個不是"last"的key即可。
    const dataKey = Object.keys(json.result).find((k) => k !== "last");
    const rows: [number, string, string, string, string, string, string, number][] = dataKey ? json.result[dataKey] : [];

    const candles = rows.map(([time, open, high, low, close]) => ({
      time,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
    }));

    return NextResponse.json({ symbol, interval, candles });
  } catch (e) {
    console.error("Kraken OHLC fetch failed:", e);
    return NextResponse.json({ error: "連線資料來源失敗" }, { status: 502 });
  }
}
