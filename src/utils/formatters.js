export const formatINR = (value, compact = false) => {
  if (value === null || value === undefined) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (!compact) {
    return `${sign}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(2)}`
}

export const formatCrore = (crores) => {
  if (crores === null || crores === undefined) return '—'
  if (crores >= 100000) return `₹${(crores / 100000).toFixed(2)}L Cr`
  if (crores >= 1000) return `₹${(crores / 1000).toFixed(2)}K Cr`
  return `₹${crores.toFixed(0)} Cr`
}

export const formatChange = (change, percent, showSign = true) => {
  const sign = change >= 0 ? '+' : ''
  return `${showSign ? sign : ''}₹${Math.abs(change).toFixed(2)} (${sign}${percent?.toFixed(2)}%)`
}

export const formatPercent = (value, decimals = 2) => {
  if (value === null || value === undefined) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export const formatVolume = (volume) => {
  if (!volume) return '—'
  if (volume >= 10000000) return `${(volume / 10000000).toFixed(2)}Cr`
  if (volume >= 100000) return `${(volume / 100000).toFixed(2)}L`
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`
  return volume.toString()
}

export const formatDate = (dateStr, short = false) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (short) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatTime = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}

export const getChangeColor = (value) => {
  if (value > 0) return 'text-bull'
  if (value < 0) return 'text-bear'
  return 'text-secondary'
}

export const getVerdictClass = (verdict) => {
  if (verdict === 'BUY') return 'verdict-buy'
  if (verdict === 'SELL') return 'verdict-sell'
  return 'verdict-hold'
}

export const getVerdictColor = (verdict) => {
  if (verdict === 'BUY') return '#00C897'
  if (verdict === 'SELL') return '#FF4757'
  return '#FFB020'
}

export const getSentimentLabel = (score) => {
  if (score >= 60) return { label: 'Very Bullish', color: '#00C897' }
  if (score >= 20) return { label: 'Bullish', color: '#4E9AF1' }
  if (score >= -20) return { label: 'Neutral', color: '#9999B3' }
  if (score >= -60) return { label: 'Bearish', color: '#FFB020' }
  return { label: 'Very Bearish', color: '#FF4757' }
}

export const getFearGreedLabel = (score) => {
  if (score >= 75) return { label: 'Extreme Greed', color: '#FF4757' }
  if (score >= 55) return { label: 'Greed', color: '#FFB020' }
  if (score >= 45) return { label: 'Neutral', color: '#9999B3' }
  if (score >= 25) return { label: 'Fear', color: '#4E9AF1' }
  return { label: 'Extreme Fear', color: '#00C897' }
}
