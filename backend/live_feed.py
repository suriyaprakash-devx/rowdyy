import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger("live_feed")

# Symbol mapping overrides for NSE equities
SYMBOL_MAP = {
    "M&M": "M&M.NS",
    "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
    "L&TFH": "LTF.NS",
    "MCDOWELL-N": "UNITDSPR.NS",
    "NAM-INDIA": "NAM-INDIA.NS",
    "TATACONSUM": "TATACONSUM.NS",
    "TATAMOTORS": "TATAMTR.NS",
    "LTIM": "LTIM.NS",
    "NIFTY": "^NSEI",
    "NIFTY 50": "^NSEI"
}

def get_yahoo_ticker(symbol: str) -> str:
    clean = symbol.strip().upper()
    if clean in SYMBOL_MAP:
        return SYMBOL_MAP[clean]
    clean_mapped = clean.replace("&", "_")
    return f"{clean_mapped}.NS" if not clean_mapped.endswith(".NS") else clean_mapped

# In-memory quote cache with 10-second TTL
_QUOTE_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TIMESTAMP: float = 0.0
_CACHE_LOCK = asyncio.Lock()

# In-memory 10-minute candle cache with 60-second TTL
_INTRADAY_CANDLE_CACHE: Dict[str, Any] = {}
_CANDLE_CACHE_LOCK = asyncio.Lock()

async def fetch_single_live_quote(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    ticker = get_yahoo_ticker(symbol)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=2d"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    try:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("chart", {}).get("result", [])
            if results:
                meta = results[0].get("meta", {})
                last_price = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
                prev_close = meta.get("chartPreviousClose") or last_price
                if last_price:
                    day_open = meta.get("regularMarketDayOpen") or last_price
                    day_high = meta.get("regularMarketDayHigh") or last_price
                    day_low = meta.get("regularMarketDayLow") or last_price
                    volume = meta.get("regularMarketVolume") or 0
                    change = round(float(last_price) - float(prev_close), 2) if prev_close else 0.0
                    change_pct = round((change / float(prev_close)) * 100, 2) if prev_close else 0.0
                    now_ts = int(time.time())

                    return {
                        "symbol": symbol.upper(),
                        "ticker": ticker,
                        "last_price": round(float(last_price), 2),
                        "open": round(float(day_open), 2),
                        "high": round(float(day_high), 2),
                        "low": round(float(day_low), 2),
                        "close": round(float(prev_close), 2),
                        "volume": int(volume),
                        "change": change,
                        "change_pct": change_pct,
                        "timestamp": now_ts
                    }
    except Exception as e:
        logger.debug(f"Error fetching live quote for {symbol}: {e}")
    return None

async def get_batch_live_quotes(symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Asynchronously retrieves real-time live quotes for a list of symbols.
    Uses in-memory cache to ensure extreme performance and prevent rate limiting.
    """
    global _QUOTE_CACHE, _CACHE_TIMESTAMP

    now = time.time()
    clean_symbols = [s.strip().upper() for s in symbols if s.strip()]
    if not clean_symbols:
        return {}

    # Check if all requested symbols are in cache and still fresh (< 10s)
    missing = [s for s in clean_symbols if s not in _QUOTE_CACHE or (now - _QUOTE_CACHE[s].get("_cached_at", 0)) > 10.0]
    if not missing:
        return {s: _QUOTE_CACHE[s] for s in clean_symbols if s in _QUOTE_CACHE}

    # Fetch missing quotes concurrently with high-speed semaphore
    semaphore = asyncio.Semaphore(25)

    async with httpx.AsyncClient(timeout=4.5) as client:
        async def worker(sym: str):
            async with semaphore:
                quote = await fetch_single_live_quote(client, sym)
                if quote:
                    quote["_cached_at"] = now
                    async with _CACHE_LOCK:
                        _QUOTE_CACHE[sym] = quote

        await asyncio.gather(*[worker(s) for s in missing], return_exceptions=True)

    return {s: _QUOTE_CACHE[s] for s in clean_symbols if s in _QUOTE_CACHE}

async def get_today_live_candle(symbol: str) -> Optional[List[Any]]:
    """
    Synthesizes today's current daily candle for an NSE stock in Upstox candle format:
    [timestamp, open, high, low, close, volume, open_interest]
    """
    quotes = await get_batch_live_quotes([symbol])
    q = quotes.get(symbol.upper())
    if not q:
        return None

    ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    timestamp = f"{ist_now.strftime('%Y-%m-%d')}T00:00:00+05:30"
    return [
        timestamp,
        q["open"],
        q["high"],
        q["low"],
        q["last_price"],
        q["volume"],
        0
    ]

async def get_intraday_10m_candles_fallback(symbol: str, min_candles: int = 35) -> List[List[Any]]:
    """
    Retrieves intraday 10-minute candles via real-time market data feed when Upstox token is
    not present or rate-limited. Fetches 5m intraday bars and aggregates into completed 10m bars.
    Returns list of [timestamp, open, high, low, close, volume, 0] formatted newest first.
    """
    now = time.time()
    clean_sym = symbol.strip().upper()

    # Check 60-second candle cache for instant delivery
    if clean_sym in _INTRADAY_CANDLE_CACHE:
        c_ts, c_data = _INTRADAY_CANDLE_CACHE[clean_sym]
        if (now - c_ts) < 60.0 and len(c_data) >= min_candles:
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

                candles_10m = []
                for d_key in sorted(day_buckets.keys()):
                    d_bars = day_buckets[d_key]
                    for i in range(0, len(d_bars) - 1, 2):
                        b1 = d_bars[i]
                        b2 = d_bars[i + 1]
                        dt = datetime.fromtimestamp(b1["ts"], tz=timezone(timedelta(hours=5, minutes=30)))
                        ts_str = dt.strftime("%Y-%m-%dT%H:%M:%S+05:30")
                        o = b1["open"]
                        h = max(b1["high"], b2["high"])
                        l = min(b1["low"], b2["low"])
                        c = b2["close"]
                        v = b1["volume"] + b2["volume"]
                        candles_10m.append([ts_str, round(o, 2), round(h, 2), round(l, 2), round(c, 2), v, 0])

                # Return newest first to match Upstox candle format
                candles_10m.reverse()
                if candles_10m:
                    if len(_INTRADAY_CANDLE_CACHE) >= 100 and clean_sym not in _INTRADAY_CANDLE_CACHE:
                        oldest = min(_INTRADAY_CANDLE_CACHE.keys(), key=lambda k: _INTRADAY_CANDLE_CACHE[k][0])
                        _INTRADAY_CANDLE_CACHE.pop(oldest, None)
                    _INTRADAY_CANDLE_CACHE[clean_sym] = (now, candles_10m)
                return candles_10m
    except Exception as e:
        logger.debug(f"Intraday fallback candle fetch error for {symbol}: {e}")

    return []
