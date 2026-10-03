// 銀行（帳戶）餘額的共用計算：/api/banks/summary、銀行記錄的扣款後餘額（/api/transactions）、
// 後台全站統計共用，判斷邏輯與幣別換算只維護這一份。
//
// 一筆交易影響哪個銀行、金額增減多少：
// 一筆交易可能同時影響兩個銀行（銀行對銀行的調帳），也可能完全不影響任何銀行（現金/第三方支付）。
// 金額是交易本身的幣別（currency，沒填視為台幣），例如支付寶帳戶的記錄是人民幣。

export interface BankDelta {
  bankName: string;
  delta: number;
  currency: string;
}

interface TxLike {
  type: string;
  amount: number;
  note: string | null;
  currency?: string | null;
  category: { name: string } | null;
}

export function deriveBankDeltas(t: TxLike): BankDelta[] {
  const currency = t.currency || "TWD";
  if (t.type === "EXPENSE" && t.note?.startsWith("支付:銀行:")) {
    const name = t.note.split(":")[2];
    return name ? [{ bankName: name, delta: -t.amount, currency }] : [];
  }
  if (t.type === "EXPENSE" && t.category?.name === "銀行" && t.note) {
    const name = t.note.split(" · ")[0];
    return name ? [{ bankName: name, delta: -t.amount, currency }] : [];
  }
  if (t.type === "INCOME" && t.category?.name === "銀行" && t.note) {
    const name = t.note.split(" · ")[0];
    return name ? [{ bankName: name, delta: t.amount, currency }] : [];
  }
  if (t.type === "TRANSFER" && t.note) {
    const match = t.note.match(/FROM:([^:]+):?([^|]*)\|TO:([^:]+):?(.*)/);
    if (match) {
      const [, fromType, fromDetail, toType, toDetail] = match;
      const deltas: BankDelta[] = [];
      if (fromType === "銀行" && fromDetail) deltas.push({ bankName: fromDetail, delta: -t.amount, currency });
      if (toType === "銀行" && toDetail) deltas.push({ bankName: toDetail, delta: t.amount, currency });
      return deltas;
    }
  }
  return [];
}

export interface BankSummary {
  name: string;
  income: number; // 以下金額皆已換算台幣
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
  currencies: Record<string, number>; // 各幣別原幣餘額，例如 { CNY: 1483 }
  unratedCurrencies: string[]; // 沒有儲存匯率、無法換算台幣的幣別（換算時以 0 計）
}

// rates：幣別 → 台幣匯率（使用者在資產總攬儲存的匯率），台幣固定為 1
export function computeBankSummaries(transactions: TxLike[], rates: Map<string, number>): BankSummary[] {
  const map = new Map<string, BankSummary>();
  const ensure = (name: string) => {
    if (!map.has(name)) map.set(name, { name, income: 0, expense: 0, transferIn: 0, transferOut: 0, balance: 0, currencies: {}, unratedCurrencies: [] });
    return map.get(name)!;
  };
  for (const t of transactions) {
    for (const d of deriveBankDeltas(t)) {
      const b = ensure(d.bankName);
      const rate = d.currency === "TWD" ? 1 : rates.get(d.currency);
      if (rate == null && !b.unratedCurrencies.includes(d.currency)) b.unratedCurrencies.push(d.currency);
      const twd = d.delta * (rate ?? 0);
      if (t.type === "TRANSFER") {
        if (d.delta < 0) b.transferOut -= twd;
        else b.transferIn += twd;
      } else if (d.delta < 0) b.expense -= twd;
      else b.income += twd;
      b.balance += twd;
      b.currencies[d.currency] = (b.currencies[d.currency] ?? 0) + d.delta;
    }
  }
  return [...map.values()];
}
