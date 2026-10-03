// 幣安帳戶同步排程工作（Railway 新加坡區，railway.json 設定每 12 小時執行一次，跑完即結束）
//
// 主站在 Railway 美國區，連幣安會被 451 擋下，所以由這個排程工作在新加坡區讀取幣安帳戶，
// 把餘額與原始記錄寫進資料庫的 BinanceSnapshot，網站只讀資料庫做核對／作帳。
// - 沒有任何對外端點（不開 HTTP 伺服器），只主動呼叫幣安的唯讀 API
// - 幣安金鑰只存在這個服務的環境變數（BINANCE_API_KEY / BINANCE_API_SECRET），請只開「讀取」權限
// - BINANCE_USER_EMAIL：資料要歸屬到網站上的哪個會員
// - DATABASE_URL：同一個 Railway 專案的 Postgres
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const API = "https://api.binance.com";
const KEY = process.env.BINANCE_API_KEY;
const SECRET = process.env.BINANCE_API_SECRET;
const DAY = 24 * 60 * 60 * 1000;

async function signed(method, path, params = {}) {
  const query = new URLSearchParams({ ...params, recvWindow: "10000", timestamp: String(Date.now()) }).toString();
  const signature = crypto.createHmac("sha256", SECRET).update(query).digest("hex");
  const res = await fetch(`${API}${path}?${query}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": KEY },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function collect() {
  const raw = { errors: {} };
  const tryGet = async (name, fn) => {
    try { raw[name] = await fn(); } catch (e) { raw.errors[name] = String(e.message || e); }
  };
  const now = Date.now();
  const since30 = String(now - 30 * DAY);

  await tryGet("spot", () => signed("GET", "/api/v3/account", { omitZeroBalances: "true" }));
  await tryGet("funding", () => signed("POST", "/sapi/v1/asset/get-funding-asset"));
  await tryGet("earnFlexible", () => signed("GET", "/sapi/v1/simple-earn/flexible/position", { size: "100" }));
  await tryGet("earnLocked", () => signed("GET", "/sapi/v1/simple-earn/locked/position", { size: "100" }));
  await tryGet("deposits", () => signed("GET", "/sapi/v1/capital/deposit/hisrec", { startTime: since30 }));
  await tryGet("withdrawals", () => signed("GET", "/sapi/v1/capital/withdraw/history", { startTime: since30 }));
  await tryGet("convert", () => signed("GET", "/sapi/v1/convert/tradeFlow", { startTime: since30, endTime: String(now) }));
  await tryGet("dividends", () => signed("GET", "/sapi/v1/asset/assetDividend", { startTime: since30, limit: "500" }));

  // 各幣種對 USDT 的現貨成交（每個交易對最近 100 筆）；交易對不存在的會記在 errors
  const assets = new Set();
  for (const b of raw.spot?.balances ?? []) assets.add(b.asset);
  for (const b of raw.funding ?? []) assets.add(b.asset);
  raw.trades = {};
  for (const asset of assets) {
    if (asset === "USDT" || asset.startsWith("LD")) continue;
    const symbol = `${asset}USDT`;
    try { raw.trades[symbol] = await signed("GET", "/api/v3/myTrades", { symbol, limit: "100" }); }
    catch (e) { raw.errors[`trades:${symbol}`] = String(e.message || e); }
  }
  return raw;
}

// 彙總各幣種總數量：現貨（free+locked，LD 開頭是理財的映射資產，略過避免重複）＋資金帳戶＋理財
function summarize(raw) {
  const balances = {};
  const add = (asset, field, n) => {
    const v = parseFloat(n) || 0;
    if (!v) return;
    balances[asset] ??= { spot: 0, funding: 0, earn: 0, total: 0 };
    balances[asset][field] += v;
    balances[asset].total += v;
  };
  for (const b of raw.spot?.balances ?? []) {
    if (b.asset.startsWith("LD")) continue;
    add(b.asset, "spot", (parseFloat(b.free) || 0) + (parseFloat(b.locked) || 0));
  }
  for (const b of raw.funding ?? []) {
    add(b.asset, "funding", ["free", "locked", "freeze", "withdrawing"].reduce((s, k) => s + (parseFloat(b[k]) || 0), 0));
  }
  for (const p of raw.earnFlexible?.rows ?? []) add(p.asset, "earn", p.totalAmount);
  for (const p of raw.earnLocked?.rows ?? []) add(p.asset, "earn", p.amount);
  return balances;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const user = await db.query(`select id from "User" where email = $1`, [process.env.BINANCE_USER_EMAIL]);
    if (!user.rows[0]) throw new Error("找不到 BINANCE_USER_EMAIL 對應的會員");
    const userId = user.rows[0].id;

    let balances = {}, raw = null, error = null;
    if (!KEY || !SECRET) {
      error = "尚未設定 BINANCE_API_KEY / BINANCE_API_SECRET";
    } else {
      raw = await collect();
      balances = summarize(raw);
      if (raw.errors.spot) error = raw.errors.spot;
    }
    await db.query(
      `insert into "BinanceSnapshot" (id, "userId", "fetchedAt", balances, raw, error) values ($1, $2, now(), $3, $4, $5)`,
      [crypto.randomUUID(), userId, JSON.stringify(balances), raw ? JSON.stringify(raw) : null, error]
    );
    // 只保留最近 60 筆快照（約 30 天）
    await db.query(
      `delete from "BinanceSnapshot" where "userId" = $1 and id not in (select id from "BinanceSnapshot" where "userId" = $1 order by "fetchedAt" desc limit 60)`,
      [userId]
    );
    console.log(`[binance-sync] ${new Date().toISOString()} assets=${Object.keys(balances).length} error=${error ?? "none"}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("[binance-sync] failed:", e.message);
  process.exit(1);
});
