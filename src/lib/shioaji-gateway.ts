// 永豐證券 Shioaji 即時報價：Next.js 沒辦法直接呼叫官方的 Python SDK，
// 改打獨立部署的 Python 閘道服務（shioaji-gateway/），只走 Railway 內部私有網路，
// 不對外公開，用共用密鑰保護。閘道打不通就靜默降級，不影響原本 Yahoo Finance 資料的顯示。

export interface LiveQuote {
  code: string;
  market: "TW" | "TWO";
  open: number;
  high: number;
  low: number;
  close: number;
  changePrice: number;
  changeRate: number;
  volume: number;
  buyPrice: number;
  sellPrice: number;
  ts: number;
  averagePrice: number;
  totalAmount: number;
  buyVolume: number;
  sellVolume: number;
  volumeRatio: number;
  yesterdayVolume: number;
  tickType: "Buy" | "Sell" | string;
}

export interface VolumeRankRow {
  code: string;
  name: string;
  close: number;
  changePrice: number;
  volume: number;
  totalVolume: number;
}

export interface IntradayBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickRatio {
  date: string;
  buyVolume: number;
  sellVolume: number;
  buyRatio: number | null;
  tickCount: number;
}

async function callGateway<T>(path: string, timeoutMs: number): Promise<T | null> {
  const gatewayUrl = process.env.SHIOAJI_GATEWAY_URL;
  const gatewaySecret = process.env.SHIOAJI_GATEWAY_SECRET;
  if (!gatewayUrl || !gatewaySecret) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${gatewayUrl}${path}`, {
      headers: { "X-Gateway-Secret": gatewaySecret },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function fetchLiveQuote(code: string): Promise<LiveQuote | null> {
  return callGateway<LiveQuote>(`/quote/${code}`, 4000);
}

export function fetchVolumeRanking(): Promise<VolumeRankRow[] | null> {
  return callGateway<VolumeRankRow[]>("/scanners/volume", 5000);
}

export function fetchTodayKbars(code: string): Promise<IntradayBar[] | null> {
  return callGateway<IntradayBar[]>(`/kbars/${code}`, 8000);
}

export function fetchTickRatio(code: string): Promise<TickRatio | null> {
  return callGateway<TickRatio>(`/tick-ratio/${code}`, 15000);
}
