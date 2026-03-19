import Papa from 'papaparse'

// Map Groww CSV columns to our Holding schema
const GROWW_COLUMN_MAP = {
  'Stock Name': 'name',
  'Ticker': 'symbol',
  'Quantity': 'quantity',
  'Average Price': 'avgBuyPrice',
  'Current Price': 'currentPrice',
  'Invested Value': 'investedValue',
  'Current Value': 'currentValue',
  'Total Returns': 'pnl',
  'Total Returns %': 'pnlPercent',
}

// Map Zerodha Kite CSV columns
const ZERODHA_COLUMN_MAP = {
  'Instrument': 'symbol',
  'Qty': 'quantity',
  'Avg. cost': 'avgBuyPrice',
  'LTP': 'currentPrice',
  'Cur. val': 'currentValue',
  'P&L': 'pnl',
  'Net chg.': 'pnlPercent',
}

const cleanNumber = (val) => {
  if (!val) return 0
  const str = String(val).replace(/[₹,\s%]/g, '').trim()
  return parseFloat(str) || 0
}

const normalizeHolding = (raw, broker) => {
  const symbol = (raw.symbol || raw.name || '').replace(/\.NS$|\.BO$/, '').toUpperCase().trim()
  const qty = cleanNumber(raw.quantity)
  const avgPrice = cleanNumber(raw.avgBuyPrice)
  const curPrice = cleanNumber(raw.currentPrice)
  const invested = cleanNumber(raw.investedValue) || qty * avgPrice
  const current = cleanNumber(raw.currentValue) || qty * curPrice
  const pnl = cleanNumber(raw.pnl) || current - invested
  const pnlPct = cleanNumber(raw.pnlPercent) || (invested > 0 ? ((current - invested) / invested) * 100 : 0)

  return {
    stockId: symbol,
    symbol,
    name: raw.name || symbol,
    quantity: qty,
    avgBuyPrice: avgPrice,
    currentPrice: curPrice || avgPrice,
    investedValue: invested,
    currentValue: current,
    pnl,
    pnlPercent: pnlPct,
    dayChange: 0,
    dayChangePercent: 0,
    allocationPercent: 0,
    broker,
    valid: !!symbol && qty > 0,
  }
}

const mapColumns = (row, colMap) => {
  const mapped = {}
  Object.entries(colMap).forEach(([csvCol, schemaKey]) => {
    if (row[csvCol] !== undefined) mapped[schemaKey] = row[csvCol]
  })
  return mapped
}

export const parseGrowwCSV = (csvString) => {
  const { data, errors } = Papa.parse(csvString, { header: true, skipEmptyLines: true })
  if (errors.length > 0) return { holdings: [], errors: errors.map(e => e.message) }
  const holdings = data
    .map(row => normalizeHolding(mapColumns(row, GROWW_COLUMN_MAP), 'groww'))
    .filter(h => h.valid)
  return { holdings, errors: [] }
}

export const parseZerodhaCSV = (csvString) => {
  // Zerodha sometimes has header rows with metadata, skip until we find "Instrument"
  const lines = csvString.split('\n')
  const headerIndex = lines.findIndex(l => l.includes('Instrument') || l.includes('Qty'))
  const cleanCsv = headerIndex >= 0 ? lines.slice(headerIndex).join('\n') : csvString
  const { data, errors } = Papa.parse(cleanCsv, { header: true, skipEmptyLines: true })
  if (errors.length > 0) return { holdings: [], errors: errors.map(e => e.message) }
  const holdings = data
    .map(row => normalizeHolding(mapColumns(row, ZERODHA_COLUMN_MAP), 'zerodha'))
    .filter(h => h.valid)
  return { holdings, errors: [] }
}

export const parseGenericCSV = (csvString) => {
  const { data, errors } = Papa.parse(csvString, { header: true, skipEmptyLines: true })
  if (errors.length > 0) return { holdings: [], errors: errors.map(e => e.message) }
  const holdings = data.map(row => {
    const rawSymbol = row['Symbol'] || row['Ticker'] || row['Stock'] || row['ISIN'] || ''
    const rawName = row['Name'] || row['Company'] || rawSymbol
    return normalizeHolding({
      symbol: rawSymbol,
      name: rawName,
      quantity: row['Qty'] || row['Quantity'] || row['Units'] || 0,
      avgBuyPrice: row['Avg Price'] || row['Buy Price'] || row['Cost'] || 0,
      currentPrice: row['CMP'] || row['LTP'] || row['Current Price'] || 0,
      investedValue: row['Invested'] || row['Cost Value'] || 0,
      currentValue: row['Current Value'] || row['Market Value'] || 0,
      pnl: row['P&L'] || row['Gain/Loss'] || 0,
      pnlPercent: row['Return %'] || row['P&L %'] || 0,
    }, 'other')
  }).filter(h => h.valid)
  return { holdings, errors: [] }
}

export const detectBroker = (csvString) => {
  if (csvString.includes('Groww') || csvString.includes('Average Price') && csvString.includes('Total Returns')) return 'groww'
  if (csvString.includes('Avg. cost') || csvString.includes('Zerodha')) return 'zerodha'
  return 'generic'
}

export const parseCSV = (csvString) => {
  const broker = detectBroker(csvString)
  if (broker === 'groww') return { ...parseGrowwCSV(csvString), broker }
  if (broker === 'zerodha') return { ...parseZerodhaCSV(csvString), broker }
  return { ...parseGenericCSV(csvString), broker }
}
