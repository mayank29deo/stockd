from fastapi import APIRouter
from services.yahoo_service import get_index_quote, get_history
from services.nse_service import get_nse_indices
from config import INDICES
from concurrent.futures import ThreadPoolExecutor, as_completed

router = APIRouter(prefix="/api/indices", tags=["indices"])


def _fetch_history(yf_ticker: str) -> list:
    try:
        return get_history(yf_ticker, "3m")
    except Exception:
        return []


@router.get("")
async def all_indices():
    """
    All major Indian indices.
    Live values come from NSE India API (reliable from cloud servers).
    SENSEX falls back to yfinance. History fetched in parallel via yfinance.
    """
    # 1. Fetch live values from NSE India (fast, single call)
    nse_data = get_nse_indices()

    # 2. Fetch price histories in parallel
    items = list(INDICES.items())
    with ThreadPoolExecutor(max_workers=len(items)) as executor:
        history_futures = {
            executor.submit(_fetch_history, yf_ticker): (index_id, yf_ticker)
            for index_id, yf_ticker in items
        }

        results = []
        for future in as_completed(history_futures):
            index_id, yf_ticker = history_futures[future]
            history = []
            try:
                history = future.result()
            except Exception:
                pass

            # Use NSE live data if available, else fall back to yfinance
            if index_id in nse_data:
                base = nse_data[index_id]
            else:
                # SENSEX or any index not on NSE — try yfinance
                base = get_index_quote(index_id, yf_ticker)

            results.append({**base, "priceHistory": history[-90:]})

    return results


@router.get("/{index_id}")
async def single_index(index_id: str):
    idx = index_id.upper()
    if idx not in INDICES:
        return {"error": f"Index {idx} not found. Valid: {list(INDICES.keys())}"}
    yf_ticker = INDICES[idx]

    nse_data = get_nse_indices()
    base = nse_data.get(idx) or get_index_quote(idx, yf_ticker)
    history = get_history(yf_ticker, "1y")
    return {**base, "priceHistory": history}
