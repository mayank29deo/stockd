"""
Kotak Neo API Service
=====================
Integrates Kotak Neo trading API for:
  - Portfolio holdings sync (live P&L from user's Kotak account)
  - Live quotes via Kotak's market data feed
  - Order placement (future)

Auth flow (interactive — requires OTP):
  1. init_login()  → sends OTP to registered mobile
  2. verify_otp(otp) → completes 2FA, marks service as authenticated

.env keys:
  KOTAK_CONSUMER_KEY    — from Kotak Neo API Dashboard
  KOTAK_CONSUMER_SECRET — from Kotak Neo API Dashboard
  KOTAK_MOBILE          — registered mobile with country code (+91...)
  KOTAK_PASSWORD        — account password / PIN
  KOTAK_ENVIRONMENT     — 'prod' (default) or 'uat'

Authentication persists in-process until server restart. Re-trigger via
POST /api/kotak/auth/init + POST /api/kotak/auth/verify.
"""

import os
import threading
import logging
from datetime import datetime, timezone

log = logging.getLogger("kotak_neo")

# ── Config ────────────────────────────────────────────────────────────────────

KOTAK_CONSUMER_KEY    = os.getenv("KOTAK_CONSUMER_KEY", "")
KOTAK_CONSUMER_SECRET = os.getenv("KOTAK_CONSUMER_SECRET", "")
KOTAK_MOBILE          = os.getenv("KOTAK_MOBILE", "")
KOTAK_PASSWORD        = os.getenv("KOTAK_PASSWORD", "")
KOTAK_ENVIRONMENT     = os.getenv("KOTAK_ENVIRONMENT", "prod")

# ── State ─────────────────────────────────────────────────────────────────────

_lock        = threading.RLock()
_client      = None          # NeoAPI instance
_auth_state  = "unconfigured"  # unconfigured | unauthenticated | otp_pending | authenticated
_token_cache = {}            # symbol (str) → instrument_token (str)

_STATE_LABELS = {
    "unconfigured":    "Kotak Neo credentials not set in .env",
    "unauthenticated": "Credentials set — call /api/kotak/auth/init to start login",
    "otp_pending":     "OTP sent — call /api/kotak/auth/verify with the OTP",
    "authenticated":   "Authenticated and ready",
}


def _configured() -> bool:
    return bool(KOTAK_CONSUMER_KEY and KOTAK_CONSUMER_SECRET
                and KOTAK_MOBILE and KOTAK_PASSWORD)


def available() -> bool:
    """Returns True only when fully authenticated and ready to serve requests."""
    return _auth_state == "authenticated"


def _get_client():
    """Return the NeoAPI client, initializing if needed. NOT authenticated."""
    global _client, _auth_state
    if _client is not None:
        return _client
    if not _configured():
        return None
    try:
        from neo_api_client import NeoAPI
        _client = NeoAPI(
            consumer_key=KOTAK_CONSUMER_KEY,
            consumer_secret=KOTAK_CONSUMER_SECRET,
            environment=KOTAK_ENVIRONMENT,
            access_token=None,
            neo_fin_key=None,
        )
        _auth_state = "unauthenticated"
        return _client
    except ImportError:
        log.error("[KotakNeo] neo_api_client not installed. Run: "
                  "pip install 'git+https://github.com/Kotak-Neo/kotak-neo-api.git#egg=neo_api_client'")
        return None
    except Exception as e:
        log.error(f"[KotakNeo] Failed to init NeoAPI client: {e}")
        return None


# ── Auth ──────────────────────────────────────────────────────────────────────

