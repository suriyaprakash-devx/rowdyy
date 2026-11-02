import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

# In-memory quote cache (symbol -> (timestamp, quote_dict))
_LIVE_QUOTE_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_QUOTE_CACHE_TTL = 10.0  # 10 seconds

# In-memory candle cache (cache_key -> (timestamp, candle_list))
_INTRADAY_CANDLE_CACHE: Dict[str, tuple[float, List[List[Any]]]] = {}
_CANDLE_CACHE_TTL = 60.0  # 60 seconds

def get_yahoo_ticker(symbol: str) -> str:
    """Converts NSE symbol to Yahoo Finance ticker format."""
    clean = symbol.strip().upper()
    if clean.startswith("^"):
        return clean
    if not clean.endswith(".NS"):
        return f"{clean}.NS"
    return clean

async def get_live_quote(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Fetches real-time price and volume data via financial market feeds.
    Falls back gracefully when Upstox token is expired or unavailable.
    """
    now = time.time()
    clean_sym = symbol.strip().upper()
    
    if clean_sym in _LIVE_QUOTE_CACHE:
        ts, data = _LIVE_QUOTE_CACHE[clean_sym]
        if (now - ts) < _QUOTE_CACHE_TTL:
            return data

    ticker = get_yahoo_ticker(clean_sym)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("chart", {}).get("result", [])
                if not results:
                    return None
                
                meta = results[0].get("meta", {})
                lp = meta.get("regularMarketPrice", 0.0)
                prev_close = meta.get("chartPreviousClose", meta.get("previousClose", lp))
                vol = meta.get("regularMarketVolume", 0)
                day_high = meta.get("regularMarketDayHigh", lp)
                day_low = meta.get("regularMarketDayLow", lp)
                open_p = meta.get("regularMarketOpen", prev_close)

                chg_pct = round(((lp - prev_close) / prev_close * 100), 2) if prev_close else 0.0
                
                quote = {
                    "symbol": clean_sym,
                    "last_price": round(float(lp), 2),
                    "open": round(float(open_p), 2),
                    "high": round(float(day_high), 2),
                    "low": round(float(day_low), 2),
                    "close": round(float(prev_close), 2),
                    "volume": int(vol),
                    "change_pct": chg_pct,
                    "source": "NSE Live Feed"
                }
                
                _LIVE_QUOTE_CACHE[clean_sym] = (now, quote)
                return quote
    except Exception as e:
        logger.debug(f"Live quote fetch error for {symbol}: {e}")
        
    return None

async def get_batch_live_quotes(symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    """Concurrently fetches quotes for a batch of stocks."""
    import asyncio
    results = {}
    sem = asyncio.Semaphore(15)

    async def fetch_one(sym: str):
        async with sem:
            q = await get_live_quote(sym)
            if q:
                results[sym] = q

    tasks = [fetch_one(s) for s in symbols]
    await asyncio.gather(*tasks, return_exceptions=True)
    return results

def format_quote_as_candle(q: Dict[str, Any]) -> List[Any]:
    """Formats a quote dict into Upstox-style candle format."""
    now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%dT%H:%M:%S+05:30")
    return [
        now_ist,
        q["open"],
        q["high"],
        q["low"],
        q["last_price"],
        q["volume"],
        0
    ]

async def get_intraday_candles_fallback(symbol: str, interval_minutes: int = 10, min_candles: int = 35) -> List[List[Any]]:
    """
    Retrieves intraday candles (5m, 10m, 15m) via real-time market data feed when Upstox token is
    not present or rate-limited. Fetches 5m intraday bars and aggregates into completed bars.
    Returns list of [timestamp, open, high, low, close, volume, 0] formatted newest first.
    """
    now = time.time()
    clean_sym = symbol.strip().upper()
    cache_key = f"{clean_sym}_{interval_minutes}m"

    # Check 60-second candle cache for instant delivery
    if cache_key in _INTRADAY_CANDLE_CACHE:
        c_ts, c_data = _INTRADAY_CANDLE_CACHE[cache_key]
        if (now - c_ts) < _CANDLE_CACHE_TTL and len(c_data) >= min_candles:
            return c_data

    ticker = get_yahoo_ticker(clean_sym)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=5m&range=5d"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("chart", {}).get("result", [])
                if not results:
                    return []
                chart_data = results[0]
                timestamps = chart_data.get("timestamp", [])
                quote = chart_data.get("indicators", {}).get("quote", [{}])[0]
                opens = quote.get("open", [])
                highs = quote.get("high", [])
                lows = quote.get("low", [])
                closes = quote.get("close", [])
                volumes = quote.get("volume", [])

                raw_5m = []
                for i in range(len(timestamps)):
                    if (opens[i] is not None and closes[i] is not None and 
                        highs[i] is not None and lows[i] is not None):
                        raw_5m.append({
                            "ts": timestamps[i],
                            "open": float(opens[i]),
                            "high": float(highs[i]),
                            "low": float(lows[i]),
                            "close": float(closes[i]),
                            "volume": int(volumes[i] or 0)
                        })

                # Group 5m bars strictly by calendar day to prevent cross-session blending
                from collections import defaultdict
                day_buckets = defaultdict(list)
                for b in raw_5m:
                    b_dt = datetime.fromtimestamp(b["ts"], tz=timezone(timedelta(hours=5, minutes=30)))
                    day_buckets[b_dt.date()].append(b)

                step = max(1, interval_minutes // 5)
                aggregated_candles = []
                for d_key in sorted(day_buckets.keys()):
                    d_bars = day_buckets[d_key]
                    if step == 1:
                        # 5-minute bars direct
                        for b in d_bars:
                            dt = datetime.fromtimestamp(b["ts"], tz=timezone(timedelta(hours=5, minutes=30)))
                            ts_str = dt.strftime("%Y-%m-%dT%H:%M:%S+05:30")
                            aggregated_candles.append([
                                ts_str, round(b["open"], 2), round(b["high"], 2),
                                round(b["low"], 2), round(b["close"], 2), b["volume"], 0
                            ])
                    else:
                        # Multi-bar aggregation (e.g. 10m = 2 bars, 15m = 3 bars)
                        for i in range(0, len(d_bars) - step + 1, step):
                            slice_bars = d_bars[i : i + step]
                            b_first = slice_bars[0]
                            b_last = slice_bars[-1]
                            dt = datetime.fromtimestamp(b_first["ts"], tz=timezone(timedelta(hours=5, minutes=30)))
                            ts_str = dt.strftime("%Y-%m-%dT%H:%M:%S+05:30")
                            o = b_first["open"]
                            h = max(b["high"] for b in slice_bars)
                            l = min(b["low"] for b in slice_bars)
                            c = b_last["close"]
                            v = sum(b["volume"] for b in slice_bars)
                            aggregated_candles.append([ts_str, round(o, 2), round(h, 2), round(l, 2), round(c, 2), v, 0])

                # Return newest first to match Upstox candle format
                aggregated_candles.reverse()
                if aggregated_candles:
                    if len(_INTRADAY_CANDLE_CACHE) >= 150 and cache_key not in _INTRADAY_CANDLE_CACHE:
                        oldest = min(_INTRADAY_CANDLE_CACHE.keys(), key=lambda k: _INTRADAY_CANDLE_CACHE[k][0])
                        _INTRADAY_CANDLE_CACHE.pop(oldest, None)
                    _INTRADAY_CANDLE_CACHE[cache_key] = (now, aggregated_candles)
                return aggregated_candles
    except Exception as e:
        logger.debug(f"Intraday fallback candle fetch error for {symbol} ({interval_minutes}m): {e}")

    return []

async def get_intraday_10m_candles_fallback(symbol: str, min_candles: int = 35) -> List[List[Any]]:
    """Legacy backward-compatible wrapper for 10-minute fallback candles."""
    return await get_intraday_candles_fallback(symbol, interval_minutes=10, min_candles=min_candles)
