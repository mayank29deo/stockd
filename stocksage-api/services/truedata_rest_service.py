"""
TrueData REST API Service
=========================
Covers fundamentals, FII/DII flows, and market breadth via TrueData's
REST endpoints. Separate from the WebSocket tick service (truedata_service.py).

Auth: OAuth2 password grant → Bearer token from https://auth.truedata.in/token
Token TTL unknown — we cache 23h and refresh on 401.

Endpoints used:
  corporate.truedata.in  — fundamentals (ratios, P&L, cash flow)
  analytics.truedata.in  — market breadth, index gainers/losers

.env keys:
  TRUEDATA_USERNAME
  TRUEDATA_PASSWORD
"""

import os
import time
import threading
import logging
from datetime import datetime, timedelta, timezone
from cachetools import TTLCache

import requests

log = logging.getLogger("truedata_rest")

# ── Config ─────────────────────────────────────────────────────────────────────

TRUEDATA_USERNAME = os.getenv("TRUEDATA_USERNAME", "")
TRUEDATA_PASSWORD = os.getenv("TRUEDATA_PASSWORD", "")

_CONFIGURED = bool(TRUEDATA_USERNAME and TRUEDATA_PASSWORD)

_AUTH_URL       = "https://auth.truedata.in/token"
_CORPORATE_URL  = "https://corporate.truedata.in"
_ANALYTICS_URL  = "https://analytics.truedata.in/api"

# ── Auth state ─────────────────────────────────────────────────────────────────

_lock          = threading.RLock()
_access_token: "str | None" = None
_token_expiry: float = 0.0
_TOKEN_TTL    = 23 * 3600   # refresh every 23h (token lifetime unknown — conservative)
_auth_failed  = False
_auth_failed_at: float = 0.0

_http = requests.Session()

# ── Caches ─────────────────────────────────────────────────────────────────────

_fund_cache  = TTLCache(maxsize=100, ttl=6 * 3600)   # fundamentals — 6h
_fiidii_cache = TTLCache(maxsize=30,  ttl=300)        # FII/DII — 5 min (changes daily)
_breadth_cache = TTLCache(maxsize=10, ttl=60)         # market breadth — 1 min


# ── Authentication ─────────────────────────────────────────────────────────────

