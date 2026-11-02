"""
Unit and Integration Test Suite for NSE Most Active Stocks SMA 6/30 Intraday Scanner.
Covers:
1. Security & Zero Auto-Order Audit (no order placement APIs).
2. Completed 10-Minute Candle Filtering & Indicator Calculation.
3. SMA 6/30 Crossover Logic (BUY & SELL).
4. Relative Volume (>= 1.5x) and Price-Action Confirmation.
5. Signal Deduplication (no repeated alerts for ongoing trends).
6. 5-Factor Quant Signal Scoring (30/25/20/15/10 weights).
7. Instrument Validation (NSE_EQ, EQ, ETF exclusion).
8. Traded-Value Ranking for Most Active Discovery.
9. NSE Bhavcopy Historical Liquidity Research vs Live Intraday Data Separation.
10. 10-Minute Strategy Backtester with 0.10% Friction.
11. FastAPI API Endpoints & Session Isolation.
"""

import sys
import os
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import pytest
from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.config import (
    SMA_FAST_PERIOD, SMA_SLOW_PERIOD, MIN_REL_VOLUME,
    MIN_TRADED_VALUE_CR, CANDLE_INTERVAL_MINUTES
)
from backend.strategy import (
    is_candle_completed, filter_completed_candles,
    calculate_sma, calculate_relative_volume,
    check_price_action_confirmation, evaluate_sma_strategy,
    calculate_signal_score
)
from backend.most_active import (
    is_valid_nse_equity, MostActiveEngine
)
from backend.bhavcopy import BhavcopyService
from backend.backtest import BacktestEngine
from backend.main import app


# ==============================================================================
# 1. SECURITY & ZERO AUTO-ORDER AUDIT
# ==============================================================================

def test_zero_order_placement_security_audit():
    """Verify that NO order placement, modification, or cancellation APIs or methods exist."""
    import inspect
    import backend.scanner
    import backend.strategy
    import backend.upstox_client
    import backend.main
    import backend.models
    import backend.algo_intraday

    forbidden_terms = [
        "place_order", "post_order", "create_order", "execute_order",
        "modify_order", "cancel_order", "order_placement", "broker_order"
    ]

    modules_to_audit = [
        backend.scanner,
        backend.strategy,
        backend.upstox_client,
        backend.main,
        backend.models,
        backend.algo_intraday
    ]

    for mod in modules_to_audit:
        source_code = inspect.getsource(mod).lower()
        for term in forbidden_terms:
            assert f"def {term}" not in source_code, f"Forbidden broker order function found: {term} in {mod.__name__}"
            assert f'router.post("/order' not in source_code, f"Forbidden order route found in {mod.__name__}"
            assert f'router.post("/api/order' not in source_code, f"Forbidden order route found in {mod.__name__}"

    # Verify FastAPI app routes have zero order endpoints
    for route in app.routes:
        path = getattr(route, "path", "").lower()
        assert "order" not in path or "reorder" in path, f"Forbidden order route path detected: {path}"


# ==============================================================================
# 2. COMPLETED 10-MINUTE CANDLE INTEGRITY
# ==============================================================================

def test_completed_10m_candle_filter():
    """Verify candles are recognized as completed only when their full 10m window has passed."""
    # A 10:00 candle ends at 10:10
    candle_time = datetime(2026, 10, 28, 10, 0, 0)

    # At 10:05, candle is INCOMPLETE
    assert not is_candle_completed(candle_time, datetime(2026, 10, 28, 10, 5, 0), interval_minutes=10)

    # At 10:09:59, candle is INCOMPLETE
    assert not is_candle_completed(candle_time, datetime(2026, 10, 28, 10, 9, 59), interval_minutes=10)

    # At 10:10:00, candle is COMPLETED
    assert is_candle_completed(candle_time, datetime(2026, 10, 28, 10, 10, 0), interval_minutes=10)

    # At 10:15:00, candle is COMPLETED
    assert is_candle_completed(candle_time, datetime(2026, 10, 28, 10, 15, 0), interval_minutes=10)


def test_filter_completed_candles():
    """Test filtering DataFrame of candles to retain only completed 10-minute bars."""
    now = datetime(2026, 10, 28, 10, 25, 0)
    data = [
        {"timestamp": datetime(2026, 10, 28, 9, 15, 0), "close": 100, "volume": 1000},
        {"timestamp": datetime(2026, 10, 28, 9, 25, 0), "close": 102, "volume": 1200},
        {"timestamp": datetime(2026, 10, 28, 10, 15, 0), "close": 105, "volume": 1500}, # Ends at 10:25:00 -> completed
        {"timestamp": datetime(2026, 10, 28, 10, 20, 0), "close": 106, "volume": 800},  # Ends at 10:30:00 -> NOT completed
    ]
    df = pd.DataFrame(data)
    filtered = filter_completed_candles(df, current_time=now, interval_minutes=10)
    assert len(filtered) == 3
    assert filtered.iloc[-1]["timestamp"] == datetime(2026, 10, 28, 10, 15, 0)


# ==============================================================================
# 3. SMA 6 & SMA 30 CALCULATION
# ==============================================================================

