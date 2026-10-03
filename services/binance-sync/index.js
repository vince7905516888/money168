// 幣安帳戶同步工作（Railway 新加坡區，常駐執行，每 10 分鐘檢查一次是否有會員該同步）
//
// 主站在 Railway 美國區，連幣安會被 451 擋下，所以由這個排程工作在新加坡區讀取幣安帳戶，
// 把餘額與原始記錄寫進資料庫的 BinanceSnapshot，網站只讀資料庫做核對／作帳。
// - 沒有任何對外端點（不開 HTTP 伺服器），只主動呼叫幣安的唯讀 API
// - 會員在網站上自行填寫幣安金鑰（選填），網站以公鑰加密存進 BinanceCredential，
//   這裡用私鑰（BINANCE_CRED_PRIVATE_KEY，base64 的 PEM）解開；沒有填金鑰的會員不會被同步
// - 同步時間：會員可設定「第一次檢查時間」（台灣時間整點），之後每 12 小時一次（例如 08:00 與 20:00）；
//   沒設定的話，設定金鑰後 10 分鐘內第一次同步，之後每 12 小時一次
// - DATABASE_URL：同一個 Railway 專案的 Postgres
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

const API = "https://api.binance.com";
const DAY = 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000 - 10 * 60 * 1000; // 12 小時（留 10 分鐘緩衝，避免剛好差幾秒被跳過）
const CHECK_EVERY_MS = 10 * 60 * 1000;

// 台灣時間的整點小時，與本小時開始的時間
function taipeiHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hourCycle: "h23" }).format(date));
}
function startOfCurrentHour() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.getTime();
}

// 這個會員現在該不該同步
function isDue(syncHour, lastSync) {
  const last = lastSync ? new Date(lastSync).getTime() : 0;
  if (syncHour === null || syncHour === undefined) {
    // 沒指定時間：設定金鑰後第一次立即同步，之後每 12 小時
    return !last || Date.now() - last >= SYNC_INTERVAL_MS;
  }
  // 指定時間：只在指定整點與 12 小時後的整點同步，同一個小時內只同步一次
  const slots = [syncHour, (syncHour + 12) % 24];
  if (!slots.includes(taipeiHour())) return false;
  return !last || last < startOfCurrentHour();
}
const PRIVATE_KEY = Buffer.from(process.env.BINANCE_CRED_PRIVATE_KEY ?? "", "base64").toString("utf8");

function decrypt(b64) {
  return crypto.privateDecrypt(
    { key: PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(b64, "base64")
  ).toString("utf8");
}

// 目前同步中的會員金鑰（每個會員各自設定）
let KEY = "";
let SECRET = "";

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
  await tryGet("dividends", () => signed("GET", "/sapi/v1/asset/assetDividend", { startTime: since30, endTime: String(now), limit: "500" }));

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

async function syncUser(db, userId) {
  let balances = {}, raw = null, error = null;
  try {
    raw = await collect();
    balances = summarize(raw);
    if (raw.errors.spot) error = raw.errors.spot;
  } catch (e) {
    error = String(e.message || e);
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
  return { assets: Object.keys(balances).length, error };
}

async function cycle() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    // lastSync 只算「設定金鑰之後」的同步，換了金鑰就重新開始計
    const { rows } = await db.query(`
      select c."userId", c."apiKeyEnc", c."apiSecretEnc", c."syncHour",
        (select max(s."fetchedAt") from "BinanceSnapshot" s where s."userId" = c."userId" and s."fetchedAt" >= c."keyChangedAt") as "lastSync"
      from "BinanceCredential" c`);
    let synced = 0;
    for (const r of rows) {
      if (!isDue(r.syncHour, r.lastSync)) continue;
      try {
        KEY = decrypt(r.apiKeyEnc);
        SECRET = decrypt(r.apiSecretEnc);
      } catch {
        await db.query(
          `insert into "BinanceSnapshot" (id, "userId", "fetchedAt", balances, error) values ($1, $2, now(), '{}', $3)`,
          [crypto.randomUUID(), r.userId, "金鑰無法解密，請重新設定幣安 API 金鑰"]
        );
        continue;
      }
      const result = await syncUser(db, r.userId);
      KEY = SECRET = "";
      synced++;
      console.log(`[binance-sync] user=${r.userId.slice(0, 8)} assets=${result.assets} error=${result.error ? "yes" : "none"}`);
    }
    if (synced > 0) console.log(`[binance-sync] ${new Date().toISOString()} members=${rows.length} synced=${synced}`);
  } finally {
    await db.end();
  }
}

async function main() {
  if (!PRIVATE_KEY.includes("PRIVATE KEY")) throw new Error("尚未設定 BINANCE_CRED_PRIVATE_KEY");
  console.log(`[binance-sync] started, checking every ${CHECK_EVERY_MS / 60000} minutes`);
  const run = () => cycle().catch((e) => console.error("[binance-sync] cycle failed:", e.message));
  await run();
  setInterval(run, CHECK_EVERY_MS);
}

main().catch((e) => {
  console.error("[binance-sync] failed:", e.message);
  process.exit(1);
});
