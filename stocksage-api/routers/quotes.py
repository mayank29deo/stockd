from fastapi import APIRouter, HTTPException, Query
from services.yahoo_service import get_quote, get_quotes_bulk, get_market_status
from services.nse_service import get_nifty50_quotes
from services.technical_service import compute_technicals
from services.verdict_service import build_verdict
from config import NIFTY50_SYMBOLS, SECTOR_MAP

router = APIRouter(prefix="/api", tags=["quotes"])


@router.get("/quote/{symbol}")
async def quote(symbol: str):
    """Single stock quote with live price."""
    data = get_quote(symbol.upper())
    if "error" in data and "price" not in data:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for {symbol}")
    return data


@router.get("/quotes")
async def quotes_bulk(symbols: str = Query(..., description="Comma-separated symbols")):
    """Bulk quotes — e.g. ?symbols=RELIANCE,TCS,INFY"""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="Provide at least one symbol")
    return get_quotes_bulk(symbol_list)


@router.get("/stocks")
async def all_stocks(
    verdict: str = Query("all"),
    sector:  str = Query("all"),
    cap:     str = Query("all"),
    limit:   int = Query(50),
):
    """
    Returns all NIFTY50 stocks with live quotes, technicals, fundamentals
    and computed verdict. This is the main data endpoint for Discover page.
    Cached aggressively to avoid rate-limiting Yahoo Finance.
    """
    from services.yahoo_service import get_history, get_fundamentals
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _process_stock(q):
        sym = q["symbol"]
        history = get_history(sym, "3m")
        fund    = get_fundamentals(sym)
        tech    = compute_technicals(history)
        v       = build_verdict(sym, q["price"], fund, tech)
        return {
            **q,
            "name":      fund.get("description", sym)[:60] or sym,
            "sector":    SECTOR_MAP.get(sym, fund.get("sector", "Other")),
            "marketCap": "large" if (fund.get("marketCapCr") or 0) > 20000 else "mid" if (fund.get("marketCapCr") or 0) > 5000 else "small",
            "logo":      sym[:2],
            "color":     _sector_color(SECTOR_MAP.get(sym, "Other")),
            "weekHigh52":fund.get("weekHigh52", 0),
            "weekLow52": fund.get("weekLow52", 0),
            "avgVolume": fund.get("avgVolume", 0),
            "priceHistory": history[-90:],
            "fundamentals": fund,
            "technicals":   tech,
            "sentiment": {"overall": 20, "news": 18, "social": 22, "analyst": 25, "geopolitical": 15, "fearGreedIndex": 55},
            "insiderTrades": [],
            "verdict": v,
        }

    # Try NSE India API first (fast, reliable), fall back to yfinance
    nse_quotes = get_nifty50_quotes()
    if nse_quotes:
        quotes = [nse_quotes[s] for s in NIFTY50_SYMBOLS[:limit] if s in nse_quotes]
    else:
        quotes = [q for q in get_quotes_bulk(NIFTY50_SYMBOLS[:limit])
                  if not ("error" in q and "price" not in q)]

    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_map = {executor.submit(_process_stock, q): q for q in quotes}
        for future in as_completed(future_map):
            try:
                stock = future.result()
                v = stock["verdict"]
                if verdict != "all" and v["action"] != verdict.upper():
                    continue
                if sector != "all" and stock["sector"].lower() != sector.lower():
                    continue
                if cap != "all" and stock["marketCap"] != cap.lower():
                    continue
                results.append(stock)
            except Exception:
                pass

    return results


@router.get("/search/{symbol}")
async def search_stock(symbol: str):
    """
    Fetch live quote for ANY NSE stock by symbol — not limited to Nifty50.
    Used by the search bar to support stocks like PAYTM, ZOMATO, NYKAA etc.
    """
    from services.yahoo_service import get_fundamentals
    sym = symbol.upper().strip()
    data = get_quote(sym)
    if "error" in data and "price" not in data:
        raise HTTPException(status_code=404, detail=f"Stock '{sym}' not found on NSE")
    fund = get_fundamentals(sym)
    return {
        **data,
        "name":    fund.get("description", "")[:80] or sym,
        "sector":  SECTOR_MAP.get(sym, fund.get("sector", "Other")),
        "logo":    sym[:2],
        "color":   _sector_color(SECTOR_MAP.get(sym, fund.get("sector", "Other"))),
    }


@router.get("/market/status")
async def market_status():
    return get_market_status()


def _sector_color(sector: str) -> str:
    colors = {
        "IT": "#4E9AF1", "Banking": "#A78BFA", "Energy": "#FF6B35",
        "Pharma": "#00C897", "Auto": "#F472B6", "FMCG": "#FFB020",
        "Metals": "#94A3B8", "NBFC": "#FFB020", "Telecom": "#34D399",
        "Cement": "#FB923C", "Infra": "#60A5FA", "Power": "#FBBF24",
        "Healthcare": "#4ADE80", "Insurance": "#818CF8", "Consumer": "#F87171",
    }
    return colors.get(sector, "#FF6B35")
