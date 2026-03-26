from fastapi import APIRouter, Query
from services.nse_service import get_nifty50_quotes
from services.yahoo_service import get_market_status
from services import snapshot_service as snap
import services.eodhd_service as eodhd
import services.rapidapi_yf_service as ryf
import services.yahoo_service as yf_svc
from services.technical_service import compute_technicals
from services.verdict_service import build_verdict
from config import NIFTY50_SYMBOLS, SECTOR_MAP
from cachetools import TTLCache
import threading

router = APIRouter(prefix="/api/screener", tags=["screener"])

_cache = TTLCache(maxsize=5, ttl=180)
_lock  = threading.Lock()


def _get_history(symbol: str) -> list:
    """EODHD → RapidAPI YF → yfinance → snapshot."""
    if eodhd.available():
        h = eodhd.get_history(symbol, "1y")
        if h:
            snap.save_history_snapshot(symbol, "1y", h)
            return h
    if ryf.available():
        h = ryf.get_history(symbol, "1y")
        if h:
            snap.save_history_snapshot(symbol, "1y", h)
            return h
    h = yf_svc.get_history(symbol, "1y")
    if h:
        snap.save_history_snapshot(symbol, "1y", h)
        return h
    return snap.get_history_snapshot(symbol, "1y") or []


def _get_fundamentals(symbol: str) -> dict:
    """EODHD → RapidAPI YF → yfinance → snapshot."""
    if eodhd.available():
        f = eodhd.get_fundamentals(symbol)
        if f and "error" not in f:
            snap.save_fundamentals_snapshot(symbol, f)
            return f
    if ryf.available():
        f = ryf.get_fundamentals(symbol)
        if f and "error" not in f:
            snap.save_fundamentals_snapshot(symbol, f)
            return f
    f = yf_svc.get_fundamentals(symbol)
    if f and "error" not in f:
        snap.save_fundamentals_snapshot(symbol, f)
        return f
    return snap.get_fundamentals_snapshot(symbol) or {}


def _build_all_stocks() -> list:
    """
    Build the full enriched NIFTY50 dataset for screening.
    Uses live NSE quotes (market open) or snapshot (market closed).
    History + fundamentals use EODHD → Twelve Data → yfinance → snapshot.
    """
    market_is_open = get_market_status().get("isOpen", False)

    # Quotes
    if market_is_open:
        nse = get_nifty50_quotes()
        quotes = [nse[s] for s in NIFTY50_SYMBOLS if s in nse] if nse else []
    else:
        quotes = snap.get_all_quotes_snapshot()

    if not quotes:
        # Absolute fallback — try NSE anyway (serves last-traded after hours)
        nse = get_nifty50_quotes()
        quotes = list(nse.values()) if nse else []

    all_stocks = []
    for q in quotes:
        sym = q.get("symbol")
        if not sym or not q.get("price", 0):
            continue
        try:
            history = _get_history(sym)
            fund    = _get_fundamentals(sym)
            tech    = compute_technicals(history)
            verdict = build_verdict(sym, q["price"], fund, tech)
            all_stocks.append({
                **q,
                "sector":       SECTOR_MAP.get(sym, "Other"),
                "fundamentals": fund,
                "technicals":   tech,
                "verdict":      verdict,
                "dataType":     q.get("dataType", "live" if market_is_open else "D1"),
            })
        except Exception:
            pass

    return all_stocks


@router.get("")
async def screener(
    verdict:           str   = Query("all"),
    sector:            str   = Query("all"),
    exchange:          str   = Query("all"),
    max_pe:            float = Query(None),
    min_roe:           float = Query(None),
    max_debt:          float = Query(None),
    min_profit_growth: float = Query(None),
    min_div_yield:     float = Query(None),
    min_change:        float = Query(None),
    max_rsi:           float = Query(None),
    min_rsi:           float = Query(None),
    limit:             int   = Query(50),
):
    """Advanced screener — fundamental + technical + verdict filters."""

    # Serve from in-memory cache (TTL 3 min) to avoid re-fetching on every filter change
    with _lock:
        all_stocks = _cache.get("all_stocks")

    if all_stocks is None:
        all_stocks = _build_all_stocks()
        with _lock:
            _cache["all_stocks"] = all_stocks

    # Apply filters in-memory (fast)
    results = []
    for s in all_stocks:
        f = s.get("fundamentals", {})
        t = s.get("technicals", {})
        v = s.get("verdict", {})

        if verdict != "all" and v.get("action") != verdict.upper():                     continue
        if sector   != "all" and s.get("sector", "").lower() != sector.lower():         continue
        if exchange != "all" and s.get("exchange", "").upper() != exchange.upper():     continue
        if max_pe          and (f.get("pe") or 0)              > max_pe:                continue
        if min_roe         and (f.get("roe") or 0)             < min_roe:               continue
        if max_debt        and (f.get("debtToEquity") or 0)    > max_debt:              continue
        if min_profit_growth and (f.get("profitGrowthYoY") or 0) < min_profit_growth:  continue
        if min_div_yield   and (f.get("dividendYield") or 0)   < min_div_yield:        continue
        if min_change      and (s.get("changePercent") or 0)   < min_change:           continue
        if max_rsi         and (t.get("rsi14") or 50)          > max_rsi:              continue
        if min_rsi         and (t.get("rsi14") or 50)          < min_rsi:              continue

        results.append(s)
        if len(results) >= limit:
            break

    return results
