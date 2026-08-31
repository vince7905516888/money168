export interface HoldingInput {
  code?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null; // 沒有股價的調整列用這個欄位直接加減成本；quantity 則可同時用來調整股數（例如配股）
  action: "BUY" | "SELL";
  date: string | Date;
}

export interface Holding {
  key: string;
  name: string;
  code: string;
  quantity: number;
  cost: number;
  avgPrice: number;
}

// 移動平均成本法：買進累加股數與成本，賣出則按賣出前的平均成本比例扣除，平均成本不變、只有股數與總成本下降
export function computeHoldings(investments: HoldingInput[]): Holding[] {
  const groups = new Map<string, { name: string; code: string; qty: number; cost: number }>();

  const sorted = [...investments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const inv of sorted) {
    const key = inv.code?.trim() || inv.name?.trim() || "(未命名)";
    if (!inv.price) {
      // 沒有股價的調整列（成本調整／配股等）：只加減成本與／或股數，不套用買賣均價邏輯；
      // 例如用賣出其他股票的獲利攤平這檔的虧損（只調成本），或配股增加股數（只調股數、平均成本自動下降）
      if (inv.amount || inv.quantity) {
        if (!groups.has(key)) groups.set(key, { name: inv.name || "(未命名)", code: inv.code || "—", qty: 0, cost: 0 });
        const g = groups.get(key)!;
        if (inv.amount) g.cost += inv.amount;
        if (inv.quantity) g.qty += inv.quantity;
      }
      continue;
    }
    if (!inv.quantity) continue;
    if (!groups.has(key)) {
      groups.set(key, { name: inv.name || "(未命名)", code: inv.code || "—", qty: 0, cost: 0 });
    }
    const g = groups.get(key)!;
    if (inv.action === "BUY") {
      g.qty += inv.quantity;
      g.cost += inv.quantity * inv.price;
    } else {
      const avgCost = g.qty > 0 ? g.cost / g.qty : 0;
      const sellQty = Math.min(inv.quantity, g.qty);
      g.qty -= sellQty;
      g.cost -= avgCost * sellQty;
    }
  }

  return Array.from(groups.entries())
    .filter(([, g]) => g.qty > 0.0001)
    .map(([key, g]) => ({
      key,
      name: g.name,
      code: g.code,
      quantity: g.qty,
      cost: g.cost,
      avgPrice: g.cost / g.qty,
    }));
}
