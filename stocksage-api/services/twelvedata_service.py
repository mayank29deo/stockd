"""
Twelve Data service — reliable market data API for Indian stocks.

Covers:
  - Live quotes for ANY NSE stock (not just NIFTY50)
  - Historical OHLCV (daily, weekly, intraday)
  - Macro tickers: INR/USD, Crude Oil (Brent), Gold (XAU/USD)

Set TWELVEDATA_API_KEY in your .env file.
Plans: Free (800 calls/day) → Basic (~$29/mo, 5k calls/day)
Docs:  https://twelvedata.com/docs

API credit usage per endpoint call:
  - /quote        → 1 credit
  - /time_series  → 1 credit (any output size)
  - /price        → 1 credit
  - Batch /batch  → 1 credit per symbol
"""
import math
import threading
import requests
from datetime import datetime, timezone
from cachetools import TTLCache
from config import TWELVEDATA_API_KEY, HISTORY_CACHE_TTL, FUNDAMENTAL_CACHE_TTL, SECTOR_MAP

_BASE = "https://api.twelvedata.com"
_lock = threading.Lock()
_hist_cache  = TTLCache(maxsize=150, ttl=HISTORY_CACHE_TTL)
_quote_cache = TTLCache(maxsize=300, ttl=60)
_macro_cache = TTLCache(maxsize=5,   ttl=300)   # macro refreshes every 5 min

_SESSION = requests.Session()
_SESSION.headers.update({"Accept": "application/json"})


# ── helpers ───────────────────────────────────────────────────────────────────

def _sf(val, default=None, decimals=2):
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return round(f, decimals)
    except (TypeError, ValueError):
        return default


def _si(val, default=0):
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default


def available() -> bool:
    return bool(TWELVEDATA_API_KEY)


