"""
Verdict engine — horizon-aware, more decisive thresholds.
Mirrors the frontend verdictEngine.js logic server-side.

Horizons:
  short  — technical-heavy, triggers faster (±10 threshold)
  mid    — balanced weights (±15 threshold)          [default]
  long   — fundamental-heavy, needs strong story (±18 threshold)
"""

HORIZON_CONFIG = {
    "short": {
        "weights":  {"technical": 0.55, "fundamental": 0.10, "sentiment": 0.20, "geopolitical": 0.10, "insider": 0.05},
        "buy_at":   10,
        "sell_at": -10,
        "target":   {"BUY": 1.08, "SELL": 0.93, "HOLD": 1.03},
        "stop":     {"BUY": 0.96, "SELL": 1.04, "HOLD": 0.97},
    },
    "mid": {
        "weights":  {"technical": 0.30, "fundamental": 0.32, "sentiment": 0.20, "geopolitical": 0.13, "insider": 0.05},
        "buy_at":   15,
        "sell_at": -15,
        "target":   {"BUY": 1.15, "SELL": 0.88, "HOLD": 1.06},
        "stop":     {"BUY": 0.92, "SELL": 1.07, "HOLD": 0.95},
    },
    "long": {
        "weights":  {"technical": 0.10, "fundamental": 0.55, "sentiment": 0.10, "geopolitical": 0.15, "insider": 0.10},
        "buy_at":   18,
        "sell_at": -18,
        "target":   {"BUY": 1.30, "SELL": 0.78, "HOLD": 1.10},
        "stop":     {"BUY": 0.88, "SELL": 1.10, "HOLD": 0.93},
    },
}


def score_technical(rsi: float, macd_hist: float, ema20: float, ema50: float,
                    ema200: float, price: float, week_high: float = 0,
                    week_low: float = 0, change_pct: float = 0) -> tuple[float, str]:
    score = 0.0
    reasons = []

    # RSI
    if rsi < 25:   score += 10; reasons.append(f"RSI extreme oversold {rsi:.0f}")
    elif rsi < 35: score += 7;  reasons.append(f"RSI oversold {rsi:.0f}")
    elif rsi < 45: score += 3
    elif rsi > 75: score -= 10; reasons.append(f"RSI extreme overbought {rsi:.0f}")
    elif rsi > 65: score -= 7;  reasons.append(f"RSI overbought {rsi:.0f}")
    elif rsi > 55: score -= 2

    # MACD
    if macd_hist > 0:   score += 4; reasons.append("MACD bullish")
    elif macd_hist < 0: score -= 4; reasons.append("MACD bearish")

    # EMA alignment
    if ema20 and ema50 and ema200:
        if ema20 > ema50 > ema200:   score += 6; reasons.append("Golden EMA alignment")
        elif ema20 < ema50 < ema200: score -= 6; reasons.append("Death EMA alignment")
        elif ema20 > ema50:          score += 2
        else:                        score -= 2

    # 52-week position
    if week_high > week_low and price > 0:
        pos = (price - week_low) / (week_high - week_low)
        if pos < 0.15:   score += 8; reasons.append("Near 52W low — deep value zone")
        elif pos < 0.30: score += 4
        elif pos > 0.90: score -= 6; reasons.append("Near 52W high — stretched")
        elif pos > 0.75: score -= 3

    # Day momentum
    if change_pct >= 3:    score += 3
    elif change_pct >= 1:  score += 1
    elif change_pct <= -3: score -= 3
    elif change_pct <= -1: score -= 1

    score = max(-10, min(10, score / 3))
    return round(score, 2), "; ".join(reasons[:2]) or "Technical analysis"


