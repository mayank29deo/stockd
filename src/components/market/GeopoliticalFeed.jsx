import { GEOPOLITICAL_NEWS } from '../../data/mock/stocks'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { formatDate } from '../../utils/formatters'

const ImpactIcon = ({ impact }) => {
  if (impact === 'positive') return <TrendingUp size={13} className="text-bull" />
  if (impact === 'negative') return <TrendingDown size={13} className="text-bear" />
  return <Minus size={13} className="text-secondary" />
}

export const GeopoliticalFeed = ({ limit = 4, news: liveFeed }) => {
  const news = (liveFeed || GEOPOLITICAL_NEWS).slice(0, limit)

  return (
    <div className="bg-card border border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary">Geopolitical & Macro</h3>
        <span className="text-[10px] text-faded bg-elevated px-2 py-0.5 rounded-full">India Focus</span>
      </div>
      <div className="space-y-3">
        {news.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex gap-2.5 pb-3 border-b border-subtle last:border-0 last:pb-0"
          >
            <div className={clsx(
              'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5',
              item.impact === 'positive' ? 'bg-bull/10' : item.impact === 'negative' ? 'bg-bear/10' : 'bg-muted'
            )}>
              <ImpactIcon impact={item.impact} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary leading-snug">{item.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-faded">{formatDate(item.date, true)}</span>
                <span className="text-[10px] text-faded">·</span>
                <span className="text-[10px] text-faded">{item.source}</span>
                <div className="flex gap-1 ml-auto flex-shrink-0">
                  {item.sectors.slice(0, 2).map(s => (
                    <span key={s} className="text-[9px] px-1 py-0.5 bg-elevated rounded text-secondary">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
