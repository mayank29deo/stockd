"""
NSE India service — fetches index data directly from NSE's unofficial API.
No API key required. Works from cloud servers unlike Yahoo Finance ^ tickers.
"""
import requests
import threading
import time
from datetime import datetime, timezone

_lock = threading.Lock()
_session = None
_session_born = 0
_SESSION_TTL = 300  # refresh cookies every 5 min

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
