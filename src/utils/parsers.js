import Papa from 'papaparse'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

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
  // Check zerodha_statement FIRST — its files contain the word "Zerodha" in metadata
  if (csvString.includes('Quantity Available') && csvString.includes('Unrealized P&L')) return 'zerodha_statement'
  if (csvString.includes('Groww') || (csvString.includes('Average Price') && csvString.includes('Total Returns'))) return 'groww'
  if (csvString.includes('Avg. cost') || csvString.includes('Zerodha')) return 'zerodha'
  return 'generic'
}

export const parseZerodhaStatementCSV = (csvString) => {
  const lines = csvString.replace(/^\uFEFF/, '').split('\n')
  const headerIndex = lines.findIndex(l => l.includes('Quantity Available') && l.includes('Average Price'))
  if (headerIndex < 0) return { holdings: [], errors: ['Could not find holdings data in file'] }
  const cleanCsv = lines.slice(headerIndex).join('\n')
  const { data, errors } = Papa.parse(cleanCsv, { header: true, skipEmptyLines: true })
  if (errors.length > 0) return { holdings: [], errors: errors.map(e => e.message) }
  const holdings = data.map(row => {
    const symbol = (row['Symbol'] || '').replace(/\.NS$|\.BO$/, '').toUpperCase().trim()
    const qty = cleanNumber(row['Quantity Available'])
    const avgPrice = cleanNumber(row['Average Price'])
    const curPrice = cleanNumber(row['Previous Closing Price'])
    const pnl = cleanNumber(row['Unrealized P&L'])
    const pnlPct = cleanNumber(row['Unrealized P&L Pct.'])
    const invested = qty * avgPrice
    const current = qty * curPrice
    return normalizeHolding({
      symbol, name: symbol,
      quantity: qty, avgBuyPrice: avgPrice, currentPrice: curPrice,
      investedValue: invested, currentValue: current, pnl, pnlPercent: pnlPct,
    }, 'zerodha')
  }).filter(h => h.valid)
  return { holdings, errors: [] }
}

export const parseCSV = (csvString) => {
  const broker = detectBroker(csvString)
  if (broker === 'groww') return { ...parseGrowwCSV(csvString), broker }
  if (broker === 'zerodha') return { ...parseZerodhaCSV(csvString), broker }
  if (broker === 'zerodha_statement') return { ...parseZerodhaStatementCSV(csvString), broker: 'zerodha' }
  return { ...parseGenericCSV(csvString), broker }
}

// ─── XML Parsers ─────────────────────────────────────────────────────────────

// CDSL Consolidated Account Statement (CAS) — most common Indian demat format
const parseCDSLXML = (doc) => {
  // CDSL CAS uses ISINDetail elements with attributes
  const isinNodes = doc.querySelectorAll('ISINDetail')
  if (isinNodes.length === 0) return null

  const holdings = []
  isinNodes.forEach(node => {
    const symbol = (node.getAttribute('Symbol') || node.getAttribute('EQName') || '').replace(/\.NS$|\.BO$/, '').toUpperCase().trim()
    const isin = node.getAttribute('ISIN') || ''
    const qty = cleanNumber(node.getAttribute('ClosingBalance') || node.getAttribute('Quantity') || '0')
    const avgPrice = cleanNumber(node.getAttribute('ValueAtCost') || node.getAttribute('AvgCostPrice') || '0')
    const curPrice = cleanNumber(node.getAttribute('MarketPrice') || node.getAttribute('NAV') || '0')
    const invested = cleanNumber(node.getAttribute('ValueAtCost') || '0') || qty * avgPrice
    const current = cleanNumber(node.getAttribute('MarketValue') || node.getAttribute('CurrentValue') || '0') || qty * curPrice

    // Skip non-equity / demat mutual funds if name contains 'LIQUID' or 'DEBT'
    holdings.push(normalizeHolding({
      symbol: symbol || isin,
      name: node.getAttribute('EQName') || node.getAttribute('SchemeName') || symbol,
      quantity: qty,
      avgBuyPrice: avgPrice,
      currentPrice: curPrice || avgPrice,
      investedValue: invested,
      currentValue: current,
      pnl: current - invested,
      pnlPercent: invested > 0 ? ((current - invested) / invested) * 100 : 0,
    }, 'cdsl'))
  })
  return holdings.filter(h => h.valid).length > 0
    ? { holdings: holdings.filter(h => h.valid), errors: [] }
    : null
}

// NSDL CAS uses EquityHolding / EquityDetails tags
const parseNSDLXML = (doc) => {
  const nodes = doc.querySelectorAll('EquityHolding, EquityDetails, Holding')
  if (nodes.length === 0) return null

  const holdings = []
  nodes.forEach(node => {
    const getAttrOrText = (names) => {
      for (const n of names) {
        const val = node.getAttribute(n) || node.querySelector(n)?.textContent
        if (val) return val
      }
      return ''
    }
    const symbol = getAttrOrText(['Symbol', 'ISIN', 'SecurityName']).replace(/\.NS$|\.BO$/, '').toUpperCase().trim()
    const qty = cleanNumber(getAttrOrText(['Balance', 'Quantity', 'Units']))
    const avgPrice = cleanNumber(getAttrOrText(['AverageCost', 'AvgCost', 'CostPrice']))
    const curPrice = cleanNumber(getAttrOrText(['MarketPrice', 'LTP', 'NAV']))
    holdings.push(normalizeHolding({
      symbol,
      name: getAttrOrText(['SecurityName', 'CompanyName', 'Symbol']) || symbol,
      quantity: qty,
      avgBuyPrice: avgPrice,
      currentPrice: curPrice || avgPrice,
      investedValue: qty * avgPrice,
      currentValue: qty * (curPrice || avgPrice),
    }, 'nsdl'))
  })
  return holdings.filter(h => h.valid).length > 0
    ? { holdings: holdings.filter(h => h.valid), errors: [] }
    : null
}

