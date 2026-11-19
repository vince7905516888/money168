// FinMind 日線資料抓取，從「台灣股市」頁K線圖的 API route 抽出來共用，智能助理回答
// 技術面問題時也要用同一份資料源，兩邊數字才會對得起來。
// FinMind 統一提供上市(TWSE)＋上櫃(TPEX)的官方日線資料，免費額度只到日線。

export interface DailyQuote {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export async function fetchFinMindDaily(code: string, startDate: string): Promise<DailyQuote[] | null> {
  const token = process.env.FINMIND_TOKEN;
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startDate}${
    token ? `&token=${token}` : ""
  }`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.status !== 200 || !Array.isArray(json.data)) return null;

  return json.data.map(
    (row: { date: string; open: number | null; max: number | null; min: number | null; close: number | null; Trading_Volume: number | null }) => ({
      date: row.date,
      open: row.open,
      high: row.max,
      low: row.min,
      close: row.close,
      volume: row.Trading_Volume,
    })
  );
}
