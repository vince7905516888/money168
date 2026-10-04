// 幣安自動作帳：把切點（BinanceCredential.autoBookFrom）之後的幣安記錄轉成網站的投資記錄。
// 資料來源是新加坡同步工作寫入的 BinanceSnapshot.raw（見 services/binance-sync）。
//
// - 現貨成交（幣／USDT）、閃兌 → 一對「兌換：」記錄（換出／換入），換成 USDT 時以 USDT 平均成本計價，
//   用 USDT 買幣時換入成本＝花掉的 USDT × USDT 平均成本，其他幣互換則承接成本（跟手動「兌換」同一套規則）
// - 活期理財利息、分紅空投 → 「配息：」記錄（零成本，價值依即時市價計入資產）
// - EQ_ 股票代幣：幣安沒有提供成交明細，以兩次同步之間的股數變化推算，記到美股頁（USD），
//   花掉的 USDC（同期間 USDC 餘額減少，扣掉閃兌換入）同時從虛擬貨幣扣除
// - 每筆記錄的 externalRef＝幣安編號＃序號，(userId, externalRef) 唯一，重複執行不會重複入帳
// - 記錄的日期就是幣安的成交／發放時間（到秒），股票代幣則是同步時間
import { prisma } from "@/lib/prisma";
import { remainingHoldingsByAmount, computeHoldings } from "@/lib/stock-holdings";

const BINANCE = "幣安 Binance";

interface HoldingRow {
  code: string | null;
  name: string | null;
  quantity: number | null;
  price: number | null;
  amount: number;
  action: "BUY" | "SELL";
  date: Date;
  createdAt: Date;
  note: string | null;
}

interface NewRecord {
  userId: string;
  type: "CRYPTO" | "USSTOCK";
  name: string;
  code: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  amount: number;
  currency?: string;
  broker: string;
  date: Date;
  note: string;
  externalRef: string;
}

