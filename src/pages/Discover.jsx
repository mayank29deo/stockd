import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Filter, X, RefreshCw } from 'lucide-react'
import { StockCard } from '../components/stocks/StockCard'
import { StockCardSkeleton } from '../components/ui/Skeleton'
import { useStocks } from '../hooks/useStocks'
import { clsx } from 'clsx'

const SECTORS = ['All', 'IT', 'Banking', 'Energy', 'Pharma', 'Auto', 'FMCG', 'Metals', 'NBFC']
const VERDICTS = ['All', 'BUY', 'SELL', 'HOLD']
const CAPS = ['All', 'large', 'mid', 'small']
const SORTS = [
  { value: 'confidence', label: 'Confidence' },
  { value: 'change', label: 'Day Change' },
  { value: 'price', label: 'Price' },
  { value: 'volume', label: 'Volume' },
]

const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={clsx(
      'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors duration-150 border whitespace-nowrap',
      active
        ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30'
        : 'bg-elevated border-subtle text-secondary hover:text-primary hover:border-muted'
    )}
  >
    {children}
  </button>
)

export const Discover = () => {
  const [verdict, setVerdict] = useState('All')
  const [sector, setSector] = useState('All')
  const [cap, setCap] = useState('All')
  const [sort, setSort] = useState('confidence')
  const [search, setSearch] = useState('')

  const { data: allStocks, loading, isLive, refetch } = useStocks()

  const filtered = useMemo(() => {
    let arr = [...(allStocks || [])]
    if (verdict !== 'All') arr = arr.filter(s => s.verdict?.action === verdict)
    if (sector !== 'All') arr = arr.filter(s => s.sector === sector)
    if (cap !== 'All') arr = arr.filter(s => s.marketCap === cap)
    if (search) arr = arr.filter(s =>
      s.symbol.toLowerCase().includes(search.toLowerCase()) ||
      (s.name || '').toLowerCase().includes(search.toLowerCase())
    )
    arr.sort((a, b) => {
      if (sort === 'confidence') return (b.verdict?.confidence || 0) - (a.verdict?.confidence || 0)
      if (sort === 'change') return Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0)
      if (sort === 'price') return (b.price || 0) - (a.price || 0)
      if (sort === 'volume') return (b.volume || 0) - (a.volume || 0)
      return 0
    })
    return arr
  }, [allStocks, verdict, sector, cap, sort, search])

  const counts = {
    BUY:  (allStocks || []).filter(s => s.verdict?.action === 'BUY').length,
    SELL: (allStocks || []).filter(s => s.verdict?.action === 'SELL').length,
    HOLD: (allStocks || []).filter(s => s.verdict?.action === 'HOLD').length,
  }

  const hasFilters = verdict !== 'All' || sector !== 'All' || cap !== 'All' || search
  const clearFilters = () => { setVerdict('All'); setSector('All'); setCap('All'); setSearch('') }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Discover Stocks</h1>
        <p className="text-sm text-secondary mt-1">AI-powered verdicts across {(allStocks || []).length} Indian stocks</p>
      </div>

      {/* Verdict summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'BUY', count: counts.BUY, color: 'border-bull/20 bg-bull/5', textColor: 'text-bull' },
          { label: 'SELL', count: counts.SELL, color: 'border-bear/20 bg-bear/5', textColor: 'text-bear' },
          { label: 'HOLD', count: counts.HOLD, color: 'border-caution/20 bg-caution/5', textColor: 'text-caution' },
        ].map(item => (
          <button
            key={item.label}
            onClick={() => setVerdict(verdict === item.label ? 'All' : item.label)}
            className={clsx('rounded-xl border p-3 text-center transition-all hover:opacity-90', item.color, verdict === item.label && 'ring-1 ring-offset-1 ring-offset-base')}
          >
            <p className={clsx('text-2xl font-bold font-mono', item.textColor)}>{item.count}</p>
            <p className={clsx('text-xs font-bold mt-0.5', item.textColor)}>{item.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-subtle rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-secondary font-medium mr-1">
            <Filter size={13} /> Verdict:
          </div>
          {VERDICTS.map(v => <Chip key={v} active={verdict === v} onClick={() => setVerdict(v)}>{v}</Chip>)}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-secondary font-medium mr-1 w-14">Sector:</span>
          <div className="flex gap-1.5 flex-wrap">
            {SECTORS.map(s => <Chip key={s} active={sector === s} onClick={() => setSector(s)}>{s}</Chip>)}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-secondary font-medium mr-1 w-14">Sort:</span>
          <div className="flex gap-1.5 flex-wrap">
            {SORTS.map(s => <Chip key={s.value} active={sort === s.value} onClick={() => setSort(s.value)}>{s.label}</Chip>)}
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-xs text-bear hover:text-bear/80">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-secondary">{filtered.length} stocks</span>
        <span className="text-xs text-faded">Sorted by {SORTS.find(s => s.value === sort)?.label}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-secondary text-lg">No stocks match your filters</p>
          <button onClick={clearFilters} className="mt-3 text-sm text-saffron-500 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((stock, i) => <StockCard key={stock.id} stock={stock} index={i} />)}
        </div>
      )}
    </div>
  )
}
