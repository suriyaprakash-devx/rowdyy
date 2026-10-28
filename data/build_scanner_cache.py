import asyncio
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.universe import get_combined_stock_universe, _fetch_constituent_csv, NIFTY_100_URLS
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

NIFTY_50_URLS = [
    "https://niftyindices.com/IndexConstituent/ind_nifty50list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty50list.csv"
]

def map_yahoo_ticker(sym: str) -> str:
    overrides = {
        "M&M": "M&M.NS",
        "M&MFIN": "M&MFIN.NS",
        "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
        "TATAMOTORS": "TATAMTR.NS",
        "LTIM": "LTIM.NS"
    }
    return overrides.get(sym, f"{sym}.NS")

async def build_cache_async():
    logger.info("Starting high-speed scanner data cache build for NIFTY 200 universe...")
    t0 = time.time()

    # 1. Fetch universe
    universe = await get_combined_stock_universe()
    logger.info(f"Loaded {len(universe)} stocks in combined NIFTY universe.")

    # 2. Fetch Nifty 50 and Nifty 100 constituents for flags
    n50_raw = await _fetch_constituent_csv(NIFTY_50_URLS)
    n50_set = {s[0].upper() for s in n50_raw} if n50_raw else set()

    n100_raw = await _fetch_constituent_csv(NIFTY_100_URLS)
    n100_set = {s[0].upper() for s in n100_raw} if n100_raw else set()

    ticker_to_meta = {}
    for item in universe:
        sym = item["symbol"].upper()
        comp = item["company"]
        token = item["instrument_key"]
        y_tick = map_yahoo_ticker(sym)

        ticker_to_meta[y_tick] = {
            "symbol": sym,
            "company_name": comp,
            "instrument_token": token,
            "nifty_flags": {
                "nifty50": sym in n50_set,
                "nifty100": sym in n100_set,
                "nifty200": True
            }
        }

    all_tickers = list(ticker_to_meta.keys())
    logger.info(f"Downloading daily candles for {len(all_tickers)} NSE equities via yfinance...")

    # Batch download past 6 months to guarantee > 30 daily candles
    raw_df = yf.download(all_tickers, period="6mo", interval="1d", group_by="ticker", progress=False)

    stocks_result = []
    success_count = 0

    for y_tick, meta in ticker_to_meta.items():
        try:
            if y_tick in raw_df.columns.levels[0]:
                sub_df = raw_df[y_tick].dropna(how="all")
            else:
                logger.warning(f"Ticker {y_tick} not found in yfinance download results.")
                continue

            candles = []
            for dt, row in sub_df.iterrows():
                try:
                    c_open = float(row["Open"])
                    c_high = float(row["High"])
                    c_low = float(row["Low"])
                    c_close = float(row["Close"])
                    c_vol = float(row["Volume"])
                    if any(c is None or c != c for c in [c_open, c_high, c_low, c_close, c_vol]):
                        continue
                    dt_str = dt.strftime("%Y-%m-%d")
                    candles.append({
                        "date": dt_str,
                        "open": round(c_open, 2),
                        "high": round(c_high, 2),
                        "low": round(c_low, 2),
                        "close": round(c_close, 2),
                        "volume": int(c_vol)
                    })
                except Exception:
                    continue

            if len(candles) >= 25:
                success_count += 1
                stocks_result.append({
                    "symbol": meta["symbol"],
                    "company_name": meta["company_name"],
                    "instrument_token": meta["instrument_token"],
                    "nifty_flags": meta["nifty_flags"],
                    "daily_candles": candles
                })
            else:
                logger.warning(f"Insufficient candles for {meta['symbol']} ({len(candles)} < 25)")
        except Exception as e:
            logger.warning(f"Error processing {y_tick}: {e}")

    payload = {
        "metadata": {
            "total_stocks": len(stocks_result),
            "scan_timestamp": datetime.now().isoformat(),
            "volume_lookback": 20,
            "volume_multiplier": 3,
            "price_lookback": 20,
            "max_breakout_age": 20,
            "midpoint_tolerance_pct": 1.0,
            "source": "NSE_DAILY_MASTER"
        },
        "stocks": stocks_result
    }

    out_path = Path(__file__).resolve().parent / "scanner_data_cache.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    logger.info(f"Done! Saved {success_count} stocks to {out_path} in {time.time()-t0:.2f}s")
    return success_count

def build_cache():
    return asyncio.run(build_cache_async())

if __name__ == "__main__":
    build_cache()
