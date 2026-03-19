import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Compass, Briefcase, Star, SlidersHorizontal } from 'lucide-react'
import { clsx } from 'clsx'

const ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Home', exact: true },
  { to: '/discover', icon: Compass, label: 'Discover' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/watchlist', icon: Star, label: 'Watchlist' },
  { to: '/screener', icon: SlidersHorizontal, label: 'Screener' },
]

export const BottomNav = () => {
  const location = useLocation()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-subtle safe-b">
      <div className="flex items-center justify-around px-1 py-1">
        {ITEMS.map(({ to, icon: Icon, label, exact }) => {
          const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <NavLink key={to} to={to} className="flex-1">
              <div className={clsx(
                'flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg transition-all duration-150',
                isActive ? 'text-saffron-500' : 'text-faded hover:text-secondary'
              )}>
                <div className={clsx('p-1 rounded-lg transition-colors', isActive && 'bg-saffron-500/10')}>
                  <Icon size={20} />
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </div>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