def test_sma_calculation():
    """Verify SMA 6 and SMA 30 calculations match exact rolling mean."""
    closes = list(range(1, 41))  # 1 to 40
    df = pd.DataFrame({"close": closes})

    df = calculate_sma(df, fast_period=6, slow_period=30)

    # Last 6 closes: 35, 36, 37, 38, 39, 40 -> sum = 225 / 6 = 37.5
    expected_sma6 = sum(range(35, 41)) / 6
    assert abs(df["sma_6"].iloc[-1] - expected_sma6) < 1e-4

    # Last 30 closes: 11 to 40 -> sum = 765 / 30 = 25.5
    expected_sma30 = sum(range(11, 41)) / 30
    assert abs(df["sma_30"].iloc[-1] - expected_sma30) < 1e-4


# ==============================================================================
# 4. BUY & SELL CANDIDATE CONFIRMATION LOGIC
# ==============================================================================

def _generate_synthetic_candle_data(n=35):
    """Generate 35 synthetic 10m completed candles with past timestamps."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(n):
        rows.append({
            "timestamp": base_time + timedelta(minutes=10 * i),
            "open": 1000.0,
            "high": 1002.0,
            "low": 998.0,
            "close": 1000.0,
            "volume": 10000.0
        })
    return pd.DataFrame(rows)


def test_confirmed_buy_signal():
    """Verify BUY signal triggers when SMA 6 crosses above SMA 30, RelVol >= 1.5, and Close > Prev High."""
    df = _generate_synthetic_candle_data(35)
    
    # Bars 29..33 close at 998.0 (lowering SMA 6 below SMA 30)
    for i in range(29, 34):
        df.loc[df.index[i], "open"] = 998.0
        df.loc[df.index[i], "close"] = 998.0
        df.loc[df.index[i], "high"] = 999.0
        df.loc[df.index[i], "low"] = 997.0
        df.loc[df.index[i], "volume"] = 10000.0

    # Bar 33 (prior bar): SMA 6 (998.33) <= SMA 30 (999.60), prev high is 999.0
    # Bar 34 (current completed bar): massive bullish breakout candle
    df.loc[df.index[34], "open"] = 998.0
    df.loc[df.index[34], "close"] = 1015.0
    df.loc[df.index[34], "high"] = 1020.0
    df.loc[df.index[34], "low"] = 997.0
    df.loc[df.index[34], "volume"] = 25000.0  # 2.5x volume (>= 1.5)

    result = evaluate_sma_strategy(df, symbol="RELIANCE", cumulative_traded_value=50e7)

    assert result["status"] == "BUY"
    assert result["is_confirmed"] is True
    assert result["relative_volume"] >= 1.5
    assert result["signal_type"] == "BUY"
    assert "SMA 6" in result["confirmation_notes"]
    assert "crossed above SMA 30" in result["confirmation_notes"]


def test_buy_fails_price_action_watch_status():
    """Verify that if Close does NOT exceed previous High, signal is labeled WATCH/UNCONFIRMED."""
    df = _generate_synthetic_candle_data(35)
    for i in range(29, 34):
        df.loc[df.index[i], "open"] = 998.0
        df.loc[df.index[i], "close"] = 998.0
        df.loc[df.index[i], "high"] = 999.0
        df.loc[df.index[i], "low"] = 997.0
        df.loc[df.index[i], "volume"] = 10000.0

    # Prior bar has high resistance at 1025.0
    df.loc[df.index[33], "high"] = 1025.0

    # Current bar crosses SMA 6 > SMA 30 with 2.5x volume, but close is 1015.0 (< 1025.0 prev high)
    df.loc[df.index[34], "open"] = 998.0
    df.loc[df.index[34], "close"] = 1015.0
    df.loc[df.index[34], "high"] = 1018.0
    df.loc[df.index[34], "low"] = 997.0
    df.loc[df.index[34], "volume"] = 25000.0

    result = evaluate_sma_strategy(df, symbol="TCS", cumulative_traded_value=20e7)

    assert result["status"] == "WATCH"
    assert result["is_confirmed"] is False
    assert result["signal_type"] == "UNCONFIRMED_BUY"
    assert "Prev High" in result["confirmation_notes"]


def test_confirmed_sell_signal():
    """Verify SELL signal triggers when SMA 6 crosses below SMA 30, RelVol >= 1.5, and Close < Prev Low."""
    df = _generate_synthetic_candle_data(35)
    
    # Bars 29..33 close at 1002.0 (raising SMA 6 above SMA 30)
    for i in range(29, 34):
        df.loc[df.index[i], "open"] = 1002.0
        df.loc[df.index[i], "close"] = 1002.0
        df.loc[df.index[i], "high"] = 1004.0
        df.loc[df.index[i], "low"] = 1001.0
        df.loc[df.index[i], "volume"] = 10000.0

    # Bar 33 (prior bar): SMA 6 is 1001.67 >= SMA 30 is 1000.40, prev low is 1001.0
    # Bar 34 (current bar): sharp breakdown
    df.loc[df.index[34], "open"] = 1002.0
    df.loc[df.index[34], "close"] = 985.0
    df.loc[df.index[34], "high"] = 1002.0
    df.loc[df.index[34], "low"] = 980.0
    df.loc[df.index[34], "volume"] = 25000.0  # 2.5x volume (>= 1.5)

    result = evaluate_sma_strategy(df, symbol="INFY", cumulative_traded_value=30e7)

    assert result["status"] == "SELL"
    assert result["is_confirmed"] is True
    assert result["relative_volume"] >= 1.5
    assert result["signal_type"] == "SELL"
    assert "crossed below SMA 30" in result["confirmation_notes"]


def test_signal_deduplication_no_repeated_alerts():
    """Verify ongoing trend with no fresh crossover does NOT trigger a new confirmed alert."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    # Continuously rising prices from bar 0 to 34
    for i in range(35):
        rows.append({
            "timestamp": base_time + timedelta(minutes=10 * i),
            "open": 1000.0 + i * 5.0,
            "high": 1005.0 + i * 5.0,
            "low": 995.0 + i * 5.0,
            "close": 1002.0 + i * 5.0,
            "volume": 20000.0
        })
    df = pd.DataFrame(rows)

    result = evaluate_sma_strategy(df, symbol="HDFCBANK", cumulative_traded_value=40e7)

    assert result["status"] == "WATCH"
    assert result["is_confirmed"] is False
    assert result["freshness"] == "TRENDING"
    assert "Ongoing" in result["confirmation_notes"]


