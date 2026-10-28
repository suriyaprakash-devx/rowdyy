import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
import pandas as pd
import numpy as np
from backend.config import settings

logger = logging.getLogger(__name__)

# Deduplication cache: stores set of (symbol, signal_type, crossover_timestamp)
_ALERTED_SIGNALS: set = set()

def is_candle_completed(
    candle_ts: Any,
    current_time: Optional[Any] = None,
    candle_interval_minutes: int = 10,
    interval_minutes: Optional[int] = None
) -> bool:
    """
    Checks if a candle is fully completed based on IST time.
    A candle starting at T is completed only after T + candle_interval_minutes.
    Supports injecting custom current_time for backtesting or tests.
    """
    if interval_minutes is not None:
        candle_interval_minutes = interval_minutes

    try:
        if isinstance(candle_ts, str):
            dt = pd.to_datetime(candle_ts)
        elif isinstance(candle_ts, (int, float)):
            dt = datetime.fromtimestamp(candle_ts, tz=timezone(timedelta(hours=5, minutes=30)))
        else:
            dt = candle_ts

        # Determine reference current time
        if current_time is not None:
            now_ist = current_time
        else:
            now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))

        # Timezone harmonization
        if hasattr(dt, 'tzinfo') and dt.tzinfo is not None:
            if not hasattr(now_ist, 'tzinfo') or now_ist.tzinfo is None:
                now_ist = now_ist.replace(tzinfo=dt.tzinfo)
        elif hasattr(now_ist, 'tzinfo') and now_ist.tzinfo is not None:
            if not hasattr(dt, 'tzinfo') or dt.tzinfo is None:
                dt = dt.replace(tzinfo=now_ist.tzinfo)

        # Close time of candle
        close_time = dt + timedelta(minutes=candle_interval_minutes)
        return now_ist >= close_time
    except Exception:
        return True  # If unable to parse, default to safe completion assumption

def filter_completed_candles(
    candles: Any,
    current_time: Optional[Any] = None,
    candle_interval_minutes: int = 10,
    interval_minutes: Optional[int] = None
) -> Any:
    """
    Filters candle data to retain only completed 10-minute bars.
    Supports either:
    1. List of candles in Upstox format [timestamp, open, high, low, close, volume, oi] (newest first).
    2. pandas DataFrame with a 'timestamp' column.
    """
    if interval_minutes is not None:
        candle_interval_minutes = interval_minutes

    if isinstance(candles, pd.DataFrame):
        df = candles.copy()
        if "timestamp" in df.columns:
            mask = df["timestamp"].apply(lambda ts: is_candle_completed(ts, current_time, candle_interval_minutes))
            return df[mask].reset_index(drop=True)
        return df


    if not candles:
        return []

    # Newest candle is at index 0 in Upstox API
    newest = candles[0]
    start_idx = 0
    if not is_candle_completed(newest[0], current_time, candle_interval_minutes):
        # Discard the active incomplete candle
        start_idx = 1

    completed = candles[start_idx:]
    # Reverse to chronological order (oldest first)
    return completed[::-1]


