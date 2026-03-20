import { motion } from 'framer-motion'
import { MiniSparkline } from '../charts/MiniSparkline'
import { formatINR, formatPercent } from '../../utils/formatters'
import { clsx } from 'clsx'

export const IndexCard = ({ index, delay = 0 }) => {
  const isPos = index.changePercent >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="bg-card border border-subtle rounded-xl p-3 hover:border-muted hover:shadow-card-hover transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="min-w-0 pr-1">
          <p className="text-[11px] text-secondary font-semibold leading-tight truncate">{index.name}</p>
          <p className="text-[9px] text-faded">{index.exchange}</p>
        </div>
        <span className={clsx(
          'text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0',
          isPos ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
        )}>
          {isPos ? '▲' : '▼'} {Math.abs(index.changePercent).toFixed(2)}%
        </span>
      </div>

      <p className="text-lg font-bold font-mono text-primary mb-0.5 leading-tight">
        {(index.value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </p>
      <p className={clsx('text-[10px] font-semibold mb-2', isPos ? 'text-bull' : 'text-bear')}>
        {isPos ? '+' : ''}{(index.change ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} pts
      </p>

      <MiniSparkline data={index.priceHistory} positive={isPos} height={36} />
    </motion.div>
  )
}
