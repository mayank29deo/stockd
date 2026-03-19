import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Compass, Briefcase, Star, Activity,
  SlidersHorizontal, GitCompare, Calendar, Settings, TrendingUp
} from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/discover', icon: Compass, label: 'Discover' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/watchlist', icon: Star, label: 'Watchlist' },
  { to: '/sentiment', icon: Activity, label: 'Sentiment' },
  { to: '/screener', icon: SlidersHorizontal, label: 'Screener' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
]

const NavItem = ({ to, icon: Icon, label, exact }) => {
  const location = useLocation()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <NavLink to={to} className="block">
      <div className={clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative',
        isActive
          ? 'bg-saffron-500/15 text-saffron-500'
          : 'text-secondary hover:text-primary hover:bg-elevated'
      )}>
        {isActive && (
          <motion.div
            layoutId="sidebar-indicator"
            className="absolute left-0 top-1 bottom-1 w-0.5 bg-saffron-500 rounded-r"
          />
        )}
        <Icon size={18} className="flex-shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </NavLink>
  )
}

export const Sidebar = ({ isOpen, onClose, isMobile }) => {
  const sidebarContent = (
    <div className="flex flex-col h-full py-4">
      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Bottom */}
      <div className="px-3 space-y-0.5 border-t border-subtle pt-3 mt-3">
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </div>

      {/* Version */}
      <div className="px-4 mt-3">
        <p className="text-[10px] text-faded">Stockd v1.0 · NSE/BSE Data</p>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-subtle z-50 lg:hidden"
            >
              <div className="p-4 border-b border-subtle flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-saffron flex items-center justify-center">
                  <TrendingUp size={16} className="text-white" />
                </div>
                <span className="font-bold text-lg">Stock<span className="text-saffron-500">Sage</span></span>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    )
  }

  return (
    <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 bg-surface border-r border-subtle fixed left-0 top-[89px] bottom-0 overflow-y-auto z-30">
      {sidebarContent}
    </aside>
  )
}
