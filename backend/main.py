import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import init_db, get_db
from backend.models import ScanRun, ScanResult, cleanup_old_scans
from backend.auth import (
    router as auth_router,
    get_current_session,
    get_current_session_optional,
    get_active_access_token,
    OAuthSession
)
from backend.scanner import scanner_manager, HTTPException_401
from backend.upstox_client import upstox_client_manager
from backend.most_active import most_active_manager
from backend.bhavcopy import bhavcopy_manager
from backend.backtest import backtest_engine
from backend.strategy import strategy_engine
from pydantic import BaseModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("upstox_scanner")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database and background preload of instrument master
    logger.info("Initializing Upstox Semi-Algo Scanner backend...")
    init_db()

    # Pre-fetch instrument master asynchronously so initial scan has zero cold-start delay
    asyncio.create_task(prewarm_instrument_cache())
    yield
    # Shutdown
    logger.info("Shutting down Upstox Semi-Algo Scanner backend...")

async def prewarm_instrument_cache():
    try:
        await asyncio.sleep(1)
        logger.info("Pre-warming Upstox NSE instrument master...")
        await upstox_client_manager.get_nse_instruments()
    except Exception as e:
        logger.warning(f"Background instrument preload warning: {e}")

app = FastAPI(
    title="NSE Most Active Stocks SMA 6/30 Intraday Scanner",
    description="Semi-automated NSE equity intraday scanner evaluating completed 10-minute candles with SMA 6/30 crossover, volume expansion, and price action confirmation.",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
    origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Authentication Router
app.include_router(auth_router)

def get_nse_market_session() -> Dict[str, Any]:
    """
    Computes current NSE cash-equity session phase based on Indian Standard Time (IST).
    Regular continuous market hours: 09:15 to 15:30 IST, Monday through Friday.
    """
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    weekday = now_ist.weekday()  # 0=Monday, 4=Friday, 5=Saturday, 6=Sunday
    cur_mins = now_ist.hour * 60 + now_ist.minute

    pre_open_start = 9 * 60         # 09:00 IST
    market_open = 9 * 60 + 15       # 09:15 IST
    market_close = 15 * 60 + 30     # 15:30 IST
    post_close = 16 * 60            # 16:00 IST

    if weekday >= 5:
        status = "CLOSED"
        phase = "Weekend (Market Closed)"
        msg = "NSE is closed for the weekend. Next trading session opens Monday at 09:15 IST."
    elif cur_mins < pre_open_start:
        status = "PRE_MARKET_CLOSED"
        phase = "Pre-Market Closed"
        mins_left = market_open - cur_mins
        msg = f"Session opens in {mins_left // 60}h {mins_left % 60}m at 09:15 IST."
    elif cur_mins < market_open:
        status = "PRE_OPEN"
        phase = "Pre-Open Session (Call Auction)"
        msg = "Pre-open auction in progress. Continuous trading begins at 09:15 IST."
    elif cur_mins <= market_close:
        status = "OPEN"
        phase = "Regular Trading Session"
        mins_left = market_close - cur_mins
        msg = f"NSE session is LIVE. Closes in {mins_left // 60}h {mins_left % 60}m at 15:30 IST."
    elif cur_mins <= post_close:
        status = "POST_CLOSE"
        phase = "Post-Closing Session"
        msg = "Post-closing session active. Regular trading has concluded."
    else:
        status = "CLOSED"
        phase = "Market Closed"
        msg = "NSE cash-equity session has ended for today. Next session opens tomorrow at 09:15 IST."

    return {
        "status": status,
        "phase": phase,
        "is_open": (status == "OPEN"),
        "current_time_ist": now_ist.strftime("%H:%M:%S IST"),
        "current_date": now_ist.strftime("%Y-%m-%d"),
        "message": msg
    }

@app.get("/health")
def health_check():
    from datetime import datetime, timezone
    return {
        "status": "healthy",
        "service": "nse-most-active-sma6-30-scanner",
        "trading_mode": "ALERT_ONLY_NO_AUTOMATED_ORDERS",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/market/session")
async def get_market_overview(session: Optional[OAuthSession] = Depends(get_current_session_optional)):
    """
    Returns real-time market session status, Nifty 50 performance,
    Upstox connection health, and scanner summary metrics.
    """
    session_info = get_nse_market_session()

    # Fetch NIFTY 50 live quote
    nifty_quote = None
    try:
        from backend.live_feed import get_batch_live_quotes
        quotes = await get_batch_live_quotes(["NIFTY 50"])
        q = quotes.get("NIFTY 50")
        if q:
            nifty_quote = {
                "ltp": q.get("last_price", 0.0),
                "change": q.get("change", 0.0),
                "change_pct": q.get("change_pct", 0.0)
            }
    except Exception as e:
        logger.debug(f"NIFTY quote fetch note: {e}")

    upstox_status = {
        "connected": bool(session and session.is_active),
        "user_name": session.user_name if session else None,
        "user_id": session.user_id if session else None
    }

    return {
        "market_session": session_info,
        "nifty_50": nifty_quote,
        "upstox_connection": upstox_status,
        "scanner_stats": {
            "stocks_checked": scanner_manager.market_metadata.get("total_checked", scanner_manager.total_stocks),
            "most_active_selected": scanner_manager.total_stocks or 50,
            "confirmed_buys": len(scanner_manager.confirmed_buy_alerts),
            "confirmed_sells": len(scanner_manager.confirmed_sell_alerts),
            "last_update": scanner_manager.market_metadata.get("discovery_time")
        }
    }

@app.get("/api/universe/nifty500")
async def get_nifty500_universe_endpoint(index: Optional[str] = "ALL"):
    """
    Returns the comprehensive NIFTY 500 constituent universe with index flags,
    sector/industry information, and instrument keys.
    """
    from backend.universe import get_combined_stock_universe
    universe = await get_combined_stock_universe(index_filter=index or "ALL")
    return {
        "status": "success",
        "index_filter": index or "ALL",
        "total_count": len(universe),
        "constituents": universe
    }

@app.get("/api/stocks/most-active")
async def get_most_active_stocks_endpoint(
    limit: int = 500,
    index: Optional[str] = "ALL",
    session: Optional[OAuthSession] = Depends(get_current_session_optional)
):
    """
    Returns NIFTY 500 eligible NSE equity stocks ranked by cumulative session traded value.
    Filters out derivatives, BSE instruments, ETFs, and suspended contracts.
    """
    access_token = None
    if session:
        try:
            access_token = get_active_access_token(session)
        except Exception:
            pass

    data = await most_active_manager.get_most_active_stocks(access_token=access_token, limit=limit)
    return data

@app.post("/api/scanner/run")
async def trigger_scan(
    universe: Optional[str] = "ALL",
    limit: Optional[int] = 500,
    session: Optional[OAuthSession] = Depends(get_current_session_optional)
):
    """
    Triggers the intraday SMA 6/30 scanner on the NIFTY 500 universe (or selected index subset).
    Evaluates completed 10-minute candles with relative volume, VWAP, Supertrend, and price action confirmation.
    Strictly alert-only. NEVER executes automated orders.
    """
    if scanner_manager.is_running:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "status": "running",
                "message": "Scan already in progress.",
                "details": scanner_manager.get_status()
            }
        )

    access_token = None
    if session:
        try:
            access_token = get_active_access_token(session)
        except Exception:
            access_token = None

    asyncio.create_task(scanner_manager.run_scan(
        access_token=access_token,
        universe_filter=universe or "ALL",
        limit=limit or 500
    ))

    return {
        "status": "started",
        "universe": universe or "ALL",
        "limit": limit or 500,
        "message": f"NIFTY 500 Intraday scanner execution started on {universe or 'ALL'} stocks ({'Upstox v3' if access_token else 'Live Market Feed'}).",
        "progress": scanner_manager.progress_message
    }

