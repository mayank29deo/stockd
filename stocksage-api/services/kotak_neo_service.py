"""
Kotak Neo API Service
=====================
Integrates Kotak Neo trading API for:
  - Portfolio holdings sync (live P&L from user's Kotak account)
  - Live quotes via Kotak's market data feed

Auth flow:
  On startup: tries KOTAK_ACCESS_TOKEN + KOTAK_SID from .env (persisted after first OTP).
  First time only: POST /api/kotak/auth/init → OTP to mobile → POST /api/kotak/auth/verify
  After verify, token+sid are written back to .env automatically — no OTP on next restart.

.env keys (all you need to set manually):
  KOTAK_CONSUMER_KEY    — from Kotak Neo API Dashboard
  KOTAK_CONSUMER_SECRET — from Kotak Neo API Dashboard
  KOTAK_MOBILE          — registered mobile e.g. +917004369269
  KOTAK_PASSWORD        — Kotak account password
  KOTAK_ENVIRONMENT     — 'prod' (default) or 'uat'

Auto-persisted after first OTP (written to .env by the service):
  KOTAK_ACCESS_TOKEN    — JWT token from session_2fa (valid ~24h)
  KOTAK_SID             — session ID from session_2fa
"""

import os
import threading
import logging
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("kotak_neo")

_ENV_FILE = Path(__file__).parent.parent / ".env"

# ── Config ────────────────────────────────────────────────────────────────────

KOTAK_CONSUMER_KEY    = os.getenv("KOTAK_CONSUMER_KEY", "")
KOTAK_CONSUMER_SECRET = os.getenv("KOTAK_CONSUMER_SECRET", "")
KOTAK_MOBILE          = os.getenv("KOTAK_MOBILE", "")
KOTAK_PASSWORD        = os.getenv("KOTAK_PASSWORD", "")
KOTAK_ENVIRONMENT     = os.getenv("KOTAK_ENVIRONMENT", "prod")
KOTAK_ACCESS_TOKEN    = os.getenv("KOTAK_ACCESS_TOKEN", "")
KOTAK_SID             = os.getenv("KOTAK_SID", "")

# ── State ─────────────────────────────────────────────────────────────────────

_lock        = threading.RLock()
_client      = None
_auth_state  = "unconfigured"
_token_cache = {}   # symbol → instrument_token

_STATE_LABELS = {
    "unconfigured":    "Set KOTAK_CONSUMER_KEY, KOTAK_CONSUMER_SECRET, KOTAK_MOBILE, KOTAK_PASSWORD in .env",
    "unauthenticated": "Credentials set — POST /api/kotak/auth/init to receive OTP",
    "otp_pending":     "OTP sent — POST /api/kotak/auth/verify with the OTP code",
    "authenticated":   "Authenticated and ready",
}


def _configured() -> bool:
    return bool(KOTAK_CONSUMER_KEY and KOTAK_CONSUMER_SECRET
                and KOTAK_MOBILE and KOTAK_PASSWORD)


def available() -> bool:
    return _auth_state == "authenticated"


# ── Persist token back to .env ────────────────────────────────────────────────

def _persist_tokens(access_token: str, sid: str):
    """Write KOTAK_ACCESS_TOKEN and KOTAK_SID back to .env so restarts skip OTP."""
    try:
        text = _ENV_FILE.read_text() if _ENV_FILE.exists() else ""
        lines = text.splitlines()

        def _set(lines, key, val):
            for i, line in enumerate(lines):
                if line.startswith(f"{key}="):
                    lines[i] = f"{key}={val}"
                    return lines
            lines.append(f"{key}={val}")
            return lines

        lines = _set(lines, "KOTAK_ACCESS_TOKEN", access_token)
        lines = _set(lines, "KOTAK_SID", sid)
        _ENV_FILE.write_text("\n".join(lines) + "\n")
        log.info("[KotakNeo] Tokens persisted to .env — restarts won't need OTP until session expires")
    except Exception as e:
        log.warning(f"[KotakNeo] Could not persist tokens to .env: {e}")


# ── Client init ───────────────────────────────────────────────────────────────

