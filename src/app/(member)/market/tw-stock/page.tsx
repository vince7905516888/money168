"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
  Brush,
  useYAxisScale,
  useXAxisScale,
  useYAxisInverseScale,
  usePlotArea,
} from "recharts";

const SYNC_ID = "tw-stock-charts";

interface Quote {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 永豐證券即時報價：透過內部 shioaji-gateway 服務取得，比 Yahoo Finance 的延遲資料更即時，
// 閘道打不通時後端會回傳 null，前端這時自動退回用 K線最後一筆（Yahoo）資料顯示。
interface LiveQuote {
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
  tickType: string;
}

interface StockData {
  code: string;
  market: "TW" | "TWO";
  name: string;
  currency: string;
  quotes: Quote[];
  liveQuote: LiveQuote | null;
}

// 個股基本面統計：營收/EPS(季)/本益比/殖利率來自證交所公開資料，
// EPS(近4季)、ROE(近4季)由系統逐季累積歷史 EPS 快照，累積滿4季後才會有值（見 tw-stock-fundamentals.ts）。
interface FundamentalStats {
  cumulativeRevenueYoY: number | null; // 累計營收YoY(%)
  revenueYoY: number | null; // 營收YoY(%)
  revenueMoM: number | null; // 營收MoM(%)
  epsQuarter: number | null; // EPS(季)
  eps4Q: number | null; // EPS(近4季)
  per: number | null; // 本益比
  dividendYield: number | null; // 殖利率(%)
  roe4Q: number | null; // ROE(近4季)
}

// 個股基本資料：董事長/總經理/資本額等公司登記資訊，來自證交所/櫃買中心公開資訊觀測站資料
interface CompanyProfile {
  code: string;
  name: string;
  englishName: string | null;
  industry: string | null;
  chairman: string | null;
  generalManager: string | null;
  spokesman: string | null;
  foundedDate: string | null;
  listedDate: string | null;
  capital: number | null;
  issuedShares: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  transferAgent: string | null;
  transferAgentPhone: string | null;
  transferAgentAddress: string | null;
}

// 三大法人買賣超（張）：來自證交所 T86 日報表，近20個交易日逐日資料，僅涵蓋上市股票
interface InstitutionalRow {
  date: string;
  foreignNetLots: number;
  trustNetLots: number;
  dealerNetLots: number;
  totalNetLots: number;
}

// 融資融券餘額（張）：來自證交所 MI_MARGN 日報表，近20個交易日逐日資料，僅涵蓋上市股票
interface MarginRow {
  date: string;
  marginBalance: number;
  marginChange: number;
  shortBalance: number;
  shortChange: number;
}

// 股票觀察名單：存在使用者自己的 UserWatchStock，點擊可直接查詢，不用每次都重新搜尋
interface WatchStock {
  id: string;
  code: string;
  name: string | null;
}

const INTERVAL_OPTIONS = [
  { value: "60m", label: "60分K" },
  { value: "1d", label: "日線" },
  { value: "1wk", label: "週線" },
  { value: "1mo", label: "月線" },
] as const;
type ChartInterval = (typeof INTERVAL_OPTIONS)[number]["value"];

// 法人買賣超趨勢圖：指標下拉選單可切換要看哪個數字，全部統一畫「每日值(長條)+累計值(線)」，
// 融資/融券沒有現成的「淨買賣超」概念，改用「餘額增減」比照辦理，一樣可以疊出累計走勢。
const FLOW_METRICS = [
  { key: "totalNetLots", label: "主力買賣超", source: "institutional" },
  { key: "foreignNetLots", label: "外資", source: "institutional" },
  { key: "trustNetLots", label: "投信", source: "institutional" },
  { key: "dealerNetLots", label: "自營商", source: "institutional" },
  { key: "marginChange", label: "融資餘額增減", source: "margin" },
  { key: "shortChange", label: "融券餘額增減", source: "margin" },
] as const;
type FlowMetricKey = (typeof FLOW_METRICS)[number]["key"];

const FLOW_PERIODS = [
  { key: "1m", label: "1個月" },
  { key: "3m", label: "3個月" },
  { key: "6m", label: "6個月" },
  { key: "1y", label: "1年" },
  { key: "3y", label: "3年" },
] as const;
type FlowPeriodKey = (typeof FLOW_PERIODS)[number]["key"];

interface FlowHistoryResponse {
  institutional: InstitutionalRow[];
  margin: MarginRow[];
  requestedFrom: string;
}

// 買超/賣超前 15 名分點：需要券商分點籌碼資料 API，目前先保留版位、欄位對齊圖片參考的分點排行表。
interface ChipRanking {
  brokerName: string;
  netVolume: number; // 買賣超（張）
  buyVolume: number; // 買張
  sellVolume: number; // 賣張
  avgBuyPrice: number; // 買均價
  avgSellPrice: number; // 賣均價
  totalVolume: number; // 交易量
  profitLoss: number; // 損益（萬）
}

interface RetailRatio {
  date: string;
  totalShares: number;
  totalHolders: number;
  belowThresholdShares: number;
  belowThresholdHolders: number;
  ratioPercent: number;
}

interface RetailRatioHistoryPoint {
  date: string;
  ratioPercent: number;
  holders: number;
}

interface TickRatio {
  date: string;
  buyVolume: number;
  sellVolume: number;
  buyRatio: number | null;
  tickCount: number;
}

interface IntradayBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeRankRow {
  code: string;
  name: string;
  close: number;
  changePrice: number;
  volume: number;
  totalVolume: number;
}

interface FuturesPosition {
  contractCode: string;
  item: string;
  longOpenInterest: number;
  shortOpenInterest: number;
  netOpenInterest: number;
}

interface FuturesPositionsResult {
  date: string;
  positions: FuturesPosition[];
}

interface ForeignHoldingRatio {
  date: string;
  issuedShares: number;
  foreignShares: number;
  foreignHoldingPercent: number;
}

interface LendingAvailability {
  availableVolume: number;
}

interface DayTradingRatio {
  date: string;
  dayTradingShares: number;
  totalShares: number;
  ratioPercent: number | null;
}

interface TradingAlert {
  type: "注意" | "處置";
  date: string;
  reason: string;
  detail?: string;
}

interface ExDividendNotice {
  date: string;
  type: string;
  cashDividend: number | null;
  stockDividendRatio: string | null;
}

interface MaterialAnnouncement {
  date: string;
  subject: string;
}

interface MarketRankingRow {
  code: string;
  name: string;
  netLots: number;
}

interface MarketRanking {
  date: string;
  buyTop: MarketRankingRow[];
  sellTop: MarketRankingRow[];
}

interface ChartRow extends Quote {
  range: [number, number];
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  rsi: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
  plusDI: number | null;
  minusDI: number | null;
  adx: number | null;
  bias6: number | null;
  bias12: number | null;
  bias24: number | null;
}

function sma(values: number[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

function stddev(values: number[], period: number, index: number, mean: number): number | null {
  if (index + 1 < period) return null;
  let sumSq = 0;
  for (let i = index - period + 1; i <= index; i++) sumSq += (values[i] - mean) ** 2;
  return Math.sqrt(sumSq / period);
}

// RSI(14)：Wilder 平滑移動平均，台股看盤軟體常見算法
function computeRSI(closes: number[], period = 14): (number | null)[] {
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

// KDJ(9,3,3)：RSV 取近 9 日高低，K/D 用平滑因子 1/3，台股看盤軟體常見算法
function computeKDJ(quotes: Quote[], period = 9) {
  const k: (number | null)[] = new Array(quotes.length).fill(null);
  const d: (number | null)[] = new Array(quotes.length).fill(null);
  const j: (number | null)[] = new Array(quotes.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < quotes.length; i++) {
    if (i + 1 < period) continue;
    let highN = -Infinity;
    let lowN = Infinity;
    for (let n = i - period + 1; n <= i; n++) {
      highN = Math.max(highN, quotes[n].high);
      lowN = Math.min(lowN, quotes[n].low);
    }
    const rsv = highN === lowN ? 50 : ((quotes[i].close - lowN) / (highN - lowN)) * 100;
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

function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length);
  const factor = 2 / (period + 1);
  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    result[i] = values[i] * factor + result[i - 1] * (1 - factor);
  }
  return result;
}

// MACD(12,26,9)：DIF = EMA12 - EMA26，DEA = DIF 的 EMA9，柱狀圖 = DIF - DEA
function computeMACD(closes: number[]) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, i) => ema12[i] - ema26[i]);
  const dea = ema(dif, 9);
  const hist = dif.map((v, i) => v - dea[i]);
  return { dif, dea, hist };
}

// 乖離率 BIAS(n) = (收盤價 - n日均線) / n日均線 * 100，台股常用 6/12/24 日
function computeBIAS(closes: number[], period: number): (number | null)[] {
  return closes.map((c, i) => {
    const ma = sma(closes, period, i);
    return ma != null && ma !== 0 ? ((c - ma) / ma) * 100 : null;
  });
}

