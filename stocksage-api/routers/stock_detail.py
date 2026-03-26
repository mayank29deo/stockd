from fastapi import APIRouter, HTTPException
from services.yahoo_service import get_market_status
from services import snapshot_service as snap
import services.eodhd_service as eodhd
import services.rapidapi_yf_service as ryf
import services.yahoo_service as yf_svc
from services.technical_service import compute_technicals
from services.verdict_service import build_verdict
from services.news_service import get_stock_news
from config import SECTOR_MAP
from routers.quotes import _sector_color, get_best_quote
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=8)

router = APIRouter(prefix="/api/stock", tags=["stock-detail"])


# ── Data helpers — layered fallback chain ─────────────────────────────────────
#
#  History:      EODHD → Twelve Data → yfinance → snapshot
#  Fundamentals: EODHD → yfinance → snapshot
#  Quote:        get_best_quote() handles NSE → TD → yfinance → snapshot
#
# Each successful result is persisted to snapshot so market-closed calls
# never go empty.

def _get_history(symbol: str, period: str = "1y") -> list:
    # 1. EODHD (best quality, paid — when subscribed)
    if eodhd.available():
        h = eodhd.get_history(symbol, period)
        if h:
            snap.save_history_snapshot(symbol, period, h)
            return h

    # 2. RapidAPI Yahoo Finance (same as yfinance but cloud-reliable)
    if ryf.available():
        h = ryf.get_history(symbol, period)
        if h:
            snap.save_history_snapshot(symbol, period, h)
            return h

    # 3. yfinance direct (unreliable from cloud, last live attempt)
    h = yf_svc.get_history(symbol, period)
    if h:
        snap.save_history_snapshot(symbol, period, h)
        return h

    # 4. Snapshot (D-1 cached — always available after first snapshot)
    return snap.get_history_snapshot(symbol, period) or []


def _get_fundamentals(symbol: str) -> dict:
    # 1. EODHD (richest fundamental data — when subscribed)
    if eodhd.available():
        f = eodhd.get_fundamentals(symbol)
        if f and "error" not in f:
            snap.save_fundamentals_snapshot(symbol, f)
            return f

    # 2. RapidAPI Yahoo Finance (cloud-reliable, same as yfinance)
    if ryf.available():
        f = ryf.get_fundamentals(symbol)
        if f and "error" not in f:
            snap.save_fundamentals_snapshot(symbol, f)
            return f

    # 3. yfinance direct (unreliable from cloud)
    f = yf_svc.get_fundamentals(symbol)
    if f and "error" not in f:
        snap.save_fundamentals_snapshot(symbol, f)
        return f

    # 4. Snapshot
    return snap.get_fundamentals_snapshot(symbol) or {}


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/{symbol}")
async def stock_detail(symbol: str):
    """
    Full stock detail — quote + history + fundamentals + technicals + verdict + news.
    Always returns data: live when market is open, D-1 snapshot when closed.
    """
    sym = symbol.upper()

    loop = asyncio.get_event_loop()

    # Quote must come first (history/fund can run in parallel after)
    quote = get_best_quote(sym)
    if "error" in quote and "price" not in quote:
        if sym not in SECTOR_MAP:
            raise HTTPException(status_code=404, detail=f"Stock {sym} not found")
        quote = {"symbol": sym, "price": None, "dataType": "unavailable"}

    # Fetch history, fundamentals and news in parallel — saves ~60% backend latency
    history_fut = loop.run_in_executor(_executor, _get_history, sym, "1y")
    fund_fut    = loop.run_in_executor(_executor, _get_fundamentals, sym)
    news_fut    = loop.run_in_executor(_executor, get_stock_news, sym)

    history, fund, news = await asyncio.gather(history_fut, fund_fut, news_fut)

    tech    = compute_technicals(history)
    verdict = build_verdict(sym, quote.get("price", 0), fund, tech)

    sector = SECTOR_MAP.get(sym, fund.get("sector", "Other"))
    market_is_open = get_market_status().get("isOpen", False)

    return {
        **quote,
        "name":         fund.get("description", sym)[:80] or sym,
        "sector":       sector,
        "marketCap":    "large" if (fund.get("marketCapCr") or 0) > 20000
                        else "mid" if (fund.get("marketCapCr") or 0) > 5000 else "small",
        "logo":         sym[:2],
        "color":        _sector_color(sector),
        "weekHigh52":   fund.get("weekHigh52") or quote.get("weekHigh52", 0),
        "weekLow52":    fund.get("weekLow52")  or quote.get("weekLow52", 0),
        "avgVolume":    fund.get("avgVolume", 0),
        "priceHistory": history,
        "fundamentals": fund,
        "technicals":   tech,
        "sentiment": {
            "overall": 25, "news": 20, "social": 28, "analyst": 30,
            "geopolitical": 18, "fearGreedIndex": 55,
            "newsItems": news[:4],
        },
        "insiderTrades": [],
        "verdict":       verdict,
        "dataType":      quote.get("dataType", "live" if market_is_open else "D1"),
        "snapshotDate":  quote.get("snapshotDate"),
    }


@router.get("/{symbol}/history")
async def stock_history(symbol: str, period: str = "3m"):
    """Price history for the chart. Tries EODHD → yfinance → snapshot."""
    return _get_history(symbol.upper(), period)


@router.get("/{symbol}/technicals")
async def stock_technicals(symbol: str):
    history = _get_history(symbol.upper(), "1y")
    return compute_technicals(history)


@router.get("/{symbol}/fundamentals")
async def stock_fundamentals(symbol: str):
    return _get_fundamentals(symbol.upper())


@router.get("/{symbol}/verdict")
async def stock_verdict(symbol: str):
    sym     = symbol.upper()
    quote   = get_best_quote(sym)
    history = _get_history(sym, "1y")
    fund    = _get_fundamentals(sym)
    tech    = compute_technicals(history)
    return build_verdict(sym, quote.get("price", 0), fund, tech)
