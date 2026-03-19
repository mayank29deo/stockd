import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Zap, BarChart2, Globe, Shield, ArrowRight, Activity, Wifi, WifiOff } from 'lucide-react'
import { IndexCard } from '../components/market/IndexCard'
import { SectorHeatmap } from '../components/market/SectorHeatmap'
import { GeopoliticalFeed } from '../components/market/GeopoliticalFeed'
import { StockCard } from '../components/stocks/StockCard'
import { IndexCardSkeleton, StockCardSkeleton } from '../components/ui/Skeleton'
import { formatINR, formatPercent, getFearGreedLabel } from '../utils/formatters'
import { useStocks, useIndices, useMarketSentiment } from '../hooks/useStocks'
import { MARKET_MOOD } from '../data/mock/stocks'
import { clsx } from 'clsx'

const LiveBadge = ({ isLive }) => (
  <div className={clsx('flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
    isLive ? 'bg-bull/10 text-bull' : 'bg-faded/10 text-faded')}>
    {isLive ? <Wifi size={9} /> : <WifiOff size={9} />}
    {isLive ? 'Live' : 'Demo'}
  </div>
)

const MarketMoodGauge = ({ mood }) => {
  const { fearGreedIndex, description, inrUsd, crudePriceUsd, goldPriceInr, indiaVix, fiiNetFlowCr } = mood || MARKET_MOOD
  const { label: moodLabel, color: moodColor } = getFearGreedLabel(fearGreedIndex)
  const angle = (fearGreedIndex / 100) * 180 - 90

  return (
    <div className="bg-card border border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-primary">India Market Mood</h3>
        <span className="text-[10px] text-faded">Fear & Greed Index</span>
      </div>

      {/* Gauge visual */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative w-36 h-20">
          <svg viewBox="0 0 120 70" className="w-full h-full">
            {/* Track */}
            <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1E1E2E" strokeWidth="8" strokeLinecap="round" />
            {/* Extreme fear */}
            <path d="M 10 60 A 50 50 0 0 1 35 22" fill="none" stroke="#00C897" strokeWidth="8" strokeLinecap="round" opacity="0.5" />
            {/* Fear */}
            <path d="M 35 22 A 50 50 0 0 1 55 13" fill="none" stroke="#4E9AF1" strokeWidth="8" opacity="0.5" />
            {/* Neutral */}
            <path d="M 55 13 A 50 50 0 0 1 75 16" fill="none" stroke="#9999B3" strokeWidth="8" opacity="0.5" />
            {/* Greed */}
            <path d="M 75 16 A 50 50 0 0 1 95 28" fill="none" stroke="#FFB020" strokeWidth="8" opacity="0.5" />
            {/* Extreme greed */}
            <path d="M 95 28 A 50 50 0 0 1 110 60" fill="none" stroke="#FF4757" strokeWidth="8" strokeLinecap="round" opacity="0.5" />
            {/* Needle */}
            <g transform={`rotate(${angle}, 60, 60)`}>
              <line x1="60" y1="60" x2="60" y2="20" stroke={moodColor} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="60" cy="60" r="4" fill={moodColor} />
            </g>
          </svg>
        </div>
      </div>

      <div className="text-center mb-4">
        <p className="text-2xl font-bold font-mono" style={{ color: moodColor }}>{fearGreedIndex}</p>
        <p className="text-sm font-semibold" style={{ color: moodColor }}>{moodLabel}</p>
        <p className="text-xs text-faded mt-1 leading-snug">{description.slice(0, 80)}...</p>
      </div>

      {/* Macro indicators */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-subtle">
        {[
          { label: '₹/USD', value: `₹${inrUsd}` },
          { label: 'Crude', value: `$${crudePriceUsd}` },
          { label: 'Gold', value: formatINR(goldPriceInr, true) },
          { label: 'India VIX', value: indiaVix, color: indiaVix > 20 ? 'text-bear' : 'text-bull' },
          { label: 'FII Flow', value: `₹${(fiiNetFlowCr / 100).toFixed(0)}Cr`, color: fiiNetFlowCr > 0 ? 'text-bull' : 'text-bear' },
          { label: 'Repo Rate', value: `${MARKET_MOOD.repoRate}%` },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[10px] text-faded">{item.label}</span>
            <span className={clsx('text-[10px] font-mono font-semibold', item.color || 'text-secondary')}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const TopPicksBanner = ({ stocks, type }) => {
  const filtered = stocks.filter(s => s.verdict?.action === type).slice(0, 3)
  const isBuy = type === 'BUY'
  return (
    <div className={clsx(
      'rounded-xl border p-3',
      isBuy ? 'bg-bull/5 border-bull/20' : 'bg-bear/5 border-bear/20'
    )}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center', isBuy ? 'bg-bull/15' : 'bg-bear/15')}>
          {isBuy ? <TrendingUp size={13} className="text-bull" /> : <TrendingDown size={13} className="text-bear" />}
        </div>
        <span className={clsx('text-xs font-bold', isBuy ? 'text-bull' : 'text-bear')}>
          Today's Top {type === 'BUY' ? 'Picks' : 'Alerts'}
        </span>
      </div>
      <div className="space-y-2">
        {filtered.map(stock => (
          <Link key={stock.id} to={`/stock/${stock.symbol}`} className="flex items-center justify-between hover:bg-card/30 rounded-lg px-1.5 py-1 transition-colors">
            <div>
              <span className="text-xs font-semibold text-primary">{stock.symbol}</span>
              <span className="text-[10px] text-faded ml-1.5">{stock.verdict.confidence}% conf.</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-primary">{formatINR(stock.price)}</p>
              <p className={clsx('text-[10px] font-semibold', stock.changePercent >= 0 ? 'text-bull' : 'text-bear')}>
                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export const Dashboard = () => {
  const { data: stocks, loading: stocksLoading, isLive: stocksLive }     = useStocks()
  const { data: indices, loading: indicesLoading, isLive: indicesLive }  = useIndices()
  const { data: mood, isLive: moodLive }                                  = useMarketSentiment()

  const topBuys = (stocks || [])
    .filter(s => s.verdict?.action === 'BUY')
    .sort((a, b) => (b.verdict?.confidence || 0) - (a.verdict?.confidence || 0))
    .slice(0, 3)

  const isLive = stocksLive || indicesLive

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8 space-y-6">
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">
              Market Overview <span className="text-saffron-500">🇮🇳</span>
            </h1>
            <LiveBadge isLive={isLive} />
          </div>
          <p className="text-sm text-secondary mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} · IST
          </p>
        </div>
        <Link to="/discover" className="btn-primary flex items-center gap-1.5 text-sm">
          <Zap size={15} />
          Today's Picks
        </Link>
      </motion.div>

      {/* Indices */}
      <div>
        <h2 className="text-xs text-secondary uppercase tracking-wider font-medium mb-3">Major Indices</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {indicesLoading
            ? Array(4).fill(0).map((_, i) => <IndexCardSkeleton key={i} />)
            : (indices || []).map((idx, i) => <IndexCard key={idx.id} index={idx} delay={i * 0.08} />)
          }
        </div>
      </div>

      {/* Quick picks strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TopPicksBanner stocks={stocks || []} type="BUY" />
        <TopPicksBanner stocks={stocks || []} type="SELL" />
      </div>

      {/* Main 3-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Top stock cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">Top BUY Opportunities</h2>
            <Link to="/discover" className="text-xs text-saffron-500 hover:text-saffron-400 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stocksLoading
              ? Array(3).fill(0).map((_, i) => <StockCardSkeleton key={i} />)
              : topBuys.map((stock, i) => <StockCard key={stock.id || stock.symbol} stock={stock} index={i} />)
            }
          </div>

          {/* Most Active */}
          <div className="bg-card border border-subtle rounded-xl p-4">
            <h3 className="text-sm font-semibold text-primary mb-3">Most Active</h3>
            <div className="space-y-2">
              {(stocks || []).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5).map((stock, i) => (
                <Link key={stock.id} to={`/stock/${stock.symbol}`}
                  className="flex items-center gap-3 hover:bg-elevated rounded-lg px-2 py-2 transition-colors group"
                >
                  <span className="text-xs text-faded w-4 text-center">{i + 1}</span>
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: stock.color }}>
                    {stock.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-primary">{stock.symbol}</span>
                    <span className="text-[10px] text-faded ml-1.5">{(stock.volume / 100000).toFixed(1)}L shares</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-primary">{formatINR(stock.price)}</p>
                    <p className={clsx('text-[10px] font-semibold', stock.changePercent >= 0 ? 'text-bull' : 'text-bear')}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right: sidebar widgets */}
        <div className="space-y-4">
          <MarketMoodGauge mood={mood} />
          <SectorHeatmap />
          <GeopoliticalFeed limit={3} news={mood?.geopoliticalNews} />
        </div>
      </div>

      {/* Features strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
        {[
          { icon: Zap, label: 'AI Verdicts', desc: 'Buy/Sell/Hold powered by 5 factors', color: 'text-saffron-500', bg: 'bg-saffron-500/10' },
          { icon: Globe, label: 'Geopolitical', desc: 'India-specific macro & news impact', color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { icon: Shield, label: 'Insider Data', desc: 'Promoter & institutional trades', color: 'text-bull', bg: 'bg-bull/10' },
          { icon: BarChart2, label: 'Portfolio AI', desc: 'Groww, Zerodha CSV analysis', color: 'text-purple-400', bg: 'bg-purple-400/10' },
        ].map(({ icon: Icon, label, desc, color, bg }) => (
          <div key={label} className="bg-card border border-subtle rounded-xl p-3">
            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center mb-2', bg)}>
              <Icon size={16} className={color} />
            </div>
            <p className="text-xs font-semibold text-primary">{label}</p>
            <p className="text-[10px] text-faded mt-0.5 leading-snug">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