def score_fundamental(pe: float, roe: float, profit_growth: float,
                      debt_eq: float, div_yield: float = 0) -> tuple[float, str]:
    score = 0.0
    reasons = []

    if pe and pe > 0:
        if   pe < 12:  score += 7; reasons.append(f"Low P/E {pe:.1f} — deep value")
        elif pe < 20:  score += 4; reasons.append(f"Fair P/E {pe:.1f}")
        elif pe < 30:  score += 1
        elif pe < 40:  score -= 2; reasons.append(f"Stretched P/E {pe:.1f}")
        elif pe > 60:  score -= 5; reasons.append(f"Expensive P/E {pe:.1f}")
        else:          score -= 3

    if roe:
        if   roe > 25: score += 5; reasons.append(f"Excellent ROE {roe:.1f}%")
        elif roe > 18: score += 3
        elif roe > 12: score += 1
        elif roe < 8:  score -= 4; reasons.append(f"Weak ROE {roe:.1f}%")
        else:          score -= 1

    if profit_growth is not None:
        if   profit_growth > 40: score += 6; reasons.append(f"Strong growth {profit_growth:.0f}%")
        elif profit_growth > 20: score += 4
        elif profit_growth > 10: score += 2
        elif profit_growth < 0:  score -= 6; reasons.append(f"Declining profits {profit_growth:.0f}%")
        elif profit_growth < 5:  score -= 2

    if debt_eq is not None:
        if   debt_eq < 0.2: score += 3
        elif debt_eq < 0.5: score += 1
        elif debt_eq > 2.0: score -= 5; reasons.append(f"High debt D/E {debt_eq:.2f}")
        elif debt_eq > 1.2: score -= 3

    if div_yield and div_yield > 3:
        score += 1

    return round(max(-10, min(10, score)), 2), "; ".join(reasons[:2]) or "Fundamental analysis"


def score_sentiment(overall: float) -> tuple[float, str]:
    score = max(-10, min(10, (overall or 0) / 10))
    label = "Positive sentiment" if score > 2 else "Negative sentiment" if score < -2 else "Neutral sentiment"
    return round(score, 2), label


def build_verdict(symbol: str, price: float, fund: dict, tech: dict,
                  sentiment_score: float = 0, geo_score: float = 0,
                  insider_score: float = 0, horizon: str = "mid") -> dict:
    """Compute BUY/SELL/HOLD verdict with horizon-aware weights and thresholds."""

    cfg = HORIZON_CONFIG.get(horizon, HORIZON_CONFIG["mid"])
    w   = cfg["weights"]

    rsi      = tech.get("rsi14", 50)
    macd_h   = tech.get("macd", {}).get("histogram", 0)
    ema20    = tech.get("ema20", price)
    ema50    = tech.get("ema50", price)
    ema200   = tech.get("ema200", price)
    w52h     = tech.get("weekHigh52", 0) or fund.get("weekHigh52", 0)
    w52l     = tech.get("weekLow52",  0) or fund.get("weekLow52",  0)
    chg_pct  = tech.get("changePercent", 0)

    t_score, t_reason = score_technical(rsi, macd_h, ema20, ema50, ema200, price, w52h, w52l, chg_pct)
    f_score, f_reason = score_fundamental(
        fund.get("pe", 0), fund.get("roe", 0),
        fund.get("profitGrowthYoY", 0), fund.get("debtToEquity", 0),
        fund.get("dividendYield", 0),
    )
    s_score, s_reason = score_sentiment(sentiment_score)
    g_score = round(max(-10, min(10, (geo_score or 0) / 10)), 2)
    i_score = round(max(-10, min(10, (insider_score or 0))), 2)

    composite = (
        t_score * w["technical"]    * 10 +
        f_score * w["fundamental"]  * 10 +
        s_score * w["sentiment"]    * 10 +
        g_score * w["geopolitical"] * 10 +
        i_score * w["insider"]      * 10
    )

    action     = "BUY" if composite > cfg["buy_at"] else "SELL" if composite < cfg["sell_at"] else "HOLD"
    confidence = min(95, int(abs(composite) * 1.1 + 42))

    return {
        "action":      action,
        "confidence":  confidence,
        "targetPrice": round(price * cfg["target"][action], 2),
        "stopLoss":    round(price * cfg["stop"][action],   2),
        "timeHorizon": horizon,
        "composite":   round(composite, 2),
        "reasoning": [
            {"factor": "technical",    "score": t_score, "weight": w["technical"],    "summary": t_reason, "signal": "positive" if t_score > 0 else "negative" if t_score < 0 else "neutral"},
            {"factor": "fundamental",  "score": f_score, "weight": w["fundamental"],  "summary": f_reason, "signal": "positive" if f_score > 0 else "negative" if f_score < 0 else "neutral"},
            {"factor": "sentiment",    "score": s_score, "weight": w["sentiment"],    "summary": s_reason, "signal": "positive" if s_score > 0 else "negative" if s_score < 0 else "neutral"},
            {"factor": "geopolitical", "score": g_score, "weight": w["geopolitical"], "summary": "India macro & geopolitical", "signal": "positive" if g_score > 0 else "negative" if g_score < 0 else "neutral"},
            {"factor": "insider",      "score": i_score, "weight": w["insider"],      "summary": "Insider activity",          "signal": "positive" if i_score > 0 else "negative" if i_score < 0 else "neutral"},
        ],
        "analystCount": 12,
    }
