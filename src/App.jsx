import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { RootLayout } from './components/layout/RootLayout'
import { Dashboard } from './pages/Dashboard'
import { AuthModal } from './components/auth/AuthModal'
import { useAuthStore } from './store/authStore'

const Discover = lazy(() => import('./pages/Discover').then(m => ({ default: m.Discover })))
const StockDetail = lazy(() => import('./pages/StockDetail').then(m => ({ default: m.StockDetail })))
const Portfolio = lazy(() => import('./pages/Portfolio').then(m => ({ default: m.Portfolio })))
const Watchlist = lazy(() => import('./pages/Watchlist').then(m => ({ default: m.Watchlist })))
const Sentiment = lazy(() => import('./pages/Sentiment').then(m => ({ default: m.Sentiment })))
const Screener = lazy(() => import('./pages/Screener').then(m => ({ default: m.Screener })))
const Compare = lazy(() => import('./pages/Compare').then(m => ({ default: m.Compare })))
const Calendar = lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-saffron-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-xs text-faded">Loading...</p>
    </div>
  </div>
)

export default function App() {
  const init = useAuthStore(s => s.init)
  useEffect(() => { init() }, [])

  return (
    <BrowserRouter>
      <AuthModal />
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="discover" element={<Suspense fallback={<PageFallback />}><Discover /></Suspense>} />
          <Route path="stock/:symbol" element={<Suspense fallback={<PageFallback />}><StockDetail /></Suspense>} />
          <Route path="portfolio" element={<Suspense fallback={<PageFallback />}><Portfolio /></Suspense>} />
          <Route path="watchlist" element={<Suspense fallback={<PageFallback />}><Watchlist /></Suspense>} />
          <Route path="sentiment" element={<Suspense fallback={<PageFallback />}><Sentiment /></Suspense>} />
          <Route path="screener" element={<Suspense fallback={<PageFallback />}><Screener /></Suspense>} />
          <Route path="compare" element={<Suspense fallback={<PageFallback />}><Compare /></Suspense>} />
          <Route path="calendar" element={<Suspense fallback={<PageFallback />}><Calendar /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
