"""
Yahoo Finance via RapidAPI — cloud-reliable replacement for direct yfinance.

Yahoo Finance blocks bare cloud-server IPs. RapidAPI proxies the same
requests through their infrastructure, which Yahoo allows.
Data is 100% identical to yfinance — same tickers, same fields.

Provider: apidojo/yahoo-finance1 (most popular, 500k+ users)
Sign up:  https://rapidapi.com/apidojo/api/yahoo-finance1
Plans:    Free (100 req/day) → Basic ~$10/month (500 req/day)
          Basic is enough for our cached architecture.

NSE tickers: RELIANCE.NS, TCS.NS, HDFCBANK.NS  (same as yfinance)
"""
import math
import threading
from datetime import datetime, timezone, date
import requests
from cachetools import TTLCache
from config import RAPIDAPI_KEY, HISTORY_CACHE_TTL, FUNDAMENTAL_CACHE_TTL, SECTOR_MAP, SYMBOL_ALIAS_MAP

_HOST    = "apidojo-yahoo-finance-v1.p.rapidapi.com"
_BASE    = f"https://{_HOST}"
_lock    = threading.Lock()
_hist_cache  = TTLCache(maxsize=150, ttl=HISTORY_CACHE_TTL)
_fund_cache  = TTLCache(maxsize=100, ttl=FUNDAMENTAL_CACHE_TTL)
_quote_cache = TTLCache(maxsize=300, ttl=60)

_SESSION = requests.Session()


def _headers() -> dict:
    return {
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": _HOST,
    }


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


def _ticker(symbol: str) -> str:
    """Plain NSE symbol → Yahoo Finance ticker. Handles renames and aliases."""
    s = symbol.upper().strip()
    if s.endswith(".NS") or s.endswith(".BO"):
        return s
    # Check alias map first (covers renamed/rebranded companies)
    if s in SYMBOL_ALIAS_MAP:
        return SYMBOL_ALIAS_MAP[s]
    if s == "M&M":
        return "M%26M.NS"
    return f"{s}.NS"


def available() -> bool:
    return bool(RAPIDAPI_KEY)


