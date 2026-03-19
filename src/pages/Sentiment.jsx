import { motion } from 'framer-motion'
import { MARKET_MOOD, GEOPOLITICAL_NEWS, SECTOR_DATA } from '../data/mock/stocks'
import { formatDate, getFearGreedLabel } from '../utils/formatters'
import { useMarketSentiment } from '../hooks/useStocks'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts'

const VIX_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  vix: 12 + Math.sin(i * 0.4) * 3 + (Math.abs(Math.sin(i * 1.3)) * 2),
}))

export const Sentiment = () => {
  const { data: sentimentData, isLive } = useMarketSentiment()

  const mood = sentimentData || MARKET_MOOD
  const geoNews = sentimentData?.geopoliticalNews || GEOPOLITICAL_NEWS

  const { fearGreedIndex, fiiNetFlowCr, diiNetFlowCr, inrUsd, crudePriceUsd, goldPriceInr, indiaVix, repoRate, nextRbiDate } = mood
  const { label: moodLabel, color: moodColor } = getFearGreedLabel(fearGreedIndex)

  // Build FII/DII chart data from live fiiHistory if available, else static
  const FII_DII_DATA = mood.fiiHistory || [
    { date: '04 Mar', fii: 2400, dii: -1200 },
    { date: '05 Mar', fii: -800, dii: 2100 },
    { date: '06 Mar', fii: 3200, dii: -900 },
    { date: '07 Mar', fii: 1800, dii: -1400 },
    { date: '10 Mar', fii: -1200, dii: 3400 },
    { date: '11 Mar', fii: 4800, dii: -2000 },
    { date: '12 Mar', fii: 2100, dii: -800 },
    { date: '13 Mar', fii: -600, dii: 1800 },
    { date: '14 Mar', fii: 5200, dii: -2400 },
    { date: '17 Mar', fii: 3800, dii: -1600 },
    { date: '18 Mar', fii: 1200, dii: 2800 },
    { date: '19 Mar', fii: fiiNetFlowCr || 8420, dii: diiNetFlowCr || -3240 },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Market Sentiment</h1>
          <p className="text-sm text-secondary mt-1">Geopolitical intelligence & macro analysis for Indian markets</p>
        </div>
        {!isLive && <span className="text-[10px] text-faded bg-elevated px-2 py-1 rounded-full border border-subtle">Demo data</span>}
      </div>

      {/* Fear Greed + Macro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Large gauge */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-subtle rounded-xl p-6 flex flex-col items-center justify-center"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">India Fear & Greed Index</h2>
          {/* Gauge */}
          <div className="relative w-56 h-32 mb-4">
            <svg viewBox="0 0 200 110" className="w-full h-full">
              <path d="M 15 95 A 85 85 0 0 1 185 95" fill="none" stroke="#1E1E2E" strokeWidth="14" strokeLinecap="round" />
              <path d="M 15 95 A 85 85 0 0 1 55 30" fill="none" stroke="#00C897" strokeWidth="14" strokeLinecap="round" opacity="0.6" />
              <path d="M 55 30 A 85 85 0 0 1 88 15" fill="none" stroke="#4E9AF1" strokeWidth="14" opacity="0.6" />
              <path d="M 88 15 A 85 85 0 0 1 122 18" fill="none" stroke="#9999B3" strokeWidth="14" opacity="0.6" />
              <path d="M 122 18 A 85 85 0 0 1 155 35" fill="none" stroke="#FFB020" strokeWidth="14" opacity="0.6" />
              <path d="M 155 35 A 85 85 0 0 1 185 95" fill="none" stroke="#FF4757" strokeWidth="14" strokeLinecap="round" opacity="0.6" />
              {/* Needle */}
              <g transform={`rotate(${(fearGreedIndex / 100) * 180 - 90}, 100, 95)`}>
                <line x1="100" y1="95" x2="100" y2="28" stroke={moodColor} strokeWidth="3" strokeLinecap="round" />
                <circle cx="100" cy="95" r="6" fill={moodColor} />
              </g>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold font-mono" style={{ color: moodColor }}>{fearGreedIndex}</p>
            <p className="text-lg font-semibold mt-1" style={{ color: moodColor }}>{moodLabel}</p>
            <p className="text-xs text-faded mt-2 leading-relaxed max-w-xs">{mood.description}</p>
          </div>
          <div className="grid grid-cols-5 gap-1 mt-4 w-full text-center">
            {[['Extreme\nFear', '#00C897'], ['Fear', '#4E9AF1'], ['Neutral', '#9999B3'], ['Greed', '#FFB020'], ['Extreme\nGreed', '#FF4757']].map(([label, color]) => (
              <div key={label} className="text-[9px] leading-tight whitespace-pre-line" style={{ color }}>
                {label}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Macro indicators */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-4">Macro Indicators</h2>
          <div className="space-y-3">
            {[
              { label: '₹ / USD', value: inrUsd ? `₹${inrUsd}` : '—', sub: 'Indian Rupee', trend: 'neutral' },
              { label: 'Crude Oil', value: crudePriceUsd ? `$${crudePriceUsd}/bbl` : '—', sub: 'Brent Crude', trend: 'positive' },
              { label: 'Gold (MCX)', value: goldPriceInr ? `₹${goldPriceInr?.toLocaleString('en-IN')}/10g` : '—', sub: 'Multi Commodity Exchange', trend: 'positive' },
              { label: 'India VIX', value: indiaVix || '—', sub: 'Volatility Index', trend: indiaVix < 15 ? 'positive' : 'negative' },
              { label: 'Repo Rate', value: repoRate ? `${repoRate}%` : '—', sub: 'RBI Policy Rate', trend: 'neutral' },
              { label: 'Next RBI Date', value: nextRbiDate ? formatDate(nextRbiDate) : '—', sub: 'MPC Meeting', trend: 'neutral' },
              { label: 'FII Net Flow', value: fiiNetFlowCr != null ? `₹${fiiNetFlowCr} Cr` : '—', sub: "Today's inflow", trend: fiiNetFlowCr > 0 ? 'positive' : 'negative' },
              { label: 'DII Net Flow', value: diiNetFlowCr != null ? `₹${diiNetFlowCr} Cr` : '—', sub: "Today's flow", trend: diiNetFlowCr > 0 ? 'positive' : 'negative' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-subtle/50 last:border-0">
                <div>
                  <p className="text-xs font-medium text-secondary">{item.label}</p>
                  <p className="text-[10px] text-faded">{item.sub}</p>
                </div>
                <p className={clsx('text-sm font-mono font-bold',
                  item.trend === 'positive' ? 'text-bull' : item.trend === 'negative' ? 'text-bear' : 'text-primary'
                )}>{item.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* India VIX chart */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="bg-card border border-subtle rounded-xl p-5"
        >
          <h2 className="text-sm font-semibold text-primary mb-1">India VIX (30 Days)</h2>
          <p className="text-xs text-faded mb-4">Volatility expectation — lower = calmer markets</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={VIX_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[8, 22]} tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1A1A26', border: '1px solid #2A2A3E', borderRadius: '8px', fontSize: 11 }} />
              <Line type="monotone" dataKey="vix" stroke="#FFB020" strokeWidth={2} dot={false} name="VIX" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-subtle">
            <div><p className="text-[10px] text-faded">Current</p><p className="text-sm font-mono font-bold text-caution">{indiaVix || '—'}</p></div>
            <div className="text-right"><p className="text-[10px] text-faded">Signal</p><p className={clsx('text-xs font-semibold', indiaVix < 15 ? 'text-bull' : 'text-caution')}>{indiaVix < 15 ? 'Low Volatility' : 'Elevated'}</p></div>
          </div>
        </motion.div>
      </div>

      {/* FII/DII Flow Chart */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="bg-card border border-subtle rounded-xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-primary">FII / DII Activity</h2>
            <p className="text-xs text-faded">Net buy/sell in ₹ Crores (last 12 sessions)</p>
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-saffron-500" /><span className="text-secondary">FII</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-chart3" /><span className="text-secondary">DII</span></div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={FII_DII_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 100).toFixed(0)}Cr`} />
            <Tooltip
              contentStyle={{ background: '#1A1A26', border: '1px solid #2A2A3E', borderRadius: '8px', fontSize: 11 }}
              formatter={v => [`₹${v.toLocaleString('en-IN')} Cr`]}
            />
            <Bar dataKey="fii" fill="#FF6B35" radius={[2, 2, 0, 0]} name="FII" />
            <Bar dataKey="dii" fill="#4E9AF1" radius={[2, 2, 0, 0]} name="DII" />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Full geopolitical feed */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-primary">Geopolitical & Policy Feed</h2>
          <span className="text-xs text-faded">India-focused</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {geoNews.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-subtle rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <div className={clsx('w-1 rounded-full flex-shrink-0 mt-1 self-stretch', item.impact === 'positive' ? 'bg-bull' : item.impact === 'negative' ? 'bg-bear' : 'bg-caution')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-primary leading-snug">{item.title}</p>
                  <p className="text-[10px] text-secondary mt-1.5 leading-relaxed">{item.summary}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-faded">{formatDate(item.date, true)}</span>
                    <span className="text-[9px] text-faded">·</span>
                    <span className="text-[9px] text-faded">{item.source}</span>
                    <div className="ml-auto flex gap-1">
                      {(item.sectors || []).map(s => (
                        <span key={s} className="text-[9px] px-1.5 py-0.5 bg-elevated rounded text-secondary">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Sector sentiment */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="bg-card border border-subtle rounded-xl p-5"
      >
        <h2 className="text-sm font-semibold text-primary mb-3">Sector Sentiment Today</h2>
        <div className="space-y-2">
          {SECTOR_DATA.map(sector => {
            const isPos = sector.change >= 0
            const barWidth = Math.min(100, Math.abs(sector.change) * 20)
            return (
              <div key={sector.name} className="flex items-center gap-3">
                <span className="text-xs text-secondary w-16 flex-shrink-0">{sector.name}</span>
                <div className="flex-1 h-5 bg-elevated rounded overflow-hidden relative">
                  <div
                    className={clsx('h-full rounded', isPos ? 'bg-bull/30' : 'bg-bear/30')}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className={clsx('text-xs font-mono font-semibold w-14 text-right', isPos ? 'text-bull' : 'text-bear')}>
                  {isPos ? '+' : ''}{sector.change.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