class SMA6_30Strategy:
    """
    Evaluates completed 10-minute candles using the SMA 6/30 crossover strategy
    with relative volume, price-action confirmation, and liquidity filters.
    """

    def __init__(
        self,
        fast_period: int = 6,
        slow_period: int = 30,
        min_rel_volume: float = 1.5,
        min_traded_value_cr: float = 5.0,
        max_spread_pct: float = 0.5
    ):
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.min_rel_volume = min_rel_volume
        self.min_traded_value_cr = min_traded_value_cr
        self.max_spread_pct = max_spread_pct

    def analyze_stock(
        self,
        symbol: str,
        company: str,
        raw_candles: List[List[Any]],
        activity_rank: int = 1,
        session_traded_value_cr: float = 0.0,
        bid_ask_spread_pct: float = 0.05
    ) -> Optional[Dict[str, Any]]:
        """
        Analyzes completed 10-minute candles for a stock.
        Returns a rich alert dictionary containing:
        - SMA 6, SMA 30, Relative Volume, Price Action Confirmation
        - Status: BUY, SELL, or WATCH (Unconfirmed / Ongoing)
        - Composite Signal Score (0 - 100)
        - Human-readable confirmation explanations
        """
        chronological = filter_completed_candles(raw_candles, candle_interval_minutes=10)
        if len(chronological) < (self.slow_period + 1):
            logger.debug(f"{symbol}: Insufficient completed candles ({len(chronological)} < {self.slow_period + 1}).")
            return None

        # Create DataFrame
        df = pd.DataFrame(chronological, columns=["timestamp", "open", "high", "low", "close", "volume", "oi"])
        df["close"] = pd.to_numeric(df["close"], errors="coerce")
        df["open"] = pd.to_numeric(df["open"], errors="coerce")
        df["high"] = pd.to_numeric(df["high"], errors="coerce")
        df["low"] = pd.to_numeric(df["low"], errors="coerce")
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)

        # Drop any row with NaN close
        df = df.dropna(subset=["close"]).reset_index(drop=True)
        n = len(df)
        if n < (self.slow_period + 1):
            return None

        # Compute SMAs on completed candle closes
        df["sma6"] = df["close"].rolling(window=self.fast_period).mean()
        df["sma30"] = df["close"].rolling(window=self.slow_period).mean()

        # Volume Baseline: 20-period completed 10-minute candle volume moving average
        df["vol_baseline"] = df["volume"].rolling(window=20, min_periods=5).mean()

        # Current completed candle (bar n-1)
        curr_bar = df.iloc[-1]
        prev_bar = df.iloc[-2]

        curr_close = float(curr_bar["close"])
        curr_open = float(curr_bar["open"])
        curr_high = float(curr_bar["high"])
        curr_low = float(curr_bar["low"])
        curr_vol = float(curr_bar["volume"])
        curr_sma6 = float(curr_bar["sma6"])
        curr_sma30 = float(curr_bar["sma30"])

        prev_high = float(prev_bar["high"])
        prev_low = float(prev_bar["low"])
        prev_sma6 = float(prev_bar["sma6"])
        prev_sma30 = float(prev_bar["sma30"])

        # Relative Volume calculation
        baseline_vol = float(curr_bar["vol_baseline"]) if not pd.isna(curr_bar["vol_baseline"]) and curr_bar["vol_baseline"] > 0 else (curr_vol or 1.0)
        rel_vol = round(curr_vol / baseline_vol, 2) if baseline_vol > 0 else 1.0

        candle_timestamp_str = str(curr_bar["timestamp"])

        # Liquidity Check
        spread_valid = bid_ask_spread_pct <= self.max_spread_pct
        liquidity_valid = spread_valid and (session_traded_value_cr >= self.min_traded_value_cr or session_traded_value_cr == 0.0)

        # Check for Crossover on the latest completed candle
        is_bullish_cross = (prev_sma6 <= prev_sma30) and (curr_sma6 > curr_sma30)
        is_bearish_cross = (prev_sma6 >= prev_sma30) and (curr_sma6 < curr_sma30)

        # If no crossover on current bar, check if a crossover occurred within the last 3 completed bars (freshness)
        crossover_bar_offset = 0
        detected_crossover_type = None

        if is_bullish_cross:
            detected_crossover_type = "BUY"
            crossover_bar_offset = 0
        elif is_bearish_cross:
            detected_crossover_type = "SELL"
            crossover_bar_offset = 0
        else:
            # Check bar -2 and bar -3 for recent active crossovers
            for offset in [1, 2, 3]:
                if (n - 1 - offset) < self.slow_period:
                    break
                p_s6 = df.at[n - 1 - offset - 1, "sma6"]
                p_s30 = df.at[n - 1 - offset - 1, "sma30"]
                c_s6 = df.at[n - 1 - offset, "sma6"]
                c_s30 = df.at[n - 1 - offset, "sma30"]

                if (p_s6 <= p_s30) and (c_s6 > c_s30) and (curr_sma6 >= curr_sma30):
                    detected_crossover_type = "BUY"
                    crossover_bar_offset = offset
                    break
                elif (p_s6 >= p_s30) and (c_s6 < c_s30) and (curr_sma6 <= curr_sma30):
                    detected_crossover_type = "SELL"
                    crossover_bar_offset = offset
                    break

        # Freshness label
        if not detected_crossover_type:
            freshness_label = "TRENDING"
        elif crossover_bar_offset == 0:
            freshness_label = "FRESH"
        else:
            freshness_label = f"{crossover_bar_offset} BARS AGO"

        # Crossover timestamp
        crossover_idx = n - 1 - crossover_bar_offset
        crossover_ts = str(df.at[crossover_idx, "timestamp"]) if detected_crossover_type else candle_timestamp_str

        # Price-action confirmation check
        # BUY: crossover candle closes above previous completed candle's high
        # SELL: crossover candle closes below previous completed candle's low
        buy_pa_confirmed = (curr_close > prev_high)
        sell_pa_confirmed = (curr_close < prev_low)
        vol_confirmed = (rel_vol >= self.min_rel_volume)

        # Determine Signal Classification
        is_confirmed = False
        signal_type = "WATCH"
        status_label = "WATCH"
        confirmation_notes = []

        if detected_crossover_type == "BUY":
            crossover_note = f"SMA 6 ({curr_sma6:.2f}) crossed above SMA 30 ({curr_sma30:.2f})"
            vol_note = f"Rel Volume {rel_vol}x {'✓ (>= 1.5)' if vol_confirmed else '✗ (< 1.5)'}"
            pa_note = f"Close {curr_close:.2f} > Prev High {prev_high:.2f} {'✓' if buy_pa_confirmed else '✗'}"
            liq_note = f"Spread {bid_ask_spread_pct:.2f}% {'✓' if spread_valid else '✗'}"

            confirmation_notes = [crossover_note, vol_note, pa_note, liq_note]

            if vol_confirmed and buy_pa_confirmed and liquidity_valid:
                signal_type = "BUY"
                status_label = "BUY"
                is_confirmed = True
            else:
                signal_type = "UNCONFIRMED_BUY"
                status_label = "WATCH"

        elif detected_crossover_type == "SELL":
            crossover_note = f"SMA 6 ({curr_sma6:.2f}) crossed below SMA 30 ({curr_sma30:.2f})"
            vol_note = f"Rel Volume {rel_vol}x {'✓ (>= 1.5)' if vol_confirmed else '✗ (< 1.5)'}"
            pa_note = f"Close {curr_close:.2f} < Prev Low {prev_low:.2f} {'✓' if sell_pa_confirmed else '✗'}"
            liq_note = f"Spread {bid_ask_spread_pct:.2f}% {'✓' if spread_valid else '✗'}"

            confirmation_notes = [crossover_note, vol_note, pa_note, liq_note]

            if vol_confirmed and sell_pa_confirmed and liquidity_valid:
                signal_type = "SELL"
                status_label = "SELL"
                is_confirmed = True
            else:
                signal_type = "UNCONFIRMED_SELL"
                status_label = "WATCH"

        else:
            # Ongoing Trend
            is_bullish_trend = curr_sma6 >= curr_sma30
            signal_type = "BULLISH_TREND" if is_bullish_trend else "BEARISH_TREND"
            status_label = "WATCH"
            confirmation_notes = [f"Ongoing {'Bullish' if is_bullish_trend else 'Bearish'} Trend. SMA6={curr_sma6:.2f}, SMA30={curr_sma30:.2f}."]

        # Calculate 5-Factor Algorithmic Score (0 - 100)
        score = self._calculate_signal_score(
            crossover_offset=crossover_bar_offset if detected_crossover_type else 10,
            rel_volume=rel_vol,
            is_confirmed=is_confirmed,
            signal_type=detected_crossover_type or "TREND",
            curr_close=curr_close,
            prev_ref_price=prev_high if detected_crossover_type == "BUY" else prev_low,
            activity_rank=activity_rank,
            bid_ask_spread_pct=bid_ask_spread_pct
        )

        # Deduplication check for confirmed alerts
        dedup_key = (symbol, signal_type, crossover_ts)
        is_duplicate = False
        if is_confirmed:
            if dedup_key in _ALERTED_SIGNALS:
                is_duplicate = True
            else:
                _ALERTED_SIGNALS.add(dedup_key)

        return {
            "Symbol": symbol,
            "Company": company,
            "Signal Type": signal_type,
            "Status": status_label,
            "Is Confirmed": is_confirmed,
            "Is Duplicate": is_duplicate,
            "Crossover Timestamp": crossover_ts,
            "Candle Timestamp": candle_timestamp_str,
            "Close": round(curr_close, 2),
            "SMA 6": round(curr_sma6, 2),
            "SMA 30": round(curr_sma30, 2),
            "Spread Pct": round(((curr_sma6 - curr_sma30) / curr_sma30) * 100, 2) if curr_sma30 else 0.0,
            "Relative Volume": rel_vol,
            "Traded Value Cr": round(session_traded_value_cr, 2),
            "Activity Rank": activity_rank,
            "Freshness": freshness_label,
            "Signal Score": score,
            "Confirmation Notes": " | ".join(confirmation_notes),
            "Crossover Offset": crossover_bar_offset
        }

    def _calculate_signal_score(
        self,
        crossover_offset: int,
        rel_volume: float,
        is_confirmed: bool,
        signal_type: str,
        curr_close: float,
        prev_ref_price: float,
        activity_rank: int,
        bid_ask_spread_pct: float
    ) -> float:
        """
        Calculates configurable composite signal score:
        - Crossover Freshness: 30%
        - Relative Volume: 25%
        - Price Action Strength: 20%
        - Traded Value / Activity Rank: 15%
        - Liquidity Quality: 10%
        Total: 0 to 100 points.
        """
        # 1. Freshness (30 pts max)
        if crossover_offset == 0:
            freshness_pts = 30.0
        elif crossover_offset == 1:
            freshness_pts = 24.0
        elif crossover_offset == 2:
            freshness_pts = 18.0
        elif crossover_offset == 3:
            freshness_pts = 12.0
        else:
            freshness_pts = 5.0

        # 2. Relative Volume (25 pts max)
        # 1.0x = 10 pts, 1.5x = 18 pts, 2.5x+ = 25 pts
        vol_normalized = min(1.0, max(0.0, (rel_volume - 1.0) / 2.0))
        rel_vol_pts = 10.0 + (vol_normalized * 15.0)

        # 3. Price Action Strength (20 pts max)
        # Margin of breakout over prev high / breakdown under prev low
        if prev_ref_price > 0 and signal_type in ["BUY", "SELL"]:
            breakout_pct = abs(curr_close - prev_ref_price) / prev_ref_price * 100.0
            pa_pts = min(20.0, 10.0 + (breakout_pct * 10.0))
        else:
            pa_pts = 8.0

        # 4. Traded Value / Activity Rank (15 pts max)
        # Rank 1 = 15 pts, Rank 50 = 6 pts
        rank_clamped = min(50, max(1, activity_rank))
        activity_pts = 15.0 - ((rank_clamped - 1) / 50.0 * 9.0)

        # 5. Liquidity Quality (10 pts max)
        # Spread <= 0.05% = 10 pts, <= 0.20% = 7 pts, > 0.50% = 3 pts
        if bid_ask_spread_pct <= 0.05:
            liq_pts = 10.0
        elif bid_ask_spread_pct <= 0.20:
            liq_pts = 7.0
        elif bid_ask_spread_pct <= 0.50:
            liq_pts = 5.0
        else:
            liq_pts = 2.0

        raw_total = freshness_pts + rel_vol_pts + pa_pts + activity_pts + liq_pts

        # If confirmation conditions failed, cap score at 55
        if not is_confirmed and signal_type in ["BUY", "SELL", "UNCONFIRMED_BUY", "UNCONFIRMED_SELL"]:
            raw_total = min(55.0, raw_total)
        elif not is_confirmed:
            raw_total = min(45.0, raw_total)

        return round(float(np.clip(raw_total, 0.0, 100.0)), 1)

