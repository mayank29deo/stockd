import { useState, useEffect, useCallback, useRef } from 'react'
import { stocksApi, indicesApi, sentimentApi, marketApi } from '../api/stocks'
import { STOCKS as MOCK_STOCKS, INDICES as MOCK_INDICES, MARKET_MOOD as MOCK_MOOD, GEOPOLITICAL_NEWS as MOCK_NEWS } from '../data/mock/stocks'
import { NSE_STOCKS } from '../data/nseStocks'

// Sector → accent color (keep in sync with backend _sector_color)
const SECTOR_COLORS = {
  IT: '#3B82F6', Banking: '#8B5CF6', FMCG: '#10B981', Pharma: '#06B6D4',
  Auto: '#F59E0B', Energy: '#EF4444', Infra: '#6366F1', Metals: '#78716C',
  Internet: '#EC4899', Fintech: '#14B8A6', Retail: '#F97316',
}

const POLL_INTERVAL_MS = 60 * 1000  // refresh every 60s

// ── Module-level cache — survives page navigation (component unmount/remount) ──
// Key → { data, isLive, fetchedAt }
const _cache = new Map()

function isFresh(key, ttlMs) {
  const entry = _cache.get(key)
  if (!entry) return false
  return (Date.now() - entry.fetchedAt) < ttlMs
}

// ── Generic data fetcher with loading/error/fallback + navigation cache ────────
function useLiveData(cacheKey, fetcher, fallback, deps = [], pollMs = POLL_INTERVAL_MS) {
  const cached     = _cache.get(cacheKey)
  const [data, setData]       = useState(cached?.data ?? null)
  const [loading, setLoading] = useState(!cached)        // skip loading if cached
  const [error, setError]     = useState(null)
  const [isLive, setIsLive]   = useState(cached?.isLive ?? false)
  const pollRef = useRef(null)

  const load = useCallback(async (force = false) => {
    // If we have fresh cached data and this isn't a forced refetch, skip the call
    if (!force && isFresh(cacheKey, pollMs)) {
      const entry = _cache.get(cacheKey)
      setData(entry.data)
      setIsLive(entry.isLive)
      setLoading(false)
      return
    }

    try {
      const result = await fetcher()
      if (result && (Array.isArray(result) ? result.length > 0 : Object.keys(result).length > 0)) {
        _cache.set(cacheKey, { data: result, isLive: true, fetchedAt: Date.now() })
        setData(result)
        setIsLive(true)
        setError(null)
      } else {
        throw new Error('Empty response')
      }
    } catch (err) {
      setError(err.message)
      if (!_cache.has(cacheKey)) setData(fallback)
      setIsLive(false)
    } finally {
      setLoading(false)
    }
  }, [cacheKey, ...deps])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isFresh(cacheKey, pollMs)) setLoading(true)
    load()
    if (pollMs > 0) {
      pollRef.current = setInterval(() => load(true), pollMs)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])  // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = () => load(true)

  return { data: data ?? fallback, loading, error, isLive, refetch }
}

// ── All stocks (Discover page) ────────────────────────────────────────────────
export function useStocks(filters = {}) {
  const filterKey = JSON.stringify(filters)
  return useLiveData(
    `stocks:${filterKey}`,
    () => stocksApi.getAll(filters),
    MOCK_STOCKS,
    [filterKey],
    POLL_INTERVAL_MS,
  )
}

// ── Single stock detail ───────────────────────────────────────────────────────
export function useStockDetail(symbol) {
  const mockStock = MOCK_STOCKS.find(s => s.symbol === symbol) || null
  // For non-mock stocks (NYKAA, PAYTM, IRFC…) build a minimal stub from NSE_STOCKS
  // so the page renders with at least the name/sector while the API loads.
  const nse = !mockStock ? NSE_STOCKS.find(s => s.symbol === symbol) : null
  const fallback = mockStock || (nse ? {
    id: symbol, symbol,
    name: nse.name,
    sector: nse.sector,
    color: SECTOR_COLORS[nse.sector] || '#FF6B35',
    price: null, changePercent: null, priceHistory: [],
  } : null)
  return useLiveData(
    `stock:${symbol}`,
    () => stocksApi.getDetail(symbol),
    fallback,
    [symbol],
    5 * 60 * 1000,   // stock detail cached 5 min
  )
}

// ── Price history for chart ───────────────────────────────────────────────────
export function useStockHistory(symbol, period = '3m') {
  const mock = MOCK_STOCKS.find(s => s.symbol === symbol)?.priceHistory || []
  return useLiveData(
    `history:${symbol}:${period}`,
    () => stocksApi.getHistory(symbol, period),
    mock,
    [symbol, period],
    5 * 60 * 1000,   // history cached 5 min
  )
}

// ── Indices (Dashboard) ───────────────────────────────────────────────────────
export function useIndices() {
  return useLiveData(
    'indices',
    () => indicesApi.getAll(),
    MOCK_INDICES,
    [],
    POLL_INTERVAL_MS,
  )
}

// ── Market sentiment & macro ──────────────────────────────────────────────────
export function useMarketSentiment() {
  return useLiveData(
    'sentiment',
    () => sentimentApi.getMarket(),
    { ...MOCK_MOOD, geopoliticalNews: MOCK_NEWS },
    [],
    5 * 60 * 1000,
  )
}

// ── Market open/closed status ─────────────────────────────────────────────────
export function useMarketStatus() {
  return useLiveData(
    'market-status',
    () => marketApi.getStatus(),
    { isOpen: false, currentIST: '--:--' },
    [],
    30 * 1000,
  )
}

// ── Screener ──────────────────────────────────────────────────────────────────
export function useScreener(filters) {
  const filterKey = JSON.stringify(filters)
  return useLiveData(
    `screener:${filterKey}`,
    () => stocksApi.screener(filters),
    MOCK_STOCKS,
    [filterKey],
    3 * 60 * 1000,
  )
}
