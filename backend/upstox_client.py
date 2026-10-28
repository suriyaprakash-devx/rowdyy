import asyncio
import gzip
import json
import logging
import os
import time
import urllib.parse
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import httpx
import upstox_client
from upstox_client.rest import ApiException

logger = logging.getLogger(__name__)

UPSTOX_NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
UPSTOX_COMPLETE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz"
UPSTOX_HISTORICAL_API = "https://api.upstox.com/v2/historical-candle"
UPSTOX_INTRADAY_API = "https://api.upstox.com/v2/historical-candle/intraday"
UPSTOX_QUOTE_OHLC_API = "https://api.upstox.com/v2/market-quote/ohlc"

CACHE_DIR = Path("./data")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
INSTRUMENT_CACHE_FILE = CACHE_DIR / "upstox_nse_eq_instruments.json"
CACHE_TTL_HOURS = 24

class UpstoxClientManager:
    """
    Manages communication with Upstox API v2 and instrument mappings.
    Combines official Upstox SDK configurations and high-performance async HTTP client
    with rate-limiting, retries, and local instrument caching.
    """

    def __init__(self):
        self._instrument_map: Dict[str, Dict[str, Any]] = {}  # Symbol -> Instrument
        self._isin_map: Dict[str, Dict[str, Any]] = {}        # ISIN -> Instrument
        self._last_loaded: Optional[float] = None
        self._lock = asyncio.Lock()

    def get_sdk_api_client(self, access_token: str) -> upstox_client.ApiClient:
        """
        Instantiates the official Upstox Python SDK ApiClient configured with the user's access token.
        """
        configuration = upstox_client.Configuration()
        configuration.access_token = access_token
        return upstox_client.ApiClient(configuration)

    async def get_nse_instruments(self, force_refresh: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        Loads the official Upstox NSE instrument master JSON, filtering strictly for:
        - segment = 'NSE_EQ'
        - instrument_type = 'EQ'
        Filters out derivatives, BSE, ETFs, indices, and expired contracts.
        Caches locally to disk for 24 hours.
        """
        async with self._lock:
            now = time.time()
            # Check in-memory cache
            if not force_refresh and self._instrument_map and self._last_loaded and (now - self._last_loaded < CACHE_TTL_HOURS * 3600):
                return self._instrument_map

            # Check disk cache
            if not force_refresh and INSTRUMENT_CACHE_FILE.exists():
                try:
                    file_age = now - INSTRUMENT_CACHE_FILE.stat().st_mtime
                    if file_age < CACHE_TTL_HOURS * 3600:
                        with open(INSTRUMENT_CACHE_FILE, "r", encoding="utf-8") as f:
                            cached_data = json.load(f)
                            self._instrument_map = cached_data.get("symbol_map", {})
                            self._isin_map = cached_data.get("isin_map", {})
                            self._last_loaded = now
                            logger.info(f"Loaded {len(self._instrument_map)} NSE_EQ instruments from disk cache.")
                            return self._instrument_map
                except Exception as e:
                    logger.warning(f"Failed to read instruments disk cache: {e}")

            # Download fresh instrument master
            logger.info("Downloading official Upstox NSE instrument master JSON...")
            raw_instruments = await self._download_instrument_master()
            symbol_map: Dict[str, Dict[str, Any]] = {}
            isin_map: Dict[str, Dict[str, Any]] = {}

            count_total = len(raw_instruments)
            for item in raw_instruments:
                # Strictly filter for segment = 'NSE_EQ' and instrument_type = 'EQ'
                segment = item.get("segment")
                inst_type = item.get("instrument_type")
                if segment != "NSE_EQ" or inst_type != "EQ":
                    continue

                # Ensure valid instrument key
                instrument_key = item.get("instrument_key", "")
                if not instrument_key or not instrument_key.startswith("NSE_EQ|"):
                    continue

                symbol = item.get("trading_symbol", "").strip()
                company_name = item.get("name", "").strip()
                isin = item.get("isin", "").strip()

                if not symbol:
                    continue

                entry = {
                    "symbol": symbol,
                    "company": company_name,
                    "isin": isin,
                    "instrument_key": instrument_key,
                    "exchange": item.get("exchange", "NSE"),
                    "segment": segment,
                    "instrument_type": inst_type,
                    "lot_size": item.get("lot_size", 1),
                    "tick_size": item.get("tick_size", 0.05)
                }
                symbol_map[symbol] = entry
                if isin:
                    isin_map[isin] = entry

            self._instrument_map = symbol_map
            self._isin_map = isin_map
            self._last_loaded = now
            logger.info(f"Processed {count_total} Upstox instruments -> Extracted {len(symbol_map)} valid NSE_EQ stocks.")

            # Save to disk cache
            try:
                with open(INSTRUMENT_CACHE_FILE, "w", encoding="utf-8") as f:
                    json.dump({"symbol_map": symbol_map, "isin_map": isin_map, "timestamp": now}, f)
            except Exception as e:
                logger.warning(f"Failed to write instruments disk cache: {e}")

            return self._instrument_map

    async def _download_instrument_master(self) -> List[Dict[str, Any]]:
        """
        Downloads and decompresses the official Upstox NSE instrument master JSON.
        """
        headers = {"User-Agent": "UpstoxScanner/1.0", "Accept-Encoding": "gzip"}
        urls = [UPSTOX_NSE_INSTRUMENTS_URL, UPSTOX_COMPLETE_INSTRUMENTS_URL]

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for url in urls:
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        content = resp.content
                        # Decompress if gzipped
                        if content[:2] == b'\x1f\x8b':
                            decompressed = gzip.decompress(content)
                            return json.loads(decompressed.decode("utf-8"))
                        else:
                            return json.loads(content.decode("utf-8"))
                except Exception as e:
                    logger.warning(f"Error downloading from {url}: {e}")

        # If download fails, check if we have older cached file
        if INSTRUMENT_CACHE_FILE.exists():
            with open(INSTRUMENT_CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return list(data.get("symbol_map", {}).values())

        raise RuntimeError("Unable to download Upstox NSE instrument master and no cache available.")

    def _load_disk_cache_sync(self):
        """Synchronously populates in-memory maps from disk cache if present."""
        if INSTRUMENT_CACHE_FILE.exists():
            try:
                with open(INSTRUMENT_CACHE_FILE, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                    self._instrument_map = cached_data.get("symbol_map", {})
                    self._isin_map = cached_data.get("isin_map", {})
                    self._last_loaded = time.time()
                    logger.info(f"Synchronously loaded {len(self._instrument_map)} NSE_EQ instruments from disk cache.")
            except Exception as e:
                logger.warning(f"Failed to read instruments disk cache synchronously: {e}")

    def map_symbol_to_instrument(self, symbol: str, isin: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Maps a symbol or ISIN to its Upstox instrument details.
        Auto-loads disk cache if in-memory map is not yet populated.
        """
        sym_clean = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        if not self._instrument_map:
            self._load_disk_cache_sync()

        if sym_clean in self._instrument_map:
            return self._instrument_map[sym_clean]
        if isin and isin.strip().upper() in self._isin_map:
            return self._isin_map[isin.strip().upper()]

        return {
            "instrument_key": f"NSE_EQ|{sym_clean}",
            "exchange": "NSE_EQ",
            "symbol": sym_clean,
            "name": sym_clean,
            "instrument_type": "EQ"
        }

    async def fetch_intraday_candles_v3(
        self,
        instrument_key: str,
        unit: str = "minutes",
        interval: str = "10",
        access_token: Optional[str] = None
    ) -> List[List[Any]]:
        """
        Fetches intraday candles for the current session using Upstox API v3.
        Endpoint: GET /v3/historical-candle/intraday/{instrument_key}/{unit}/{interval}
        Returns list of candles [timestamp, open, high, low, close, volume, oi] (newest first).
        """
        encoded_key = urllib.parse.quote(instrument_key)
        url = f"https://api.upstox.com/v3/historical-candle/intraday/{encoded_key}/{unit}/{interval}"
        headers = {"Accept": "application/json", "User-Agent": "UpstoxScanner/1.0"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            for attempt in range(3):
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data.get("data", {}).get("candles", [])
                    elif resp.status_code == 429:
                        backoff = (attempt + 1) * 0.75
                        logger.warning(f"Upstox rate limit (429) for {instrument_key}. Retrying in {backoff:.1f}s...")
                        await asyncio.sleep(backoff)
                    elif resp.status_code == 401:
                        raise HTTPException_401("Upstox authentication expired. Please reconnect your Upstox account.")
                    else:
                        logger.debug(f"Upstox intraday v3 {resp.status_code} for {instrument_key}: {resp.text[:100]}")
                        await asyncio.sleep(0.3)
                except HTTPException_401:
                    raise
                except Exception as e:
                    if attempt == 2:
                        logger.debug(f"Failed to fetch v3 intraday candles for {instrument_key}: {e}")
                    await asyncio.sleep(0.3)
        return []

    async def fetch_historical_candles_v3(
        self,
        instrument_key: str,
        to_date: str,
        from_date: str,
        unit: str = "minutes",
        interval: str = "10",
        access_token: Optional[str] = None
    ) -> List[List[Any]]:
        """
        Fetches historical multi-day candles with custom interval using Upstox API v3.
        Endpoint: GET /v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}/{from_date}
        """
        encoded_key = urllib.parse.quote(instrument_key)
        url = f"https://api.upstox.com/v3/historical-candle/{encoded_key}/{unit}/{interval}/{to_date}/{from_date}"
        headers = {"Accept": "application/json", "User-Agent": "UpstoxScanner/1.0"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"

        async with httpx.AsyncClient(timeout=12.0) as client:
            for attempt in range(3):
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data.get("data", {}).get("candles", [])
                    elif resp.status_code == 429:
                        backoff = (attempt + 1) * 0.75
                        await asyncio.sleep(backoff)
                    elif resp.status_code == 401:
                        raise HTTPException_401("Upstox authentication expired.")
                    else:
                        await asyncio.sleep(0.3)
                except HTTPException_401:
                    raise
                except Exception as e:
                    await asyncio.sleep(0.3)
        return []

    async def fetch_10m_candles(
        self,
        instrument_key: str,
        symbol: Optional[str] = None,
        min_candles: int = 35,
        access_token: Optional[str] = None
    ) -> List[List[Any]]:
        """
        Fetches completed 10-minute candles for the stock.
        Combines current day v3 intraday 10-minute candles with prior days if needed,
        ensuring at least min_candles (default 35) are available to compute SMA 6 and SMA 30.
        """
        candles: List[List[Any]] = []
        if access_token:
            # 1. Fetch current day intraday 10-minute candles
            try:
                candles = await self.fetch_intraday_candles_v3(
                    instrument_key=instrument_key,
                    unit="minutes",
                    interval="10",
                    access_token=access_token
                )
            except HTTPException_401:
                raise
            except Exception as e:
                logger.debug(f"V3 intraday fetch error for {instrument_key}: {e}")

            # 2. If fewer than min_candles, fetch previous trading days to fill history
            if len(candles) < min_candles:
                now = datetime.now()
                to_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
                from_date = (now - timedelta(days=5)).strftime("%Y-%m-%d")
                try:
                    hist_candles = await self.fetch_historical_candles_v3(
                        instrument_key=instrument_key,
                        to_date=to_date,
                        from_date=from_date,
                        unit="minutes",
                        interval="10",
                        access_token=access_token
                    )
                    if hist_candles:
                        # Append historical bars (both are newest first, so existing candles come before hist_candles)
                        candles = candles + hist_candles
                except Exception as e:
                    logger.debug(f"V3 historical 10m fetch error for {instrument_key}: {e}")

        # Fallback to local / live feed synthesis if Upstox candles insufficient or no token
        if len(candles) < min_candles and symbol:
            try:
                from backend.live_feed import get_intraday_10m_candles_fallback
                fallback_candles = await get_intraday_10m_candles_fallback(symbol, min_candles=min_candles)
                if fallback_candles and len(fallback_candles) >= len(candles):
                    candles = fallback_candles
            except Exception as e:
                logger.debug(f"Intraday fallback error for {symbol}: {e}")

        return candles

    async def fetch_batch_quotes(
        self,
        instrument_keys: List[str],
        access_token: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetches live market quotes for multiple instrument keys in batches.
        Upstox API v2 market quotes endpoint accepts comma-separated instrument keys (up to 50).
        Returns mapping: instrument_key -> quote dict with last_price, volume, vwap, depth/spread.
        """
        results: Dict[str, Dict[str, Any]] = {}
        if not instrument_keys:
            return results

        clean_keys = [k for k in instrument_keys if k and k.startswith("NSE_EQ|")]
        batch_size = 50
        headers = {"Accept": "application/json", "User-Agent": "UpstoxScanner/1.0"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"

        async with httpx.AsyncClient(timeout=12.0) as client:
            for i in range(0, len(clean_keys), batch_size):
                batch = clean_keys[i:i + batch_size]
                encoded_keys = ",".join([urllib.parse.quote(k) for k in batch])
                url = f"https://api.upstox.com/v2/market-quote/quotes?instrument_key={encoded_keys}"
                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json().get("data", {})
                        for key_raw, q in data.items():
                            # Upstox returns keys like 'NSE_EQ:RELIANCE' or 'NSE_EQ|INE...'
                            ohlc = q.get("ohlc", {})
                            last_price = float(q.get("last_price", 0.0) or 0.0)
                            volume = int(q.get("volume", 0) or 0)
                            vwap = float(q.get("average_price", 0.0) or last_price or 0.0)
                            prev_close = float(ohlc.get("close", 0.0) or last_price or 0.0)
                            change = round(last_price - prev_close, 2) if prev_close else 0.0
                            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

                            # Bid-Ask spread
                            depth = q.get("depth", {})
                            buy_depth = depth.get("buy", [])
                            sell_depth = depth.get("sell", [])
                            best_bid = float(buy_depth[0].get("price", 0.0)) if buy_depth else 0.0
                            best_ask = float(sell_depth[0].get("price", 0.0)) if sell_depth else 0.0
                            spread_pct = round(((best_ask - best_bid) / last_price) * 100, 3) if last_price and best_ask > best_bid else 0.0

                            # Traded value calculation
                            traded_value = vwap * volume if vwap > 0 else last_price * volume

                            matched_key = None
                            for original_k in batch:
                                if original_k in key_raw or key_raw in original_k:
                                    matched_key = original_k
                                    break
                            inst_key = matched_key or key_raw

                            results[inst_key] = {
                                "instrument_key": inst_key,
                                "symbol": q.get("trading_symbol", "").upper(),
                                "last_price": last_price,
                                "open": float(ohlc.get("open", 0.0)),
                                "high": float(ohlc.get("high", 0.0)),
                                "low": float(ohlc.get("low", 0.0)),
                                "close": prev_close,
                                "volume": volume,
                                "vwap": vwap,
                                "change": change,
                                "change_pct": change_pct,
                                "traded_value": traded_value,
                                "best_bid": best_bid,
                                "best_ask": best_ask,
                                "spread_pct": spread_pct,
                                "timestamp": int(time.time())
                            }
                    elif resp.status_code == 429:
                        await asyncio.sleep(1.0)
                    elif resp.status_code == 401:
                        raise HTTPException_401("Upstox authentication expired.")
                except HTTPException_401:
                    raise
                except Exception as e:
                    logger.debug(f"Batch quote error for batch {i//batch_size}: {e}")
                await asyncio.sleep(0.15)  # Respect rate limit (max 10 req/s)

        return results

    async def fetch_historical_daily_candles(
        self,
        instrument_key: str,
        symbol: Optional[str] = None,
        days_back: int = 100,
        access_token: Optional[str] = None,
        include_current_day: bool = True
    ) -> List[List[Any]]:
        """
        Fetches completed daily historical OHLCV candles from Upstox Historical Candle API.
        Format per candle: [timestamp, open, high, low, close, volume, open_interest]
        If include_current_day is True and today's completed or current forming candle is not
        in historical daily data, it retrieves today's intraday candle and appends it.
        """
        now = datetime.now()
        to_date = now.strftime("%Y-%m-%d")
        from_date = (now - timedelta(days=days_back)).strftime("%Y-%m-%d")

        encoded_key = urllib.parse.quote(instrument_key)
        daily_url = f"{UPSTOX_HISTORICAL_API}/{encoded_key}/day/{to_date}/{from_date}"

        headers = {
            "Accept": "application/json",
            "User-Agent": "UpstoxScanner/1.0"
        }
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"

        candles: List[List[Any]] = []
        max_retries = 3

        async with httpx.AsyncClient(timeout=12.0) as client:
            for attempt in range(max_retries):
                try:
                    resp = await client.get(daily_url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        candles = data.get("data", {}).get("candles", [])
                        break
                    elif resp.status_code == 429:
                        backoff = (attempt + 1) * 0.8
                        logger.warning(f"Upstox rate limit (429) on {instrument_key}. Retrying in {backoff:.1f}s...")
                        await asyncio.sleep(backoff)
                    elif resp.status_code == 401:
                        raise HTTPException_401("Upstox authentication expired. Please reconnect your Upstox account.")
                    else:
                        logger.warning(f"Upstox daily candle HTTP {resp.status_code} for {instrument_key}: {resp.text[:120]}")
                        await asyncio.sleep(0.3)
                except HTTPException_401:
                    raise
                except Exception as e:
                    if attempt == max_retries - 1:
                        logger.error(f"Failed to fetch daily candles for {instrument_key} after {max_retries} attempts: {e}")
                    await asyncio.sleep(0.4)

            # Check if today's candle needs to be fetched and incorporated
            if include_current_day:
                today_str = now.strftime("%Y-%m-%d")
                has_today = any(c[0].startswith(today_str) for c in candles)

                if not has_today:
                    today_candle = await self._fetch_current_day_candle(client, encoded_key, headers, today_str, symbol=symbol)
                    if today_candle:
                        candles.insert(0, today_candle)

        return candles

    async def _fetch_current_day_candle(
        self,
        client: httpx.AsyncClient,
        encoded_key: str,
        headers: Dict[str, str],
        today_str: str,
        symbol: Optional[str] = None
    ) -> Optional[List[Any]]:
        """
        Synthesizes today's current day candle from Upstox 1-minute or 30-minute intraday API,
        quotes endpoint, or live feed fallback, ensuring today's data is factored into SMA calculations.
        """
        intraday_url = f"{UPSTOX_INTRADAY_API}/{encoded_key}/1minute"
        try:
            resp = await client.get(intraday_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                intraday_candles = data.get("data", {}).get("candles", [])
                if intraday_candles:
                    today_open = intraday_candles[-1][1]
                    today_high = max(c[2] for c in intraday_candles)
                    today_low = min(c[3] for c in intraday_candles)
                    today_close = intraday_candles[0][4]  # latest close
                    today_volume = sum(c[5] for c in intraday_candles)
                    today_oi = intraday_candles[0][6] if len(intraday_candles[0]) > 6 else 0
                    timestamp = f"{today_str}T00:00:00+05:30"
                    return [timestamp, today_open, today_high, today_low, today_close, today_volume, today_oi]
        except Exception as e:
            logger.debug(f"Unable to fetch intraday candle for {encoded_key}: {e}")

        # Fallback to Upstox Market Quote OHLC API
        try:
            quote_url = f"{UPSTOX_QUOTE_OHLC_API}?instrument_key={encoded_key}&interval=1d"
            resp = await client.get(quote_url, headers=headers)
            if resp.status_code == 200:
                qdata = resp.json().get("data", {})
                for k, val in qdata.items():
                    ohlc = val.get("ohlc", {})
                    last_price = val.get("last_price", 0.0)
                    if ohlc and last_price:
                        return [
                            f"{today_str}T00:00:00+05:30",
                            ohlc.get("open", last_price),
                            ohlc.get("high", last_price),
                            ohlc.get("low", last_price),
                            last_price,
                            val.get("volume", 0),
                            val.get("oi", 0)
                        ]
        except Exception as e:
            logger.debug(f"Quote OHLC fallback error for {encoded_key}: {e}")

        # Live Feed Fallback: Real-time NSE quote engine
        if symbol:
            try:
                from backend.live_feed import get_today_live_candle
                live_candle = await get_today_live_candle(symbol)
                if live_candle:
                    return live_candle
            except Exception as e:
                logger.debug(f"Live feed fallback error for {symbol}: {e}")

        return None

class HTTPException_401(Exception):
    pass

upstox_client_manager = UpstoxClientManager()


