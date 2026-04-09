"""
Nubra.io API Service
====================
Provides live quotes, historical OHLCV, and current-price data via the Nubra REST API.

Authentication (priority order):
  1. NUBRA_SESSION_TOKEN in .env — manual token, works immediately, expires in ~24h.
     Refresh by re-running the login curl commands and updating the env var.
     Use this while waiting for TOTP to be enabled by Nubra support.

  2. TOTP auto-login — fully automated, token refreshes every 23h with no human input.
     Requires NUBRA_TOTP_SECRET (from POST /totp/generate-secret).
     Contact support@nubra.io to enable TOTP if the endpoint returns 404.

Fallback:
  - available() returns False if no auth method works.
  - All callers fall through to NSE/RapidAPI/yfinance silently.

Price normalisation:
  - Nubra returns prices in PAISE (integer). We divide by 100 for rupees.
  - e.g. Nubra price 2575555 → ₹25755.55

.env keys:
  NUBRA_SESSION_TOKEN — paste session_token here for immediate use (manual refresh)
  NUBRA_EMAIL         — registered email (needed for TOTP auto-login)
  NUBRA_MPIN          — 4–6 digit MPIN (needed for TOTP auto-login)
  NUBRA_TOTP_SECRET   — base32 secret from /totp/generate-secret (needed for TOTP)
  NUBRA_DEVICE_ID     — any stable string, e.g. "stockd-server-01"
"""

import os
import time
import threading
import logging
from datetime import datetime, timedelta, timezone
from cachetools import TTLCache

import requests

log = logging.getLogger("nubra")

# ── Config ────────────────────────────────────────────────────────────────────

_BASE       = "https://api.nubra.io"
_UAT_BASE   = "https://uatapi.nubra.io"

NUBRA_SESSION_TOKEN = os.getenv("NUBRA_SESSION_TOKEN", "")  # manual fallback
NUBRA_EMAIL         = os.getenv("NUBRA_EMAIL", "")
NUBRA_PHONE         = os.getenv("NUBRA_PHONE", "")
NUBRA_MPIN          = os.getenv("NUBRA_MPIN", "")
NUBRA_TOTP_SECRET   = os.getenv("NUBRA_TOTP_SECRET", "")
NUBRA_DEVICE_ID     = os.getenv("NUBRA_DEVICE_ID", "")

# TOTP auto-login requires phone + TOTP secret + MPIN
_TOTP_CONFIGURED = bool(NUBRA_PHONE and NUBRA_TOTP_SECRET and NUBRA_MPIN)
NUBRA_USE_UAT       = os.getenv("NUBRA_USE_UAT", "false").lower() == "true"

_BASE_URL = _UAT_BASE if NUBRA_USE_UAT else _BASE

# ── Session state (module-level, thread-safe) ─────────────────────────────────

_lock          = threading.RLock()
_session_token: "str | None" = None
_token_expiry:  float      = 0.0   # unix timestamp when token expires
_TOKEN_TTL_SEC             = 10 * 3600  # Nubra tokens last ~12h; refresh at 10h
_auth_failed               = False      # flag to stop retry storms
_auth_failed_at: float     = 0.0        # when auth last failed — retry after 5 min

# Request-level cache for quotes (60s TTL)
_quote_cache = TTLCache(maxsize=300, ttl=60)

_http = requests.Session()
_http.headers.update({
    "Content-Type": "application/json",
    "x-device-id":  NUBRA_DEVICE_ID,
})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _paise_to_inr(paise) -> float:
    """Convert Nubra paise integer → INR rupees float."""
    if paise is None:
        return 0.0
    return round(float(paise) / 100, 2)


def _ns_to_date(ns: int) -> str:
    """Convert nanosecond epoch timestamp → YYYY-MM-DD string (IST)."""
    from datetime import timezone as tz
    import pytz
    ts   = ns / 1e9
    dt   = datetime.fromtimestamp(ts, tz=pytz.timezone("Asia/Kolkata"))
    return dt.strftime("%Y-%m-%d")


