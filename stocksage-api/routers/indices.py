from fastapi import APIRouter
from services.yahoo_service import get_index_quote, get_history as yf_get_history, get_market_status
from services.nse_service import get_nse_indices
from services import snapshot_service as snap
import services.eodhd_service as eodhd
from config import INDICES
from concurrent.futures import ThreadPoolExecutor, as_completed

router = APIRouter(prefix="/api/indices", tags=["indices"])


import services.rapidapi_yf_service as ryf

def _fetch_history(yf_ticker: str, index_id: str, period: str = "3m") -> list:
    """
    Fetch index history: EODHD → Twelve Data → yfinance → snapshot.
    Each successful result is persisted to snapshot.
    """
    # 1. EODHD index tickers
    _eodhd_map = {
        "^NSEI":      "NSEI.INDX",
        "^BSESN":     "BSESN.INDX",
        "^NSEBANK":   "NSEBANK.INDX",
        "^CNXIT":     "CNXIT.INDX",
        "^NSEMDCP50": "NSEMDCP50.INDX",
    }
    if eodhd.available():
        eodhd_ticker = _eodhd_map.get(yf_ticker)
        if eodhd_ticker:
            try:
                from datetime import datetime, timedelta
                from services.eodhd_service import _SESSION, _BASE, _sf, _si, EODHD_API_KEY
                days     = {"3m": 90, "1y": 365}.get(period, 90)
                today    = datetime.now()
                from_dt  = (today - timedelta(days=days)).strftime("%Y-%m-%d")
                resp = _SESSION.get(
                    f"{_BASE}/eod/{eodhd_ticker}",
                    params={"api_token": EODHD_API_KEY, "from": from_dt,
                            "to": today.strftime("%Y-%m-%d"), "fmt": "json"},
                    timeout=15,
                )
                resp.raise_for_status()
                raw = resp.json()
                if raw:
                    result = [
                        {"date": r["date"],
                         "open":   _sf(r.get("open"), 0),
                         "high":   _sf(r.get("high"), 0),
                         "low":    _sf(r.get("low"),  0),
                         "close":  _sf(r.get("adjusted_close") or r.get("close"), 0),
                         "volume": _si(r.get("volume"))}
                        for r in raw
                        if (r.get("adjusted_close") or r.get("close") or 0) > 0
                    ]
                    snap.save_history_snapshot(index_id, period, result)
                    return result
            except Exception:
                pass

    # 2. RapidAPI Yahoo Finance (cloud-reliable, covers all indices)
    if ryf.available():
        h = ryf.get_index_history(index_id, period)
        if h:
            snap.save_history_snapshot(index_id, period, h)
            return h

    # 3. yfinance
    try:
        h = yf_get_history(yf_ticker, period)
        if h:
            snap.save_history_snapshot(index_id, period, h)
            return h
    except Exception:
        pass

    # 4. Snapshot
    return snap.get_history_snapshot(index_id, period)


@router.get("")
async def all_indices():
    """
    All major Indian indices.
    - Market open  → live NSE data + history (EODHD → yfinance → snapshot)
    - Market closed → D-1 snapshot for values, same history chain
    """
    market_is_open = get_market_status().get("isOpen", False)

    # Live index values
    if market_is_open:
        nse_data = get_nse_indices()
        if not nse_data:
            nse_data = {}
    else:
        # Use snapshot for index values
        snaps = snap.get_all_indices_snapshot()
        nse_data = {s["id"]: s for s in snaps} if snaps else get_nse_indices()

    # Fetch histories in parallel
    items = list(INDICES.items())
    with ThreadPoolExecutor(max_workers=len(items)) as executor:
        history_futures = {
            executor.submit(_fetch_history, yf_ticker, index_id): (index_id, yf_ticker)
            for index_id, yf_ticker in items
        }

        results = []
        for future in as_completed(history_futures):
            index_id, yf_ticker = history_futures[future]
            history = []
            try:
                history = future.result() or []
            except Exception:
                pass

            if index_id in nse_data:
                base = nse_data[index_id]
            else:
                # SENSEX or missing — try yfinance, then snapshot
                base = get_index_quote(index_id, yf_ticker)
                if not base or "error" in base:
                    base = snap.get_index_snapshot(index_id) or {"id": index_id, "error": "No data"}

            results.append({
                **base,
                "priceHistory": history[-90:],
                "dataType":     base.get("dataType", "live" if market_is_open else "D1"),
                "snapshotDate": base.get("snapshotDate"),
            })

    return results


@router.get("/{index_id}")
async def single_index(index_id: str):
    idx = index_id.upper()
    if idx not in INDICES:
        return {"error": f"Index {idx} not found. Valid: {list(INDICES.keys())}"}
    yf_ticker = INDICES[idx]
    market_is_open = get_market_status().get("isOpen", False)

    if market_is_open:
        nse_data = get_nse_indices()
        base = nse_data.get(idx) or get_index_quote(idx, yf_ticker)
    else:
        base = snap.get_index_snapshot(idx) or get_index_quote(idx, yf_ticker)

    history = _fetch_history(yf_ticker, idx, "1y")
    return {
        **base,
        "priceHistory": history,
        "dataType":     base.get("dataType", "live" if market_is_open else "D1"),
    }
