"""
StockSage API — FastAPI backend
Run: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import quotes, stock_detail, indices, sentiment, screener

app = FastAPI(
    title="StockSage API",
    description="Real-time Indian stock market data, verdicts & analysis",
    version="1.0.0",
)

# CORS — allow the React dev server and any production domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "*",          # tighten in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(quotes.router)
app.include_router(stock_detail.router)
app.include_router(indices.router)
app.include_router(sentiment.router)
app.include_router(screener.router)


@app.get("/")
async def root():
    return {
        "service": "StockSage API",
        "version": "1.0.0",
        "status":  "running",
        "docs":    "/docs",
        "endpoints": [
            "GET  /api/stocks             — All Nifty50 stocks with verdicts",
            "GET  /api/quote/{symbol}     — Single live quote",
            "GET  /api/quotes?symbols=X,Y — Bulk quotes",
            "GET  /api/stock/{symbol}     — Full stock detail",
            "GET  /api/stock/{symbol}/history?period=3m",
            "GET  /api/indices            — Nifty50, Sensex, BankNifty, NiftyIT",
            "GET  /api/sentiment/market   — Fear & Greed + macro",
            "GET  /api/sentiment/geopolitical",
            "GET  /api/screener           — Advanced filtered screener",
            "GET  /api/market/status      — NSE open/closed + IST time",
        ],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
