"""
EODHD (End-of-Day Historical Data) service.

Replaces yfinance for:
  - Historical OHLCV data  (much more reliable from cloud)
  - Fundamental data       (P/E, ROE, revenue, earnings, etc.)
  - EOD / real-time quotes (fallback when NSE API is unavailable)

Set EODHD_API_KEY in your .env file.
Docs: https://eodhd.com/financial-apis/

Pricing: starts at ~$19/month ("All World" plan covers NSE/BSE).
"""
import math
import threading
import requests
from datetime import datetime, timezone, timedelta
from cachetools import TTLCache
from config import EODHD_API_KEY, HISTORY_CACHE_TTL, FUNDAMENTAL_CACHE_TTL, SECTOR_MAP

_BASE = "https://eodhd.com/api"
_lock = threading.Lock()
_hist_cache  = TTLCache(maxsize=100, ttl=HISTORY_CACHE_TTL)
_fund_cache  = TTLCache(maxsize=100, ttl=FUNDAMENTAL_CACHE_TTL)
_quote_cache = TTLCache(maxsize=200, ttl=60)

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


def _ticker(symbol: str) -> str:
    """NSE symbol → EODHD ticker (RELIANCE → RELIANCE.NSE)."""
    symbol = symbol.upper().strip()
    if symbol in ("M&M", "M%26M"):
        return "MM.NSE"
    if symbol.endswith(".NSE") or symbol.endswith(".BSE"):
        return symbol
    return f"{symbol}.NSE"


def available() -> bool:
    """Returns True if an EODHD key is configured."""
    return bool(EODHD_API_KEY)


# ── quote ─────────────────────────────────────────────────────────────────────

def get_quote(symbol: str) -> dict:
    """
    Real-time (or 15-min delayed) quote from EODHD.
    Falls back to EOD quote if real-time is not on your plan.
    """
    if not EODHD_API_KEY:
        return {"symbol": symbol.upper(), "error": "EODHD_API_KEY not set"}

    key = symbol.upper()
    with _lock:
        if key in _quote_cache:
            return _quote_cache[key]

    try:
        resp = _SESSION.get(
            f"{_BASE}/real-time/{_ticker(symbol)}",
            params={"api_token": EODHD_API_KEY, "fmt": "json"},
            timeout=10,
        )
        resp.raise_for_status()
        d = resp.json()

        price      = _sf(d.get("close") or d.get("previousClose"), 0)
        prev_close = _sf(d.get("previousClose"), price)
        change     = round(price - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 2)

        result = {
            "symbol":        key,
            "price":         price,
            "previousClose": prev_close,
            "change":        change,
            "changePercent": change_pct,
            "open":          _sf(d.get("open"), price),
            "high":          _sf(d.get("high"), price),
            "low":           _sf(d.get("low"),  price),
            "volume":        _si(d.get("volume")),
            "exchange":      "NSE",
            "currency":      "INR",
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "eodhd",
        }
    except Exception as e:
        result = {"symbol": key, "error": str(e)}

    with _lock:
        _quote_cache[key] = result
    return result


# ── history ───────────────────────────────────────────────────────────────────

_PERIOD_DAYS = {
    "1w": 7, "1m": 30, "3m": 90,
    "6m": 180, "1y": 365, "2y": 730, "5y": 1825,
    # yfinance aliases
    "5d": 7, "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365,
}


