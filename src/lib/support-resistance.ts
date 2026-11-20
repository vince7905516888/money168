// 歷史轉折支撐壓力偵測：找「前高（壓力）／前低（支撐）」轉折點，而且轉折當下 RSI 要達到
// 極端值（高點 RSI>=80、低點 RSI<=20）、成交量也要放大，三個條件同時成立才算數，避免隨便
// 一個小波動就被標成支撐壓力線。pivotLookback 決定「前後要幾天都沒有更高/更低」才算轉折。
// 規則式偵測，不是機器學習，僅供參考不構成投資建議。

export type SwingType = "RESISTANCE" | "SUPPORT";

export interface SwingLevel {
  type: SwingType;
  date: string;
  price: number;
  rsi: number;
  volumeRatio: number; // 當天成交量 ÷ 前 volumeLookback 天均量
}

interface SwingCandle {
  date: string;
  high: number;
  low: number;
  volume: number;
}

export interface SwingLevelOptions {
  pivotLookback?: number; // 前後幾天都沒有更高/更低，預設5天
  rsiHighThreshold?: number; // 前高轉折要求的 RSI 下限，預設80
  rsiLowThreshold?: number; // 前低轉折要求的 RSI 上限，預設20
  volumeLookback?: number; // 均量計算天數，預設20天
  volumeRatioThreshold?: number; // 成交量至少要是均量的幾倍，預設1.2倍
}

export function findSwingLevels(candles: SwingCandle[], rsi: (number | null)[], opts: SwingLevelOptions = {}): SwingLevel[] {
  const {
    pivotLookback = 5,
    rsiHighThreshold = 80,
    rsiLowThreshold = 20,
    volumeLookback = 20,
    volumeRatioThreshold = 1.2,
  } = opts;

  const levels: SwingLevel[] = [];
  const n = candles.length;

  for (let i = pivotLookback; i < n - pivotLookback; i++) {
    const c = candles[i];
    const r = rsi[i];
    if (r == null) continue;

    // 均量不含當天，避免當天自己的量把自己的均量拉高
    const volStart = Math.max(0, i - volumeLookback);
    const priorVolumes = candles.slice(volStart, i).map((x) => x.volume);
    if (priorVolumes.length === 0) continue;
    const avgVol = priorVolumes.reduce((s, v) => s + v, 0) / priorVolumes.length;
    const volumeRatio = avgVol > 0 ? c.volume / avgVol : 0;
    if (volumeRatio < volumeRatioThreshold) continue;

    const before = candles.slice(i - pivotLookback, i);
    const after = candles.slice(i + 1, i + 1 + pivotLookback);

    const isSwingHigh = before.every((x) => x.high <= c.high) && after.every((x) => x.high <= c.high);
    if (isSwingHigh && r >= rsiHighThreshold) {
      levels.push({ type: "RESISTANCE", date: c.date, price: c.high, rsi: r, volumeRatio });
      continue;
    }

    const isSwingLow = before.every((x) => x.low >= c.low) && after.every((x) => x.low >= c.low);
    if (isSwingLow && r <= rsiLowThreshold) {
      levels.push({ type: "SUPPORT", date: c.date, price: c.low, rsi: r, volumeRatio });
    }
  }

  return levels;
}
