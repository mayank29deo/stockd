import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Zap, Star, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const FEATURES = [
  'Live NSE/BSE quotes & AI verdicts',
  'Portfolio tracker & P&L analytics',
  'Advanced screener & comparisons',
  'Market sentiment dashboard',
  'Unlimited watchlists',
  'Historical OHLC charts (10 years)',
]

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const PlanModal = () => {
  const { planModalOpen, startTrial, user } = useAuthStore()
  const [paying, setPaying] = useState(false)
  const [error, setError]   = useState('')

  const handleTrial = () => startTrial()

  const handlePro = async () => {
    setPaying(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_name: user?.name  || '',
          email:      user?.email || '',
        }),
      })
      const data = await res.json()
      if (data.error || data.detail) throw new Error(data.error || data.detail)
      if (data.pay_url) {
        // Redirect to Instamojo payment page
        window.location.href = data.pay_url
      } else {
        throw new Error('No payment URL received')
      }
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.')
      setPaying(false)
    }
  }

  if (!planModalOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-card border border-subtle rounded-2xl w-full max-w-md shadow-2xl pointer-events-auto overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-saffron-500/20 to-saffron-500/5 px-6 pt-6 pb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-saffron flex items-center justify-center shadow-glow-saffron">
                <TrendingUp size={18} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-primary text-lg leading-tight">
                  Welcome to Stock<span className="text-saffron-500">d</span>
                </p>
                <p className="text-[10px] text-faded">Choose how you'd like to get started</p>
              </div>
            </div>
            <p className="text-xs text-secondary">
              Hi {user?.name?.split(' ')[0]} — pick a plan to unlock everything.
            </p>
          </div>

          {/* Features */}
          <div className="px-6 py-4 border-b border-subtle">
            <p className="text-[10px] text-faded uppercase tracking-wider mb-3 font-semibold">Everything included in both plans</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {FEATURES.map(f => (
                <div key={f} className="flex items-start gap-1.5">
                  <CheckCircle2 size={11} className="text-bull mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-secondary leading-tight">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Plan cards */}
          <div className="px-6 py-5 space-y-3">
            {error && (
              <p className="text-xs text-bear bg-bear/10 border border-bear/20 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Trial card */}
            <button
              onClick={handleTrial}
              className="w-full group flex items-center gap-4 bg-elevated hover:bg-card border border-subtle hover:border-saffron-500/50 rounded-xl px-4 py-4 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-saffron-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-saffron-500/20 transition-colors">
                <Clock size={18} className="text-saffron-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-primary">7-Day Free Trial</p>
                  <span className="text-[9px] bg-saffron-500/15 text-saffron-500 font-bold px-1.5 py-0.5 rounded-full">FREE</span>
                </div>
                <p className="text-[11px] text-faded">Full access · No credit card needed</p>
              </div>
              <Zap size={14} className="text-saffron-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>

            {/* Pro card */}
            <button
              onClick={handlePro}
              disabled={paying}
              className="w-full group flex items-center gap-4 bg-gradient-to-r from-saffron-500/10 to-orange-500/5 hover:from-saffron-500/20 hover:to-orange-500/10 border border-saffron-500/30 hover:border-saffron-500/60 rounded-xl px-4 py-4 transition-all text-left disabled:opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-saffron flex items-center justify-center flex-shrink-0 shadow-glow-saffron">
                {paying
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Star size={16} className="text-white" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-primary">Pro Plan</p>
                  <span className="text-[9px] bg-saffron-500 text-white font-bold px-1.5 py-0.5 rounded-full">BEST VALUE</span>
                </div>
                <p className="text-[11px] text-faded">Unlimited access · Cancel anytime</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-saffron-500 leading-none">₹99</p>
                <p className="text-[9px] text-faded">/month</p>
              </div>
            </button>

            <p className="text-[10px] text-faded text-center flex items-center justify-center gap-1">
              <ExternalLink size={9} />
              Secure payments via Instamojo · Trial converts to Pro at ₹99/mo
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
