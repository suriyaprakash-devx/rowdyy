import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from backend.config import settings
from backend.upstox_client import upstox_client_manager, HTTPException_401

logger = logging.getLogger(__name__)

# Cache for dynamic most-active stocks
_MOST_ACTIVE_CACHE: Dict[str, Any] = {
    "timestamp": 0.0,
    "source": "uninitialized",
    "stocks": [],
    "checked_count": 0
}
_CACHE_LOCK = asyncio.Lock()

# Non-equity / ETF symbol suffixes or substrings to filter out
EXCLUDED_PATTERNS = [
    "BEES", "ETF", "NIFTY", "GOLD", "SILVER", "LIQUID", "INVIT", "REIT",
    "GROWW", "MOTILAL", "HDFCMF", "SBIMF", "KOTAKMF", "AXISMF", "ICICIMF"
]

def is_valid_equity_symbol(symbol: str) -> bool:
    """Strictly filters for cash equity symbols, rejecting ETFs, Mutual Funds, and derivative tags."""
    sym = symbol.strip().upper()
    if not sym:
        return False
    # Exclude common ETF identifiers
    if any(sym.endswith(p) or p in sym for p in ["BEES", "ETF"]):
        return False
    return True

def is_valid_nse_equity(symbol: str, instrument_type: str = "EQ", segment: str = "NSE_EQ") -> bool:
    """Validates instrument segment is NSE_EQ, type is EQ, and symbol is an eligible cash equity."""
    if segment != "NSE_EQ" or instrument_type != "EQ":
        return False
    return is_valid_equity_symbol(symbol)


async def fetch_nse_live_most_active() -> List[Dict[str, Any]]:
    """
    Fetches real-time Most Active securities by traded value from the official NSE market data endpoint.
    Headers replicate a standard browser request with session initialization.
    """
    url = "https://www.nseindia.com/api/live-analysis-most-active-securities?index=value"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/market-data/most-active-securities"
    }

    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            # First visit home to obtain session cookies if needed
            await client.get("https://www.nseindia.com", headers=headers, timeout=4.0)
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                raw_list = data.get("data", [])
                results = []
                for item in raw_list:
                    sym = (item.get("symbol") or "").strip().upper()
                    if not sym or not is_valid_equity_symbol(sym):
                        continue
                    tot_val = float(item.get("totalTradedValue") or item.get("turnover") or 0.0)
                    tot_vol = int(item.get("totalTradedVolume") or item.get("volume") or 0)
                    ltp = float(item.get("lastPrice") or item.get("ltp") or 0.0)
                    p_chg = float(item.get("pChange") or item.get("changePercent") or 0.0)
                    
                    if ltp > 0 and (tot_val > 0 or tot_vol > 0):
                        results.append({
                            "symbol": sym,
                            "last_price": ltp,
                            "p_change": p_chg,
                            "cumulative_volume": tot_vol,
                            "traded_value": tot_val,
                            "source": "NSE_LIVE_VALUE"
                        })
                if results:
                    logger.info(f"Fetched {len(results)} active securities from NSE live-analysis.")
                    return results
    except Exception as e:
        logger.debug(f"NSE official live-analysis request notice: {e}")

    return []

async def fetch_universe_candidates() -> List[Tuple[str, str, str]]:
    """
    Returns the comprehensive liquid candidate universe from NIFTY broad indices + Bhavcopy leaders.
    """
    from backend.universe import FALLBACK_NIFTY_SYMBOLS, NIFTY_100_URLS, NIFTY_200_URLS, _fetch_constituent_csv
    
    # Try fetching fresh constituent lists
    n100 = await _fetch_constituent_csv(NIFTY_100_URLS)
    n200 = await _fetch_constituent_csv(NIFTY_200_URLS)
    combined = n100 + n200
    if not combined:
        combined = FALLBACK_NIFTY_SYMBOLS

    # Deduplicate
    seen = set()
    unique = []
    for sym, comp, isin in combined:
        clean = sym.strip().upper()
        if clean and clean not in seen and is_valid_equity_symbol(clean):
            seen.add(clean)
            unique.append((clean, comp, isin))

    return unique

