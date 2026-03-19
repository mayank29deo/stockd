import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Star, X, RefreshCw } from 'lucide-react'
import { useWatchlistStore, useUIStore } from '../store/index'
import { stocksApi } from '../api/stocks'
import { VerdictBadge } from '../components/ui/Badge'
import { MiniSparkline } from '../components/charts/MiniSparkline'
import { formatINR, getChangeColor } from '../utils/formatters'
import { clsx } from 'clsx'

export const Watchlist = () => {
  const { watchlists, activeWatchlistId, setActiveWatchlist, createWatchlist, removeFromWatchlist, getActiveWatchlist } = useWatchlistStore()
  const { addToast } = useUIStore()
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)
  const [liveStocks, setLiveStocks] = useState([])
  const [loadingLive, setLoadingLive] = useState(false)

  const active = getActiveWatchlist()
  const symbols = active?.stockIds ?? []

  // Fetch live quotes for ALL watchlisted symbols (not limited to mock data)
  useEffect(() => {
    if (!symbols.length) { setLiveStocks([]); return }
    setLoadingLive(true)
    stocksApi.getBulkQuotes(symbols)
      .then(data => { if (Array.isArray(data)) setLiveStocks(data.filter(q => q.price)) })
      .catch(() => {})
      .finally(() => setLoadingLive(false))
  }, [symbols.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merge live data with symbol list so all symbols appear even if API partial
  const watchedStocks = symbols.map(sym => {
    const live = liveStocks.find(q => q.symbol === sym)
    return live ? { ...live, id: sym } : { id: sym, symbol: sym, price: null, changePercent: null }
  })

  const handleCreate = () => {
    if (!newListName.trim()) return
    createWatchlist(newListName.trim())
    setNewListName('')
    setCreating(false)
  }

  const handleRemove = (stockId) => {
    removeFromWatchlist(activeWatchlistId, stockId)
    addToast({ type: 'info', title: 'Removed from Watchlist' })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Watchlist</h1>
        <button onClick={() => setCreating(true)} className="btn-ghost text-sm flex items-center gap-1.5">
          <Plus size={14} /> New List
        </button>
      </div>

      {/* List tabs */}
      <div className="flex gap-2 flex-wrap">
        {watchlists.map(list => (
          <div key={list.id} className="flex items-center">
            <button
              onClick={() => setActiveWatchlist(list.id)}
              className={clsx('text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors',
                list.id === activeWatchlistId ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:text-primary'
              )}
            >
              {list.name} <span className="text-[10px] ml-1 opacity-60">{list.stockIds.length}</span>
            </button>
          </div>
        ))}
      </div>

      {/* New list input */}
      {creating && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
          <input
            autoFocus
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
            placeholder="Watchlist name..."
            className="input-base text-sm"
          />
          <button onClick={handleCreate} className="btn-primary text-sm px-4">Create</button>
          <button onClick={() => setCreating(false)} className="btn-ghost text-sm px-3"><X size={14} /></button>
        </motion.div>
      )}

      {/* Stocks list */}
      {watchedStocks.length === 0 ? (
        <div className="text-center py-16">
          <Star size={36} className="mx-auto mb-3 text-faded" />
          <p className="text-secondary font-semibold">No stocks in this watchlist</p>
          <p className="text-sm text-faded mt-1">Add stocks from the Discover page or Stock Detail view</p>
          <Link to="/discover" className="btn-primary mt-4 inline-flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Discover Stocks
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-subtle rounded-xl overflow-hidden">
          <div className="p-4 border-b border-subtle flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">{active?.name}</h2>
            <div className="flex items-center gap-2">
              {loadingLive && <RefreshCw size={11} className="text-faded animate-spin" />}
              <span className="text-xs text-faded">{symbols.length} stocks</span>
            </div>
          </div>
          <div className="divide-y divide-subtle">
            {watchedStocks.map((stock, i) => {
              const isPos = (stock.changePercent ?? 0) >= 0
              const hasPrice = stock.price != null
              return (
                <motion.div
                  key={stock.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50 transition-colors group"
                >
                  {/* Logo */}
                  <Link to={`/stock/${stock.symbol}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: stock.color || '#FF6B35' }}>
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-primary">{stock.symbol}</span>
                        {stock.verdict?.action && <VerdictBadge verdict={stock.verdict.action} size="xs" />}
                      </div>
                      <p className="text-xs text-faded truncate">{stock.name || stock.symbol}</p>
                    </div>
                  </Link>

                  {/* Sparkline */}
                  <div className="w-20 hidden sm:block flex-shrink-0">
                    <MiniSparkline data={stock.priceHistory || []} positive={isPos} height={32} />
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    {hasPrice ? (
                      <>
                        <p className="text-sm font-mono font-semibold text-primary">{formatINR(stock.price)}</p>
                        <p className={clsx('text-xs font-semibold', getChangeColor(stock.changePercent))}>
                          {isPos ? '+' : ''}{(stock.changePercent ?? 0).toFixed(2)}%
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-faded">{loadingLive ? 'Loading...' : 'N/A'}</p>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => handleRemove(stock.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-faded hover:text-bear hover:bg-bear/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
