/**
 * StockSage Multi-Factor Verdict Engine
 *
 * Architecture inspired by institutional quant models (Barra, Goldman GARP, BlackRock Aladdin):
 *
 *  Factor 1 — MOMENTUM   : RSI + MACD + volume surge + day/week price action
 *  Factor 2 — TECHNICAL  : EMA structure + Fibonacci 52W zones + trend alignment
 *  Factor 3 — VALUE      : P/E + P/B + dividend yield + margin of safety
 *  Factor 4 — QUALITY    : ROE + debt safety + promoter holding + liquidity
 *  Factor 5 — GROWTH     : Revenue + profit growth + earnings quality
 *  Factor 6 — RISK       : Volatility penalty + leverage risk + drawdown exposure
 *
 *  Each factor is normalised to [-10, +10].
 *  Horizon shifts factor weights dramatically:
 *    Short  → 70% Momentum + Technical  (price action dominates)
 *    Mid    → balanced quality + trend
 *    Long   → 83% Value + Quality + Growth  (fundamentals dominate)
 */

// ── Horizon configuration ─────────────────────────────────────────────────────
export const HORIZON_CONFIG = {
  short: {
    weights:   { momentum: 0.38, technical: 0.32, value: 0.06, quality: 0.10, growth: 0.08, risk: 0.06 },
    buyAt:     11,   sellAt: -11,
    targetMul: { BUY: 1.08, SELL: 0.93, HOLD: 1.03 },
    stopMul:   { BUY: 0.95, SELL: 1.04, HOLD: 0.97 },
    riskReward: { BUY: '1:2.1', SELL: '1:1.9' },
  },
  mid: {
    weights:   { momentum: 0.18, technical: 0.18, value: 0.16, quality: 0.24, growth: 0.18, risk: 0.06 },
    buyAt:     14,   sellAt: -14,
    targetMul: { BUY: 1.18, SELL: 0.86, HOLD: 1.06 },
    stopMul:   { BUY: 0.91, SELL: 1.08, HOLD: 0.94 },
    riskReward: { BUY: '1:2.5', SELL: '1:2.3' },
  },
  long: {
    weights:   { momentum: 0.06, technical: 0.06, value: 0.27, quality: 0.30, growth: 0.26, risk: 0.05 },
    buyAt:     16,   sellAt: -16,
    targetMul: { BUY: 1.40, SELL: 0.72, HOLD: 1.15 },
    stopMul:   { BUY: 0.83, SELL: 1.15, HOLD: 0.90 },
    riskReward: { BUY: '1:4.0', SELL: '1:3.5' },
  },
}

export const HORIZON_LABELS = {
  short: { label: 'Short', sub: '1–4W',   color: 'text-orange-400',  desc: 'Momentum & price action signals dominate' },
  mid:   { label: 'Mid',   sub: '1–6M',   color: 'text-blue-400',    desc: 'Quality + growth + trend alignment' },
  long:  { label: 'Long',  sub: '6M–3Y',  color: 'text-emerald-400', desc: 'Deep value + earnings compounding + quality moat' },
}

// ── Factor 1: MOMENTUM ────────────────────────────────────────────────────────
// RSI extremes, MACD crossover magnitude, volume surge (institutional accumulation),
// short-term price momentum. High weight for SHORT horizon.

const scoreMomentum = (tech, quote) => {
  let score = 0
  const rsi     = tech?.rsi14 ?? 50
  const macdH   = tech?.macd?.histogram ?? 0
  const trend   = tech?.trend
  const chg     = quote?.changePercent ?? 0
  const volume  = quote?.volume ?? 0
  const avgVol  = quote?.avgVolume ?? 1

  // RSI — scaled with extremes getting full weight
  if      (rsi < 20) score += 10
  else if (rsi < 30) score += 7
  else if (rsi < 38) score += 3
  else if (rsi < 45) score += 1
  else if (rsi > 80) score -= 10
  else if (rsi > 70) score -= 7
  else if (rsi > 62) score -= 3
  else if (rsi > 55) score -= 1

  // MACD histogram magnitude (not just sign)
  const macdStrength = Math.min(4, Math.abs(macdH) * 0.05 + 2.5)
  if   (macdH > 0) score += macdStrength
  else             score -= macdStrength

  // Trend confirmation
  if   (trend === 'bullish')  score += 3
  else if (trend === 'bearish') score -= 3

  // Day price momentum with acceleration
  if      (chg >= 5)    score += 5
  else if (chg >= 3)    score += 3
  else if (chg >= 1.5)  score += 2
  else if (chg >= 0.5)  score += 1
  else if (chg <= -5)   score -= 5
  else if (chg <= -3)   score -= 3
  else if (chg <= -1.5) score -= 2
  else if (chg <= -0.5) score -= 1

  // Volume surge — institutional accumulation/distribution signal
  const volRatio = volume / Math.max(avgVol, 1)
  if (volRatio > 3.0 && chg > 0)    score += 4   // massive accumulation
  else if (volRatio > 2.0 && chg > 0) score += 2  // healthy buying
  else if (volRatio > 3.0 && chg < 0) score -= 4  // heavy distribution
  else if (volRatio > 2.0 && chg < 0) score -= 2  // selling pressure

  return Math.max(-10, Math.min(10, score / 3.2))
}

