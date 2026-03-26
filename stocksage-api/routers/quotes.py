from fastapi import APIRouter, HTTPException, Query
from services.yahoo_service import get_quote as yf_get_quote, get_quotes_bulk, get_market_status
from services.nse_service import get_nifty50_quotes, get_stock_quote as nse_get_quote
from services import snapshot_service as snap
import services.rapidapi_yf_service as ryf
from config import NIFTY50_SYMBOLS, SECTOR_MAP

router = APIRouter(prefix="/api", tags=["quotes"])


# ── Data-source helpers ───────────────────────────────────────────────────────

def _market_open() -> bool:
    return get_market_status().get("isOpen", False)


def _live_quote(symbol: str) -> dict | None:
    """
    Live quote for ANY NSE stock.
    Chain: NSE batch (NIFTY50) → NSE quote-equity (any stock) → RapidAPI YF → yfinance
    RapidAPI is tried before yfinance because yfinance is blocked on cloud IPs.
    """
    # 1. NSE NIFTY50 batch (fastest, already cached in memory)
    nse_batch = get_nifty50_quotes()
    if symbol in nse_batch:
        return {**nse_batch[symbol], "dataType": "live"}

    # 2. NSE individual quote — works for ALL ~2000 NSE-listed stocks
    q = nse_get_quote(symbol)
    if q and q.get("price", 0) > 0:
        return {**q, "dataType": "live"}

    # 3. RapidAPI Yahoo Finance — cloud-reliable, covers all NSE/BSE stocks
    if ryf.available():
        q = ryf.get_quote(symbol)
        if q and q.get("price", 0) > 0 and "error" not in q:
            return {**q, "dataType": "live"}

    # 4. yfinance last resort (unreliable from cloud)
    q = yf_get_quote(symbol)
    if "price" in q and q.get("price", 0) > 0:
        return {**q, "dataType": "live"}

    return None


def get_best_quote(symbol: str) -> dict:
    """
    Returns the freshest available quote.
      - Market open  → live (NSE batch → yfinance)
      - Market closed → D-1 snapshot, falling back to live as last resort
    """
    sym = symbol.upper()

    if _market_open():
        live = _live_quote(sym)
        if live:
            return live

    # Market closed or live failed — try snapshot first
    cached = snap.get_quote_snapshot(sym)
    if cached:
        return cached  # already tagged dataType: "D1"

    # No snapshot — try RapidAPI (works after hours for any NSE stock)
    if ryf.available():
        q = ryf.get_quote(sym)
        if q and q.get("price", 0) > 0 and "error" not in q:
            return {**q, "dataType": "stale"}

    # Last resort: whatever NSE live returns
    live = _live_quote(sym)
    if live:
        return {**live, "dataType": "stale"}

    return {"symbol": sym, "error": "No data available", "dataType": "unknown"}


# ── Verdict helpers ───────────────────────────────────────────────────────────

def _simple_verdict(sym: str, price: float, change_pct: float,
                    week_high52: float, week_low52: float) -> dict:
    """
    Lightweight verdict using only price-momentum data (no yfinance calls).
    Used by the /api/stocks list endpoint so it works even when Yahoo is blocked.
    """
    score = 0.0
    reasons = []

    if change_pct >= 2:
        score += 3; reasons.append(f"Strong up-move +{change_pct:.1f}% today")
    elif change_pct <= -2:
        score -= 3; reasons.append(f"Sharp drop {change_pct:.1f}% today")
    else:
        score += change_pct * 0.5

    if week_high52 > week_low52:
        position = (price - week_low52) / (week_high52 - week_low52)
        if position < 0.25:
            score += 4; reasons.append("Near 52-week low — oversold zone")
        elif position > 0.85:
            score -= 3; reasons.append("Near 52-week high — stretched valuation")
        elif 0.4 <= position <= 0.65:
            score += 1; reasons.append("Mid-range — balanced price zone")

    action     = "BUY" if score > 1.2 else "SELL" if score < -1.2 else "HOLD"
    confidence = min(88, int(42 + abs(score) * 7))
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