def get_history(symbol: str, period: str = "1y") -> list:
    """
    OHLCV daily history from EODHD.
    Returns same format as yahoo_service.get_history().
    """
    if not EODHD_API_KEY:
        return []

    key = f"{symbol.upper()}:{period}"
    with _lock:
        if key in _hist_cache:
            return _hist_cache[key]

    days      = _PERIOD_DAYS.get(period.lower(), 365)
    today     = datetime.now()
    from_date = (today - timedelta(days=days)).strftime("%Y-%m-%d")
    to_date   = today.strftime("%Y-%m-%d")

    try:
        resp = _SESSION.get(
            f"{_BASE}/eod/{_ticker(symbol)}",
            params={
                "api_token": EODHD_API_KEY,
                "from":      from_date,
                "to":        to_date,
                "fmt":       "json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()

        result = [
            {
                "date":   item["date"],
                "open":   _sf(item.get("open"), 0),
                "high":   _sf(item.get("high"), 0),
                "low":    _sf(item.get("low"),  0),
                "close":  _sf(item.get("adjusted_close") or item.get("close"), 0),
                "volume": _si(item.get("volume")),
            }
            for item in raw
            if (item.get("adjusted_close") or item.get("close") or 0) > 0
        ]
    except Exception as e:
        print(f"[EODHD] History error for {symbol}: {e}")
        result = []

    with _lock:
        _hist_cache[key] = result
    return result


# ── fundamentals ─────────────────────────────────────────────────────────────

def get_fundamentals(symbol: str) -> dict:
    """
    Full fundamental data from EODHD.
    Returns same field names as yahoo_service.get_fundamentals().
    """
    if not EODHD_API_KEY:
        return {"error": "EODHD_API_KEY not set"}

    key = symbol.upper()
    with _lock:
        if key in _fund_cache:
            return _fund_cache[key]

    try:
        resp = _SESSION.get(
            f"{_BASE}/fundamentals/{_ticker(symbol)}",
            params={"api_token": EODHD_API_KEY, "fmt": "json"},
            timeout=20,
        )
        resp.raise_for_status()
        d = resp.json()

        gen    = d.get("General", {})
        hl     = d.get("Highlights", {})
        val    = d.get("Valuation", {})
        tech   = d.get("Technicals", {})
        ss     = d.get("SharesStats", {})
        fin    = d.get("Financials", {})

        # Quarterly income statement (up to 4 quarters)
        q_income    = fin.get("Income_Statement", {}).get("quarterly", {})
        rev_qtrs    = []
        profit_qtrs = []
        if q_income:
            for qkey in sorted(q_income.keys(), reverse=True)[:4]:
                qd = q_income[qkey]
                rev_qtrs.append(_sf((qd.get("totalRevenue") or 0) / 1e7, 0))
                profit_qtrs.append(_sf((qd.get("netIncome") or 0) / 1e7, 0))

        mktcap_cr = _sf((hl.get("MarketCapitalization") or 0) / 1e7, 0)

        result = {
            "pe":               _sf(hl.get("PERatio") or val.get("TrailingPE"), 0),
            "pb":               _sf(val.get("PriceBookMRQ"), 0),
            "eps":              _sf(hl.get("EarningsShare"), 0),
            "roe":              _sf((hl.get("ReturnOnEquityTTM") or 0) * 100, 0),
            "roce":             _sf((hl.get("ReturnOnAssetsTTM") or 0) * 100, 0),
            "debtToEquity":     _sf(hl.get("DebtEquityRatio"), 0),
            "currentRatio":     _sf(hl.get("CurrentRatioTTM"), 0),
            "revenueGrowthYoY": _sf((hl.get("RevenueGrowthTTMvsQtr") or 0) * 100, 0),
            "profitGrowthYoY":  _sf((hl.get("EarningsGrowthQuarterly") or 0) * 100, 0),
            "dividendYield":    _sf((hl.get("DividendYield") or 0) * 100, 0),
            "promoterHolding":  _sf(ss.get("PercentInsiders"), 0),
            "fiisHolding":      _sf(ss.get("PercentInstitutions"), 0),
            "diisHolding":      0,
            "publicHolding":    0,
            "marketCapCr":      mktcap_cr,
            "revenueQtrCr":     [_sf(v, 0) for v in rev_qtrs],
            "profitQtrCr":      [_sf(v, 0) for v in profit_qtrs],
            "sector":           gen.get("Sector", SECTOR_MAP.get(key, "Other")),
            "industry":         gen.get("Industry", ""),
            "description":      (gen.get("Description") or "")[:500],
            "website":          gen.get("WebURL", ""),
            "employees":        _si(gen.get("FullTimeEmployees")),
            "weekHigh52":       _sf(tech.get("52WeekHigh"), 0),
            "weekLow52":        _sf(tech.get("52WeekLow"),  0),
            "avgVolume":        _si(tech.get("AverageDailyVolume3Month")),
            "source":           "eodhd",
        }
    except Exception as e:
        print(f"[EODHD] Fundamentals error for {symbol}: {e}")
        result = {"error": str(e)}

    with _lock:
        _fund_cache[key] = result
    return result
