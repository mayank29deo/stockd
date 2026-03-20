from fastapi import APIRouter
from services.yahoo_service import get_index_quote, get_history
from config import INDICES
from concurrent.futures import ThreadPoolExecutor, as_completed

router = APIRouter(prefix="/api/indices", tags=["indices"])


def _fetch_one_index(index_id: str, yf_ticker: str) -> dict:
    data = get_index_quote(index_id, yf_ticker)
    history = get_history(yf_ticker, "3m")
    return {**data, "priceHistory": history[-90:]}


@router.get("")
async def all_indices():
    """All major Indian indices with live values — fetched in parallel."""
    items = list(INDICES.items())
    results = []
    with ThreadPoolExecutor(max_workers=len(items)) as executor:
        future_map = {executor.submit(_fetch_one_index, idx_id, yf_ticker): idx_id
                      for idx_id, yf_ticker in items}
        for future in as_completed(future_map):
            try:
                results.append(future.result())
            except Exception:
                pass
    return results


@router.get("/{index_id}")
async def single_index(index_id: str):
    idx = index_id.upper()
    if idx not in INDICES:
        return {"error": f"Index {idx} not found. Valid: {list(INDICES.keys())}"}
    yf_ticker = INDICES[idx]
    data      = get_index_quote(idx, yf_ticker)
    history   = get_history(yf_ticker, "1y")
    return {**data, "priceHistory": history}
