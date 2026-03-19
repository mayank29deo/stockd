from fastapi import APIRouter
from services.news_service import get_market_news
import yfinance as yf
from cachetools import TTLCache
import threading

router = APIRouter(prefix="/api/sentiment", tags=["sentiment"])

_cache = TTLCache(maxsize=10, ttl=300)
_lock  = threading.Lock()


def _fetch_macro() -> dict:
    key = "macro"
    with _lock:
        if key in _cache:
            return _cache[key]

    def safe_price(ticker_str: str) -> float:
        try:
            t    = yf.Ticker(ticker_str)
            hist = t.history(period="2d", interval="1d")
            return round(float(hist["Close"].iloc[-1]), 2) if not hist.empty else 0.0
        except Exception:
            return 0.0

    result = {
        "inrUsd":        safe_price("INR=X"),
        "crudePriceUsd": safe_price("BZ=F"),
        "goldPriceInr":  safe_price("GC=F") * safe_price("INR=X"),  # Gold in USD × INR/USD
        "indiaVix":      safe_price("^INDIAVIX"),
        "repoRate":      6.25,     # Updated manually / via RBI scraper
        "nextRbiDate":   "2026-06-06",
    }

    # Compute simple Fear & Greed proxy:
    # VIX > 20 = fear, < 12 = greed, 12-20 = neutral
    vix = result["indiaVix"] or 14
    if vix > 25:   fg = 20
    elif vix > 20: fg = 35
    elif vix > 15: fg = 50
    elif vix > 12: fg = 65
    else:          fg = 80
    result["fearGreedIndex"] = fg
    result["fearGreedLabel"] = (
        "Extreme Greed" if fg >= 75 else "Greed" if fg >= 55 else
        "Neutral" if fg >= 45 else "Fear" if fg >= 25 else "Extreme Fear"
    )

    # FII/DII placeholder (would need NSDL scraper for real data)
    result["fiiNetFlowCr"] = 3240
    result["diiNetFlowCr"] = -1820
    result["description"]  = (
        "Markets in greed zone driven by FII inflows and strong macro data. "
        "Remain cautious on overextended large caps."
    )

    with _lock:
        _cache[key] = result
    return result


@router.get("/market")
async def market_sentiment():
    """India market mood — Fear & Greed, macro indicators."""
    macro = _fetch_macro()
    news  = get_market_news()
    return {**macro, "geopoliticalNews": news[:6]}


@router.get("/geopolitical")
async def geopolitical():
    return get_market_news()


@router.get("/fear-greed")
async def fear_greed():
    macro = _fetch_macro()
    return {
        "value":       macro["fearGreedIndex"],
        "label":       macro["fearGreedLabel"],
        "description": macro["description"],
    }
