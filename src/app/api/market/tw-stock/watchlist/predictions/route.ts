import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeatureAccess } from "@/lib/permissions";
import { fetchWithConcurrency } from "@/lib/tw-stock-flow";
import { fetchFinMindDaily } from "@/lib/tw-stock-quotes";
import { computeMA, computeRSI, computeKDJ, computeMACD, computeBIAS, computeDMI } from "@/lib/technical-indicators";
import { computeStockPrediction, type SignalDetail } from "@/lib/stock-prediction";

const FEATURE_KEY = "feature.tw-stock-watchlist";
const CONCURRENCY = 4;
// 挑「最有代表性」的一句理由顯示在觀察名單列表：事件型訊號（籌碼背離、KDJ交叉）比
// 單純狀態型訊號（均線排列、乖離率）更值得一眼看到，所以排在前面優先顯示。
const REASON_PRIORITY = ["外資籌碼背離", "KDJ", "MACD", "均線排列", "RSI", "乖離率", "DMI/ADX"];

function pickTopSignal(signals: SignalDetail[], score: number): SignalDetail | null {
  if (signals.length === 0) return null;
  const direction = score > 0 ? "BULLISH" : score < 0 ? "BEARISH" : null;
  const candidates = direction ? signals.filter((s) => s.verdict === direction) : signals;
  const pool = candidates.length > 0 ? candidates : signals;
  return [...pool].sort((a, b) => REASON_PRIORITY.indexOf(a.name) - REASON_PRIORITY.indexOf(b.name))[0];
}

// 觀察名單一次全部算一輪技術面綜合評分：不是即時逐股點開才算，是列表就直接看到每一檔
// 的偏多/偏空跟關鍵理由。跟智能助理用同一套 computeStockPrediction，數字對得起來。
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  if (!(await hasFeatureAccess(session.user.id, session.user.role, FEATURE_KEY))) {
    return NextResponse.json({ error: "您的會員等級無法使用觀察名單功能" }, { status: 403 });
  }

  const watchlist = await prisma.userWatchStock.findMany({
    where: { userId: session.user.id },
    orderBy: { order: "asc" },
  });
  if (watchlist.length === 0) return NextResponse.json({ predictions: [] });

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const predictions = await fetchWithConcurrency(watchlist, CONCURRENCY, async (w) => {
    try {
      const daily = await fetchFinMindDaily(w.code, startDateStr);
      const clean = (daily ?? []).filter((q) => q.close != null && q.high != null && q.low != null);
      if (clean.length < 30) return { code: w.code, name: w.name, error: "資料不足" };

      const closes = clean.map((q) => q.close!);
      const candles = clean.map((q) => ({ high: q.high!, low: q.low!, close: q.close! }));
      const ma5 = computeMA(closes, 5);
      const ma20 = computeMA(closes, 20);
      const ma60 = computeMA(closes, 60);
      const rsi = computeRSI(closes);
      const { k, d } = computeKDJ(candles);
      const { dif, dea } = computeMACD(closes);
      const bias6 = computeBIAS(closes, 6);
      const { plusDI, minusDI, adx } = computeDMI(candles);
      const i = closes.length - 1;

      // 外資籌碼背離：讀快照表（股票頁/觀察名單同步時會寫入），這裡不即時爬證交所
      let foreignNetLotsRecent: number[] | null = null;
      let priceChangePctRecent: number | null = null;
      const snapshots = await prisma.stockInstitutionalSnapshot.findMany({
        where: { code: w.code },
        orderBy: { date: "desc" },
        take: 3,
      });
      if (snapshots.length >= 3) {
        foreignNetLotsRecent = snapshots.map((s) => s.foreignNetLots);
        const startQuote = clean.find((q) => q.date === snapshots[2].date);
        if (startQuote?.close && startQuote.close > 0) {
          priceChangePctRecent = ((closes[i] - startQuote.close) / startQuote.close) * 100;
        }
      }

      const prediction = computeStockPrediction({
        close: closes[i],
        ma5: ma5[i], ma20: ma20[i], ma60: ma60[i],
        rsi: rsi[i],
        k: k[i], d: d[i], prevK: i > 0 ? k[i - 1] : null, prevD: i > 0 ? d[i - 1] : null,
        macdDif: dif[i], macdDea: dea[i],
        bias: bias6[i],
        plusDI: plusDI[i], minusDI: minusDI[i], adx: adx[i],
        foreignNetLotsRecent, priceChangePctRecent,
      });

      const topSignal = pickTopSignal(prediction.signals, prediction.score);

      // 跑馬燈用的極端訊號：跟股票頁同一套門檻（RSI/KD同時<20或>80、乖離率(6日)正負超過13%），
      // 這裡只負責「偵測」，顯示交給前端的全站跑馬燈元件
      const alerts: string[] = [];
      if (rsi[i] != null && k[i] != null) {
        if (rsi[i]! < 20 && k[i]! < 20) alerts.push("RSI/KD同時超賣（<20）");
        else if (rsi[i]! > 80 && k[i]! > 80) alerts.push("RSI/KD同時超買（>80）");
      }
      if (bias6[i] != null) {
        if (bias6[i]! >= 13) alerts.push(`乖離率+${bias6[i]!.toFixed(1)}%，漲多留意拉回`);
        else if (bias6[i]! <= -13) alerts.push(`乖離率${bias6[i]!.toFixed(1)}%，跌多留意反彈`);
      }

      return {
        code: w.code,
        name: w.name,
        close: closes[i],
        label: prediction.label,
        score: prediction.score,
        maxScore: prediction.maxScore,
        reason: topSignal?.detail ?? null,
        alerts,
      };
    } catch (e) {
      console.error("watchlist prediction failed:", w.code, e);
      return { code: w.code, name: w.name, error: "計算失敗" };
    }
  });

  return NextResponse.json({ predictions });
}