// DMI/ADX(14)：Wilder 平滑，+DI/-DI 判斷多空方向，ADX 判斷趨勢強弱，台股看盤軟體常見算法
function computeDMI(quotes: Quote[], period = 14) {
  const n = quotes.length;
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const adx: (number | null)[] = new Array(n).fill(null);

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = quotes[i].high - quotes[i - 1].high;
    const downMove = quotes[i - 1].low - quotes[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      quotes[i].high - quotes[i].low,
      Math.abs(quotes[i].high - quotes[i - 1].close),
      Math.abs(quotes[i].low - quotes[i - 1].close)
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

function buildChartRows(quotes: Quote[]): ChartRow[] {
  const closes = quotes.map((q) => q.close);
  const rsi = computeRSI(closes);
  const { k, d, j } = computeKDJ(quotes);
  const { dif, dea, hist } = computeMACD(closes);
  const { plusDI, minusDI, adx } = computeDMI(quotes);
  const bias6 = computeBIAS(closes, 6);
  const bias12 = computeBIAS(closes, 12);
  const bias24 = computeBIAS(closes, 24);
  return quotes.map((q, i) => {
    const ma20 = sma(closes, 20, i);
    const bbStd = ma20 != null ? stddev(closes, 20, i, ma20) : null;
    return {
      ...q,
      range: [q.low, q.high],
      ma5: sma(closes, 5, i),
      ma20,
      ma60: sma(closes, 60, i),
      ma120: sma(closes, 120, i),
      bbUpper: ma20 != null && bbStd != null ? ma20 + 2 * bbStd : null,
      bbLower: ma20 != null && bbStd != null ? ma20 - 2 * bbStd : null,
      rsi: rsi[i],
      k: k[i],
      d: d[i],
      j: j[i],
      macdDif: dif[i],
      macdDea: dea[i],
      macdHist: hist[i],
      plusDI: plusDI[i],
      minusDI: minusDI[i],
      adx: adx[i],
      bias6: bias6[i],
      bias12: bias12[i],
      bias24: bias24[i],
    };
  });
}

// recharts range-bar 技巧：Bar 的 dataKey 回傳 [low, high]，畫布上 y/height 對應這個區間，
// 開高低收其餘位置用線性內插算出像素座標，藉此手繪 K 棒（不用額外圖表套件）。
function CandleShape(props: unknown) {
  const p = props as { x: number; y: number; width: number; height: number; payload: ChartRow };
  const { x, y, width, height, payload } = p;
  const { open, close, high, low } = payload;
  if (height <= 0 || high === low) return null;

  const pxPerUnit = height / (high - low);
  const toY = (v: number) => y + (high - v) * pxPerUnit;

  const isUp = close >= open;
  const color = isUp ? "#ef4444" : "#22c55e"; // 台股習慣：紅漲綠跌
  const bodyTop = toY(Math.max(open, close));
  const bodyBottom = toY(Math.min(open, close));
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  const centerX = x + width / 2;

  return (
    <g>
      <line x1={centerX} x2={centerX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x} y={bodyTop} width={width} height={bodyHeight} fill={color} />
    </g>
  );
}

const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });

type DrawTool = "none" | "horizontal" | "trend";
interface HorizontalLine {
  id: string;
  price: number;
}
interface TrendLine {
  id: string;
  x1: string;
  y1: number;
  x2: string;
  y2: number;
}

// K線畫線工具＋游標標價：recharts 3.x 把 Customized 整個廢棄了（拿不到 xAxisMap/yAxisMap/offset），
// 改用官方新的 hooks（useYAxisScale／useXAxisScale／useYAxisInverseScale／usePlotArea）取得真正的
// scale。這幾個 hooks 只能在 <ComposedChart> 底下的子元件呼叫，所以 DrawingLayer 要直接當子元件渲染
// （不能包在 Customized 裡），同時把「像素→價格」的反查函式存進 ref，讓外層 <ComposedChart> 自己的
// onClick/onMouseMove（跟 Tooltip 共用同一套、保證會觸發）能讀出來用。
function DrawingLayer(props: {
  horizontalLines: HorizontalLine[];
  trendLines: TrendLine[];
  pendingTrendPoint: { x: string; y: number } | null;
  hoverPrice: number | null;
  scaleRef: React.MutableRefObject<{ yInverse: (px: number) => unknown } | null>;
  onRemoveHorizontal: (id: string) => void;
  onRemoveTrend: (id: string) => void;
}) {
  const { horizontalLines, trendLines, pendingTrendPoint, hoverPrice, scaleRef, onRemoveHorizontal, onRemoveTrend } = props;

  const yScale = useYAxisScale();
  const xScale = useXAxisScale();
  const yInverse = useYAxisInverseScale();
  const plotArea = usePlotArea();

  useEffect(() => {
    scaleRef.current = yInverse ? { yInverse } : null;
  }, [yInverse, scaleRef]);

  if (!yScale || !xScale || !plotArea) return null;

  const priceToY = (price: number) => yScale(price) ?? 0;
  const dateToX = (date: string) => xScale(date, { position: "middle" }) ?? 0;

  const priceLabel = (price: number, y: number, color: string, onRemove?: () => void) => (
    <g>
      <line x1={plotArea.x} x2={plotArea.x + plotArea.width} y1={y} y2={y} stroke={color} strokeWidth={1.25} strokeDasharray="4 3" />
      <rect x={plotArea.x + plotArea.width + 2} y={y - 9} width={62} height={18} fill={color} rx={3} />
      <text x={plotArea.x + plotArea.width + 33} y={y + 4} fontSize={10} fill="#fff" textAnchor="middle">
        {price.toFixed(2)}
      </text>
      {onRemove && (
        <text
          x={plotArea.x + plotArea.width - 6}
          y={y - 10}
          fontSize={13}
          fill={color}
          textAnchor="end"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </text>
      )}
    </g>
  );

  return (
    <g>
      {horizontalLines.map((line) => (
        <g key={line.id}>{priceLabel(line.price, priceToY(line.price), "#6366f1", () => onRemoveHorizontal(line.id))}</g>
      ))}
      {trendLines.map((line) => {
        const x1 = dateToX(line.x1);
        const x2 = dateToX(line.x2);
        const y1 = priceToY(line.y1);
        const y2 = priceToY(line.y2);
        return (
          <g key={line.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth={2} />
            <circle cx={x1} cy={y1} r={3} fill="#f59e0b" />
            <circle cx={x2} cy={y2} r={3} fill="#f59e0b" />
            <text
              x={(x1 + x2) / 2}
              y={(y1 + y2) / 2 - 8}
              fontSize={13}
              fill="#f59e0b"
              textAnchor="middle"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveTrend(line.id);
              }}
            >
              ×
            </text>
          </g>
        );
      })}
      {pendingTrendPoint && (
        <circle cx={dateToX(pendingTrendPoint.x)} cy={priceToY(pendingTrendPoint.y)} r={4} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
      )}
      {hoverPrice != null && priceLabel(hoverPrice, priceToY(hoverPrice), "#94a3b8")}
    </g>
  );
}

