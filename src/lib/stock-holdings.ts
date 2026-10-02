export interface HoldingInput {
  id?: string;
  code?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null; // 沒有股價的調整列用這個欄位直接加減成本；quantity 則可同時用來調整股數（例如配股）
  action: "BUY" | "SELL";
  date: string | Date;
  createdAt?: string | Date;
}

export interface Holding {
  key: string;
  name: string;
  code: string;
  quantity: number;
  cost: number;
  avgPrice: number;
  // 實際投入成本：不含成本調整列（用其他持股獲利攤平虧損）。成本調整只是改變均價的帳面處理，
  // 獲利早已變現入帳到銀行，若資產總攬用 cost 加總，每做一次成本調整總資產就會被多扣一次。
  bookCost: number;
}

// 單筆賣出的已實現損益（先進先出）
export interface SaleResult {
  proceeds: number; // 賣出淨額（已扣手續費、交易稅）
  cost: number; // 賣掉的那幾批的實際買進成本
  pnl: number; // 實際損益 = proceeds − cost
  adjustedCost: number; // 同上，但成本已扣除成本調整（攤平）
  adjustedPnl: number; // 攤平後損益
}

// 一批買進：cost 是實際投入成本，adjCost 是扣掉成本調整後的成本（用來算攤平後均價）
interface Lot { qty: number; cost: number; adjCost: number }

// 先進先出（FIFO）：每次買進是一批，賣出時從最早買進的那批開始扣，
// 賣掉的那幾批成本就是這次賣出的成本，賣出淨額減掉它就是這次的已實現損益
export function computeStockLedger(investments: HoldingInput[]): { holdings: Holding[]; sales: Map<string, SaleResult> } {
  const groups = new Map<string, { name: string; code: string; lots: Lot[]; pendingAdj: number }>();
  const sales = new Map<string, SaleResult>();

  const time = (d: string | Date | undefined) => (d ? new Date(d).getTime() : 0);
  const sorted = [...investments].sort((a, b) => time(a.date) - time(b.date) || time(a.createdAt) - time(b.createdAt));

  for (const inv of sorted) {
    const key = inv.code?.trim() || inv.name?.trim() || "(未命名)";
    // 獲利沖銷列（舊版成本調整在來源股票補的沖銷）：已不影響任何計算，直接略過
    if (!inv.price && !inv.quantity && inv.action === "BUY" && (inv.amount ?? 0) > 0) continue;
    if (!groups.has(key)) groups.set(key, { name: inv.name || "(未命名)", code: inv.code || "—", lots: [], pendingAdj: 0 });
    const g = groups.get(key)!;

    if (!inv.price) {
      // 沒有股價的調整列：
      // - 成本調整（用其他股票獲利攤平這檔虧損）：依股數比例攤到目前每一批的 adjCost，不動實際成本
      // - 配股：新增一批零成本的股數
      if (inv.quantity) g.lots.push({ qty: inv.quantity, cost: 0, adjCost: 0 });
      if (inv.amount) {
        const totalQty = g.lots.reduce((s, l) => s + l.qty, 0);
        if (totalQty > 0) {
          for (const l of g.lots) l.adjCost += inv.amount * (l.qty / totalQty);
        } else {
          g.pendingAdj += inv.amount; // 目前沒有持股，留到下一批買進再套用
        }
      }
      continue;
    }
    if (!inv.quantity) continue;

    if (inv.action === "BUY") {
      // 實際投入成本以帳上金額為準（含手續費、或使用者手動調帳的實際扣款），沒有金額才用股數×股價
      const cost = inv.amount && inv.amount > 0 ? inv.amount : inv.quantity * inv.price;
      g.lots.push({ qty: inv.quantity, cost, adjCost: cost + g.pendingAdj });
      g.pendingAdj = 0;
    } else {
      let remaining = inv.quantity;
      let cost = 0;
      let adjustedCost = 0;
      while (remaining > 0.0001 && g.lots.length > 0) {
        const lot = g.lots[0];
        const take = Math.min(remaining, lot.qty);
        const ratio = take / lot.qty;
        cost += lot.cost * ratio;
        adjustedCost += lot.adjCost * ratio;
        lot.cost -= lot.cost * ratio;
        lot.adjCost -= lot.adjCost * ratio;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 0.0001) g.lots.shift();
      }
      // 賣出金額存成負數（賣出淨額）；沒有金額時用股數×股價估算
      const proceeds = inv.amount ? Math.abs(inv.amount) : inv.quantity * inv.price;
      if (inv.id) sales.set(inv.id, { proceeds, cost, pnl: proceeds - cost, adjustedCost, adjustedPnl: proceeds - adjustedCost });
    }
  }

  const holdings = Array.from(groups.entries())
    .map(([key, g]) => {
      const quantity = g.lots.reduce((s, l) => s + l.qty, 0);
      const cost = g.lots.reduce((s, l) => s + l.adjCost, 0);
      const bookCost = g.lots.reduce((s, l) => s + l.cost, 0);
      return { key, name: g.name, code: g.code, quantity, cost, avgPrice: quantity > 0 ? cost / quantity : 0, bookCost };
    })
    .filter((h) => h.quantity > 0.0001);

  return { holdings, sales };
}