def _get_token() -> "str | None":
    """Return valid Bearer token, refreshing if expired or missing."""
    global _access_token, _token_expiry, _auth_failed, _auth_failed_at

    with _lock:
        now = time.time()

        # Reset auth_failed after 5 min so transient errors self-heal
        if _auth_failed and (now - _auth_failed_at) > 300:
            _auth_failed = False

        if _auth_failed:
            return None

        # Valid cached token
        if _access_token and now < _token_expiry:
            return _access_token

        # Fetch new token
        if not _CONFIGURED:
            return None

        try:
            r = _http.post(
                _AUTH_URL,
                data={
                    "username":   TRUEDATA_USERNAME,
                    "password":   TRUEDATA_PASSWORD,
                    "grant_type": "password",
                },
                timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                token = data.get("access_token")
                if token:
                    _access_token = token
                    # Use expires_in if provided, else default 23h
                    expires_in    = int(data.get("expires_in", _TOKEN_TTL))
                    _token_expiry = now + min(expires_in, _TOKEN_TTL)
                    _auth_failed  = False
                    log.info(f"[TrueData REST] ✅ Token acquired, valid for {expires_in}s")
                    return _access_token
            log.warning(f"[TrueData REST] Auth failed: {r.status_code} {r.text[:200]}")
            _auth_failed    = True
            _auth_failed_at = now
            return None
        except Exception as e:
            log.warning(f"[TrueData REST] Auth error: {e}")
            _auth_failed    = True
            _auth_failed_at = now
            return None


def available() -> bool:
    return _get_token() is not None


def _get(url: str, params: dict = None) -> "dict | list | None":
    """Authenticated GET with automatic token refresh on 401."""
    token = _get_token()
    if not token:
        return None
    try:
        r = _http.get(url, headers={"Authorization": f"Bearer {token}"},
                      params=params, timeout=15)
        if r.status_code == 401:
            # Token expired — force refresh
            with _lock:
                global _token_expiry
                _token_expiry = 0.0
            token = _get_token()
            if not token:
                return None
            r = _http.get(url, headers={"Authorization": f"Bearer {token}"},
                          params=params, timeout=15)
        if r.status_code == 200:
            ct = r.headers.get("Content-Type", "")
            if "json" in ct:
                return r.json()
            # CSV response — return raw text
            return r.text
        log.debug(f"[TrueData REST] GET {url} → {r.status_code}")
        return None
    except Exception as e:
        log.warning(f"[TrueData REST] GET {url} failed: {e}")
        return None


# ── Fundamentals ───────────────────────────────────────────────────────────────

def get_fundamentals(symbol: str) -> "dict | None":
    """
    Fetch financial ratios for a stock via TrueData Corporate API.
    Returns normalised fundamentals dict matching our schema:
      pe, pb, roe, eps, dividendYield, debtToEquity, marketCap, ...
    """
    if not _CONFIGURED:
        return None

    cache_key = f"fund:{symbol}"
    with _lock:
        if cache_key in _fund_cache:
            return _fund_cache[cache_key]

    data = _get(f"{_CORPORATE_URL}/getratiosForsymbol",
                params={"symbol": symbol, "response": "json"})

    if not data:
        return None

    # TrueData returns list of ratio records or a dict
    ratios = data if isinstance(data, dict) else (data[0] if isinstance(data, list) and data else {})

    def _num(val, default=None):
        try:
            v = float(val)
            return v if v != 0 else default
        except (TypeError, ValueError):
            return default

    result = {
        "pe":                _num(ratios.get("PE") or ratios.get("pe")),
        "pb":                _num(ratios.get("PB") or ratios.get("pb")),
        "eps":               _num(ratios.get("EPS") or ratios.get("eps")),
        "roe":               _num(ratios.get("ROE") or ratios.get("roe")),
        "roa":               _num(ratios.get("ROA") or ratios.get("roa")),
        "debtToEquity":      _num(ratios.get("DebtEquity") or ratios.get("debtEquity")
                                  or ratios.get("debt_equity")),
        "dividendYield":     _num(ratios.get("DivYield") or ratios.get("divYield")
                                  or ratios.get("dividend_yield")),
        "marketCap":         _num(ratios.get("MarketCap") or ratios.get("marketCap")),
        "bookValue":         _num(ratios.get("BookValue") or ratios.get("bookValue")),
        "dataSource":        "truedata",
    }

    # Filter out None values so callers can merge cleanly
    result = {k: v for k, v in result.items() if v is not None}
    result["dataSource"] = "truedata"

    if result:
        with _lock:
            _fund_cache[cache_key] = result
        log.debug(f"[TrueData REST] Fundamentals for {symbol}: {list(result.keys())}")

    return result or None


def get_corporate_info(symbol: str) -> "dict | None":
    """Fetch company description, sector, industry from TrueData."""
    cache_key = f"corp:{symbol}"
    with _lock:
        if cache_key in _fund_cache:
            return _fund_cache[cache_key]

    data = _get(f"{_CORPORATE_URL}/getCorporateInfo",
                params={"symbol": symbol, "response": "json"})

    if not data:
        return None

    info = data if isinstance(data, dict) else (data[0] if isinstance(data, list) and data else {})
    result = {
        "name":        info.get("CompanyName") or info.get("companyName"),
        "sector":      info.get("Sector") or info.get("sector"),
        "industry":    info.get("Industry") or info.get("industry"),
        "description": info.get("Description") or info.get("description"),
        "isin":        info.get("ISIN") or info.get("isin"),
        "dataSource":  "truedata",
    }
    result = {k: v for k, v in result.items() if v}
    if result:
        with _lock:
            _fund_cache[cache_key] = result
    return result or None


# ── FII/DII Flow Data ─────────────────────────────────────────────────────────

def _date_to_truedata(dt: datetime) -> str:
    """Convert datetime → TrueData date format DDMMYY (e.g. 100426)."""
    return dt.strftime("%d%m%y")


def get_fii_dii_today() -> "dict | None":
    """
    Fetch today's FII and DII net flows from TrueData Corporate API.
    Returns: { fiiNetFlowCr, diiNetFlowCr, date }
    """
    today = datetime.now(timezone.utc)
    # Try today, then yesterday (market may be closed)
    for delta in range(5):
        dt = today - timedelta(days=delta)
        if dt.weekday() >= 5:  # skip weekends
            continue
        date_str = _date_to_truedata(dt)
        cache_key = f"fiidii:{date_str}"
        with _lock:
            if cache_key in _fiidii_cache:
                return _fiidii_cache[cache_key]

        data = _get(f"{_CORPORATE_URL}/getfiidiidata",
                    params={"response": "json", "date": date_str, "segment": "cash"})

        if not data:
            continue

        rows = data if isinstance(data, list) else data.get("data", [])
        if not rows:
            continue

        fii_buy = fii_sell = dii_buy = dii_sell = 0.0
        for row in rows:
            cat = str(row.get("Category") or row.get("category") or "").upper()
            buy  = float(row.get("BuyValue") or row.get("buyValue") or 0)
            sell = float(row.get("SellValue") or row.get("sellValue") or 0)
            if "FII" in cat or "FPI" in cat:
                fii_buy  += buy
                fii_sell += sell
            elif "DII" in cat:
                dii_buy  += buy
                dii_sell += sell

        result = {
            "fiiNetFlowCr": round((fii_buy - fii_sell) / 1e7, 2),  # paise→Cr: /1e7
            "diiNetFlowCr": round((dii_buy - dii_sell) / 1e7, 2),
            "date":         dt.strftime("%Y-%m-%d"),
            "dataSource":   "truedata",
        }
        with _lock:
            _fiidii_cache[cache_key] = result
        return result

    return None


def get_fii_dii_history(days: int = 12) -> list:
    """
    Fetch FII/DII net flows for last N trading days.
    Returns list of { date, fii, dii } dicts for the chart.
    """
    results = []
    today = datetime.now(timezone.utc)
    checked = 0
    d = today

    while len(results) < days and checked < 30:
        checked += 1
        if d.weekday() >= 5:
            d -= timedelta(days=1)
            continue

        date_str = _date_to_truedata(d)
        data = _get(f"{_CORPORATE_URL}/getfiidiidata",
                    params={"response": "json", "date": date_str, "segment": "cash"})

        if data:
            rows = data if isinstance(data, list) else data.get("data", [])
            if rows:
                fii_buy = fii_sell = dii_buy = dii_sell = 0.0
                for row in rows:
                    cat  = str(row.get("Category") or row.get("category") or "").upper()
                    buy  = float(row.get("BuyValue") or row.get("buyValue") or 0)
                    sell = float(row.get("SellValue") or row.get("sellValue") or 0)
                    if "FII" in cat or "FPI" in cat:
                        fii_buy += buy; fii_sell += sell
                    elif "DII" in cat:
                        dii_buy += buy; dii_sell += sell

                results.append({
                    "date": d.strftime("%d %b"),
                    "fii":  round((fii_buy - fii_sell) / 1e7, 2),
                    "dii":  round((dii_buy - dii_sell) / 1e7, 2),
                })

        d -= timedelta(days=1)

    results.reverse()  # chronological order
    return results


# ── Market Breadth ─────────────────────────────────────────────────────────────

def get_market_breadth(index: str = "NIFTY 50") -> "dict | None":
    """
    Advance/Decline ratio for an index.
    Returns: { advances, declines, unchanged, total, adRatio }
    """
    cache_key = f"breadth:{index}"
    with _lock:
        if cache_key in _breadth_cache:
            return _breadth_cache[cache_key]

    data = _get(f"{_ANALYTICS_URL}/getMarketAdvDec",
                params={"indexName": index})

    if not data:
        return None

    if isinstance(data, list) and data:
        data = data[0]

    if not isinstance(data, dict):
        return None

    advances   = int(data.get("Advances")   or data.get("advances")   or 0)
    declines   = int(data.get("Declines")   or data.get("declines")   or 0)
    unchanged  = int(data.get("Unchanged")  or data.get("unchanged")  or 0)
    total      = advances + declines + unchanged or 1

    result = {
        "advances":  advances,
        "declines":  declines,
        "unchanged": unchanged,
        "total":     total,
        "adRatio":   round(advances / max(declines, 1), 2),
        "dataSource": "truedata",
    }

    with _lock:
        _breadth_cache[cache_key] = result

    return result


# ── Health ─────────────────────────────────────────────────────────────────────

def health() -> dict:
    return {
        "truedata_rest_configured": _CONFIGURED,
        "truedata_rest_auth":       bool(_access_token and time.time() < _token_expiry),
        "truedata_rest_failed":     _auth_failed,
    }
