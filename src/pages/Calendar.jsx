import { motion } from 'framer-motion'
import { Calendar as CalIcon, AlertCircle, TrendingUp, FileText, BarChart2 } from 'lucide-react'
import { clsx } from 'clsx'

const EVENTS = [
  { date: '2026-03-20', type: 'results', title: 'HDFC Bank Q4 Results', impact: 'high', sectors: ['Banking'] },
  { date: '2026-03-21', type: 'expiry', title: 'March F&O Series Expiry', impact: 'high', sectors: ['All'] },
  { date: '2026-03-21', type: 'results', title: 'Infosys Q4 Results', impact: 'high', sectors: ['IT'] },
  { date: '2026-03-24', type: 'results', title: 'Reliance Q4 Results', impact: 'high', sectors: ['Energy'] },
  { date: '2026-03-25', type: 'results', title: 'TCS Q4 Results', impact: 'high', sectors: ['IT'] },
  { date: '2026-03-28', type: 'macro', title: 'India GDP Q3 Data Release', impact: 'medium', sectors: ['All'] },
  { date: '2026-04-01', type: 'macro', title: 'RBI Credit Policy Minutes Released', impact: 'medium', sectors: ['Banking', 'NBFC'] },
  { date: '2026-04-03', type: 'index', title: 'Nifty50 Quarterly Rebalancing', impact: 'medium', sectors: ['All'] },
  { date: '2026-04-05', type: 'macro', title: 'India PMI Manufacturing Data', impact: 'low', sectors: ['Manufacturing'] },
  { date: '2026-06-06', type: 'rbi', title: 'RBI MPC Policy Announcement', impact: 'high', sectors: ['Banking', 'NBFC', 'Realty'] },
]

const TYPE_CONFIG = {
  results: { icon: BarChart2, color: 'bg-saffron-500/10 text-saffron-500 border-saffron-500/20', label: 'Results' },
  rbi: { icon: AlertCircle, color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'RBI' },
  expiry: { icon: CalIcon, color: 'bg-bear/10 text-bear border-bear/20', label: 'F&O Expiry' },
  macro: { icon: TrendingUp, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', label: 'Macro' },
  index: { icon: FileText, color: 'bg-bull/10 text-bull border-bull/20', label: 'Index' },
}

const IMPACT_COLORS = { high: 'text-bear font-bold', medium: 'text-caution font-semibold', low: 'text-secondary' }

export const Calendar = () => {
  const upcomingToday = EVENTS.filter(e => new Date(e.date) >= new Date())
  const thisWeek = upcomingToday.filter(e => {
    const diff = (new Date(e.date) - new Date()) / (1000 * 60 * 60 * 24)
    return diff <= 7
  })

  const grouped = EVENTS.reduce((acc, e) => {
    const month = new Date(e.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    if (!acc[month]) acc[month] = []
    acc[month].push(e)
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Economic Calendar</h1>
        <p className="text-sm text-secondary mt-1">Upcoming market-moving events in India</p>
      </div>

      {/* This week */}
      {thisWeek.length > 0 && (
        <div className="bg-caution/5 border border-caution/20 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-caution mb-3">⚠️ This Week ({thisWeek.length} events)</h2>
          <div className="space-y-2">
            {thisWeek.map((event, i) => {
              const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.macro
              const Icon = cfg.icon
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className={clsx('flex items-center gap-3 border rounded-lg px-3 py-2', cfg.color)}
                >
                  <Icon size={13} />
                  <div className="flex-1">
                    <span className="text-xs font-semibold">{event.title}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-faded">{new Date(event.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                    <p className={clsx('text-[9px] capitalize', IMPACT_COLORS[event.impact])}>{event.impact} impact</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full calendar */}
      {Object.entries(grouped).map(([month, events]) => (
        <div key={month}>
          <h2 className="text-sm font-semibold text-primary mb-3">{month}</h2>
          <div className="space-y-2.5">
            {events.map((event, i) => {
              const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.macro
              const Icon = cfg.icon
              const isPast = new Date(event.date) < new Date()
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className={clsx('bg-card border border-subtle rounded-xl p-4 flex items-center gap-4', isPast && 'opacity-50')}
                >
                  {/* Date */}
                  <div className="text-center flex-shrink-0 w-12">
                    <p className="text-lg font-bold text-primary">{new Date(event.date).getDate()}</p>
                    <p className="text-[10px] text-faded">{new Date(event.date).toLocaleDateString('en-IN', { month: 'short' })}</p>
                  </div>

                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border', cfg.color)}>
                    <Icon size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary">{event.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border', cfg.color)}>{cfg.label}</span>
                      {event.sectors.map(s => <span key={s} className="text-[10px] text-faded">{s}</span>)}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className={clsx('text-xs capitalize font-semibold', IMPACT_COLORS[event.impact])}>{event.impact}</span>
                    <p className="text-[10px] text-faded mt-0.5">Impact</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