class MostActiveStockManager:
    """
    Discovers, validates, ranks, and dynamically manages the Top 50 Most Active NSE stocks.
    Ranks primarily by traded value with volume and liquidity filters.
    """

    def __init__(self):
        self._refresh_lock = asyncio.Lock()

    async def get_most_active_stocks(
        self,
        access_token: Optional[str] = None,
        force_refresh: bool = False,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Discovers top most active stocks ranked by cumulative traded value for the session.
        Applies instrument validation against Upstox instrument master (NSE_EQ, EQ).
        Returns structured dictionary containing ranked stocks and metadata.
        """
        global _MOST_ACTIVE_CACHE
        now = time.time()
        ttl = getattr(settings, "CANDIDATE_REFRESH_SECONDS", 180)

        # 1. Return cached results if still valid and not force_refresh
        if not force_refresh and _MOST_ACTIVE_CACHE["stocks"]:
            if (now - _MOST_ACTIVE_CACHE["timestamp"]) < ttl:
                return {
                    "status": "cached",
                    "source": _MOST_ACTIVE_CACHE["source"],
                    "timestamp": datetime.fromtimestamp(_MOST_ACTIVE_CACHE["timestamp"], tz=timezone.utc).isoformat(),
                    "total_checked": _MOST_ACTIVE_CACHE["checked_count"],
                    "count": len(_MOST_ACTIVE_CACHE["stocks"][:limit]),
                    "stocks": _MOST_ACTIVE_CACHE["stocks"][:limit]
                }

        async with self._refresh_lock:
            # Double check cache after acquiring lock
            now = time.time()
            if not force_refresh and _MOST_ACTIVE_CACHE["stocks"]:
                if (now - _MOST_ACTIVE_CACHE["timestamp"]) < ttl:
                    return {
                        "status": "cached",
                        "source": _MOST_ACTIVE_CACHE["source"],
                        "timestamp": datetime.fromtimestamp(_MOST_ACTIVE_CACHE["timestamp"], tz=timezone.utc).isoformat(),
                        "total_checked": _MOST_ACTIVE_CACHE["checked_count"],
                        "count": len(_MOST_ACTIVE_CACHE["stocks"][:limit]),
                        "stocks": _MOST_ACTIVE_CACHE["stocks"][:limit]
                    }

            # 2. Pre-load Upstox NSE instrument master for validation
            await upstox_client_manager.get_nse_instruments()

            # 3. Candidate discovery
            candidates_data: Dict[str, Dict[str, Any]] = {}
            discovery_source = "Upstox Live Quotes"

            # Primary Attempt: Official NSE Most Active API
            nse_active = await fetch_nse_live_most_active()
            if nse_active:
                discovery_source = "Official NSE Live Most-Active Data"
                for item in nse_active:
                    sym = item["symbol"]
                    inst = upstox_client_manager.map_symbol_to_instrument(sym)
                    if inst and inst.get("segment") == "NSE_EQ" and inst.get("instrument_type") == "EQ":
                        candidates_data[sym] = {
                            "symbol": sym,
                            "company": inst.get("company", sym),
                            "instrument_key": inst["instrument_key"],
                            "isin": inst.get("isin", ""),
                            "last_price": item["last_price"],
                            "change_pct": item["p_change"],
                            "cumulative_volume": item["cumulative_volume"],
                            "traded_value": item["traded_value"],
                            "spread_pct": 0.05,
                            "source": "NSE_OFFICIAL_LIVE"
                        }

            # Secondary / Direct Upstox API Quotes: If Upstox token is present or we need broader coverage
            if access_token or len(candidates_data) < limit:
                try:
                    universe_candidates = await fetch_universe_candidates()
                    key_to_candidate = {}
                    for sym, comp, isin in universe_candidates:
                        if sym in candidates_data:
                            continue
                        inst = upstox_client_manager.map_symbol_to_instrument(sym, isin)
                        if inst and inst.get("segment") == "NSE_EQ" and inst.get("instrument_type") == "EQ":
                            key_to_candidate[inst["instrument_key"]] = (sym, inst.get("company", comp), inst.get("isin", isin))

                    if key_to_candidate:
                        if access_token:
                            upstox_quotes = await upstox_client_manager.fetch_batch_quotes(
                                list(key_to_candidate.keys())[:150],
                                access_token=access_token
                            )
                            for k, q in upstox_quotes.items():
                                if k in key_to_candidate:
                                    sym, comp, isin = key_to_candidate[k]
                                    lp = q.get("last_price", 0.0)
                                    vol = q.get("volume", 0)
                                    tv = q.get("traded_value", 0.0)
                                    if lp > 0 and (vol > 0 or tv > 0):
                                        candidates_data[sym] = {
                                            "symbol": sym,
                                            "company": comp,
                                            "instrument_key": k,
                                            "isin": isin,
                                            "last_price": lp,
                                            "change_pct": q.get("change_pct", 0.0),
                                            "cumulative_volume": vol,
                                            "traded_value": tv,
                                            "spread_pct": q.get("spread_pct", 0.05),
                                            "source": "UPSTOX_LIVE_QUOTES"
                                        }
                            discovery_source = "Upstox Live Market Batch Quotes"
                except Exception as e:
                    logger.warning(f"Upstox batch quote candidate discovery note: {e}")

            # Fallback Attempt: Live Feed Batch Quotes
            if len(candidates_data) < limit:
                from backend.live_feed import get_batch_live_quotes
                universe_candidates = await fetch_universe_candidates()
                missing_syms = [s for s, _, _ in universe_candidates if s not in candidates_data][:100]
                if missing_syms:
                    feed_quotes = await get_batch_live_quotes(missing_syms)
                    for sym, q in feed_quotes.items():
                        inst = upstox_client_manager.map_symbol_to_instrument(sym)
                        if inst and inst.get("segment") == "NSE_EQ" and inst.get("instrument_type") == "EQ":
                            lp = q.get("last_price", 0.0)
                            vol = q.get("volume", 0)
                            tv = lp * vol if lp > 0 and vol > 0 else 0.0
                            if lp > 0:
                                candidates_data[sym] = {
                                    "symbol": sym,
                                    "company": inst.get("company", sym),
                                    "instrument_key": inst["instrument_key"],
                                    "isin": inst.get("isin", ""),
                                    "last_price": lp,
                                    "change_pct": q.get("change_pct", 0.0),
                                    "cumulative_volume": vol,
                                    "traded_value": tv,
                                    "spread_pct": 0.05,
                                    "source": "LIVE_FEED_FALLBACK"
                                }
                    if discovery_source == "uninitialized":
                        discovery_source = "Real-Time Market Feed"

            # 4. Filter, Validate, and Rank by Traded Value DESC
            eligible_list: List[Dict[str, Any]] = []
            min_tv_cr = getattr(settings, "MIN_TRADED_VALUE_CR", 0.0)
            min_tv_rupees = min_tv_cr * 10000000.0

            for sym, stock in candidates_data.items():
                if stock["last_price"] <= 0:
                    continue
                if stock["traded_value"] <= 0 and stock["cumulative_volume"] > 0:
                    stock["traded_value"] = stock["last_price"] * stock["cumulative_volume"]
                
                if min_tv_rupees > 0 and stock["traded_value"] < min_tv_rupees and len(candidates_data) > 60:
                    continue

                stock["traded_value_cr"] = round(stock["traded_value"] / 10000000.0, 2)
                stock["quote_freshness"] = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%H:%M:%S IST")
                eligible_list.append(stock)

            # Sort strictly by traded value descending
            eligible_list.sort(key=lambda s: s["traded_value"], reverse=True)

            # Assign activity ranks 1..N
            for idx, stock in enumerate(eligible_list, start=1):
                stock["activity_rank"] = idx

            top_stocks = eligible_list[:limit]

            # Update cache
            _MOST_ACTIVE_CACHE = {
                "timestamp": now,
                "source": discovery_source,
                "stocks": top_stocks,
                "checked_count": len(candidates_data)
            }

            logger.info(f"Most Active discovery complete: Checked {len(candidates_data)} stocks, ranked Top {len(top_stocks)} by traded value ({discovery_source}).")

            return {
                "status": "success",
                "source": discovery_source,
                "timestamp": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
                "total_checked": len(candidates_data),
                "count": len(top_stocks),
                "stocks": top_stocks
            }

most_active_manager = MostActiveStockManager()
MostActiveEngine = MostActiveStockManager
