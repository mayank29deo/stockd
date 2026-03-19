import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts'

export const MiniSparkline = ({ data, positive, height = 48 }) => {
  const color = positive ? '#00C897' : '#FF4757'
  const sliced = data?.slice(-30) || []
  const chartData = sliced.map(d => ({ v: d.close }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sg-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${color.slice(1)})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