def init_login() -> dict:
    """
    Step 1: Initiate login — sends OTP to the registered mobile number.
    Call this from POST /api/kotak/auth/init.
    Returns {"status": "otp_sent"} or {"error": "..."}.
    """
    global _auth_state
    with _lock:
        client = _get_client()
        if not client:
            return {"error": "Kotak Neo not configured. Set KOTAK_CONSUMER_KEY, "
                             "KOTAK_CONSUMER_SECRET, KOTAK_MOBILE, KOTAK_PASSWORD in .env"}
        try:
            resp = client.login(mobilenumber=KOTAK_MOBILE, password=KOTAK_PASSWORD)
            log.info(f"[KotakNeo] Login initiated: {resp}")
            _auth_state = "otp_pending"
            return {"status": "otp_sent", "message": f"OTP sent to {KOTAK_MOBILE[:6]}XXXX"}
        except Exception as e:
            log.error(f"[KotakNeo] Login failed: {e}")
            return {"error": str(e)}


def verify_otp(otp: str) -> dict:
    """
    Step 2: Complete 2FA with OTP received on mobile.
    Call from POST /api/kotak/auth/verify.
    Returns {"status": "authenticated"} or {"error": "..."}.
    """
    global _auth_state
    with _lock:
        if _auth_state not in ("otp_pending", "unauthenticated"):
            return {"error": f"Call /api/kotak/auth/init first. Current state: {_auth_state}"}
        client = _get_client()
        if not client:
            return {"error": "Client not initialized"}
        try:
            resp = client.session_2fa(OTP=otp)
            log.info(f"[KotakNeo] 2FA complete: {resp}")
            _auth_state = "authenticated"
            return {"status": "authenticated", "message": "Kotak Neo session active"}
        except Exception as e:
            log.error(f"[KotakNeo] 2FA failed: {e}")
            _auth_state = "unauthenticated"
            return {"error": str(e)}


# ── Token lookup ──────────────────────────────────────────────────────────────

def _get_instrument_token(symbol: str) -> "str | None":
    """
    Map NSE symbol (e.g. "RELIANCE") to Kotak numeric instrument token.
    Cached in _token_cache to avoid repeated API calls.
    """
    sym = symbol.upper().strip()
    if sym in _token_cache:
        return _token_cache[sym]

    client = _get_client()
    if not client or not available():
        return None

    try:
        resp = client.search_scrip(exchange_segment="nse_cm", symbol=sym)
        # resp is typically a dict with "data" list
        data = resp if isinstance(resp, list) else (resp or {}).get("data", [])
        if data:
            # pSymbol is the numeric token
            token = str(data[0].get("pSymbol", ""))
            if token:
                with _lock:
                    _token_cache[sym] = token
                return token
    except Exception as e:
        log.debug(f"[KotakNeo] search_scrip({sym}) failed: {e}")
    return None


# ── Quotes ────────────────────────────────────────────────────────────────────

def get_quote(symbol: str) -> "dict | None":
    """
    Live quote for an NSE stock via Kotak Neo.
    Returns normalised quote dict or None on failure.
    """
    if not available():
        return None

    token = _get_instrument_token(symbol)
    if not token:
        return None

    client = _get_client()
    try:
        resp = client.quotes(
            instrument_tokens=[{"instrument_token": token, "exchange_segment": "nse_cm"}],
            quote_type="ohlc",
        )
        data = resp if isinstance(resp, list) else (resp or {}).get("data", [])
        if not data:
            return None

        item = data[0]
        ltp        = float(item.get("last_traded_price", 0) or 0)
        prev_close = float(item.get("close", ltp) or ltp)
        change     = round(ltp - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 4)

        ohlc = item.get("ohlc") or {}

        if ltp <= 0:
            return None

        return {
            "symbol":        symbol.upper(),
            "name":          item.get("trading_symbol", symbol.upper()),
            "price":         round(ltp, 2),
            "previousClose": round(prev_close, 2),
            "change":        change,
            "changePercent": change_pct,
            "open":          float(ohlc.get("open", ltp) or ltp),
            "high":          float(ohlc.get("high", ltp) or ltp),
            "low":           float(ohlc.get("low",  ltp) or ltp),
            "volume":        int(item.get("volume", 0) or 0),
            "weekHigh52":    float(item.get("52week_high", 0) or 0),
            "weekLow52":     float(item.get("52week_low",  0) or 0),
            "exchange":      "NSE",
            "currency":      "INR",
            "lastUpdated":   datetime.now(timezone.utc).isoformat(),
            "source":        "kotak_neo",
        }
    except Exception as e:
        log.debug(f"[KotakNeo] get_quote({symbol}) failed: {e}")
        return None