@app.post("/api/scanner/stop")
def stop_scanner():
    """Stops an ongoing semi-algo crossover scan immediately."""
    if not scanner_manager.is_running:
        return {"status": "not_running", "message": "No scan is currently running."}
    scanner_manager.stop_scan()
    return {"status": "stopping", "message": "Scan abort initiated."}

@app.get("/api/scanner/status")
def get_scanner_status():
    """Returns real-time progress and status of the scanner."""
    return scanner_manager.get_status()

@app.get("/api/scanner/results")
def get_scanner_results(
    db: Session = Depends(get_db),
    session: Optional[OAuthSession] = Depends(get_current_session_optional)
):
    """
    Returns full scan results:
    - Confirmed BUY alerts (ranked by composite score DESC)
    - Confirmed SELL alerts (ranked by composite score DESC)
    - Top 50 Most Active stocks table
    - Market overview telemetry
    """
    # 1. In-memory results
    if scanner_manager.latest_results:
        most_active_stocks = scanner_manager.latest_results
        confirmed_buys = scanner_manager.confirmed_buy_alerts
        confirmed_sells = scanner_manager.confirmed_sell_alerts
        scan_id = scanner_manager.current_scan_id
    else:
        # 2. Database results fallback
        latest_run = (
            db.query(ScanRun)
            .filter(ScanRun.status == "completed")
            .order_by(ScanRun.id.desc())
            .first()
        )
        if not latest_run:
            return {
                "scan_id": None,
                "status": "no_scans",
                "stocks_scanned": 0,
                "signals_found": 0,
                "confirmed_buys": [],
                "confirmed_sells": [],
                "most_active_stocks": [],
                "results": []
            }

        scan_id = latest_run.id
        most_active_stocks = [
            {
                "Rank": r.rank,
                "Activity Rank": r.rank,
                "Symbol": r.symbol,
                "Company": r.company,
                "Signal Type": r.signal_type,
                "Status": getattr(r, "status", "WATCH") or "WATCH",
                "Is Confirmed": getattr(r, "is_confirmed", False) or False,
                "Crossover Timestamp": r.crossover_date,
                "Candle Timestamp": getattr(r, "candle_timestamp", "") or r.crossover_date,
                "Close": round(r.close, 2),
                "SMA 6": round(r.sma6, 2),
                "SMA 30": round(r.sma30, 2),
                "Relative Volume": round(getattr(r, "rel_volume", 1.0) or 1.0, 2),
                "Change Pct": round(getattr(r, "change_pct", 0.0) or 0.0, 2),
                "Cumulative Volume": getattr(r, "cumulative_volume", 0) or 0,
                "Traded Value Cr": round((getattr(r, "traded_value", 0.0) or 0.0) / 10000000.0, 2),
                "Signal Score": round(getattr(r, "signal_score", 0.0) or 0.0, 1),
                "Confirmation Notes": getattr(r, "confirmation_notes", "") or "",
                "Freshness": getattr(r, "freshness", "ACTIVE") or "ACTIVE",
                "Spread Pct": round(((r.sma6 - r.sma30) / r.sma30) * 100, 2) if r.sma30 else 0.0
            }
            for r in latest_run.results
        ]
        confirmed_buys = [s for s in most_active_stocks if s.get("Is Confirmed") and s.get("Signal Type") == "BUY"]
        confirmed_sells = [s for s in most_active_stocks if s.get("Is Confirmed") and s.get("Signal Type") == "SELL"]

    # Backward compatible results list
    compatible_results = [
        {
            "Rank": s.get("Activity Rank", idx),
            "Symbol": s["Symbol"],
            "Company": s["Company"],
            "Signal Type": s.get("Signal Type", "WATCH"),
            "Crossover Date": s.get("Crossover Timestamp", "N/A"),
            "Close": s.get("Close", 0.0),
            "SMA 6": s.get("SMA 6", 0.0),
            "SMA 30": s.get("SMA 30", 0.0),
            "Is Crossover": s.get("Is Confirmed", False),
            "Freshness": s.get("Freshness", "ACTIVE"),
            "Spread Pct": s.get("Spread Pct", 0.0),
            "Signal Score": s.get("Signal Score", 0.0),
            "Relative Volume": s.get("Relative Volume", 1.0),
            "Traded Value Cr": s.get("Traded Value Cr", 0.0),
            "Change Pct": s.get("Change Pct", 0.0)
        }
        for idx, s in enumerate(most_active_stocks, start=1)
    ]

    return {
        "scan_id": scan_id,
        "status": "completed",
        "stocks_scanned": scanner_manager.stocks_scanned or len(most_active_stocks),
        "total_stocks": len(most_active_stocks),
        "signals_found": len(confirmed_buys) + len(confirmed_sells),
        "confirmed_buys_count": len(confirmed_buys),
        "confirmed_sells_count": len(confirmed_sells),
        "confirmed_buys": confirmed_buys,
        "confirmed_sells": confirmed_sells,
        "most_active_stocks": most_active_stocks,
        "market_session": get_nse_market_session(),
        "crossovers_count": len(confirmed_buys) + len(confirmed_sells),
        "bullish_crossovers": len(confirmed_buys),
        "bearish_crossovers": len(confirmed_sells),
        "results": compatible_results
    }

