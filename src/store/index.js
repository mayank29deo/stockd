import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STOCKS } from '../data/mock/stocks'

// ---- Portfolio Store ----
export const usePortfolioStore = create(persist(
  (set, get) => ({
    portfolios: [],
    activePortfolioId: null,

    addPortfolio: (portfolio) => {
      set(s => ({ portfolios: [...s.portfolios, portfolio], activePortfolioId: portfolio.id }))
    },
    removePortfolio: (id) => {
      set(s => ({
        portfolios: s.portfolios.filter(p => p.id !== id),
        activePortfolioId: s.activePortfolioId === id ? null : s.activePortfolioId,
      }))
    },
    setActivePortfolio: (id) => set({ activePortfolioId: id }),
    getActivePortfolio: () => {
      const { portfolios, activePortfolioId } = get()
      return portfolios.find(p => p.id === activePortfolioId) || portfolios[0] || null
    },
    updateHolding: (portfolioId, symbol, updates) => {
      set(s => ({
        portfolios: s.portfolios.map(p => p.id !== portfolioId ? p : {
          ...p,
          holdings: p.holdings.map(h => h.symbol !== symbol ? h : { ...h, ...updates }),
        }),
      }))
    },
    addHolding: (portfolioId, holding) => {
      set(s => ({
        portfolios: s.portfolios.map(p => p.id !== portfolioId ? p : {
          ...p,
          holdings: [...p.holdings.filter(h => h.symbol !== holding.symbol), holding],
        }),
      }))
    },
    removeHolding: (portfolioId, symbol) => {
      set(s => ({
        portfolios: s.portfolios.map(p => p.id !== portfolioId ? p : {
          ...p,
          holdings: p.holdings.filter(h => h.symbol !== symbol),
        }),
      }))
    },
  }),
  { name: 'stockd-portfolio' }
))

// ---- Watchlist Store ----
export const useWatchlistStore = create(persist(
  (set, get) => ({
    watchlists: [{ id: 'default', name: 'My Watchlist', stockIds: ['RELIANCE', 'TCS', 'ICICIBANK', 'SUNPHARMA'] }],
    activeWatchlistId: 'default',

    createWatchlist: (name) => {
      const id = Date.now().toString()
      set(s => ({ watchlists: [...s.watchlists, { id, name, stockIds: [] }], activeWatchlistId: id }))
    },
    deleteWatchlist: (id) => {
      set(s => ({
        watchlists: s.watchlists.filter(w => w.id !== id),
        activeWatchlistId: s.activeWatchlistId === id ? 'default' : s.activeWatchlistId,
      }))
    },
    setActiveWatchlist: (id) => set({ activeWatchlistId: id }),
    addToWatchlist: (watchlistId, stockId) => {
      set(s => ({
        watchlists: s.watchlists.map(w => w.id !== watchlistId ? w : {
          ...w,
          stockIds: w.stockIds.includes(stockId) ? w.stockIds : [...w.stockIds, stockId],
        }),
      }))
    },
    removeFromWatchlist: (watchlistId, stockId) => {
      set(s => ({
        watchlists: s.watchlists.map(w => w.id !== watchlistId ? w : {
          ...w,
          stockIds: w.stockIds.filter(id => id !== stockId),
        }),
      }))
    },
    isInWatchlist: (stockId) => {
      const { watchlists, activeWatchlistId } = get()
      const active = watchlists.find(w => w.id === activeWatchlistId)
      return active?.stockIds.includes(stockId) ?? false
    },
    getActiveWatchlist: () => {
      const { watchlists, activeWatchlistId } = get()
      return watchlists.find(w => w.id === activeWatchlistId) || watchlists[0]
    },
  }),
  { name: 'stockd-watchlist' }
))

// ---- UI Store ----
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  activeModal: null,
  toasts: [],
  mobileMenuOpen: false,

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  toggleMobileMenu: () => set(s => ({ mobileMenuOpen: !s.mobileMenuOpen })),

  addToast: (toast) => {
    const id = Date.now()
    set(s => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000)
  },
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

// ---- Filter Store ----
export const useFilterStore = create(persist(
  (set) => ({
    sector: 'all',
    cap: 'all',
    exchange: 'all',
    verdict: 'all',
    sortBy: 'confidence',
    searchQuery: '',

    setSector: (sector) => set({ sector }),
    setCap: (cap) => set({ cap }),
    setExchange: (exchange) => set({ exchange }),
    setVerdict: (verdict) => set({ verdict }),
    setSortBy: (sortBy) => set({ sortBy }),
    setSearchQuery: (q) => set({ searchQuery: q }),
    resetFilters: () => set({ sector: 'all', cap: 'all', exchange: 'all', verdict: 'all', sortBy: 'confidence', searchQuery: '' }),
  }),
  { name: 'stockd-filters' }
))
