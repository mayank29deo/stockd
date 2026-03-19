import api from './client'

export const stocksApi = {
  // All Nifty50 stocks with live verdicts
  getAll: (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.verdict && filters.verdict !== 'All') params.set('verdict', filters.verdict)
    if (filters.sector  && filters.sector  !== 'All') params.set('sector',  filters.sector)
    if (filters.cap     && filters.cap     !== 'All') params.set('cap',     filters.cap)
    const qs = params.toString()
    return api.get(`/api/stocks${qs ? `?${qs}` : ''}`)
  },

  // Single live quote
  getQuote: (symbol) => api.get(`/api/quote/${symbol}`),

  // Full stock detail (quote + history + fundamentals + technicals + verdict)
  getDetail: (symbol) => api.get(`/api/stock/${symbol}`),

  // Price history for chart
  getHistory: (symbol, period = '3m') => api.get(`/api/stock/${symbol}/history?period=${period}`),

  // Technicals only
  getTechnicals: (symbol) => api.get(`/api/stock/${symbol}/technicals`),

  // Fundamentals only
  getFundamentals: (symbol) => api.get(`/api/stock/${symbol}/fundamentals`),

  // Verdict only
  getVerdict: (symbol) => api.get(`/api/stock/${symbol}/verdict`),

  // Bulk quotes
  getBulkQuotes: (symbols) => api.get(`/api/quotes?symbols=${symbols.join(',')}`),

  // Search any NSE stock by symbol (not limited to Nifty50)
  search: (symbol) => api.get(`/api/search/${symbol}`),

  // Screener with advanced filters
  screener: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v != null && v !== '' && v !== 'all') params.set(k, v) })
    return api.get(`/api/screener?${params.toString()}`)
  },
}

export const indicesApi = {
  getAll:   ()        => api.get('/api/indices'),
  getOne:   (id)      => api.get(`/api/indices/${id}`),
}

export const sentimentApi = {
  getMarket:       () => api.get('/api/sentiment/market'),
  getGeopolitical: () => api.get('/api/sentiment/geopolitical'),
  getFearGreed:    () => api.get('/api/sentiment/fear-greed'),
}

export const marketApi = {
  getStatus: () => api.get('/api/market/status'),
}
