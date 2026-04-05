"""
Kotak Neo API Service — pure requests, no SDK
==============================================
Uses Kotak's REST API directly, avoiding the neo-api-client SDK which
pins numpy==1.24.2 (incompatible with Python 3.13).

Auth flow (4-step, standard OAuth2 + OTP):
  1. GET  bearer token  (consumer_key:consumer_secret → base64 → Basic auth)
  2. POST view token    (mobile + password → returns sid + view_token)
  3. POST generate OTP  (sends OTP to registered mobile)
  4. POST verify OTP    (OTP → returns edit_token + edit_sid, session is live)

After step 4, edit_token + edit_sid are persisted to .env automatically.
Next server restart restores from .env — no OTP needed until token expires (~24h).

.env keys (set manually once):
  KOTAK_CONSUMER_KEY    — from Kotak Neo API Dashboard
  KOTAK_CONSUMER_SECRET — from Kotak Neo API Dashboard
  KOTAK_MOBILE          — registered mobile e.g. +917004369269
  KOTAK_PASSWORD        — Kotak account password
  KOTAK_ENVIRONMENT     — 'prod' (default) or 'uat'

Auto-persisted after first OTP (written by the service):
  KOTAK_ACCESS_TOKEN    — edit_token from step 4
  KOTAK_SID             — edit_sid from step 4
"""

import os
import base64
import threading
import logging
import requests
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("kotak_neo")

# ── Config ────────────────────────────────────────────────────────────────────

KOTAK_CONSUMER_KEY    = os.getenv("KOTAK_CONSUMER_KEY", "")
KOTAK_CONSUMER_SECRET = os.getenv("KOTAK_CONSUMER_SECRET", "")
KOTAK_MOBILE          = os.getenv("KOTAK_MOBILE", "")
KOTAK_PASSWORD        = os.getenv("KOTAK_PASSWORD", "")
KOTAK_ENVIRONMENT     = os.getenv("KOTAK_ENVIRONMENT", "prod")
KOTAK_ACCESS_TOKEN    = os.getenv("KOTAK_ACCESS_TOKEN", "")
KOTAK_SID             = os.getenv("KOTAK_SID", "")

_ENV_FILE = Path(__file__).parent.parent / ".env"

# ── URLs ──────────────────────────────────────────────────────────────────────

_IS_UAT = KOTAK_ENVIRONMENT.lower() == "uat"

_GW   = "https://nsbxapi-gw.kotaksecurities.com/"   if _IS_UAT else "https://gw-napi.kotaksecurities.com/"
_SESS = "https://nsbxapi.kotaksecurities.com/"       if _IS_UAT else "https://napi.kotaksecurities.com/"

_PATHS = {
    "oauth":      "oauth2/token",
    "view_token": "api/1.0/login/v2/validate"         if _IS_UAT else "login/1.0/login/v2/validate",
    "gen_otp":    "api/1.0/login/otp/generate"        if _IS_UAT else "login/1.0/login/otp/generate",
    "edit_token": "api/1.0/login/v2/validate"         if _IS_UAT else "login/1.0/login/v2/validate",
    "holdings":   "portfolio/1.0/portfolio/v1/holdings" if _IS_UAT else "Portfolio/1.0/portfolio/v1/holdings",
    "positions":  "orderapi/1.0/quick/user/positions"  if _IS_UAT else "Orders/2.0/quick/user/positions",
    "quotes":     "market/1.0/quotes"                  if _IS_UAT else "market/1.0/quotes",
    "scrip_search": "search/1.0/scripSearch"           if _IS_UAT else "search/1.0/scripSearch",
    "logout":     "api/1.0/logout"                     if _IS_UAT else "login/1.0/logout",
}

# ── State ─────────────────────────────────────────────────────────────────────

