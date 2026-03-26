import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Suspense, lazy, useEffect, Component } from 'react'
import { RootLayout } from './components/layout/RootLayout'
import { Dashboard } from './pages/Dashboard'
import { AuthModal } from './components/auth/AuthModal'
import { useAuthStore } from './store/authStore'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <p className="text-bear font-semibold mb-2">Something went wrong</p>
        <p className="text-xs text-faded font-mono bg-elevated border border-subtle rounded px-3 py-2 max-w-xl break-all">
          {this.state.error.message}
        </p>
        <button onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
          className="mt-4 text-sm text-saffron-500 hover:underline">
          Go to Dashboard
        </button>
      </div>
    )
    return this.props.children
  }
}

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
          <Route path="discover" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Discover /></Suspense></ErrorBoundary>} />
          <Route path="stock/:symbol" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><StockDetail /></Suspense></ErrorBoundary>} />
          <Route path="portfolio" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Portfolio /></Suspense></ErrorBoundary>} />
          <Route path="watchlist" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Watchlist /></Suspense></ErrorBoundary>} />
          <Route path="sentiment" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Sentiment /></Suspense></ErrorBoundary>} />
          <Route path="screener" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Screener /></Suspense></ErrorBoundary>} />
          <Route path="compare" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Compare /></Suspense></ErrorBoundary>} />
          <Route path="calendar" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Calendar /></Suspense></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><Suspense fallback={<PageFallback />}><Settings /></Suspense></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