def _init_client():
    """
    Create NeoAPI client. If KOTAK_ACCESS_TOKEN+SID exist, restore session
    directly without OTP. Otherwise set state to 'unauthenticated'.
    """
    global _client, _auth_state

    if not _configured():
        return None

    try:
        from neo_api_client import NeoAPI
    except ImportError:
        log.error("[KotakNeo] neo_api_client not installed — run: "
                  "pip install 'git+https://github.com/Kotak-Neo/kotak-neo-api.git#egg=neo_api_client'")
        return None

    # Try restoring existing session (no OTP needed)
    if KOTAK_ACCESS_TOKEN and KOTAK_SID:
        try:
            client = NeoAPI(
                consumer_key=KOTAK_CONSUMER_KEY,
                consumer_secret=KOTAK_CONSUMER_SECRET,
                environment=KOTAK_ENVIRONMENT,
                access_token=KOTAK_ACCESS_TOKEN,
                neo_fin_key=None,
            )
            # Patch in the sid so the client uses it
            if hasattr(client, 'configuration'):
                client.configuration.sid = KOTAK_SID
            _client     = client
            _auth_state = "authenticated"
            log.info("[KotakNeo] Session restored from .env tokens — no OTP needed")
            return _client
        except Exception as e:
            log.warning(f"[KotakNeo] Token restore failed ({e}) — will need fresh OTP")

    # Fresh client — needs login + OTP
    try:
        _client = NeoAPI(
            consumer_key=KOTAK_CONSUMER_KEY,
            consumer_secret=KOTAK_CONSUMER_SECRET,
            environment=KOTAK_ENVIRONMENT,
            access_token=None,
            neo_fin_key=None,
        )
        _auth_state = "unauthenticated"
        return _client
    except Exception as e:
        log.error(f"[KotakNeo] Failed to init NeoAPI client: {e}")
        return None


def _get_client():
    global _client
    with _lock:
        if _client is None:
            _init_client()
        return _client


# ── Auth ──────────────────────────────────────────────────────────────────────

def startup_restore():
    """Called on server startup — restores session from .env tokens if available."""
    _get_client()
    log.info(f"[KotakNeo] Startup state: {_auth_state} — {_STATE_LABELS.get(_auth_state, '')}")


def init_login() -> dict:
    """Step 1: Send OTP to mobile. Call POST /api/kotak/auth/init."""
    global _auth_state
    with _lock:
        client = _get_client()
        if not client:
            return {"error": _STATE_LABELS["unconfigured"]}
        if _auth_state == "authenticated":
            return {"status": "already_authenticated", "message": "Already logged in"}
        try:
            resp = client.login(mobilenumber=KOTAK_MOBILE, password=KOTAK_PASSWORD)
            log.info(f"[KotakNeo] Login initiated: {resp}")
            _auth_state = "otp_pending"
            return {"status": "otp_sent", "message": f"OTP sent to {KOTAK_MOBILE[:7]}XXXX"}
        except Exception as e:
            log.error(f"[KotakNeo] Login failed: {e}")
            return {"error": str(e)}


def verify_otp(otp: str) -> dict:
    """Step 2: Complete 2FA. Call POST /api/kotak/auth/verify with {"otp": "123456"}."""
    global _auth_state
    with _lock:
        if _auth_state not in ("otp_pending", "unauthenticated"):
            return {"error": f"Call /api/kotak/auth/init first. State: {_auth_state}"}
        client = _get_client()
        if not client:
            return {"error": "Client not initialized"}
        try:
            resp = client.session_2fa(OTP=otp)
            log.info(f"[KotakNeo] 2FA complete")
            _auth_state = "authenticated"

            # Persist token + sid so next restart skips OTP
            token = (resp or {}).get("token", "") if isinstance(resp, dict) else ""
            sid   = (resp or {}).get("sid",   "") if isinstance(resp, dict) else ""
            if token and sid:
                _persist_tokens(token, sid)

            return {"status": "authenticated", "message": "Kotak Neo session active. Tokens saved to .env — no OTP needed on next restart."}
        except Exception as e:
            log.error(f"[KotakNeo] 2FA failed: {e}")
            _auth_state = "unauthenticated"
            return {"error": str(e)}


def logout() -> dict:
    """Clear session and remove persisted tokens from .env."""
    global _client, _auth_state
    with _lock:
        _client     = None
        _auth_state = "unauthenticated"
        _persist_tokens("", "")
        return {"status": "logged_out"}


# ── Token lookup ──────────────────────────────────────────────────────────────

def _get_instrument_token(symbol: str) -> "str | None":
    sym = symbol.upper().strip()
    if sym in _token_cache:
        return _token_cache[sym]
    client = _get_client()
    if not client or not available():
        return None
    try:
        resp = client.search_scrip(exchange_segment="nse_cm", symbol=sym)
        data = resp if isinstance(resp, list) else (resp or {}).get("data", [])
        if data:
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
        item       = data[0]
        ltp        = float(item.get("last_traded_price", 0) or 0)
        prev_close = float(item.get("close", ltp) or ltp)
        change     = round(ltp - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 4)
        ohlc       = item.get("ohlc") or {}
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
                "symbol":      p.get("trdSym", p.get("symbol", "")).upper(),
                "quantity":    qty,
                "avgBuyPrice": avg_price,
                "currentPrice":ltp,
                "pnl":         round(pnl, 2),
                "pnlPercent":  round((pnl / (avg_price * abs(qty)) * 100)
                                     if avg_price and qty else 0, 2),
                "exchange":    "NSE",
                "product":     p.get("prod", "MIS"),
                "source":      "kotak_neo",
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
        "kotak_token_cached": bool(KOTAK_ACCESS_TOKEN),
    }