def _period_to_dates(period: str) -> tuple[str, str]:
    """
    Convert period string ("1w", "1m", "3m", "1y", etc.) to
    (startDate, endDate) in ISO 8601 UTC format for Nubra /charts/timeseries.
    """
    days_map = {
        "1w":  7,
        "1m":  30,
        "3m":  90,
        "6m":  180,
        "1y":  365,
        "3y":  1095,
        "5y":  1825,
    }
    days  = days_map.get(period, 365)
    now   = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    fmt   = "%Y-%m-%dT%H:%M:%S.000Z"
    return start.strftime(fmt), now.strftime(fmt)


# ── Authentication ─────────────────────────────────────────────────────────────

def available() -> bool:
    """
    Returns True if Nubra is configured AND we have (or can obtain) a valid
    session token. False means callers should skip Nubra entirely.
    """
    return _ensure_token() is not None


def _jwt_exp(token: str) -> "float | None":
    """Extract exp claim from a JWT without verifying signature."""
    try:
        import base64, json as _json
        payload_b64 = token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(payload_b64))
        return float(payload["exp"])
    except Exception:
        return None


def _ensure_token() -> "str | None":
    """
    Return valid session token. Priority:
      1. In-memory cached token (not expired)
      2. NUBRA_SESSION_TOKEN from env (manual, ~12h lifetime)
      3. TOTP auto-login (fully automated, requires TOTP secret)
    Thread-safe. Returns None if no auth method works.
    _auth_failed resets after 5 min so transient failures self-heal.
    """
    global _session_token, _token_expiry, _auth_failed, _auth_failed_at

    with _lock:
        now = time.time()

        # Reset auth_failed after 5 minutes so transient errors self-heal
        if _auth_failed and (now - _auth_failed_at) > 300:
            _auth_failed = False

        # 1. Valid in-memory token
        if _session_token and now < _token_expiry:
            return _session_token

        # 2. Manual session token from env — decode JWT exp to check real expiry
        if NUBRA_SESSION_TOKEN:
            exp = _jwt_exp(NUBRA_SESSION_TOKEN)
            if exp and now >= exp:
                log.warning(
                    f"[Nubra] NUBRA_SESSION_TOKEN expired at "
                    f"{datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()} — "
                    "attempting TOTP auto-refresh"
                )
                # Fall through to TOTP
            else:
                _session_token = NUBRA_SESSION_TOKEN
                _token_expiry  = exp if exp else (now + 11 * 3600)
                _auth_failed   = False
                log.info("[Nubra] Using NUBRA_SESSION_TOKEN from env")
                return _session_token

        # 3. TOTP auto-login (phone + TOTP + MPIN — fully automated)
        if _TOTP_CONFIGURED and not _auth_failed:
            try:
                token, device_id = _totp_login()
                if token:
                    # Decode real expiry from JWT, fall back to 10h
                    exp = _jwt_exp(token)
                    _session_token = token
                    _token_expiry  = exp if exp else (now + _TOKEN_TTL_SEC)
                    _auth_failed   = False
                    global NUBRA_DEVICE_ID
                    if device_id:
                        NUBRA_DEVICE_ID = device_id
                        _http.headers.update({"x-device-id": device_id})
                    log.info(f"[Nubra] ✅ TOTP auto-login OK, token valid until "
                             f"{datetime.fromtimestamp(_token_expiry, tz=timezone.utc).isoformat()}")
                    return _session_token
            except Exception as e:
                log.warning(f"[Nubra] TOTP auth failed: {e}")
                _auth_failed    = True
                _auth_failed_at = now
                _session_token  = None

        return None


