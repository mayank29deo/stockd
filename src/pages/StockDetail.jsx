import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Star, TrendingUp, TrendingDown, Target, ShieldAlert, Clock, ExternalLink, RefreshCw } from 'lucide-react'
import { STOCKS } from '../data/mock/stocks'
import { StockChart } from '../components/charts/StockChart'
import { VerdictBadge, ExchangeBadge, SectorBadge } from '../components/ui/Badge'
import { formatINR, formatDate, getChangeColor, formatPercent, formatVolume } from '../utils/formatters'
import { useWatchlistStore, useUIStore } from '../store/index'
import { useStockDetail, useStockHistory } from '../hooks/useStocks'
import { computeVerdict, HORIZON_LABELS } from '../utils/verdictEngine'
import { clsx } from 'clsx'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'

const FACTOR_LABELS = {
  momentum:  'Momentum',
  technical: 'Technical',
  value:     'Value',
  quality:   'Quality',
  growth:    'Growth',
  risk:      'Risk',
}

const getRsiLabel = (rsi) => {
  if (rsi > 70) return { label: 'Overbought', color: 'text-bear' }
  if (rsi < 30) return { label: 'Oversold', color: 'text-bull' }
  return { label: 'Neutral', color: 'text-secondary' }
}

const getTrendColor = (trend) => {
  if (trend === 'bullish') return 'text-bull'
  if (trend === 'bearish') return 'text-bear'
  return 'text-caution'
}

const DetailSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    <div className="bg-card border border-subtle rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-muted rounded w-32" />
          <div className="h-3 bg-muted rounded w-48" />
          <div className="h-6 bg-muted rounded w-28" />
        </div>
      </div>
    </div>
    <div className="bg-card border border-subtle rounded-xl p-5 h-64" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-card border border-subtle rounded-xl p-5 h-48" />
      <div className="bg-card border border-subtle rounded-xl p-5 h-48" />
    </div>
  </div>
)

