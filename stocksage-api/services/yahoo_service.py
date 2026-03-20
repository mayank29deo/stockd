"""
Yahoo Finance service — wraps yfinance for all market data.
All NSE stocks use the .NS suffix (e.g. RELIANCE.NS).
"""
import math
import yfinance as yf
import pandas as pd
import requests as _requests
from datetime import datetime, timezone
from cachetools import TTLCache, cached
import threading
from config import (
    NSE_SUFFIX, QUOTE_CACHE_TTL, HISTORY_CACHE_TTL,
    FUNDAMENTAL_CACHE_TTL, INDEX_CACHE_TTL, SECTOR_MAP
)

# Browser-like session — Yahoo Finance blocks bare cloud-server IPs
_yf_session = _requests.Session()
_yf_session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "DNT": "1",
    "Connection": "keep-alive",
})


def _sf(val, default=None, decimals=2):
    """Safe float — returns None (or default) for NaN/inf/None."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return round(f, decimals)
    except (TypeError, ValueError):
        return default


def _si(val, default=0):
    """Safe int — returns default for NaN/inf/None."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default

# Thread-safe caches
_quote_cache      = TTLCache(maxsize=200, ttl=QUOTE_CACHE_TTL)
_history_cache    = TTLCache(maxsize=100, ttl=HISTORY_CACHE_TTL)
_info_cache       = TTLCache(maxsize=100, ttl=FUNDAMENTAL_CACHE_TTL)
_lock = threading.Lock()


def _yf_ticker(symbol: str) -> str:
    """Convert plain NSE symbol to Yahoo Finance ticker."""
    symbol = symbol.upper().strip()
    if symbol.startswith("^"):          # index tickers — pass through as-is
        return symbol
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return symbol
    if symbol == "M&M":
        return "M%26M.NS"
    return f"{symbol}{NSE_SUFFIX}"


