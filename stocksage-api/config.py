import os
from dotenv import load_dotenv

load_dotenv()

# API Keys (add to .env file)
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
MARKETAUX_API_KEY = os.getenv("MARKETAUX_API_KEY", "")

# Cache settings (seconds)
QUOTE_CACHE_TTL      = 60        # 1 min  — live prices
HISTORY_CACHE_TTL    = 300       # 5 min  — price history
FUNDAMENTAL_CACHE_TTL= 3600      # 1 hour — fundamentals don't change fast
INDEX_CACHE_TTL      = 60        # 1 min  — index values
NEWS_CACHE_TTL       = 600       # 10 min — news
SCREENER_CACHE_TTL   = 180       # 3 min

# NSE suffix for Yahoo Finance
NSE_SUFFIX = ".NS"
BSE_SUFFIX = ".BO"

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
}
