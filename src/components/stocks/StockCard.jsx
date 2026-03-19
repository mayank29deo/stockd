import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Star, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import { VerdictBadge, ExchangeBadge, ConfidenceBadge } from '../ui/Badge'
import { MiniSparkline } from '../charts/MiniSparkline'
import { formatINR, formatChange, getChangeColor } from '../../utils/formatters'
import { useWatchlistStore, useUIStore } from '../../store/index'
import { clsx } from 'clsx'

export const StockCard = ({ stock, index = 0 }) => {
  const { addToWatchlist, removeFromWatchlist, isInWatchlist, activeWatchlistId } = useWatchlistStore()
  const { addToast } = useUIStore()
  const inWatchlist = isInWatchlist(stock.id)

  const handleWatchlist = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (inWatchlist) {
      removeFromWatchlist(activeWatchlistId, stock.id)
      addToast({ type: 'info', title: 'Removed from Watchlist', message: stock.symbol })
    } else {
      addToWatchlist(activeWatchlistId, stock.id)
      addToast({ type: 'success', title: 'Added to Watchlist', message: stock.symbol })
    }
  }

  const verdict = stock.verdict
  const isPos = stock.changePercent >= 0
  const factors = verdict?.reasoning || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="h-full"
    >
      <Link to={`/stock/${stock.symbol}`} className="block h-full">
        <div className="bg-card border border-subtle rounded-xl p-4 hover:border-muted hover:shadow-card-hover transition-all duration-300 h-full flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start gap-2.5">
            {/* Logo avatar */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
              style={{ backgroundColor: stock.color || '#FF6B35' }}
            >
              {stock.logo}
            </div>

            {/* Name block — takes all remaining space */}
            <div className="flex-1 min-w-0">
              {/* Row 1: symbol + watchlist star */}
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-sm text-primary leading-tight">{stock.symbol}</span>
                <button
                  onClick={handleWatchlist}
                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-elevated transition-colors flex-shrink-0"
                >
                  <Star
                    size={13}
                    className={clsx(inWatchlist ? 'text-saffron-500 fill-saffron-500' : 'text-faded')}
                  />
                </button>
              </div>
              {/* Row 2: exchange + verdict badge */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <ExchangeBadge exchange={stock.exchange} />
                <VerdictBadge verdict={verdict?.action} size="xs" />
              </div>
              {/* Row 3: full company name */}
              <p className="text-xs text-secondary mt-1 leading-snug line-clamp-1">{stock.name}</p>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xl font-bold font-mono text-primary">{formatINR(stock.price)}</p>
              <p className={clsx('text-xs font-medium mt-0.5', getChangeColor(stock.changePercent))}>
                {isPos ? <TrendingUp size={10} className="inline mr-0.5" /> : <TrendingDown size={10} className="inline mr-0.5" />}
                {isPos ? '+' : ''}{stock.change.toFixed(2)} ({isPos ? '+' : ''}{stock.changePercent.toFixed(2)}%)
              </p>
            </div>
            <div className="w-24 h-12">
              <MiniSparkline data={stock.priceHistory} positive={isPos} height={48} />
            </div>
          </div>

          {/* Confidence bar */}
          {verdict && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <ConfidenceBadge value={verdict.confidence} />
                <div className="text-right">
                  <span className="text-[10px] text-faded">Target </span>
                  <span className="text-xs font-mono font-semibold text-primary">{formatINR(verdict.targetPrice)}</span>
                </div>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={clsx(
                    'h-full rounded-full',
                    verdict.action === 'BUY' ? 'bg-bull' : verdict.action === 'SELL' ? 'bg-bear' : 'bg-caution'
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${verdict.confidence}%` }}
                  transition={{ duration: 0.8, delay: index * 0.05 + 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Key reason */}
          {factors[0] && (
            <p className="text-xs text-faded leading-relaxed line-clamp-2 border-t border-subtle pt-2.5">
              {factors[0].summary}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
