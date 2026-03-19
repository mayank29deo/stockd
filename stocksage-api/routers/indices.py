from fastapi import APIRouter
from services.yahoo_service import get_index_quote, get_history
from config import INDICES
import asyncio

router = APIRouter(prefix="/api/indices", tags=["indices"])


@router.get("")
async def all_indices():
    """All major Indian indices with live values."""
    results = []
    for index_id, yf_ticker in INDICES.items():
        data = get_index_quote(index_id, yf_ticker)
        history = get_history(yf_ticker, "3m")
        results.append({**data, "priceHistory": history[-90:]})
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
