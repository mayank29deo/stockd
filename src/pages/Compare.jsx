import { useState } from 'react'
import { GitCompare, X } from 'lucide-react'
import { STOCKS } from '../data/mock/stocks'
import { NSE_STOCKS } from '../data/nseStocks'
import { VerdictBadge } from '../components/ui/Badge'
import { formatINR, formatPercent, getChangeColor } from '../utils/formatters'
import { clsx } from 'clsx'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'

const FACTOR_LABELS = { momentum: 'Momentum', technical: 'Technical', value: 'Value', quality: 'Quality', growth: 'Growth', risk: 'Risk' }

// Merge mock + NSE for search — all ~200 NSE stocks searchable
const ALL_SEARCHABLE = [
  ...STOCKS,
  ...NSE_STOCKS
    .filter(n => !STOCKS.find(s => s.symbol === n.symbol))
    .map(n => ({ id: n.symbol, symbol: n.symbol, name: n.name, sector: n.sector, color: '#FF6B35', logo: n.symbol.slice(0, 2) }))
]
const CHART_COLORS = ['#FF6B35', '#00C897', '#4E9AF1']

const StockPicker = ({ selected, onSelect, onRemove, index }) => {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  if (selected) {
    return (
      <div className="relative">
        <div className="bg-elevated border-2 rounded-xl p-3 flex items-center gap-2 text-left" style={{ borderColor: CHART_COLORS[index] + '40' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: selected.color }}>
            {selected.logo}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-primary">{selected.symbol}</p>
            <p className="text-[10px] text-faded truncate">{selected.name}</p>
          </div>
          <button onClick={() => onRemove(index)} className="text-faded hover:text-bear"><X size={14} /></button>
        </div>
      </div>
    )
  }

  const results = ALL_SEARCHABLE.filter(s => s.symbol.toLowerCase().includes(query.toLowerCase()) || s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)

  return (
    <div className="relative">
      <div className="bg-elevated border border-dashed border-muted rounded-xl p-3">
        <input
          type="text"
          placeholder="Add stock to compare..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          className="w-full bg-transparent text-sm text-primary placeholder:text-faded outline-none"
        />
      </div>
      {focused && query && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-muted rounded-xl shadow-card-hover z-10">
          {results.map(s => (
            <button key={s.id} onClick={() => { onSelect(s, index); setQuery('') }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card/50 transition-colors text-left">
              <div className="w-6 h-6 rounded text-[9px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: s.color }}>{s.logo}</div>
              <span className="text-xs font-semibold text-primary">{s.symbol}</span>
              <span className="text-[10px] text-faded">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const Compare = () => {
  const [selected, setSelected] = useState([STOCKS[0], STOCKS[3], null])

  const handleSelect = (stock, index) => {
    setSelected(prev => { const n = [...prev]; n[index] = stock; return n })
  }
  const handleRemove = (index) => {
    setSelected(prev => { const n = [...prev]; n[index] = null; return n })
  }

  const activeStocks = selected.filter(Boolean)

  // Normalized price history for overlay chart
  const priceChartData = (() => {
    if (activeStocks.length === 0) return []
    const base = activeStocks[0].priceHistory?.slice(-60) || []
    return base.map((d, i) => {
      const point = { date: d.date.slice(5) }
      activeStocks.forEach((s, _si) => {
        const hist = s.priceHistory?.slice(-60) || []
        const basePrice = hist[0]?.close || 1
        const curPrice = hist[i]?.close || basePrice
        point[s.symbol] = +((curPrice / basePrice - 1) * 100).toFixed(2)
      })
      return point
    })
  })()

  // Radar data
  const radarData = activeStocks[0]?.verdict?.reasoning?.map(r => {
    const point = { factor: FACTOR_LABELS[r.factor] || r.factor }
    activeStocks.forEach(s => {
      const score = s.verdict?.reasoning?.find(rr => rr.factor === r.factor)?.score ?? 0
      point[s.symbol] = Math.max(0, (score + 10) * 5)
    })
    return point
  }) || []

  const metrics = [
    { label: 'Price', fn: s => formatINR(s.price) },
    { label: 'Day Change', fn: s => ({ value: `${(s.changePercent ?? 0) >= 0 ? '+' : ''}${(s.changePercent ?? 0).toFixed(2)}%`, color: getChangeColor(s.changePercent) }) },
    { label: 'Market Cap', fn: s => s.marketCap },
    { label: 'Sector', fn: s => s.sector },
    { label: 'P/E Ratio', fn: s => s.fundamentals?.pe?.toFixed(1) ?? '—' },
    { label: 'ROE', fn: s => s.fundamentals?.roe != null ? `${s.fundamentals.roe.toFixed(1)}%` : '—' },
    { label: 'Debt/Eq.', fn: s => s.fundamentals?.debtToEquity?.toFixed(2) ?? '—' },
    { label: 'Profit Growth', fn: s => formatPercent(s.fundamentals?.profitGrowthYoY) },
    { label: 'RSI (14)', fn: s => s.technicals?.rsi14 ?? '—' },
    { label: 'Trend', fn: s => s.technicals?.trend ?? '—' },
    { label: 'Verdict', fn: s => s.verdict?.action, isVerdict: true },
    { label: 'Confidence', fn: s => `${s.verdict?.confidence}%` },
    { label: 'Target Price', fn: s => formatINR(s.verdict?.targetPrice) },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Compare Stocks</h1>
        <p className="text-sm text-secondary mt-1">Side-by-side analysis of up to 3 stocks</p>
      </div>

      {/* Picker row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="relative">
            <div className="text-xs font-semibold mb-1.5" style={{ color: CHART_COLORS[i] }}>Stock {i + 1}</div>
            <StockPicker selected={selected[i]} onSelect={handleSelect} onRemove={handleRemove} index={i} />
          </div>
        ))}
      </div>

      {activeStocks.length < 2 ? (
        <div className="text-center py-16 text-secondary">
          <GitCompare size={40} className="mx-auto mb-3 text-faded" />
          <p className="font-semibold">Add at least 2 stocks to compare</p>
        </div>
      ) : (
        <>
          {/* Normalized price chart */}
          <div className="bg-card border border-subtle rounded-xl p-5">
            <h2 className="text-sm font-semibold text-primary mb-1">Relative Price Performance (60 Days)</h2>
            <p className="text-xs text-faded mb-4">Normalized % change from start</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={priceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                <YAxis tick={{ fill: '#5A5A7A', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: '#1A1A26', border: '1px solid #2A2A3E', borderRadius: '8px', fontSize: 11 }} formatter={v => [`${v}%`]} />
                <Legend />
                {activeStocks.map((s, i) => (
                  <Line key={s.symbol} type="monotone" dataKey={s.symbol} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison table */}
          <div className="bg-card border border-subtle rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-subtle">
                    <th className="px-4 py-3 text-xs text-faded font-semibold text-left w-28">Metric</th>
                    {activeStocks.map((s, i) => (
                      <th key={s.symbol} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                          <span className="text-sm font-bold text-primary">{s.symbol}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(metric => (
                    <tr key={metric.label} className="border-b border-subtle/50 hover:bg-elevated/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-faded font-medium">{metric.label}</td>
                      {activeStocks.map(s => {
                        const result = metric.fn(s)
                        const val = typeof result === 'object' ? result.value : result
                        const color = typeof result === 'object' ? result.color : ''
                        return (
                          <td key={s.symbol} className="px-4 py-2.5 text-center">
                            {metric.isVerdict
                              ? <VerdictBadge verdict={val} size="xs" />
                              : <span className={clsx('text-xs font-mono font-semibold', color || 'text-primary')}>{val}</span>
                            }
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Radar overlay */}
          {radarData.length > 0 && (
            <div className="bg-card border border-subtle rounded-xl p-5">
              <h2 className="text-sm font-semibold text-primary mb-4">Factor Radar Comparison</h2>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1E1E2E" />
                  <PolarAngleAxis dataKey="factor" tick={{ fill: '#9999B3', fontSize: 11 }} />
                  {activeStocks.map((s, i) => (
                    <Radar key={s.symbol} dataKey={s.symbol} stroke={CHART_COLORS[i]} fill={CHART_COLORS[i]} fillOpacity={0.1} strokeWidth={2} name={s.symbol} />
                  ))}
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