@app.get("/api/scanner/alerts")
def get_confirmed_alerts(
    signal_type: Optional[str] = None,
    min_score: float = 0.0,
    activity_rank_max: int = 50
):
    """
    Returns confirmed BUY and SELL alerts filtered by type, score, and rank.
    """
    all_alerts = scanner_manager.confirmed_buy_alerts + scanner_manager.confirmed_sell_alerts
    filtered = []
    for a in all_alerts:
        if signal_type and signal_type.upper() not in ["ALL", ""]:
            if a.get("Signal Type") != signal_type.upper():
                continue
        if a.get("Signal Score", 0.0) < min_score:
            continue
        if a.get("Activity Rank", 999) > activity_rank_max:
            continue
        filtered.append(a)

    filtered.sort(key=lambda x: (x.get("Signal Score", 0.0), x.get("Crossover Timestamp", "")), reverse=True)
    return {
        "count": len(filtered),
        "alerts": filtered
    }

@app.get("/api/bhavcopy/summary")
async def get_bhavcopy_summary():
    """
    Returns official NSE Bhavcopy historical liquidity research and ADV baseline tiers.
    Strictly for research, not live most-active ranking.
    """
    return await bhavcopy_manager.get_historical_liquidity_summary()

class BacktestRequest(BaseModel):
    symbol: str
    days_back: int = 15