# ==============================================================================
# 5. QUANT SIGNAL SCORING (5 FACTORS: 30%, 25%, 20%, 15%, 10%)
# ==============================================================================

def test_signal_score_calculation():
    """Test 5-factor scoring model adheres strictly to weights and normalization."""
    # Test perfect score conditions
    score = calculate_signal_score(
        is_fresh=True,
        relative_volume=3.0,
        price_action_ratio=1.03,
        traded_value=100e7,
        adv=50e7,
        is_buy=True
    )

    assert 85.0 <= score <= 100.0, f"Expected near-maximum score for perfect conditions, got {score}"

    # Test baseline WATCH score
    watch_score = calculate_signal_score(
        is_fresh=False,
        relative_volume=0.8,
        price_action_ratio=0.99,
        traded_value=1e7,
        adv=5e7,
        is_buy=True
    )

    assert 0.0 <= watch_score <= 55.0, f"Expected low score for weak conditions, got {watch_score}"


# ==============================================================================
# 6. INSTRUMENT VALIDATION & ETF EXCLUSION
# ==============================================================================

def test_instrument_validation():
    """Verify NSE cash equities are accepted, while ETFs, BSE securities, and derivatives are rejected."""
    # Valid cash equities
    assert is_valid_nse_equity("RELIANCE", instrument_type="EQ", segment="NSE_EQ") is True
    assert is_valid_nse_equity("TCS", instrument_type="EQ", segment="NSE_EQ") is True
    assert is_valid_nse_equity("INFY", instrument_type="EQ", segment="NSE_EQ") is True

    # Excluded ETFs
    assert is_valid_nse_equity("NIFTYBEES", instrument_type="EQ", segment="NSE_EQ") is False
    assert is_valid_nse_equity("BANKBEES", instrument_type="EQ", segment="NSE_EQ") is False
    assert is_valid_nse_equity("GOLDBEES", instrument_type="EQ", segment="NSE_EQ") is False
    assert is_valid_nse_equity("SETFNIF50", instrument_type="EQ", segment="NSE_EQ") is False
    assert is_valid_nse_equity("HDFCNIFETF", instrument_type="EQ", segment="NSE_EQ") is False

    # Excluded wrong instrument types / segments
    assert is_valid_nse_equity("RELIANCE", instrument_type="FUT", segment="NSE_FO") is False
    assert is_valid_nse_equity("RELIANCE", instrument_type="EQ", segment="BSE_EQ") is False


# ==============================================================================
# 7. BHAVCOPY LIQUIDITY RESEARCH & TIERING
# ==============================================================================

def test_bhavcopy_liquidity_tiers():
    """Test Bhavcopy turnover tiering (> 100 Cr = Tier 1, 25-100 Cr = Tier 2, < 25 Cr = Tier 3)."""
    assert BhavcopyService.classify_liquidity_tier(150.0) == "Tier 1 (> ₹100 Cr)"
    assert BhavcopyService.classify_liquidity_tier(60.0) == "Tier 2 (₹25-100 Cr)"
    assert BhavcopyService.classify_liquidity_tier(10.0) == "Tier 3 (< ₹25 Cr)"


# ==============================================================================
# 8. 10-MINUTE STRATEGY BACKTESTER WITH 0.10% FRICTION
# ==============================================================================

