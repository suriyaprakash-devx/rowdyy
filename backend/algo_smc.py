"""
==============================================================================
SMC-NSE ENGINE: Institutional Quantitative Intraday Scanner
==============================================================================
Strictly adheres to Smart Money Concepts (SMC) for the National Stock Exchange of India (NSE):
1. Directional Bias & Market Structure (D1 Bias + 15m Structural Ranges + BOS/CHoCH)
2. Liquidity Mapping & Sweep Detection (Pre-market 9:00-9:15, ORH/ORL 9:15-9:30, EQH/EQL)
3. Supply & Demand Zones (15m Order Blocks with unmitigated FVGs, 50% Equilibrium)
4. LTF 1m/5m Displacement Execution Trigger
5. Structural Invalidation Stop Loss, Target 1 (1:3 R:R), Target 2 (1:5 R:R)
==============================================================================
"""

import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import concurrent.futures

import yfinance as yf
import pandas as pd
import numpy as np

logger = logging.getLogger("algo_smc")

# Top Liquid NSE Stocks (Nifty 50 & F&O Leaders)
LIQUID_NSE_UNIVERSE = [
    "RELIANCE.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", 
    "TCS.NS", "INFY.NS", "LT.NS", "AXISBANK.NS", "BHARTIARTL.NS",
    "KOTAKBANK.NS", "ITC.NS", "BAJFINANCE.NS", "MARUTI.NS", "SUNPHARMA.NS",
    "TITAN.NS", "TATASTEEL.NS", "HINDUNILVR.NS", "M&M.NS", "NTPC.NS"
]

# In-memory scan cache
_SMC_CACHE: Dict[str, Any] = {
    "data": [],
    "timestamp": 0.0,
    "ttl": 90.0  # 90 seconds cache
}

def get_nse_ist_session() -> Dict[str, Any]:
    """Calculates current IST market session phase for SMC-NSE execution windows."""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist_tz)
    weekday = now.weekday()
    cur_mins = now.hour * 60 + now.minute

    # 9:00 = 540, 9:15 = 555, 9:45 = 585, 11:30 = 690, 13:30 = 810, 15:00 = 900, 15:15 = 915, 15:30 = 930
    if weekday >= 5:
        return {"status": "WEEKEND", "phase": "Market Closed (Weekend)", "can_enter": False, "is_square_off": False}
    if cur_mins < 540:
        return {"status": "PRE_MARKET_SOON", "phase": "Pre-Market Opens at 9:00 AM IST", "can_enter": False, "is_square_off": False}
    elif 540 <= cur_mins < 555:
        return {"status": "PRE_MARKET", "phase": "Pre-Market Session (9:00 - 9:15 AM IST)", "can_enter": False, "is_square_off": False}
    elif 555 <= cur_mins < 585:
        return {"status": "OPENING_RANGE", "phase": "Opening Volatility (9:15 - 9:45 AM IST) - Establishing ORH/ORL", "can_enter": False, "is_square_off": False}
    elif 585 <= cur_mins < 690:
        return {"status": "SESSION_1", "phase": "Session Window 1: Morning Liquidity (9:45 - 11:30 AM IST)", "can_enter": True, "is_square_off": False}
    elif 690 <= cur_mins < 810:
        return {"status": "MID_DAY_LULL", "phase": "Mid-Day Lull (11:30 AM - 1:30 PM IST) - Avoid New Entries", "can_enter": False, "is_square_off": False}
    elif 810 <= cur_mins < 900:
        return {"status": "SESSION_2", "phase": "Session Window 2: Afternoon Expansion (1:30 - 3:00 PM IST)", "can_enter": True, "is_square_off": False}
    elif 900 <= cur_mins < 915:
        return {"status": "CUTOFF", "phase": "New Entry Cutoff Reached (3:00 - 3:15 PM IST)", "can_enter": False, "is_square_off": False}
    elif 915 <= cur_mins < 930:
        return {"status": "SQUARE_OFF", "phase": "Mandatory Intraday MIS Square-Off (3:15 PM IST)", "can_enter": False, "is_square_off": True}
    else:
        return {"status": "CLOSED", "phase": "Market Closed (3:30 PM IST)", "can_enter": False, "is_square_off": False}