_lock       = threading.RLock()
_auth_state = "unconfigured"   # unconfigured|unauthenticated|otp_pending|authenticated
_tokens     = {
    "bearer":      "",   # from oauth2/token
    "view_token":  "",   # from step 2
    "sid":         "",   # session id from step 2
    "user_id":     "",   # extracted from JWT
    "edit_token":  "",   # final session token (from OTP verify or .env)
    "edit_sid":    "",   # final session sid
    "server_id":   "",
}
_token_cache = {}   # symbol → instrument_token

_http = requests.Session()
_http.headers.update({"Content-Type": "application/json", "Accept": "application/json"})

_STATE_LABELS = {
    "unconfigured":    "Set KOTAK_CONSUMER_KEY/SECRET/MOBILE/PASSWORD in .env",
    "unauthenticated": "POST /api/kotak/auth/init to receive OTP",
    "otp_pending":     "POST /api/kotak/auth/verify with the OTP",
    "authenticated":   "Authenticated and ready",
}


def _configured() -> bool:
    return bool(KOTAK_CONSUMER_KEY and KOTAK_CONSUMER_SECRET
                and KOTAK_MOBILE and KOTAK_PASSWORD)


def available() -> bool:
    return _auth_state == "authenticated"


# ── Token persistence ─────────────────────────────────────────────────────────

def _persist_tokens(edit_token: str, edit_sid: str):
    """Write tokens back to .env so restarts skip OTP."""
    try:
        text  = _ENV_FILE.read_text() if _ENV_FILE.exists() else ""
        lines = text.splitlines()

        def _upsert(lines, key, val):
            for i, line in enumerate(lines):
                if line.startswith(f"{key}="):
                    lines[i] = f"{key}={val}"
                    return lines
            lines.append(f"{key}={val}")
            return lines

        lines = _upsert(lines, "KOTAK_ACCESS_TOKEN", edit_token)
        lines = _upsert(lines, "KOTAK_SID", edit_sid)
        _ENV_FILE.write_text("\n".join(lines) + "\n")
        log.info("[KotakNeo] Tokens persisted to .env — next restart skips OTP")
    except Exception as e:
        log.warning(f"[KotakNeo] Could not write tokens to .env: {e}")


# ── Base64 helper ─────────────────────────────────────────────────────────────

def _b64(key: str, secret: str) -> str:
    return base64.b64encode(f"{key}:{secret}".encode("ascii")).decode("ascii")


# ── Auth steps ────────────────────────────────────────────────────────────────

