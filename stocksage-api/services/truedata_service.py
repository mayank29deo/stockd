"""
TrueData Market Data Service
============================
Provides real-time tick streaming and historical OHLCV via TrueData WebSocket.

Authentication:
  TRUEDATA_USERNAME — set in .env / Railway env vars
  TRUEDATA_PASSWORD — set in .env / Railway env vars

Trial credentials (expire 18/04/2026):
  Username: Trial127  |  Password: may127  |  Port: 8086
  Covers: NSE EQ, NSE F&O, Indices, MCX, BSE EQ, BSE F&O, BSE Indices
  Symbol limit: 50 (perfect for NIFTY50)

Design:
  - Connects once at startup in a background thread
  - Subscribes to all NIFTY50 stocks + major indices
  - Caches the latest tick for every symbol in memory (< 1 ms reads)
  - Falls back gracefully if not configured or disconnected

Symbol format for TrueData:
  NSE stocks : RELIANCE, TCS, HDFCBANK (plain NSE symbol, no suffix)
  NSE indices: NIFTY-I, BANKNIFTY-I, NIFTYIT-I
  Special    : M&M works as-is on TrueData

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

log = logging.getLogger("truedata")

# ── Config ─────────────────────────────────────────────────────────────────────

TRUEDATA_USERNAME = os.getenv("TRUEDATA_USERNAME", "")
TRUEDATA_PASSWORD = os.getenv("TRUEDATA_PASSWORD", "")
_LIVE_PORT        = int(os.getenv("TRUEDATA_PORT", "8086"))

_CONFIGURED = bool(TRUEDATA_USERNAME and TRUEDATA_PASSWORD)

# TrueData index symbol names
_INDEX_SYMBOL_MAP = {
    "NIFTY50":   "NIFTY-I",
    "BANKNIFTY": "BANKNIFTY-I",
    "NIFTYIT":   "NIFTYIT-I",
    "NIFTYMID":  "NIFTYMIDCAP50-I",
    "SENSEX":    "SENSEX-I",
}
_INDEX_REVERSE_MAP = {v: k for k, v in _INDEX_SYMBOL_MAP.items()}

# ── State ──────────────────────────────────────────────────────────────────────

_lock          = threading.RLock()
_td            = None          # TD WebSocket instance
_connected     = False
_tick_cache: dict = {}         # symbol → latest normalised quote dict
_req_id_map: dict = {}         # req_id → symbol (for tick lookup)
_sym_req_map: dict = {}        # symbol → req_id
_connect_failed  = False
_connect_failed_at: float = 0.0
_subscribed_symbols: list = []

# history cache — avoid repeated bar-data calls (1h TTL)
_hist_cache = TTLCache(maxsize=200, ttl=3600)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _td_symbol(nse_symbol: str) -> str:
    """Convert our NSE symbol → TrueData symbol format."""
    # Index names
    if nse_symbol in _INDEX_SYMBOL_MAP:
        return _INDEX_SYMBOL_MAP[nse_symbol]
    # Most NSE equity symbols are identical on TrueData
    return nse_symbol


def _our_symbol(td_symbol: str) -> str:
    """Convert TrueData symbol → our NSE symbol."""
    return _INDEX_REVERSE_MAP.get(td_symbol, td_symbol)


def _normalise_tick(tick) -> "dict | None":
    """
    Convert TrueData tick object → our standard quote dict.
    TrueData tick attributes (attribute names from truedata-ws library):
      Symbol, LTP, Open, High, Low, PrevClose, Volume, Change, ChangePercent,
      BuyPrice, SellPrice, High52Week, Low52Week, Timestamp
    """
    try:
        ltp = float(getattr(tick, "LTP", 0) or 0)
        if ltp <= 0:
            return None

        td_sym  = getattr(tick, "Symbol", "")
        our_sym = _our_symbol(td_sym)

        prev_close  = float(getattr(tick, "PrevClose", 0) or 0)
        change      = float(getattr(tick, "Change", 0) or 0)
        change_pct  = float(getattr(tick, "ChangePercent", 0) or 0)
        volume      = int(getattr(tick, "Volume", 0) or 0)
        high52      = float(getattr(tick, "High52Week", 0) or 0)
        low52       = float(getattr(tick, "Low52Week", 0) or 0)
        open_       = float(getattr(tick, "Open", 0) or 0)
        high        = float(getattr(tick, "High", 0) or 0)
        low         = float(getattr(tick, "Low", 0) or 0)
        ts          = getattr(tick, "Timestamp", None)

        return {
            "symbol":        our_sym,
            "price":         round(ltp, 2),
            "open":          round(open_, 2),
            "high":          round(high, 2),
            "low":           round(low, 2),
            "prevClose":     round(prev_close, 2),
            "change":        round(change, 2),
            "changePercent": round(change_pct, 4),
            "volume":        volume,
            "weekHigh52":    round(high52, 2),
            "weekLow52":     round(low52, 2),
            "exchange":      "NSE",
            "dataSource":    "truedata",
            "timestamp":     str(ts) if ts else datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        log.debug(f"[TrueData] tick normalise error: {e}")
        return None


# ── Connection management ──────────────────────────────────────────────────────

def _on_tick(tick):
    """Called by TrueData library on every price update."""
    global _tick_cache
    try:
        q = _normalise_tick(tick)
        if q:
            with _lock:
                _tick_cache[q["symbol"]] = q
    except Exception as e:
        log.debug(f"[TrueData] tick handler error: {e}")


def _connect_and_subscribe(symbols: list):
    """
    Create TD instance, connect WebSocket, subscribe to symbols.
    Runs in a daemon thread so it doesn't block startup.
    """
    global _td, _connected, _connect_failed, _connect_failed_at
    global _req_id_map, _sym_req_map, _subscribed_symbols

    if not _CONFIGURED:
        log.info("[TrueData] Not configured (TRUEDATA_USERNAME / TRUEDATA_PASSWORD missing)")
        return

    try:
        from truedata_ws.websocket.TD import TD  # type: ignore
    except ImportError:
        log.error("[TrueData] 'truedata-ws' not installed — run: pip install truedata-ws")
        _connect_failed    = True
        _connect_failed_at = time.time()
        return

    try:
        log.info(f"[TrueData] Connecting as {TRUEDATA_USERNAME} on port {_LIVE_PORT}…")
        td_instance = TD(
            TRUEDATA_USERNAME,
            TRUEDATA_PASSWORD,
            live_port=_LIVE_PORT,
            log_level=logging.WARNING,
        )

        # Build TrueData symbol list
        td_symbols = [_td_symbol(s) for s in symbols]

        req_ids = td_instance.start_live_data(td_symbols)
        log.info(f"[TrueData] ✅ Subscribed to {len(td_symbols)} symbols")

        with _lock:
            _td         = td_instance
            _connected  = True
            _connect_failed     = False
            _connect_failed_at  = 0.0
            _subscribed_symbols = symbols

            # Map req_id → our symbol
            for i, req_id in enumerate(req_ids):
                if i < len(symbols):
                    _req_id_map[req_id]      = symbols[i]
                    _sym_req_map[symbols[i]] = req_id

        # Poll ticks in a loop — TrueData stores latest in td.live_data[req_id]
        _poll_ticks()

    except Exception as e:
        log.warning(f"[TrueData] Connection failed: {e}")
        with _lock:
            _td                = None
            _connected         = False
            _connect_failed    = True
            _connect_failed_at = time.time()


def _poll_ticks():
    """
    Continuously read td.live_data and populate _tick_cache.
    Runs until connection drops or service is shut down.
    """
    global _connected, _connect_failed, _connect_failed_at

    log.info("[TrueData] Tick poller started")
    while True:
        try:
            with _lock:
                td = _td
                req_id_map = dict(_req_id_map)

            if td is None:
                break

            for req_id, our_sym in req_id_map.items():
                try:
                    tick = td.live_data.get(req_id)
                    if tick is not None:
                        q = _normalise_tick(tick)
                        if q:
                            # Ensure symbol key matches ours (not TrueData's)
                            q["symbol"] = our_sym
                            with _lock:
                                _tick_cache[our_sym] = q
                except Exception:
                    pass

            time.sleep(1)  # poll every second

        except Exception as e:
            log.warning(f"[TrueData] Poller error: {e}")
            with _lock:
                _connected         = False
                _connect_failed    = True
                _connect_failed_at = time.time()
            break

    log.info("[TrueData] Tick poller stopped")


# ── Public API ─────────────────────────────────────────────────────────────────

def available() -> bool:
    """True if connected and at least one tick received."""
    with _lock:
        return _connected and bool(_tick_cache)


def connect(symbols: list):
    """
    Start TrueData WebSocket connection in a background thread.
    Call once at startup from main.py lifespan.
    """
    if not _CONFIGURED:
        log.info("[TrueData] Skipping connect — credentials not set")
        return

    t = threading.Thread(target=_connect_and_subscribe, args=(symbols,), daemon=True)
    t.start()
    log.info("[TrueData] Background connect thread started")


def get_quote(symbol: str) -> "dict | None":
    """Return the latest cached tick for a symbol, or None if not available."""
    with _lock:
        return _tick_cache.get(symbol.upper())


def get_nifty50_quotes() -> dict:
    """Return all currently cached quotes as {symbol: quote_dict}."""
    with _lock:
        return dict(_tick_cache)


def get_history(symbol: str, period: str = "3m") -> list:
    """
    Fetch OHLCV bar history from TrueData.
    Returns list of {date, open, high, low, close, volume} dicts.
    period: "1w", "1m", "3m", "6m", "1y"
    """
    cache_key = f"{symbol}:{period}"
    with _lock:
        if cache_key in _hist_cache:
            return _hist_cache[cache_key]

    if not _CONFIGURED:
        return []

    with _lock:
        td = _td

    if td is None:
        return []

    period_days = {"1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365}
    n_bars = period_days.get(period, 90)

    try:
        td_sym = _td_symbol(symbol)
        df = td.get_bar_data(td_sym, "D", n_bars)  # "D" = daily bars
        if df is None or df.empty:
            return []

        result = []
        for _, row in df.iterrows():
            try:
                result.append({
                    "date":   str(row.get("time", row.name))[:10],
                    "open":   round(float(row.get("open",  0)), 2),
                    "high":   round(float(row.get("high",  0)), 2),
                    "low":    round(float(row.get("low",   0)), 2),
                    "close":  round(float(row.get("close", 0)), 2),
                    "volume": int(row.get("volume", 0)),
                })
            except Exception:
                pass

        result.sort(key=lambda x: x["date"])

        with _lock:
            _hist_cache[cache_key] = result

        return result

    except Exception as e:
        log.warning(f"[TrueData] get_history({symbol}, {period}) failed: {e}")
        return []


def health() -> dict:
    """Health info for /health endpoint."""
    with _lock:
        return {
            "truedata_configured": _CONFIGURED,
            "truedata_connected":  _connected,
            "truedata_symbols":    len(_tick_cache),
            "truedata_failed":     _connect_failed,
        }


def disconnect():
    """Clean shutdown — stop streaming."""
    global _td, _connected
    with _lock:
        td = _td
        _td       = None
        _connected = False
    if td:
        try:
            td.stop_live_data()
        except Exception:
            pass
    log.info("[TrueData] Disconnected")