strategy_engine = SMA6_30Strategy(
    fast_period=getattr(settings, "SMA_FAST_PERIOD", 6),
    slow_period=getattr(settings, "SMA_SLOW_PERIOD", 30),
    min_rel_volume=getattr(settings, "MIN_REL_VOLUME", 1.5),
    min_traded_value_cr=getattr(settings, "MIN_TRADED_VALUE_CR", 5.0),
    max_spread_pct=getattr(settings, "MAX_SPREAD_PCT", 0.5)
)

def calculate_sma(df: pd.DataFrame, fast_period: int = 6, slow_period: int = 30) -> pd.DataFrame:
    """Helper to calculate fast and slow SMA on DataFrame."""
    df = df.copy()
    col = "close" if "close" in df.columns else df.columns[0]
    df["sma_6"] = df[col].rolling(window=fast_period).mean()
    df["sma_30"] = df[col].rolling(window=slow_period).mean()
    return df

def calculate_relative_volume(df: pd.DataFrame, lookback: int = 20) -> float:
    """Helper to calculate relative volume on DataFrame."""
    if "volume" not in df.columns or len(df) == 0:
        return 1.0
    baseline = df["volume"].rolling(window=lookback, min_periods=5).mean().iloc[-1]
    curr_vol = df["volume"].iloc[-1]
    if pd.isna(baseline) or baseline <= 0:
        return 1.0
    return round(float(curr_vol / baseline), 2)