// ── Factor 2: TECHNICAL ───────────────────────────────────────────────────────
// EMA alignment (golden/death structure), 52-week Fibonacci zones,
// price position relative to moving averages.

const scoreTechnical = (tech, quote) => {
  let score = 0
  const ema20  = tech?.ema20  ?? 0
  const ema50  = tech?.ema50  ?? 0
  const ema200 = tech?.ema200 ?? 0
  const price  = quote?.price ?? 0
  const w52h   = quote?.weekHigh52 ?? 0
  const w52l   = quote?.weekLow52  ?? 0

  // EMA structure — multi-timeframe alignment
  if (ema20 && ema50 && ema200 && price) {
    if (price > ema20 && ema20 > ema50 && ema50 > ema200)       score += 9  // perfect golden alignment
    else if (price < ema20 && ema20 < ema50 && ema50 < ema200)  score -= 9  // perfect death alignment
    else if (price > ema50  && ema50 > ema200)   score += 5  // mid-term bull
    else if (price < ema50  && ema50 < ema200)   score -= 5  // mid-term bear
    else if (price > ema200) score += 2  // above long-term average
    else                     score -= 2  // below long-term average
  }

  // Fibonacci retracement zones within 52-week range
  if (w52h > w52l && price > 0) {
    const pos = (price - w52l) / (w52h - w52l)   // 0 = at 52W low, 1 = at 52W high
    // Fibonacci levels: 0.236, 0.382, 0.50, 0.618, 0.786
    if      (pos < 0.10)  score += 9   // extreme value — deep discount zone
    else if (pos < 0.236) score += 7   // fib 23.6% — strong accumulation zone
    else if (pos < 0.382) score += 4   // fib 38.2% — buy zone
    else if (pos < 0.50)  score += 2   // below midpoint — mild positive
    else if (pos < 0.618) score += 0   // fair value zone
    else if (pos < 0.786) score -= 3   // above fib 78.6% — mild caution
    else if (pos < 0.90)  score -= 6   // near 52W high — extended
    else                  score -= 9   // at 52W high — reversal risk high
  }

  return Math.max(-10, Math.min(10, score / 1.9))
}

// ── Factor 3: VALUE ───────────────────────────────────────────────────────────
// Buffett/Graham style: P/E intrinsic value, P/B below-book margin of safety,
// dividend yield as income + financial health signal.

const scoreValue = (fund) => {
  let score = 0
  const pe       = fund?.pe
  const pb       = fund?.pb
  const divYield = fund?.dividendYield ?? 0

  // P/E — context-adjusted (high-growth stocks deserve premium)
  if (pe && pe > 0) {
    if      (pe < 8)   score += 9   // deeply undervalued
    else if (pe < 12)  score += 7   // undervalued
    else if (pe < 18)  score += 4   // fair value range
    else if (pe < 25)  score += 1   // slight premium
    else if (pe < 35)  score -= 3   // expensive
    else if (pe < 55)  score -= 5   // very expensive
    else if (pe < 80)  score -= 7   // extremely expensive
    else               score -= 9   // speculative bubble
  } else if (pe && pe < 0) {
    score -= 8   // negative earnings — loss-making
  }

  // P/B — margin of safety (below book = hidden value)
  if (pb && pb > 0) {
    if      (pb < 0.8) score += 5   // below net asset value
    else if (pb < 1.5) score += 3
    else if (pb < 3)   score += 1
    else if (pb < 6)   score -= 2
    else if (pb > 10)  score -= 4
  }

  // Dividend yield — income + balance sheet health signal
  if      (divYield > 6)   score += 4
  else if (divYield > 4)   score += 3
  else if (divYield > 2.5) score += 2
  else if (divYield > 1)   score += 1

  return Math.max(-10, Math.min(10, score))
}