@app.post("/api/backtest/run")
async def run_strategy_backtest(
    payload: BacktestRequest,
    session: Optional[OAuthSession] = Depends(get_current_session_optional)
):
    """
    Runs intraday 10-minute SMA 6/30 strategy backtesting on requested stock.
    Accounts for slippage and transaction costs.
    """
    access_token = None
    if session:
        try:
            access_token = get_active_access_token(session)
        except Exception:
            pass

    return await backtest_engine.run_backtest(
        symbol=payload.symbol,
        days_back=payload.days_back,
        access_token=access_token
    )

@app.get("/api/analysis/{symbol}")
def analyze_stock(symbol: str, db: Session = Depends(get_db)):
    """
    Returns deep Screener-style fundamental analysis for an NSE stock,
    including EPS, P/E, P/B, Market Cap, Strengths, Weaknesses,
    Fundamental Rating, and Double Confirmation verdict with SMA 6 & 30.
    """
    clean_sym = symbol.strip().upper()

    # Look up latest technical crossover signal for this stock
    sma_signal = None
    if scanner_manager.latest_results:
        for r in scanner_manager.latest_results:
            if r.get("Symbol") == clean_sym:
                sma_signal = r.get("Signal Type")
                break

    if not sma_signal:
        latest_res = (
            db.query(ScanResult)
            .filter(ScanResult.symbol == clean_sym)
            .order_by(ScanResult.id.desc())
            .first()
        )
        if latest_res:
            sma_signal = latest_res.signal_type

    from backend.analyzer import get_stock_analysis
    return get_stock_analysis(clean_sym, sma_signal=sma_signal)