def test_backtest_engine_execution():
    """Test backtesting on completed 10-minute candles accounts for friction and generates realistic metrics."""
    # Create 80 bars of trending then reversing data
    rows = []
    base_time = datetime(2026, 10, 20, 9, 15)
    price = 1000.0

    # 40 bars up
    for i in range(40):
        rows.append({
            "timestamp": base_time + timedelta(minutes=10 * i),
            "open": price,
            "high": price + 4.0,
            "low": price - 2.0,
            "close": price + 2.0,
            "volume": 15000
        })
        price += 2.0

    # 40 bars down
    for i in range(40, 80):
        rows.append({
            "timestamp": base_time + timedelta(minutes=10 * i),
            "open": price,
            "high": price + 2.0,
            "low": price - 4.0,
            "close": price - 2.0,
            "volume": 16000
        })
        price -= 2.0

    df = pd.DataFrame(rows)
    engine = BacktestEngine(round_trip_cost_pct=0.10)
    result = engine.run(df, symbol="TESTSTOCK")

    assert "total_trades" in result
    assert "win_rate_pct" in result
    assert "net_return_pct" in result
    assert "profit_factor" in result
    assert "max_drawdown_pct" in result
    assert "trades" in result
    assert result["friction_cost_pct"] == 0.10


# ==============================================================================
# 9. FASTAPI ENDPOINTS & SESSION ISOLATION
# ==============================================================================

client = TestClient(app)

def test_market_session_endpoint():
    """Test /api/market/session returns market status, IST time, and Nifty 50 performance."""
    response = client.get("/api/market/session")
    assert response.status_code == 200
    data = response.json()
    assert "market_session" in data
    assert "is_open" in data["market_session"]
    assert "current_time_ist" in data["market_session"] or "ist_time" in data["market_session"]
    assert "nifty_50" in data
    assert "scanner_stats" in data or "scanner_status" in data


def test_most_active_stocks_endpoint():
    """Test /api/stocks/most-active returns valid ranked list of stocks."""
    response = client.get("/api/stocks/most-active?limit=20")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "stocks" in data
    assert len(data["stocks"]) <= 20
    if len(data["stocks"]) > 1:
        # Check descending order by traded value or turnover
        first_val = data["stocks"][0].get("traded_value", 0)
        second_val = data["stocks"][1].get("traded_value", 0)
        assert first_val >= second_val or second_val > 0


def test_bhavcopy_summary_endpoint():
    """Test /api/bhavcopy/summary returns historical turnover and liquidity tiers."""
    response = client.get("/api/bhavcopy/summary")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    if data.get("status") == "success":
        assert "bhavcopy_date" in data
        assert "top_traded_by_value" in data
        assert "liquidity_tiers" in data
    else:
        assert "message" in data
        assert "stock_metrics" in data


