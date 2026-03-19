// Local verdict scoring engine — weights per factor
const WEIGHTS = {
  technical: 0.30,
  fundamental: 0.25,
  sentiment: 0.20,
  geopolitical: 0.15,
  insider: 0.10,
}

const scoreTechnical = (tech) => {
  if (!tech) return 0
  let score = 0
  const rsi = tech.rsi14 ?? 50
  if (rsi < 30) score += 8      // oversold = bullish
  else if (rsi > 70) score -= 8 // overbought = bearish
  else score += (50 - rsi) * 0.1

  if (tech.macd) {
    if (tech.macd.histogram > 0) score += 4
    else score -= 4
  }

  if (tech.ema20 && tech.ema50 && tech.ema200) {
    if (tech.ema20 > tech.ema50 && tech.ema50 > tech.ema200) score += 6
    else if (tech.ema20 < tech.ema50 && tech.ema50 < tech.ema200) score -= 6
  }

  if (tech.trend === 'bullish') score += 3
  else if (tech.trend === 'bearish') score -= 3

  return Math.max(-10, Math.min(10, score / 2))
}

const scoreFundamental = (fund) => {
  if (!fund) return 0
  let score = 0
  const pe = fund.pe ?? 25
  if (pe < 15) score += 5
  else if (pe < 25) score += 2
  else if (pe > 40) score -= 4
  else if (pe > 30) score -= 2

  const roe = fund.roe ?? 15
  if (roe > 20) score += 4
  else if (roe > 15) score += 2
  else if (roe < 10) score -= 3

  const growth = fund.profitGrowthYoY ?? 10
  if (growth > 30) score += 5
  else if (growth > 15) score += 3
  else if (growth < 0) score -= 5
  else if (growth < 5) score -= 2

  const debt = fund.debtToEquity ?? 0.5
  if (debt < 0.3) score += 2
  else if (debt > 1.5) score -= 3

  return Math.max(-10, Math.min(10, score))
}

const scoreSentiment = (sent) => {
  if (!sent) return 0
  const overall = sent.overall ?? 0
  return Math.max(-10, Math.min(10, overall / 10))
}

const scoreGeopolitical = (sent) => {
  if (!sent) return 0
  const geo = sent.geopolitical ?? 0
  return Math.max(-10, Math.min(10, geo / 10))
}

const scoreInsider = (trades = []) => {
  if (!trades.length) return 0
  const recentTrades = trades.filter(t => {
    const d = new Date(t.date)
    const now = new Date()
    const diffDays = (now - d) / (1000 * 60 * 60 * 24)
    return diffDays <= 90
  })
  if (!recentTrades.length) return 0
  let score = 0
  recentTrades.forEach(t => {
    const weight = t.type === 'BUY' ? 1 : -1
    const magnitude = Math.min(t.totalValueCr / 10, 5)
    score += weight * magnitude
  })
  return Math.max(-10, Math.min(10, score))
}

export const computeVerdict = (stock) => {
  if (!stock) return null
  const scores = {
    technical: scoreTechnical(stock.technicals),
    fundamental: scoreFundamental(stock.fundamentals),
    sentiment: scoreSentiment(stock.sentiment),
    geopolitical: scoreGeopolitical(stock.sentiment),
    insider: scoreInsider(stock.insiderTrades),
  }

  const composite = Object.entries(scores).reduce((sum, [key, score]) => {
    return sum + score * WEIGHTS[key] * 10
  }, 0)

  const action = composite > 25 ? 'BUY' : composite < -25 ? 'SELL' : 'HOLD'
  const confidence = Math.round(Math.min(95, Math.abs(composite) * 1.2 + 40))

  const targetPrice = stock.price * (action === 'BUY' ? 1.15 : action === 'SELL' ? 0.88 : 1.05)
  const stopLoss = stock.price * (action === 'BUY' ? 0.92 : action === 'SELL' ? 1.06 : 0.95)

  return { action, confidence, targetPrice: +targetPrice.toFixed(2), stopLoss: +stopLoss.toFixed(2), scores, composite }
}

export const computePortfolioRecommendations = (holdings, period = 'weekly') => {
  return holdings.map(h => {
    const v = h.verdict
    if (!v) return null
    if (v.action === 'SELL' && v.confidence > 70) {
      return { type: 'EXIT', stockId: h.stockId, symbol: h.symbol, reason: `${v.confidence}% confidence SELL signal — ${v.reasoning?.[0]?.summary}`, urgency: 'high' }
    }
    if (v.action === 'BUY' && v.confidence > 75) {
      return { type: 'ADD', stockId: h.stockId, symbol: h.symbol, reason: `Strong BUY at ₹${h.currentPrice} — target ₹${v.targetPrice}`, urgency: 'medium' }
    }
    if (h.allocationPercent > 25) {
      return { type: 'REDUCE', stockId: h.stockId, symbol: h.symbol, reason: `Over-concentrated at ${h.allocationPercent?.toFixed(1)}% of portfolio — reduce for risk management`, urgency: 'medium' }
    }
    return { type: 'HOLD', stockId: h.stockId, symbol: h.symbol, reason: `Stable fundamentals — maintain position`, urgency: 'low' }
  }).filter(Boolean)
}