# In-memory leaderboard cache (TTL 300 seconds)
_LEADERBOARD_CACHE: Dict[str, Any] = {"timestamp": 0.0, "data": []}

@app.get("/api/scoring/leaderboard")
async def get_scoring_leaderboard(db: Session = Depends(get_db)):
    """
    Returns stocks ranked by their Stock Perfection Score (0 - 100),
    synthesizing technical SMA 6 & 30 crossovers with fundamental health.
    Cached for high-speed delivery without cloud network latency.
    """
    now = time.time()
    if _LEADERBOARD_CACHE["data"] and (now - _LEADERBOARD_CACHE["timestamp"] < 300):
        return {
            "count": len(_LEADERBOARD_CACHE["data"]),
            "leaderboard": _LEADERBOARD_CACHE["data"]
        }

    from backend.analyzer import get_stock_analysis

    # Retrieve candidate stocks from memory or database or default list
    candidates = []
    if scanner_manager.latest_results:
        candidates = [
            {"symbol": r["Symbol"], "signal_type": r.get("Signal Type", "BULLISH"), "close": r.get("Close"), "company": r.get("Company")}
            for r in scanner_manager.latest_results[:20]
        ]
    else:
        latest_run = (
            db.query(ScanRun)
            .filter(ScanRun.status == "completed")
            .order_by(ScanRun.id.desc())
            .first()
        )
        if latest_run and latest_run.results:
            candidates = [
                {"symbol": r.symbol, "signal_type": r.signal_type, "close": r.close, "company": r.company}
                for r in latest_run.results[:20]
            ]
        else:
            default_symbols = [
                ("RELIANCE", "Reliance Industries Ltd", "BULLISH"),
                ("TCS", "Tata Consultancy Services Ltd", "BULLISH"),
                ("HDFCBANK", "HDFC Bank Ltd", "NEUTRAL"),
                ("INFY", "Infosys Ltd", "BULLISH"),
                ("TATAMOTORS", "Tata Motors Ltd", "BULLISH"),
                ("SBIN", "State Bank of India", "BULLISH"),
                ("ITC", "ITC Ltd", "NEUTRAL"),
                ("BHARTIARTL", "Bharti Airtel Ltd", "BULLISH"),
                ("LT", "Larsen & Toubro Ltd", "BULLISH"),
                ("ICICIBANK", "ICICI Bank Ltd", "BULLISH"),
                ("BAJFINANCE", "Bajaj Finance Ltd", "BULLISH"),
                ("MARUTI", "Maruti Suzuki India Ltd", "BULLISH"),
                ("SUNPHARMA", "Sun Pharmaceutical Industries Ltd", "BULLISH"),
                ("NTPC", "NTPC Ltd", "BULLISH"),
                ("TITAN", "Titan Company Ltd", "BULLISH")
            ]
            candidates = [{"symbol": sym, "company": comp, "signal_type": sig, "close": 0.0} for sym, comp, sig in default_symbols]

    semaphore = asyncio.Semaphore(8)

    async def fetch_score(c):
        async with semaphore:
            try:
                data = await asyncio.to_thread(get_stock_analysis, c["symbol"], c.get("signal_type"))
                return {
                    "symbol": c["symbol"],
                    "company": data.get("company", c.get("company", c["symbol"])),
                    "current_price": data.get("current_price", c.get("close", 0.0)),
                    "technical_signal": data.get("technical_signal", "NONE"),
                    "perfection_score": data.get("perfection_score", 0),
                    "perfection_grade": data.get("perfection_grade", "N/A"),
                    "perfection_details": data.get("perfection_details", {}),
                    "pe": data.get("trailing_pe"),
                    "roe": data.get("roe"),
                    "debt_to_equity": data.get("debt_to_equity"),
                    "double_confirmation": data.get("double_confirmation", {})
                }
            except Exception as e:
                logger.warning(f"Error scoring candidate {c['symbol']}: {e}")
                return None

    tasks = [fetch_score(c) for c in candidates]
    scored = await asyncio.gather(*tasks)
    valid_scored = [s for s in scored if s is not None]

    # Sort descending by perfection_score
    valid_scored.sort(key=lambda s: s["perfection_score"], reverse=True)

    for idx, item in enumerate(valid_scored, start=1):
        item["rank"] = idx

    _LEADERBOARD_CACHE["timestamp"] = now
    _LEADERBOARD_CACHE["data"] = valid_scored

    return {
        "count": len(valid_scored),
        "leaderboard": valid_scored
    }