def _totp_login() -> "tuple[str, str] | tuple[None, None]":
    """
    Fully automated TOTP-based login → returns (session_token, device_id).
    TOTP flow (does NOT call /sendotp — that is for SMS OTP only):
      Step 1: POST /totp/login  { phone, totp }  → auth_token
      Step 2: POST /verifypin   { pin }           → session_token
    """
    try:
        import pyotp
    except ImportError:
        log.error("[Nubra] 'pyotp' not installed — run: pip install pyotp")
        return None, None

    import uuid
    totp      = pyotp.TOTP(NUBRA_TOTP_SECRET)
    totp_code = int(totp.now())  # Nubra expects uint32 (integer), NOT a string
    device_id = NUBRA_DEVICE_ID or f"stockd-server-{uuid.uuid4().hex[:8]}"

    hdrs = {
        "Content-Type": "application/json",
        "x-device-id": device_id,
    }

    # Step 1: POST /totp/login { phone, totp (int) } → auth_token
    r = _http.post(
        f"{_BASE_URL}/totp/login",
        json={"phone": NUBRA_PHONE, "totp": totp_code},
        headers=hdrs,
        timeout=15,
    )
    log.debug(f"[Nubra] /totp/login → {r.status_code}: {r.text[:200]}")
    if r.status_code not in (200, 201):
        raise ValueError(f"TOTP login failed: {r.status_code} {r.text[:200]}")

    body = r.json()
    auth_token = body.get("auth_token") or body.get("data", {}).get("auth_token")
    if not auth_token:
        raise ValueError(f"TOTP login: no auth_token in response: {r.text[:200]}")

    # Step 2: Verify MPIN → session_token
    r3 = _http.post(
        f"{_BASE_URL}/verifypin",
        json={"pin": NUBRA_MPIN},
        headers={**hdrs, "Authorization": f"Bearer {auth_token}"},
        timeout=15,
    )
    log.debug(f"[Nubra] verifypin → {r3.status_code}: {r3.text[:200]}")
    r3.raise_for_status()
    data = r3.json()
    session_token = (
        data.get("session_token")
        or data.get("data", {}).get("session_token")
        or data.get("token")
        or data.get("data", {}).get("token")
    )
    if not session_token:
        raise ValueError(f"verifypin failed: {r3.text}")

    return session_token, device_id


def _auth_headers() -> dict:
    token = _ensure_token()
    if not token:
        raise RuntimeError("Nubra: no valid session token")
    return {
        "Authorization": f"Bearer {token}",
        "x-device-id":   NUBRA_DEVICE_ID,
    }


# ── Current Price (snapshot) ──────────────────────────────────────────────────

def get_quote(symbol: str) -> "dict | None":
    """
    Live price snapshot for a single NSE stock or index.

    Strategy:
      1. /optionchains/{sym}/price  — fast, but only F&O stocks
      2. /charts/timeseries realTime — covers ALL NSE stocks (slower, ~1s)
    Returns normalised quote dict or None on failure.
    """
    from config import NSE_SYMBOL_ALIAS
    sym = NSE_SYMBOL_ALIAS.get(symbol.upper().strip(), symbol.upper().strip())

    with _lock:
        if sym in _quote_cache:
            return _quote_cache[sym]

    result = _get_quote_optionchain(sym) or _get_quote_timeseries(sym)
    if result:
        with _lock:
            _quote_cache[sym] = result
    return result


def _get_quote_optionchain(sym: str) -> "dict | None":
    """Fast quote via /optionchains/{sym}/price — F&O stocks only."""
    try:
        hdrs = _auth_headers()
        r    = _http.get(
            f"{_BASE_URL}/optionchains/{sym}/price",
            headers=hdrs,
            timeout=8,
        )
        if r.status_code == 400:
            return None   # symbol not in F&O universe — fall through to timeseries
        r.raise_for_status()
        d = r.json()

        raw_price      = d.get("price", 0)
        raw_prev_close = d.get("prev_close", 0)
        change_pct     = float(d.get("change", 0) or 0)

        price      = _paise_to_inr(raw_price)
        prev_close = _paise_to_inr(raw_prev_close)
        change     = round(price - prev_close, 2)

        if price <= 0:
            return None

        return {
            "symbol":        sym,
            "price":         price,
            "previousClose": prev_close,
            "change":        change,
            "changePercent": round(change_pct, 4),
            "exchange":      d.get("exchange", "NSE"),
            "currency":      "INR",
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "nubra",
        }
    except Exception as e:
        log.debug(f"[Nubra] optionchain quote({sym}) failed: {e}")
        return None


