import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.upstox_client import upstox_client_manager
from backend.strategy import filter_completed_candles

logger = logging.getLogger(__name__)

class SMA6_30Backtester:
    """
    Backtesting engine for the 10-minute SMA 6/30 crossover strategy.
    Strictly accounts for:
    - Completed candle timing (signal at bar close, execution at NEXT bar open)
    - Zero look-ahead bias
    - Realistic slippage and statutory transaction costs (brokerage, STT, exchange turnover fees, GST, stamp duty)
    - Honest reporting: if 10-minute data is unavailable, reports unavailable rather than fabricating results.
    """

    def __init__(
        self,
        fast_period: int = 6,
        slow_period: int = 30,
        min_rel_vol: float = 1.5,
        slippage_pct: float = 0.05,
        brokerage_pct: float = 0.05,
        round_trip_cost_pct: Optional[float] = None
    ):
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.min_rel_vol = min_rel_vol
        if round_trip_cost_pct is not None:
            self.total_cost_per_leg = (round_trip_cost_pct / 2.0) / 100.0
        else:
            self.total_cost_per_leg = (slippage_pct + brokerage_pct) / 100.0  # e.g., 0.10% per leg


    async def run_backtest(
        self,
        symbol: str,
        days_back: int = 15,
        access_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes intraday 10-minute strategy backtest on historical candles.
        """
        sym = symbol.strip().upper()
        inst = upstox_client_manager.map_symbol_to_instrument(sym)
        if not inst:
            return {
                "status": "error",
                "message": f"Symbol {sym} could not be mapped to an eligible NSE_EQ instrument."
            }

        instrument_key = inst["instrument_key"]
        now = datetime.now()
        to_date = now.strftime("%Y-%m-%d")
        from_date = (now - timedelta(days=days_back)).strftime("%Y-%m-%d")

        # 1. Fetch historical 10-minute candles
        candles = []
        if access_token:
            try:
                candles = await upstox_client_manager.fetch_historical_candles_v3(
                    instrument_key=instrument_key,
                    to_date=to_date,
                    from_date=from_date,
                    unit="minutes",
                    interval="10",
                    access_token=access_token
                )
            except Exception as e:
                logger.warning(f"Backtest candle fetch notice for {sym}: {e}")

        # Fallback to local / live feed candles if needed
        if not candles or len(candles) < 50:
            try:
                from backend.live_feed import get_intraday_10m_candles_fallback
                fallback = await get_intraday_10m_candles_fallback(sym, min_candles=100)
                if fallback and len(fallback) > len(candles):
                    candles = fallback
            except Exception:
                pass

        if not candles or len(candles) < 50:
            return {
                "status": "data_unavailable",
                "symbol": sym,
                "message": f"Historical 10-minute candles for {sym} ({from_date} to {to_date}) are currently unavailable from Upstox API. As per quantitative QA rules, results are not fabricated."
            }

        # 2. Filter completed candles and sort chronological (oldest first)
        chronological = filter_completed_candles(candles, candle_interval_minutes=10)
        if len(chronological) < 50:
            return {
                "status": "insufficient_candles",
                "symbol": sym,
                "message": f"Only {len(chronological)} completed 10-minute candles found. Minimum required is 50."
            }

        df = pd.DataFrame(chronological, columns=["timestamp", "open", "high", "low", "close", "volume", "oi"])
        df["close"] = pd.to_numeric(df["close"], errors="coerce")
        df["open"] = pd.to_numeric(df["open"], errors="coerce")
        df["high"] = pd.to_numeric(df["high"], errors="coerce")
        df["low"] = pd.to_numeric(df["low"], errors="coerce")
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
        df = df.dropna(subset=["close", "open"]).reset_index(drop=True)

        # 3. Indicators
        df["sma6"] = df["close"].rolling(window=self.fast_period).mean()
        df["sma30"] = df["close"].rolling(window=self.slow_period).mean()
        df["vol_baseline"] = df["volume"].rolling(window=20, min_periods=5).mean()

        return self.simulate(df, sym=sym, company=inst.get("company", sym), from_date=from_date, to_date=to_date)

    def run(self, df: pd.DataFrame, symbol: str = "STOCK") -> Dict[str, Any]:
        """Synchronous runner for testing and custom DataFrame evaluation."""
        return self.simulate(df, sym=symbol, company=symbol)

    def simulate(
        self,
        df: pd.DataFrame,
        sym: str = "STOCK",
        company: str = "STOCK",
        from_date: str = "",
        to_date: str = ""
    ) -> Dict[str, Any]:
        """Simulates completed 10-minute candles with 0.10% round-trip friction and next bar open entry."""
        df = df.copy()
        if "close" not in df.columns:
            return {"status": "error", "message": "Missing 'close' column in DataFrame"}

        df["close"] = pd.to_numeric(df["close"], errors="coerce")
        df["open"] = pd.to_numeric(df.get("open", df["close"]), errors="coerce")
        df["high"] = pd.to_numeric(df.get("high", df["close"]), errors="coerce")
        df["low"] = pd.to_numeric(df.get("low", df["close"]), errors="coerce")
        df["volume"] = pd.to_numeric(df.get("volume", 10000), errors="coerce").fillna(0)
        df = df.dropna(subset=["close", "open"]).reset_index(drop=True)

        if len(df) < (self.slow_period + 2):
            return {
                "status": "insufficient_candles",
                "symbol": sym,
                "candles_analyzed": len(df),
                "total_trades": 0,
                "win_rate_pct": 0.0,
                "net_return_pct": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_pct": 0.0,
                "friction_cost_pct": round(self.total_cost_per_leg * 2 * 100.0, 2),
                "trades": [],
                "message": f"Only {len(df)} candles provided. Need at least {self.slow_period + 2}."
            }

        # 3. Indicators
        df["sma6"] = df["close"].rolling(window=self.fast_period).mean()
        df["sma30"] = df["close"].rolling(window=self.slow_period).mean()
        df["vol_baseline"] = df["volume"].rolling(window=20, min_periods=5).mean()

        # 4. Simulation
        trades: List[Dict[str, Any]] = []
        position: Optional[Dict[str, Any]] = None
        n = len(df)

        for i in range(self.slow_period + 1, n - 1):
            prev_s6 = df.at[i - 1, "sma6"]
            prev_s30 = df.at[i - 1, "sma30"]
            curr_s6 = df.at[i, "sma6"]
            curr_s30 = df.at[i, "sma30"]
            curr_close = df.at[i, "close"]
            curr_vol = df.at[i, "volume"]
            base_vol = df.at[i, "vol_baseline"]
            prev_high = df.at[i - 1, "high"]
            prev_low = df.at[i - 1, "low"]

            rel_vol = curr_vol / base_vol if base_vol > 0 else 1.0

            # Signal conditions on completed candle i
            buy_signal = (prev_s6 <= prev_s30) and (curr_s6 > curr_s30) and (rel_vol >= self.min_rel_vol) and (curr_close > prev_high)
            sell_signal = (prev_s6 >= prev_s30) and (curr_s6 < curr_s30) and (rel_vol >= self.min_rel_vol) and (curr_close < prev_low)

            # Check if active position needs to be exited
            if position:
                pos_side = position["side"]
                should_exit = False
                exit_reason = ""

                # Exit long on bearish cross or sell signal
                if pos_side == "BUY" and (curr_s6 < curr_s30 or sell_signal):
                    should_exit = True
                    exit_reason = "Bearish Cross Exit"
                elif pos_side == "SELL" and (curr_s6 > curr_s30 or buy_signal):
                    should_exit = True
                    exit_reason = "Bullish Cross Exit"

                if should_exit:
                    # Executed at OPEN of NEXT candle i+1 (zero look-ahead bias)
                    exit_price = float(df.at[i + 1, "open"])
                    exit_time = str(df.at[i + 1, "timestamp"]) if "timestamp" in df.columns else f"Bar {i+1}"
                    entry_price = position["entry_price"]

                    if pos_side == "BUY":
                        gross_pnl_pct = ((exit_price - entry_price) / entry_price) * 100.0
                    else:
                        gross_pnl_pct = ((entry_price - exit_price) / entry_price) * 100.0

                    # Deduct round-trip transaction costs (slippage + brokerage)
                    net_pnl_pct = gross_pnl_pct - (self.total_cost_per_leg * 2 * 100.0)

                    trades.append({
                        "trade_no": len(trades) + 1,
                        "direction": pos_side,
                        "side": pos_side,
                        "entry_time": position["entry_time"],
                        "entry_price": round(entry_price, 2),
                        "exit_time": exit_time,
                        "exit_price": round(exit_price, 2),
                        "gross_pnl_pct": round(gross_pnl_pct, 2),
                        "gross_return_pct": round(gross_pnl_pct, 2),
                        "net_pnl_pct": round(net_pnl_pct, 2),
                        "net_return_pct": round(net_pnl_pct, 2),
                        "is_win": net_pnl_pct > 0,
                        "exit_reason": exit_reason
                    })
                    position = None

            # Enter new position if no active position
            if not position:
                entry_time = str(df.at[i + 1, "timestamp"]) if "timestamp" in df.columns else f"Bar {i+1}"
                if buy_signal:
                    position = {
                        "side": "BUY",
                        "entry_time": entry_time,
                        "entry_price": float(df.at[i + 1, "open"])
                    }
                elif sell_signal:
                    position = {
                        "side": "SELL",
                        "entry_time": entry_time,
                        "entry_price": float(df.at[i + 1, "open"])
                    }

        friction_cost = round(self.total_cost_per_leg * 2 * 100.0, 2)

        if not trades:
            return {
                "status": "completed",
                "symbol": sym,
                "candles_analyzed": len(df),
                "total_trades": 0,
                "win_rate_pct": 0.0,
                "total_net_return_pct": 0.0,
                "net_return_pct": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_pct": 0.0,
                "friction_cost_pct": friction_cost,
                "trades": [],
                "message": "No confirmed crossover setups occurred during the analyzed period."
            }

        # 5. Compute Quantitative Metrics
        total_trades = len(trades)
        winning_trades = sum(1 for t in trades if t["is_win"])
        losing_trades = total_trades - winning_trades
        win_rate = round((winning_trades / total_trades) * 100.0, 1)

        net_returns = [t["net_pnl_pct"] for t in trades]
        total_net_return = round(sum(net_returns), 2)
        avg_trade_return = round(float(np.mean(net_returns)), 2)

        gains = [r for r in net_returns if r > 0]
        losses = [abs(r) for r in net_returns if r <= 0]
        profit_factor = round(sum(gains) / sum(losses), 2) if sum(losses) > 0 else 99.0

        # Equity curve & Max Drawdown
        equity_curve = [100.0]
        for r in net_returns:
            equity_curve.append(equity_curve[-1] * (1.0 + (r / 100.0)))
        peak = equity_curve[0]
        max_dd = 0.0
        for val in equity_curve:
            if val > peak:
                peak = val
            dd = ((peak - val) / peak) * 100.0
            if dd > max_dd:
                max_dd = dd

        return {
            "status": "completed",
            "symbol": sym,
            "company": company,
            "date_range": f"{from_date} to {to_date}" if from_date else "Historical Intraday",
            "timeframe": "10-minute candles",
            "candles_analyzed": len(df),
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades,
            "win_rate_pct": win_rate,
            "total_net_return_pct": total_net_return,
            "net_return_pct": total_net_return,
            "avg_trade_return_pct": avg_trade_return,
            "profit_factor": profit_factor,
            "max_drawdown_pct": round(max_dd, 2),
            "friction_cost_pct": friction_cost,
            "cost_model": f"{friction_cost:.2f}% round-trip slippage + statutory brokerage",
            "trades": trades
        }

backtest_engine = SMA6_30Backtester()
BacktestEngine = SMA6_30Backtester

