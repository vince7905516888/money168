// 規則式技術面綜合評分：不是機器學習，是把常見技術指標的多空判讀整理成固定規則，
// 逐項給分再加總，每一項都附理由方便使用者檢視「為什麼亮這個燈號」。
// 僅供參考，不構成投資建議——股市本質上難以預測，規則對了不代表會準。

export type Verdict = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface SignalDetail {
  name: string;
  verdict: Verdict;
  detail: string;
}

export interface StockSignalInputs {
  close: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi: number | null;
  k: number | null;
  d: number | null;
  prevK: number | null;
  prevD: number | null;
  macdDif: number | null;
  macdDea: number | null;
  bias: number | null; // 建議傳短週期乖離率（例如 6 日），數值為百分比（例如 5 代表 +5%）
  plusDI: number | null;
  minusDI: number | null;
  adx: number | null;
}

export interface StockPrediction {
  score: number; // -6 ~ +6，每項指標各貢獻 -1/0/+1
  maxScore: number; // 實際參與評分的指標數（資料不足的指標不計入，maxScore 會跟著變小）
  label: string;
  signals: SignalDetail[];
}

function evalMaTrend(close: number, ma5: number | null, ma20: number | null, ma60: number | null): SignalDetail | null {
  if (ma5 == null || ma20 == null || ma60 == null) return null;
  if (close > ma5 && ma5 > ma20 && ma20 > ma60) {
    return { name: "均線排列", verdict: "BULLISH", detail: `股價在5日均線之上，呈多頭排列（5日>20日>60日）` };
  }
  if (close < ma5 && ma5 < ma20 && ma20 < ma60) {
    return { name: "均線排列", verdict: "BEARISH", detail: `股價在5日均線之下，呈空頭排列（5日<20日<60日）` };
  }
  return { name: "均線排列", verdict: "NEUTRAL", detail: "均線糾結，沒有明確多空排列" };
}

function evalRsi(rsi: number | null): SignalDetail | null {
  if (rsi == null) return null;
  if (rsi > 70) return { name: "RSI", verdict: "BEARISH", detail: `RSI ${rsi.toFixed(1)}，進入超買區，短線拉回風險升高` };
  if (rsi < 30) return { name: "RSI", verdict: "BULLISH", detail: `RSI ${rsi.toFixed(1)}，進入超賣區，可能醞釀反彈` };
  if (rsi >= 50) return { name: "RSI", verdict: "BULLISH", detail: `RSI ${rsi.toFixed(1)}，多方動能較強` };
  return { name: "RSI", verdict: "BEARISH", detail: `RSI ${rsi.toFixed(1)}，空方動能較強` };
}

function evalKdj(k: number | null, d: number | null, prevK: number | null, prevD: number | null): SignalDetail | null {
  if (k == null || d == null) return null;
  if (prevK != null && prevD != null) {
    if (prevK <= prevD && k > d && k < 50) {
      return { name: "KDJ", verdict: "BULLISH", detail: `K值(${k.toFixed(1)})低檔向上穿越D值(${d.toFixed(1)})，黃金交叉` };
    }
    if (prevK >= prevD && k < d && k > 50) {
      return { name: "KDJ", verdict: "BEARISH", detail: `K值(${k.toFixed(1)})高檔向下穿越D值(${d.toFixed(1)})，死亡交叉` };
    }
  }
  if (k > d) return { name: "KDJ", verdict: "BULLISH", detail: `K值(${k.toFixed(1)}) > D值(${d.toFixed(1)})` };
  return { name: "KDJ", verdict: "BEARISH", detail: `K值(${k.toFixed(1)}) < D值(${d.toFixed(1)})` };
}

function evalMacd(dif: number | null, dea: number | null): SignalDetail | null {
  if (dif == null || dea == null) return null;
  if (dif > dea) return { name: "MACD", verdict: "BULLISH", detail: "DIF 在訊號線之上，動能偏多" };
  if (dif < dea) return { name: "MACD", verdict: "BEARISH", detail: "DIF 在訊號線之下，動能偏空" };
  return { name: "MACD", verdict: "NEUTRAL", detail: "DIF 貼著訊號線，方向不明" };
}

function evalBias(bias: number | null): SignalDetail | null {
  if (bias == null) return null;
  if (bias > 5) return { name: "乖離率", verdict: "BEARISH", detail: `乖離率 +${bias.toFixed(1)}%，股價偏離均線過多，拉回機率較高` };
  if (bias < -5) return { name: "乖離率", verdict: "BULLISH", detail: `乖離率 ${bias.toFixed(1)}%，股價偏離均線過多，反彈機率較高` };
  return { name: "乖離率", verdict: "NEUTRAL", detail: `乖離率 ${bias.toFixed(1)}%，屬合理範圍` };
}

function evalDmi(plusDI: number | null, minusDI: number | null, adx: number | null): SignalDetail | null {
  if (plusDI == null || minusDI == null || adx == null) return null;
  if (adx < 20) return { name: "DMI/ADX", verdict: "NEUTRAL", detail: `ADX ${adx.toFixed(1)}，趨勢力道不足，區間整理機率較高` };
  if (plusDI > minusDI) return { name: "DMI/ADX", verdict: "BULLISH", detail: `+DI > -DI 且 ADX ${adx.toFixed(1)}，多方趨勢動能較強` };
  return { name: "DMI/ADX", verdict: "BEARISH", detail: `-DI > +DI 且 ADX ${adx.toFixed(1)}，空方趨勢動能較強` };
}

function labelForScore(score: number, maxScore: number): string {
  if (maxScore === 0) return "資料不足，無法評分";
  const ratio = score / maxScore;
  if (ratio >= 0.65) return "強烈偏多";
  if (ratio >= 0.25) return "偏多";
  if (ratio <= -0.65) return "強烈偏空";
  if (ratio <= -0.25) return "偏空";
  return "中性／多空不明";
}

export function computeStockPrediction(inputs: StockSignalInputs): StockPrediction {
  const signals = [
    evalMaTrend(inputs.close, inputs.ma5, inputs.ma20, inputs.ma60),
    evalRsi(inputs.rsi),
    evalKdj(inputs.k, inputs.d, inputs.prevK, inputs.prevD),
    evalMacd(inputs.macdDif, inputs.macdDea),
    evalBias(inputs.bias),
    evalDmi(inputs.plusDI, inputs.minusDI, inputs.adx),
  ].filter((s): s is SignalDetail => s != null);

  const score = signals.reduce((s, sig) => s + (sig.verdict === "BULLISH" ? 1 : sig.verdict === "BEARISH" ? -1 : 0), 0);
  const maxScore = signals.length;

  return { score, maxScore, label: labelForScore(score, maxScore), signals };
}