def _get_quote_timeseries(sym: str) -> "dict | None":
    """
    Real-time quote via /charts/timeseries — works for ALL NSE stocks.
    Fetches the last 2 days of 1-minute candles with realTime=True and
    returns the most recent close as the live price.
    """
    from datetime import timezone as tz
    now   = datetime.now(tz.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    fmt   = "%Y-%m-%dT%H:%M:%S.000Z"

    payload = {
        "query": [{
            "exchange":  "NSE",
            "type":      "STOCK",
            "values":    [sym],
            "fields":    ["close", "open", "high", "low", "cumulative_volume"],
            "startDate": start.strftime(fmt),
            "endDate":   now.strftime(fmt),
            "interval":  "1d",
            "intraDay":  True,
            "realTime":  True,
        }]
    }

    try:
        hdrs = _auth_headers()
        r    = _http.post(
            f"{_BASE_URL}/charts/timeseries",
            json=payload,
            headers=hdrs,
            timeout=12,
        )
        r.raise_for_status()
        candles = _parse_history_response(r.json(), sym)
        if not candles:
            return None

        latest = candles[-1]
        price  = latest["close"]
        if price <= 0:
            return None

        # prev_close = previous candle if available, else open
        prev_close = candles[-2]["close"] if len(candles) >= 2 else latest["open"]
        change     = round(price - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 4)

        return {
            "symbol":        sym,
            "price":         price,
            "previousClose": prev_close,
            "change":        change,
            "changePercent": change_pct,
            "open":          latest.get("open", price),
            "high":          latest.get("high", price),
            "low":           latest.get("low",  price),
            "volume":        latest.get("volume", 0),
            "exchange":      "NSE",
            "currency":      "INR",
            "lastUpdated":   datetime.now(tz.utc).isoformat(),
            "source":        "nubra_ts",
        }
    except Exception as e:
        log.debug(f"[Nubra] timeseries quote({sym}) failed: {e}")
        return None


def get_quotes_bulk(symbols: list[str]) -> dict:
    """
    Fetch live quotes for multiple symbols in parallel.
    Returns dict keyed by symbol.  Skips failed symbols silently.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(get_quote, s): s for s in symbols}
        for fut in as_completed(futs):
            sym = futs[fut]
            try:
                q = fut.result()
                if q:
                    results[sym] = q
            except Exception:
                pass
    return results


def get_nifty50_quotes() -> dict:
    """
    Fetch all NIFTY50 stocks in parallel from Nubra.
    Returns dict keyed by symbol — same schema as nse_service.get_nifty50_quotes().
    """
    from config import NIFTY50_SYMBOLS
    return get_quotes_bulk(NIFTY50_SYMBOLS)


# ── Index live quote ─────────────────────────────────────────────────────────

_INDEX_MAP = {
    "NIFTY50":   ("NIFTY",      "NIFTY 50"),
    "BANKNIFTY": ("BANKNIFTY",  "NIFTY BANK"),
    "NIFTYIT":   ("NIFTYIT",    "NIFTY IT"),
    "SENSEX":    ("SENSEX",     "SENSEX"),
    "NIFTYMID":  ("NIFTYMID50", "NIFTY MIDCAP 50"),
}


def get_index_quote(index_id: str) -> "dict | None":
    """
    Live price for an index via Nubra /optionchains/{sym}/price.
    Returns same schema as nse_service.get_nse_indices() values
    (id, name, value, change, changePercent, …).
    """
    mapping = _INDEX_MAP.get(index_id.upper())
    if not mapping:
        return None
    nubra_sym, display_name = mapping

    with _lock:
        cache_key = f"_idx_{index_id}"
        if cache_key in _quote_cache:
            return _quote_cache[cache_key]

    try:
        hdrs = _auth_headers()
        r    = _http.get(
            f"{_BASE_URL}/optionchains/{nubra_sym}/price",
            headers=hdrs,
            timeout=8,
        )
        r.raise_for_status()
        d = r.json()

        raw_price      = d.get("price", 0)
        raw_prev_close = d.get("prev_close", 0)
        change_pct     = float(d.get("change", 0) or 0)

        value      = _paise_to_inr(raw_price)
        prev_close = _paise_to_inr(raw_prev_close)
        change     = round(value - prev_close, 2)

        if value <= 0:
            return None

        result = {
            "id":            index_id.upper(),
            "name":          display_name,
            "exchange":      "NSE",
            "value":         value,
            "change":        change,
            "changePercent": round(change_pct, 4),
            "open":          value,
            "high":          value,
            "low":           value,
            "previousClose": prev_close,
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "nubra",
            "dataType":      "live",
        }

        with _lock:
            _quote_cache[cache_key] = result
        return result

    except Exception as e:
        log.debug(f"[Nubra] get_index_quote({index_id}) failed: {e}")
        return None


# ── Historical OHLCV ──────────────────────────────────────────────────────────

def get_history(symbol: str, period: str = "1y") -> list:
    """
    OHLCV history from Nubra /charts/timeseries.
    Returns list of {date, open, high, low, close, volume} dicts.
    Supports periods: 1w, 1m, 3m, 6m, 1y (intraday 3mo, daily 10y).
    Returns [] on failure.
    """
    sym        = symbol.upper().strip()
    start, end = _period_to_dates(period)

    # Intraday (< 3mo) uses 1d candles; longer also uses 1d
    fields = ["open", "high", "low", "close", "cumulative_volume"]

    payload = {
        "query": [{
            "exchange":  "NSE",
            "type":      "STOCK",
            "values":    [sym],
            "fields":    fields,
            "startDate": start,
            "endDate":   end,
            "interval":  "1d",
            "intraDay":  False,
            "realTime":  False,
        }]
    }

    try:
        hdrs = _auth_headers()
        r    = _http.post(
            f"{_BASE_URL}/charts/timeseries",
            json=payload,
            headers=hdrs,
            timeout=20,
        )
        r.raise_for_status()
        return _parse_history_response(r.json(), sym)

    except Exception as e:
        log.debug(f"[Nubra] get_history({sym}, {period}) failed: {e}")
        return []


def get_index_history(index_id: str, period: str = "3m") -> list:
    """
    OHLCV history for an index (NIFTY50, BANKNIFTY, SENSEX, etc.).
    Uses type="INDEX" in the timeseries query.
    """
    # Map our index IDs to Nubra index names
    _index_map = {
        "NIFTY50":   "NIFTY",
        "BANKNIFTY": "BANKNIFTY",
        "NIFTYIT":   "NIFTYIT",
        "SENSEX":    "SENSEX",
        "NIFTYMID":  "NIFTYMID50",
    }
    nubra_sym  = _index_map.get(index_id.upper(), index_id.upper())
    start, end = _period_to_dates(period)

    payload = {
        "query": [{
            "exchange":  "NSE",
            "type":      "INDEX",
            "values":    [nubra_sym],
            "fields":    ["open", "high", "low", "close", "cumulative_volume"],
            "startDate": start,
            "endDate":   end,
            "interval":  "1d",
            "intraDay":  False,
            "realTime":  False,
        }]
    }

    try:
        hdrs = _auth_headers()
        r    = _http.post(
            f"{_BASE_URL}/charts/timeseries",
            json=payload,
            headers=hdrs,
            timeout=20,
        )
        r.raise_for_status()
        return _parse_history_response(r.json(), nubra_sym)

    except Exception as e:
        log.debug(f"[Nubra] get_index_history({index_id}, {period}) failed: {e}")
        return []


def _parse_history_response(data: dict, symbol: str) -> list:
    """
    Normalise Nubra timeseries response → [{date, open, high, low, close, volume}]
    Prices arrive as paise integers → divide by 100.
    Timestamps arrive as nanoseconds.
    """
    try:
        results = data.get("result", [])
        if not results:
            return []

        sym_data = None
        for entry in results:
            for values_obj in entry.get("values", []):
                if symbol in values_obj:
                    sym_data = values_obj[symbol]
                    break
            if sym_data:
                break

        if not sym_data:
            return []

        def _ts_list(key):
            return {item["ts"]: item["v"] for item in sym_data.get(key, [])}

        closes  = _ts_list("close")
        opens   = _ts_list("open")
        highs   = _ts_list("high")
        lows    = _ts_list("low")
        volumes = _ts_list("cumulative_volume")

        if not closes:
            return []

        candles = []
        for ts in sorted(closes.keys()):
            close = closes[ts]
            if not close:
                continue
            candles.append({
                "date":   _ns_to_date(ts),
                "open":   _paise_to_inr(opens.get(ts, close)),
                "high":   _paise_to_inr(highs.get(ts, close)),
                "low":    _paise_to_inr(lows.get(ts, close)),
                "close":  _paise_to_inr(close),
                "volume": int(volumes.get(ts, 0) or 0),
            })

        return candles

    except Exception as e:
        log.debug(f"[Nubra] _parse_history_response failed: {e}")
        return []


# ── Holdings (live portfolio sync for Nubra users) ───────────────────────────

def get_user_holdings(user_session_token: str) -> list:
    """
    Fetch live holdings for a Nubra-connected user.
    Uses the user's own session_token (not the server token).
    Returns list of normalised holding dicts.
    """
    try:
        hdrs = {
            "Authorization": f"Bearer {user_session_token}",
            "x-device-id":   NUBRA_DEVICE_ID,
        }
        r = _http.get(f"{_BASE_URL}/portfolio/holdings", headers=hdrs, timeout=10)
        r.raise_for_status()
        data    = r.json()
        holdings = data.get("portfolio", {}).get("holdings", [])
        stats    = data.get("portfolio", {}).get("holding_stats", {})

        normalised = []
        for h in holdings:
            avg_price   = _paise_to_inr(h.get("avg_price", 0))
            ltp         = _paise_to_inr(h.get("ltp", 0))
            qty         = int(h.get("qty", 0))
            invested    = avg_price * qty
            current_val = ltp * qty
            pnl         = _paise_to_inr(h.get("net_pnl", 0)) or (current_val - invested)
            pnl_pct     = float(h.get("net_pnl_chg", 0) or 0)

            normalised.append({
                "symbol":       h.get("symbol", "").upper(),
                "name":         h.get("displayName", h.get("symbol", "")),
                "quantity":     qty,
                "avgBuyPrice":  avg_price,
                "currentPrice": ltp,
                "investedValue":invested,
                "currentValue": current_val,
                "pnl":          pnl,
                "pnlPercent":   pnl_pct,
                "exchange":     h.get("exchange", "NSE"),
                "source":       "nubra_live",
            })

        return normalised

    except Exception as e:
        log.warning(f"[Nubra] get_user_holdings failed: {e}")
        return []


# ── Health check ──────────────────────────────────────────────────────────────

def health() -> dict:
    """Returns a health dict for the /health endpoint."""
    tok = _ensure_token()
    if tok:
        if NUBRA_SESSION_TOKEN and _session_token == NUBRA_SESSION_TOKEN:
            auth_mode = "manual_session_token"
        elif NUBRA_TOTP_SECRET:
            auth_mode = "totp_auto"
        else:
            auth_mode = "unknown"
    else:
        auth_mode = "none"
    return {
        "nubra_configured": bool(NUBRA_SESSION_TOKEN or _TOTP_CONFIGURED),
        "nubra_session":    "active" if tok else "failed",
        "nubra_auth_mode":  auth_mode,
        "nubra_env":        "uat" if NUBRA_USE_UAT else "production",
    }
