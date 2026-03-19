from fastapi import APIRouter, Query
from services.yahoo_service import get_quotes_bulk, get_history, get_fundamentals
from services.technical_service import compute_technicals
from services.verdict_service import build_verdict
from config import NIFTY50_SYMBOLS, SECTOR_MAP
from cachetools import TTLCache
import threading

router = APIRouter(prefix="/api/screener", tags=["screener"])

_cache = TTLCache(maxsize=5, ttl=180)
_lock  = threading.Lock()


@router.get("")
async def screener(
    verdict:         str   = Query("all"),
    sector:          str   = Query("all"),
    exchange:        str   = Query("all"),
    max_pe:          float = Query(None),
    min_roe:         float = Query(None),
    max_debt:        float = Query(None),
    min_profit_growth: float = Query(None),
    min_div_yield:   float = Query(None),
    min_change:      float = Query(None),
    max_rsi:         float = Query(None),
    min_rsi:         float = Query(None),
    limit:           int   = Query(50),
):
    """Advanced screener with fundamental + technical + verdict filters."""

    # Check cache for unfiltered full dataset
    with _lock:
        if "all_stocks" in _cache:
            all_stocks = _cache["all_stocks"]
        else:
            all_stocks = None

    if all_stocks is None:
        quotes = get_quotes_bulk(NIFTY50_SYMBOLS)
        all_stocks = []
        for q in quotes:
            if "error" in q and "price" not in q:
                continue
            sym     = q["symbol"]
            history = get_history(sym, "1y")
            fund    = get_fundamentals(sym)
            tech    = compute_technicals(history)
            v       = build_verdict(sym, q["price"], fund, tech)
            all_stocks.append({**q, "sector": SECTOR_MAP.get(sym, "Other"), "fundamentals": fund, "technicals": tech, "verdict": v})
        with _lock:
            _cache["all_stocks"] = all_stocks

    # Apply filters
    results = []
    for s in all_stocks:
        f = s.get("fundamentals", {})
        t = s.get("technicals", {})
        v = s.get("verdict", {})

        if verdict != "all" and v.get("action") != verdict.upper():
            continue
        if sector != "all" and s.get("sector", "").lower() != sector.lower():
            continue
        if exchange != "all" and s.get("exchange", "").upper() != exchange.upper():
            continue
        if max_pe        and (f.get("pe") or 0)              > max_pe:          continue
        if min_roe       and (f.get("roe") or 0)             < min_roe:         continue
        if max_debt      and (f.get("debtToEquity") or 0)    > max_debt:        continue
        if min_profit_growth and (f.get("profitGrowthYoY") or 0) < min_profit_growth: continue
        if min_div_yield and (f.get("dividendYield") or 0)   < min_div_yield:   continue
        if min_change    and (s.get("changePercent") or 0)   < min_change:      continue
        if max_rsi       and (t.get("rsi14") or 50)          > max_rsi:         continue
        if min_rsi       and (t.get("rsi14") or 50)          < min_rsi:         continue

        results.append(s)
        if len(results) >= limit:
            break

    return results