def _step1_bearer() -> "str | None":
    """OAuth2 client credentials → bearer token."""
    try:
        r = _http.post(
            f"{_GW}{_PATHS['oauth']}",
            data={"grant_type": "client_credentials"},
            headers={
                "Authorization": f"Basic {_b64(KOTAK_CONSUMER_KEY, KOTAK_CONSUMER_SECRET)}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=15,
        )
        r.raise_for_status()
        return r.json().get("access_token")
    except Exception as e:
        log.error(f"[KotakNeo] Step1 bearer failed: {e}")
        return None


def _step2_view_token(bearer: str) -> "dict | None":
    """Login with mobile+password → view_token + sid + user_id."""
    try:
        r = _http.post(
            f"{_SESS}{_PATHS['view_token']}",
            json={"mobileNumber": KOTAK_MOBILE, "password": KOTAK_PASSWORD},
            headers={"Authorization": f"Bearer {bearer}"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json().get("data", r.json())
        return {
            "view_token": data.get("token", ""),
            "sid":        data.get("sid",   ""),
            "user_id":    data.get("ucc",   "") or data.get("userId", ""),
        }
    except Exception as e:
        log.error(f"[KotakNeo] Step2 view_token failed: {e}")
        return None


def _step3_generate_otp(bearer: str, sid: str, user_id: str) -> bool:
    """Trigger OTP to registered mobile."""
    try:
        r = _http.post(
            f"{_SESS}{_PATHS['gen_otp']}",
            json={"userId": user_id, "sendEmail": True, "isWhitelisted": True},
            headers={"Authorization": f"Bearer {bearer}", "sid": sid},
            timeout=15,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        log.error(f"[KotakNeo] Step3 generate_otp failed: {e}")
        return False


def _step4_verify_otp(bearer: str, sid: str, view_token: str,
                      mobile: str, otp: str) -> "dict | None":
    """Verify OTP → edit_token + edit_sid (the live session credentials)."""
    try:
        r = _http.post(
            f"{_SESS}{_PATHS['edit_token']}",
            json={"mobileNumber": mobile, "otp": otp},
            headers={
                "Authorization": f"Bearer {bearer}",
                "sid":  sid,
                "Auth": view_token,
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json().get("data", r.json())
        return {
            "edit_token": data.get("token",     data.get("edit_token", "")),
            "edit_sid":   data.get("sid",       data.get("edit_sid",   "")),
            "server_id":  data.get("hsServerId", ""),
        }
    except Exception as e:
        log.error(f"[KotakNeo] Step4 verify_otp failed: {e}")
        return None


# ── Public auth API ───────────────────────────────────────────────────────────

def startup_restore():
    """Called on server startup — restore session from .env tokens if present."""
    global _auth_state
    with _lock:
        if not _configured():
            _auth_state = "unconfigured"
            log.info(f"[KotakNeo] {_STATE_LABELS['unconfigured']}")
            return

        if KOTAK_ACCESS_TOKEN and KOTAK_SID:
            _tokens["edit_token"] = KOTAK_ACCESS_TOKEN
            _tokens["edit_sid"]   = KOTAK_SID
            _auth_state = "authenticated"
            log.info("[KotakNeo] Session restored from .env — no OTP needed")
        else:
            _auth_state = "unauthenticated"
            log.info(f"[KotakNeo] {_STATE_LABELS['unauthenticated']}")


def init_login() -> dict:
    """Step 1+2+3: get bearer, view_token, send OTP. POST /api/kotak/auth/init."""
    global _auth_state
    with _lock:
        if not _configured():
            return {"error": _STATE_LABELS["unconfigured"]}
        if _auth_state == "authenticated":
            return {"status": "already_authenticated", "message": "Already logged in"}

        bearer = _step1_bearer()
        if not bearer:
            return {"error": "Failed to get bearer token — check KOTAK_CONSUMER_KEY/SECRET"}

        view = _step2_view_token(bearer)
        if not view or not view.get("view_token"):
            return {"error": "Login failed — check KOTAK_MOBILE and KOTAK_PASSWORD"}

        _tokens["bearer"]     = bearer
        _tokens["view_token"] = view["view_token"]
        _tokens["sid"]        = view["sid"]
        _tokens["user_id"]    = view["user_id"]

        ok = _step3_generate_otp(bearer, view["sid"], view["user_id"])
        if not ok:
            return {"error": "Failed to send OTP"}

        _auth_state = "otp_pending"
        mobile_masked = KOTAK_MOBILE[:7] + "XXXX"
        return {"status": "otp_sent", "message": f"OTP sent to {mobile_masked}"}


def verify_otp(otp: str) -> dict:
    """Step 4: verify OTP → live session. POST /api/kotak/auth/verify."""
    global _auth_state
    with _lock:
        if _auth_state not in ("otp_pending",):
            return {"error": f"Call /api/kotak/auth/init first. State: {_auth_state}"}

        result = _step4_verify_otp(
            bearer=_tokens["bearer"],
            sid=_tokens["sid"],
            view_token=_tokens["view_token"],
            mobile=KOTAK_MOBILE,
            otp=otp,
        )
        if not result or not result.get("edit_token"):
            _auth_state = "unauthenticated"
            return {"error": "OTP verification failed — try /api/kotak/auth/init again"}

        _tokens["edit_token"] = result["edit_token"]
        _tokens["edit_sid"]   = result["edit_sid"]
        _tokens["server_id"]  = result.get("server_id", "")
        _auth_state = "authenticated"

        _persist_tokens(result["edit_token"], result["edit_sid"])
        return {
            "status":  "authenticated",
            "message": "Kotak Neo session active. Tokens saved — next restart skips OTP.",
        }


def logout() -> dict:
    global _auth_state
    with _lock:
        _tokens["edit_token"] = ""
        _tokens["edit_sid"]   = ""
        _auth_state = "unauthenticated"
        _persist_tokens("", "")
        return {"status": "logged_out"}


# ── Auth headers for API calls ────────────────────────────────────────────────

def _api_headers() -> dict:
    return {
        "Authorization": f"Bearer {_tokens['edit_token']}",
        "sid":           _tokens["edit_sid"],
        "Auth":          _tokens["edit_token"],
        "neo-fin-key":   "neotradeapi",
    }


# ── Quotes ────────────────────────────────────────────────────────────────────

def _get_instrument_token(symbol: str) -> "str | None":
    sym = symbol.upper().strip()
    if sym in _token_cache:
        return _token_cache[sym]
    try:
        r = _http.get(
            f"{_GW}{_PATHS['scrip_search']}",
            params={"symbol": sym, "exchange": "NSE"},
            headers=_api_headers(),
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if items:
            token = str(items[0].get("pSymbol", ""))
            if token:
                _token_cache[sym] = token
                return token
    except Exception as e:
        log.debug(f"[KotakNeo] scrip_search({sym}) failed: {e}")
    return None


def get_quote(symbol: str) -> "dict | None":
    if not available():
        return None
    token = _get_instrument_token(symbol)
    if not token:
        return None
    try:
        r = _http.get(
            f"{_GW}{_PATHS['quotes']}",
            params={"instrument_token": token, "exchange_segment": "nse_cm"},
            headers=_api_headers(),
            timeout=10,
        )
        r.raise_for_status()
        data  = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            return None
        item       = items[0]
        ltp        = float(item.get("last_traded_price", 0) or 0)
        prev_close = float(item.get("close", ltp) or ltp)
        change     = round(ltp - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 4)
        ohlc       = item.get("ohlc") or {}
        if ltp <= 0:
            return None
        return {
            "symbol":        symbol.upper(),
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
    try:
        r = _http.get(
            f"{_GW}{_PATHS['holdings']}",
            headers=_api_headers(),
            timeout=15,
        )
        r.raise_for_status()
        data  = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            return []
        normalised = []
        for h in items:
            avg_price   = float(h.get("averagePrice",  0) or 0)
            close_price = float(h.get("closingPrice",  0) or 0)
            qty         = int(h.get("quantity",        0) or 0)
            invested    = round(avg_price * qty, 2)
            current_val = round(close_price * qty, 2)
            pnl         = round(current_val - invested, 2)
            pnl_pct     = round((pnl / invested * 100) if invested else 0, 2)
            normalised.append({
                "symbol":        h.get("symbol", "").upper(),
                "name":          h.get("displaySymbol", h.get("symbol", "")),
                "quantity":      qty,
                "avgBuyPrice":   avg_price,
                "currentPrice":  close_price,
                "investedValue": invested,
                "currentValue":  current_val,
                "pnl":           pnl,
                "pnlPercent":    pnl_pct,
                "exchange":      "NSE" if "nse" in h.get("exchangeSegment", "").lower() else "BSE",
                "source":        "kotak_neo",
            })
        return normalised
    except Exception as e:
        log.warning(f"[KotakNeo] get_holdings() failed: {e}")
        return []


# ── Positions ─────────────────────────────────────────────────────────────────

def get_positions() -> list:
    if not available():
        return []
    try:
        r = _http.get(
            f"{_GW}{_PATHS['positions']}",
            headers=_api_headers(),
            timeout=15,
        )
        r.raise_for_status()
        data  = r.json()
        items = data if isinstance(data, list) else data.get("data", [])
        if not items:
            return []
        normalised = []
        for p in items:
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
        "kotak_configured":    _configured(),
        "kotak_state":         _auth_state,
        "kotak_message":       _STATE_LABELS.get(_auth_state, _auth_state),
        "kotak_env":           KOTAK_ENVIRONMENT,
        "kotak_token_cached":  bool(KOTAK_ACCESS_TOKEN or _tokens.get("edit_token")),
    }