# ----------------- Algo Signals Endpoints (Intraday AI & Swing Trading) -----------------
import json
import random

@app.get("/api/algo/intraday-analysis")
@app.get("/api/algo/intraday-analysis/{symbol}")
@app.get("/api/algo/swing-analysis")
@app.get("/api/algo/swing-analysis/{symbol}")
async def get_algo_analysis(
    request: Request,
    symbol: str = "RELIANCE",
    refresh: bool = False,
    timeframe: Optional[str] = None,
    capital: float = 50000.0,
    risk: float = 1000.0
):
    """
    Executes Intraday Quantitative AI Signal Analysis for requested NSE equity:
    - 10-minute completed candles
    - Intraday Session VWAP & VWAP distance
    - SMA 6 & SMA 30 crossover & trend status
    - Intraday Supertrend (10, 2.0)
    - Relative volume surge vs 20-period 10m baseline
    - Dynamic ATR Stop Loss & Target 1 & Target 2 calculation
    - Pre-computed copyable Intraday Order Slip
    - Optional fallback to Daily Swing Analysis if requested
    """
    clean_symbol = symbol.strip().upper().replace(".NS", "")
    req_path = request.url.path if request else ""
    is_swing = (timeframe and timeframe.lower() == "swing") or ("swing-analysis" in req_path)
    
    if is_swing:
        from backend.algo_swing import run_ai_swing_analysis
        try:
            data = await asyncio.to_thread(run_ai_swing_analysis, clean_symbol, force_refresh=refresh)
            return {"status": "success", "mode": "swing", "data": data}
        except Exception as e:
            logger.error(f"Error in AI Swing Analysis for {clean_symbol}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        from backend.algo_intraday import run_ai_intraday_analysis
        try:
            data = await asyncio.to_thread(
                run_ai_intraday_analysis,
                clean_symbol,
                force_refresh=refresh,
                account_capital=capital,
                risk_per_trade=risk
            )
            return {"status": "success", "mode": "intraday", "data": data}
        except Exception as e:
            logger.warning(f"Intraday analysis fallback for {clean_symbol}: {e}")
            # Graceful fallback to swing analysis if intraday candles are temporarily unavailable
            try:
                from backend.algo_swing import run_ai_swing_analysis
                data = await asyncio.to_thread(run_ai_swing_analysis, clean_symbol, force_refresh=refresh)
                data["timeframe"] = "Daily Fallback"
                cur_p = float(data.get("current_price", 100.0))
                if "intraday_telemetry" not in data:
                    data["intraday_telemetry"] = {
                        "vwap": cur_p,
                        "vwap_distance_pct": 0.0,
                        "sma_6": data.get("indicators", {}).get("ema_20", cur_p),
                        "sma_30": data.get("indicators", {}).get("ema_50", cur_p),
                        "sma_status": "Bullish Trend" if cur_p >= data.get("indicators", {}).get("ema_20", cur_p) else "Consolidating",
                        "rel_vol": data.get("indicators", {}).get("vol_ratio", 1.2),
                        "supertrend_direction": data.get("indicators", {}).get("supertrend", "BULLISH"),
                        "rsi_14": data.get("indicators", {}).get("rsi_14", 55.0),
                        "atr_14": data.get("indicators", {}).get("atr_14", cur_p * 0.015),
                        "session_cutoff": "15:15 IST",
                        "candle_time": "10-Minute Bar Fallback"
                    }
                if "order_slip" not in data:
                    tp = data.get("trade_plan", {})
                    ent = float(tp.get("entry_price", cur_p))
                    sl = float(tp.get("stoploss_price", ent * 0.985))
                    tg1 = float(tp.get("target_price", ent * 1.025))
                    tg2 = ent + (tg1 - ent) * 1.8
                    risk_ps = max(0.05, abs(ent - sl))
                    qty = max(1, int(risk / risk_ps))
                    data["order_slip"] = {
                        "symbol": clean_symbol,
                        "action": tp.get("action", "BUY"),
                        "product": "MIS",
                        "order_type": "LIMIT",
                        "entry_price": round(ent, 2),
                        "stoploss_price": round(sl, 2),
                        "target_1": round(tg1, 2),
                        "target_2": round(tg2, 2),
                        "suggested_qty": qty,
                        "margin_required": round(qty * ent * 0.20, 2),
                        "max_risk_inr": round(qty * risk_ps, 2),
                        "risk_reward_t1": round(abs(tg1 - ent) / risk_ps, 2) if risk_ps else 1.8,
                        "risk_reward_t2": round(abs(tg2 - ent) / risk_ps, 2) if risk_ps else 3.0,
                        "session_cutoff": "15:15 IST",
                        "alert_note": "ALERT-ONLY: Route order manually in your broker terminal."
                    }
                return {"status": "success", "mode": "swing_fallback", "data": data}
            except Exception as e2:
                logger.error(f"Error in AI Intraday/Swing Analysis for {clean_symbol}: {e2}")
                raise HTTPException(status_code=500, detail=str(e2))


@app.get("/api/scanner-data")
async def get_scanner_data():
    """
    Returns metadata and stocks dataset for High-volume Breakout & Retest scanner.
    Each stock includes symbol, company name, instrument token, Nifty flags, and daily candles.
    """
    cache_path = Path(__file__).resolve().parent.parent / "data" / "scanner_data_cache.json"
    if not cache_path.exists():
        try:
            from data.build_scanner_cache import build_cache
            await asyncio.to_thread(build_cache)
        except Exception as e:
            logger.warning(f"Unable to auto-build scanner cache: {e}")

    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except Exception as e:
            logger.error(f"Error reading scanner cache: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to load scanner cache: {e}")

    raise HTTPException(status_code=503, detail="Scanner cache is currently initializing. Please retry in a few moments.")


@app.get("/api/ohlc-snapshot")
async def get_ohlc_snapshot(tokens: Optional[str] = None, symbols: Optional[str] = None):
    """
    Returns real-time live OHLC snapshot for requested symbols or instrument tokens,
    providing true market LTP, day high, day low, day open, and volume.
    """
    from backend.live_feed import get_batch_live_quotes

    requested_tokens = set([t.strip() for t in tokens.split(",") if t.strip()]) if tokens else set()
    requested_symbols = set([s.strip().upper() for s in symbols.split(",") if s.strip()]) if symbols else set()

    cache_path = Path(__file__).resolve().parent.parent / "data" / "scanner_data_cache.json"
    token_to_sym = {}
    sym_to_token = {}

    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cdata = json.load(f)
            for s in cdata.get("stocks", []):
                sym = s.get("symbol", "").upper()
                tok = s.get("instrument_token", "")
                if sym and tok:
                    token_to_sym[tok] = sym
                    sym_to_token[sym] = tok
        except Exception as e:
            logger.debug(f"Cache map notice for snapshot: {e}")

    # Determine symbols to query
    query_symbols = set(requested_symbols)
    for tok in requested_tokens:
        if tok in token_to_sym:
            query_symbols.add(token_to_sym[tok])

    # If no specific filter, query all cached stocks
    if not query_symbols and cache_path.exists():
        query_symbols = set(sym_to_token.keys())

    # Fetch real live quotes
    live_quotes = await get_batch_live_quotes(list(query_symbols))
    snapshot = {}

    for sym, q in live_quotes.items():
        tok = sym_to_token.get(sym, "")
        price_info = {
            "symbol": sym,
            "instrument_token": tok,
            "last_price": q.get("last_price", 0.0),
            "open": q.get("open", 0.0),
            "high": q.get("high", 0.0),
            "low": q.get("low", 0.0),
            "close": q.get("close", 0.0),
            "volume": q.get("volume", 0),
            "change": q.get("change", 0.0),
            "change_pct": q.get("change_pct", 0.0),
            "timestamp": q.get("timestamp", int(time.time()))
        }
        snapshot[sym] = price_info
        if tok:
            snapshot[tok] = price_info

    return {"status": "success", "data": snapshot}


@app.websocket("/ws/ticks")
async def websocket_ticks_endpoint(websocket: WebSocket, tokens: Optional[str] = None, mode: Optional[str] = "full"):
    """
    WebSocket endpoint for real-time live price ticks.
    Subscribes to requested instrument tokens and streams real market tick updates.
    """
    await websocket.accept()
    from backend.live_feed import get_batch_live_quotes

    token_list = [t.strip() for t in tokens.split(",") if t.strip()] if tokens else []
    logger.info(f"WebSocket client connected for live ticks: {len(token_list)} tokens, mode={mode}")

    cache_path = Path(__file__).resolve().parent.parent / "data" / "scanner_data_cache.json"
    token_to_sym = {}
    sym_to_token = {}

    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cdata = json.load(f)
            for s in cdata.get("stocks", []):
                sym = s.get("symbol", "").upper()
                tok = s.get("instrument_token", "")
                if sym and tok:
                    token_to_sym[tok] = sym
                    sym_to_token[sym] = tok
        except Exception as e:
            logger.debug(f"Cache map notice for WS: {e}")

    subscribed_symbols = [token_to_sym.get(t, t) for t in token_list]

    # Send initial real live quote snapshot
    initial_ticks = []
    if subscribed_symbols:
        live_quotes = await get_batch_live_quotes(subscribed_symbols)
        for tok in token_list:
            sym = token_to_sym.get(tok, tok)
            q = live_quotes.get(sym)
            if q:
                initial_ticks.append({
                    "token": tok,
                    "symbol": sym,
                    "last_price": q.get("last_price", 0.0),
                    "change": q.get("change", 0.0),
                    "change_pct": q.get("change_pct", 0.0),
                    "volume": q.get("volume", 0),
                    "timestamp": q.get("timestamp", int(time.time()))
                })

    try:
        await websocket.send_json({
            "type": "initial_snapshot",
            "mode": mode,
            "tokens_subscribed": len(token_list),
            "ticks": initial_ticks
        })
    except Exception as e:
        logger.warning(f"WS initial send failed: {e}")
        return

    # Keep track of previous prices to broadcast real price changes
    last_broadcast_prices = {t["symbol"]: t["last_price"] for t in initial_ticks}

    try:
        while True:
            await asyncio.sleep(2.5)
            if not subscribed_symbols:
                continue

            # Fetch fresh real live quotes
            fresh_quotes = await get_batch_live_quotes(subscribed_symbols)
            for tok in token_list:
                sym = token_to_sym.get(tok, tok)
                q = fresh_quotes.get(sym)
                if q:
                    cur_price = q.get("last_price", 0.0)
                    tick_payload = {
                        "type": "tick",
                        "token": tok,
                        "symbol": sym,
                        "last_price": cur_price,
                        "change": q.get("change", 0.0),
                        "change_pct": q.get("change_pct", 0.0),
                        "volume": q.get("volume", 0),
                        "timestamp": q.get("timestamp", int(time.time()))
                    }
                    await websocket.send_json(tick_payload)
                    last_broadcast_prices[sym] = cur_price
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected cleanly.")
    except Exception as e:
        logger.info(f"WebSocket connection closed: {e}")


# ----------------- Serve Frontend Static Build (SPA Fallback) -----------------
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("ws") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")

