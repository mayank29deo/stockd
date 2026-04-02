"""
WebSocket Hub — /ws/quotes
==========================
Maintains a single backend price-polling loop and fans out live price updates
to all connected browser clients.

Architecture:
  Nubra REST (5s) → FastAPI WS hub → 1000 browsers
  NSE  REST (10s) ↗  (fallback)

Each connected client receives:
  { "type": "prices", "data": { "RELIANCE": { price, changePercent, ... }, ... } }
  { "type": "status", "market_open": bool, "source": "nubra"|"nse"|"snapshot" }

The poller runs as a background asyncio task started in main.py lifespan.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

log = logging.getLogger("ws_hub")

router = APIRouter(tags=["websocket"])

# ── Connected clients ─────────────────────────────────────────────────────────

_clients: set[WebSocket] = set()
_clients_lock = asyncio.Lock()

# ── Latest price cache (shared between poller and clients) ────────────────────

_price_cache: dict = {}          # symbol → quote dict
_cache_ts:    float = 0.0        # unix timestamp of last successful fetch
_market_open: bool  = False
_data_source:  str  = "unknown"

# ── Polling intervals ─────────────────────────────────────────────────────────

_NUBRA_INTERVAL = 5    # seconds — during market hours (Nubra)
_NSE_INTERVAL   = 10   # seconds — fallback (NSE unofficial API)
_CLOSED_INTERVAL= 60   # seconds — market closed (no point polling fast)


# ── Broadcaster ───────────────────────────────────────────────────────────────

async def _broadcast(message: dict):
    """Send a JSON message to all connected WebSocket clients. Drop dead ones."""
    if not _clients:
        return
    payload = json.dumps(message)
    dead = set()
    async with _clients_lock:
        clients = set(_clients)

    for ws in clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)

    if dead:
        async with _clients_lock:
            _clients.difference_update(dead)


# ── Price poller (background task) ────────────────────────────────────────────

async def _poll_once():
    """
    Fetch the latest NIFTY50 quotes.
    Tries: Nubra → NSE → snapshot (in that order).
    Updates _price_cache and _data_source.
    """
    global _price_cache, _cache_ts, _market_open, _data_source

    from services.yahoo_service import get_market_status
    from services import nubra_service as nubra
    from services.nse_service import get_nifty50_quotes as nse_quotes
    from services import snapshot_service as snap

    status    = get_market_status()
    is_open   = status.get("isOpen", False)
    _market_open = is_open

    new_prices = {}
    source     = "unknown"

    # 1. Nubra (fastest, real-time)
    if nubra.available():
        try:
            quotes = nubra.get_nifty50_quotes()
            if quotes:
                new_prices = quotes
                source     = "nubra"
        except Exception as e:
            log.debug(f"[WS poller] Nubra fetch failed: {e}")

    # 2. NSE batch (free, reliable, all 50 in one call)
    if not new_prices:
        try:
            quotes = nse_quotes()
            if quotes:
                new_prices = quotes
                source     = "nse"
        except Exception as e:
            log.debug(f"[WS poller] NSE fetch failed: {e}")

    # 3. Snapshot fallback (D-1, always available)
    if not new_prices:
        snaps = snap.get_all_quotes_snapshot()
        if snaps:
            new_prices = {q["symbol"]: q for q in snaps}
            source     = "snapshot"

    if new_prices:
        _price_cache = new_prices
        _cache_ts    = time.time()
        _data_source = source

    return new_prices, source, is_open


async def run_price_poller():
    """
    Infinite loop that polls prices and broadcasts to all connected clients.
    Started once from main.py lifespan as an asyncio background task.
    """
    log.info("[WS poller] Started")

    while True:
        try:
            prices, source, is_open = await asyncio.to_thread(_poll_once_sync)

            if prices and _clients:
                await _broadcast({
                    "type":        "prices",
                    "data":        prices,
                    "source":      source,
                    "market_open": is_open,
                    "ts":          datetime.now(timezone.utc).isoformat(),
                })

            interval = (
                _NUBRA_INTERVAL if (source == "nubra" and is_open)
                else _NSE_INTERVAL if (source == "nse" and is_open)
                else _CLOSED_INTERVAL
            )

        except Exception as e:
            log.warning(f"[WS poller] Error: {e}")
            interval = _NSE_INTERVAL

        await asyncio.sleep(interval)


def _poll_once_sync():
    """Synchronous wrapper around _poll_once so asyncio.to_thread can call it."""
    from services.yahoo_service import get_market_status
    from services import nubra_service as nubra
    from services.nse_service import get_nifty50_quotes as nse_quotes
    from services import snapshot_service as snap

    status = get_market_status()
    is_open = status.get("isOpen", False)

    new_prices = {}
    source = "unknown"

    if nubra.available():
        try:
            quotes = nubra.get_nifty50_quotes()
            if quotes:
                new_prices = quotes
                source = "nubra"
        except Exception:
            pass

    if not new_prices:
        try:
            quotes = nse_quotes()
            if quotes:
                new_prices = quotes
                source = "nse"
        except Exception:
            pass

    if not new_prices:
        snaps = snap.get_all_quotes_snapshot()
        if snaps:
            new_prices = {q["symbol"]: q for q in snaps}
            source = "snapshot"

    return new_prices, source, is_open


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/quotes")
async def quotes_ws(websocket: WebSocket):
    """
    Frontend connects here to receive live price pushes.

    On connect:
      - Immediately sends the current cached prices (no wait for next poll)
      - Sends a market status message

    Keeps connection alive until client disconnects.
    """
    await websocket.accept()

    async with _clients_lock:
        _clients.add(websocket)

    log.info(f"[WS] Client connected. Total: {len(_clients)}")

    try:
        # Immediately push current cache so the UI doesn't wait 5s
        if _price_cache:
            await websocket.send_text(json.dumps({
                "type":        "prices",
                "data":        _price_cache,
                "source":      _data_source,
                "market_open": _market_open,
                "ts":          datetime.now(timezone.utc).isoformat(),
            }))

        await websocket.send_text(json.dumps({
            "type":        "status",
            "market_open": _market_open,
            "source":      _data_source,
            "clients":     len(_clients),
            "cache_age_s": round(time.time() - _cache_ts, 1) if _cache_ts else None,
        }))

        # Keep alive — wait for client to disconnect (or send pings)
        while True:
            try:
                # Wait for any message from client (ping/pong keepalive)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                # Echo pings
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send keepalive to detect dead connections
                await websocket.send_text(json.dumps({"type": "keepalive"}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.debug(f"[WS] Client error: {e}")
    finally:
        async with _clients_lock:
            _clients.discard(websocket)
        log.info(f"[WS] Client disconnected. Total: {len(_clients)}")


@router.get("/ws/status")
async def ws_status():
    """Debug endpoint — shows current WS hub state."""
    return {
        "connected_clients": len(_clients),
        "data_source":       _data_source,
        "market_open":       _market_open,
        "symbols_cached":    len(_price_cache),
        "cache_age_seconds": round(time.time() - _cache_ts, 1) if _cache_ts else None,
        "last_update":       datetime.fromtimestamp(_cache_ts, tz=timezone.utc).isoformat() if _cache_ts else None,
    }
