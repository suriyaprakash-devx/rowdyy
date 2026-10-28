import asyncio
import csv
import io
import json
import logging
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

BHAVCOPY_DIR = Path("./data/bhavcopy")
BHAVCOPY_DIR.mkdir(parents=True, exist_ok=True)

class NSEBhavcopyManager:
    """
    Manages official NSE Bhavcopy downloads, parsing, and historical liquidity research.
    Note: Bhavcopy represents historical daily settlement activity. It is used strictly
    for historical research, ADV benchmarks, and liquidity scoring—never to claim it represents
    the live intraday most-active ranking.
    """

    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._lock = asyncio.Lock()

    def get_recent_trading_dates(self, count: int = 5) -> List[datetime]:
        """Returns the recent potential weekday trading dates."""
        dates = []
        curr = datetime.now() - timedelta(days=1)
        while len(dates) < count:
            if curr.weekday() < 5:  # Monday to Friday
                dates.append(curr)
            curr -= timedelta(days=1)
        return dates

    async def fetch_bhavcopy_for_date(self, target_date: datetime) -> Optional[Dict[str, Dict[str, Any]]]:
        """
        Attempts to fetch official NSE Bhavcopy for a specific date.
        Tries sec_bhavdata_full_<DDMMYYYY>.csv format.
        """
        date_str = target_date.strftime("%d%m%Y")
        cache_file = BHAVCOPY_DIR / f"bhavcopy_{date_str}.json"

        # Check local disk cache
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.debug(f"Cache read error for {date_str}: {e}")

        # Download from NSE Archives
        url = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{date_str}.csv"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,text/csv,*/*"
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200 and resp.text:
                    records = self._parse_csv_text(resp.text, target_date.strftime("%Y-%m-%d"))
                    if records:
                        with open(cache_file, "w", encoding="utf-8") as f:
                            json.dump(records, f)
                        logger.info(f"Downloaded and cached NSE Bhavcopy for {date_str} ({len(records)} EQ stocks).")
                        return records
        except Exception as e:
            logger.debug(f"Bhavcopy download note for {date_str}: {e}")

        return None

    def _parse_csv_text(self, csv_text: str, date_str: str) -> Dict[str, Dict[str, Any]]:
        """Parses CSV text and extracts equity (EQ) records."""
        records: Dict[str, Dict[str, Any]] = {}
        reader = csv.DictReader(io.StringIO(csv_text))
        for row in reader:
            series = (row.get("SERIES") or row.get("series") or "").strip()
            if series != "EQ":
                continue
            sym = (row.get("SYMBOL") or row.get("symbol") or "").strip().upper()
            if not sym:
                continue

            try:
                close = float(row.get("CLOSE_PRICE") or row.get("CLOSE") or 0.0)
                open_p = float(row.get("OPEN_PRICE") or row.get("OPEN") or 0.0)
                high_p = float(row.get("HIGH_PRICE") or row.get("HIGH") or 0.0)
                low_p = float(row.get("LOW_PRICE") or row.get("LOW") or 0.0)
                prev_c = float(row.get("PREV_CLOSE") or 0.0)
                vol = int(row.get("TTL_TRD_QNTY") or row.get("TOTTRDQTY") or 0)
                # Turnover in Lacs or direct Rupees
                turnover_lacs = float(row.get("TURNOVER_LACS") or 0.0)
                turnover_rupees = turnover_lacs * 100000.0 if turnover_lacs > 0 else float(row.get("TOTTRDVAL") or (close * vol))

                records[sym] = {
                    "symbol": sym,
                    "date": date_str,
                    "series": series,
                    "open": open_p,
                    "high": high_p,
                    "low": low_p,
                    "close": close,
                    "prev_close": prev_c,
                    "volume": vol,
                    "traded_value_rupees": turnover_rupees,
                    "traded_value_cr": round(turnover_rupees / 10000000.0, 2),
                    "delivery_qty": int(row.get("DELIV_QTY") or 0),
                    "delivery_pct": float(row.get("DELIV_PER") or 0.0)
                }
            except Exception:
                continue

        return records

    async def get_historical_liquidity_summary(self) -> Dict[str, Any]:
        """
        Aggregates recent Bhavcopy records to provide institutional liquidity metrics:
        - 5-day Average Daily Volume (ADV)
        - 5-day Average Daily Traded Value (ADT in ₹ Cr)
        - Liquidity Tier (Tier 1: > 100 Cr, Tier 2: 25-100 Cr, Tier 3: < 25 Cr)
        """
        async with self._lock:
            recent_dates = self.get_recent_trading_dates(count=5)
            all_records: List[Dict[str, Dict[str, Any]]] = []

            for dt in recent_dates:
                bhav = await self.fetch_bhavcopy_for_date(dt)
                if bhav:
                    all_records.append(bhav)

            if not all_records:
                # If no fresh files downloaded, check any available local Bhavcopy files
                for fpath in BHAVCOPY_DIR.glob("bhavcopy_*.json"):
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            all_records.append(json.load(f))
                    except Exception:
                        pass

            if not all_records:
                return {
                    "status": "unavailable",
                    "message": "Historical NSE Bhavcopy data is currently being synced.",
                    "stock_metrics": {}
                }

            # Aggregate across available dates
            aggregated: Dict[str, Dict[str, Any]] = {}
            for day_records in all_records:
                for sym, r in day_records.items():
                    if sym not in aggregated:
                        aggregated[sym] = {
                            "symbol": sym,
                            "days_count": 0,
                            "total_volume": 0,
                            "total_value": 0.0,
                            "latest_close": r["close"],
                            "delivery_pct_avg": 0.0
                        }
                    aggregated[sym]["days_count"] += 1
                    aggregated[sym]["total_volume"] += r["volume"]
                    aggregated[sym]["total_value"] += r["traded_value_rupees"]
                    aggregated[sym]["latest_close"] = r["close"]
                    aggregated[sym]["delivery_pct_avg"] += r.get("delivery_pct", 0.0)

            # Finalize metrics
            result_metrics = {}
            for sym, agg in aggregated.items():
                days = max(1, agg["days_count"])
                adv = agg["total_volume"] // days
                adt_cr = round((agg["total_value"] / days) / 10000000.0, 2)
                
                tier = "Tier 3 (Emerging)"
                if adt_cr >= 100.0:
                    tier = "Tier 1 (Ultra Liquid)"
                elif adt_cr >= 25.0:
                    tier = "Tier 2 (High Liquidity)"

                result_metrics[sym] = {
                    "symbol": sym,
                    "adv": adv,
                    "adt_cr": adt_cr,
                    "latest_close": agg["latest_close"],
                    "avg_delivery_pct": round(agg["delivery_pct_avg"] / days, 1),
                    "liquidity_tier": tier,
                    "data_sessions_analyzed": days
                }

            return {
                "status": "success",
                "sessions_analyzed": len(all_records),
                "stocks_covered": len(result_metrics),
                "notice": "Official NSE Bhavcopy Historical Data for Research and Baseline Liquidity Analysis. NOT for Live Session Most-Active Ranking.",
                "stock_metrics": result_metrics
            }

bhavcopy_manager = NSEBhavcopyManager()

class BhavcopyService:
    """Helper service for Bhavcopy research and liquidity tier classification."""

    @staticmethod
    def classify_liquidity_tier(turnover_cr: float) -> str:
        if turnover_cr >= 100.0:
            return "Tier 1 (> ₹100 Cr)"
        elif turnover_cr >= 25.0:
            return "Tier 2 (₹25-100 Cr)"
        else:
            return "Tier 3 (< ₹25 Cr)"