// Generic XML — try to find any repeating element that has stock-like fields
const parseGenericXML = (doc) => {
  const STOCK_ATTRS = ['symbol', 'ticker', 'isin', 'quantity', 'qty', 'shares', 'avgprice', 'price', 'ltp']
  const allTags = Array.from(doc.querySelectorAll('*'))

  // Find first element whose attributes/children resemble a holding row
  const getScore = (el) => {
    const text = (el.getAttribute ? Array.from(el.attributes).map(a => a.name.toLowerCase()).join(' ') : '') +
      ' ' + el.textContent.toLowerCase().slice(0, 200)
    return STOCK_ATTRS.filter(k => text.includes(k)).length
  }

  // Group elements by tag name, find the tag with highest collective stock score
  const tagCounts = {}
  allTags.forEach(el => {
    const tag = el.tagName
    tagCounts[tag] = (tagCounts[tag] || 0) + getScore(el)
  })
  const bestTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!bestTag || tagCounts[bestTag] < 3) return null

  const rows = doc.querySelectorAll(bestTag)
  const holdings = []
  rows.forEach(row => {
    const get = (...names) => {
      for (const n of names) {
        const val = row.getAttribute(n) ||
          row.querySelector(n)?.textContent?.trim() ||
          row.querySelector(`[name="${n}"]`)?.textContent?.trim()
        if (val) return val
      }
      return ''
    }
    const symbol = get('Symbol', 'Ticker', 'ISIN', 'symbol', 'ticker').replace(/\.NS$|\.BO$/, '').toUpperCase().trim()
    const qty = cleanNumber(get('Quantity', 'Qty', 'Units', 'Shares', 'Balance', 'quantity', 'qty'))
    const avgPrice = cleanNumber(get('AvgPrice', 'AveragePrice', 'CostPrice', 'avgprice', 'avg_price'))
    const curPrice = cleanNumber(get('LTP', 'CMP', 'Price', 'MarketPrice', 'ltp', 'cmp'))
    holdings.push(normalizeHolding({ symbol, name: symbol, quantity: qty, avgBuyPrice: avgPrice, currentPrice: curPrice || avgPrice }, 'other'))
  })
  return holdings.filter(h => h.valid).length > 0
    ? { holdings: holdings.filter(h => h.valid), errors: [] }
    : null
}

export const parseXML = (xmlString) => {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, 'text/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) return { holdings: [], errors: ['Invalid XML: ' + parseError.textContent.slice(0, 120)] }

    // Try CDSL first (most common), then NSDL, then generic
    const result = parseCDSLXML(doc) || parseNSDLXML(doc) || parseGenericXML(doc)
    if (result) return result

    // Last resort: extract text content and try CSV parse
    const text = doc.documentElement.textContent
    const csvResult = parseCSV(text)
    if (csvResult.holdings.length > 0) return csvResult

    return { holdings: [], errors: ['Could not extract holdings from XML. Supported: CDSL CAS, NSDL CAS, generic XML.'] }
  } catch (e) {
    return { holdings: [], errors: ['XML parse error: ' + e.message] }
  }
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

export const parsePDF = async (arrayBuffer) => {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pageTexts = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      // Group text items by their y-coordinate (same line = same row)
      const lines = {}
      content.items.forEach(item => {
        const y = Math.round(item.transform[5])
        if (!lines[y]) lines[y] = []
        lines[y].push(item.str)
      })
      // Sort lines top→bottom, join items on each line with a tab
      const sorted = Object.keys(lines).sort((a, b) => b - a)
      sorted.forEach(y => pageTexts.push(lines[y].join('\t')))
    }

    const fullText = pageTexts.join('\n')

    // Try to detect broker from the extracted text and parse as CSV-like
    const broker = detectBroker(fullText)

    // Convert tab-delimited lines to CSV and try existing parsers
    const csvLike = fullText
      .split('\n')
      .map(line => line.split('\t').map(c => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const result = parseCSV(csvLike)
    if (result.holdings.length > 0) return { ...result, broker }

    // Fallback: try raw text as CSV (some PDFs embed CSV-formatted data)
    const rawResult = parseCSV(fullText)
    if (rawResult.holdings.length > 0) return rawResult

    return { holdings: [], errors: ['Could not extract holdings from PDF. Try downloading CSV/XML from your broker instead.'] }
  } catch (e) {
    return { holdings: [], errors: ['PDF parse error: ' + e.message] }
  }
}

// ─── Unified file parser (async) ─────────────────────────────────────────────

export const parseFile = (file) => new Promise((resolve) => {
  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'xml') {
    const reader = new FileReader()
    reader.onload = (e) => resolve(parseXML(e.target.result))
    reader.readAsText(file)
    return
  }

  if (ext === 'pdf') {
    const reader = new FileReader()
    reader.onload = async (e) => resolve(await parsePDF(e.target.result))
    reader.readAsArrayBuffer(file)
    return
  }

  // CSV (default)
  const reader = new FileReader()
  reader.onload = (e) => resolve(parseCSV(e.target.result))
  reader.readAsText(file)
})