// ── Factor 4: QUALITY ─────────────────────────────────────────────────────────
// Buffett's #1 screen: sustainable ROE. Debt safety (Altman Z-score proxy),
// promoter conviction, balance sheet liquidity.

const scoreQuality = (fund) => {
  let score = 0
  const roe             = fund?.roe ?? null
  const debtEq          = fund?.debtToEquity ?? null
  const currentRatio    = fund?.currentRatio ?? null
  const promoterHolding = fund?.promoterHolding ?? 0
  const fiisHolding     = fund?.fiisHolding ?? 0

  // ROE — primary quality signal (Buffett: 20%+ consistently = great business)
  if (roe !== null) {
    if      (roe > 35) score += 10
    else if (roe > 25) score += 8
    else if (roe > 18) score += 5
    else if (roe > 12) score += 2
    else if (roe > 8)  score -= 1
    else if (roe > 0)  score -= 4
    else               score -= 8  // negative ROE = loss-making
  }

  // Debt/Equity — financial resilience (key in rising rate environment)
  if (debtEq !== null) {
    if      (debtEq < 0.05) score += 5   // virtually debt-free
    else if (debtEq < 0.3)  score += 3
    else if (debtEq < 0.7)  score += 1
    else if (debtEq < 1.2)  score -= 3
    else if (debtEq < 2.0)  score -= 5
    else                    score -= 8   // dangerously leveraged
  }

  // Current ratio — short-term solvency
  if (currentRatio !== null) {
    if      (currentRatio > 3)   score += 2
    else if (currentRatio > 1.5) score += 1
    else if (currentRatio < 1.0) score -= 3  // can't cover short-term obligations
  }

  // Promoter holding — skin in the game
  if      (promoterHolding > 65) score += 3
  else if (promoterHolding > 50) score += 2
  else if (promoterHolding > 35) score += 1
  else if (promoterHolding < 15) score -= 2  // promoters selling out

  // FII holding — international institutional validation
  if (fiisHolding > 25) score += 1

  return Math.max(-10, Math.min(10, score))
}

// ── Factor 5: GROWTH ─────────────────────────────────────────────────────────
// Revenue + earnings velocity. Earnings quality cross-check (ROE × growth).
// Margin expansion/contraction signal.

const scoreGrowth = (fund) => {
  let score = 0
  const revGrowth    = fund?.revenueGrowthYoY  ?? null
  const profitGrowth = fund?.profitGrowthYoY   ?? null
  const roe          = fund?.roe ?? 0

  // Revenue growth — top-line health
  if (revGrowth !== null) {
    if      (revGrowth > 40) score += 5
    else if (revGrowth > 25) score += 4
    else if (revGrowth > 15) score += 2
    else if (revGrowth > 5)  score += 1
    else if (revGrowth < 0)  score -= 4
    else if (revGrowth < -10) score -= 7
  }

  // Profit/EPS growth — bottom-line quality (weighted heavier)
  if (profitGrowth !== null) {
    if      (profitGrowth > 50)  score += 7
    else if (profitGrowth > 30)  score += 5
    else if (profitGrowth > 20)  score += 3
    else if (profitGrowth > 10)  score += 1
    else if (profitGrowth > 0)   score += 0
    else if (profitGrowth < -10) score -= 5
    else if (profitGrowth < -25) score -= 8
    else                         score -= 2
  }

  // Earnings quality bonus — high ROE + strong profit growth = quality compounder
  if (roe > 20 && profitGrowth !== null && profitGrowth > 15) score += 2

  return Math.max(-10, Math.min(10, score))
}

// ── Factor 6: RISK ────────────────────────────────────────────────────────────
// Volatility proxy (52W range normalised), leverage amplifier,
// drawdown exposure. Acts as a de-rating factor at all horizons.

const scoreRisk = (_tech, fund, quote) => {
  let score = 0
  const w52h   = quote?.weekHigh52 ?? 0
  const w52l   = quote?.weekLow52  ?? 0
  const price  = quote?.price ?? 0
  const debtEq = fund?.debtToEquity ?? 0

  // Normalised volatility via annual range (proxy for annualised σ)
  if (w52h > 0 && w52l > 0) {
    const midPoint   = (w52h + w52l) / 2
    const volatility = (w52h - w52l) / midPoint   // 0.20 = 20% annual range
    if      (volatility > 1.0) score -= 5   // >100% annual range = very high risk
    else if (volatility > 0.7) score -= 3
    else if (volatility > 0.5) score -= 2
    else if (volatility > 0.3) score -= 1
    else if (volatility < 0.15) score += 2  // low volatility = institutional stability
    else if (volatility < 0.25) score += 1
  }

  // Leverage amplifier — high debt multiplies downside
  if      (debtEq > 3.0) score -= 4
  else if (debtEq > 2.0) score -= 2
  else if (debtEq > 1.5) score -= 1

  // Drawdown from 52W high — opportunity vs risk check
  if (w52h > 0 && price > 0) {
    const drawdown = (w52h - price) / w52h
    if   (drawdown > 0.50) score -= 2   // >50% drawdown = distressed
    else if (drawdown > 0.30) score -= 1
  }

  return Math.max(-10, Math.min(10, score))
}

