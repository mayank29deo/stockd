import { useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine
} from 'recharts'
import { clsx } from 'clsx'

const RANGES = ['1W', '1M', '3M', '6M', '1Y']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-elevated border border-muted rounded-lg px-3 py-2 text-xs shadow-card-hover">
      <p className="text-secondary mb-1">{label}</p>
      <p className="text-primary font-mono font-semibold">₹{d.close?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
      {d.volume && <p className="text-faded mt-0.5">Vol: {(d.volume / 100000).toFixed(1)}L</p>}
    </div>
  )
}

export const StockChart = ({ priceHistory = [], stockName, isPositive }) => {
  const [range, setRange] = useState('3M')

  const days = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }
  const filtered = priceHistory.slice(-days[range])
  const chartData = filtered.map(d => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  }))

  const color = isPositive ? '#00C897' : '#FF4757'
  const startPrice = chartData[0]?.close || 0
  const endPrice = chartData[chartData.length - 1]?.close || 0
  const totalChange = endPrice - startPrice
  const totalChangePct = startPrice ? ((totalChange / startPrice) * 100).toFixed(2) : '0.00'

  return (
    <div className="space-y-3">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors duration-150',
                range === r ? 'bg-saffron-500/15 text-saffron-500' : 'text-secondary hover:text-primary hover:bg-elevated'
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div className={clsx('text-sm font-semibold font-mono', totalChange >= 0 ? 'text-bull' : 'text-bear')}>
          {totalChange >= 0 ? '+' : ''}₹{totalChange.toFixed(2)} ({totalChange >= 0 ? '+' : ''}{totalChangePct}%)
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#5A5A7A', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#5A5A7A', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={60}
            tickFormatter={v => `₹${(v / 1000).toFixed(1)}K`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={startPrice} stroke="#2A2A3E" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={2}
            fill="url(#chartGrad)"
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#12121A', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