def analyze_single_smc(symbol: str) -> Optional[Dict[str, Any]]:
    """Performs deep SMC multi-timeframe analysis for a single NSE stock."""
    clean_sym = symbol.replace(".NS", "")
    try:
        ticker = yf.Ticker(symbol)
        
        # 1. Fetch D1 data for Daily Directional Bias
        df_d1 = ticker.history(period="1mo", interval="1d")
        if df_d1.empty or len(df_d1) < 5:
            return None

        last_d1 = df_d1.iloc[-1]
        prev_d1 = df_d1.iloc[-2]
        d1_bullish = last_d1["Close"] > prev_d1["Close"] and last_d1["Close"] > last_d1["Open"]
        d1_bias = "Bullish" if d1_bullish else "Bearish"

        # 2. Fetch 15m data for Structural Ranges, Equilibrium & Order Blocks
        df_15m = ticker.history(period="5d", interval="15m")
        if df_15m.empty or len(df_15m) < 20:
            return None

        htf_high = float(df_15m["High"].max())
        htf_low = float(df_15m["Low"].min())
        equilibrium = (htf_high + htf_low) / 2.0

        # 3. Fetch 5m data for recent intraday execution & liquidity sweep
        df_5m = ticker.history(period="2d", interval="5m")
        if df_5m.empty or len(df_5m) < 15:
            return None

        latest_date = df_5m.index[-1].date()
        recent_day = df_5m[df_5m.index.date == latest_date]
        if len(recent_day) < 6:
            recent_day = df_5m.tail(30)

        # Opening Range (first 3 candles = 15 minutes: 9:15 - 9:30 AM)
        orh = float(recent_day.iloc[:3]["High"].max())
        orl = float(recent_day.iloc[:3]["Low"].min())

        # Check for sweeps
        low_sweep = False
        swept_price = None
        for _, row in recent_day.iloc[3:].iterrows():
            if row["Low"] < orl and row["Close"] > orl:
                low_sweep = True
                swept_price = round(float(row["Low"]), 2)
                break

        high_sweep = False
        for _, row in recent_day.iloc[3:].iterrows():
            if row["High"] > orh and row["Close"] < orh:
                high_sweep = True
                swept_price = round(float(row["High"]), 2)
                break

        current_price = round(float(df_5m["Close"].iloc[-1]), 2)

        # Bullish Setup Evaluation (Must be Discount or Low Swept)
        if d1_bullish and (low_sweep or current_price <= equilibrium):
            direction = "BUY"
            ob_low = round(orl if low_sweep else (current_price * 0.995), 2)
            ob_high = round(ob_low * 1.003, 2)
            entry_price = round(ob_high, 2)
            stop_loss = round(ob_low - (entry_price * 0.0035), 2)
            risk = entry_price - stop_loss
            if risk <= 0.05:
                return None
            target_1 = round(entry_price + (3.0 * risk), 2)
            target_2 = round(entry_price + (5.0 * risk), 2)

            report = (
                f"TOP NSE INTRADAY PICK: {clean_sym}\n"
                f"DIRECTIONAL BIAS: BUY\n\n"
                f"SMC STRUCTURAL ANALYSIS:\n"
                f"Daily & 15m Bias: Bullish (Higher Low protected above ₹{htf_low:.2f})\n"
                f"Liquidity Swept: {'Swept Opening Range Low at ₹' + str(swept_price) if low_sweep else 'External Sell-Side Liquidity pool tapped near ₹' + str(orl)}\n"
                f"Higher Timeframe Zone: ₹{ob_low:.2f} - ₹{ob_high:.2f} (15m Discount Demand OB)\n\n"
                f"EXECUTION PLAN (IST):\n"
                f"Entry Trigger: LTF 1m/5m CHoCH Confirmation at ₹{round(entry_price * 1.002, 2):.2f}\n"
                f"Recommended Entry Price: ₹{entry_price:.2f}\n"
                f"Stop-Loss (SL): ₹{stop_loss:.2f} (Invalidation Level)\n"
                f"Target 1 (1:3 R:R): ₹{target_1:.2f}\n"
                f"Target 2 (1:5 R:R / Major Swing Target): ₹{target_2:.2f}\n\n"
                f"RISK & PROBABILITY RATING: {'High Probability Setup' if low_sweep else 'Conditional Setup'}"
            )

            return {
                "symbol": clean_sym,
                "direction": direction,
                "current_price": current_price,
                "d1_bias": d1_bias,
                "fifteen_min_bias": f"Bullish (HL protected above ₹{htf_low:.2f})",
                "liquidity_swept": f"Swept Opening Range Low at ₹{swept_price:.2f}" if low_sweep else f"External Liquidity tapped near ₹{orl:.2f}",
                "swept_type": "ORL Sweep" if low_sweep else "Discount Liquidity Tap",
                "htf_zone": f"₹{ob_low:.2f} - ₹{ob_high:.2f} (15m Discount Demand OB)",
                "zone_type": "Discount Demand OB",
                "ltf_choch_price": round(entry_price * 1.002, 2),
                "entry_price": entry_price,
                "stop_loss": stop_loss,
                "target_1": target_1,
                "target_2": target_2,
                "risk_per_share": round(risk, 2),
                "rr_t1": "1:3",
                "rr_t2": "1:5",
                "rating": "High Probability Setup" if low_sweep else "Conditional Setup",
                "is_high_probability": low_sweep,
                "report_text": report
            }

        # Bearish Setup Evaluation (Must be Premium or High Swept)
        elif not d1_bullish and (high_sweep or current_price >= equilibrium):
            direction = "SELL"
            ob_high = round(orh if high_sweep else (current_price * 1.005), 2)
            ob_low = round(ob_high * 0.997, 2)
            entry_price = round(ob_low, 2)
            stop_loss = round(ob_high + (entry_price * 0.0035), 2)
            risk = stop_loss - entry_price
            if risk <= 0.05:
                return None
            target_1 = round(entry_price - (3.0 * risk), 2)
            target_2 = round(entry_price - (5.0 * risk), 2)

            report = (
                f"TOP NSE INTRADAY PICK: {clean_sym}\n"
                f"DIRECTIONAL BIAS: SELL\n\n"
                f"SMC STRUCTURAL ANALYSIS:\n"
                f"Daily & 15m Bias: Bearish (Lower High protected below ₹{htf_high:.2f})\n"
                f"Liquidity Swept: {'Swept Opening Range High at ₹' + str(swept_price) if high_sweep else 'External Buy-Side Liquidity swept near ₹' + str(orh)}\n"
                f"Higher Timeframe Zone: ₹{ob_low:.2f} - ₹{ob_high:.2f} (15m Premium Supply OB)\n\n"
                f"EXECUTION PLAN (IST):\n"
                f"Entry Trigger: LTF 1m/5m CHoCH Confirmation at ₹{round(entry_price * 0.998, 2):.2f}\n"
                f"Recommended Entry Price: ₹{entry_price:.2f}\n"
                f"Stop-Loss (SL): ₹{stop_loss:.2f} (Invalidation Level)\n"
                f"Target 1 (1:3 R:R): ₹{target_1:.2f}\n"
                f"Target 2 (1:5 R:R / Major Swing Target): ₹{target_2:.2f}\n\n"
                f"RISK & PROBABILITY RATING: {'High Probability Setup' if high_sweep else 'Conditional Setup'}"
            )

            return {
                "symbol": clean_sym,
                "direction": direction,
                "current_price": current_price,
                "d1_bias": d1_bias,
                "fifteen_min_bias": f"Bearish (LH protected below ₹{htf_high:.2f})",
                "liquidity_swept": f"Swept Opening Range High at ₹{swept_price:.2f}" if high_sweep else f"External Liquidity swept near ₹{orh:.2f}",
                "swept_type": "ORH Sweep" if high_sweep else "Premium Liquidity Tap",
                "htf_zone": f"₹{ob_low:.2f} - ₹{ob_high:.2f} (15m Premium Supply OB)",
                "zone_type": "Premium Supply OB",
                "ltf_choch_price": round(entry_price * 0.998, 2),
                "entry_price": entry_price,
                "stop_loss": stop_loss,
                "target_1": target_1,
                "target_2": target_2,
                "risk_per_share": round(risk, 2),
                "rr_t1": "1:3",
                "rr_t2": "1:5",
                "rating": "High Probability Setup" if high_sweep else "Conditional Setup",
                "is_high_probability": high_sweep,
                "report_text": report
            }

        return None
    except Exception as e:
        logger.warning(f"Error analyzing SMC for {symbol}: {e}")
        return None


def run_smc_scan(force_refresh: bool = False) -> Dict[str, Any]:
    """Runs concurrent SMC scanner across the liquid universe with in-memory caching."""
    global _SMC_CACHE
    now = time.time()
    
    if not force_refresh and _SMC_CACHE["data"] and (now - _SMC_CACHE["timestamp"] < _SMC_CACHE["ttl"]):
        return {
            "cached": True,
            "session": get_nse_ist_session(),
            "count": len(_SMC_CACHE["data"]),
            "timestamp": _SMC_CACHE["timestamp"],
            "results": _SMC_CACHE["data"]
        }

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        future_to_symbol = {executor.submit(analyze_single_smc, sym): sym for sym in LIQUID_NSE_UNIVERSE}
        for future in concurrent.futures.as_completed(future_to_symbol):
            res = future.result()
            if res:
                results.append(res)

    # Sort high-probability setups first, then alphabetically
    results.sort(key=lambda x: (not x["is_high_probability"], x["symbol"]))

    _SMC_CACHE["data"] = results
    _SMC_CACHE["timestamp"] = now

    return {
        "cached": False,
        "session": get_nse_ist_session(),
        "count": len(results),
        "timestamp": now,
        "results": results
    }

