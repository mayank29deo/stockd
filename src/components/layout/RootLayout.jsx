import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ToastContainer } from '../common/Toast'
import { useMarketStatus } from '../../hooks/useStocks'

const D1Banner = () => {
  const { data: status } = useMarketStatus()
  if (!status || status.isOpen || !status.lastSnapshotDate) return null

  const formatDate = (d) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      })
    } catch { return d }
  }

  return (
    <div className="fixed top-[89px] left-0 right-0 z-30 bg-saffron-500/10 border-b border-saffron-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-saffron-400">
      <span className="w-1.5 h-1.5 rounded-full bg-saffron-500 inline-block" />
      <span className="font-medium">Market Closed</span>
      <span className="text-faded">— Showing data as of</span>
      <span className="font-semibold text-saffron-300">{formatDate(status.lastSnapshotDate)}</span>
      <span className="text-faded hidden sm:inline">· Live data resumes at 9:15 AM IST</span>
    </div>
  )
}

export const RootLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { data: status } = useMarketStatus()
  const showBanner = status && !status.isOpen && status.lastSnapshotDate

  return (
    <div className="min-h-screen bg-base">
      <TopBar
        onMenuToggle={() => setMobileMenuOpen(o => !o)}
        mobileMenuOpen={mobileMenuOpen}
      />

      <D1Banner />

      {/* Mobile sidebar */}
      <Sidebar
        isMobile
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Desktop sidebar */}
      <Sidebar isMobile={false} />

      {/* Main content — extra top padding when D-1 banner is visible */}
      <main className={`lg:ml-56 pb-20 lg:pb-6 min-h-screen ${showBanner ? 'pt-[117px]' : 'pt-[89px]'}`}>
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Risk Disclaimer Footer */}
      <footer className="lg:ml-56 pb-20 lg:pb-0 px-4 py-3 border-t border-subtle bg-base">
        <p className="text-[10px] text-faded text-center leading-relaxed max-w-3xl mx-auto">
          <span className="font-semibold text-secondary">⚠ Investment Disclaimer:</span>{' '}
          StockSage provides AI-generated analysis for informational purposes only and does not constitute financial advice.
          All investment decisions carry inherent risk — past performance is not indicative of future results.
          Please conduct your own due diligence and consult a SEBI-registered financial advisor before investing.
          We are not liable for any gains or losses arising from use of this platform.
        </p>
      </footer>

      {/* Toasts */}
      <ToastContainer />
    </div>
  )
}