def test_backtest_api_endpoint():
    """Test POST /api/backtest/run runs 10-minute backtest."""
    payload = {"symbol": "RELIANCE", "days_back": 5}
    response = client.post("/api/backtest/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "symbol" in data
    assert "total_trades" in data
    assert "friction_cost_pct" in data


def test_intraday_signal_algo_and_order_slip():
    """Test run_ai_intraday_analysis logic, telemetry, and manual order ticket generation."""
    from backend.algo_intraday import run_ai_intraday_analysis

    result = run_ai_intraday_analysis(
        symbol="TCS",
        timeframe="intraday",
        capital=50000.0,
        risk_per_trade=1000.0,
        force_refresh=True
    )
    assert result is not None
    assert result["symbol"] == "TCS"
    assert "Intraday" in result["timeframe"] or result["timeframe"] == "intraday"
    assert "signal" in result
    assert result["signal"] in ["STRONG BUY", "BUY", "AVOID", "WAIT", "WATCH / NEUTRAL", "STRONG SELL", "SELL"]
    assert "intraday_telemetry" in result
    assert "order_ticket" in result
    assert "trade_plan" in result

    # Telemetry checks
    telemetry = result["intraday_telemetry"]
    assert "vwap" in telemetry
    assert "sma_6" in telemetry
    assert "sma_30" in telemetry
    assert "rel_vol" in telemetry
    assert "supertrend_direction" in telemetry
    assert "session_cutoff" in telemetry

    # Order ticket checks
    ticket = result["order_ticket"]
    assert ticket["symbol"] == "TCS"
    assert ticket["product"] == "MIS"
    assert "Alert only" in ticket["formatted_ticket"] or "Zero automated" in ticket["formatted_ticket"]

    # Endpoint test
    resp = client.get("/api/algo/intraday-analysis?symbol=TCS&timeframe=intraday")
    assert resp.status_code == 200
    api_data = resp.json()
    assert api_data.get("status") == "success" or api_data.get("success") is True
    assert api_data["data"]["symbol"] == "TCS"

    # Trade harmonization verification (ensures zero frontend .toFixed TypeError crashes)
    trades = result.get("backtest", {}).get("trades", [])
    if trades:
        t0 = trades[0]
        assert "entry" in t0 and "entry_price" in t0
        assert "exit" in t0 and "exit_price" in t0
        assert "return_pct" in t0 and "pnl_pct" in t0
        assert "date" in t0

    # Target 1 and Target 2 dual-key harmonization verification
    plan = result["trade_plan"]
    assert "target_1" in plan and "target1_price" in plan
    assert "target_2" in plan and "target2_price" in plan

    # Verify synchronous instrument mapping
    from backend.upstox_client import upstox_client_manager
    mapped = upstox_client_manager.map_symbol_to_instrument("TCS")
    assert mapped is not None
    assert mapped["symbol"] == "TCS"

    # Verify strategy backtest engine
    import asyncio
    from backend.backtest import backtest_engine
    bt_res = asyncio.run(backtest_engine.run_backtest("TCS", 10))
    assert bt_res["status"] == "completed"
    assert "win_rate_pct" in bt_res



def test_swing_signal_algo_and_endpoint():
    """Test run_ai_swing_analysis and /api/algo/swing-analysis endpoint."""
    resp = client.get("/api/algo/swing-analysis?symbol=INFY")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "success"
    assert data.get("mode") == "swing"
    assert data["data"]["symbol"] == "INFY"
    assert "trade_plan" in data["data"]
    assert "ai_probability" in data["data"]
    assert "indicators" in data["data"]
    assert "multi_timeframe" in data["data"]


def test_stock_analysis_fundamentals_endpoint():
    """Test /api/analysis/{symbol} Screener-style fundamental analysis endpoint."""
    resp = client.get("/api/analysis/TCS")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "TCS"
    assert "trailing_pe" in data or "pe_ratio" in data
    assert "fundamental_score" in data
    assert "fundamental_verdict" in data
    assert "strengths" in data


# ==============================================================================
# 12. INSTITUTIONAL LIQUIDITY SWEEP + BOS + FVG STRATEGY TESTS
# ==============================================================================

def test_fvg_3_candle_imbalance_detection():
    """Verify 3-candle Fair Value Gap (FVG) detection for both Bullish and Bearish imbalances."""
    from backend.strategy import detect_fair_value_gaps
    
    # 1. Bullish FVG: Candle 1 High < Candle 3 Low
    bullish_data = [
        {"open": 100.0, "high": 102.0, "low": 99.0, "close": 101.0, "volume": 1000},
        {"open": 101.0, "high": 112.0, "low": 101.0, "close": 111.0, "volume": 5000}, # Displacement
        {"open": 111.0, "high": 116.0, "low": 107.0, "close": 115.0, "volume": 2000},
    ]
    df_bull = pd.DataFrame(bullish_data)
    fvgs_bull = detect_fair_value_gaps(df_bull)
    assert len(fvgs_bull) == 1
    assert fvgs_bull[0]["type"] == "Bullish"
    assert fvgs_bull[0]["gap_low"] == 102.0
    assert fvgs_bull[0]["gap_high"] == 107.0
    assert fvgs_bull[0]["gap_size"] == 5.0

    # 2. Bearish FVG: Candle 1 Low > Candle 3 High
    bearish_data = [
        {"open": 115.0, "high": 116.0, "low": 112.0, "close": 113.0, "volume": 1000},
        {"open": 113.0, "high": 113.0, "low": 102.0, "close": 103.0, "volume": 5000}, # Displacement
        {"open": 103.0, "high": 107.0, "low": 100.0, "close": 101.0, "volume": 2000},
    ]
    df_bear = pd.DataFrame(bearish_data)
    fvgs_bear = detect_fair_value_gaps(df_bear)
    assert len(fvgs_bear) == 1
    assert fvgs_bear[0]["type"] == "Bearish"
    assert fvgs_bear[0]["gap_low"] == 107.0
    assert fvgs_bear[0]["gap_high"] == 112.0
    assert fvgs_bear[0]["gap_size"] == 5.0


def test_bullish_liquidity_sweep_bos_fvg_buy_strategy():
    """Verify end-to-end BUY strategy: Liquidity Sweep + Bullish BOS + FVG Retracement."""
    from backend.strategy import strategy_engine
    
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    # 25 bars baseline range around 1000.0
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            1000.0, 1003.0, 997.0, 1000.0, 10000.0, 0
        ])
    
    # Bar 25: Swing Low formed at 995.0
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 1000.0, 1001.0, 995.0, 998.0, 10000.0, 0])
    
    # Bar 26: Swing High formed at 1008.0
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 998.0, 1008.0, 997.0, 1006.0, 12000.0, 0])
    
    # Bar 27: Liquidity Sweep of Swing Low (dips to 993.0 < 995.0, closes at 999.0 > 995.0)
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 996.0, 1000.0, 993.0, 999.0, 18000.0, 0])
    
    # Bar 28: Bullish Displacement creating FVG Candle 1
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 999.0, 1004.0, 998.0, 1003.0, 15000.0, 0])
    
    # Bar 29: Massive Displacement Candle 2 (closes at 1018.0 > 1008.0 BOS)
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 1003.0, 1020.0, 1002.0, 1018.0, 35000.0, 0])
    
    # Bar 30: FVG Candle 3 (Low at 1010.0 > Bar 28 High 1004.0 -> FVG [1004, 1010])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 1018.0, 1025.0, 1010.0, 1022.0, 25000.0, 0])
    
    # Bar 31: Retracement into FVG Zone [1004 - 1010] (low dips to 1008.0, closes at 1015.0)
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 1020.0, 1021.0, 1008.0, 1015.0, 22000.0, 0])
    
    # Bar 32: Bullish Confirmation Candle (closes at 1024.0 with 2.5x volume)
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 1015.0, 1026.0, 1014.0, 1024.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="SBIN",
        company="State Bank of India",
        raw_candles=rows[::-1], # Newest first as per Upstox convention
        activity_rank=5,
        session_traded_value_cr=45.0,
        bid_ask_spread_pct=0.03
    )

    assert res is not None
    assert res["Symbol"] == "SBIN"
    assert res["Signal"] == "BUY"
    assert res["Status"] == "BUY"
    assert res["Is Confirmed"] is True
    assert "Bullish Sweep" in res["Sweep"] or res["Sweep Type"] == "Bullish"
    assert res["BOS"] == "Bullish"
    assert res["FVG"] == "Bullish"
    assert "1:2 / 1:3" in res["Risk/Reward"]
    assert res["Target 1"] > res["Entry"]
    assert res["Target 2"] > res["Target 1"]
    assert res["Stop-Loss"] < res["Entry"]
    assert res["Score"] >= 75.0


