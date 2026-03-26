import os
from dotenv import load_dotenv

load_dotenv()

# ── API Keys — set these in your .env file ────────────────────────────────────
NEWS_API_KEY       = os.getenv("NEWS_API_KEY", "")
MARKETAUX_API_KEY  = os.getenv("MARKETAUX_API_KEY", "")

# RapidAPI — Yahoo Finance proxy that works from cloud servers.
# Same data as yfinance, no IP blocking. ~$10/month (Basic plan).
# Sign up: https://rapidapi.com/apidojo/api/yahoo-finance1
RAPIDAPI_KEY       = os.getenv("RAPIDAPI_KEY", "")

# Twelve Data — free plan only used for macro tickers (INR/USD, Crude, Gold).
# Do NOT upgrade for NSE stocks — use RapidAPI instead.
TWELVEDATA_API_KEY = os.getenv("TWELVEDATA_API_KEY", "")

# EODHD — best-in-class fundamentals for NSE/BSE (~$19/month).
# Add this later for richer P/E, ROE, earnings data.
# Get your key at https://eodhd.com
EODHD_API_KEY      = os.getenv("EODHD_API_KEY", "")

# Cache settings (seconds)
# Tuned to minimise RapidAPI call count — SQLite snapshot serves stale data.
QUOTE_CACHE_TTL       = 60        # 1 min   — live prices (NSE API, free)
HISTORY_CACHE_TTL     = 3600      # 1 hour  — OHLCV history (paid API calls)
FUNDAMENTAL_CACHE_TTL = 86400     # 24 hours — P/E, ROE etc. don't change daily
INDEX_CACHE_TTL       = 60        # 1 min   — index values (NSE API, free)
NEWS_CACHE_TTL        = 600       # 10 min  — news
SCREENER_CACHE_TTL    = 3600      # 1 hour  — screener dataset (paid API calls)

# NSE suffix for Yahoo Finance
NSE_SUFFIX = ".NS"
BSE_SUFFIX = ".BO"

# NSE symbol → Yahoo Finance ticker override.
# Use this when a company has rebranded, merged, or uses a different YF ticker.
# Key: NSE symbol users/CSVs use.  Value: exact Yahoo Finance ticker (with suffix).
SYMBOL_ALIAS_MAP = {
    "ZOMATO":      "ETERNAL.NS",      # ZOMATO Ltd rebranded → Eternal Ltd (Feb 2025)
    "ETERNAL":     "ETERNAL.NS",      # in case users search by new name
    "BAJAJ-AUTO":  "BAJAJ-AUTO.NS",   # hyphen preserved — Yahoo Finance accepts this
    "M&M":         "M%26M.NS",        # ampersand must be URL-encoded
}

# NIFTY 50 stocks (symbol → Yahoo Finance ticker)
NIFTY50_SYMBOLS = [
    "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK",
    "HINDUNILVR","ITC","SBIN","BHARTIARTL","KOTAKBANK",
    "LT","AXISBANK","ASIANPAINT","MARUTI","TITAN",
    "SUNPHARMA","ULTRACEMCO","WIPRO","ONGC","NTPC",
    "POWERGRID","NESTLEIND","TECHM","HCLTECH","BAJFINANCE",
    "BAJAJFINSV","ADANIENT","ADANIPORTS","TATASTEEL","TATAMOTORS",
    "JSWSTEEL","COALINDIA","DIVISLAB","CIPLA","DRREDDY",
    "EICHERMOT","GRASIM","HEROMOTOCO","HINDALCO","INDUSINDBK",
    "APOLLOHOSP","BPCL","BRITANNIA","LTIM","M&M",
    "SBILIFE","SHRIRAMFIN","TATACONSUM","TRENT","UPL",
]

INDICES = {
    "NIFTY50":   "^NSEI",
    "SENSEX":    "^BSESN",
    "BANKNIFTY": "^NSEBANK",
    "NIFTYIT":   "^CNXIT",
    "NIFTYMID":  "^NSEMDCP50",
}

SECTOR_MAP = {
    "RELIANCE":"Energy","TCS":"IT","HDFCBANK":"Banking","INFY":"IT",
    "ICICIBANK":"Banking","HINDUNILVR":"FMCG","ITC":"FMCG","SBIN":"Banking",
    "BHARTIARTL":"Telecom","KOTAKBANK":"Banking","LT":"Infra","AXISBANK":"Banking",
    "ASIANPAINT":"Paint","MARUTI":"Auto","TITAN":"Consumer","SUNPHARMA":"Pharma",
    "ULTRACEMCO":"Cement","WIPRO":"IT","ONGC":"Energy","NTPC":"Power",
    "POWERGRID":"Power","NESTLEIND":"FMCG","TECHM":"IT","HCLTECH":"IT",
    "BAJFINANCE":"NBFC","BAJAJFINSV":"NBFC","ADANIENT":"Conglomerate",
    "ADANIPORTS":"Infra","TATASTEEL":"Metals","TATAMOTORS":"Auto",
    "JSWSTEEL":"Metals","COALINDIA":"Energy","DIVISLAB":"Pharma","CIPLA":"Pharma",
    "DRREDDY":"Pharma","EICHERMOT":"Auto","GRASIM":"Cement","HEROMOTOCO":"Auto",
    "HINDALCO":"Metals","INDUSINDBK":"Banking","APOLLOHOSP":"Healthcare",
    "BPCL":"Energy","BRITANNIA":"FMCG","LTIM":"IT","M&M":"Auto",
    "SBILIFE":"Insurance","SHRIRAMFIN":"NBFC","TATACONSUM":"FMCG",
    "TRENT":"Retail","UPL":"Chemicals",
    # New-age / rebranded
    "ZOMATO":"Internet","ETERNAL":"Internet","PAYTM":"Fintech","NYKAA":"Retail",
    "POLICYBZR":"Fintech","DELHIVERY":"Logistics","IRCTC":"Travel",
    "IRFC":"NBFC","RVNL":"Infra","HAL":"Defence","BEL":"Defence",
}
