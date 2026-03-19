import { SECTOR_DATA } from '../../data/mock/stocks'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'

const getHeatColor = (change) => {
  if (change >= 2)   return { bg: '#00C897', bgOpacity: '20', border: '#00C897', borderOpacity: '35', text: '#00C897' }
  if (change >= 0.5) return { bg: '#00C897', bgOpacity: '10', border: '#00C897', borderOpacity: '20', text: '#00C897' }
  if (change >= -0.5)return { bg: '#2A2A3E', bgOpacity: 'FF', border: '#2A2A3E', borderOpacity: 'FF', text: '#9999B3' }
  if (change >= -2)  return { bg: '#FF4757', bgOpacity: '12', border: '#FF4757', borderOpacity: '25', text: '#FF4757' }
  return               { bg: '#FF4757', bgOpacity: '22', border: '#FF4757', borderOpacity: '35', text: '#FF4757' }
}

export const SectorHeatmap = () => (
  <div className="bg-card border border-subtle rounded-xl p-4">
    <h3 className="text-sm font-semibold text-primary mb-3">Sector Heatmap</h3>
    <div className="grid grid-cols-3 gap-2">
      {SECTOR_DATA.map((sector, i) => {
        const colors = getHeatColor(sector.change)
        const isPos = sector.change >= 0
        return (
          <motion.div
            key={sector.name}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-lg p-2.5 cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: `${colors.bg}${colors.bgOpacity}`,
              border: `1px solid ${colors.border}${colors.borderOpacity}`,
            }}
          >
            {/* Sector name */}
            <p className="text-[11px] font-semibold text-primary leading-tight truncate">
              {sector.name}
            </p>
            {/* Change % — on its own line, clearly colored */}
            <p
              className="text-sm font-bold mt-1 leading-none"
              style={{ color: colors.text }}
            >
              {isPos ? '+' : ''}{sector.change.toFixed(2)}%
            </p>
            {/* Stock count */}
            <p className="text-[10px] text-faded mt-1">{sector.stocks} stocks</p>
          </motion.div>
        )
      })}
    </div>
  </div>
)
