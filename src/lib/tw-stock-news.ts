// 個股新聞：FinMind 的 TaiwanStockNews 資料集，免金鑰也能打（有 FINMIND_TOKEN 會附上拉高額度）。
// 原始資料混了正規媒體新聞跟 CMoney 論壇貼文／個股概覽這類非新聞內容，所以用白名單只留
// 認得出來的正規媒體來源，論壇貼文、制式頁面都濾掉；同一篇新聞不同來源標籤重複出現時
// （實際觀察到「UDN」跟「udn」兩種大小寫都會出現同一則連結）用連結去重只留一筆。

export interface StockNewsItem {
  date: string;
  source: string;
  title: string;
  link: string;
}

const SOURCE_WHITELIST = new Set(
  [
    "ETtoday財經雲", "Yahoo股市", "UDN", "聯合新聞網", "經濟日報", "工商時報", "中央社", "中央通訊社",
    "鉅亨網", "MoneyDJ理財網", "財訊", "今周刊", "鏡週刊", "自由時報", "中時新聞網", "民視新聞",
    "三立新聞網", "TVBS", "新頭殼", "風傳媒", "商業週刊", "天下雜誌", "非凡新聞", "工商財經數位",
  ].map((s) => s.toLowerCase())
);

export async function fetchStockNews(code: string, days = 14, limit = 20): Promise<StockNewsItem[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDateStr = start.toISOString().slice(0, 10);
  const token = process.env.FINMIND_TOKEN;
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockNews&data_id=${code}&start_date=${startDateStr}${
    token ? `&token=${token}` : ""
  }`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  if (json?.status !== 200 || !Array.isArray(json.data)) return [];

  const seenLinks = new Set<string>();
  const items: StockNewsItem[] = [];
  for (const row of json.data as Array<{ date?: string; source?: string; title?: string; link?: string }>) {
    if (!row.date || !row.title || !row.link || !row.source) continue;
    if (!SOURCE_WHITELIST.has(row.source.trim().toLowerCase())) continue;
    if (seenLinks.has(row.link)) continue;
    seenLinks.add(row.link);
    items.push({ date: row.date, source: row.source.trim(), title: row.title, link: row.link });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