def check_price_action_confirmation(df: pd.DataFrame, is_buy: bool = True) -> bool:
    """Helper to verify candle close broke above prev high (BUY) or below prev low (SELL)."""
    if len(df) < 2:
        return False
    curr_close = float(df["close"].iloc[-1])
    prev_high = float(df["high"].iloc[-2]) if "high" in df.columns else float(df["close"].iloc[-2])
    prev_low = float(df["low"].iloc[-2]) if "low" in df.columns else float(df["close"].iloc[-2])
    return (curr_close > prev_high) if is_buy else (curr_close < prev_low)

def calculate_signal_score(
    is_fresh: bool = True,
    relative_volume: float = 1.5,
    price_action_ratio: float = 1.01,
    traded_value: float = 10e7,
    adv: float = 5e7,
    is_buy: bool = True
) -> float:
    """Standalone scoring evaluation adhering to 30/25/20/15/10 weights."""
    return strategy_engine._calculate_signal_score(
        crossover_offset=0 if is_fresh else 4,
        rel_volume=relative_volume,
        is_confirmed=is_fresh and relative_volume >= 1.5 and price_action_ratio > 1.0,
        signal_type="BUY" if is_buy else "SELL",
        curr_close=100.0 * price_action_ratio if is_buy else 100.0 / price_action_ratio,
        prev_ref_price=100.0,
        activity_rank=1 if traded_value >= 50e7 else 25,
        bid_ask_spread_pct=0.03
    )

