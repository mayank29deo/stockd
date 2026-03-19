import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ToastContainer } from '../common/Toast'

export const RootLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-base">
      <TopBar
        onMenuToggle={() => setMobileMenuOpen(o => !o)}
        mobileMenuOpen={mobileMenuOpen}
      />

      {/* Mobile sidebar */}
      <Sidebar
        isMobile
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Desktop sidebar */}
      <Sidebar isMobile={false} />

      {/* Main content */}
      <main className="lg:ml-56 pt-[89px] pb-20 lg:pb-6 min-h-screen">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Toasts */}
      <ToastContainer />
    </div>
  )
}
