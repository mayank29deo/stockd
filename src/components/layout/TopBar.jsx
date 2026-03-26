import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, TrendingUp, Menu, X, Loader2, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { STOCKS, INDICES } from '../../data/mock/stocks'
import { NSE_STOCKS } from '../../data/nseStocks'
import { stocksApi } from '../../api/stocks'
import { formatINR, getChangeColor } from '../../utils/formatters'
import { UserMenu } from '../auth/UserMenu'
import { NotificationBell } from '../notifications/NotificationPanel'
import { useMarketStatus } from '../../hooks/useStocks'
import { clsx } from 'clsx'

const MarketStatus = () => {
  const { data: status } = useMarketStatus()
  const isOpen = status?.isOpen ?? false
  const lastDate = status?.lastSnapshotDate

  // Format date as "Mar 21" for compact display
  const formatDate = (d) => {
    if (!d) return ''
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    } catch { return d }
  }

  if (isOpen) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-bull/20 bg-bull/10 text-bull">
        <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
        NSE Live
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-subtle bg-surface text-secondary">
      <Clock size={11} className="text-faded" />
      <span>Closed</span>
      {lastDate && (
        <span className="text-faded font-normal">· {formatDate(lastDate)}</span>
      )}
    </div>
  )
}

const SearchDropdown = ({ query, onClose }) => {
  const [liveData, setLiveData] = useState({})   // symbol → { price, changePercent }
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  // Filter from 150+ NSE stocks list
  const suggestions = NSE_STOCKS.filter(s =>
    s.symbol.toLowerCase().includes(query.toLowerCase()) ||
    s.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6)

  // Fetch live price for top suggestion after debounce
  useEffect(() => {
    if (!query || suggestions.length === 0) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const top = suggestions[0]
      if (liveData[top.symbol]) return   // already fetched
      setLoading(true)
      try {
        const data = await stocksApi.search(top.symbol)
        if (data?.price) {
          setLiveData(prev => ({ ...prev, [top.symbol]: data }))
        }
      } catch (_) { /* silent */ }
      finally { setLoading(false) }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [query])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!query || suggestions.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="absolute top-full left-0 right-0 mt-2 bg-elevated border border-muted rounded-xl shadow-card-hover z-50 overflow-hidden"
    >
      {suggestions.map(stock => {
        const live = liveData[stock.symbol]
        return (
          <Link
            key={stock.symbol}
            to={`/stock/${stock.symbol}`}
            onClick={onClose}
            className="flex items-center justify-between px-4 py-3 hover:bg-card/50 transition-colors group"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary text-sm">{stock.symbol}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-secondary">NSE</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-faded">{stock.sector}</span>
              </div>
              <p className="text-xs text-secondary truncate">{stock.name}</p>
            </div>
            <div className="text-right">
              {live ? (
                <>
                  <p className="text-sm font-mono font-semibold text-primary">{formatINR(live.price)}</p>
                  <p className={clsx('text-xs font-medium', getChangeColor(live.changePercent))}>
                    {live.changePercent >= 0 ? '+' : ''}{(live.changePercent ?? 0).toFixed(2)}%
                  </p>
                </>
              ) : loading && stock.symbol === suggestions[0]?.symbol ? (
                <Loader2 size={14} className="text-faded animate-spin ml-auto" />
              ) : (
                <span className="text-xs text-faded">NSE</span>
              )}
            </div>
          </Link>
        )
      })}
    </motion.div>
  )
}

export const TopBar = ({ onMenuToggle, mobileMenuOpen }) => {
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const navigate = useNavigate()

  const handleSearchClose = () => { setSearch(''); setSearchFocused(false) }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-base/90 backdrop-blur-md border-b border-subtle">
      {/* Main topbar */}
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-saffron flex items-center justify-center shadow-glow-saffron">
            <TrendingUp size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg text-primary hidden sm:block">
            Stock<span className="text-saffron-500">d</span>
          </span>
        </Link>

        {/* Search */}
        <div className="flex-1 max-w-xl relative">
          <div className={clsx(
            'flex items-center gap-2 bg-elevated border rounded-lg px-3 py-2 transition-colors duration-150',
            searchFocused ? 'border-saffron-500/60' : 'border-subtle'
          )}>
            <Search size={15} className="text-faded flex-shrink-0" />
            <input
              type="text"
              placeholder="Search stocks... (RELIANCE, TCS, Infosys)"
              className="flex-1 bg-transparent text-sm text-primary placeholder:text-faded outline-none min-w-0"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-faded hover:text-secondary">
                <X size={14} />
              </button>
            )}
          </div>
          <AnimatePresence>
            {searchFocused && search && <SearchDropdown query={search} onClose={handleSearchClose} />}
          </AnimatePresence>
        </div>

        {/* Right items */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <MarketStatus />
          <NotificationBell />
          <UserMenu />
          <button
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-elevated text-secondary hover:text-primary transition-colors"
            onClick={onMenuToggle}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Market ticker strip */}
      <MarketTicker />
    </header>
  )
}

const MarketTicker = () => {
  const items = [...INDICES, ...STOCKS.slice(0, 10)]
  const doubled = [...items, ...items]

  return (
    <div className="border-t border-subtle bg-surface/50 overflow-hidden">
      <div className="flex animate-ticker whitespace-nowrap">
        {doubled.map((item, i) => {
          const change = item.changePercent
          const isPos = change >= 0
          return (
            <div key={i} className="flex items-center gap-1.5 px-5 py-1.5 border-r border-subtle/50 flex-shrink-0">
              <span className="text-xs font-semibold text-primary">{item.symbol || item.id}</span>
              <span className="text-xs font-mono text-secondary">{formatINR(item.price || item.value)}</span>
              <span className={clsx('text-[10px] font-semibold', isPos ? 'text-bull' : 'text-bear')}>
                {isPos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
