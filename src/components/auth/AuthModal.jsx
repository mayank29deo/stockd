import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, ArrowRight, Shield, Zap, BarChart2, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { firebaseReady } from '../../firebase'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export const AuthModal = () => {
  const { modalOpen, closeModal, signInWithGoogle, continueAsGuest } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (err) {
      setError('Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  const handleGuest = () => {
    continueAsGuest()
  }

  return (
    <AnimatePresence>
      {modalOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-card border border-subtle rounded-2xl w-full max-w-sm shadow-2xl pointer-events-auto overflow-hidden">
              {/* Header gradient strip */}
              <div className="bg-gradient-to-r from-saffron-500/20 to-saffron-500/5 px-6 pt-6 pb-4 relative">
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-faded hover:text-primary transition-colors"
                >
                  <X size={15} />
                </button>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-saffron flex items-center justify-center shadow-glow-saffron">
                    <TrendingUp size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-primary text-lg leading-tight">
                      Stock<span className="text-saffron-500">d</span>
                    </p>
                    <p className="text-[10px] text-faded">Bazaar Ki Nabd, Aapke Haath Mein</p>
                  </div>
                </div>

                <p className="text-sm text-secondary leading-snug">
                  Sign in to save your portfolio, watchlists & get personalised AI verdicts.
                </p>
              </div>

              {/* Features */}
              <div className="px-6 py-3 grid grid-cols-3 gap-2 border-b border-subtle">
                {[
                  { icon: Zap, label: 'AI Verdicts', color: 'text-saffron-500 bg-saffron-500/10' },
                  { icon: BarChart2, label: 'Portfolio', color: 'text-bull bg-bull/10' },
                  { icon: Shield, label: 'Sync Data', color: 'text-blue-400 bg-blue-400/10' },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 py-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                      <Icon size={14} />
                    </div>
                    <span className="text-[10px] text-faded text-center">{label}</span>
                  </div>
                ))}
              </div>

              {/* Auth buttons */}
              <div className="px-6 py-5 space-y-3">
                {!firebaseReady && (
                  <div className="flex items-start gap-2 text-xs text-caution bg-caution/10 border border-caution/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Firebase not configured. Add credentials to <code className="font-mono">.env</code> to enable Google Sign-In.</span>
                  </div>
                )}

                {error && (
                  <p className="text-xs text-bear bg-bear/10 border border-bear/20 rounded-lg px-3 py-2">{error}</p>
                )}

                {/* Google Sign In */}
                <button
                  onClick={handleGoogle}
                  disabled={loading || !firebaseReady}
                  className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold text-sm px-4 py-3 rounded-xl border border-gray-200 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {loading ? 'Signing in...' : 'Continue with Google'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-subtle" />
                  <span className="text-[10px] text-faded">or</span>
                  <div className="flex-1 h-px bg-subtle" />
                </div>

                {/* Guest */}
                <button
                  onClick={handleGuest}
                  className="w-full flex items-center justify-center gap-2 text-secondary hover:text-primary border border-subtle hover:border-muted bg-elevated hover:bg-card text-sm font-medium px-4 py-3 rounded-xl transition-all"
                >
                  Continue as Guest
                  <ArrowRight size={14} />
                </button>

                <p className="text-[10px] text-faded text-center leading-relaxed">
                  Guest mode stores data locally only. Sign in to sync across devices.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
