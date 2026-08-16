"""
永豐證券 Shioaji 即時報價閘道：只負責一件事——給股票代碼、回傳即時報價快照。
K線歷史資料、法人買賣超仍走原本的 Yahoo Finance／證交所公開資料（見主專案），
Shioaji 只有分鐘K棒、沒有日線彙總，法人資料也沒有提供，換了反而更複雜。

這個服務獨立部署（Next.js 是 Node.js，沒辦法直接呼叫 Shioaji 的 Python SDK），
用共用密鑰(GATEWAY_SECRET)保護，避免被公開濫用去打真實的證券帳號連線。
"""

import logging
import os
from contextlib import asynccontextmanager
from threading import Lock

import shioaji as sj
from fastapi import FastAPI, Header, HTTPException

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("shioaji-gateway")

API_KEY = os.environ["SHIOAJI_API_KEY"]
SECRET_KEY = os.environ["SHIOAJI_SECRET_KEY"]
GATEWAY_SECRET = os.environ["GATEWAY_SECRET"]

_api: sj.Shioaji | None = None
_login_lock = Lock()


def get_client() -> sj.Shioaji:
    global _api
    with _login_lock:
        if _api is not None:
            return _api
        client = sj.Shioaji(simulation=False)
        client.login(api_key=API_KEY, secret_key=SECRET_KEY)
        logger.info("shioaji logged in")
        _api = client
        return _api


def reset_client() -> None:
    global _api
    with _login_lock:
        if _api is not None:
            try:
                _api.logout()
            except Exception:
                pass
        _api = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_client()
    except Exception:
        logger.exception("initial shioaji login failed, will retry lazily on first request")
    yield
    reset_client()


app = FastAPI(lifespan=lifespan)


def check_auth(x_gateway_secret: str | None) -> None:
    if x_gateway_secret != GATEWAY_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"ok": True, "loggedIn": _api is not None}


@app.get("/quote/{code}")
def quote(code: str, x_gateway_secret: str | None = Header(default=None)):
    check_auth(x_gateway_secret)

    try:
        client = get_client()
        contract = client.Contracts.Stocks[code]
    except KeyError:
        raise HTTPException(status_code=404, detail="查無此股票代碼")
    except Exception as e:
        # 連線可能中斷了，清掉重試一次
        reset_client()
        logger.exception("login/contract lookup failed")
        raise HTTPException(status_code=502, detail=str(e))

    try:
        snaps = client.snapshots([contract])
    except Exception as e:
        reset_client()
        logger.exception("snapshots call failed")
        raise HTTPException(status_code=502, detail=str(e))

    if not snaps:
        raise HTTPException(status_code=404, detail="目前沒有可用的即時報價")

    s = snaps[0]
    return {
        "code": s.code,
        "market": "TW" if contract.exchange == "TSE" else "TWO",
        "open": s.open,
        "high": s.high,
        "low": s.low,
        "close": s.close,
        "changePrice": s.change_price,
        "changeRate": s.change_rate,
        "volume": s.total_volume,
        "buyPrice": s.buy_price,
        "sellPrice": s.sell_price,
        "ts": s.ts,
    }
