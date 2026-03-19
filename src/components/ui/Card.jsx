import { clsx } from 'clsx'
import { motion } from 'framer-motion'

export const Card = ({ children, className, hover = false, onClick, animate = false }) => {
  const base = 'bg-card border border-subtle rounded-xl shadow-card'
  const hoverCls = hover ? 'hover:border-muted hover:shadow-card-hover transition-all duration-300 cursor-pointer' : ''

  if (animate) {
    return (
      <motion.div
        className={clsx(base, hoverCls, className)}
        onClick={onClick}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        whileHover={hover ? { scale: 1.01 } : {}}
      >
        {children}
      </motion.div>
    )
  }
  return (
    <div className={clsx(base, hoverCls, className)} onClick={onClick}>
      {children}
    </div>
  )
}

export const GlassCard = ({ children, className, hover = false, onClick }) => (
  <div
    className={clsx(
      'bg-card/70 backdrop-blur-md border border-subtle rounded-xl shadow-card',
      hover && 'hover:border-muted hover:shadow-card-hover transition-all duration-300 cursor-pointer',
      className
    )}
    onClick={onClick}
  >
    {children}
  </div>
)

export const StatCard = ({ label, value, sub, icon: Icon, className }) => (
  <Card className={clsx('p-4', className)}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-secondary uppercase tracking-wider font-medium mb-1">{label}</p>
        <p className="text-xl font-bold text-primary font-mono truncate">{value}</p>
        {sub && <p className="text-xs text-secondary mt-0.5">{sub}</p>}
      </div>
      {Icon && (
        <div className="w-9 h-9 rounded-lg bg-saffron-500/10 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-saffron-500" />
        </div>
      )}
    </div>
  </Card>
)