export const StockDetail = () => {
  const { symbol } = useParams()
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, activeWatchlistId } = useWatchlistStore()
  const { addToast } = useUIStore()
  const [horizon, setHorizon] = useState('mid')

  const { data: stock, loading, isLive, refetch } = useStockDetail(symbol)
  const { data: priceHistory } = useStockHistory(symbol, '1y')

  const inWatchlist = isInWatchlist(symbol)

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      <Link to="/discover" className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
        <ArrowLeft size={15} /> Back to Discover
      </Link>
      <DetailSkeleton />
    </div>
  )

  if (!stock) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-secondary text-lg">Stock "{symbol}" not found</p>
        <Link to="/discover" className="mt-4 inline-block text-saffron-500 hover:underline">Browse stocks</Link>
      </div>
    )
  }

  const isPos = (stock.changePercent ?? 0) >= 0
  // Recompute verdict locally whenever horizon changes — instant, no API call needed
  const verdict = computeVerdict(stock, horizon) || stock.verdict
  const fund = stock.fundamentals
  const tech = stock.technicals

  // Radar data
  const radarData = verdict?.reasoning?.map(r => ({
    factor: FACTOR_LABELS[r.factor] || r.factor,
    score: Math.max(0, (r.score + 10) * 5),
    fullMark: 100,
  })) || []

  // Revenue/Profit charts
  const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4']
  const revenueData = (fund?.revenueQtrCr || []).map((v, i) => ({ q: quarterLabels[i], rev: v, profit: (fund?.profitQtrCr || [])[i] || 0 }))

  // Similar stocks (sector peers from mock as fallback)
  const similarStocks = STOCKS.filter(s => s.sector === stock.sector && s.symbol !== stock.symbol).slice(0, 4)

  const handleWatchlist = () => {
    const stockKey = stock.symbol || stock.id
    if (!stockKey) return   // guard: never add null/undefined to watchlist
    if (inWatchlist) {
      removeFromWatchlist(activeWatchlistId, stockKey)
      addToast({ type: 'info', title: 'Removed from Watchlist', message: stockKey })
    } else {
      addToWatchlist(activeWatchlistId, stockKey)
      addToast({ type: 'success', title: 'Added to Watchlist', message: stockKey })
    }
  }

  const rsiInfo = getRsiLabel(tech?.rsi14)

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      {/* Back */}
      <div className="flex items-center justify-between">
        <Link to="/discover" className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
          <ArrowLeft size={15} /> Back to Discover
        </Link>
        <div className="flex items-center gap-2">
          {!isLive && <span className="text-[10px] text-faded bg-elevated px-2 py-0.5 rounded-full">Demo data</span>}
          <button onClick={refetch} className="text-secondary hover:text-primary transition-colors p-1 rounded">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-subtle rounded-xl p-5"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: stock identity */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-glow-saffron"
              style={{ backgroundColor: stock.color || '#FF6B35' }}
            >
              {stock.logo || stock.symbol?.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-primary">{stock.symbol}</h1>
                <ExchangeBadge exchange={stock.exchange} />
                <SectorBadge sector={stock.sector} />
              </div>
              <p className="text-sm text-secondary mt-0.5">{stock.name}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-2xl font-bold font-mono text-primary">{formatINR(stock.price)}</span>
                <span className={clsx('text-sm font-semibold flex items-center gap-1', getChangeColor(stock.changePercent))}>
                  {isPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isPos ? '+' : ''}{stock.change?.toFixed(2)} ({isPos ? '+' : ''}{stock.changePercent?.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Right: actions + verdict */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleWatchlist}
              className={clsx(
                'flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border font-medium transition-colors',
                inWatchlist
                  ? 'bg-saffron-500/10 border-saffron-500/30 text-saffron-500'
                  : 'border-subtle text-secondary hover:text-primary hover:border-muted'
              )}
            >
              <Star size={14} className={inWatchlist ? 'fill-saffron-500' : ''} />
              {inWatchlist ? 'Watching' : 'Watchlist'}
            </button>
            {/* Time horizon toggle */}
            <div className="flex items-center gap-1 bg-elevated border border-subtle rounded-lg p-1">
              {Object.entries(HORIZON_LABELS).map(([key, h]) => (
                <button
                  key={key}
                  onClick={() => setHorizon(key)}
                  className={clsx(
                    'flex flex-col items-center px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all',
                    horizon === key
                      ? 'bg-saffron-500/15 text-saffron-500 border border-saffron-500/30'
                      : 'text-secondary hover:text-primary'
                  )}
                >
                  <span>{h.label}</span>
                  <span className="text-[9px] font-normal opacity-70">{h.sub}</span>
                </button>
              ))}
            </div>
            {verdict && (
              <div className="text-center">
                <VerdictBadge verdict={verdict.action} size="lg" />
                <p className="text-xs text-secondary mt-1">{verdict.confidence}% confidence</p>
              </div>
            )}
          </div>
        </div>

        {/* Verdict details */}
        {verdict && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-subtle">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-bull flex-shrink-0" />
              <div>
                <p className="text-[10px] text-faded">Target Price</p>
                <p className="text-sm font-mono font-bold text-primary">{formatINR(verdict.targetPrice)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-bear flex-shrink-0" />
              <div>
                <p className="text-[10px] text-faded">Stop Loss</p>
                <p className="text-sm font-mono font-bold text-primary">{formatINR(verdict.stopLoss)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-caution flex-shrink-0" />
              <div>
                <p className="text-[10px] text-faded">Time Horizon</p>
                <p className={clsx('text-sm font-semibold capitalize', HORIZON_LABELS[horizon]?.color)}>
                  {HORIZON_LABELS[horizon]?.label}-term · {HORIZON_LABELS[horizon]?.sub}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ExternalLink size={14} className="text-secondary flex-shrink-0" />
              <div>
                <p className="text-[10px] text-faded">Conviction · Risk/Reward</p>
                <p className="text-sm font-semibold text-primary">
                  {verdict.conviction != null ? `${verdict.conviction}%` : '—'}
                  {verdict.riskRewardRatio != null ? ` · ${verdict.riskRewardRatio}x` : ''}
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Price chart */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="bg-card border border-subtle rounded-xl p-5"
      >
        <h2 className="text-sm font-semibold text-primary mb-4">Price Chart</h2>
        <StockChart priceHistory={priceHistory || stock.priceHistory || []} stockName={stock.name} isPositive={isPos} />

        {/* OHLV summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-subtle">
          {[
            { label: 'Open', value: formatINR(stock.open) },
            { label: 'High', value: formatINR(stock.high) },
            { label: 'Low', value: formatINR(stock.low) },
            { label: 'Volume', value: formatVolume(stock.volume) },
            { label: '52W High', value: formatINR(stock.weekHigh52) },
            { label: '52W Low', value: formatINR(stock.weekLow52) },
            { label: 'Avg Vol', value: formatVolume(stock.avgVolume) },
            { label: 'Prev Close', value: formatINR(stock.previousClose) },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] text-faded">{item.label}</p>
              <p className="text-xs font-mono font-semibold text-primary">{item.value || '—'}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 6-Factor Analysis + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Verdict breakdown */}
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">Verdict Breakdown</h2>
          <div className="space-y-3">
            {verdict?.reasoning?.map(r => {
              const pct = Math.round(((r.score + 10) / 20) * 100)
              const color = r.signal === 'positive' ? 'bg-bull' : r.signal === 'negative' ? 'bg-bear' : 'bg-caution'
              const textColor = r.signal === 'positive' ? 'text-bull' : r.signal === 'negative' ? 'text-bear' : 'text-caution'
              return (
                <div key={r.factor}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-secondary capitalize">{FACTOR_LABELS[r.factor] || r.factor}</span>
                    <span className={clsx('text-xs font-semibold', textColor)}>{r.score > 0 ? '+' : ''}{r.score}/10</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={clsx('h-full rounded-full', color)}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                    />
                  </div>
                  <p className="text-[10px] text-faded mt-1 leading-snug">{r.summary}</p>
                </div>
              )
            })}
            {(!verdict?.reasoning || verdict.reasoning.length === 0) && (
              <p className="text-xs text-faded text-center py-4">Verdict analysis not available</p>
            )}
          </div>
        </motion.div>

        {/* Radar chart */}
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-2">Factor Radar</h2>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#1E1E2E" />
              <PolarAngleAxis dataKey="factor" tick={{ fill: '#9999B3', fontSize: 11 }} />
              <Radar
                dataKey="score"
                stroke={verdict?.action === 'BUY' ? '#00C897' : verdict?.action === 'SELL' ? '#FF4757' : '#FFB020'}
                fill={verdict?.action === 'BUY' ? '#00C897' : verdict?.action === 'SELL' ? '#FF4757' : '#FFB020'}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Technicals + Fundamentals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Technical Analysis */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">Technical Analysis</h2>
          {tech ? (
            <div className="space-y-3">
              {/* RSI */}
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <div>
                  <p className="text-xs font-medium text-secondary">RSI (14)</p>
                  <p className={clsx('text-[10px]', rsiInfo.color)}>{rsiInfo.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-bold text-primary">{tech.rsi14}</p>
                  <div className="w-24 h-1.5 bg-muted rounded-full mt-1">
                    <div className="h-full rounded-full bg-saffron-500" style={{ width: `${tech.rsi14}%` }} />
                  </div>
                </div>
              </div>

              {/* MACD */}
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <p className="text-xs font-medium text-secondary">MACD Signal</p>
                <div className="text-right">
                  <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded', tech.macd?.histogram > 0 ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear')}>
                    {tech.macd?.histogram > 0 ? 'Bullish' : 'Bearish'}
                  </span>
                  <p className="text-[10px] text-faded mt-0.5">Hist: {tech.macd?.histogram?.toFixed(2)}</p>
                </div>
              </div>

              {/* EMA Alignment */}
              <div className="py-2 border-b border-subtle">
                <p className="text-xs font-medium text-secondary mb-2">Moving Averages</p>
                <div className="grid grid-cols-3 gap-2">
                  {[['EMA 20', tech.ema20], ['EMA 50', tech.ema50], ['EMA 200', tech.ema200]].map(([label, val]) => (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-faded">{label}</p>
                      <p className={clsx('text-xs font-mono font-semibold', stock.price > val ? 'text-bull' : 'text-bear')}>
                        {val ? formatINR(val) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trend */}
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <p className="text-xs font-medium text-secondary">Overall Trend</p>
                <span className={clsx('text-xs font-bold capitalize', getTrendColor(tech.trend))}>{tech.trend}</span>
              </div>

              {/* Support/Resistance */}
              <div className="py-2">
                <p className="text-xs font-medium text-secondary mb-2">Support / Resistance</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] text-faded mb-1">Support</p>
                    {(tech.support || []).map(s => <p key={s} className="text-xs font-mono text-bull">{formatINR(s)}</p>)}
                  </div>
                  <div>
                    <p className="text-[10px] text-faded mb-1">Resistance</p>
                    {(tech.resistance || []).map(r => <p key={r} className="text-xs font-mono text-bear">{formatINR(r)}</p>)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-faded text-center py-8">Technical data not available</p>
          )}
        </motion.div>

        {/* Fundamentals */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">Fundamentals</h2>
          {fund ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ['P/E Ratio', fund.pe?.toFixed(1)],
                ['P/B Ratio', fund.pb?.toFixed(1)],
                ['EPS', fund.eps ? `₹${fund.eps?.toFixed(2)}` : null],
                ['ROE', fund.roe ? `${fund.roe?.toFixed(1)}%` : null],
                ['ROCE', fund.roce ? `${fund.roce?.toFixed(1)}%` : null],
                ['Debt/Equity', fund.debtToEquity?.toFixed(2)],
                ['Revenue Growth', formatPercent(fund.revenueGrowthYoY)],
                ['Profit Growth', formatPercent(fund.profitGrowthYoY)],
                ['Div. Yield', fund.dividendYield ? `${fund.dividendYield?.toFixed(1)}%` : null],
                ['Promoter Hold.', fund.promoterHolding ? `${fund.promoterHolding?.toFixed(1)}%` : null],
                ['FII Hold.', fund.fiisHolding ? `${fund.fiisHolding?.toFixed(1)}%` : null],
                ['DII Hold.', fund.diisHolding ? `${fund.diisHolding?.toFixed(1)}%` : null],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-subtle/50">
                  <span className="text-[10px] text-faded">{label}</span>
                  <span className="text-xs font-mono font-semibold text-primary">{val || '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-faded text-center py-8">Fundamental data not available</p>
          )}
        </motion.div>
      </div>

      {/* Quarterly Revenue Chart */}
      {revenueData.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">Quarterly Performance (₹ Cr)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenueData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="q" tick={{ fill: '#5A5A7A', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: '#1A1A26', border: '1px solid #2A2A3E', borderRadius: '8px', fontSize: 12 }}
                formatter={v => [`₹${v.toLocaleString('en-IN')} Cr`]}
              />
              <Bar dataKey="rev" fill="#FF6B35" radius={[3, 3, 0, 0]} name="Revenue" />
              <Bar dataKey="profit" fill="#00C897" radius={[3, 3, 0, 0]} name="Net Profit" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-saffron-500" /><span className="text-[10px] text-secondary">Revenue</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-bull" /><span className="text-[10px] text-secondary">Net Profit</span></div>
          </div>
        </motion.div>
      )}

      {/* Insider Trades */}
      {stock.insiderTrades?.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">Recent Insider Trades</h2>
          <div className="space-y-3">
            {stock.insiderTrades.map((trade, i) => (
              <div key={trade.id || i} className={clsx(
                'flex items-center justify-between p-3 rounded-lg border',
                trade.type === 'BUY' ? 'bg-bull/5 border-bull/20' : 'bg-bear/5 border-bear/20'
              )}>
                <div>
                  <p className="text-xs font-semibold text-primary">{trade.person}</p>
                  <p className="text-[10px] text-faded">{formatDate(trade.date)} · {trade.quantity?.toLocaleString('en-IN')} shares</p>
                </div>
                <div className="text-right">
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', trade.type === 'BUY' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear')}>
                    {trade.type}
                  </span>
                  <p className="text-[10px] text-faded mt-1">₹{trade.totalValueCr} Cr</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Similar stocks */}
      {similarStocks.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-3">Similar Stocks ({stock.sector})</h2>
          <div className="flex gap-2 flex-wrap">
            {similarStocks.map(s => (
              <Link key={s.id} to={`/stock/${s.symbol}`}
                className="flex items-center gap-2 bg-elevated border border-subtle hover:border-muted rounded-lg px-3 py-2 transition-colors"
              >
                <div className="w-6 h-6 rounded text-[9px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: s.color }}>{s.logo}</div>
                <div>
                  <p className="text-xs font-semibold text-primary">{s.symbol}</p>
                  <p className={clsx('text-[10px] font-medium', s.changePercent >= 0 ? 'text-bull' : 'text-bear')}>
                    {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