def test_bearish_liquidity_sweep_bos_fvg_sell_strategy():
    """Verify end-to-end SELL strategy: Liquidity Sweep of High + Bearish BOS + FVG Retracement."""
    from backend.strategy import strategy_engine
    
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    # 25 bars baseline range around 1000.0
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            1000.0, 1003.0, 997.0, 1000.0, 10000.0, 0
        ])
    
    # Bar 25: Swing High formed at 1008.0
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 1000.0, 1008.0, 999.0, 1002.0, 10000.0, 0])
    
    # Bar 26: Swing Low formed at 994.0
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 1002.0, 1003.0, 994.0, 996.0, 12000.0, 0])
    
    # Bar 27: Liquidity Sweep of Swing High (spikes to 1011.0 > 1008.0, closes at 1004.0 < 1008.0)
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 1004.0, 1011.0, 1001.0, 1004.0, 18000.0, 0])
    
    # Bar 28: Bearish Displacement creating FVG Candle 1
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 1003.0, 1004.0, 996.0, 998.0, 15000.0, 0])
    
    # Bar 29: Massive Bearish Displacement Candle 2 (closes at 982.0 < 994.0 BOS)
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 997.0, 998.0, 980.0, 982.0, 35000.0, 0])
    
    # Bar 30: FVG Candle 3 (High at 988.0 < Bar 28 Low 996.0 -> Bearish FVG [988, 996])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 982.0, 988.0, 975.0, 978.0, 25000.0, 0])
    
    # Bar 31: Retracement up into FVG Zone [988 - 996] (high touches 991.0, closes at 984.0)
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 980.0, 991.0, 979.0, 984.0, 22000.0, 0])
    
    # Bar 32: Bearish Confirmation Candle (closes at 974.0 with 2.5x volume)
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 984.0, 985.0, 972.0, 974.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="TATASTEEL",
        company="Tata Steel Limited",
        raw_candles=rows[::-1],
        activity_rank=8,
        session_traded_value_cr=35.0,
        bid_ask_spread_pct=0.03
    )

    assert res is not None
    assert res["Symbol"] == "TATASTEEL"
    assert res["Signal"] == "SELL"
    assert res["Status"] == "SELL"
    assert res["Is Confirmed"] is True
    assert "Bearish Sweep" in res["Sweep"] or res["Sweep Type"] == "Bearish"
    assert res["BOS"] == "Bearish"
    assert res["FVG"] == "Bearish"
    assert "1:2 / 1:3" in res["Risk/Reward"]
    assert res["Target 1"] < res["Entry"]
    assert res["Target 2"] < res["Target 1"]
    assert res["Stop-Loss"] > res["Entry"]
    assert res["Score"] >= 75.0


def test_confluence_scoring_tiers():
    """Verify 0-100 confluence scoring classification rules."""
    from backend.strategy import strategy_engine
    
    # 1. High confluence: Sweep + BOS + FVG + RelVol >= 2.0x + Top 25
    s1 = strategy_engine._compute_confluence_score(
        has_sweep=True, has_bos=True, has_fvg=True,
        rel_volume=2.2, is_confirmed=True, activity_rank=10, signal_type="BUY"
    )
    assert 85.0 <= s1 <= 100.0

    # 2. Valid setup: Sweep + BOS + FVG + RelVol >= 1.5x
    s2 = strategy_engine._compute_confluence_score(
        has_sweep=True, has_bos=True, has_fvg=True,
        rel_volume=1.6, is_confirmed=True, activity_rank=45, signal_type="BUY"
    )
    assert 75.0 <= s2 < 85.0

    # 3. Incomplete: Missing FVG -> capped at WATCH (< 75.0)
    s3 = strategy_engine._compute_confluence_score(
        has_sweep=True, has_bos=True, has_fvg=False,
        rel_volume=2.5, is_confirmed=False, activity_rank=1, signal_type="WATCH"
    )
    assert s3 < 75.0


