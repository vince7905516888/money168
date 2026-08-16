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
from datetime import date as date_cls
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
        # 快照裡原本沒用到的欄位：均價、成交值、委買賣量、量比、昨量、內外盤別（最近一筆是外盤/內盤）
        "averagePrice": s.average_price,
        "totalAmount": s.total_amount,
        "buyVolume": s.buy_volume,
        "sellVolume": s.sell_volume,
        "volumeRatio": s.volume_ratio,
        "yesterdayVolume": s.yesterday_volume,
        "tickType": getattr(s.tick_type, "value", str(s.tick_type)),
    }


@app.get("/scanners/volume")
def scanners_volume(x_gateway_secret: str | None = Header(default=None)):
    """即時成交量排行（全市場前15名）：跟主專案用證交所T86做的「買賣超前15名」不一樣，
    T86是收盤後才有的三大法人籌碼資料，這裡是盤中即時的成交量排行。"""
    check_auth(x_gateway_secret)

    try:
        client = get_client()
        result = client.scanners(scanner_type=sj.constant.ScannerType.VolumeRank, count=15)
    except Exception as e:
        reset_client()
        logger.exception("scanners call failed")
        raise HTTPException(status_code=502, detail=str(e))

    return [
        {
            "code": r.code,
            "name": r.name.strip(),
            "close": r.close,
            "changePrice": r.change_price,
            "volume": r.volume,
            "totalVolume": r.total_volume,
        }
        for r in result
    ]


@app.get("/kbars/{code}")
def kbars(code: str, date: str | None = None, x_gateway_secret: str | None = Header(default=None)):
    """今日走勢圖用的1分鐘K棒（Shioaji唯一提供的K棒粒度，沒有日線/週線彙總，
    這裡只拿來畫「當天」走勢，多天的K線圖仍然是Yahoo Finance那條路）。"""
    check_auth(x_gateway_secret)

    try:
        client = get_client()
        contract = client.Contracts.Stocks[code]
    except KeyError:
        raise HTTPException(status_code=404, detail="查無此股票代碼")
    except Exception as e:
        reset_client()
        logger.exception("login/contract lookup failed")
        raise HTTPException(status_code=502, detail=str(e))

    target_date = date or date_cls.today().isoformat()
    try:
        bars = client.kbars(contract, start=target_date, end=target_date)
    except Exception as e:
        reset_client()
        logger.exception("kbars call failed")
        raise HTTPException(status_code=502, detail=str(e))

    ts = bars.ts
    if not ts:
        raise HTTPException(status_code=404, detail="目前沒有可用的當日走勢資料")

    return [
        {
            "ts": ts[i],
            "open": bars.Open[i],
            "high": bars.High[i],
            "low": bars.Low[i],
            "close": bars.Close[i],
            "volume": bars.Volume[i],
        }
        for i in range(len(ts))
    ]


@app.get("/tick-ratio/{code}")
def tick_ratio(code: str, date: str | None = None, x_gateway_secret: str | None = Header(default=None)):
    """內外盤比：逐筆成交(ticks)在這裡就近算好聚合結果才回傳，不把整天上萬筆原始資料丟給前端。
    tick_type: 1=外盤(以賣方報價成交，買方主動)、2=內盤(以買方報價成交，賣方主動)。"""
    check_auth(x_gateway_secret)

    try:
        client = get_client()
        contract = client.Contracts.Stocks[code]
    except KeyError:
        raise HTTPException(status_code=404, detail="查無此股票代碼")
    except Exception as e:
        reset_client()
        logger.exception("login/contract lookup failed")
        raise HTTPException(status_code=502, detail=str(e))

    target_date = date or date_cls.today().isoformat()
    try:
        ticks = client.ticks(contract, date=target_date)
    except Exception as e:
        reset_client()
        logger.exception("ticks call failed")
        raise HTTPException(status_code=502, detail=str(e))

    tick_types = ticks.tick_type
    volumes = ticks.volume
    if not tick_types:
        raise HTTPException(status_code=404, detail="目前沒有可用的逐筆成交資料")

    buy_volume = sum(v for t, v in zip(tick_types, volumes) if t == 1)
    sell_volume = sum(v for t, v in zip(tick_types, volumes) if t == 2)
    total = buy_volume + sell_volume

    return {
        "date": target_date,
        "buyVolume": buy_volume,
        "sellVolume": sell_volume,
        "buyRatio": (buy_volume / total * 100) if total > 0 else None,
        "tickCount": len(tick_types),
    }
