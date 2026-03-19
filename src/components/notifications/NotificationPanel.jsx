import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, TrendingUp, TrendingDown, AlertCircle, RefreshCw, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWatchlistStore } from '../../store/index'
import { stocksApi } from '../../api/stocks'
import { formatINR, getChangeColor } from '../../utils/formatters'
import { clsx } from 'clsx'

// Generate human-readable alert from a live quote
function makeAlert(q) {
  const pct = q.changePercent ?? 0
  const abs = Math.abs(pct)
  const dir = pct >= 0 ? 'up' : 'down'

  if (abs >= 3)   return { type: pct >= 0 ? 'bull' : 'bear', msg: `${q.symbol} is ${dir} ${abs.toFixed(2)}% — big move today` }
  if (abs >= 1.5) return { type: pct >= 0 ? 'bull' : 'bear', msg: `${q.symbol} moved ${dir} ${abs.toFixed(2)}% today` }
  if (abs >= 0.5) return { type: 'neutral', msg: `${q.symbol} ${dir} ${abs.toFixed(2)}% — relatively flat` }
  return           { type: 'neutral', msg: `${q.symbol} barely moved today (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` }
}

export const NotificationBell = () => {
  const [open, setOpen] = useState(false)
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState(null)
  const panelRef = useRef(null)

  const { getActiveWatchlist } = useWatchlistStore()
  const watchlist = getActiveWatchlist()
  const symbols = watchlist?.stockIds ?? []

  const unreadCount = quotes.filter(q => Math.abs(q.changePercent ?? 0) >= 1.5).length

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchQuotes = async () => {
    if (!symbols.length) return
    setLoading(true)
    try {
      const data = await stocksApi.getBulkQuotes(symbols)
      if (Array.isArray(data)) setQuotes(data.filter(q => q.price))
    } catch (_) { /* silent */ }
    finally { setLoading(false); setLastFetched(new Date()) }
  }

  // Fetch when panel opens (if stale > 60s or never fetched)
  useEffect(() => {
    if (!open) return
    const stale = !lastFetched || (Date.now() - lastFetched) > 60_000
    if (stale) fetchQuotes()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-8 h-8 flex items-center justify-center rounded-lg transition-colors relative',
          open ? 'bg-saffron-500/15 text-saffron-500' : 'hover:bg-elevated text-secondary hover:text-primary'
        )}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-saffron-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {unreadCount === 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-saffron-500 rounded-full" />
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-elevated border border-muted rounded-xl shadow-card-hover z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-saffron-500" />
                <span className="text-sm font-semibold text-primary">Watchlist Alerts</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-saffron-500/20 text-saffron-500 font-semibold">
                    {unreadCount} active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={fetchQuotes}
                  disabled={loading}
                  className="w-6 h-6 flex items-center justify-center rounded text-faded hover:text-primary transition-colors"
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded text-faded hover:text-primary transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-96 overflow-y-auto">
              {symbols.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={28} className="mx-auto mb-2 text-faded" />
                  <p className="text-sm text-secondary font-medium">No stocks in watchlist</p>
                  <p className="text-xs text-faded mt-1">Add stocks to get alerts here</p>
                  <Link to="/watchlist" onClick={() => setOpen(false)} className="text-xs text-saffron-500 hover:underline mt-2 inline-block">
                    Go to Watchlist →
                  </Link>
                </div>
              ) : loading && quotes.length === 0 ? (
                <div className="py-10 text-center">
                  <RefreshCw size={20} className="mx-auto mb-2 text-faded animate-spin" />
                  <p className="text-xs text-faded">Fetching live prices...</p>
                </div>
              ) : quotes.length === 0 ? (
                <div className="py-8 text-center">
                  <AlertCircle size={24} className="mx-auto mb-2 text-faded" />
                  <p className="text-sm text-secondary">Could not fetch prices</p>
                  <button onClick={fetchQuotes} className="text-xs text-saffron-500 hover:underline mt-1">Retry</button>
                </div>
              ) : (
                <div className="divide-y divide-subtle/60">
                  {quotes.map(q => {
                    const alert = makeAlert(q)
                    const pct = q.changePercent ?? 0
                    const isPos = pct >= 0
                    return (
                      <Link
                        key={q.symbol}
                        to={`/stock/${q.symbol}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-card/40 transition-colors"
                      >
                        {/* Icon */}
                        <div className={clsx(
                          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                          alert.type === 'bull' ? 'bg-bull/15' : alert.type === 'bear' ? 'bg-bear/15' : 'bg-muted'
                        )}>
                          {alert.type === 'bull'
                            ? <TrendingUp size={13} className="text-bull" />
                            : alert.type === 'bear'
                            ? <TrendingDown size={13} className="text-bear" />
                            : <AlertCircle size={13} className="text-faded" />
                          }
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-secondary leading-snug">{alert.msg}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono font-semibold text-primary">{formatINR(q.price)}</span>
                            <span className={clsx('text-[10px] font-semibold', getChangeColor(pct))}>
                              {isPos ? '+' : ''}{pct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {quotes.length > 0 && (
              <div className="px-4 py-2.5 border-t border-subtle flex items-center justify-between">
                <span className="text-[10px] text-faded">
                  {lastFetched ? `Updated ${lastFetched.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
                <Link to="/watchlist" onClick={() => setOpen(false)} className="text-[10px] text-saffron-500 hover:underline font-medium">
                  Manage Watchlist →
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