def get_quote(symbol: str) -> dict:
    key = symbol.upper()
    with _lock:
        if key in _quote_cache:
            return _quote_cache[key]

    ticker_str = _yf_ticker(symbol)
    try:
        t = yf.Ticker(ticker_str, session=_yf_session)
        info = t.fast_info
        hist = t.history(period="2d", interval="1d")

        prev_close = _sf(hist["Close"].iloc[-2] if len(hist) >= 2 else info.previous_close, 0)
        price      = _sf(info.last_price or info.regular_market_previous_close or prev_close, 0)
        change     = round(price - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 2)

        result = {
            "symbol": symbol.upper(),
            "ticker": ticker_str,
            "price": price,
            "previousClose": prev_close,
            "change": change,
            "changePercent": change_pct,
            "open": _sf(info.open or price, price),
            "high": _sf(info.day_high or price, price),
            "low":  _sf(info.day_low or price, price),
            "volume": _si(info.shares),
            "marketCap": _si(info.market_cap),
            "exchange": "NSE",
            "currency": "INR",
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        result = {"symbol": symbol.upper(), "error": str(e)}

    with _lock:
        _quote_cache[key] = result
    return result


def get_quotes_bulk(symbols: list) -> list:
    """Fetch multiple quotes efficiently using yfinance batch download."""
    tickers = [_yf_ticker(s) for s in symbols]
    ticker_to_symbol = {_yf_ticker(s): s.upper() for s in symbols}

    try:
        data = yf.download(
            tickers, period="2d", interval="1d",
            group_by="ticker", auto_adjust=True, progress=False, threads=True,
            session=_yf_session
        )
        results = []
        for ticker_str, symbol in ticker_to_symbol.items():
            try:
                if len(tickers) == 1:
                    df = data
                else:
                    df = data[ticker_str] if ticker_str in data.columns.get_level_values(0) else pd.DataFrame()

                if df.empty or len(df) < 1:
                    results.append({"symbol": symbol, "error": "No data"})
                    continue

                price      = _sf(df["Close"].iloc[-1], 0)
                prev_close = _sf(df["Close"].iloc[-2] if len(df) >= 2 else price, price)
                change     = round(price - prev_close, 2)
                change_pct = round((change / prev_close * 100) if prev_close else 0, 2)

                if price == 0:
                    results.append({"symbol": symbol, "error": "Zero price"})
                    continue

                results.append({
                    "symbol": symbol,
                    "ticker": ticker_str,
                    "price": price,
                    "previousClose": prev_close,
                    "change": change,
                    "changePercent": change_pct,
                    "open": _sf(df["Open"].iloc[-1], price),
                    "high": _sf(df["High"].iloc[-1], price),
                    "low":  _sf(df["Low"].iloc[-1], price),
                    "volume": _si(df["Volume"].iloc[-1]),
                    "exchange": "NSE",
                    "currency": "INR",
                    "sector": SECTOR_MAP.get(symbol, "Other"),
                    "lastUpdated": datetime.now(timezone.utc).isoformat(),
                })
            except Exception as e:
                results.append({"symbol": symbol, "error": str(e)})

        return results
    except Exception as e:
        return [{"symbol": s.upper(), "error": str(e)} for s in symbols]


def get_history(symbol: str, period: str = "3mo") -> list:
    """Return OHLCV history. period: 1d 5d 1mo 3mo 6mo 1y 2y 5y."""
    key = f"{symbol}:{period}"
    with _lock:
        if key in _history_cache:
            return _history_cache[key]

    period_map = {
        "1w": "5d", "1m": "1mo", "3m": "3mo",
        "6m": "6mo", "1y": "1y", "5y": "5y",
    }
    yf_period = period_map.get(period.lower(), period)

    ticker_str = _yf_ticker(symbol)
    try:
        t = yf.Ticker(ticker_str, session=_yf_session)
        interval = "1h" if yf_period in ("5d",) else "1d"
        hist = t.history(period=yf_period, interval=interval, auto_adjust=True)
        hist.index = hist.index.tz_localize(None) if hist.index.tzinfo else hist.index

        result = [
            {
                "date":   str(idx.date() if hasattr(idx, 'date') else idx),
                "open":   _sf(row["Open"], 0),
                "high":   _sf(row["High"], 0),
                "low":    _sf(row["Low"],  0),
                "close":  _sf(row["Close"], 0),
                "volume": _si(row["Volume"]),
            }
            for idx, row in hist.iterrows()
            if _sf(row["Close"], None) is not None
        ]
    except Exception as e:
        result = []

    with _lock:
        _history_cache[key] = result
    return result


def get_fundamentals(symbol: str) -> dict:
    key = symbol.upper()
    with _lock:
        if key in _info_cache:
            return _info_cache[key]

    ticker_str = _yf_ticker(symbol)
    try:
        t = yf.Ticker(ticker_str, session=_yf_session)
        info = t.info
        fin  = t.financials   # annual income statement
        bs   = t.balance_sheet
        cf   = t.cashflow

        # Revenue & profit quarterly
        q_fin = t.quarterly_financials
        rev_qtrs    = []
        profit_qtrs = []
        if q_fin is not None and not q_fin.empty:
            rev_row    = q_fin.loc["Total Revenue"]   if "Total Revenue"   in q_fin.index else None
            profit_row = q_fin.loc["Net Income"]      if "Net Income"      in q_fin.index else None
            if rev_row    is not None: rev_qtrs    = [_sf(v/1e7, 0) for v in rev_row.values[:4]]
            if profit_row is not None: profit_qtrs = [_sf(v/1e7, 0) for v in profit_row.values[:4]]

        market_cap_cr = _sf((info.get("marketCap") or 0) / 1e7, 0)

        result = {
            "pe":                _sf(info.get("trailingPE"), 0),
            "pb":                _sf(info.get("priceToBook"), 0),
            "eps":               _sf(info.get("trailingEps"), 0),
            "roe":               _sf((info.get("returnOnEquity") or 0) * 100, 0),
            "roce":              _sf((info.get("returnOnAssets") or 0) * 100, 0),
            "debtToEquity":      _sf((info.get("debtToEquity") or 0) / 100, 0),
            "currentRatio":      _sf(info.get("currentRatio"), 0),
            "revenueGrowthYoY":  _sf((info.get("revenueGrowth") or 0) * 100, 0),
            "profitGrowthYoY":   _sf((info.get("earningsGrowth") or 0) * 100, 0),
            "dividendYield":     _sf((info.get("dividendYield") or 0) * 100, 0),
            "promoterHolding":   _sf((info.get("heldPercentInsiders") or 0) * 100, 0),
            "fiisHolding":       _sf((info.get("heldPercentInstitutions") or 0) * 100, 0),
            "diisHolding":       0,
            "publicHolding":     0,
            "marketCapCr":       market_cap_cr,
            "revenueQtrCr":      [_sf(v, 0) for v in rev_qtrs],
            "profitQtrCr":       [_sf(v, 0) for v in profit_qtrs],
            "sector":            info.get("sector", SECTOR_MAP.get(symbol.upper(), "Other")),
            "industry":          info.get("industry", ""),
            "description":       info.get("longBusinessSummary", "")[:500] if info.get("longBusinessSummary") else "",
            "website":           info.get("website", ""),
            "employees":         _si(info.get("fullTimeEmployees"), 0),
            "weekHigh52":        _sf(info.get("fiftyTwoWeekHigh"), 0),
            "weekLow52":         _sf(info.get("fiftyTwoWeekLow"), 0),
            "avgVolume":         _si(info.get("averageVolume"), 0),
        }
    except Exception as e:
        result = {"error": str(e)}

    with _lock:
        _info_cache[key] = result
    return result


def get_index_quote(index_id: str, yf_ticker: str) -> dict:
    key = index_id
    with _lock:
        if key in _quote_cache:
            return _quote_cache[key]

    try:
        t = yf.Ticker(yf_ticker, session=_yf_session)
        hist = t.history(period="2d", interval="1d")
        info = t.fast_info

        price      = _sf(hist["Close"].iloc[-1], 0)
        prev_close = _sf(hist["Close"].iloc[-2] if len(hist) >= 2 else price, price)
        change     = round(price - prev_close, 2)
        change_pct = round((change / prev_close * 100) if prev_close else 0, 2)

        result = {
            "id": index_id,
            "name": {
                "NIFTY50": "NIFTY 50", "SENSEX": "SENSEX",
                "BANKNIFTY": "BANK NIFTY", "NIFTYIT": "NIFTY IT",
                "NIFTYMID": "NIFTY MIDCAP 50",
            }.get(index_id, index_id),
            "exchange": "BSE" if index_id == "SENSEX" else "NSE",
            "value": price,
            "change": change,
            "changePercent": change_pct,
            "high": _sf(hist["High"].iloc[-1], price),
            "low":  _sf(hist["Low"].iloc[-1],  price),
            "open": _sf(hist["Open"].iloc[-1], price),
            "previousClose": prev_close,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        result = {"id": index_id, "error": str(e)}

    with _lock:
        _quote_cache[key] = result
    return result


def get_market_status() -> dict:
    """Check if NSE is currently open (9:15 AM – 3:30 PM IST, Mon–Fri)."""
    from datetime import time as dtime
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    open_t  = dtime(9, 15)
    close_t = dtime(15, 30)
    is_weekday = now_ist.weekday() < 5
    is_hours   = open_t <= now_ist.time() <= close_t
    is_open    = is_weekday and is_hours
    return {
        "isOpen": is_open,
        "currentIST": now_ist.strftime("%H:%M"),
        "openTime": "09:15",
        "closeTime": "15:30",
        "nextOpen": "Next trading day 09:15 IST" if not is_open else None,
    }