interface Event {
  ref: string;
  time: number;
  kind: "trade" | "convert" | "reward" | "eq";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

const num = (v: unknown) => parseFloat(String(v)) || 0;
const fmtQ = (n: number) => String(Math.round(n * 1e8) / 1e8);

// opts.dryRun：只回傳會產生的記錄、不寫入（測試用）；opts.from：覆寫切點（測試用）
export async function runBinanceAutoBook(
  userId: string,
  opts: { dryRun?: boolean; from?: Date } = {}
): Promise<{ created: number; preview?: NewRecord[] }> {
  const cred = await prisma.binanceCredential.findUnique({ where: { userId }, select: { autoBookFrom: true } });
  const cutoff = opts.from ?? cred?.autoBookFrom;
  if (!cutoff) return { created: 0 };
  const from = cutoff.getTime();

  // 切點那一次同步當作股票代幣的比較基準，所以往前多抓一分鐘
  const snaps = await prisma.binanceSnapshot.findMany({
    where: { userId, error: null, fetchedAt: { gte: new Date(from - 60_000) } },
    orderBy: { fetchedAt: "asc" },
    select: { id: true, fetchedAt: true, balances: true, raw: true },
  });
  if (snaps.length === 0) return { created: 0 };

  // 已入帳的，以及會員手動刪除過的（不再記回來）
  const [bookedRows, dismissed] = await Promise.all([
    prisma.investment.findMany({ where: { userId, externalRef: { not: null } }, select: { externalRef: true } }),
    prisma.dismissedExternalRef.findMany({ where: { userId }, select: { ref: true } }),
  ]);
  const booked = new Set([...bookedRows.map((r) => r.externalRef!.split("#")[0]), ...dismissed.map((d) => d.ref)]);

  // ---- 收集事件（同一筆會出現在多次同步裡，以 ref 去重）----
  const events = new Map<string, Event>();
  const push = (e: Event) => { if (e.time >= from && !booked.has(e.ref) && !events.has(e.ref)) events.set(e.ref, e); };
  for (const snap of snaps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (snap.raw ?? {}) as any;
    for (const [symbol, list] of Object.entries(raw.trades ?? {})) {
      for (const t of (list as { id: number; time: number }[]) ?? []) {
        push({ ref: `bn:trade:${symbol}:${t.id}`, time: t.time, kind: "trade", data: { ...t, base: symbol.replace(/USDT$/, "") } });
      }
    }
    for (const c of raw.convert?.list ?? []) {
      if (c.orderStatus === "SUCCESS") push({ ref: `bn:convert:${c.orderId}`, time: c.createTime, kind: "convert", data: c });
    }
    for (const r of raw.earnRewards ?? []) {
      const kind = r.type === "BONUS" ? "加碼利息" : r.type === "REWARDS" ? "其他獎勵" : "即時利息";
      push({ ref: `bn:earn:${r.type}:${r.asset}:${r.time}`, time: r.time, kind: "reward", data: { asset: r.asset, amount: r.rewards, label: `理財「活期」${r.asset} ${kind}` } });
    }
    for (const d of raw.dividends?.rows ?? []) {
      // 活期／定期理財的利息在 earnRewards 已經記過，資產分紅裡又會以 Flexible、Simple Earn 等名稱再出現一次，略過避免重複
      if (/flexible|locked|simple earn|savings|staking/i.test(String(d.enInfo ?? ""))) continue;
      push({ ref: `bn:div:${d.tranId ?? d.id}`, time: d.divTime, kind: "reward", data: { asset: d.asset, amount: d.amount, label: `資產分紅「${d.enInfo || "分紅／空投"}」編號 ${d.tranId ?? d.id}` } });
    }
  }
  // 股票代幣：相鄰兩次同步的 EQ_ 股數變化
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1], cur = snaps[i];
    const pb = prev.balances as Record<string, { total: number }>, cb = cur.balances as Record<string, { total: number }>;
    const deltas: Record<string, number> = {};
    for (const code of new Set([...Object.keys(pb), ...Object.keys(cb)])) {
      if (!code.startsWith("EQ_")) continue;
      const d = Math.round(((cb[code]?.total ?? 0) - (pb[code]?.total ?? 0)) * 1e8) / 1e8;
      if (d !== 0) deltas[code] = d;
    }
    if (Object.keys(deltas).length === 0) continue;
    // 這段期間 USDC 的淨花費＝前次餘額＋閃兌換入－閃兌換出－本次餘額
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convs = (((cur.raw ?? {}) as any).convert?.list ?? []).filter(
      (c: { createTime: number; orderStatus: string }) => c.orderStatus === "SUCCESS" && c.createTime > prev.fetchedAt.getTime() && c.createTime <= cur.fetchedAt.getTime()
    );
    let usdcIn = 0;
    for (const c of convs) {
      if (c.toAsset === "USDC") usdcIn += num(c.toAmount);
      if (c.fromAsset === "USDC") usdcIn -= num(c.fromAmount);
    }
    const usdcSpent = (pb.USDC?.total ?? 0) + usdcIn - (cb.USDC?.total ?? 0);
    push({ ref: `bn:eq:${cur.id}`, time: cur.fetchedAt.getTime(), kind: "eq", data: { deltas, usdcSpent } });
  }
  if (events.size === 0) return { created: 0 };

  // ---- 依時間順序入帳（平均成本隨每筆記錄更新）----
  const [cryptoRows, usRows] = await Promise.all([
    prisma.investment.findMany({ where: { userId, type: "CRYPTO" } }),
    prisma.investment.findMany({ where: { userId, type: "USSTOCK" } }),
  ]);
  const crypto: HoldingRow[] = cryptoRows.map((r) => ({ ...r, action: r.action as "BUY" | "SELL" }));
  const usstock = usRows.map((r) => ({ ...r, action: r.action as "BUY" | "SELL", date: r.date }));
  const avg = (code: string) => {
    const h = remainingHoldingsByAmount(crypto).find((x) => x.code === code);
    return h && h.quantity > 0 ? h.cost / h.quantity : 0;
  };
  const queue: NewRecord[] = [];
  const add = (r: Omit<NewRecord, "userId" | "broker"> & { broker?: string }) => {
    const rec = { userId, broker: BINANCE, ...r };
    queue.push(rec);
    if (rec.type === "CRYPTO") crypto.push({ ...rec, createdAt: new Date() });
    else usstock.push({ ...rec, createdAt: new Date() } as (typeof usstock)[number]);
  };
  const cryptoRec = (ref: string, n: number, code: string, action: "BUY" | "SELL", quantity: number, cost: number, date: Date, note: string) =>
    add({ type: "CRYPTO", name: code, code, action, quantity, price: quantity > 0 && cost > 0 ? cost / quantity : null, amount: action === "SELL" ? -cost : cost, date, note, externalRef: `${ref}#${n}` });

  for (const e of [...events.values()].sort((a, b) => a.time - b.time)) {
    const date = new Date(e.time);
    if (e.kind === "trade") {
      const t = e.data;
      const base = t.base as string;
      const qty = num(t.qty), quote = num(t.quoteQty), fee = num(t.commission), feeAsset = t.commissionAsset as string;
      const usdtAvg = avg("USDT");
      const feeOther = feeAsset !== base && feeAsset !== "USDT" ? fee : 0;
      const feeOtherCost = feeOther * avg(feeAsset);
      const feeText = fee ? `，手續費 ${fmtQ(fee)} ${feeAsset}` : "";
      if (t.isBuyer) {
        const qtyIn = qty - (feeAsset === base ? fee : 0);
        const usdtOut = quote + (feeAsset === "USDT" ? fee : 0);
        const cost = usdtOut * usdtAvg + feeOtherCost;
        const note = `兌換：${fmtQ(usdtOut)} USDT → ${fmtQ(qtyIn)} ${base}（幣安現貨 ${base}/USDT 買進 @${num(t.price)}${feeText}，成交編號 ${t.id}）`;
        cryptoRec(e.ref, 1, "USDT", "SELL", usdtOut, usdtOut * usdtAvg, date, note);
        cryptoRec(e.ref, 2, base, "BUY", qtyIn, cost, date, note);
        if (feeOther) cryptoRec(e.ref, 3, feeAsset, "SELL", feeOther, feeOtherCost, date, `${note}（手續費）`);
      } else {
        const qtyOut = qty + (feeAsset === base ? fee : 0);
        const usdtIn = quote - (feeAsset === "USDT" ? fee : 0);
        const note = `兌換：${fmtQ(qtyOut)} ${base} → ${fmtQ(usdtIn)} USDT（幣安現貨 ${base}/USDT 賣出 @${num(t.price)}${feeText}，成交編號 ${t.id}）`;
        cryptoRec(e.ref, 1, base, "SELL", qtyOut, qtyOut * avg(base), date, note);
        cryptoRec(e.ref, 2, "USDT", "BUY", usdtIn, usdtIn * usdtAvg, date, note);
        if (feeOther) cryptoRec(e.ref, 3, feeAsset, "SELL", feeOther, feeOtherCost, date, `${note}（手續費）`);
      }
    } else if (e.kind === "convert") {
      const c = e.data;
      const A = c.fromAsset as string, B = c.toAsset as string, a = num(c.fromAmount), b = num(c.toAmount);
      const usdtAvg = avg("USDT");
      const outCost = A === "USDT" ? a * usdtAvg : a * avg(A);
      const inCost = B === "USDT" ? b * usdtAvg : outCost;
      const note = `兌換：${fmtQ(a)} ${A} → ${fmtQ(b)} ${B}（幣安閃兌，訂單編號 ${c.orderId}）`;
      cryptoRec(e.ref, 1, A, "SELL", a, outCost, date, note);
      cryptoRec(e.ref, 2, B, "BUY", b, inCost, date, note);
    } else if (e.kind === "reward") {
      const q = num(e.data.amount);
      if (q > 0) add({ type: "CRYPTO", name: e.data.asset, code: e.data.asset, action: "BUY", quantity: q, price: null, amount: 0, date, note: `配息：幣安${e.data.label}（+${fmtQ(q)} ${e.data.asset}）`, externalRef: `${e.ref}#1` });
    } else if (e.kind === "eq") {
      const { deltas, usdcSpent } = e.data as { deltas: Record<string, number>; usdcSpent: number };
      const usHold = computeHoldings(usstock.map((r) => ({ ...r, code: r.code, name: r.name })));
      const refPrice = (code: string) => usHold.find((h) => h.code === code)?.avgPrice || 1;
      const side = (sign: 1 | -1) => {
        const list = Object.entries(deltas).filter(([, d]) => Math.sign(d) === sign).map(([eq, d]) => ({ code: eq.replace(/^EQ_/, ""), q: Math.abs(d) }));
        if (list.length === 0) return;
        const usd = sign === 1 ? Math.max(0, usdcSpent) : Math.max(0, -usdcSpent);
        const weightSum = list.reduce((s, x) => s + x.q * refPrice(x.code), 0);
        list.forEach((x, i) => {
          const value = usd > 0 && weightSum > 0 ? (usd * x.q * refPrice(x.code)) / weightSum : x.q * refPrice(x.code);
          add({
            type: "USSTOCK", name: x.code, code: x.code, action: sign === 1 ? "BUY" : "SELL", quantity: x.q,
            price: value / x.q, amount: sign === 1 ? value : -value, currency: "USD", date,
            note: `幣安股票代幣（依同步前後股數推算${usd > 0 ? `，${sign === 1 ? "花費" : "收回"} ${fmtQ(usd)} USDC` : ""}）`,
            externalRef: `${e.ref}:${sign === 1 ? "buy" : "sell"}#${i + 1}`,
          });
        });
        if (usd > 0) {
          const names = list.map((x) => x.code).join("、");
          if (sign === 1) cryptoRec(`${e.ref}:usdc`, 1, "USDC", "SELL", usd, usd * avg("USDC"), date, `兌換：${fmtQ(usd)} USDC → 美股 ${names}（推算）`);
          else cryptoRec(`${e.ref}:usdc`, 2, "USDC", "BUY", usd, usd * avg("USDT"), date, `兌換：美股 ${names} → ${fmtQ(usd)} USDC（推算）`);
        }
      };
      side(1);
      side(-1);
    }
  }

  if (opts.dryRun) return { created: 0, preview: queue };
  if (queue.length === 0) return { created: 0 };
  const res = await prisma.investment.createMany({ data: queue, skipDuplicates: true });
  return { created: res.count };
}
