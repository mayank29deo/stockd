from fastapi import APIRouter, HTTPException
from services.yahoo_service import get_quote, get_history, get_fundamentals
from services.technical_service import compute_technicals
from services.verdict_service import build_verdict
from services.news_service import get_stock_news
from config import SECTOR_MAP
from routers.quotes import _sector_color

router = APIRouter(prefix="/api/stock", tags=["stock-detail"])


@router.get("/{symbol}")
async def stock_detail(symbol: str):
    """Full stock detail — quote + history + fundamentals + technicals + verdict + news."""
    sym = symbol.upper()

    quote   = get_quote(sym)
    if "error" in quote and "price" not in quote:
        raise HTTPException(status_code=404, detail=f"Stock {sym} not found")

    history = get_history(sym, "1y")
    fund    = get_fundamentals(sym)
    tech    = compute_technicals(history)
    verdict = build_verdict(sym, quote["price"], fund, tech)
    news    = get_stock_news(sym)

    sector = SECTOR_MAP.get(sym, fund.get("sector", "Other"))

    return {
        **quote,
        "name":         fund.get("description", sym)[:80] or sym,
        "sector":       sector,
        "marketCap":    "large" if (fund.get("marketCapCr") or 0) > 20000 else "mid" if (fund.get("marketCapCr") or 0) > 5000 else "small",
        "logo":         sym[:2],
        "color":        _sector_color(sector),
        "weekHigh52":   fund.get("weekHigh52", 0),
        "weekLow52":    fund.get("weekLow52", 0),
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
        "verdict": verdict,
    }


@router.get("/{symbol}/history")
async def stock_history(symbol: str, period: str = "3m"):
    """Price history only — for chart updates without full reload."""
    return get_history(symbol.upper(), period)


@router.get("/{symbol}/technicals")
async def stock_technicals(symbol: str):
    history = get_history(symbol.upper(), "1y")
    return compute_technicals(history)


@router.get("/{symbol}/fundamentals")
async def stock_fundamentals(symbol: str):
    return get_fundamentals(symbol.upper())


@router.get("/{symbol}/verdict")
async def stock_verdict(symbol: str):
    quote   = get_quote(symbol.upper())
    history = get_history(symbol.upper(), "1y")
    fund    = get_fundamentals(symbol.upper())
    tech    = compute_technicals(history)
    return build_verdict(symbol.upper(), quote.get("price", 0), fund, tech)
