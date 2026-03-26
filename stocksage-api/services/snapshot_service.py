"""
SQLite-based daily snapshot service.

Saves all NIFTY50 quotes, indices, and fundamentals at market close (3:35 PM IST).
When market is closed, all endpoints serve from this D-1 snapshot instead of
hammering unreliable live APIs. The snapshot also ensures data is always
available even if NSE/yfinance/EODHD are temporarily down.

DB: stocksage_snapshot.db (created automatically next to this file)
"""
import sqlite3
import json
import os
import threading
from datetime import datetime, timezone
import pytz

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "stocksage_snapshot.db")
_lock = threading.Lock()
IST = pytz.timezone("Asia/Kolkata")


# ── DB bootstrap ─────────────────────────────────────────────────────────────

def _conn():
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    """Create tables if they don't exist. Safe to call on every startup."""
    with _conn() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS quote_snapshots (
                symbol        TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                data          TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS index_snapshots (
                index_id      TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                data          TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_snapshots (
                symbol        TEXT NOT NULL,
                period        TEXT NOT NULL,
                snapshot_date TEXT NOT NULL,
                data          TEXT NOT NULL,
                updated_at    TEXT NOT NULL,
                PRIMARY KEY (symbol, period)
            );
            CREATE TABLE IF NOT EXISTS fundamental_snapshots (
                symbol        TEXT PRIMARY KEY,
                snapshot_date TEXT NOT NULL,
                data          TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );
        """)


# ── Writers ───────────────────────────────────────────────────────────────────

def save_quotes_snapshot(quotes: dict):
    """
    quotes: {symbol: quote_dict}  — typically the full NSE /api/equity-stockIndices
    response after enriching with sector/verdict.
    """
    if not quotes:
        return
    now_ist = datetime.now(IST)
    date_str = now_ist.strftime("%Y-%m-%d")
    now_utc = datetime.now(timezone.utc).isoformat()
    with _lock:
        try:
            with _conn() as db:
                db.executemany(
                    "INSERT OR REPLACE INTO quote_snapshots "
                    "(symbol, snapshot_date, data, updated_at) VALUES (?,?,?,?)",
                    [(sym, date_str, json.dumps(data), now_utc)
                     for sym, data in quotes.items()]
                )
            print(f"[Snapshot] Saved {len(quotes)} quotes for {date_str}")
        except Exception as e:
            print(f"[Snapshot] Error saving quotes: {e}")


def save_indices_snapshot(indices: dict):
    """indices: {index_id: index_dict}"""
    if not indices:
        return
    now_ist = datetime.now(IST)
    date_str = now_ist.strftime("%Y-%m-%d")
    now_utc = datetime.now(timezone.utc).isoformat()
    with _lock:
        try:
            with _conn() as db:
                db.executemany(
                    "INSERT OR REPLACE INTO index_snapshots "
                    "(index_id, snapshot_date, data, updated_at) VALUES (?,?,?,?)",
                    [(idx_id, date_str, json.dumps(data), now_utc)
                     for idx_id, data in indices.items()]
                )
            print(f"[Snapshot] Saved {len(indices)} indices for {date_str}")
        except Exception as e:
            print(f"[Snapshot] Error saving indices: {e}")


def save_history_snapshot(symbol: str, period: str, history: list):
    if not history:
        return
    now_ist = datetime.now(IST)
    date_str = now_ist.strftime("%Y-%m-%d")
    now_utc = datetime.now(timezone.utc).isoformat()
    with _lock:
        try:
            with _conn() as db:
                db.execute(
                    "INSERT OR REPLACE INTO history_snapshots "
                    "(symbol, period, snapshot_date, data, updated_at) VALUES (?,?,?,?,?)",
                    (symbol.upper(), period, date_str, json.dumps(history), now_utc)
                )
        except Exception as e:
            print(f"[Snapshot] Error saving history {symbol}/{period}: {e}")


def save_fundamentals_snapshot(symbol: str, data: dict):
    if not data or "error" in data:
        return
    now_ist = datetime.now(IST)
    date_str = now_ist.strftime("%Y-%m-%d")
    now_utc = datetime.now(timezone.utc).isoformat()
    with _lock:
        try:
            with _conn() as db:
                db.execute(
                    "INSERT OR REPLACE INTO fundamental_snapshots "
                    "(symbol, snapshot_date, data, updated_at) VALUES (?,?,?,?)",
                    (symbol.upper(), date_str, json.dumps(data), now_utc)
                )
        except Exception as e:
            print(f"[Snapshot] Error saving fundamentals {symbol}: {e}")


# ── Readers ───────────────────────────────────────────────────────────────────

def _tag(data: dict, date_str: str) -> dict:
    """Attach D-1 metadata so the frontend knows this is snapshot data."""
    return {**data, "dataType": "D1", "snapshotDate": date_str}


def get_last_snapshot_date() -> str | None:
    """Return the most recent snapshot date (YYYY-MM-DD) or None."""
    try:
        with _conn() as db:
            row = db.execute(
                "SELECT snapshot_date FROM quote_snapshots "
                "ORDER BY updated_at DESC LIMIT 1"
            ).fetchone()
            return row["snapshot_date"] if row else None
    except Exception:
        return None


def get_quote_snapshot(symbol: str) -> dict | None:
    try:
        with _conn() as db:
            row = db.execute(
                "SELECT data, snapshot_date FROM quote_snapshots WHERE symbol=?",
                (symbol.upper(),)
            ).fetchone()
            if row:
                return _tag(json.loads(row["data"]), row["snapshot_date"])
    except Exception:
        pass
    return None


def get_all_quotes_snapshot() -> list:
    try:
        with _conn() as db:
            rows = db.execute(
                "SELECT data, snapshot_date FROM quote_snapshots"
            ).fetchall()
            return [_tag(json.loads(r["data"]), r["snapshot_date"]) for r in rows]
    except Exception:
        return []


def get_index_snapshot(index_id: str) -> dict | None:
    try:
        with _conn() as db:
            row = db.execute(
                "SELECT data, snapshot_date FROM index_snapshots WHERE index_id=?",
                (index_id.upper(),)
            ).fetchone()
            if row:
                return _tag(json.loads(row["data"]), row["snapshot_date"])
    except Exception:
        pass
    return None


def get_all_indices_snapshot() -> list:
    try:
        with _conn() as db:
            rows = db.execute(
                "SELECT data, snapshot_date FROM index_snapshots"
            ).fetchall()
            return [_tag(json.loads(r["data"]), r["snapshot_date"]) for r in rows]
    except Exception:
        return []


def get_history_snapshot(symbol: str, period: str) -> list:
    try:
        with _conn() as db:
            row = db.execute(
                "SELECT data FROM history_snapshots WHERE symbol=? AND period=?",
                (symbol.upper(), period)
            ).fetchone()
            if row:
                return json.loads(row["data"])
    except Exception:
        pass
    return []


def get_fundamentals_snapshot(symbol: str) -> dict | None:
    try:
        with _conn() as db:
            row = db.execute(
                "SELECT data, snapshot_date FROM fundamental_snapshots WHERE symbol=?",
                (symbol.upper(),)
            ).fetchone()
            if row:
                return _tag(json.loads(row["data"]), row["snapshot_date"])
    except Exception:
        pass
    return None