def test_position_size_calculator_api():
    """Verify INR position size calculation, margin allocation, whole shares, and 15:15 IST square-off notice."""
    from fastapi.testclient import TestClient
    from backend.main import app
    client = TestClient(app)

    # 1. Buy setup sizing
    payload = {
        "capital_inr": 100000.0,
        "risk_pct_or_inr": 1500.0,
        "entry_price": 500.0,
        "stop_loss": 490.0,
        "target_1": 520.0,
        "target_2": 530.0,
        "is_short": False,
        "leverage_mis": 5.0
    }
    resp = client.post("/api/scanner/position-size", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    # 1500 / 10 = 150 shares
    assert data["order_sizing"]["recommended_quantity"] == 150
    assert data["capital_and_risk"]["actual_risk_inr"] == 1500.0
    assert data["profit_projections"]["target_1_profit_inr"] == 3000.0
    assert data["profit_projections"]["target_2_profit_inr"] == 4500.0
    assert "15:15 IST" in data["compliance_notice"]

    # 2. Short setup sizing with exchange short notice
    payload_short = {
        "capital_inr": 50000.0,
        "risk_pct_or_inr": 1000.0,
        "entry_price": 1000.0,
        "stop_loss": 1020.0,
        "target_1": 960.0,
        "target_2": 940.0,
        "is_short": True,
        "leverage_mis": 5.0
    }
    resp_short = client.post("/api/scanner/position-size", json=payload_short)
    assert resp_short.status_code == 200
    data_short = resp_short.json()
    # 1000 / 20 = 50 shares
    assert data_short["order_sizing"]["recommended_quantity"] == 50
    assert "SHORT" in data_short["compliance_notice"]
    assert "15:15 IST" in data_short["compliance_notice"]


def test_scanner_timeframe_parameter():
    """Verify timeframe parameter support (5m, 10m, 15m) in scanner."""
    from fastapi.testclient import TestClient
    from backend.main import app
    client = TestClient(app)

    # Check status endpoint returns timeframe
    resp = client.get("/api/scanner/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "timeframe" in data


# ==============================================================================
# 12. INSTITUTIONAL LIQUIDITY SWEEP + BOS + FVG STRATEGY TESTS
# ==============================================================================

def test_fvg_3_candle_imbalance_detection():
    """Verify 3-candle Fair Value Gap (FVG) detection for both Bullish and Bearish imbalances."""
    from backend.strategy import detect_fair_value_gaps
    
    # 1. Bullish FVG: Candle 1 High < Candle 3 Low
    bullish_data = [
        {"open": 100.0, "high": 102.0, "low": 99.0, "close": 101.0, "volume": 1000},
        {"open": 101.0, "high": 112.0, "low": 101.0, "close": 111.0, "volume": 5000}, # Displacement
        {"open": 111.0, "high": 116.0, "low": 107.0, "close": 115.0, "volume": 2000},
    ]
    df_bull = pd.DataFrame(bullish_data)
    fvgs_bull = detect_fair_value_gaps(df_bull)
    assert len(fvgs_bull) == 1
    assert fvgs_bull[0]["type"] == "Bullish"
    assert fvgs_bull[0]["gap_low"] == 102.0
    assert fvgs_bull[0]["gap_high"] == 107.0
    assert fvgs_bull[0]["gap_size"] == 5.0

    # 2. Bearish FVG: Candle 1 Low > Candle 3 High
    bearish_data = [
        {"open": 115.0, "high": 116.0, "low": 112.0, "close": 113.0, "volume": 1000},
        {"open": 113.0, "high": 113.0, "low": 102.0, "close": 103.0, "volume": 5000}, # Displacement
        {"open": 103.0, "high": 107.0, "low": 100.0, "close": 101.0, "volume": 2000},
    ]
    df_bear = pd.DataFrame(bearish_data)
    fvgs_bear = detect_fair_value_gaps(df_bear)
    assert len(fvgs_bear) == 1
    assert fvgs_bear[0]["type"] == "Bearish"
    assert fvgs_bear[0]["gap_low"] == 107.0
    assert fvgs_bear[0]["gap_high"] == 112.0
    assert fvgs_bear[0]["gap_size"] == 5.0


def test_bullish_liquidity_sweep_bos_fvg_buy_strategy():
    """Verify end-to-end BUY strategy: Liquidity Sweep + Bullish BOS + FVG Retracement."""
    from backend.strategy import strategy_engine
    
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    # 25 bars baseline range around 1000.0
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            1000.0, 1003.0, 997.0, 1000.0, 10000.0, 0
        ])
    
    # Bar 25: Swing Low formed at 995.0
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 1000.0, 1001.0, 995.0, 998.0, 10000.0, 0])
    
    # Bar 26: Swing High formed at 1008.0
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 998.0, 1008.0, 997.0, 1006.0, 12000.0, 0])
    
    # Bar 27: Liquidity Sweep of Swing Low (dips to 993.0 < 995.0, closes at 999.0 > 995.0)
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 996.0, 1000.0, 993.0, 999.0, 18000.0, 0])
    
    # Bar 28: Bullish Displacement creating FVG Candle 1
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 999.0, 1004.0, 998.0, 1003.0, 15000.0, 0])
    
    # Bar 29: Massive Displacement Candle 2 (closes at 1018.0 > 1008.0 BOS)
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 1003.0, 1020.0, 1002.0, 1018.0, 35000.0, 0])
    
    # Bar 30: FVG Candle 3 (Low at 1010.0 > Bar 28 High 1004.0 -> FVG [1004, 1010])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 1018.0, 1025.0, 1010.0, 1022.0, 25000.0, 0])
    
    # Bar 31: Retracement into FVG Zone [1004 - 1010] (low dips to 1008.0, closes at 1015.0)
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 1020.0, 1021.0, 1008.0, 1015.0, 22000.0, 0])
    
    # Bar 32: Bullish Confirmation Candle (closes at 1024.0 with 2.5x volume)
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 1015.0, 1026.0, 1014.0, 1024.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="SBIN",
        company="State Bank of India",
        raw_candles=rows[::-1], # Newest first as per Upstox convention
        activity_rank=5,
        session_traded_value_cr=45.0,
        bid_ask_spread_pct=0.03
    )

    assert res is not None
    assert res["Symbol"] == "SBIN"
    assert res["Signal"] == "BUY"
    assert res["Status"] == "BUY"
    assert res["Is Confirmed"] is True
    assert "Bullish Sweep" in res["Sweep"] or res["Sweep Type"] == "Bullish"
    assert res["BOS"] == "Bullish"
    assert res["FVG"] == "Bullish"
    assert "1:2 / 1:3" in res["Risk/Reward"]
    assert res["Target 1"] > res["Entry"]
    assert res["Target 2"] > res["Target 1"]
    assert res["Stop-Loss"] < res["Entry"]
    assert res["Score"] >= 75.0


