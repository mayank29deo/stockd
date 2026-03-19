import { useState } from 'react'
import { Settings2, Bell, Database, Palette, Info } from 'lucide-react'
import { motion } from 'framer-motion'

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`w-10 h-5 rounded-full transition-colors duration-200 relative ${checked ? 'bg-saffron-500' : 'bg-muted'}`}
  >
    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
)

export const Settings = () => {
  const [settings, setSettings] = useState({
    defaultExchange: 'NSE',
    defaultTimeHorizon: 'medium',
    notifications: true,
    priceAlerts: true,
    verdictAlerts: false,
    compactNumbers: true,
    showInsiderBadge: true,
    dataRefreshMins: 5,
  })

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        <p className="text-sm text-secondary mt-1">Customise your Stockd experience</p>
      </div>

      {/* Preferences */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-subtle rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
          <Settings2 size={15} /> Preferences
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-primary">Default Exchange</p>
            <p className="text-xs text-faded">Preferred exchange for stock lookup</p>
          </div>
          <div className="flex gap-1.5">
            {['NSE', 'BSE'].map(ex => (
              <button key={ex} onClick={() => set('defaultExchange', ex)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${settings.defaultExchange === ex ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:text-primary'}`}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-subtle">
          <div>
            <p className="text-sm text-primary">Time Horizon</p>
            <p className="text-xs text-faded">Default recommendation horizon</p>
          </div>
          <div className="flex gap-1.5">
            {['short', 'medium', 'long'].map(h => (
              <button key={h} onClick={() => set('defaultTimeHorizon', h)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors capitalize ${settings.defaultTimeHorizon === h ? 'bg-saffron-500/15 text-saffron-500 border-saffron-500/30' : 'border-subtle text-secondary hover:text-primary'}`}>
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-subtle">
          <div>
            <p className="text-sm text-primary">Compact Numbers</p>
            <p className="text-xs text-faded">Show ₹12.4L instead of ₹12,40,000</p>
          </div>
          <Toggle checked={settings.compactNumbers} onChange={v => set('compactNumbers', v)} />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-subtle">
          <div>
            <p className="text-sm text-primary">Show Insider Badge</p>
            <p className="text-xs text-faded">Highlight stocks with insider buying</p>
          </div>
          <Toggle checked={settings.showInsiderBadge} onChange={v => set('showInsiderBadge', v)} />
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-subtle rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
          <Bell size={15} /> Notifications
        </div>

        {[
          { key: 'notifications', label: 'Push Notifications', desc: 'Enable in-app notifications' },
          { key: 'priceAlerts', label: 'Price Alerts', desc: 'Notify when stock hits target/stop' },
          { key: 'verdictAlerts', label: 'Verdict Changes', desc: 'Alert when BUY/SELL/HOLD changes' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between pt-3 border-t border-subtle first:border-0 first:pt-0">
            <div>
              <p className="text-sm text-primary">{item.label}</p>
              <p className="text-xs text-faded">{item.desc}</p>
            </div>
            <Toggle checked={settings[item.key]} onChange={v => set(item.key, v)} />
          </div>
        ))}
      </motion.div>

      {/* Broker guide */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card border border-subtle rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
          <Database size={15} /> Portfolio Import Guide
        </div>
        <div className="space-y-3">
          {[
            {
              broker: 'Groww',
              color: '#00D09C',
              steps: ['Open Groww app/web', 'Go to Stocks → Portfolio', 'Tap 3-dot menu → Export', 'Download CSV → Upload here'],
            },
            {
              broker: 'Zerodha Kite',
              color: '#387ED1',
              steps: ['Log in to Kite', 'Go to Portfolio → Holdings', 'Click the download icon (top right)', 'Download CSV → Upload here'],
            },
            {
              broker: 'Generic CSV',
              color: '#9999B3',
              steps: ['Ensure columns: Symbol, Quantity, Avg Price', 'Optional: Current Price, P&L', 'Upload to Portfolio page'],
            },
          ].map(item => (
            <div key={item.broker} className="bg-elevated rounded-lg p-3">
              <p className="text-xs font-bold mb-2" style={{ color: item.color }}>{item.broker}</p>
              <ol className="space-y-0.5">
                {item.steps.map((s, i) => (
                  <li key={i} className="text-[10px] text-faded flex gap-1.5">
                    <span className="text-faded font-mono">{i + 1}.</span> {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </motion.div>

      {/* App info */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-subtle rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-3">
          <Info size={15} /> About Stockd
        </div>
        <div className="space-y-2 text-xs text-faded">
          <div className="flex justify-between"><span>Version</span><span className="text-primary">1.0.0</span></div>
          <div className="flex justify-between"><span>Data Source</span><span className="text-primary">NSE / BSE</span></div>
          <div className="flex justify-between"><span>Market Coverage</span><span className="text-primary">Nifty50 + Midcap</span></div>
          <div className="flex justify-between"><span>AI Model</span><span className="text-primary">Multi-factor Scoring</span></div>
          <p className="pt-2 border-t border-subtle text-[10px] leading-relaxed">
            ⚠️ Disclaimer: Stockd provides educational analysis only. Not SEBI-registered. All recommendations are algorithmic and should not be considered as financial advice. Always consult a qualified financial advisor before investing.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