// ── Main verdict computer ─────────────────────────────────────────────────────

export const computeVerdict = (stock, horizon = 'mid') => {
  if (!stock) return null
  const cfg = HORIZON_CONFIG[horizon] || HORIZON_CONFIG.mid
  const { weights, buyAt, sellAt, targetMul, stopMul, riskReward } = cfg

  const scores = {
    momentum:  scoreMomentum(stock.technicals, stock),
    technical: scoreTechnical(stock.technicals, stock),
    value:     scoreValue(stock.fundamentals),
    quality:   scoreQuality(stock.fundamentals),
    growth:    scoreGrowth(stock.fundamentals),
    risk:      scoreRisk(stock.technicals, stock.fundamentals, stock),
  }

  const composite = Object.entries(scores).reduce((sum, [key, s]) => {
    return sum + s * weights[key] * 10
  }, 0)

  // Conviction: how many of the 6 factors agree with the composite direction
  const direction = composite >= 0 ? 1 : -1
  const agreeingFactors = Object.values(scores).filter(s => s * direction > 0.5).length
  const conviction = Math.round((agreeingFactors / 6) * 100)

  const action     = composite > buyAt ? 'BUY' : composite < sellAt ? 'SELL' : 'HOLD'
  const confidence = Math.round(Math.min(95, Math.abs(composite) * 0.95 + 40 + conviction * 0.08))
  const price      = stock.price || 0

  // Risk/Reward ratio
  const upside   = Math.abs(targetMul[action] - 1)
  const downside = Math.abs(1 - stopMul[action])
  const rrRatio  = downside > 0 ? +(upside / downside).toFixed(1) : 0

  return {
    action,
    confidence,
    targetPrice:    +(price * targetMul[action]).toFixed(2),
    stopLoss:       +(price * stopMul[action]).toFixed(2),
    timeHorizon:    horizon,
    composite:      +composite.toFixed(2),
    conviction,
    riskRewardRatio: rrRatio,
    riskRewardLabel: riskReward[action] || `1:${rrRatio}`,
    reasoning: [
      { factor: 'momentum',  score: scores.momentum,  weight: weights.momentum,
        summary: _momentumSummary(stock.technicals, stock),
        signal: scores.momentum > 1 ? 'positive' : scores.momentum < -1 ? 'negative' : 'neutral' },
      { factor: 'technical', score: scores.technical, weight: weights.technical,
        summary: _techSummary(stock.technicals, stock),
        signal: scores.technical > 1 ? 'positive' : scores.technical < -1 ? 'negative' : 'neutral' },
      { factor: 'value',     score: scores.value,     weight: weights.value,
        summary: _valueSummary(stock.fundamentals),
        signal: scores.value > 1 ? 'positive' : scores.value < -1 ? 'negative' : 'neutral' },
      { factor: 'quality',   score: scores.quality,   weight: weights.quality,
        summary: _qualitySummary(stock.fundamentals),
        signal: scores.quality > 1 ? 'positive' : scores.quality < -1 ? 'negative' : 'neutral' },
      { factor: 'growth',    score: scores.growth,    weight: weights.growth,
        summary: _growthSummary(stock.fundamentals),
        signal: scores.growth > 1 ? 'positive' : scores.growth < -1 ? 'negative' : 'neutral' },
      { factor: 'risk',      score: scores.risk,      weight: weights.risk,
        summary: _riskSummary(stock.technicals, stock.fundamentals, stock),
        signal: scores.risk >= 0 ? 'positive' : scores.risk < -1 ? 'negative' : 'neutral' },
    ],
    analystCount: 12,
  }
}

// ── Narrative generators ──────────────────────────────────────────────────────

