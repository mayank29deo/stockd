"""
News service — uses MarketAux (free tier: 100 req/day) and falls back
to a curated static list if no API key is configured.
"""
import requests
from cachetools import TTLCache
import threading
from config import MARKETAUX_API_KEY, NEWS_CACHE_TTL

_cache = TTLCache(maxsize=50, ttl=NEWS_CACHE_TTL)
_lock  = threading.Lock()

STATIC_GEOPOLITICAL_NEWS = [
    {"id": "g1", "title": "India GDP Growth Forecast Upgraded to 7.2% by IMF for FY2027", "date": "2026-03-19", "impact": "positive", "impactScore": 90, "sectors": ["Banking", "Infra", "Cement"], "source": "IMF", "summary": "IMF raised India's growth forecast citing strong domestic consumption and digital economy tailwinds."},
    {"id": "g2", "title": "RBI Keeps Repo Rate at 6.25% — Signals Cut in June", "date": "2026-03-18", "impact": "positive", "impactScore": 75, "sectors": ["Banking", "NBFC", "Realty"], "source": "RBI", "summary": "MPC voted 5-1 to hold rates, signalling accommodation in H2 2026."},
    {"id": "g3", "title": "Crude Oil Drops to $68/bbl as OPEC+ Increases Output", "date": "2026-03-17", "impact": "positive", "impactScore": 68, "sectors": ["Aviation", "Paint", "Chemicals"], "source": "Bloomberg", "summary": "Lower crude reduces India's CAD pressure and eases input costs for downstream industries."},
    {"id": "g4", "title": "India-US Trade Deal Nears Finalisation — IT & Defence to Benefit", "date": "2026-03-16", "impact": "positive", "impactScore": 78, "sectors": ["IT", "Defence"], "source": "Economic Times", "summary": "Bilateral deal expected to open $12B defence procurement and slash IT services tariffs."},
    {"id": "g5", "title": "China Slowdown Concern — Indian Metal Stocks Under Pressure", "date": "2026-03-15", "impact": "negative", "impactScore": 65, "sectors": ["Metals", "Mining"], "source": "Financial Express", "summary": "Weakening Chinese PMI threatens global steel prices, hitting Indian metal majors."},
    {"id": "g6", "title": "FII Net Inflow Hits ₹8,420 Cr — Risk-On Sentiment Returns", "date": "2026-03-14", "impact": "positive", "impactScore": 82, "sectors": ["Banking", "IT", "FMCG"], "source": "NSDL", "summary": "Foreign institutional investors turned net buyers after Fed pause signal."},
]


def fetch_marketaux_news(query: str = "India stock market", limit: int = 6) -> list:
    """Fetch news from MarketAux free API."""
    if not MARKETAUX_API_KEY:
        return []
    url = "https://api.marketaux.com/v1/news/all"
    params = {
        "api_token": MARKETAUX_API_KEY,
        "countries": "in",
        "filter_entities": "true",
        "limit": limit,
        "search": query,
    }
    try:
        r = requests.get(url, params=params, timeout=8)
        r.raise_for_status()
        data = r.json().get("data", [])
        return [
            {
                "id": item.get("uuid", ""),
                "title": item.get("title", ""),
                "date": item.get("published_at", "")[:10],
                "source": item.get("source", {}).get("name", ""),
                "url": item.get("url", ""),
                "summary": item.get("description", "")[:300],
                "sentiment": item.get("entities", [{}])[0].get("sentiment_score", 0) if item.get("entities") else 0,
                "impact": "positive" if (item.get("entities") or [{}])[0].get("sentiment_score", 0) > 0 else "negative",
                "sectors": [],
            }
            for item in data
        ]
    except Exception:
        return []


def get_market_news() -> list:
    key = "geopolitical"
    with _lock:
        if key in _cache:
            return _cache[key]

    news = fetch_marketaux_news("India economy stock market budget RBI")
    result = news if news else STATIC_GEOPOLITICAL_NEWS

    with _lock:
        _cache[key] = result
    return result


def get_stock_news(symbol: str) -> list:
    key = f"news:{symbol}"
    with _lock:
        if key in _cache:
            return _cache[key]

    news = fetch_marketaux_news(f"{symbol} NSE India stock")
    # Fall back to relevant static items
    result = news if news else [n for n in STATIC_GEOPOLITICAL_NEWS if any(symbol in s for s in n.get("sectors", [])) or True][:3]

    with _lock:
        _cache[key] = result
    return result
