import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Star, CheckCircle2, Lock, ExternalLink } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const FEATURES = [
  'Live NSE/BSE quotes & AI verdicts',
  'Portfolio tracker & P&L analytics',
  'Advanced screener & comparisons',
  'Market sentiment dashboard',
  'Unlimited watchlists',
  'Historical charts (10 years)',
]

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const SubscriptionModal = () => {
  const { trialExpiredOpen, user } = useAuthStore()
  const [paying, setPaying] = useState(false)
  const [error, setError]   = useState('')

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
        window.location.href = data.pay_url
      } else {
        throw new Error('No payment URL received')
      }
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.')
      setPaying(false)
    }
  }

  if (!trialExpiredOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-50"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-card border border-subtle rounded-2xl w-full max-w-sm shadow-2xl pointer-events-auto overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-saffron-500/20 to-saffron-500/5 px-6 pt-6 pb-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-saffron flex items-center justify-center shadow-glow-saffron mx-auto mb-3">
              <Lock size={20} className="text-white" />
            </div>
            <p className="font-bold text-primary text-lg leading-tight mb-1">Your free trial has ended</p>
            <p className="text-xs text-secondary">
              Subscribe to keep using Stockd Pro — your data is saved and waiting.
            </p>
          </div>

          {/* Price */}
          <div className="px-6 py-4 border-b border-subtle text-center">
            <div className="inline-flex items-baseline gap-1">
              <span className="text-3xl font-black text-saffron-500">₹99</span>
              <span className="text-sm text-faded">/month</span>
            </div>
            <p className="text-[11px] text-faded mt-1">Cancel anytime · Secure via Instamojo</p>
          </div>

          {/* Features */}
          <div className="px-6 py-4 border-b border-subtle">
            <div className="space-y-2">
              {FEATURES.map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-bull flex-shrink-0" />
                  <span className="text-[11px] text-secondary">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="px-6 py-5 space-y-3">
            {error && (
              <p className="text-xs text-bear bg-bear/10 border border-bear/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              onClick={handlePro}
              disabled={paying}
              className="w-full flex items-center justify-center gap-2 bg-gradient-saffron hover:opacity-90 text-white font-semibold text-sm px-4 py-3.5 rounded-xl transition-all shadow-glow-saffron disabled:opacity-60"
            >
              {paying
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Star size={15} />
              }
              {paying ? 'Redirecting to payment...' : 'Subscribe for ₹99/month'}
            </button>

            <div className="flex items-center justify-center gap-1.5">
              <ExternalLink size={9} className="text-faded" />
              <p className="text-[10px] text-faded">
                You'll be redirected to Instamojo's secure payment page
              </p>
            </div>

            <div className="flex items-center justify-center gap-2">
              <TrendingUp size={11} className="text-saffron-500" />
              <p className="text-[10px] text-faded">
                Stock<span className="text-saffron-500">d</span> · Bazaar Ki Nabz, Aapke Haath Mein
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
