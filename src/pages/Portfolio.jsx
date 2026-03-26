import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Plus, Trash2, TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { STOCKS } from '../data/mock/stocks'
import { usePortfolioStore, useUIStore } from '../store/index'
import { parseCSV } from '../utils/parsers'
import { computePortfolioRecommendations } from '../utils/verdictEngine'
import { formatINR, formatPercent, getChangeColor, formatCrore } from '../utils/formatters'
import { VerdictBadge } from '../components/ui/Badge'
import { StockChart } from '../components/charts/StockChart'
import { clsx } from 'clsx'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'

const BROKER_INFO = {
  groww: { name: 'Groww', color: '#00D09C', instructions: 'Go to Groww → Stocks → Portfolio → Export (3-dot menu) → Download CSV' },
  zerodha: { name: 'Zerodha', color: '#387ED1', instructions: 'Kite → Holdings → Download Holdings (CSV icon top-right)' },
  other: { name: 'Generic CSV', color: '#9999B3', instructions: 'Columns: Symbol, Quantity, Avg Price, Current Price' },
}

const COLORS = ['#FF6B35', '#00C897', '#4E9AF1', '#A78BFA', '#FFB020', '#F472B6', '#34D399', '#FB923C']

const ImportSection = ({ onImport }) => {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  const processFile = (file) => {
    const isCSV = file && (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel' || file.type === '')
    if (!file || !isCSV) { setError('Please upload a CSV file'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = parseCSV(e.target.result)
      if (result.errors.length > 0) { setError(result.errors.join(', ')); return }
      if (result.holdings.length === 0) { setError('No valid holdings found. Check CSV format.'); return }
      setPreview(result)
      setError('')
    }
    reader.readAsText(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    processFile(e.dataTransfer.files[0])
  }, [])

  const handleConfirmImport = () => {
    if (!preview) return
    // Try to enrich with live prices from mock NIFTY50 data.
    // For non-NIFTY50 stocks (most of the portfolio), fall back to the
    // values already parsed from the CSV (Previous Closing Price, Unrealized P&L, etc.)
    const enriched = preview.holdings.map(h => {
      const live = STOCKS.find(s => s.symbol === h.symbol || s.id === h.symbol)
      const livePrice = live?.price ?? null
      const effectivePrice = livePrice ?? h.currentPrice ?? h.avgBuyPrice
      const effectiveValue = livePrice != null
        ? livePrice * h.quantity
        : (h.currentValue || effectivePrice * h.quantity)
      const effectivePnl = livePrice != null
        ? (livePrice - h.avgBuyPrice) * h.quantity
        : (h.pnl || effectiveValue - h.investedValue)
      const effectivePnlPct = livePrice != null
        ? (h.avgBuyPrice > 0 ? ((livePrice - h.avgBuyPrice) / h.avgBuyPrice) * 100 : 0)
        : (h.pnlPercent || (h.investedValue > 0 ? ((effectiveValue - h.investedValue) / h.investedValue) * 100 : 0))
      return {
        ...h,
        currentPrice: effectivePrice,
        currentValue: effectiveValue,
        pnl: effectivePnl,
        pnlPercent: effectivePnlPct,
        verdict: live?.verdict || null,
      }
    })
    const totalInvested = enriched.reduce((s, h) => s + h.investedValue, 0)
    const totalCurrent = enriched.reduce((s, h) => s + h.currentValue, 0)
    const withAlloc = enriched.map(h => ({ ...h, allocationPercent: totalCurrent > 0 ? (h.currentValue / totalCurrent) * 100 : 0 }))
    const portfolio = {
      id: Date.now().toString(),
      name: `${BROKER_INFO[preview.broker]?.name || 'My'} Portfolio`,
      broker: preview.broker,
      importedAt: new Date().toISOString(),
      holdings: withAlloc,
      totalInvestedCr: totalInvested / 1e7,
      currentValueCr: totalCurrent / 1e7,
      totalPnL: totalCurrent - totalInvested,
      totalPnLPercent: totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0,
    }
    onImport(portfolio)
    setPreview(null)
  }

  return (
    <div className="bg-card border border-subtle rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-primary">Import Portfolio</h2>

      {/* Broker instructions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {Object.entries(BROKER_INFO).map(([key, info]) => (
          <div key={key} className="bg-elevated border border-subtle rounded-lg p-3">
            <p className="text-xs font-bold" style={{ color: info.color }}>{info.name}</p>
            <p className="text-[10px] text-faded mt-1 leading-snug">{info.instructions}</p>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          dragging ? 'border-saffron-500 bg-saffron-500/5' : 'border-subtle hover:border-muted hover:bg-elevated/50'
        )}
        onClick={() => document.getElementById('csv-upload').click()}
      >
        <Upload size={28} className={clsx('mx-auto mb-2', dragging ? 'text-saffron-500' : 'text-faded')} />
        <p className="text-sm font-medium text-secondary">
          {dragging ? 'Drop CSV here' : 'Drag & drop CSV or click to browse'}
        </p>
        <p className="text-xs text-faded mt-1">Supports Groww, Zerodha & generic CSV formats</p>
        <input id="csv-upload" type="file" accept=".csv" className="hidden"
          onChange={e => processFile(e.target.files[0])} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-bear bg-bear/10 border border-bear/20 rounded-lg px-3 py-2">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={15} className="text-bull" />
              <span className="text-sm font-semibold text-primary">{preview.holdings.length} holdings found</span>
              <span className="text-xs text-faded">via {BROKER_INFO[preview.broker]?.name}</span>
            </div>
            <button onClick={() => setPreview(null)} className="text-xs text-secondary hover:text-bear">Discard</button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {preview.holdings.map((h, i) => (
              <div key={i} className="flex items-center justify-between bg-elevated rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-primary w-24">{h.symbol}</span>
                <span className="text-xs text-secondary">×{h.quantity}</span>
                <span className="text-xs font-mono text-primary">{formatINR(h.avgBuyPrice)} avg</span>
                <span className={clsx('text-xs font-mono font-semibold', h.pnlPercent >= 0 ? 'text-bull' : 'text-bear')}>
                  {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent?.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <button onClick={handleConfirmImport} className="btn-primary w-full text-sm">
            Import {preview.holdings.length} Holdings
          </button>
        </motion.div>
      )}
    </div>
  )
}

const HoldingRow = ({ holding }) => {
  const [expanded, setExpanded] = useState(false)
  const isPnlPos = holding.pnl >= 0

  return (
    <>
      <tr
        className="border-b border-subtle hover:bg-elevated/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-saffron-500/20 flex items-center justify-center text-[10px] font-bold text-saffron-500 flex-shrink-0">
              {(holding.symbol || '').slice(0, 2)}
            </div>
            <div>
              <p className="text-xs font-bold text-primary">{holding.symbol}</p>
              <p className="text-[10px] text-faded truncate max-w-[120px]">{holding.name}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs font-mono text-secondary text-center">{holding.quantity}</td>
        <td className="px-4 py-3 text-xs font-mono text-secondary text-right">{formatINR(holding.avgBuyPrice)}</td>
        <td className="px-4 py-3 text-xs font-mono text-primary text-right font-semibold">{formatINR(holding.currentPrice)}</td>
        <td className="px-4 py-3 text-xs font-mono text-right">
          <p className="text-primary font-semibold">{formatINR(holding.currentValue, true)}</p>
        </td>
        <td className="px-4 py-3 text-right">
          <p className={clsx('text-xs font-mono font-semibold', isPnlPos ? 'text-bull' : 'text-bear')}>
            {isPnlPos ? '+' : ''}{formatINR(holding.pnl, true)}
          </p>
          <p className={clsx('text-[10px] font-semibold', isPnlPos ? 'text-bull' : 'text-bear')}>
            {formatPercent(holding.pnlPercent)}
          </p>
        </td>
        <td className="px-4 py-3 text-center">
          {holding.verdict && <VerdictBadge verdict={holding.verdict.action} size="xs" />}
        </td>
        <td className="px-4 py-3 text-center">
          {expanded ? <ChevronUp size={13} className="text-faded mx-auto" /> : <ChevronDown size={13} className="text-faded mx-auto" />}
        </td>
      </tr>
      {expanded && holding.verdict && (
        <tr className="bg-elevated/30">
          <td colSpan={8} className="px-6 py-3">
            <div className="flex flex-wrap gap-4 text-xs">
              <div><span className="text-faded">Target: </span><span className="font-mono font-semibold text-primary">{formatINR(holding.verdict.targetPrice)}</span></div>
              <div><span className="text-faded">Stop Loss: </span><span className="font-mono font-semibold text-primary">{formatINR(holding.verdict.stopLoss)}</span></div>
              <div><span className="text-faded">Confidence: </span><span className="font-semibold text-primary">{holding.verdict.confidence}%</span></div>
              <div className="flex-1"><span className="text-faded">Reason: </span><span className="text-secondary">{holding.verdict.reasoning?.[0]?.summary}</span></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export const Portfolio = () => {
  const { portfolios, activePortfolioId, addPortfolio, removePortfolio, setActivePortfolio } = usePortfolioStore()
  const { addToast } = useUIStore()
  const [recoTab, setRecoTab] = useState('weekly')
  const [showImport, setShowImport] = useState(portfolios.length === 0)

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0]

  const handleImport = (portfolio) => {
    addPortfolio(portfolio)
    setShowImport(false)
    addToast({ type: 'success', title: 'Portfolio Imported!', message: `${portfolio.holdings.length} holdings added.` })
  }

  const recommendations = activePortfolio
    ? computePortfolioRecommendations(activePortfolio.holdings, recoTab)
    : []

  const RECO_TABS = ['daily', 'weekly', 'monthly', 'yearly']
  const URGENCY_COLORS = { high: 'border-bear/20 bg-bear/5', medium: 'border-caution/20 bg-caution/5', low: 'border-subtle bg-elevated/30' }
  const ACTION_COLORS = {
    EXIT: 'bg-bear/10 text-bear border-bear/20',
    ADD: 'bg-bull/10 text-bull border-bull/20',
    REDUCE: 'bg-caution/10 text-caution border-caution/20',
    HOLD: 'bg-muted text-secondary border-subtle',
    REBALANCE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }

  // Sector allocation for pie
  const allocationData = activePortfolio?.holdings?.reduce((acc, h) => {
    const sector = STOCKS.find(s => s.symbol === h.symbol)?.sector || 'Other'
    const existing = acc.find(a => a.name === sector)
    if (existing) existing.value += h.currentValue || 0
    else acc.push({ name: sector, value: h.currentValue || 0 })
    return acc
  }, []) || []

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Portfolio</h1>
          <p className="text-sm text-secondary mt-0.5">Analyse and optimise your holdings</p>
        </div>
        <div className="flex items-center gap-2">
          {portfolios.length > 0 && (
            <button onClick={() => setShowImport(s => !s)} className="btn-ghost text-sm flex items-center gap-1.5">
              <Plus size={14} /> Import Another
            </button>
          )}
        </div>
      </div>

      {/* Import */}
      {(showImport || portfolios.length === 0) && (
        <ImportSection onImport={handleImport} />
      )}

      {/* No portfolio */}
      {portfolios.length === 0 && !showImport && (
        <div className="text-center py-16 text-secondary">
          <Upload size={40} className="mx-auto mb-3 text-faded" />
          <p className="font-semibold">No portfolio yet</p>
          <p className="text-sm text-faded mt-1">Import your Groww or Zerodha CSV to get started</p>
          <button onClick={() => setShowImport(true)} className="btn-primary mt-4 text-sm">
            Import Portfolio
          </button>
        </div>
      )}

      {/* Active portfolio */}
      {activePortfolio && (
        <>
          {/* Portfolio switcher */}
          {portfolios.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {portfolios.map(p => (
                <button key={p.id} onClick={() => setActivePortfolio(p.id)}
                  className={clsx('text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors',
                    p.id === activePortfolioId ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:text-primary'
                  )}>
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Invested', value: formatINR(activePortfolio.holdings?.reduce((s, h) => s + h.investedValue, 0) || 0, true) },
              { label: 'Current Value', value: formatINR(activePortfolio.holdings?.reduce((s, h) => s + h.currentValue, 0) || 0, true) },
              {
                label: 'Total P&L',
                value: formatINR(activePortfolio.totalPnL || 0, true),
                color: (activePortfolio.totalPnL || 0) >= 0 ? 'text-bull' : 'text-bear'
              },
              {
                label: 'P&L %',
                value: formatPercent(activePortfolio.totalPnLPercent || 0),
                color: (activePortfolio.totalPnLPercent || 0) >= 0 ? 'text-bull' : 'text-bear'
              },
            ].map(item => (
              <div key={item.label} className="bg-card border border-subtle rounded-xl p-4">
                <p className="text-xs text-faded mb-1">{item.label}</p>
                <p className={clsx('text-xl font-bold font-mono', item.color || 'text-primary')}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Holdings table + allocation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Table */}
            <div className="lg:col-span-2 bg-card border border-subtle rounded-xl overflow-hidden">
              <div className="p-4 border-b border-subtle">
                <h2 className="text-sm font-semibold text-primary">Holdings ({activePortfolio.holdings?.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-subtle">
                      {['Stock', 'Qty', 'Avg Price', 'CMP', 'Value', 'P&L', 'Verdict', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-semibold text-faded text-left first:text-left text-right last:text-center">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activePortfolio.holdings || []).map((h, i) => <HoldingRow key={i} holding={h} />)}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Allocation pie */}
            <div className="space-y-4">
              {allocationData.length > 0 && (
                <div className="bg-card border border-subtle rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-primary mb-3">Sector Allocation</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={allocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                        {allocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#1A1A26', border: '1px solid #2A2A3E', borderRadius: '8px', fontSize: 11 }}
                        formatter={(v) => [formatINR(v, true)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {allocationData.slice(0, 6).map((item, i) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-[10px] text-secondary truncate">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-card border border-subtle rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-primary">AI Recommendations</h2>
              <div className="flex gap-1">
                {RECO_TABS.map(tab => (
                  <button key={tab} onClick={() => setRecoTab(tab)}
                    className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors border',
                      recoTab === tab ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:text-primary'
                    )}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recommendations.slice(0, 6).map((reco, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={clsx('border rounded-lg p-3', URGENCY_COLORS[reco.urgency])}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary">{reco.symbol}</span>
                        <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-md border font-bold', ACTION_COLORS[reco.type])}>{reco.type}</span>
                      </div>
                      <p className="text-[10px] text-faded mt-1 leading-snug">{reco.reason}</p>
                    </div>
                    <span className={clsx('text-[9px] font-semibold uppercase flex-shrink-0', { high: 'text-bear', medium: 'text-caution', low: 'text-secondary' }[reco.urgency])}>
                      {reco.urgency}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