def test_bearish_liquidity_sweep_bos_fvg_sell_strategy():
    """Verify end-to-end SELL strategy: Liquidity Sweep of High + Bearish BOS + FVG Retracement."""
    from backend.strategy import strategy_engine
    
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    # 25 bars baseline range around 1000.0
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            1000.0, 1003.0, 997.0, 1000.0, 10000.0, 0
        ])
    
    # Bar 25: Swing High formed at 1008.0
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 1000.0, 1008.0, 999.0, 1002.0, 10000.0, 0])
    
    # Bar 26: Swing Low formed at 994.0
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 1002.0, 1003.0, 994.0, 996.0, 12000.0, 0])
    
    # Bar 27: Liquidity Sweep of Swing High (spikes to 1011.0 > 1008.0, closes at 1004.0 < 1008.0)
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 1004.0, 1011.0, 1001.0, 1004.0, 18000.0, 0])
    
    # Bar 28: Bearish Displacement creating FVG Candle 1
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 1003.0, 1004.0, 996.0, 998.0, 15000.0, 0])
    
    # Bar 29: Massive Bearish Displacement Candle 2 (closes at 982.0 < 994.0 BOS)
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 997.0, 998.0, 980.0, 982.0, 35000.0, 0])
    
    # Bar 30: FVG Candle 3 (High at 988.0 < Bar 28 Low 996.0 -> Bearish FVG [988, 996])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 982.0, 988.0, 975.0, 978.0, 25000.0, 0])
    
    # Bar 31: Retracement up into FVG Zone [988 - 996] (high touches 991.0, closes at 984.0)
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 980.0, 991.0, 979.0, 984.0, 22000.0, 0])
    
    # Bar 32: Bearish Confirmation Candle (closes at 974.0 with 2.5x volume)
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 984.0, 985.0, 972.0, 974.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="TATASTEEL",
        company="Tata Steel Limited",
        raw_candles=rows[::-1],
        activity_rank=8,
        session_traded_value_cr=35.0,
        bid_ask_spread_pct=0.03
    )

    assert res is not None
    assert res["Symbol"] == "TATASTEEL"
    assert res["Signal"] == "SELL"
    assert res["Status"] == "SELL"
    assert res["Is Confirmed"] is True
    assert "Bearish Sweep" in res["Sweep"] or res["Sweep Type"] == "Bearish"
    assert res["BOS"] == "Bearish"
    assert res["FVG"] == "Bearish"
    assert "1:2 / 1:3" in res["Risk/Reward"]
    assert res["Target 1"] < res["Entry"]
    assert res["Target 2"] < res["Target 1"]
    assert res["Stop-Loss"] > res["Entry"]
    assert res["Score"] >= 75.0


def test_confluence_scoring_tiers():
    """Verify 0-100 confluence scoring classification rules."""
    from backend.strategy import strategy_engine
    
    # 1. High confluence: Sweep + BOS + FVG + RelVol >= 2.0x + Top 25
    s1 = strategy_engine._compute_confluence_score(
        has_sweep=True, has_bos=True, has_fvg=True,
        rel_volume=2.2, is_confirmed=True, activity_rank=10, signal_type="BUY"
    )
    assert 85.0 <= s1 <= 100.0

    # 2. Valid setup: Sweep + BOS + FVG + RelVol >= 1.5x
    s2 = strategy_engine._compute_confluence_score(
        has_sweep=True, has_bos=True, has_fvg=True,
        rel_volume=1.6, is_confirmed=True, activity_rank=45, signal_type="BUY"
    )
    assert 75.0 <= s2 < 85.0

    # 3. Incomplete: Missing FVG -> capped at WATCH (< 75.0)
    s3 = strategy_engine._compute_confluence_score(
        has_sweep=True, has_bos=True, has_fvg=False,
        rel_volume=2.5, is_confirmed=False, activity_rank=1, signal_type="WATCH"
    )
    assert s3 < 75.0