export default function TwStockPage() {
  const [codeInput, setCodeInput] = useState("2330");
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 個股資訊：營收/EPS(季)/本益比/殖利率已接證交所公開資料，EPS(近4季)、ROE(近4季)
  // 需要額外的歷史季度或資產負債表資料，目前尚未找到可靠免費來源，固定回傳 null。
  const [fundamentals, setFundamentals] = useState<FundamentalStats | null>(null);
  // 個股基本資料：董事長/總經理/資本額等公司登記資訊，來自證交所/櫃買中心公開資料
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  // 以下籌碼排行目前沒有串接來源，先保留 UI 版位與資料結構、全部給空陣列。
  const [buyRanking] = useState<ChipRanking[]>([]);
  const [sellRanking] = useState<ChipRanking[]>([]);

  // 三大法人買賣超、融資融券：真的接了證交所公開資料，近20個交易日逐日陣列
  const [institutional, setInstitutional] = useState<InstitutionalRow[]>([]);
  const [margin, setMargin] = useState<MarginRow[]>([]);

  // 法人買賣超趨勢圖：指標/區間可切換，資料來自逐日累積的快照表（見 flow-history API）
  const [flowMetric, setFlowMetric] = useState<FlowMetricKey>("totalNetLots");
  const [flowPeriod, setFlowPeriod] = useState<FlowPeriodKey>("1m");
  const [flowData, setFlowData] = useState<FlowHistoryResponse | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);

  useEffect(() => {
    if (!data?.code) return;
    setFlowLoading(true);
    fetch(`/api/market/tw-stock/${data.code}/flow-history?period=${flowPeriod}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setFlowData(body))
      .catch(() => setFlowData(null))
      .finally(() => setFlowLoading(false));
  }, [data?.code, flowPeriod]);

  // 散戶持股比率：資料源為集保結算所公開資料「集保戶股權分散表」，每週更新一次
  const [retailThreshold, setRetailThreshold] = useState("20");
  const [retailRatio, setRetailRatio] = useState<RetailRatio | null>(null);
  const [retailRatioError, setRetailRatioError] = useState<string | null>(null);
  useEffect(() => {
    if (!data?.code) {
      setRetailRatio(null);
      setRetailRatioError(null);
      return;
    }
    setRetailRatio(null);
    setRetailRatioError(null);
    fetch(`/api/market/tw-stock/${data.code}/retail-ratio?threshold=${retailThreshold}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setRetailRatioError(body.error || "查詢失敗");
          return;
        }
        setRetailRatio(await r.json());
      })
      .catch(() => setRetailRatioError("查詢失敗"));
  }, [data?.code, retailThreshold]);

  // 散戶持股比率趨勢：集保資料沒有歷史查詢功能，只能靠每次查詢時逐週存snapshot慢慢累積，
  // 剛開始可能只有1個資料點，之後每週查詢會多一個點
  const [retailHistory, setRetailHistory] = useState<RetailRatioHistoryPoint[] | null>(null);
  useEffect(() => {
    if (!data?.code) {
      setRetailHistory(null);
      return;
    }
    setRetailHistory(null);
    fetch(`/api/market/tw-stock/${data.code}/retail-ratio-history?threshold=${retailThreshold}`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((body) => setRetailHistory(body.history ?? []))
      .catch(() => setRetailHistory([]));
  }, [data?.code, retailThreshold]);

  // 內外盤比：永豐逐筆成交(ticks)在閘道端就聚合好了，這裡拿到的已經是算好的結果
  const [tickRatio, setTickRatio] = useState<TickRatio | null>(null);
  useEffect(() => {
    if (!data?.code) {
      setTickRatio(null);
      return;
    }
    setTickRatio(null);
    fetch(`/api/market/tw-stock/${data.code}/tick-ratio`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setTickRatio)
      .catch(() => setTickRatio(null));
  }, [data?.code]);

  // 今日走勢圖：永豐1分鐘K棒，只有這個粒度、沒有日線彙總，只拿來畫「當天」走勢
  const [intradayBars, setIntradayBars] = useState<IntradayBar[] | null>(null);
  useEffect(() => {
    if (!data?.code) {
      setIntradayBars(null);
      return;
    }
    setIntradayBars(null);
    fetch(`/api/market/tw-stock/${data.code}/intraday`)
      .then((r) => (r.ok ? r.json() : { bars: [] }))
      .then((body) => setIntradayBars(body.bars ?? []))
      .catch(() => setIntradayBars([]));
  }, [data?.code]);

  // 即時成交量排行：走永豐scanners，跟目前查詢的股票無關，進頁面就抓一次
  const [volumeRanking, setVolumeRanking] = useState<VolumeRankRow[] | null>(null);
  useEffect(() => {
    fetch("/api/market/tw-stock/volume-ranking")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setVolumeRanking(body?.ranking ?? null))
      .catch(() => setVolumeRanking(null));
  }, []);

  // 期貨三大法人未平倉（台指期空單等）：跟目前查詢的股票無關，市場總體指標，進頁面就抓一次
  const [futuresPositions, setFuturesPositions] = useState<FuturesPositionsResult | null>(null);
  useEffect(() => {
    fetch("/api/market/futures-positions")
      .then((r) => (r.ok ? r.json() : null))
      .then(setFuturesPositions)
      .catch(() => setFuturesPositions(null));
  }, []);

  // 個股籌碼補充資料：外資持股比率／借券餘額／當沖比，跟目前查詢的股票有關
  const [foreignHolding, setForeignHolding] = useState<ForeignHoldingRatio | null>(null);
  const [lending, setLending] = useState<LendingAvailability | null>(null);
  const [dayTrading, setDayTrading] = useState<DayTradingRatio | null>(null);
  useEffect(() => {
    if (!data?.code) {
      setForeignHolding(null);
      setLending(null);
      setDayTrading(null);
      return;
    }
    setForeignHolding(null);
    setLending(null);
    setDayTrading(null);
    fetch(`/api/market/tw-stock/${data.code}/foreign-holding`).then((r) => (r.ok ? r.json() : null)).then(setForeignHolding).catch(() => {});
    fetch(`/api/market/tw-stock/${data.code}/lending`).then((r) => (r.ok ? r.json() : null)).then(setLending).catch(() => {});
    fetch(`/api/market/tw-stock/${data.code}/day-trading`).then((r) => (r.ok ? r.json() : null)).then(setDayTrading).catch(() => {});
  }, [data?.code]);

  // 注意股／處置股警示：異常交易風險提示
  const [tradingAlerts, setTradingAlerts] = useState<TradingAlert[]>([]);
  useEffect(() => {
    if (!data?.code) {
      setTradingAlerts([]);
      return;
    }
    fetch(`/api/market/tw-stock/${data.code}/alerts`)
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((body) => setTradingAlerts(body.alerts ?? []))
      .catch(() => setTradingAlerts([]));
  }, [data?.code]);

  // 除權除息預告
  const [exDividendNotices, setExDividendNotices] = useState<ExDividendNotice[]>([]);
  useEffect(() => {
    if (!data?.code) {
      setExDividendNotices([]);
      return;
    }
    fetch(`/api/market/tw-stock/${data.code}/ex-dividend`)
      .then((r) => (r.ok ? r.json() : { notices: [] }))
      .then((body) => setExDividendNotices(body.notices ?? []))
      .catch(() => setExDividendNotices([]));
  }, [data?.code]);

  // 每日重大訊息：最新公告
  const [announcements, setAnnouncements] = useState<MaterialAnnouncement[]>([]);
  useEffect(() => {
    if (!data?.code) {
      setAnnouncements([]);
      return;
    }
    fetch(`/api/market/tw-stock/${data.code}/announcements`)
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((body) => setAnnouncements(body.announcements ?? []))
      .catch(() => setAnnouncements([]));
  }, [data?.code]);

  // 三大法人買賣超、融資融券餘額表格：可收合展開，表格資料量大時先收起來比較清爽
  const [institutionalCollapsed, setInstitutionalCollapsed] = useState(false);
  const [marginCollapsed, setMarginCollapsed] = useState(false);

  // 技術指標小窗口：都用同一個 syncId，滑鼠移到任一張圖，其他圖的十字線/提示會同步移動；
  // 最多同時勾選3個，選滿時其餘checkbox停用，避免疊太多圖看不清楚
  const [showKDJ, setShowKDJ] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(true);
  const [showDMI, setShowDMI] = useState(false);
  const [showBIAS, setShowBIAS] = useState(false);
  const indicatorLimitReached = [showKDJ, showRSI, showMACD, showDMI, showBIAS].filter(Boolean).length >= 3;
  const [indicatorDropdownOpen, setIndicatorDropdownOpen] = useState(false);
  const indicatorOptions = [
    { key: "KDJ", label: "KDJ", checked: showKDJ, setChecked: setShowKDJ },
    { key: "RSI", label: "RSI", checked: showRSI, setChecked: setShowRSI },
    { key: "MACD", label: "MACD", checked: showMACD, setChecked: setShowMACD },
    { key: "DMI", label: "DMI", checked: showDMI, setChecked: setShowDMI },
    { key: "BIAS", label: "乖離率", checked: showBIAS, setChecked: setShowBIAS },
  ] as const;
  const selectedIndicatorLabels = indicatorOptions.filter((o) => o.checked).map((o) => o.label);
  // 下拉選單裡有好幾個checkbox，原本用觸發按鈕的onBlur關閉，結果點選單裡任一個checkbox都會讓
  // 按鈕失焦、150ms後就把選單關掉，變成每點一個指標選單就自動收起來、選不了第二個。改成偵測
  // 「點擊發生在整個選單容器外面」才關閉，選單容器內（觸發按鈕+選項清單）不管點哪裡都不會關閉。
  const indicatorDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!indicatorDropdownOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (indicatorDropdownRef.current && !indicatorDropdownRef.current.contains(e.target as Node)) {
        setIndicatorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [indicatorDropdownOpen]);

  // K線週期（60分K/日線/週線/月線）
  const [chartInterval, setChartInterval] = useState<ChartInterval>("1d");

  // K線畫線工具（水平價位線／趨勢線）與游標標價
  const [drawTool, setDrawTool] = useState<DrawTool>("none");
  const [horizontalLines, setHorizontalLines] = useState<HorizontalLine[]>([]);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [pendingTrendPoint, setPendingTrendPoint] = useState<{ x: string; y: number } | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  // 游標移到K線圖上時顯示的日期/均線/布林通道數值，固定顯示在圖表上方（不用浮動tooltip擋住K棒）
  const [hoverInfo, setHoverInfo] = useState<ChartRow | null>(null);
  // DrawingLayer（recharts hooks 只能在 ComposedChart 底下的子元件呼叫）每次渲染會把目前的
  // 像素→價格反查函式寫進這個 ref，<ComposedChart> 自己的 onClick/onMouseMove 再讀出來用
  const chartScaleRef = useRef<{ yInverse: (px: number) => unknown } | null>(null);

  // recharts 圖表本身的 onClick/onMouseMove：Tooltip 就是靠這層事件運作，保證會確實觸發。
  // 這兩個 handler 沒有用 useCallback 包，每次渲染都是新的閉包，drawTool/pendingTrendPoint 一定是最新值。
  const handleChartClick = (state: any) => {
    if (drawTool === "none") return;
    const yInverse = chartScaleRef.current?.yInverse;
    if (!yInverse || state?.activeCoordinate?.y == null || state?.activeLabel == null) return;
    const price = yInverse(state.activeCoordinate.y) as number;
    const date = state.activeLabel as string;

    if (drawTool === "horizontal") {
      setHorizontalLines((prev) => [...prev, { id: crypto.randomUUID(), price }]);
      setDrawTool("none");
    } else if (drawTool === "trend") {
      if (!pendingTrendPoint) {
        setPendingTrendPoint({ x: date, y: price });
      } else {
        setTrendLines((prev) => [
          ...prev,
          { id: crypto.randomUUID(), x1: pendingTrendPoint.x, y1: pendingTrendPoint.y, x2: date, y2: price },
        ]);
        setPendingTrendPoint(null);
        setDrawTool("none");
      }
    }
  };

  // K線圖按住左鍵拖曳可以左右移動可見區間（跟滾輪縮放互補：滾輪改變區間大小、拖曳改變區間位置）。
  // 只有在沒有啟用畫線工具時才會拖動圖表，畫線工具啟用時滑鼠事件維持原本點一下標記價位的行為，
  // 兩者不會互相干擾（畫線模式下 handleChartClick 才有作用，這裡的拖曳直接不啟動）。
  const panStateRef = useRef<{ startIndex: number; brushStart: number; brushEnd: number } | null>(null);

  const handleChartMouseDown = (state: any) => {
    if (drawTool !== "none") return;
    if (state?.activeLabel == null) return;
    const idx = rows.findIndex((r) => r.date === state.activeLabel);
    if (idx < 0) return;
    const cur = brushRange ?? { startIndex: 0, endIndex: rows.length - 1 };
    panStateRef.current = { startIndex: idx, brushStart: cur.startIndex, brushEnd: cur.endIndex };
  };

  const handleChartMouseUp = () => {
    panStateRef.current = null;
  };

  // 保險：如果拖曳到圖表範圍外才放開左鍵，圖表自己的onMouseUp不會觸發，靠window層級的監聽器兜底清掉拖曳狀態
  useEffect(() => {
    const onWindowMouseUp = () => {
      panStateRef.current = null;
    };
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  const handleChartMouseMove = (state: any) => {
    const yInverse = chartScaleRef.current?.yInverse;
    if (!yInverse || state?.activeCoordinate?.y == null) {
      setHoverPrice(null);
    } else {
      setHoverPrice(yInverse(state.activeCoordinate.y) as number);
    }
    // 游標資訊改成固定顯示在圖表上方（見hoverInfo），不用浮動tooltip擋住K棒。
    // 這個recharts版本的onMouseMove state沒有帶activePayload，只有activeLabel（X軸的日期值），
    // 用它回頭比對rows找出當天完整資料。
    const row = state?.activeLabel != null ? rows.find((r) => r.date === state.activeLabel) : undefined;
    setHoverInfo(row ?? null);

    const pan = panStateRef.current;
    if (pan && state?.activeLabel != null && rows.length > 0) {
      const idx = rows.findIndex((r) => r.date === state.activeLabel);
      if (idx >= 0) {
        const delta = idx - pan.startIndex;
        const windowSize = pan.brushEnd - pan.brushStart;
        let newStart = pan.brushStart - delta;
        let newEnd = pan.brushEnd - delta;
        const lastIdx = rows.length - 1;
        if (newStart < 0) {
          newStart = 0;
          newEnd = windowSize;
        } else if (newEnd > lastIdx) {
          newEnd = lastIdx;
          newStart = lastIdx - windowSize;
        }
        setBrushRange({ startIndex: newStart, endIndex: newEnd });
      }
    }
  };

  const toggleDrawTool = (tool: DrawTool) => {
    setPendingTrendPoint(null);
    setDrawTool((prev) => (prev === tool ? "none" : tool));
  };

  const clearAllDrawings = () => {
    setHorizontalLines([]);
    setTrendLines([]);
    setPendingTrendPoint(null);
    setDrawTool("none");
  };

  // 股票觀察名單：用既有 UserWatchStock 資料表存使用者自己的清單
  const [watchlist, setWatchlist] = useState<WatchStock[]>([]);

  // 觀察名單功能可在後台「會員等級設定」依會員等級開關，先確認有沒有權限再決定要不要顯示/請求
  const [watchlistEnabled, setWatchlistEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/me/nav")
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((body) => {
        const enabled = (body.keys ?? []).includes("feature.tw-stock-watchlist");
        setWatchlistEnabled(enabled);
        if (enabled) {
          fetch("/api/market/tw-stock/watchlist")
            .then((r) => (r.ok ? r.json() : []))
            .then(setWatchlist)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const isWatched = data ? watchlist.some((w) => w.code === data.code) : false;

  // 全市場三大法人買賣超前15名：跟搜尋的股票無關，進頁面就抓當天（或最近一個交易日）全市場排行
  const [marketRanking, setMarketRanking] = useState<MarketRanking | null>(null);
  useEffect(() => {
    fetch("/api/market/tw-stock/institutional-ranking")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMarketRanking)
      .catch(() => {});
  }, []);

  // 觀察名單按鈕一律顯示（不管會員層級），沒有權限的話點了顯示提示而不是直接隱藏功能
  const [showWatchlistLockedHint, setShowWatchlistLockedHint] = useState(false);

  const toggleWatchlist = async () => {
    if (!data) return;
    if (!watchlistEnabled) {
      setShowWatchlistLockedHint(true);
      return;
    }
    if (isWatched) {
      setWatchlist((prev) => prev.filter((w) => w.code !== data.code));
      fetch(`/api/market/tw-stock/watchlist/${data.code}`, { method: "DELETE" }).catch(() => {});
    } else {
      setWatchlist((prev) => [{ id: `pending-${data.code}`, code: data.code, name: data.name }, ...prev]);
      fetch("/api/market/tw-stock/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((item) => {
          if (item) setWatchlist((prev) => prev.map((w) => (w.code === item.code ? item : w)));
        })
        .catch(() => {});
    }
  };

  const removeFromWatchlist = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWatchlist((prev) => prev.filter((w) => w.code !== code));
    fetch(`/api/market/tw-stock/watchlist/${code}`, { method: "DELETE" }).catch(() => {});
  };

  const fetchStock = useCallback(async (code: string, interval: ChartInterval = "1d") => {
    setLoading(true);
    setError(null);
    setInstitutional([]);
    setMargin([]);
    setFundamentals(null);
    setProfile(null);
    // 換股票時法人買賣超趨勢圖區間重置回1個月：避免補歷史的請求跟上面法人資料的請求同時打證交所，
    // 併發太高證交所會直接擋（實測回應 428），拆開來個別請求量都在安全範圍內。
    setFlowPeriod("1m");
    // 換股票／換週期時清掉畫線標註：不同圖表的座標系不一樣，留著會畫錯位置
    setHorizontalLines([]);
    setTrendLines([]);
    setPendingTrendPoint(null);
    setDrawTool("none");
    setShowWatchlistLockedHint(false);
    try {
      const res = await fetch(`/api/market/tw-stock/${code}?interval=${interval}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "查詢失敗");
        setData(null);
        return;
      }
      const json: StockData = await res.json();
      setData(json);

      // 三大法人／融資融券目前僅涵蓋上市股票，查詢失敗就靜默保留空值（版位仍會顯示「尚未取得資料」）
      fetch(`/api/market/tw-stock/${code}/institutional`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (body?.institutional) setInstitutional(body.institutional);
          if (body?.margin) setMargin(body.margin);
        })
        .catch(() => {});

      fetch(`/api/market/tw-stock/${code}/fundamentals`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (body) setFundamentals(body);
        })
        .catch(() => {});

      fetch(`/api/market/tw-stock/${code}/profile`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (body) setProfile(body);
        })
        .catch(() => {});
    } catch {
      setError("查詢失敗，請稍後再試");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleIntervalChange = (next: ChartInterval) => {
    setChartInterval(next);
    if (data) fetchStock(data.code, next);
  };

  // 搜尋股票：可打代碼或中文名稱，輸入時即時查詢比對結果做成下拉選單
  const [searchResults, setSearchResults] = useState<{ code: string; name: string; market: "TW" | "TWO" }[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const q = codeInput.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/tw-stock/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
        // 搜尋失敗就不顯示下拉選單，不影響直接輸入代碼查詢
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [codeInput]);

  const selectSearchResult = (r: { code: string; name: string }) => {
    setCodeInput(r.code);
    setDropdownOpen(false);
    setSearchResults([]);
    fetchStock(r.code, chartInterval);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = codeInput.trim();
    if (!q) return;
    setDropdownOpen(false);
    if (/^\d+$/.test(q)) {
      fetchStock(q, chartInterval);
    } else if (searchResults.length > 0) {
      setCodeInput(searchResults[0].code);
      fetchStock(searchResults[0].code, chartInterval);
    } else {
      setError("查無符合的股票，請確認代碼或名稱");
    }
  };

  const selectWatchStock = (code: string) => {
    setCodeInput(code);
    fetchStock(code, chartInterval);
  };

  // rows 一定要記憶化：陣列參照要穩定，否則 recharts 的 Brush 會誤判成「資料變了」而中斷拖曳手勢。
  const rows = useMemo(() => (data ? buildChartRows(data.quotes) : []), [data]);

  // K線Brush預設縮放區間：換股票／換週期時預設只顯示最近一段（約25%資料），
  // 不然一開始整個2年份K棒擠在一起看不清楚，使用者還是可以拖曳/滾輪調整回完整區間
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  useEffect(() => {
    if (rows.length === 0) {
      setBrushRange(null);
      return;
    }
    const defaultWindow = Math.max(20, Math.round(rows.length * 0.25));
    setBrushRange({ startIndex: Math.max(0, rows.length - defaultWindow), endIndex: rows.length - 1 });
  }, [data?.code, chartInterval, rows.length]);

  // K線圖滾輪縮放：滾輪往上（deltaY<0）放大（縮小可見區間）、往下縮小（放大可見區間），
  // 以目前可見區間為基準縮放，不是每次都從頭算，這樣連續滾動才會平順。
  // React的onWheel預設是passive listener、裡面呼叫preventDefault會被瀏覽器擋掉並噴console錯誤，
  // 所以改用ref+原生addEventListener手動掛非passive的監聽器。
  const rowsLenRef = useRef(rows.length);
  rowsLenRef.current = rows.length;
  const brushRangeRef = useRef(brushRange);
  brushRangeRef.current = brushRange;

  // 這個div是跟著K線圖一起條件渲染的（要等data載入才存在），用一般 useEffect(fn, [])
  // 掛listener的話，effect在外層元件第一次mount時就跑完了、那時候div根本還不存在、ref.current
  // 還是null，之後div才出現也不會重新觸發（deps是空陣列）。改用callback ref，
  // 每次這個DOM節點掛上/卸下時React都會呼叫，不受條件渲染時機影響。
  const chartWheelCallbackRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const total = rowsLenRef.current;
      if (total === 0) return;
      e.preventDefault();
      const cur = brushRangeRef.current;
      const curStart = cur?.startIndex ?? 0;
      const curEnd = cur?.endIndex ?? total - 1;
      const windowSize = curEnd - curStart + 1;
      const step = Math.max(1, Math.round(windowSize * 0.1));
      let newStart = curStart;
      let newEnd = curEnd;
      if (e.deltaY < 0) {
        newStart = curStart + step;
        newEnd = curEnd - step;
      } else {
        newStart = curStart - step;
        newEnd = curEnd + step;
      }
      newStart = Math.max(0, newStart);
      newEnd = Math.min(total - 1, newEnd);
      if (newEnd - newStart < 9) return; // 至少留10個資料點，避免縮到看不到東西
      setBrushRange({ startIndex: newStart, endIndex: newEnd });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // React callback ref 沒有內建卸載回呼，用 WeakMap 也是多此一舉——這個 div 隨股票資料整個
    // 卸載時，元素本身連同它的 listener 會被瀏覽器一起回收，不會造成洩漏。
  }, []);

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const change = last && prev ? last.close - prev.close : null;
  const changePct = last && prev ? (change! / prev.close) * 100 : null;

  // 報價卡優先顯示永豐即時報價（liveQuote），閘道打不通時自動退回K線最後一筆（Yahoo，可能延遲）
  const liveQuote = data?.liveQuote ?? null;
  const displayClose = liveQuote ? liveQuote.close : last?.close;
  const displayChange = liveQuote ? liveQuote.changePrice : change;
  const displayChangePct = liveQuote ? liveQuote.changeRate : changePct;
  const displayOpen = liveQuote ? liveQuote.open : last?.open;
  const displayHigh = liveQuote ? liveQuote.high : last?.high;
  const displayLow = liveQuote ? liveQuote.low : last?.low;
  const displayVolume = liveQuote ? liveQuote.volume : last?.volume;

  // K線主圖用 Brush 拖曳選取範圍；其餘同步圖表都吃同一份完整 rows、掛同一個 syncId，
  // recharts 會自動把 Brush 選取的索引範圍套用到所有同步圖表上，不用自己再手動切一次資料
  // （手動切過的資料如果再被 recharts 內部同步邏輯套用一次索引，範圍會對不上變成空陣列）。

  // 法人買賣超趨勢圖資料：統一算出「每日值+累計值」，不管選的是哪個指標都用同一套邏輯畫圖
  const selectedFlowMetric = FLOW_METRICS.find((m) => m.key === flowMetric)!;
  const flowChartRows = useMemo(() => {
    const sourceRows = selectedFlowMetric.source === "institutional" ? flowData?.institutional : flowData?.margin;
    let cumulative = 0;
    return (sourceRows ?? []).map((row) => {
      const value = (row as unknown as Record<string, number>)[selectedFlowMetric.key];
      cumulative += value;
      return { date: row.date, value, cumulative };
    });
  }, [flowData, selectedFlowMetric]);

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">台灣股市</h1>
        <p className="text-slate-500 text-sm mt-1">K線、均線、布林通道與成交量（資料源：Yahoo Finance，可能延遲，僅供參考）</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="relative w-56">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            placeholder="輸入股票代碼或中文名稱，例如 2330 或 台積電"
            autoComplete="off"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-indigo-400 transition-colors"
          />
          {dropdownOpen && searchResults.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => selectSearchResult(r)}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-slate-700">{r.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    {r.code}
                    <span className="px-1 py-0.5 rounded bg-slate-100">{r.market === "TW" ? "上市" : "上櫃"}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {loading ? "查詢中..." : "查詢"}
        </button>
      </form>

      {/* 股票觀察名單：列表式，點列可直接查詢；移除鍵預設不顯示、滑過整列才會淡入，避免手滑點到 */}
      {watchlistEnabled && watchlist.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-2.5 text-xs text-slate-400 border-b border-slate-50">觀察名單</div>
          <div className="divide-y divide-slate-50">
            {watchlist.map((w) => (
              <div
                key={w.id}
                onClick={() => selectWatchStock(w.code)}
                className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                  data?.code === w.code ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm ${data?.code === w.code ? "text-indigo-600 font-semibold" : "text-slate-700"}`}>
                    {w.name ?? w.code}
                  </span>
                  <span className="text-xs text-slate-400">{w.code}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => removeFromWatchlist(w.code, e)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-slate-300 hover:text-red-500 px-2.5 py-1 rounded-lg transition-opacity ml-6"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 即時成交量排行：走永豐Shioaji scanners，跟下面T86買賣超前15名不同——這個是盤中即時成交量排行，
          不是收盤後才有的法人籌碼資料 */}
      {volumeRanking && volumeRanking.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <h3 className="text-sm font-semibold text-indigo-600">即時成交量排行</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {volumeRanking.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => selectWatchStock(r.code)}
                className="w-full flex items-center justify-between px-5 py-2 text-sm hover:bg-slate-50 transition-colors text-left"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-slate-700">{r.name}</span>
                  <span className="text-xs text-slate-400">{r.code}</span>
                </span>
                <span className="flex items-baseline gap-3">
                  <span className={r.changePrice >= 0 ? "text-red-500" : "text-green-600"}>{fmtNum(r.close)}</span>
                  <span className="text-slate-500">{r.totalVolume.toLocaleString("zh-TW")}張</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 px-5 py-2.5">資料源：永豐證券 Shioaji 即時成交量排行，點列可直接查詢該檔</p>
        </div>
      )}

      {/* 期貨三大法人未平倉：跟目前查詢的股票無關，市場總體籌碼指標，走期交所TAIFEX（跟證交所是不同單位） */}
      {futuresPositions && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">期貨三大法人未平倉（臺股期貨）</h3>
            <span className="text-[11px] text-slate-400">{futuresPositions.date}</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-50">
            {futuresPositions.positions
              .filter((p) => p.contractCode === "臺股期貨")
              .map((p) => (
                <div key={p.item} className="px-5 py-4 text-center">
                  <div className="text-xs text-slate-400 mb-1">{p.item}</div>
                  <div className={`text-lg font-bold ${p.netOpenInterest >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {p.netOpenInterest >= 0 ? "+" : ""}
                    {p.netOpenInterest.toLocaleString("zh-TW")}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    多 {p.longOpenInterest.toLocaleString("zh-TW")}／空 {p.shortOpenInterest.toLocaleString("zh-TW")}
                  </div>
                </div>
              ))}
          </div>
          <p className="text-[11px] text-slate-400 px-5 py-2.5">資料源：臺灣期貨交易所，正值代表淨多單、負值代表淨空單</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-6">{error}</div>
      )}

      {data && last && (
        <>
          {/* 注意股／處置股警示：異常交易風險提示，放最上面比較顯眼 */}
          {tradingAlerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-4">
              {tradingAlerts.map((a, idx) => (
                <div key={idx} className={idx > 0 ? "mt-3 pt-3 border-t border-amber-200" : ""}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        a.type === "處置" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {a.type}股
                    </span>
                    <span className="text-xs text-slate-500">{a.date}</span>
                  </div>
                  <div className="text-sm text-amber-900 mt-1">{a.reason}</div>
                  {a.detail && <div className="text-xs text-amber-700 mt-0.5">{a.detail}</div>}
                </div>
              ))}
            </div>
          )}

          {/* 報價卡 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">
                {data.code} {data.name}
              </h2>
              <span className="text-xs text-slate-400">{data.market === "TW" ? "上市" : "上櫃"} · {last.date}</span>
              {exDividendNotices.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
                  {exDividendNotices[0].type}：{exDividendNotices[0].date}
                </span>
              )}
              {liveQuote ? (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">即時</span>
              ) : (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-medium">延遲</span>
              )}
              <div className="ml-auto relative">
                <button
                  type="button"
                  onClick={toggleWatchlist}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    isWatched
                      ? "bg-amber-50 border-amber-200 text-amber-600"
                      : "bg-white border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600"
                  }`}
                >
                  {isWatched ? "★ 已加入觀察" : "☆ 加入觀察"}
                </button>
                {showWatchlistLockedHint && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 text-white text-xs rounded-xl p-3 shadow-lg z-10">
                    <div className="flex items-start justify-between gap-2">
                      <p>您的會員等級尚未開放觀察名單功能，未來會開放用其他方式兌換權限，敬請期待。</p>
                      <button
                        type="button"
                        onClick={() => setShowWatchlistLockedHint(false)}
                        className="text-slate-400 hover:text-white shrink-0"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-3xl font-bold text-slate-900">{fmtNum(displayClose)}</span>
              {displayChange != null && displayChangePct != null && (
                <span className={`text-sm font-semibold ${displayChange >= 0 ? "text-red-500" : "text-green-600"}`}>
                  {displayChange >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(displayChange))} ({fmtNum(Math.abs(displayChangePct))}%)
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
              <div><div className="text-xs text-slate-400 mb-0.5">開盤</div>{fmtNum(displayOpen)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">最高</div>{fmtNum(displayHigh)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">最低</div>{fmtNum(displayLow)}</div>
              <div><div className="text-xs text-slate-400 mb-0.5">成交量</div>{displayVolume?.toLocaleString("zh-TW") ?? "—"}</div>
            </div>
            {liveQuote && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mt-4 pt-4 border-t border-slate-50 text-sm">
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">買一</div>
                  {fmtNum(liveQuote.buyPrice)}
                  <span className="text-xs text-slate-400 ml-1">{liveQuote.buyVolume.toLocaleString("zh-TW")}張</span>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">賣一</div>
                  {fmtNum(liveQuote.sellPrice)}
                  <span className="text-xs text-slate-400 ml-1">{liveQuote.sellVolume.toLocaleString("zh-TW")}張</span>
                </div>
                <div><div className="text-xs text-slate-400 mb-0.5">均價</div>{fmtNum(liveQuote.averagePrice)}</div>
                <div><div className="text-xs text-slate-400 mb-0.5">昨量</div>{liveQuote.yesterdayVolume.toLocaleString("zh-TW")}</div>
                <div><div className="text-xs text-slate-400 mb-0.5">量比</div>{fmtNum(liveQuote.volumeRatio)}</div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">成交值</div>
                  {(liveQuote.totalAmount / 1e8).toFixed(2)}億
                </div>
              </div>
            )}
            {tickRatio && tickRatio.buyRatio != null && (
              <div className="mt-4 pt-4 border-t border-slate-50">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>內外盤比（{tickRatio.date}，共{tickRatio.tickCount.toLocaleString("zh-TW")}筆）</span>
                  <span>
                    外盤 {tickRatio.buyRatio.toFixed(1)}%／內盤 {(100 - tickRatio.buyRatio).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-slate-100">
                  <div className="bg-red-400" style={{ width: `${tickRatio.buyRatio}%` }} />
                  <div className="bg-green-500" style={{ width: `${100 - tickRatio.buyRatio}%` }} />
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              {liveQuote
                ? "即時報價來源：永豐證券 Shioaji"
                : "資料源：Yahoo Finance，可能延遲（即時報價服務暫時無法取得）"}
            </p>
          </div>

          {/* 籌碼補充：外資持股比率／借券餘額／當沖比 */}
          {(foreignHolding || lending || dayTrading) && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">籌碼補充</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {foreignHolding && (
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">外資持股比率</div>
                    <div className="text-lg font-bold text-slate-800">{foreignHolding.foreignHoldingPercent.toFixed(2)}%</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{foreignHolding.date}</div>
                  </div>
                )}
                {lending && (
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">可借券賣出股數</div>
                    <div className="text-lg font-bold text-slate-800">{lending.availableVolume.toLocaleString("zh-TW")}</div>
                  </div>
                )}
                {dayTrading && (
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">當沖比</div>
                    <div className="text-lg font-bold text-slate-800">
                      {dayTrading.ratioPercent != null ? `${dayTrading.ratioPercent.toFixed(2)}%` : "—"}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{dayTrading.date}</div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">資料源：證交所公開資料</p>
            </div>
          )}

          {/* 最新公告：每日重大訊息 */}
          {announcements.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">最新公告</div>
              <div className="divide-y divide-slate-50">
                {announcements.slice(0, 5).map((a, idx) => (
                  <div key={idx} className="py-2.5 text-sm">
                    <div className="text-xs text-slate-400 mb-0.5">{a.date}</div>
                    <div className="text-slate-700 whitespace-pre-line">{a.subject}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 今日走勢圖：永豐1分鐘K棒，只有當天走勢，多天K線圖仍是下面的Yahoo Finance那張 */}
          {intradayBars && intradayBars.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
              <div className="text-sm font-semibold text-slate-700 mb-3">今日走勢圖</div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={intradayBars} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="ts"
                    tick={{ fontSize: 11 }}
                    minTickGap={40}
                    tickFormatter={(ts) =>
                      new Date(ts / 1e6).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" })
                    }
                  />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={56} />
                  <Tooltip
                    labelFormatter={(ts) =>
                      new Date(Number(ts) / 1e6).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Taipei" })
                    }
                    formatter={(value, name) => [fmtNum(Number(value)), name === "close" ? "價格" : String(name)]}
                  />
                  <Line type="monotone" dataKey="close" stroke="#6366f1" dot={false} strokeWidth={1.5} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-slate-400 mt-2">資料源：永豐證券 Shioaji 1分鐘K棒（僅當天）</p>
            </div>
          )}

          {/* 個股基本資料：董事長/總經理/資本額等公司登記資訊，來自證交所/櫃買中心公開資料 */}
          {profile && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
              <div className="flex items-baseline gap-2 flex-wrap mb-4">
                <h3 className="text-base font-bold text-slate-900">{profile.name}</h3>
                {profile.englishName && <span className="text-xs text-slate-400">{profile.englishName}</span>}
                {profile.industry && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{profile.industry}</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm mb-5">
                <div><div className="text-xs text-slate-400 mb-0.5">董事長</div>{profile.chairman ?? "—"}</div>
                <div><div className="text-xs text-slate-400 mb-0.5">總經理</div>{profile.generalManager ?? "—"}</div>
                <div><div className="text-xs text-slate-400 mb-0.5">發言人</div>{profile.spokesman ?? "—"}</div>
                <div><div className="text-xs text-slate-400 mb-0.5">成立日期</div>{profile.foundedDate ?? "—"}</div>
                <div><div className="text-xs text-slate-400 mb-0.5">上市日期</div>{profile.listedDate ?? "—"}</div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">資本額</div>
                  {profile.capital != null ? `${(profile.capital / 1e8).toFixed(2)}億` : "—"}
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-2">基本資料</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {([
                  ["過戶機構", profile.transferAgent],
                  ["過戶電話", profile.transferAgentPhone],
                  ["公司地址", profile.address],
                  ["過戶地址", profile.transferAgentAddress],
                  ["公司電話", profile.phone],
                  ["電子郵件", profile.email],
                  ["網址", profile.website],
                  [
                    "已發行股數",
                    profile.issuedShares != null ? `${(profile.issuedShares / 1e8).toFixed(2)}億股` : null,
                  ],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-slate-50 pb-2">
                    <span className="text-slate-400 shrink-0">{label}</span>
                    <span className="text-slate-700 text-right truncate">{value ?? "—"}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-4">
                資料源：證交所／櫃買中心公開資訊觀測站，僅涵蓋基本登記資訊（股東結構、法說會等資料尚未串接）
              </p>
            </div>
          )}

          {/* K線 + 均線 + 布林通道 + 成交量 + 技術指標：合併在同一張卡片裡 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-400 inline-block" />MA5</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />MA20</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-purple-500 inline-block" />MA60</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-400 inline-block" />MA120</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-indigo-300 inline-block" />布林通道</span>
              </div>
              <select
                value={chartInterval}
                onChange={(e) => handleIntervalChange(e.target.value as ChartInterval)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-indigo-400 transition-colors"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-slate-400">畫線工具</span>
              <button
                type="button"
                onClick={() => toggleDrawTool("horizontal")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  drawTool === "horizontal" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                水平價位線
              </button>
              <button
                type="button"
                onClick={() => toggleDrawTool("trend")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  drawTool === "trend" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                趨勢線
              </button>
              {(horizontalLines.length > 0 || trendLines.length > 0) && (
                <button
                  type="button"
                  onClick={clearAllDrawings}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  清除全部
                </button>
              )}
              {drawTool === "horizontal" && <span className="text-xs text-indigo-500">請在圖上點一下要標記的價位</span>}
              {drawTool === "trend" && (
                <span className="text-xs text-amber-500">{pendingTrendPoint ? "請在圖上點選第二個點" : "請在圖上點選起點"}</span>
              )}
            </div>

            {/* 游標資訊列：固定顯示在圖表上方，不用浮動tooltip（會擋住K棒），滑開圖表時顯示提示文字 */}
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs mb-2 min-h-[1.25rem]">
              {hoverInfo ? (
                <>
                  <span className="font-semibold text-slate-700">{hoverInfo.date}</span>
                  <span className="text-amber-500">MA5 {fmtNum(hoverInfo.ma5)}</span>
                  <span className="text-blue-500">MA20 {fmtNum(hoverInfo.ma20)}</span>
                  <span className="text-purple-500">MA60 {fmtNum(hoverInfo.ma60)}</span>
                  <span className="text-slate-400">MA120 {fmtNum(hoverInfo.ma120)}</span>
                  <span className="text-indigo-300">bbUpper {fmtNum(hoverInfo.bbUpper)}</span>
                  <span className="text-indigo-300">bbLower {fmtNum(hoverInfo.bbLower)}</span>
                  <span className="text-slate-500">區間 {fmtNum(hoverInfo.low)} - {fmtNum(hoverInfo.high)}</span>
                </>
              ) : (
                <span className="text-slate-300">游標移到圖上顯示當日均線/布林通道數值</span>
              )}
            </div>

            <div ref={chartWheelCallbackRef}>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart
                key={`${data.code}-${chartInterval}`}
                data={rows}
                syncId={SYNC_ID}
                margin={{ top: 4, right: 56, left: 0, bottom: 4 }}
                onClick={handleChartClick}
                onMouseDown={handleChartMouseDown}
                onMouseUp={handleChartMouseUp}
                onMouseMove={handleChartMouseMove}
                onMouseLeave={() => {
                  setHoverPrice(null);
                  setHoverInfo(null);
                  panStateRef.current = null;
                }}
                style={{ cursor: drawTool === "none" ? "grab" : undefined }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={56} />
                {/* 浮動提示框內容改成不渲染（content回傳null），改用上面固定的hoverInfo資訊列顯示，
                    避免游標移到圖上時提示框擋住K棒；十字準心游標效果(cursor)照舊保留 */}
                <Tooltip content={() => null} />
                <Bar dataKey="range" shape={CandleShape} isAnimationActive={false} />
                <Line type="monotone" dataKey="ma5" stroke="#fbbf24" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="ma20" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="ma60" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="ma120" stroke="#94a3b8" dot={false} strokeWidth={1.5} connectNulls />
                <Line type="monotone" dataKey="bbUpper" stroke="#c7d2fe" dot={false} strokeWidth={1} connectNulls strokeDasharray="4 3" />
                <Line type="monotone" dataKey="bbLower" stroke="#c7d2fe" dot={false} strokeWidth={1} connectNulls strokeDasharray="4 3" />
                <Brush
                  dataKey="date"
                  height={22}
                  stroke="#a5b4fc"
                  travellerWidth={8}
                  startIndex={brushRange?.startIndex}
                  endIndex={brushRange?.endIndex}
                  onChange={(r) => {
                    const lastIdx = rows.length - 1;
                    let start = Number.isFinite(r.startIndex) ? (r.startIndex as number) : 0;
                    let end = Number.isFinite(r.endIndex) ? (r.endIndex as number) : lastIdx;
                    if (start > end) [start, end] = [end, start];
                    start = Math.min(Math.max(start, 0), lastIdx);
                    end = Math.min(Math.max(end, 0), lastIdx);
                    setBrushRange({ startIndex: start, endIndex: end });
                  }}
                />
                <DrawingLayer
                  horizontalLines={horizontalLines}
                  trendLines={trendLines}
                  pendingTrendPoint={pendingTrendPoint}
                  hoverPrice={hoverPrice}
                  scaleRef={chartScaleRef}
                  onRemoveHorizontal={(id) => setHorizontalLines((prev) => prev.filter((l) => l.id !== id))}
                  onRemoveTrend={(id) => setTrendLines((prev) => prev.filter((l) => l.id !== id))}
                />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              拖曳圖表下方灰色區塊或滑鼠滾輪可縮放時間區間，套用到下方所有同步圖表；游標移到圖上會顯示當下價位，畫線工具可標記價位或趨勢線
            </p>

            {/* 成交量：跟K線圖合併在同一張卡片裡 */}
            <div className="mt-6 pt-6 border-t border-slate-50">
              <div className="text-xs text-slate-400 mb-2">成交量</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(value) => [Number(value).toLocaleString("zh-TW"), "成交量"]} />
                  <Bar dataKey="volume" fill="#94a3b8" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 技術指標小窗口：跟上面K線、成交量共用同一個syncId同步游標，也合併進同一張卡片；
                改成下拉式選單勾選，最多可複選3個一起看，選滿3個時其餘未勾選的選項會先停用，
                要取消一個才能再選新的 */}
            <div className="mt-6 pt-6 border-t border-slate-50">
            <div ref={indicatorDropdownRef} className="relative inline-block mb-3">
              <button
                type="button"
                onClick={() => setIndicatorDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:border-indigo-300 transition-colors min-w-[10rem] justify-between"
              >
                <span className="truncate">
                  {selectedIndicatorLabels.length > 0 ? `技術指標：${selectedIndicatorLabels.join("、")}` : "選擇技術指標"}
                </span>
                <span className={`shrink-0 transition-transform ${indicatorDropdownOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {indicatorDropdownOpen && (
                <div className="absolute z-10 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40">
                  {indicatorOptions.map((opt) => {
                    const disabled = indicatorLimitReached && !opt.checked;
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 ${
                          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          disabled={disabled}
                          onChange={(e) => opt.setChecked(e.target.checked)}
                          className="accent-indigo-500"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                  <div className="px-3 pt-1.5 mt-1 border-t border-slate-50 text-[11px] text-slate-300">最多同時顯示3個</div>
                </div>
              )}
            </div>

            {showKDJ && (
              <div className="mb-4">
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">KDJ(9,3,3)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />K</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />D</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-purple-500 inline-block" />J</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <Line type="monotone" dataKey="k" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="d" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="j" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showRSI && (
              <div className="mb-4">
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">RSI(14)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-indigo-500 inline-block" />RSI</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <ReferenceLine y={70} stroke="#fca5a5" strokeDasharray="4 3" />
                    <ReferenceLine y={30} stroke="#86efac" strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="rsi" stroke="#6366f1" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showMACD && (
              <div className={showDMI || showBIAS ? "mb-4" : ""}>
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">MACD(12,26,9)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />DIF</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />DEA</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-slate-300 inline-block" />柱狀圖</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <ReferenceLine y={0} stroke="#e2e8f0" />
                    <Bar dataKey="macdHist" isAnimationActive={false}>
                      {rows.map((r, idx) => (
                        <Cell key={idx} fill={(r.macdHist ?? 0) >= 0 ? "#fca5a5" : "#86efac"} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="macdDif" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="macdDea" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showDMI && (
              <div className={showBIAS ? "mb-4" : ""}>
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">DMI/ADX(14)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-red-500 inline-block" />+DI</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-green-600 inline-block" />-DI</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-500 inline-block" />ADX</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [fmtNum(Number(value)), String(name)]} />
                    <Line type="monotone" dataKey="plusDI" stroke="#ef4444" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="minusDI" stroke="#16a34a" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="adx" stroke="#64748b" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {showBIAS && (
              <div>
                <div className="flex items-center gap-3 text-xs mb-1.5 text-slate-500">
                  <span className="font-medium text-slate-600">乖離率 BIAS</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />BIAS6</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500 inline-block" />BIAS12</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-purple-500 inline-block" />BIAS24</span>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value, name) => [`${fmtNum(Number(value))}%`, String(name)]} />
                    <ReferenceLine y={0} stroke="#e2e8f0" />
                    <Line type="monotone" dataKey="bias6" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="bias12" stroke="#3b82f6" dot={false} strokeWidth={1.5} connectNulls />
                    <Line type="monotone" dataKey="bias24" stroke="#a855f7" dot={false} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            </div>
          </div>

          {/* 個股資訊（基本面）：營收/EPS(季)/本益比/殖利率為證交所公開資料真實數值，
              EPS(近4季)、ROE(近4季)靠系統逐季自動累積歷史 EPS 快照，累積滿4季後才會顯示數值 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">個股資訊</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                ["累計營收YoY(%)", fundamentals?.cumulativeRevenueYoY],
                ["營收YoY(%)", fundamentals?.revenueYoY],
                ["營收MoM(%)", fundamentals?.revenueMoM],
                ["EPS(季)", fundamentals?.epsQuarter],
                ["EPS(近4季)", fundamentals?.eps4Q],
                ["本益比", fundamentals?.per],
                ["殖利率(%)", fundamentals?.dividendYield],
                ["ROE(近4季)", fundamentals?.roe4Q],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-slate-700">{fmtNum(value)}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4">
              EPS(近4季)、ROE(近4季)由系統每季自動累積歷史資料，累積滿4季後自動顯示；其餘欄位為證交所公開資料
            </p>
          </div>

          {/* 法人買賣超趨勢圖：指標/區間可切換，資料靠逐日累積（見 flow-history），區間越長初期越稀疏 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <select
                value={flowMetric}
                onChange={(e) => setFlowMetric(e.target.value as FlowMetricKey)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-700 focus:border-indigo-400 transition-colors"
              >
                {FLOW_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                {FLOW_PERIODS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setFlowPeriod(p.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      flowPeriod === p.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {flowLoading ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">載入中...</div>
            ) : flowChartRows.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">尚無累積資料，之後查詢會逐日補上</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={flowChartRows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis yAxisId="value" tick={{ fontSize: 11 }} width={56} />
                    <YAxis yAxisId="cumulative" orientation="right" tick={{ fontSize: 11 }} width={56} />
                    <Tooltip
                      formatter={(value, name) => [
                        Number(value).toLocaleString("zh-TW"),
                        name === "cumulative" ? "累計(張)" : "當日(張)",
                      ]}
                    />
                    <ReferenceLine yAxisId="value" y={0} stroke="#e2e8f0" />
                    <Bar yAxisId="value" dataKey="value" isAnimationActive={false}>
                      {flowChartRows.map((r, idx) => (
                        <Cell key={idx} fill={r.value >= 0 ? "#fca5a5" : "#86efac"} />
                      ))}
                    </Bar>
                    <Line yAxisId="cumulative" type="monotone" dataKey="cumulative" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-slate-400 mt-2">
                  涵蓋 {flowChartRows[0].date} ~ {flowChartRows[flowChartRows.length - 1].date}，共 {flowChartRows.length} 個交易日
                  {flowData && flowChartRows[0].date > flowData.requestedFrom
                    ? "（資料分批累積中，尚未涵蓋完整區間，切換區間或改天再回來看會愈來愈完整）"
                    : ""}
                </p>
              </>
            )}
          </div>

          {/* 三大法人買賣超：真實資料，來源證交所 T86（僅涵蓋上市），近20個交易日逐日顯示 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <button
              type="button"
              onClick={() => setInstitutionalCollapsed((c) => !c)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-slate-700">三大法人買賣超（張，近{institutional.length}個交易日）</h3>
              <span className="text-slate-400 text-xs flex items-center gap-1">
                {institutionalCollapsed ? "展開" : "收合"}
                <span className={`transition-transform ${institutionalCollapsed ? "" : "rotate-180"}`}>▾</span>
              </span>
            </button>
            {!institutionalCollapsed &&
              (institutional.length > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-50">
                        <th className="text-left font-semibold px-3 py-2">日期</th>
                        <th className="text-right font-semibold px-3 py-2">外資</th>
                        <th className="text-right font-semibold px-3 py-2">投信</th>
                        <th className="text-right font-semibold px-3 py-2">自營商</th>
                        <th className="text-right font-semibold px-3 py-2">合計</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {institutional.map((row) => (
                        <tr key={row.date} className="text-slate-700">
                          <td className="px-3 py-2 text-slate-500">{row.date}</td>
                          {([row.foreignNetLots, row.trustNetLots, row.dealerNetLots, row.totalNetLots] as const).map(
                            (v, i) => (
                              <td key={i} className={`px-3 py-2 text-right ${v >= 0 ? "text-red-500" : "text-green-600"}`}>
                                {v >= 0 ? "+" : ""}{v.toLocaleString("zh-TW")}
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-400 mt-3">資料源：證交所 T86</p>
                </div>
              ) : (
                <div className="text-sm text-slate-400 mt-4">尚未取得資料（僅涵蓋上市股票，上櫃股票暫無此資料）</div>
              ))}
          </div>

          {/* 融資融券餘額：真實資料，來源證交所 MI_MARGN（僅涵蓋上市），近20個交易日逐日顯示 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <button
              type="button"
              onClick={() => setMarginCollapsed((c) => !c)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-slate-700">融資融券餘額（張，近{margin.length}個交易日）</h3>
              <span className="text-slate-400 text-xs flex items-center gap-1">
                {marginCollapsed ? "展開" : "收合"}
                <span className={`transition-transform ${marginCollapsed ? "" : "rotate-180"}`}>▾</span>
              </span>
            </button>
            {!marginCollapsed &&
              (margin.length > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-50">
                        <th className="text-left font-semibold px-3 py-2">日期</th>
                        <th className="text-right font-semibold px-3 py-2">融資餘額</th>
                        <th className="text-right font-semibold px-3 py-2">增減</th>
                        <th className="text-right font-semibold px-3 py-2">融券餘額</th>
                        <th className="text-right font-semibold px-3 py-2">增減</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {margin.map((row) => (
                        <tr key={row.date} className="text-slate-700">
                          <td className="px-3 py-2 text-slate-500">{row.date}</td>
                          <td className="px-3 py-2 text-right">{row.marginBalance.toLocaleString("zh-TW")}</td>
                          <td className={`px-3 py-2 text-right ${row.marginChange >= 0 ? "text-red-500" : "text-green-600"}`}>
                            {row.marginChange >= 0 ? "+" : ""}{row.marginChange.toLocaleString("zh-TW")}
                          </td>
                          <td className="px-3 py-2 text-right">{row.shortBalance.toLocaleString("zh-TW")}</td>
                          <td className={`px-3 py-2 text-right ${row.shortChange >= 0 ? "text-red-500" : "text-green-600"}`}>
                            {row.shortChange >= 0 ? "+" : ""}{row.shortChange.toLocaleString("zh-TW")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-400 mt-3">資料源：證交所 MI_MARGN</p>
                </div>
              ) : (
                <div className="text-sm text-slate-400 mt-4">尚未取得資料（僅涵蓋上市股票，上櫃股票暫無此資料）</div>
              ))}
          </div>

          {/* 散戶持股比率：資料源集保結算所「集保戶股權分散表」，每週更新一次 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">散戶持股比率</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>門檻</span>
                <select
                  value={retailThreshold}
                  onChange={(e) => setRetailThreshold(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:border-indigo-400 transition-colors"
                >
                  <option value="20">20張以下</option>
                  <option value="50">50張以下</option>
                  <option value="100">100張以下</option>
                </select>
              </div>
            </div>
            {retailRatioError ? (
              <div className="flex items-center justify-center h-16 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                {retailRatioError}
              </div>
            ) : retailRatio ? (
              <div className="flex items-center gap-8 flex-wrap">
                <div>
                  <div className="text-3xl font-bold text-indigo-600">{retailRatio.ratioPercent.toFixed(2)}%</div>
                  <div className="text-xs text-slate-400 mt-1">持股 {retailThreshold} 張以下股東，占集保庫存比例</div>
                </div>
                <div className="text-sm text-slate-600">
                  <div>{retailRatio.belowThresholdHolders.toLocaleString("zh-TW")} 人</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    共 {retailRatio.totalHolders.toLocaleString("zh-TW")} 位集保股東
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 ml-auto">
                  資料日期：{retailRatio.date}｜資料源：集保結算所 集保戶股權分散表
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                載入中...
              </div>
            )}

            {/* 散戶持股比率趨勢：集保資料沒有歷史查詢功能，只能每次查詢逐週累積snapshot，
                剛開始資料點很少是正常現象，不是bug */}
            {retailHistory && retailHistory.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-50">
                <ResponsiveContainer width="100%" height={140}>
                  <ComposedChart data={retailHistory} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={48} unit="%" domain={["auto", "auto"]} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "ratioPercent" ? [`${Number(value).toFixed(2)}%`, "占比"] : [value, String(name)]
                      }
                    />
                    <Line type="monotone" dataKey="ratioPercent" stroke="#6366f1" dot={{ r: 3 }} strokeWidth={1.5} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                {retailHistory.length < 3 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    集保資料每週更新一次，目前只累積了 {retailHistory.length} 個資料點，之後每週查詢會多一個點、趨勢會愈來愈完整
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* 當日主力動向：以三大法人合計買賣超作為替代指標，非真正的券商分點籌碼 */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-slate-400 mb-2">當日主力動向</div>
              {institutional.length > 0 ? (
                <>
                  <div className={`text-xl font-bold ${institutional[0].totalNetLots >= 0 ? "text-red-500" : "text-green-600"}`}>
                    {institutional[0].totalNetLots >= 0 ? "買超" : "賣超"}
                  </div>
                  <div className="text-sm text-slate-600 mt-1">{Math.abs(institutional[0].totalNetLots).toLocaleString("zh-TW")} 張</div>
                  <div className="text-[10px] text-slate-400 mt-1">以三大法人合計買賣超估算（{institutional[0].date}）</div>
                </>
              ) : (
                <div className="text-sm text-slate-400 mt-2">尚未取得資料</div>
              )}
            </div>

            {/* 買超前15 */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <h3 className="text-sm font-semibold text-red-600">買超前15名</h3>
              </div>
              <ChipTable rows={buyRanking} />
            </div>
          </div>

          {/* 賣超前15 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
              <h3 className="text-sm font-semibold text-emerald-700">賣超前15名</h3>
            </div>
            <ChipTable rows={sellRanking} />
          </div>
        </>
      )}

      {/* 全市場三大法人買賣超前15名：跟目前查詢的股票無關（不受上面股票搜尋結果影響），
          放在頁面最下面，點列可直接切換查詢該檔 */}
      {marketRanking && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-600">全市場買超前15名</h3>
              <span className="text-[11px] text-slate-400">{marketRanking.date}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {marketRanking.buyTop.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => selectWatchStock(r.code)}
                  className="w-full flex items-center justify-between px-5 py-2 text-sm hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-slate-700">{r.name}</span>
                    <span className="text-xs text-slate-400">{r.code}</span>
                  </span>
                  <span className="text-red-500 font-semibold">+{r.netLots.toLocaleString("zh-TW")}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-700">全市場賣超前15名</h3>
              <span className="text-[11px] text-slate-400">{marketRanking.date}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {marketRanking.sellTop.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => selectWatchStock(r.code)}
                  className="w-full flex items-center justify-between px-5 py-2 text-sm hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-slate-700">{r.name}</span>
                    <span className="text-xs text-slate-400">{r.code}</span>
                  </span>
                  <span className="text-green-600 font-semibold">{r.netLots.toLocaleString("zh-TW")}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2 md:col-span-2">資料源：證交所 T86（僅涵蓋上市，依三大法人合計買賣超排序），點列可直接查詢該檔</p>
        </div>
      )}
    </div>
  );
}

function ChipTable({ rows }: { rows: ChipRanking[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-50">
            <th className="text-left font-semibold px-4 py-2.5">券商名稱</th>
            <th className="text-right font-semibold px-4 py-2.5">買賣超</th>
            <th className="text-right font-semibold px-4 py-2.5">買張</th>
            <th className="text-right font-semibold px-4 py-2.5">賣張</th>
            <th className="text-right font-semibold px-4 py-2.5">買均價</th>
            <th className="text-right font-semibold px-4 py-2.5">賣均價</th>
            <th className="text-right font-semibold px-4 py-2.5">交易量</th>
            <th className="text-right font-semibold px-4 py-2.5">損益(萬)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-400">
                尚未串接券商分點資料源，可在此處接上資料後填入表格
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.brokerName} className="text-slate-700">
                <td className="px-4 py-2.5">{r.brokerName}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.netVolume >= 0 ? "text-red-500" : "text-green-600"}`}>
                  {r.netVolume >= 0 ? "+" : ""}{r.netVolume.toLocaleString("zh-TW")}
                </td>
                <td className="px-4 py-2.5 text-right">{r.buyVolume.toLocaleString("zh-TW")}</td>
                <td className="px-4 py-2.5 text-right">{r.sellVolume.toLocaleString("zh-TW")}</td>
                <td className="px-4 py-2.5 text-right">{r.avgBuyPrice.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">{r.avgSellPrice.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right">{r.totalVolume.toLocaleString("zh-TW")}</td>
                <td className={`px-4 py-2.5 text-right ${r.profitLoss >= 0 ? "text-red-500" : "text-green-600"}`}>
                  {r.profitLoss.toLocaleString("zh-TW")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
