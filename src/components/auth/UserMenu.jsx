import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, User, Settings, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { clsx } from 'clsx'

export const UserMenu = () => {
  const { user, isGuest, openModal, signOutUser } = useAuthStore()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Not signed in — show Sign In button
  if (!user) {
    return (
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-saffron-500 hover:bg-saffron-500/90 text-white transition-colors"
      >
        Sign In
      </button>
    )
  }

  const isGoogleUser = user.provider === 'google'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 hover:bg-elevated rounded-lg px-2 py-1.5 transition-colors"
      >
        {/* Avatar */}
        {user.photo ? (
          <img src={user.photo} alt={user.name} className="w-7 h-7 rounded-full object-cover ring-1 ring-subtle" />
        ) : (
          <div className={clsx(
            'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white',
            isGuest ? 'bg-muted' : 'bg-gradient-saffron'
          )}>
            {isGuest ? <User size={13} /> : user.name?.[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-xs font-medium text-primary hidden md:block max-w-[80px] truncate">
          {isGuest ? 'Guest' : user.name?.split(' ')[0]}
        </span>
        <ChevronDown size={12} className="text-faded hidden md:block" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-52 bg-elevated border border-subtle rounded-xl shadow-card-hover z-50 overflow-hidden"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-subtle">
              <p className="text-sm font-semibold text-primary truncate">{user.name}</p>
              {user.email && <p className="text-[10px] text-faded truncate mt-0.5">{user.email}</p>}
              <span className={clsx(
                'inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-1.5',
                isGuest ? 'bg-muted text-secondary' : 'bg-bull/10 text-bull'
              )}>
                {isGuest ? 'Guest Mode' : '● Google Account'}
              </span>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {isGuest && (
                <button
                  onClick={() => { setOpen(false); openModal() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-saffron-500 hover:bg-card transition-colors font-semibold"
                >
                  Sign in with Google to sync data →
                </button>
              )}

              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-xs text-secondary hover:text-primary hover:bg-card transition-colors"
              >
                <Settings size={13} /> Settings
              </Link>

              <button
                onClick={async () => { setOpen(false); await signOutUser() }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-bear hover:bg-bear/5 transition-colors"
              >
                <LogOut size={13} /> {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