def _sector_color(sector: str) -> str:
    colors = {
        "IT": "#4E9AF1", "Banking": "#A78BFA", "Energy": "#FF6B35",
        "Pharma": "#00C897", "Auto": "#F472B6", "FMCG": "#FFB020",
        "Metals": "#94A3B8", "NBFC": "#FFB020", "Telecom": "#34D399",
        "Cement": "#FB923C", "Infra": "#60A5FA", "Power": "#FBBF24",
        "Healthcare": "#4ADE80", "Insurance": "#818CF8", "Consumer": "#F87171",
    }
    return colors.get(sector, "#FF6B35")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/quote/{symbol}")
async def quote(symbol: str):
    """Single stock quote. Live when market is open, D-1 snapshot when closed."""
    data = get_best_quote(symbol.upper())
    if "error" in data and "price" not in data:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return data


@router.get("/quotes")
async def quotes_bulk(symbols: str = Query(..., description="Comma-separated symbols")):
    """Bulk quotes — e.g. ?symbols=RELIANCE,TCS,INFY"""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="Provide at least one symbol")
    return [get_best_quote(s) for s in symbol_list]


@router.get("/stocks")
async def all_stocks(
    verdict: str = Query("all"),
    sector:  str = Query("all"),
    cap:     str = Query("all"),
    limit:   int = Query(50),
):
    """
    All NIFTY50 stocks with live quotes + lightweight verdict.

    - Market open  → live NSE data
    - Market closed → D-1 snapshot (with dataType: "D1" on each item)
    """
    market_is_open = _market_open()
    raw_quotes: list = []

    if market_is_open:
        # Fetch all 50 in one NSE call
        nse_quotes = get_nifty50_quotes()
        if nse_quotes:
            raw_quotes = [nse_quotes[s] for s in NIFTY50_SYMBOLS[:limit] if s in nse_quotes]
        else:
            # NSE API down — fall back to bulk yfinance
            raw_quotes = [q for q in get_quotes_bulk(NIFTY50_SYMBOLS[:limit])
                          if not ("error" in q and "price" not in q)]
    else:
        # Market closed — use snapshot
        raw_quotes = snap.get_all_quotes_snapshot()
        if not raw_quotes:
            # No snapshot yet (first run after deployment) — try live anyway
            nse_quotes = get_nifty50_quotes()
            if nse_quotes:
                raw_quotes = list(nse_quotes.values())

    results = []
    for q in raw_quotes:
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
                "name":          sym,
                "sector":        sec,
                "marketCap":     "large",
                "logo":          sym[:2],
                "color":         _sector_color(sec),
                "priceHistory":  [],
                "fundamentals":  {},
                "technicals":    {},
                "sentiment":     {"overall": 0, "fearGreedIndex": 55},
                "insiderTrades": [],
                "verdict":       v,
                "dataType":      q.get("dataType", "live" if market_is_open else "D1"),
                "snapshotDate":  q.get("snapshotDate"),
            })
        except Exception:
            pass

    return results


@router.get("/search/{symbol}")
async def search_stock(symbol: str):
    """
    Live quote for ANY NSE-listed stock (search bar).
    Uses NSE quote-equity endpoint — free, real-time, covers all ~2000 NSE stocks.
    """
    sym  = symbol.upper().strip()
    data = get_best_quote(sym)

    if "error" in data and "price" not in data:
        raise HTTPException(status_code=404, detail=f"Stock '{sym}' not found on NSE")

    sec = SECTOR_MAP.get(sym, "Other")
    return {
        **data,
        "name":   data.get("name", sym),
        "sector": sec,
        "logo":   sym[:2],
        "color":  _sector_color(sec),
    }


@router.get("/market/status")
async def market_status():
    """Market open/closed status + last snapshot date for the frontend banner."""
    status = get_market_status()
    last_snap = snap.get_last_snapshot_date()
    return {
        **status,
        "lastSnapshotDate": last_snap,
        "dataType": "live" if status.get("isOpen") else "D1",
    }
