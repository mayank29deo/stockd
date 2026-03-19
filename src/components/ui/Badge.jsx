import { clsx } from 'clsx'

export const VerdictBadge = ({ verdict, size = 'md', className }) => {
  const base = 'inline-flex items-center justify-center rounded-lg font-bold tracking-wide uppercase'
  const sizes = { xs: 'text-[10px] px-1.5 py-0.5', sm: 'text-xs px-2 py-1', md: 'text-sm px-3 py-1.5', lg: 'text-base px-4 py-2' }
  const variants = {
    BUY: 'bg-bull/10 text-bull border border-bull/25',
    SELL: 'bg-bear/10 text-bear border border-bear/25',
    HOLD: 'bg-caution/10 text-caution border border-caution/25',
  }
  return (
    <span className={clsx(base, sizes[size], variants[verdict] || variants.HOLD, className)}>
      {verdict}
    </span>
  )
}

export const SectorBadge = ({ sector, className }) => (
  <span className={clsx('text-xs px-2 py-0.5 rounded-md bg-elevated text-secondary border border-subtle font-medium', className)}>
    {sector}
  </span>
)

export const ExchangeBadge = ({ exchange, className }) => (
  <span className={clsx(
    'text-[10px] px-1.5 py-0.5 rounded font-bold tracking-widest',
    exchange === 'NSE' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    className
  )}>
    {exchange}
  </span>
)

export const ConfidenceBadge = ({ value, className }) => {
  const color = value >= 75 ? 'text-bull' : value >= 55 ? 'text-caution' : 'text-bear'
  return (
    <span className={clsx('text-xs font-semibold', color, className)}>
      {value}% conf.
    </span>
  )
}
