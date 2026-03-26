"""
StockSage API — FastAPI backend
Run: uvicorn main:app --reload --port 8000
"""
import pytz
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from routers import quotes, stock_detail, indices, sentiment, screener
from services.snapshot_service import init_db, save_quotes_snapshot, save_indices_snapshot


IST = pytz.timezone("Asia/Kolkata")
_scheduler: BackgroundScheduler | None = None


# ── Daily snapshot job ────────────────────────────────────────────────────────

def _take_daily_snapshot():
    """
    Runs at 15:35 IST on weekdays (5 minutes after NSE close).
    Saves NIFTY50 quotes + indices to SQLite so the app can serve
    D-1 data when the market is closed.
    """
    print("[Snapshot] Taking daily market-close snapshot…")
    try:
        from services.nse_service import get_nifty50_quotes, get_nse_indices

        quotes_data = get_nifty50_quotes()
        if quotes_data:
            save_quotes_snapshot(quotes_data)

        indices_data = get_nse_indices()
        if indices_data:
            save_indices_snapshot(indices_data)

    except Exception as e:
        print(f"[Snapshot] Error during daily snapshot: {e}")


def _startup_snapshot():
    """
    On startup, if the market is currently closed and we have no snapshot
    for today, take one now using whatever data NSE API returns.
    """
    from datetime import datetime, time as dtime
    now_ist = datetime.now(IST)
    is_weekday = now_ist.weekday() < 5
    is_after_close = now_ist.time() >= dtime(15, 35)
    if is_weekday and is_after_close:
        _take_daily_snapshot()


def _prewarm_cache():
    """
    Background job: fetch history + fundamentals for all NIFTY50 stocks
    and all indices once at startup (and once per day at 9:20 AM IST).

    This means:
      - Users always get instant responses (cache hit)
      - RapidAPI calls happen in batch at predictable times
      - Daily call count stays around 105 (50 history + 50 fund + 5 index)
      - Even Basic RapidAPI plan (~500 calls/day) is plenty
    """
    import services.rapidapi_yf_service as ryf
    import services.eodhd_service as eodhd
    import services.yahoo_service as yf_svc
    from services.snapshot_service import save_history_snapshot, save_fundamentals_snapshot
    from config import NIFTY50_SYMBOLS, INDICES

    if not (ryf.available() or eodhd.available()):
        print("[Prewarm] No paid API key — skipping prewarm")
        return

    print(f"[Prewarm] Starting cache prewarm for {len(NIFTY50_SYMBOLS)} stocks + {len(INDICES)} indices…")

    def _fetch_history(sym):
        try:
            if eodhd.available():
                h = eodhd.get_history(sym, "1y")
                if h:
                    save_history_snapshot(sym, "1y", h)
                    return
            if ryf.available():
                h = ryf.get_history(sym, "1y")
                if h:
                    save_history_snapshot(sym, "1y", h)
        except Exception as e:
            print(f"[Prewarm] History failed for {sym}: {e}")

    def _fetch_fund(sym):
        try:
            if eodhd.available():
                f = eodhd.get_fundamentals(sym)
                if f and "error" not in f:
                    save_fundamentals_snapshot(sym, f)
                    return
            if ryf.available():
                f = ryf.get_fundamentals(sym)
                if f and "error" not in f:
                    save_fundamentals_snapshot(sym, f)
        except Exception as e:
            print(f"[Prewarm] Fundamentals failed for {sym}: {e}")

    # Fetch all 50 stocks — stagger slightly to avoid rate limit spikes
    from concurrent.futures import ThreadPoolExecutor
    import time as _time

    with ThreadPoolExecutor(max_workers=5) as ex:
        for sym in NIFTY50_SYMBOLS:
            ex.submit(_fetch_history, sym)
            _time.sleep(0.1)   # gentle rate limiting

    with ThreadPoolExecutor(max_workers=5) as ex:
        for sym in NIFTY50_SYMBOLS:
            ex.submit(_fetch_fund, sym)
            _time.sleep(0.1)

    # Index histories
    from config import INDICES as IDX_MAP
    import services.rapidapi_yf_service as ryf2
    for idx_id in IDX_MAP:
        try:
            h = ryf2.get_index_history(idx_id, "3m") if ryf2.available() else []
            if h:
                save_history_snapshot(idx_id, "3m", h)
        except Exception:
            pass

    print("[Prewarm] Cache prewarm complete")


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler

    # 1. Ensure SQLite tables exist
    init_db()
    print("[DB] Snapshot DB initialised")

    # 2. Backfill snapshot if we just started after market close
    _startup_snapshot()

    # 3. Schedule jobs
    _scheduler = BackgroundScheduler(timezone=IST)

    # 3a. Daily market-close snapshot at 15:35 IST
    _scheduler.add_job(
        _take_daily_snapshot,
        trigger="cron",
        day_of_week="mon-fri",
        hour=15, minute=35,
        id="daily_snapshot",
    )

    # 3b. Daily cache prewarm at 9:20 IST (5 min after market open)
    #     Fetches all 50 stocks history + fundamentals in one go.
    #     ~105 RapidAPI calls/day — within any paid plan limit.
    _scheduler.add_job(
        _prewarm_cache,
        trigger="cron",
        day_of_week="mon-fri",
        hour=9, minute=20,
        id="daily_prewarm",
    )

    _scheduler.start()
    print("[Scheduler] Jobs scheduled: snapshot@15:35, prewarm@09:20 (Mon–Fri IST)")

    # 4. Prewarm runs on schedule at 9:20 AM IST only (saves API quota)
    #    On first run history is fetched on-demand and cached in SQLite.
    print("[Prewarm] Scheduled for 09:20 IST on trading days (quota preserved)")

    yield  # app is running

    # Cleanup on shutdown
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[Scheduler] Stopped")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="StockSage API",
    description="Real-time Indian stock market data, verdicts & analysis",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quotes.router)
app.include_router(stock_detail.router)
app.include_router(indices.router)
app.include_router(sentiment.router)
app.include_router(screener.router)


@app.get("/")
async def root():
    return {
        "service": "StockSage API",
        "version": "2.0.0",
        "status":  "running",
        "docs":    "/docs",
        "endpoints": [
            "GET  /api/stocks             — All Nifty50 stocks with verdicts",
            "GET  /api/quote/{symbol}     — Single live quote (D-1 when market closed)",
            "GET  /api/quotes?symbols=X,Y — Bulk quotes",
            "GET  /api/stock/{symbol}     — Full stock detail",
            "GET  /api/stock/{symbol}/history?period=3m",
            "GET  /api/indices            — Nifty50, Sensex, BankNifty, NiftyIT",
            "GET  /api/sentiment/market   — Fear & Greed + macro",
            "GET  /api/sentiment/geopolitical",
            "GET  /api/screener           — Advanced filtered screener",
            "GET  /api/market/status      — NSE open/closed + snapshot date",
        ],
    }


@app.get("/health")
async def health():
    from services.snapshot_service import get_last_snapshot_date
    return {
        "status": "ok",
        "lastSnapshotDate": get_last_snapshot_date(),
    }
