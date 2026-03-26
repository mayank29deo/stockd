"""
NSE India service — fetches live data directly from NSE's unofficial API.
No API key required. Works from cloud servers unlike Yahoo Finance.

Covers:
  - NIFTY50 batch quotes (all 50 in one call)
  - ANY NSE-listed stock live quote (quote-equity endpoint)
  - All major indices including India VIX
"""
import requests
import threading
import time
from datetime import datetime, timezone
from cachetools import TTLCache

_lock = threading.Lock()
_session = None
_session_born = 0
_SESSION_TTL = 300  # refresh cookies every 5 min

# Per-symbol quote cache — 60s TTL (live during market hours)
_quote_cache = TTLCache(maxsize=500, ttl=60)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://www.nseindia.com/",
}

# Our index IDs → NSE index names in the API response
_NSE_INDEX_MAP = {
    "NIFTY50":   "NIFTY 50",
    "BANKNIFTY": "NIFTY BANK",
    "NIFTYIT":   "NIFTY IT",
    "NIFTYMID":  "NIFTY MIDCAP 50",
}

# VIX name as it appears in NSE allIndices response
_VIX_NAME = "INDIA VIX"


def _get_session() -> requests.Session:
    global _session, _session_born
    with _lock:
        if _session and (time.time() - _session_born) < _SESSION_TTL:
            return _session
        s = requests.Session()
        s.headers.update(_HEADERS)
        try:
            # Hit homepage first to pick up cookies (required by NSE)
            s.get("https://www.nseindia.com", timeout=10)
            time.sleep(0.3)
        except Exception:
            pass
        _session = s
        _session_born = time.time()
        return s


def get_nifty50_quotes() -> dict:
    """
    Fetch all NIFTY 50 stock quotes in one NSE API call.
    Returns dict keyed by symbol: {"RELIANCE": {price, change, ...}, ...}
    """
    try:
        session = _get_session()
        resp = session.get(
            "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050",
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("data", [])

        result = {}
        for item in items:
            sym = item.get("symbol", "")
            if not sym:
                continue
            price      = float(item.get("lastPrice", 0) or 0)
            prev_close = float(item.get("previousClose", 0) or 0)
            change     = float(item.get("change", 0) or 0)
            change_pct = float(item.get("pChange", 0) or 0)
            if price == 0:
                continue
            result[sym] = {
                "symbol":        sym,
                "price":         round(price, 2),
                "previousClose": round(prev_close, 2),
                "change":        round(change, 2),
                "changePercent": round(change_pct, 2),
                "open":          float(item.get("open", price) or price),
                "high":          float(item.get("dayHigh", price) or price),
                "low":           float(item.get("dayLow", price) or price),
                "volume":        int(item.get("totalTradedVolume", 0) or 0),
                "weekHigh52":    float(item.get("yearHigh", 0) or 0),
                "weekLow52":     float(item.get("yearLow", 0) or 0),
                "exchange":      "NSE",
                "currency":      "INR",
                "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            }
        return result
    except Exception:
        return {}


def get_india_vix() -> float:
    """
    Returns India VIX value from NSE allIndices — completely free, no API key.
    Falls back to 15.0 (neutral) if unavailable.
    """
    try:
        session = _get_session()
        resp = session.get("https://www.nseindia.com/api/allIndices", timeout=10)
        resp.raise_for_status()
        items = resp.json().get("data", [])
        for item in items:
            if item.get("index") == _VIX_NAME:
                return float(item.get("last", 15.0) or 15.0)
    except Exception:
        pass
    return 15.0


def get_stock_quote(symbol: str) -> dict | None:
    """
    Live quote for ANY NSE-listed stock — not just NIFTY50.
    Works for PAYTM, ZOMATO, NYKAA, IRFC, and all ~2000 NSE-listed equities.

    Returns same schema as get_nifty50_quotes() values, or None on failure.
    NSE endpoint: /api/quote-equity?symbol=SYMBOL
    """
    sym = symbol.upper().strip()

    with _lock:
        if sym in _quote_cache:
            return _quote_cache[sym]

    try:
        session = _get_session()
        resp = session.get(
            "https://www.nseindia.com/api/quote-equity",
            params={"symbol": sym},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        price_info = data.get("priceInfo", {})
        meta       = data.get("metadata", {})
        info       = data.get("info", {})
        week_hl    = price_info.get("weekHighLow", {})
        day_hl     = price_info.get("intraDayHighLow", {})

        price      = float(price_info.get("lastPrice", 0) or 0)
        prev_close = float(price_info.get("previousClose", 0) or 0)
        change     = float(price_info.get("change", 0) or 0)
        change_pct = float(price_info.get("pChange", 0) or 0)

        if price == 0:
            return None

        result = {
            "symbol":        sym,
            "name":          info.get("companyName", sym),
            "price":         round(price, 2),
            "previousClose": round(prev_close, 2),
            "change":        round(change, 2),
            "changePercent": round(change_pct, 2),
            "open":          float(price_info.get("open", price) or price),
            "high":          float(day_hl.get("max", price) or price),
            "low":           float(day_hl.get("min", price) or price),
            "volume":        int(meta.get("totalTradedVolume", 0) or 0),
            "weekHigh52":    float(week_hl.get("max", 0) or 0),
            "weekLow52":     float(week_hl.get("min", 0) or 0),
            "exchange":      "NSE",
            "currency":      "INR",
            "isin":          meta.get("isin", ""),
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "nse",
        }

        with _lock:
            _quote_cache[sym] = result
        return result

    except Exception:
        return None


def get_nse_indices() -> dict:
    """
    Returns dict keyed by our index IDs with live values from NSE India.
    e.g. {"NIFTY50": {"id": "NIFTY50", "value": 22485.35, ...}, ...}
    """
    try:
        session = _get_session()
        resp = session.get(
            "https://www.nseindia.com/api/allIndices",
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("data", [])

        result = {}
        for item in items:
            nse_name = item.get("index", "")
            for our_id, mapped_name in _NSE_INDEX_MAP.items():
                if nse_name == mapped_name:
                    value      = float(item.get("last", 0) or 0)
                    prev_close = float(item.get("previousClose", 0) or 0)
                    change     = float(item.get("variation", 0) or 0)
                    change_pct = float(item.get("percentChange", 0) or 0)
                    result[our_id] = {
                        "id":            our_id,
                        "name":          mapped_name,
                        "exchange":      "NSE",
                        "value":         round(value, 2),
                        "change":        round(change, 2),
                        "changePercent": round(change_pct, 2),
                        "open":          float(item.get("open", value) or value),
                        "high":          float(item.get("high", value) or value),
                        "low":           float(item.get("low",  value) or value),
                        "previousClose": round(prev_close, 2),
                        "lastUpdated":   datetime.now(timezone.utc).isoformat(),
                    }
                    break
        return result
    except Exception:
        return {}