def _get(endpoint: str, params: dict) -> dict | list | None:
    """Generic GET with error handling."""
    try:
        resp = _SESSION.get(
            f"{_BASE}/{endpoint}",
            params={**params, "apikey": TWELVEDATA_API_KEY},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
        # Twelve Data returns {"status": "error", "message": "..."} on bad requests
        if isinstance(data, dict) and data.get("status") == "error":
            print(f"[TwelveData] API error for {endpoint}: {data.get('message')}")
            return None
        return data
    except Exception as e:
        print(f"[TwelveData] Request failed {endpoint}: {e}")
        return None


# ── period → outputsize map ───────────────────────────────────────────────────
_PERIOD_SIZE = {
    "1w":  7,   "5d": 7,
    "1m":  30,  "1mo": 30,
    "3m":  90,  "3mo": 90,
    "6m":  180, "6mo": 180,
    "1y":  365,
    "2y":  730,
    "5y":  1825,
}


# ── quote ─────────────────────────────────────────────────────────────────────

def get_quote(symbol: str) -> dict:
    """
    Live (or last-known) quote for any NSE stock.
    Returns same schema as yahoo_service.get_quote().
    """
    if not TWELVEDATA_API_KEY:
        return {"symbol": symbol.upper(), "error": "TWELVEDATA_API_KEY not set"}

    key = symbol.upper()
    with _lock:
        if key in _quote_cache:
            return _quote_cache[key]

    # Handle M&M → symbol with & can be passed as-is to Twelve Data
    td_symbol = "M&M" if key == "M&M" else key

    data = _get("quote", {"symbol": td_symbol, "exchange": "NSE"})

    if not data:
        result = {"symbol": key, "error": "No data from Twelve Data"}
    else:
        price      = _sf(data.get("close") or data.get("previous_close"), 0)
        prev_close = _sf(data.get("previous_close"), price)
        change     = _sf(data.get("change"), round(price - prev_close, 2))
        change_pct = _sf(data.get("percent_change"), 0)
        w52        = data.get("fifty_two_week", {})

        result = {
            "symbol":        key,
            "name":          data.get("name", key),
            "price":         price,
            "previousClose": prev_close,
            "change":        change,
            "changePercent": change_pct,
            "open":          _sf(data.get("open"), price),
            "high":          _sf(data.get("high"), price),
            "low":           _sf(data.get("low"),  price),
            "volume":        _si(data.get("volume")),
            "avgVolume":     _si(data.get("average_volume")),
            "weekHigh52":    _sf(w52.get("high"), 0),
            "weekLow52":     _sf(w52.get("low"),  0),
            "exchange":      "NSE",
            "currency":      "INR",
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "twelvedata",
        }

    with _lock:
        _quote_cache[key] = result
    return result


# ── history ───────────────────────────────────────────────────────────────────

def get_history(symbol: str, period: str = "1y") -> list:
    """
    Daily OHLCV history for an NSE stock.
    Returns same format as yahoo_service.get_history().
    Data is sorted oldest → newest.
    """
    if not TWELVEDATA_API_KEY:
        return []

    key = f"{symbol.upper()}:{period}"
    with _lock:
        if key in _hist_cache:
            return _hist_cache[key]

    outputsize = _PERIOD_SIZE.get(period.lower(), 365)
    td_symbol  = "M&M" if symbol.upper() == "M&M" else symbol.upper()

    data = _get("time_series", {
        "symbol":     td_symbol,
        "exchange":   "NSE",
        "interval":   "1day",
        "outputsize": outputsize,
        "order":      "ASC",      # oldest first
    })

    if not data or "values" not in data:
        result = []
    else:
        result = [
            {
                "date":   v["datetime"],
                "open":   _sf(v.get("open"),   0),
                "high":   _sf(v.get("high"),   0),
                "low":    _sf(v.get("low"),    0),
                "close":  _sf(v.get("close"),  0),
                "volume": _si(v.get("volume")),
            }
            for v in data["values"]
            if _sf(v.get("close"), None) is not None and _sf(v.get("close"), 0) > 0
        ]

    with _lock:
        _hist_cache[key] = result
    return result


# ── macro tickers ─────────────────────────────────────────────────────────────

def _single_price(symbol: str, exchange: str = "") -> float:
    """Fetch latest close for a single ticker (forex, commodity, etc.)."""
    params = {"symbol": symbol, "interval": "1day", "outputsize": 1}
    if exchange:
        params["exchange"] = exchange
    data = _get("time_series", params)
    if data and "values" in data and data["values"]:
        return _sf(data["values"][0].get("close"), 0) or 0.0
    return 0.0


def get_macro() -> dict:
    """
    Returns live macro indicators using Twelve Data.
    Falls back to safe defaults if API is unavailable.

    India VIX is fetched separately from NSE's free API — see nse_service.py.
    """
    if not TWELVEDATA_API_KEY:
        return {}

    with _lock:
        if "macro" in _macro_cache:
            return _macro_cache["macro"]

    result = {}
    try:
        # Batch quote call — 1 credit per symbol
        # USD/INR, Brent crude, Gold (XAU/USD)
        batch = _get("batch", {
            "symbols":  "USD/INR,BRENT,XAU/USD",
            "interval": "1day",
            "outputsize": 1,
        })

        usd_inr = 0.0
        crude   = 0.0
        xau_usd = 0.0

        if batch and isinstance(batch, dict):
            # Batch response: {"USD/INR": {"values": [...]}, "BRENT": {...}, ...}
            def _batch_price(key):
                entry = batch.get(key, {})
                vals  = entry.get("values", [])
                return _sf(vals[0].get("close"), 0) if vals else 0.0

            usd_inr = _batch_price("USD/INR")
            crude   = _batch_price("BRENT")
            xau_usd = _batch_price("XAU/USD")

        # INR/USD is inverse of USD/INR
        inr_usd = round(1 / usd_inr, 4) if usd_inr > 0 else 0.0
        gold_inr = round(xau_usd * usd_inr, 2) if xau_usd and usd_inr else 0.0

        result = {
            "inrUsd":        inr_usd,
            "usdInr":        round(usd_inr, 2),
            "crudePriceUsd": round(crude, 2),
            "goldPriceInr":  gold_inr,
            "goldPriceUsd":  round(xau_usd, 2),
            "source":        "twelvedata",
        }

    except Exception as e:
        print(f"[TwelveData] Macro fetch error: {e}")
        result = {}

    with _lock:
        _macro_cache["macro"] = result
    return result


# ── index history (for sparklines) ───────────────────────────────────────────

_TD_INDEX_MAP = {
    "NIFTY50":   ("NIFTY",    "NSE"),
    "BANKNIFTY": ("BANKNIFTY","NSE"),
    "NIFTYIT":   ("NIFTYIT",  "NSE"),
    "NIFTYMID":  ("NIFTYMID50","NSE"),
    "SENSEX":    ("SENSEX",   "BSE"),
}


def get_index_history(index_id: str, period: str = "3m") -> list:
    """Fetch index OHLCV history via Twelve Data."""
    if not TWELVEDATA_API_KEY:
        return []
    mapping = _TD_INDEX_MAP.get(index_id.upper())
    if not mapping:
        return []
    td_symbol, exchange = mapping
    outputsize = _PERIOD_SIZE.get(period.lower(), 90)

    data = _get("time_series", {
        "symbol":     td_symbol,
        "exchange":   exchange,
        "interval":   "1day",
        "outputsize": outputsize,
        "order":      "ASC",
    })
    if not data or "values" not in data:
        return []
    return [
        {
            "date":   v["datetime"],
            "open":   _sf(v.get("open"),  0),
            "high":   _sf(v.get("high"),  0),
            "low":    _sf(v.get("low"),   0),
            "close":  _sf(v.get("close"), 0),
            "volume": _si(v.get("volume")),
        }
        for v in data["values"]
        if _sf(v.get("close"), 0) > 0
    ]
