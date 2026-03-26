from fastapi import APIRouter
from services.news_service import get_market_news
from services.nse_service import get_india_vix
import services.twelvedata_service as td

router = APIRouter(prefix="/api/sentiment", tags=["sentiment"])


# ── Hardcoded fallbacks when APIs are unavailable ─────────────────────────────
_DEFAULTS = {
    "inrUsd":        0.012,   # approx INR/USD
    "usdInr":        83.5,
    "crudePriceUsd": 72.0,
    "goldPriceInr":  62000.0,
    "goldPriceUsd":  2050.0,
    "indiaVix":      15.0,
    "repoRate":      6.25,
    "nextRbiDate":   "2026-06-06",
    "fiiNetFlowCr":  0,         # real data needs NSDL scraper
    "diiNetFlowCr":  0,
}


def _build_fear_greed(vix: float) -> tuple[int, str]:
    """Compute Fear & Greed index (0-100) from India VIX."""
    if vix > 25:   return 20, "Extreme Fear"
    if vix > 20:   return 35, "Fear"
    if vix > 15:   return 50, "Neutral"
    if vix > 12:   return 65, "Greed"
    return 80, "Extreme Greed"


def _fetch_macro() -> dict:
    """
    Assembles macro data from:
      - India VIX    → NSE allIndices (free, no key)
      - INR/USD      → Twelve Data (key required)
      - Crude oil    → Twelve Data (key required)
      - Gold         → Twelve Data (key required)
      - Repo rate    → hardcoded (updated manually)
      - FII/DII      → placeholder (needs NSDL scraper)
    """
    # 1. India VIX — free from NSE
    vix = get_india_vix()

    # 2. Macro from Twelve Data (gracefully falls back to defaults)
    macro = {}
    if td.available():
        macro = td.get_macro()

    inr_usd  = macro.get("inrUsd")        or _DEFAULTS["inrUsd"]
    usd_inr  = macro.get("usdInr")        or _DEFAULTS["usdInr"]
    crude    = macro.get("crudePriceUsd") or _DEFAULTS["crudePriceUsd"]
    gold_inr = macro.get("goldPriceInr")  or _DEFAULTS["goldPriceInr"]
    gold_usd = macro.get("goldPriceUsd")  or _DEFAULTS["goldPriceUsd"]

    fg_value, fg_label = _build_fear_greed(vix)

    return {
        "indiaVix":       round(vix, 2),
        "inrUsd":         inr_usd,
        "usdInr":         usd_inr,
        "crudePriceUsd":  crude,
        "goldPriceInr":   gold_inr,
        "goldPriceUsd":   gold_usd,
        "repoRate":       _DEFAULTS["repoRate"],
        "nextRbiDate":    _DEFAULTS["nextRbiDate"],
        "fiiNetFlowCr":   _DEFAULTS["fiiNetFlowCr"],
        "diiNetFlowCr":   _DEFAULTS["diiNetFlowCr"],
        "fearGreedIndex": fg_value,
        "fearGreedLabel": fg_label,
        "description": (
            f"India VIX at {vix:.1f} — {fg_label.lower()} territory. "
            f"INR/USD at {usd_inr:.2f}. Brent crude at ${crude:.1f}/bbl."
        ),
        "dataSource": "twelvedata" if td.available() else "defaults",
    }


@router.get("/market")
async def market_sentiment():
    """India market mood — Fear & Greed, macro indicators, news."""
    macro = _fetch_macro()
    news  = get_market_news()
    return {**macro, "geopoliticalNews": news[:6]}


@router.get("/geopolitical")
async def geopolitical():
    return get_market_news()


@router.get("/fear-greed")
async def fear_greed():
    vix = get_india_vix()
    fg_value, fg_label = _build_fear_greed(vix)
    return {
        "value":       fg_value,
        "label":       fg_label,
        "vix":         round(vix, 2),
        "description": f"India VIX at {vix:.1f} — {fg_label.lower()} zone.",
    }
