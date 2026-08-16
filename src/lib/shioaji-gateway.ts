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
}

export async function fetchLiveQuote(code: string): Promise<LiveQuote | null> {
  const gatewayUrl = process.env.SHIOAJI_GATEWAY_URL;
  const gatewaySecret = process.env.SHIOAJI_GATEWAY_SECRET;
  if (!gatewayUrl || !gatewaySecret) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${gatewayUrl}/quote/${code}`, {
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
