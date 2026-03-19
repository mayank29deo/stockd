import { useId } from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'

export const MiniSparkline = ({ data, positive, height = 48 }) => {
  const uid = useId().replace(/:/g, '')
  const color = positive ? '#00C897' : '#FF4757'
  const gradId = `sg-${uid}`
  const sliced = data?.slice(-30) || []
  const chartData = sliced.map(d => ({ v: d.close }))

  if (!chartData.length) return <div style={{ height }} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
