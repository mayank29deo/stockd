import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { SlidersHorizontal, X, BookmarkPlus } from 'lucide-react'
import { VerdictBadge, ExchangeBadge } from '../components/ui/Badge'
import { formatINR } from '../utils/formatters'
import { useWatchlistStore, useUIStore } from '../store/index'
import { useStocks } from '../hooks/useStocks'
import { clsx } from 'clsx'

const PRESETS = [
  { name: 'Buffett Style', filters: { maxPE: 20, minROE: 15, maxDebt: 0.5, minProfitGrowth: 10, verdict: 'BUY' }, icon: '🏛️' },
  { name: 'Growth Picks', filters: { minProfitGrowth: 25, minRevenueGrowth: 20, verdict: 'BUY' }, icon: '🚀' },
  { name: 'Dividend Heroes', filters: { minDivYield: 2, minROE: 12, maxDebt: 1 }, icon: '💰' },
  { name: 'Momentum Plays', filters: { minChange: 1, verdict: 'BUY' }, icon: '⚡' },
  { name: 'Oversold Gems', filters: { maxRSI: 35, verdict: 'BUY' }, icon: '💎' },
]

export const Screener = () => {
  const [filters, setFilters] = useState({})
  const [activePreset, setActivePreset] = useState(null)
  const { addToWatchlist, activeWatchlistId } = useWatchlistStore()
  const { addToast } = useUIStore()
  const { data: allStocks } = useStocks()

  const applyPreset = (preset) => {
    setFilters(preset.filters)
    setActivePreset(preset.name)
  }

  const results = useMemo(() => {
    return (allStocks || []).filter(s => {
      const f = s.fundamentals
      const t = s.technicals
      if (filters.verdict && s.verdict?.action !== filters.verdict) return false
      if (filters.maxPE && f.pe > filters.maxPE) return false
      if (filters.minROE && f.roe < filters.minROE) return false
      if (filters.maxDebt && f.debtToEquity > filters.maxDebt) return false
      if (filters.minProfitGrowth && f.profitGrowthYoY < filters.minProfitGrowth) return false
      if (filters.minRevenueGrowth && f.revenueGrowthYoY < filters.minRevenueGrowth) return false
      if (filters.minDivYield && f.dividendYield < filters.minDivYield) return false
      if (filters.minChange && s.changePercent < filters.minChange) return false
      if (filters.maxRSI && t.rsi14 > filters.maxRSI) return false
      if (filters.minRSI && t.rsi14 < filters.minRSI) return false
      if (filters.sector && filters.sector !== 'all' && s.sector !== filters.sector) return false
      if (filters.exchange && filters.exchange !== 'all' && s.exchange !== filters.exchange) return false
      return true
    })
  }, [filters, allStocks])

  const handleBulkWatchlist = () => {
    results.filter(s => s.verdict?.action === 'BUY').forEach(s => addToWatchlist(activeWatchlistId, s.id))
    addToast({ type: 'success', title: `Added ${results.filter(s => s.verdict?.action === 'BUY').length} BUYs to Watchlist` })
  }

  const SliderFilter = ({ label, filterKey, min, max, step = 1, prefix = '', suffix = '' }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-secondary">{label}</label>
        <span className="text-xs font-mono text-primary">{prefix}{filters[filterKey] ?? '—'}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step}
        value={filters[filterKey] ?? ''}
        onChange={e => setFilters(f => ({ ...f, [filterKey]: +e.target.value }))}
        className="w-full accent-saffron-500"
      />
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Stock Screener</h1>
        <p className="text-sm text-secondary mt-1">Filter {(allStocks || []).length} stocks by fundamentals, technicals & verdicts</p>
      </div>

      {/* Presets */}
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map(preset => (
          <button key={preset.name} onClick={() => applyPreset(preset)}
            className={clsx('text-sm px-3 py-2 rounded-lg border font-medium transition-colors flex items-center gap-1.5',
              activePreset === preset.name ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:text-primary hover:border-muted'
            )}
          >
            <span>{preset.icon}</span> {preset.name}
          </button>
        ))}
        {Object.keys(filters).length > 0 && (
          <button onClick={() => { setFilters({}); setActivePreset(null) }}
            className="text-sm px-3 py-2 rounded-lg border border-bear/20 text-bear hover:bg-bear/5 flex items-center gap-1.5"
          >
            <X size={12} /> Clear All
          </button>
        )}
      </div>

      {/* Filters + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Filter panel */}
        <div className="bg-card border border-subtle rounded-xl p-4 space-y-4 h-fit lg:sticky lg:top-24">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <SlidersHorizontal size={15} /> Filters
          </div>

          <div>
            <label className="text-xs text-secondary block mb-1.5">Verdict</label>
            <div className="flex gap-1.5 flex-wrap">
              {['All', 'BUY', 'SELL', 'HOLD'].map(v => (
                <button key={v} onClick={() => setFilters(f => ({ ...f, verdict: v === 'All' ? undefined : v }))}
                  className={clsx('text-xs px-2.5 py-1 rounded-md border font-medium',
                    (filters.verdict === v || (v === 'All' && !filters.verdict)) ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:border-muted'
                  )}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-secondary block mb-1.5">Exchange</label>
            <div className="flex gap-1.5">
              {['All', 'NSE', 'BSE'].map(v => (
                <button key={v} onClick={() => setFilters(f => ({ ...f, exchange: v === 'All' ? undefined : v }))}
                  className={clsx('text-xs px-2.5 py-1 rounded-md border font-medium',
                    (filters.exchange === v || (v === 'All' && !filters.exchange)) ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:border-muted'
                  )}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-subtle space-y-4">
            <p className="text-xs font-semibold text-primary">Fundamentals</p>
            <SliderFilter label="Max P/E Ratio" filterKey="maxPE" min={5} max={80} />
            <SliderFilter label="Min ROE %" filterKey="minROE" min={0} max={50} suffix="%" />
            <SliderFilter label="Max Debt/Equity" filterKey="maxDebt" min={0} max={5} step={0.1} />
            <SliderFilter label="Min Profit Growth" filterKey="minProfitGrowth" min={-50} max={100} suffix="%" />
            <SliderFilter label="Min Div. Yield" filterKey="minDivYield" min={0} max={10} step={0.5} suffix="%" />
          </div>

          <div className="pt-2 border-t border-subtle space-y-4">
            <p className="text-xs font-semibold text-primary">Technicals</p>
            <SliderFilter label="Max RSI" filterKey="maxRSI" min={10} max={90} />
            <SliderFilter label="Min RSI" filterKey="minRSI" min={10} max={90} />
            <SliderFilter label="Min Day Change" filterKey="minChange" min={-10} max={10} step={0.5} suffix="%" />
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-secondary">{results.length} stocks match</span>
            <div className="flex gap-2">
              {results.filter(s => s.verdict?.action === 'BUY').length > 0 && (
                <button onClick={handleBulkWatchlist} className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <BookmarkPlus size={13} /> Add BUYs to Watchlist
                </button>
              )}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-16 text-secondary">
              <SlidersHorizontal size={36} className="mx-auto mb-3 text-faded" />
              <p className="font-semibold">No stocks match your filters</p>
              <button onClick={() => { setFilters({}); setActivePreset(null) }} className="mt-2 text-sm text-saffron-500 hover:underline">
                Reset filters
              </button>
            </div>
          ) : (
            <div className="bg-card border border-subtle rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-subtle">
                      {['Stock', 'Exchange', 'Sector', 'Price', 'Change', 'P/E', 'ROE', 'RSI', 'Verdict'].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-semibold text-faded whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((stock, i) => (
                      <motion.tr key={stock.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-subtle/50 hover:bg-elevated/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link to={`/stock/${stock.symbol}`} className="hover:text-saffron-500 transition-colors">
                            <p className="text-xs font-bold text-primary">{stock.symbol}</p>
                            <p className="text-[10px] text-faded truncate max-w-[100px]">{stock.name}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3"><ExchangeBadge exchange={stock.exchange} /></td>
                        <td className="px-4 py-3 text-xs text-secondary whitespace-nowrap">{stock.sector}</td>
                        <td className="px-4 py-3 text-xs font-mono font-semibold text-primary">{formatINR(stock.price)}</td>
                        <td className={clsx('px-4 py-3 text-xs font-mono font-semibold', stock.changePercent >= 0 ? 'text-bull' : 'text-bear')}>
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-secondary">{stock.fundamentals.pe?.toFixed(1)}</td>
                        <td className="px-4 py-3 text-xs font-mono text-secondary">{stock.fundamentals.roe?.toFixed(1)}%</td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-xs font-mono font-semibold', stock.technicals.rsi14 > 70 ? 'text-bear' : stock.technicals.rsi14 < 30 ? 'text-bull' : 'text-secondary')}>
                            {stock.technicals.rsi14}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <VerdictBadge verdict={stock.verdict?.action} size="xs" />
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
