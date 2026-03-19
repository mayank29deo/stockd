import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'
import { useUIStore } from '../../store/index'
import { clsx } from 'clsx'

const ICONS = {
  success: <CheckCircle size={16} className="text-bull" />,
  error: <AlertCircle size={16} className="text-bear" />,
  info: <Info size={16} className="text-blue-400" />,
}

export const ToastContainer = () => {
  const { toasts, dismissToast } = useUIStore()

  return (
    <div className="fixed bottom-24 lg:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="bg-elevated border border-muted rounded-xl p-3 shadow-card-hover flex items-start gap-3"
          >
            <div className="flex-shrink-0 mt-0.5">{ICONS[toast.type] || ICONS.info}</div>
            <div className="flex-1 min-w-0">
              {toast.title && <p className="text-sm font-semibold text-primary">{toast.title}</p>}
              {toast.message && <p className="text-xs text-secondary mt-0.5">{toast.message}</p>}
            </div>
            <button onClick={() => dismissToast(toast.id)} className="flex-shrink-0 text-faded hover:text-secondary transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