# ── Holdings ──────────────────────────────────────────────────────────────────

def get_holdings() -> list:
    """
    Fetch portfolio holdings from the authenticated Kotak Neo account.
    Returns list of normalised holding dicts.
    """
    if not available():
        return []

    client = _get_client()
    try:
        resp = client.holdings("")
        data = resp if isinstance(resp, list) else (resp or {}).get("data", [])
        if not data:
            return []

        normalised = []
        for h in data:
            avg_price   = float(h.get("averagePrice", 0) or 0)
            close_price = float(h.get("closingPrice",  0) or 0)
            qty         = int(h.get("quantity", 0) or 0)
            invested    = round(avg_price * qty, 2)
            current_val = round(close_price * qty, 2)
            pnl         = round(current_val - invested, 2)
            pnl_pct     = round((pnl / invested * 100) if invested else 0, 2)

            normalised.append({
                "symbol":          h.get("symbol", "").upper(),
                "name":            h.get("displaySymbol", h.get("symbol", "")),
                "quantity":        qty,
                "avgBuyPrice":     avg_price,
                "currentPrice":    close_price,
                "investedValue":   invested,
                "currentValue":    current_val,
                "pnl":             pnl,
                "pnlPercent":      pnl_pct,
                "exchange":        "NSE" if h.get("exchangeSegment", "").startswith("nse") else "BSE",
                "instrumentToken": str(h.get("instrumentToken", "")),
                "holdingCost":     float(h.get("holdingCost", invested) or invested),
                "source":          "kotak_neo",
            })

        return normalised

    except Exception as e:
        log.warning(f"[KotakNeo] get_holdings() failed: {e}")
        return []


# ── Positions ─────────────────────────────────────────────────────────────────

def get_positions() -> list:
    """
    Fetch intraday positions from Kotak Neo.
    Returns list of position dicts.
    """
    if not available():
        return []

    client = _get_client()
    try:
        resp = client.positions()
        data = resp if isinstance(resp, list) else (resp or {}).get("data", [])
        if not data:
            return []

        normalised = []
        for p in data:
            qty       = int(p.get("netQty", p.get("quantity", 0)) or 0)
            avg_price = float(p.get("avgPrice", 0) or 0)
            ltp       = float(p.get("ltp", avg_price) or avg_price)
            pnl       = float(p.get("unrealisedPnl", 0) or 0) or round((ltp - avg_price) * qty, 2)

            normalised.append({
                "symbol":        p.get("trdSym", p.get("symbol", "")).upper(),
                "quantity":      qty,
                "avgBuyPrice":   avg_price,
                "currentPrice":  ltp,
                "pnl":           round(pnl, 2),
                "pnlPercent":    round((pnl / (avg_price * abs(qty)) * 100)
                                       if avg_price and qty else 0, 2),
                "exchange":      "NSE",
                "product":       p.get("prod", "MIS"),
                "source":        "kotak_neo",
            })

        return normalised

    except Exception as e:
        log.warning(f"[KotakNeo] get_positions() failed: {e}")
        return []


# ── Health ────────────────────────────────────────────────────────────────────

def health() -> dict:
    return {
        "kotak_configured": _configured(),
        "kotak_state":      _auth_state,
        "kotak_message":    _STATE_LABELS.get(_auth_state, _auth_state),
        "kotak_env":        KOTAK_ENVIRONMENT,
    }
