import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import SessionLocal
from backend.models import ScanRun, ScanResult, cleanup_old_scans
from backend.upstox_client import upstox_client_manager, HTTPException_401
from backend.most_active import most_active_manager
from backend.strategy import strategy_engine

logger = logging.getLogger(__name__)

class ScannerManager:
    """
    Manages semi-algo intraday scanner execution for NSE Most Active Stocks.
    Evaluates completed 10-minute candles with SMA 6/30 crossover,
    relative volume >= 1.5, price action confirmation, and liquidity filters.
    Strictly alert-only: Never calls order execution APIs.
    """

    def __init__(self):
        self.is_running: bool = False
        self.status: str = "idle"  # idle, running, completed, failed, stopped
        self.progress_message: str = "Ready to scan."
        self.stocks_scanned: int = 0
        self.total_stocks: int = 0
        self.signals_found: int = 0
        self.current_scan_id: Optional[int] = None
        self.error: Optional[str] = None
        self.latest_results: List[Dict[str, Any]] = []
        self.confirmed_buy_alerts: List[Dict[str, Any]] = []
        self.confirmed_sell_alerts: List[Dict[str, Any]] = []
        self.market_metadata: Dict[str, Any] = {}
        self.stop_requested: bool = False
        self._lock = asyncio.Lock()

    def stop_scan(self):
        """Signals the running scanner to abort immediately."""
        if self.is_running:
            self.stop_requested = True
            self.progress_message = "Scan stopping..."
            logger.info("Scan stop requested by user.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "is_running": self.is_running,
            "progress_message": self.progress_message,
            "stocks_scanned": self.stocks_scanned,
            "total_stocks": self.total_stocks,
            "signals_found": self.signals_found,
            "confirmed_buys": len(self.confirmed_buy_alerts),
            "confirmed_sells": len(self.confirmed_sell_alerts),
            "scan_id": self.current_scan_id,
            "error": self.error
        }

    async def run_scan(
        self,
        access_token: Optional[str] = None,
        universe_filter: str = "ALL",
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes the dynamic NIFTY 500 SMA 6/30 intraday scanner.
        1. Discovers NIFTY 500 eligible NSE equity stocks with index membership flags.
        2. Retrieves completed 10-minute candles for each stock via Upstox API v3 or high-speed feed.
        3. Computes SMA 6, SMA 30, relative volume, VWAP, Supertrend, and price-action confirmation.
        4. Ranks confirmed BUY and SELL alerts by composite signal score (0-100).
        5. Persists results and returns formatted datasets.
        """
        async with self._lock:
            if self.is_running:
                logger.warning("Scan is already running.")
                return self.latest_results

            self.is_running = True
            self.stop_requested = False
            self.status = "running"
            self.stocks_scanned = 0
            self.total_stocks = 0
            self.signals_found = 0
            self.error = None

        db: Session = SessionLocal()
        scan_run = ScanRun(
            started_at=datetime.now(timezone.utc),
            status="running"
        )
        db.add(scan_run)
        db.commit()
        db.refresh(scan_run)
        self.current_scan_id = scan_run.id

        try:
            target_limit = limit or getattr(settings, "MOST_ACTIVE_LIMIT", 500)
            target_universe = (universe_filter or "NIFTY500").upper()

            # Step 1: Discover NIFTY 500 Candidate Universe
            self.progress_message = f"Discovering NIFTY {target_universe} stocks (up to {target_limit} equities)..."
            logger.info(self.progress_message)

            from backend.universe import get_combined_stock_universe
            from backend.live_feed import get_batch_live_quotes

            universe_stocks = await get_combined_stock_universe(index_filter=target_universe)

            if not universe_stocks:
                active_data = await most_active_manager.get_most_active_stocks(
                    access_token=access_token,
                    force_refresh=True,
                    limit=target_limit
                )
                candidate_list = active_data.get("stocks", [])
                discovery_source = active_data.get("source", "Market Feed")
            else:
                discovery_source = f"NIFTY {target_universe} Master"
                candidate_slice = universe_stocks[:target_limit]
                sym_list = [s["symbol"] for s in candidate_slice]
                live_quotes = await get_batch_live_quotes(sym_list)

                candidate_list = []
                for idx, s in enumerate(candidate_slice):
                    sym = s["symbol"]
                    q = live_quotes.get(sym, {})
                    lp = q.get("last_price", 0.0)
                    vol = q.get("volume", 0)
                    tv = lp * vol if lp > 0 and vol > 0 else 0.0
                    candidate_list.append({
                        "symbol": sym,
                        "company": s["company"],
                        "instrument_key": s["instrument_key"],
                        "isin": s.get("isin", ""),
                        "industry": s.get("industry", "Diversified"),
                        "is_nifty50": s.get("is_nifty50", False),
                        "is_nifty100": s.get("is_nifty100", False),
                        "is_nifty200": s.get("is_nifty200", False),
                        "is_nifty500": True,
                        "is_midcap": s.get("is_midcap", False),
                        "is_smallcap": s.get("is_smallcap", False),
                        "last_price": lp,
                        "change_pct": q.get("change_pct", 0.0),
                        "cumulative_volume": vol,
                        "traded_value": tv,
                        "traded_value_cr": round(tv / 1e7, 2),
                        "spread_pct": 0.05,
                        "activity_rank": idx + 1
                    })

            self.total_stocks = len(candidate_list)
            self.market_metadata = {
                "source": discovery_source,
                "universe": target_universe,
                "total_checked": self.total_stocks,
                "most_active_count": self.total_stocks,
                "discovery_time": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%H:%M:%S IST")
            }

            self.progress_message = f"Evaluating completed 10m candles for {self.total_stocks} NIFTY stocks ({discovery_source})..."
            logger.info(self.progress_message)

            # Step 2: Concurrently scan stocks with rate-limiting semaphore
            concurrency_count = getattr(settings, "SCAN_CONCURRENCY", 20)
            semaphore = asyncio.Semaphore(concurrency_count)
            all_scanned_stocks: List[Dict[str, Any]] = []

            async def scan_stock_worker(stock_item: Dict[str, Any]):
                sym = stock_item["symbol"].upper()
                comp = stock_item.get("company", sym)
                inst_key = stock_item["instrument_key"]
                act_rank = stock_item.get("activity_rank", 1)
                tv_cr = stock_item.get("traded_value_cr", 0.0)
                spread_pct = stock_item.get("spread_pct", 0.05)
                lp = stock_item.get("last_price", 0.0)
                chg_pct = stock_item.get("change_pct", 0.0)
                vol = stock_item.get("cumulative_volume", 0)

                async with semaphore:
                    if self.stop_requested:
                        return None

                    try:
                        # Fetch 10-minute candles (combines intraday v3 + recent historical bars)
                        raw_candles = await upstox_client_manager.fetch_10m_candles(
                            instrument_key=inst_key,
                            symbol=sym,
                            min_candles=35,
                            access_token=access_token
                        )

                        if self.stop_requested:
                            return None

                        # Analyze with SMA 6/30 completed candle strategy
                        analysis = strategy_engine.analyze_stock(
                            symbol=sym,
                            company=comp,
                            raw_candles=raw_candles,
                            activity_rank=act_rank,
                            session_traded_value_cr=tv_cr,
                            bid_ask_spread_pct=spread_pct
                        )

                        if not analysis:
                            analysis = {
                                "Symbol": sym,
                                "Company": comp,
                                "Signal Type": "WATCH",
                                "Status": "WATCH",
                                "Is Confirmed": False,
                                "Is Duplicate": False,
                                "Crossover Timestamp": "N/A",
                                "Candle Timestamp": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%dT%H:%M:%S+05:30"),
                                "Close": lp,
                                "SMA 6": lp,
                                "SMA 30": lp,
                                "Spread Pct": 0.0,
                                "Relative Volume": 1.0,
                                "Traded Value Cr": tv_cr,
                                "Activity Rank": act_rank,
                                "Freshness": "NO_CANDLES",
                                "Signal Score": 40.0,
                                "Confirmation Notes": "Insufficient completed 10-minute candles",
                                "Crossover Offset": 999
                            }

                        # Augment with live session metrics & Nifty flags
                        analysis["Change Pct"] = chg_pct
                        analysis["Cumulative Volume"] = vol
                        analysis["Instrument Key"] = inst_key
                        analysis["LTP"] = lp if lp > 0 else analysis.get("Close", 0.0)
                        analysis["Industry"] = stock_item.get("industry", "Diversified")
                        analysis["is_nifty50"] = stock_item.get("is_nifty50", False)
                        analysis["is_nifty100"] = stock_item.get("is_nifty100", False)
                        analysis["is_nifty200"] = stock_item.get("is_nifty200", False)
                        analysis["is_nifty500"] = True
                        analysis["is_midcap"] = stock_item.get("is_midcap", False)
                        analysis["is_smallcap"] = stock_item.get("is_smallcap", False)
                        return analysis

                    except Exception as e:
                        logger.warning(f"Error scanning {sym}: {e}")
                        return None
                    finally:
                        self.stocks_scanned += 1
                        if self.stocks_scanned % 15 == 0 or self.stocks_scanned == self.total_stocks:
                            self.progress_message = f"Scanning NIFTY 500 Intraday: {self.stocks_scanned} / {self.total_stocks} stocks completed..."

            tasks = [scan_stock_worker(s) for s in candidate_list]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for res in results:
                if isinstance(res, Exception):
                    logger.warning(f"Worker exception: {res}")
                elif res:
                    all_scanned_stocks.append(res)

            if self.stop_requested:
                self.status = "stopped"
                self.progress_message = "Scan stopped by user."
            else:
                self.status = "completed"

            # Step 3: Separate and rank Confirmed BUY and Confirmed SELL alerts
            confirmed_buys = [s for s in all_scanned_stocks if s.get("Is Confirmed") and s.get("Signal Type") == "BUY"]
            confirmed_sells = [s for s in all_scanned_stocks if s.get("Is Confirmed") and s.get("Signal Type") == "SELL"]

            # Sort confirmed lists by Signal Score DESC, then newest crossover timestamp
            confirmed_buys.sort(key=lambda x: (x.get("Signal Score", 0.0), x.get("Crossover Timestamp", "")), reverse=True)
            confirmed_sells.sort(key=lambda x: (x.get("Signal Score", 0.0), x.get("Crossover Timestamp", "")), reverse=True)

            # Assign alert ranks 1..N
            for idx, item in enumerate(confirmed_buys, start=1):
                item["Alert Rank"] = idx
            for idx, item in enumerate(confirmed_sells, start=1):
                item["Alert Rank"] = idx

            # Sort all stocks: first confirmed alerts, then by Signal Score DESC
            all_scanned_stocks.sort(key=lambda x: (x.get("Is Confirmed", False), x.get("Signal Score", 0.0)), reverse=True)

            self.confirmed_buy_alerts = confirmed_buys
            self.confirmed_sell_alerts = confirmed_sells
            self.latest_results = all_scanned_stocks
            self.signals_found = len(confirmed_buys) + len(confirmed_sells)

            # Step 4: Persist results in Database
            for item in all_scanned_stocks:
                scan_res = ScanResult(
                    scan_id=scan_run.id,
                    rank=item.get("Activity Rank", 0),
                    symbol=item["Symbol"],
                    company=item["Company"],
                    signal_type=item.get("Signal Type", "WATCH"),
                    crossover_date=str(item.get("Crossover Timestamp", "")),
                    close=float(item.get("Close", 0.0)),
                    sma6=float(item.get("SMA 6", 0.0)),
                    sma30=float(item.get("SMA 30", 0.0)),
                    rel_volume=float(item.get("Relative Volume", 1.0)),
                    change_pct=float(item.get("Change Pct", 0.0)),
                    cumulative_volume=int(item.get("Cumulative Volume", 0)),
                    traded_value=float(item.get("Traded Value Cr", 0.0) * 10000000.0),
                    signal_score=float(item.get("Signal Score", 0.0)),
                    is_confirmed=bool(item.get("Is Confirmed", False)),
                    confirmation_notes=str(item.get("Confirmation Notes", "")),
                    status=str(item.get("Status", "WATCH")),
                    candle_timestamp=str(item.get("Candle Timestamp", "")),
                    freshness=str(item.get("Freshness", "ACTIVE"))
                )
                db.add(scan_res)

            scan_run.completed_at = datetime.now(timezone.utc)
            scan_run.stocks_scanned = self.stocks_scanned
            scan_run.signals_found = self.signals_found
            scan_run.status = "completed"
            db.commit()

            # Retention policy cleanup
            if settings.DELETE_RESULTS_AFTER_SCAN:
                cleanup_old_scans(db, keep_count=0, delete_all=True)
            else:
                cleanup_old_scans(db, keep_count=3)

            self.progress_message = f"Scan complete. Evaluated {self.stocks_scanned} stocks. Generated {len(confirmed_buys)} Confirmed BUY & {len(confirmed_sells)} Confirmed SELL alerts."
            logger.info(self.progress_message)
            return self.latest_results

        except Exception as e:
            logger.exception(f"Fatal error during scanner run: {e}")
            self.status = "failed"
            self.error = str(e)
            self.progress_message = f"Scan failed: {e}"
            scan_run.status = "failed"
            scan_run.error_message = str(e)
            db.commit()
            raise

        finally:
            self.is_running = False
            db.close()

scanner_manager = ScannerManager()
