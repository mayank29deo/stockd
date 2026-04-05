import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const PaymentSuccess = () => {
  const [searchParams] = useSearchParams()
  const navigate        = useNavigate()
  const activatePro     = useAuthStore(s => s.activatePro)
  const [status, setStatus] = useState('verifying') // verifying | success | failed

  const paymentId        = searchParams.get('payment_id') || ''
  const paymentRequestId = searchParams.get('payment_request_id') || ''
  const statusParam      = searchParams.get('status') || ''

  useEffect(() => {
    const verify = async () => {
      // If Instamojo already tells us it failed via redirect param
      if (statusParam === 'failed') {
        setStatus('failed')
        return
      }
      if (!paymentId || !paymentRequestId) {
        setStatus('failed')
        return
      }
      try {
        const res = await fetch(`${API_URL}/api/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_request_id: paymentRequestId, payment_id: paymentId }),
        })
        const data = await res.json()
        if (data.verified) {
          activatePro()
          setStatus('success')
          setTimeout(() => navigate('/'), 3000)
        } else {
          setStatus('failed')
        }
      } catch {
        setStatus('failed')
      }
    }
    verify()
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-app px-4">
      <div className="bg-card border border-subtle rounded-2xl w-full max-w-sm p-8 text-center shadow-2xl">

        {status === 'verifying' && (
          <>
            <Loader2 size={48} className="text-saffron-500 animate-spin mx-auto mb-4" />
            <p className="font-bold text-primary text-lg mb-1">Verifying payment...</p>
            <p className="text-xs text-faded">Please wait, this takes a few seconds.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 size={48} className="text-bull mx-auto mb-4" />
            <p className="font-bold text-primary text-lg mb-1">You're on Pro!</p>
            <p className="text-xs text-secondary mb-4">
              Welcome to Stockd Pro. Enjoy unlimited access — you'll be redirected shortly.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-gradient-saffron text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {status === 'failed' && (
          <>
            <XCircle size={48} className="text-bear mx-auto mb-4" />
            <p className="font-bold text-primary text-lg mb-1">Payment failed</p>
            <p className="text-xs text-secondary mb-4">
              Your payment could not be verified. If money was debited, contact us at support@stockd.co.in
            </p>
            <button
              onClick={() => navigate('/')}
              className="border border-subtle text-secondary text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-elevated transition-colors"
            >
              Go back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
