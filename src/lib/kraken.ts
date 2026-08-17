// Kraken公開API用的幣別代號對照表，klines/ticker兩條路由共用，避免各自維護一份、日後漏改。
export const SYMBOL_TO_PAIR: Record<string, string> = {
  BTC: "XBTUSD",
  ETH: "ETHUSD",
  SOL: "SOLUSD",
  XRP: "XRPUSD",
  DOGE: "DOGEUSD",
};

// Kraken回傳結果的key是內部代號（例如XXBTZUSD），不等於查詢用的pair名稱。
export function firstResultValue<T>(result: Record<string, T>): T | null {
  const key = Object.keys(result)[0];
  return key ? result[key] : null;
}