def evaluate_sma_strategy(
    df: pd.DataFrame,
    symbol: str = "STOCK",
    company: str = "Company Ltd",
    activity_rank: int = 1,
    cumulative_traded_value: float = 10e7
) -> Dict[str, Any]:
    """Evaluates DataFrame of completed 10-minute candles against the SMA 6/30 strategy."""
    df_sorted = df.copy()
    if "timestamp" in df_sorted.columns:
        df_sorted["timestamp"] = pd.to_datetime(df_sorted["timestamp"])
        df_sorted = df_sorted.sort_values("timestamp", ascending=False)

    raw_candles = []
    for _, row in df_sorted.iterrows():
        raw_candles.append([
            row.get("timestamp", datetime.now().isoformat()),
            row.get("open", row.get("close", 100.0)),
            row.get("high", row.get("close", 100.0)),
            row.get("low", row.get("close", 100.0)),
            row.get("close", 100.0),
            row.get("volume", 10000),
            0
        ])

    res = strategy_engine.analyze_stock(
        symbol=symbol,
        company=company,
        raw_candles=raw_candles,
        activity_rank=activity_rank,
        session_traded_value_cr=cumulative_traded_value / 1e7
    )
    if not res:
        return {
            "symbol": symbol,
            "Symbol": symbol,
            "status": "WATCH",
            "Status": "WATCH",
            "is_confirmed": False,
            "Is Confirmed": False,
            "relative_volume": 1.0,
            "Relative Volume": 1.0,
            "signal_type": "WATCH",
            "Signal Type": "WATCH",
            "freshness": "TRENDING",
            "Freshness": "TRENDING",
            "confirmation_notes": "Insufficient candle data",
            "Confirmation Notes": "Insufficient candle data"
        }

    # Normalize both TitleCase and lowercase keys
    res["status"] = res.get("Status", "WATCH")
    res["symbol"] = res.get("Symbol", symbol)
    res["is_confirmed"] = res.get("Is Confirmed", False)
    res["signal_type"] = res.get("Signal Type", "WATCH")
    res["relative_volume"] = res.get("Relative Volume", 1.0)
    res["confirmation_notes"] = res.get("Confirmation Notes", "")
    res["freshness"] = res.get("Freshness", "TRENDING")
    res["signal_score"] = res.get("Signal Score", 0.0)
    return res


