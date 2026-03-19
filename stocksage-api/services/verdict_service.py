"""
Verdict engine — same 5-factor logic as the frontend, computed server-side.
Scores are deterministic given the same input data.
"""

WEIGHTS = {
    "technical":    0.30,
    "fundamental":  0.25,
    "sentiment":    0.20,
    "geopolitical": 0.15,
    "insider":      0.10,
}


def score_technical(rsi: float, macd_hist: float, ema20: float, ema50: float,
                    ema200: float, price: float) -> tuple[float, str]:
    score = 0.0
    reasons = []

    if rsi < 30:
        score += 8; reasons.append(f"RSI oversold at {rsi:.0f}")
    elif rsi > 70:
        score -= 8; reasons.append(f"RSI overbought at {rsi:.0f}")
    else:
        score += (50 - rsi) * 0.08
        reasons.append(f"RSI neutral at {rsi:.0f}")

    if macd_hist > 0:
        score += 4; reasons.append("MACD bullish crossover")
    elif macd_hist < 0:
        score -= 4; reasons.append("MACD bearish signal")

    if ema20 and ema50 and ema200:
        if ema20 > ema50 > ema200:
            score += 5; reasons.append("Price above all EMAs — bullish alignment")
        elif ema20 < ema50 < ema200:
            score -= 5; reasons.append("Price below all EMAs — bearish alignment")

    score = max(-10, min(10, score / 2))
    return round(score, 2), "; ".join(reasons[:2])


def score_fundamental(pe: float, roe: float, profit_growth: float,
                      debt_eq: float) -> tuple[float, str]:
    score = 0.0
    reasons = []

    if pe and pe > 0:
        if pe < 15:    score += 5; reasons.append(f"Low P/E {pe:.1f} — undervalued")
        elif pe < 25:  score += 2; reasons.append(f"Fair P/E {pe:.1f}")
        elif pe > 40:  score -= 4; reasons.append(f"Expensive P/E {pe:.1f}")
        else:          score -= 2; reasons.append(f"Stretched P/E {pe:.1f}")

    if roe:
        if roe > 20:   score += 4; reasons.append(f"Strong ROE {roe:.1f}%")
        elif roe > 15: score += 2
        elif roe < 10: score -= 3; reasons.append(f"Weak ROE {roe:.1f}%")

    if profit_growth:
        if profit_growth > 30:   score += 5; reasons.append(f"Profit growth {profit_growth:.1f}% YoY")
        elif profit_growth > 15: score += 3
        elif profit_growth < 0:  score -= 5; reasons.append(f"Declining profits {profit_growth:.1f}%")
        elif profit_growth < 5:  score -= 2

    if debt_eq:
        if debt_eq < 0.3:  score += 2
        elif debt_eq > 1.5: score -= 3; reasons.append(f"High debt D/E {debt_eq:.2f}")

    return round(max(-10, min(10, score)), 2), "; ".join(reasons[:2])


def score_sentiment(overall: float) -> tuple[float, str]:
    score = max(-10, min(10, (overall or 0) / 10))
    label = "Positive sentiment" if score > 2 else "Negative sentiment" if score < -2 else "Neutral sentiment"
    return round(score, 2), label


def build_verdict(symbol: str, price: float, fund: dict, tech: dict,
                  sentiment_score: float = 0, geo_score: float = 0,
                  insider_score: float = 0) -> dict:
    """Compute full BUY/SELL/HOLD verdict from input data."""

    rsi      = tech.get("rsi14", 50)
    macd_h   = tech.get("macd", {}).get("histogram", 0)
    ema20    = tech.get("ema20", price)
    ema50    = tech.get("ema50", price)
    ema200   = tech.get("ema200", price)

    t_score, t_reason = score_technical(rsi, macd_h, ema20, ema50, ema200, price)
    f_score, f_reason = score_fundamental(
        fund.get("pe", 0), fund.get("roe", 0),
        fund.get("profitGrowthYoY", 0), fund.get("debtToEquity", 0)
    )
    s_score, s_reason = score_sentiment(sentiment_score)
    g_score = round(max(-10, min(10, (geo_score or 0) / 10)), 2)
    i_score = round(max(-10, min(10, (insider_score or 0))), 2)

    composite = (
        t_score * WEIGHTS["technical"] * 10 +
        f_score * WEIGHTS["fundamental"] * 10 +
        s_score * WEIGHTS["sentiment"] * 10 +
        g_score * WEIGHTS["geopolitical"] * 10 +
        i_score * WEIGHTS["insider"] * 10
    )

    action     = "BUY" if composite > 25 else "SELL" if composite < -25 else "HOLD"
    confidence = min(95, int(abs(composite) * 1.2 + 40))

    target_mult = 1.15 if action == "BUY" else 0.88 if action == "SELL" else 1.05
    stop_mult   = 0.92 if action == "BUY" else 1.06 if action == "SELL" else 0.95

    return {
        "action":      action,
        "confidence":  confidence,
        "targetPrice": round(price * target_mult, 2),
        "stopLoss":    round(price * stop_mult, 2),
        "timeHorizon": "medium" if confidence > 75 else "short",
        "composite":   round(composite, 2),
        "reasoning": [
            {"factor": "technical",    "score": t_score, "weight": 0.30, "summary": t_reason or "Technical analysis signal",   "signal": "positive" if t_score > 0 else "negative" if t_score < 0 else "neutral"},
            {"factor": "fundamental",  "score": f_score, "weight": 0.25, "summary": f_reason or "Fundamental analysis signal", "signal": "positive" if f_score > 0 else "negative" if f_score < 0 else "neutral"},
            {"factor": "sentiment",    "score": s_score, "weight": 0.20, "summary": s_reason,                                  "signal": "positive" if s_score > 0 else "negative" if s_score < 0 else "neutral"},
            {"factor": "geopolitical", "score": g_score, "weight": 0.15, "summary": "India macro & geopolitical impact",       "signal": "positive" if g_score > 0 else "negative" if g_score < 0 else "neutral"},
            {"factor": "insider",      "score": i_score, "weight": 0.10, "summary": "Insider trading activity",                "signal": "positive" if i_score > 0 else "negative" if i_score < 0 else "neutral"},
        ],
        "analystCount": 12,
    }
