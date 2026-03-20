from fastapi import APIRouter, HTTPException, Query
from services.yahoo_service import get_quote, get_quotes_bulk, get_market_status
from services.nse_service import get_nifty50_quotes
from config import NIFTY50_SYMBOLS, SECTOR_MAP

router = APIRouter(prefix="/api", tags=["quotes"])


@router.get("/quote/{symbol}")
async def quote(symbol: str):
    """Single stock quote with live price."""
    data = get_quote(symbol.upper())
    if "error" in data and "price" not in data:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for {symbol}")
    return data


@router.get("/quotes")
async def quotes_bulk(symbols: str = Query(..., description="Comma-separated symbols")):
    """Bulk quotes — e.g. ?symbols=RELIANCE,TCS,INFY"""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="Provide at least one symbol")
    return get_quotes_bulk(symbol_list)


def _simple_verdict(sym: str, price: float, change_pct: float,
                    week_high52: float, week_low52: float) -> dict:
    """
    Lightweight verdict using only price-momentum data (no yfinance calls).
    Used by the list endpoint so it works even when Yahoo Finance is blocked.
    """
    score = 0.0
    reasons = []

    # 1. Day momentum
    if change_pct >= 2:
        score += 3; reasons.append(f"Strong up-move +{change_pct:.1f}% today")
    elif change_pct <= -2:
        score -= 3; reasons.append(f"Sharp drop {change_pct:.1f}% today")
    else:
        score += change_pct * 0.5

    # 2. 52-week position (where is price in the range?)
    if week_high52 > week_low52:
        position = (price - week_low52) / (week_high52 - week_low52)  # 0=low, 1=high
        if position < 0.25:
            score += 4; reasons.append("Near 52-week low — oversold zone")
        elif position > 0.85:
            score -= 3; reasons.append("Near 52-week high — stretched valuation")
        elif 0.4 <= position <= 0.65:
            score += 1; reasons.append("Mid-range — balanced price zone")

    action     = "BUY" if score > 2 else "SELL" if score < -2 else "HOLD"
    confidence = min(85, int(40 + abs(score) * 6))
    target_mult = 1.12 if action == "BUY" else 0.90 if action == "SELL" else 1.04
    stop_mult   = 0.93 if action == "BUY" else 1.05 if action == "SELL" else 0.96

    return {
        "action":      action,
        "confidence":  confidence,
        "targetPrice": round(price * target_mult, 2),
        "stopLoss":    round(price * stop_mult, 2),
        "timeHorizon": "short",
        "composite":   round(score * 10, 2),
        "reasoning": [
            {"factor": "technical",    "score": round(score, 2), "weight": 0.30,
             "summary": reasons[0] if reasons else "Price momentum analysis",
             "signal": "positive" if score > 0 else "negative" if score < 0 else "neutral"},
            {"factor": "fundamental",  "score": 0, "weight": 0.25,
             "summary": "Fundamentals not loaded in list view", "signal": "neutral"},
            {"factor": "sentiment",    "score": 0, "weight": 0.20,
             "summary": "Sentiment data pending", "signal": "neutral"},
            {"factor": "geopolitical", "score": 0, "weight": 0.15,
             "summary": "Geo data pending", "signal": "neutral"},
            {"factor": "insider",      "score": 0, "weight": 0.10,
             "summary": "Insider data pending", "signal": "neutral"},
        ],
        "analystCount": 0,
    }


@router.get("/stocks")
async def all_stocks(
    verdict: str = Query("all"),
    sector:  str = Query("all"),
    cap:     str = Query("all"),
    limit:   int = Query(50),
):
    """
    Returns all NIFTY50 stocks with live quotes and a lightweight verdict.
    Uses NSE India API only (no per-stock yfinance calls) so it works from
    cloud servers where Yahoo Finance is IP-blocked.
    """
    # Fetch all quotes in one NSE call (fast, no per-stock calls)
    nse_quotes = get_nifty50_quotes()
    if nse_quotes:
        quotes = [nse_quotes[s] for s in NIFTY50_SYMBOLS[:limit] if s in nse_quotes]
    else:
        quotes = [q for q in get_quotes_bulk(NIFTY50_SYMBOLS[:limit])
                  if not ("error" in q and "price" not in q)]

    results = []
    for q in quotes:
        try:
            sym        = q["symbol"]
            price      = q.get("price", 0)
            change_pct = q.get("changePercent", 0)
            w52h       = q.get("weekHigh52", 0)
            w52l       = q.get("weekLow52", 0)
            sec        = SECTOR_MAP.get(sym, "Other")
            v          = _simple_verdict(sym, price, change_pct, w52h, w52l)

            if verdict != "all" and v["action"] != verdict.upper():
                continue
            if sector != "all" and sec.lower() != sector.lower():
                continue

            results.append({
                **q,
                "name":         sym,
                "sector":       sec,
                "marketCap":    "large",   # NIFTY50 are all large-cap
                "logo":         sym[:2],
                "color":        _sector_color(sec),
                "priceHistory": [],        # loaded on detail page
                "fundamentals": {},
                "technicals":   {},
                "sentiment":    {"overall": 0, "fearGreedIndex": 55},
                "insiderTrades": [],
                "verdict":      v,
            })
        except Exception:
            pass

    return results


@router.get("/search/{symbol}")
async def search_stock(symbol: str):
    """
    Fetch live quote for ANY NSE stock by symbol — not limited to Nifty50.
    Used by the search bar to support stocks like PAYTM, ZOMATO, NYKAA etc.
    """
    from services.yahoo_service import get_fundamentals
    sym = symbol.upper().strip()
    data = get_quote(sym)
    if "error" in data and "price" not in data:
        raise HTTPException(status_code=404, detail=f"Stock '{sym}' not found on NSE")
    fund = get_fundamentals(sym)
    return {
        **data,
        "name":    fund.get("description", "")[:80] or sym,
        "sector":  SECTOR_MAP.get(sym, fund.get("sector", "Other")),
        "logo":    sym[:2],
        "color":   _sector_color(SECTOR_MAP.get(sym, fund.get("sector", "Other"))),
    }


@router.get("/market/status")
async def market_status():
    return get_market_status()


def _sector_color(sector: str) -> str:
    colors = {
        "IT": "#4E9AF1", "Banking": "#A78BFA", "Energy": "#FF6B35",
        "Pharma": "#00C897", "Auto": "#F472B6", "FMCG": "#FFB020",
        "Metals": "#94A3B8", "NBFC": "#FFB020", "Telecom": "#34D399",
        "Cement": "#FB923C", "Infra": "#60A5FA", "Power": "#FBBF24",
        "Healthcare": "#4ADE80", "Insurance": "#818CF8", "Consumer": "#F87171",
    }
    return colors.get(sector, "#FF6B35")