def _get(path: str, params: dict) -> dict | None:
    """Generic GET with error handling."""
    try:
        resp = _SESSION.get(
            f"{_BASE}{path}",
            headers=_headers(),
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[RapidAPI-YF] {path} failed: {e}")
        return None


# ── quote ─────────────────────────────────────────────────────────────────────

def get_quote(symbol: str) -> dict:
    """
    Live quote for any NSE stock.
    Same return schema as yahoo_service.get_quote().
    """
    if not RAPIDAPI_KEY:
        return {"symbol": symbol.upper(), "error": "RAPIDAPI_KEY not set"}

    key = symbol.upper()
    with _lock:
        if key in _quote_cache:
            return _quote_cache[key]

    data = _get("/market/v2/get-quotes", {
        "symbols": _ticker(symbol),
        "region":  "IN",
        "lang":    "en-US",
    })

    result: dict
    try:
        q = data["quoteResponse"]["result"][0]
        price      = _sf(q.get("regularMarketPrice"), 0)
        prev_close = _sf(q.get("regularMarketPreviousClose"), price)
        change     = _sf(q.get("regularMarketChange"), round(price - prev_close, 2))
        change_pct = _sf(q.get("regularMarketChangePercent"), 0)

        result = {
            "symbol":        key,
            "name":          q.get("longName") or q.get("shortName") or key,
            "price":         price,
            "previousClose": prev_close,
            "change":        change,
            "changePercent": change_pct,
            "open":          _sf(q.get("regularMarketOpen"), price),
            "high":          _sf(q.get("regularMarketDayHigh"), price),
            "low":           _sf(q.get("regularMarketDayLow"),  price),
            "volume":        _si(q.get("regularMarketVolume")),
            "avgVolume":     _si(q.get("averageDailyVolume3Month")),
            "weekHigh52":    _sf(q.get("fiftyTwoWeekHigh"), 0),
            "weekLow52":     _sf(q.get("fiftyTwoWeekLow"),  0),
            "marketCap":     _si(q.get("marketCap")),
            "exchange":      "NSE",
            "currency":      "INR",
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "rapidapi-yf",
        }
    except Exception as e:
        result = {"symbol": key, "error": f"Parse error: {e}"}

    with _lock:
        _quote_cache[key] = result
    return result


# ── history ───────────────────────────────────────────────────────────────────

_RANGE_MAP = {
    "1w": "5d",   "5d":  "5d",
    "1m": "1mo",  "1mo": "1mo",
    "3m": "3mo",  "3mo": "3mo",
    "6m": "6mo",  "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
}


def get_history(symbol: str, period: str = "1y") -> list:
    """
    Daily OHLCV history for any NSE stock.
    Same return format as yahoo_service.get_history().
    Sorted oldest → newest.
    """
    if not RAPIDAPI_KEY:
        return []

    key = f"{symbol.upper()}:{period}"
    with _lock:
        if key in _hist_cache:
            return _hist_cache[key]

    yf_range = _RANGE_MAP.get(period.lower(), "1y")

    data = _get("/stock/v2/get-chart", {
        "symbol":          _ticker(symbol),
        "range":           yf_range,
        "interval":        "1d",
        "region":          "IN",
        "lang":            "en-US",
        "includePrePost":  "false",
    })

    result = []
    try:
        chart  = data["chart"]["result"][0]
        ts     = chart.get("timestamp", [])
        quotes = chart["indicators"]["quote"][0]
        adj    = chart["indicators"].get("adjclose", [{}])[0].get("adjclose", [])

        opens   = quotes.get("open",   [])
        highs   = quotes.get("high",   [])
        lows    = quotes.get("low",    [])
        closes  = quotes.get("close",  [])
        volumes = quotes.get("volume", [])

        for i, t in enumerate(ts):
            close = _sf(adj[i] if adj and i < len(adj) else closes[i] if i < len(closes) else None, None)
            if close is None or close == 0:
                continue
            result.append({
                "date":   str(date.fromtimestamp(t)),
                "open":   _sf(opens[i]   if i < len(opens)   else None, 0),
                "high":   _sf(highs[i]   if i < len(highs)   else None, 0),
                "low":    _sf(lows[i]    if i < len(lows)    else None, 0),
                "close":  close,
                "volume": _si(volumes[i] if i < len(volumes) else None),
            })
    except Exception as e:
        print(f"[RapidAPI-YF] History parse error for {symbol}: {e}")
        result = []

    with _lock:
        _hist_cache[key] = result
    return result


# ── fundamentals ─────────────────────────────────────────────────────────────

def get_fundamentals(symbol: str) -> dict:
    """
    Fundamental data for any NSE stock.
    Same return schema as yahoo_service.get_fundamentals().
    """
    if not RAPIDAPI_KEY:
        return {"error": "RAPIDAPI_KEY not set"}

    key = symbol.upper()
    with _lock:
        if key in _fund_cache:
            return _fund_cache[key]

    data = _get("/stock/v2/get-summary", {
        "symbol": _ticker(symbol),
        "region": "IN",
        "lang":   "en-US",
    })

    result: dict
    try:
        stats   = data.get("defaultKeyStatistics", {})
        fin     = data.get("financialData", {})
        summary = data.get("summaryDetail", {})
        profile = data.get("summaryProfile", {})
        price   = data.get("price", {})

        mktcap  = _si(price.get("marketCap", {}).get("raw") or summary.get("marketCap", {}).get("raw"))
        mktcap_cr = round(mktcap / 1e7, 2) if mktcap else 0

        result = {
            "pe":               _sf(summary.get("trailingPE", {}).get("raw") or stats.get("trailingPE", {}).get("raw"), 0),
            "pb":               _sf(stats.get("priceToBook", {}).get("raw"), 0),
            "eps":              _sf(stats.get("trailingEps", {}).get("raw"), 0),
            "roe":              _sf((fin.get("returnOnEquity", {}).get("raw") or 0) * 100, 0),
            "roce":             _sf((fin.get("returnOnAssets", {}).get("raw") or 0) * 100, 0),
            "debtToEquity":     _sf((fin.get("debtToEquity", {}).get("raw") or 0) / 100, 0),
            "currentRatio":     _sf(fin.get("currentRatio", {}).get("raw"), 0),
            "revenueGrowthYoY": _sf((fin.get("revenueGrowth", {}).get("raw") or 0) * 100, 0),
            "profitGrowthYoY":  _sf((fin.get("earningsGrowth", {}).get("raw") or 0) * 100, 0),
            "dividendYield":    _sf((summary.get("dividendYield", {}).get("raw") or 0) * 100, 0),
            "promoterHolding":  _sf((stats.get("heldPercentInsiders", {}).get("raw") or 0) * 100, 0),
            "fiisHolding":      _sf((stats.get("heldPercentInstitutions", {}).get("raw") or 0) * 100, 0),
            "diisHolding":      0,
            "publicHolding":    0,
            "marketCapCr":      mktcap_cr,
            "revenueQtrCr":     [],   # needs separate earnings endpoint
            "profitQtrCr":      [],
            "sector":           profile.get("sector", SECTOR_MAP.get(key, "Other")),
            "industry":         profile.get("industry", ""),
            "description":      (profile.get("longBusinessSummary") or "")[:500],
            "website":          profile.get("website", ""),
            "employees":        _si(profile.get("fullTimeEmployees")),
            "weekHigh52":       _sf(summary.get("fiftyTwoWeekHigh", {}).get("raw"), 0),
            "weekLow52":        _sf(summary.get("fiftyTwoWeekLow", {}).get("raw"),  0),
            "avgVolume":        _si(summary.get("averageVolume", {}).get("raw")),
            "source":           "rapidapi-yf",
        }
    except Exception as e:
        print(f"[RapidAPI-YF] Fundamentals parse error for {symbol}: {e}")
        result = {"error": str(e)}

    with _lock:
        _fund_cache[key] = result
    return result


# ── index history ─────────────────────────────────────────────────────────────

_INDEX_TICKERS = {
    "NIFTY50":   "^NSEI",
    "SENSEX":    "^BSESN",
    "BANKNIFTY": "^NSEBANK",
    "NIFTYIT":   "^CNXIT",
    "NIFTYMID":  "^NSEMDCP50",
}


def get_index_history(index_id: str, period: str = "3m") -> list:
    """Fetch index OHLCV history via RapidAPI Yahoo Finance."""
    if not RAPIDAPI_KEY:
        return []
    ticker = _INDEX_TICKERS.get(index_id.upper())
    if not ticker:
        return []

    # Reuse get_history — works for index tickers too
    key = f"{index_id}:{period}"
    with _lock:
        if key in _hist_cache:
            return _hist_cache[key]

    yf_range = _RANGE_MAP.get(period.lower(), "3mo")
    data = _get("/stock/v2/get-chart", {
        "symbol":         ticker,
        "range":          yf_range,
        "interval":       "1d",
        "region":         "IN",
        "lang":           "en-US",
        "includePrePost": "false",
    })

    result = []
    try:
        chart  = data["chart"]["result"][0]
        ts     = chart.get("timestamp", [])
        quotes = chart["indicators"]["quote"][0]
        closes = quotes.get("close", [])
        opens  = quotes.get("open",  [])
        highs  = quotes.get("high",  [])
        lows   = quotes.get("low",   [])
        vols   = quotes.get("volume",[])

        for i, t in enumerate(ts):
            c = _sf(closes[i] if i < len(closes) else None, None)
            if c is None or c == 0:
                continue
            result.append({
                "date":   str(date.fromtimestamp(t)),
                "open":   _sf(opens[i] if i < len(opens) else None, 0),
                "high":   _sf(highs[i] if i < len(highs) else None, 0),
                "low":    _sf(lows[i]  if i < len(lows)  else None, 0),
                "close":  c,
                "volume": _si(vols[i]  if i < len(vols)  else None),
            })
    except Exception as e:
        print(f"[RapidAPI-YF] Index history parse error {index_id}: {e}")

    with _lock:
        _hist_cache[key] = result
    return result