export function computeHoldings(investments: HoldingInput[]): Holding[] {
  return computeStockLedger(investments).holdings;
}

// 虛擬貨幣配息：買進、沒有單價，且金額為 0 或備註以「配息」開頭。配息不計成本，價值依即時市價計算（見 dividendMarketValue）
export function isCryptoDividend(i: { action?: string | null; price?: number | null; amount: number; quantity?: number | null; note?: string | null }): boolean {
  return i.action === "BUY" && !i.price && !!i.quantity && (!i.amount || !!i.note?.startsWith("配息"));
}

export interface AmountHolding {
  key: string;
  name: string;
  code: string;
  quantity: number;
  cost: number;
  dividendQty: number; // 累計配息數量
}

type AmountHoldingInput = { note?: string | null; code?: string | null; name?: string | null; quantity?: number | null; price?: number | null; amount: number; action?: "BUY" | "SELL" | null; date?: string | Date | null; createdAt: string | Date };

// 每一檔目前持有的數量與投入成本（演算法說明見 remainingCostByAmount）
// 數量門檻用 1e-9 而非 0.0001：虛擬貨幣常有 0.00005 BTC 這種很小的持有量，不能被當成已出清
export function remainingHoldingsByAmount(list: AmountHoldingInput[]): AmountHolding[] {
  const groups = new Map<string, AmountHolding>();
  // 同一天的記錄依建立時間排先後：例如同一天先入金再買幣扣款，扣款不能排在入金前面（否則當下餘額為 0 扣不到）
  const sorted = [...list].sort((a, b) =>
    new Date(a.date ?? a.createdAt).getTime() - new Date(b.date ?? b.createdAt).getTime()
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const inv of sorted) {
    const key = inv.code?.trim() || inv.name?.trim() || "(未命名)";
    if (!groups.has(key)) groups.set(key, { key, name: inv.name?.trim() || key, code: inv.code?.trim() || "—", quantity: 0, cost: 0, dividendQty: 0 });
    const g = groups.get(key)!;
    if (!inv.quantity) {
      // 沒有數量異動的純成本調整列，直接加減成本
      g.cost += inv.amount;
      continue;
    }
    if (inv.action === "SELL") {
      const avgCost = g.quantity > 0 ? g.cost / g.quantity : 0;
      const sellQty = Math.min(inv.quantity, g.quantity);
      g.cost -= avgCost * sellQty;
      g.quantity -= sellQty;
    } else {
      g.quantity += inv.quantity;
      g.cost += inv.amount;
      if (isCryptoDividend({ ...inv, action: "BUY" })) g.dividendQty += inv.quantity;
    }
  }
  return Array.from(groups.values()).filter((g) => g.quantity > 1e-9);
}

// 目前持有部位的投入成本（移動平均成本法，依實際入帳金額 amount 計算，不重算 quantity×price）：
// 虛擬貨幣、黃金頁的單價欄位可能跟實際入帳金額對不上（有「實際金額」覆蓋輸入，也有把 USDT 當中介幣
// 拿去買美股等用法），若用單價重算成本，一筆單價填錯或不一致的紀錄就會讓總額嚴重失真；
// 直接用帳上金額才能保證買了多少算多少、賣出只按比例扣掉平均成本，出清後成本歸零。
// 前台資產總攬與後台全站統計共用，兩邊數字才會對得起來。
export function remainingCostByAmount(list: AmountHoldingInput[]): number {
  return remainingHoldingsByAmount(list).reduce((s, g) => s + g.cost, 0);
}

// 暫計帳（待賺回）資產：尚未回補的暫計帳，以扣除當下的成本計入資產。
// 扣除時虛擬貨幣持有成本減少、這裡等額增加，回補後兩邊再換回來，總資產不因暫計帳而變動
// 配息市值：目前仍持有的配息數量 × 即時台幣價格（價格表的 key 為大寫代碼）。
// 配息以零成本記帳，持有成本不含它的價值，資產總攬再把這部分的市值加上去
export function dividendMarketValue(holdings: AmountHolding[], twdPrices: Record<string, number>): number {
  return holdings.reduce((s, h) => {
    const price = twdPrices[h.code.toUpperCase()];
    return price ? s + Math.min(h.dividendQty, h.quantity) * price : s;
  }, 0);
}

export function suspenseOpenCost(list: { quantity: number; unitCost: number; reversedAt?: string | Date | null }[]): number {
  return list.filter((e) => !e.reversedAt).reduce((s, e) => s + e.quantity * e.unitCost, 0);
}
