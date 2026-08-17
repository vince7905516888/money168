// 技術指標計算公式，比照「台灣股市」頁（src/app/(member)/market/tw-stock/page.tsx）
// 使用的同一套算法抽出來共用，確保兩個頁面算出來的數字一致。

export interface OHLC {
  high: number;
  low: number;
  close: number;
}

export function sma(values: number[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

export function stddev(values: number[], period: number, index: number, mean: number): number | null {
  if (index + 1 < period) return null;
  let sumSq = 0;
  for (let i = index - period + 1; i <= index; i++) sumSq += (values[i] - mean) ** 2;
  return Math.sqrt(sumSq / period);
}

export function computeMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => sma(closes, period, i));
}

export function computeBollinger(closes: number[], period = 20, mult = 2): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  closes.forEach((_, i) => {
    const ma = sma(closes, period, i);
    const sd = ma != null ? stddev(closes, period, i, ma) : null;
    if (ma != null && sd != null) {
      upper.push(ma + mult * sd);
      lower.push(ma - mult * sd);
    } else {
      upper.push(null);
      lower.push(null);
    }
  });
  return { upper, lower };
}

function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length);
  const factor = 2 / (period + 1);
  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    result[i] = values[i] * factor + result[i - 1] * (1 - factor);
  }
  return result;
}

// RSI(14)：Wilder 平滑移動平均
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return result;
}

// KDJ(9,3,3)：RSV 取近9根高低，K/D 用平滑因子1/3
export function computeKDJ(candles: OHLC[], period = 9) {
  const n = candles.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);
  const j: (number | null)[] = new Array(n).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < n; i++) {
    if (i + 1 < period) continue;
    let highN = -Infinity;
    let lowN = Infinity;
    for (let m = i - period + 1; m <= i; m++) {
      highN = Math.max(highN, candles[m].high);
      lowN = Math.min(lowN, candles[m].low);
    }
    const rsv = highN === lowN ? 50 : ((candles[i].close - lowN) / (highN - lowN)) * 100;
    const curK = (prevK * 2 + rsv) / 3;
    const curD = (prevD * 2 + curK) / 3;
    k[i] = curK;
    d[i] = curD;
    j[i] = 3 * curK - 2 * curD;
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
}

// MACD(12,26,9)：DIF = EMA12 - EMA26，DEA = DIF 的 EMA9，柱狀圖 = DIF - DEA
export function computeMACD(closes: number[]) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, i) => ema12[i] - ema26[i]);
  const dea = ema(dif, 9);
  const hist = dif.map((v, i) => v - dea[i]);
  return { dif, dea, hist };
}

// 乖離率 BIAS(n) = (收盤價 - n日均線) / n日均線 * 100
export function computeBIAS(closes: number[], period: number): (number | null)[] {
  return closes.map((c, i) => {
    const ma = sma(closes, period, i);
    return ma != null && ma !== 0 ? ((c - ma) / ma) * 100 : null;
  });
}

// DMI/ADX(14)：Wilder 平滑，+DI/-DI 判斷多空方向，ADX 判斷趨勢強弱
export function computeDMI(candles: OHLC[], period = 14) {
  const n = candles.length;
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const adx: (number | null)[] = new Array(n).fill(null);

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let prevADX: number | null = null;
  const dxHistory: number[] = [];

  for (let i = 1; i < n; i++) {
    if (i <= period) {
      smoothTR += tr[i];
      smoothPlusDM += plusDM[i];
      smoothMinusDM += minusDM[i];
      if (i === period) {
        const pDI = smoothTR === 0 ? 0 : (100 * smoothPlusDM) / smoothTR;
        const mDI = smoothTR === 0 ? 0 : (100 * smoothMinusDM) / smoothTR;
        plusDI[i] = pDI;
        minusDI[i] = mDI;
        const dx = pDI + mDI === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / (pDI + mDI);
        dxHistory.push(dx);
      }
    } else {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
      const pDI = smoothTR === 0 ? 0 : (100 * smoothPlusDM) / smoothTR;
      const mDI = smoothTR === 0 ? 0 : (100 * smoothMinusDM) / smoothTR;
      plusDI[i] = pDI;
      minusDI[i] = mDI;
      const dx = pDI + mDI === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / (pDI + mDI);
      dxHistory.push(dx);

      if (dxHistory.length === period) {
        prevADX = dxHistory.reduce((s, v) => s + v, 0) / period;
        adx[i] = prevADX;
      } else if (dxHistory.length > period && prevADX != null) {
        prevADX = (prevADX * (period - 1) + dx) / period;
        adx[i] = prevADX;
      }
    }
  }

  return { plusDI, minusDI, adx };
}
