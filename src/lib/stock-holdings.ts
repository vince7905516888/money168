export interface HoldingInput {
  code?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null; // 股數為0的純成本調整記錄用這個欄位直接加減成本，不影響股數
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
    if (!inv.quantity || !inv.price) {
      // 股數為0的成本調整記錄（例如用賣出其他股票的獲利攤平這檔的虧損）：
      // 只加減成本，股數不變；沒有金額的一般空白列則照舊跳過不處理
      if (inv.amount) {
        if (!groups.has(key)) groups.set(key, { name: inv.name || "(未命名)", code: inv.code || "—", qty: 0, cost: 0 });
        groups.get(key)!.cost += inv.amount;
      }
      continue;
    }
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
