"""
Compute technical indicators from OHLCV price history.
Pure Python / pandas — no external TA library dependency.
"""
import pandas as pd
from typing import Optional


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def compute_rsi(closes: pd.Series, period: int = 14) -> float:
    delta = closes.diff()
    gain  = delta.clip(lower=0)
    loss  = (-delta).clip(lower=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs  = avg_gain / avg_loss.replace(0, 1e-10)
    rsi = 100 - (100 / (1 + rs))
    return round(float(rsi.iloc[-1]), 2)


def compute_macd(closes: pd.Series) -> dict:
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    macd_line   = ema12 - ema26
    signal_line = _ema(macd_line, 9)
    histogram   = macd_line - signal_line
    return {
        "value":     round(float(macd_line.iloc[-1]), 4),
        "signal":    round(float(signal_line.iloc[-1]), 4),
        "histogram": round(float(histogram.iloc[-1]), 4),
    }


def compute_bollinger(closes: pd.Series, window: int = 20) -> dict:
    sma  = closes.rolling(window).mean()
    std  = closes.rolling(window).std()
    return {
        "upper":  round(float((sma + 2 * std).iloc[-1]), 2),
        "middle": round(float(sma.iloc[-1]), 2),
        "lower":  round(float((sma - 2 * std).iloc[-1]), 2),
    }


def compute_technicals(history: list) -> dict:
    """Given OHLCV history list, compute all technical indicators."""
    if not history or len(history) < 30:
        return {}

    df = pd.DataFrame(history)
    df["close"] = df["close"].astype(float)
    df["high"]  = df["high"].astype(float)
    df["low"]   = df["low"].astype(float)
    df["open"]  = df["open"].astype(float)

    closes = df["close"]
    price  = float(closes.iloc[-1])

    ema20  = round(float(_ema(closes, 20).iloc[-1]), 2)
    ema50  = round(float(_ema(closes, 50).iloc[-1]), 2)  if len(closes) >= 50  else price
    ema200 = round(float(_ema(closes, 200).iloc[-1]), 2) if len(closes) >= 200 else price
    rsi14  = compute_rsi(closes)
    macd   = compute_macd(closes)
    bb     = compute_bollinger(closes)

    # Trend
    if ema20 > ema50 and ema50 > ema200:
        trend = "bullish"
    elif ema20 < ema50 and ema50 < ema200:
        trend = "bearish"
    else:
        trend = "sideways"

    # Support = recent 20-day lows, Resistance = recent 20-day highs
    recent_low  = df["low"].rolling(20).min().iloc[-1]
    recent_high = df["high"].rolling(20).max().iloc[-1]
    prev_low    = df["low"].rolling(20).min().iloc[-20] if len(df) >= 40 else recent_low * 0.95
    prev_high   = df["high"].rolling(20).max().iloc[-20] if len(df) >= 40 else recent_high * 1.05

    # ADX (simplified)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - closes.shift()).abs(),
        (df["low"]  - closes.shift()).abs()
    ], axis=1).max(axis=1)
    atr = float(tr.rolling(14).mean().iloc[-1])

    return {
        "rsi14":         rsi14,
        "macd":          macd,
        "ema20":         ema20,
        "ema50":         ema50,
        "ema200":        ema200,
        "bollingerBands": bb,
        "atr":           round(atr, 2),
        "trend":         trend,
        "support":       [round(float(recent_low), 2), round(float(prev_low), 2)],
        "resistance":    [round(float(recent_high), 2), round(float(prev_high), 2)],
    }