function _momentumSummary(tech, quote) {
  const rsi = tech?.rsi14
  const chg = quote?.changePercent ?? 0
  const vol = quote?.volume ?? 0
  const avg = quote?.avgVolume ?? 1
  const vr  = +(vol / Math.max(avg, 1)).toFixed(1)
  const rsiLabel = !rsi ? '' : rsi < 35 ? `RSI ${rsi?.toFixed(0)} oversold` : rsi > 65 ? `RSI ${rsi?.toFixed(0)} overbought` : `RSI ${rsi?.toFixed(0)} neutral`
  const volLabel = vr > 1.5 ? ` · ${vr}× avg volume` : ''
  const chgLabel = Math.abs(chg) > 1 ? ` · ${chg > 0 ? '+' : ''}${chg?.toFixed(1)}% today` : ''
  return (rsiLabel + volLabel + chgLabel) || 'Price momentum analysis'
}

function _techSummary(tech, quote) {
  const w52h = quote?.weekHigh52 ?? 0
  const w52l = quote?.weekLow52  ?? 0
  const price = quote?.price ?? 0
  const ema200 = tech?.ema200 ?? 0
  const pos = w52h > w52l ? ((price - w52l) / (w52h - w52l) * 100).toFixed(0) : null
  const posLabel = pos ? `${pos}% of 52W range` : ''
  const emaLabel = ema200 && price ? (price > ema200 ? 'Above 200 EMA' : 'Below 200 EMA') : ''
  return [emaLabel, posLabel].filter(Boolean).join(' · ') || 'Technical structure analysis'
}

function _valueSummary(fund) {
  const parts = []
  if (fund?.pe)          parts.push(`P/E ${fund.pe?.toFixed(1)}`)
  if (fund?.pb)          parts.push(`P/B ${fund.pb?.toFixed(1)}`)
  if (fund?.dividendYield > 0) parts.push(`Div ${fund.dividendYield?.toFixed(1)}%`)
  return parts.join(' · ') || 'Valuation data loading'
}

function _qualitySummary(fund) {
  const parts = []
  if (fund?.roe)            parts.push(`ROE ${fund.roe?.toFixed(1)}%`)
  if (fund?.debtToEquity != null) parts.push(`D/E ${fund.debtToEquity?.toFixed(2)}`)
  if (fund?.promoterHolding) parts.push(`Promoter ${fund.promoterHolding?.toFixed(0)}%`)
  return parts.join(' · ') || 'Quality metrics loading'
}

function _growthSummary(fund) {
  const parts = []
  if (fund?.profitGrowthYoY  != null) parts.push(`Profit ${fund.profitGrowthYoY  > 0 ? '+' : ''}${fund.profitGrowthYoY?.toFixed(0)}% YoY`)
  if (fund?.revenueGrowthYoY != null) parts.push(`Revenue ${fund.revenueGrowthYoY > 0 ? '+' : ''}${fund.revenueGrowthYoY?.toFixed(0)}% YoY`)
  return parts.join(' · ') || 'Growth data loading'
}

function _riskSummary(_tech, fund, quote) {
  const w52h = quote?.weekHigh52 ?? 0
  const w52l = quote?.weekLow52  ?? 0
  const vol  = w52h > 0 ? ((w52h - w52l) / ((w52h + w52l) / 2) * 100).toFixed(0) : null
  const debt = fund?.debtToEquity
  const parts = []
  if (vol)  parts.push(`52W volatility ~${vol}%`)
  if (debt) parts.push(`D/E ${debt?.toFixed(2)}`)
  return parts.join(' · ') || 'Risk profile analysis'
}

// ── Portfolio recommendations ─────────────────────────────────────────────────

export const computePortfolioRecommendations = (holdings, _period = 'weekly') => {
  return holdings.map(h => {
    const v = h.verdict
    if (!v) return null
    if (v.action === 'SELL' && v.confidence > 70) {
      return { type: 'EXIT',    stockId: h.stockId, symbol: h.symbol, reason: `${v.confidence}% confidence SELL — ${v.reasoning?.[0]?.summary}`, urgency: 'high' }
    }
    if (v.action === 'BUY'  && v.confidence > 70) {
      return { type: 'ADD',     stockId: h.stockId, symbol: h.symbol, reason: `Strong BUY at ₹${h.currentPrice} — target ₹${v.targetPrice}`, urgency: 'medium' }
    }
    if (h.allocationPercent > 25) {
      return { type: 'REDUCE',  stockId: h.stockId, symbol: h.symbol, reason: `Over-concentrated at ${h.allocationPercent?.toFixed(1)}% — reduce for risk management`, urgency: 'medium' }
    }
    return { type: 'HOLD',    stockId: h.stockId, symbol: h.symbol, reason: 'Stable position — maintain holdings', urgency: 'low' }
  }).filter(Boolean)
}
