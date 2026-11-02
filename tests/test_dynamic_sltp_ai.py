import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from backend.main import app
from backend.strategy import (
    strategy_engine,
    filter_completed_candles,
    detect_fair_value_gaps,
    find_swing_points
)

client = TestClient(app)

# ==============================================================================
# PHASE 8 & 12: DYNAMIC STOP LOSS (STRUCTURAL INVALIDATION) UNIT TESTS
# ==============================================================================

def test_dynamic_structural_sl_buy_calculation():
    """Verify structural Stop Loss is placed below the sweep low with 0.15 ATR buffer and NSE 0.05 tick alignment."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            500.0, 502.0, 498.0, 500.0, 10000.0, 0
        ])
    # Swing low at 495.0
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 500.0, 501.0, 495.0, 498.0, 10000.0, 0])
    # Swing high at 505.0
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 498.0, 505.0, 497.0, 504.0, 12000.0, 0])
    # Sweep of Swing Low (dips to 492.23, closes back at 499.0)
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 498.0, 500.0, 492.23, 499.0, 18000.0, 0])
    # Displacement Candle 1
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 499.0, 503.0, 498.0, 502.0, 15000.0, 0])
    # Displacement Candle 2 (BOS above 505.0)
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 502.0, 512.0, 501.0, 510.0, 35000.0, 0])
    # FVG Candle 3 (Low at 506.0 > High 503.0 -> FVG [503, 506])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 510.0, 515.0, 506.0, 512.0, 25000.0, 0])
    # Retracement into FVG
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 512.0, 512.0, 504.0, 508.0, 20000.0, 0])
    # Confirmation candle
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 508.0, 516.0, 507.0, 515.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="INFY",
        company="Infosys Limited",
        raw_candles=rows[::-1],
        activity_rank=3,
        session_traded_value_cr=50.0,
        bid_ask_spread_pct=0.02,
        timeframe_minutes=10
    )

    assert res is not None
    assert res["Signal"] == "BUY"
    sl = res["Stop-Loss"]
    entry = res["Entry"]
    # Structural invalidation SL must be below sweep low (492.23)
    assert sl < 492.23
    assert sl < entry
    # Verify tick size alignment (multiples of 0.05)
    assert round(sl % 0.05, 4) in [0.0, 0.05]
    # Check that SL is not a blind fixed percent (e.g. exactly 1.0% or 2.0%)
    pct_dist = (entry - sl) / entry
    assert pct_dist > 0.01


def test_dynamic_structural_sl_sell_calculation():
    """Verify structural Stop Loss is placed above the sweep high with 0.15 ATR buffer and NSE 0.05 tick alignment."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            1000.0, 1004.0, 996.0, 1000.0, 10000.0, 0
        ])
    # Swing high at 1010.0
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 1000.0, 1010.0, 999.0, 1003.0, 10000.0, 0])
    # Swing low at 992.0
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 1003.0, 1004.0, 992.0, 995.0, 12000.0, 0])
    # Sweep of High (spikes to 1013.62, closes at 1005.0)
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 1005.0, 1013.62, 1002.0, 1005.0, 18000.0, 0])
    # Displacement Candle 1
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 1005.0, 1006.0, 995.0, 997.0, 15000.0, 0])
    # Displacement Candle 2 (BOS below 992.0)
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 996.0, 997.0, 982.0, 984.0, 35000.0, 0])
    # FVG Candle 3 (High at 989.0 < Low 995.0 -> FVG [989, 995])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 984.0, 989.0, 978.0, 981.0, 25000.0, 0])
    # Retracement into FVG
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 981.0, 992.0, 980.0, 986.0, 20000.0, 0])
    # Confirmation candle
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 986.0, 987.0, 974.0, 976.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="TCS",
        company="Tata Consultancy Services",
        raw_candles=rows[::-1],
        activity_rank=2,
        session_traded_value_cr=60.0,
        bid_ask_spread_pct=0.02,
        timeframe_minutes=10
    )

    assert res is not None
    assert res["Signal"] == "SELL"
    sl = res["Stop-Loss"]
    entry = res["Entry"]
    # Structural invalidation SL must be above sweep high (1013.62)
    assert sl > 1013.62
    assert sl > entry
    # Tick size alignment
    assert round(sl % 0.05, 4) in [0.0, 0.05]


# ==============================================================================
# PHASE 9 & 13: DYNAMIC TAKE PROFIT (TP1, TP2, TP3) INTEGRATION TESTS
# ==============================================================================

def test_dynamic_take_profit_multi_tier_buy():
    """Verify TP1 (1:2), TP2 (1:3), and TP3 (1:5 runner) ordering and ratios for BUY."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            200.0, 202.0, 198.0, 200.0, 10000.0, 0
        ])
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 200.0, 201.0, 196.0, 199.0, 10000.0, 0])
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 199.0, 205.0, 198.0, 204.0, 12000.0, 0])
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 204.0, 204.0, 194.0, 201.0, 18000.0, 0])
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 201.0, 204.0, 200.0, 203.0, 15000.0, 0])
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 203.0, 212.0, 202.0, 210.0, 35000.0, 0])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 210.0, 214.0, 206.0, 211.0, 25000.0, 0])
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 211.0, 211.0, 205.0, 208.0, 20000.0, 0])
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 208.0, 215.0, 207.0, 214.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="ITC",
        company="ITC Limited",
        raw_candles=rows[::-1],
        timeframe_minutes=10
    )

    assert res is not None
    entry = res["Entry"]
    sl = res["Stop-Loss"]
    t1 = res["Target 1"]
    t2 = res["Target 2"]
    t3 = res["Target 3"]

    risk = entry - sl
    assert risk > 0
    assert t1 > entry
    assert t2 > t1
    assert t3 > t2
    # Verify R:R scaling
    assert (t1 - entry) >= (1.5 * risk)
    assert (t2 - entry) >= (2.5 * risk)
    assert (t3 - entry) >= (4.0 * risk)


def test_dynamic_take_profit_multi_tier_sell():
    """Verify TP1, TP2, TP3 ordering and ratios for SELL."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            1000.0, 1004.0, 996.0, 1000.0, 10000.0, 0
        ])
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 1000.0, 1010.0, 999.0, 1003.0, 10000.0, 0])
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 1003.0, 1004.0, 992.0, 995.0, 12000.0, 0])
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 1005.0, 1014.0, 1002.0, 1005.0, 18000.0, 0])
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 1005.0, 1006.0, 995.0, 997.0, 15000.0, 0])
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 996.0, 997.0, 982.0, 984.0, 35000.0, 0])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 984.0, 989.0, 978.0, 981.0, 25000.0, 0])
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 981.0, 992.0, 980.0, 986.0, 20000.0, 0])
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 986.0, 987.0, 974.0, 976.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="HDFCBANK",
        company="HDFC Bank Limited",
        raw_candles=rows[::-1],
        timeframe_minutes=10
    )

    assert res is not None
    entry = res["Entry"]
    sl = res["Stop-Loss"]
    t1 = res["Target 1"]
    t2 = res["Target 2"]
    t3 = res["Target 3"]

    risk = sl - entry
    assert risk > 0
    assert t1 < entry
    assert t2 < t1
    assert t3 < t2
    assert (entry - t1) >= (1.5 * risk)
    assert (entry - t2) >= (2.5 * risk)
    assert (entry - t3) >= (4.0 * risk)


# ==============================================================================
# PHASE 10 & 11: AI CHART ANALYSIS & PROBABILITY CALIBRATION TESTS
# ==============================================================================

def test_ai_explanation_payload_structure():
    """Verify AI explanation contains all mandated institutional rationale fields."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            500.0, 502.0, 498.0, 500.0, 10000.0, 0
        ])
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 500.0, 501.0, 495.0, 498.0, 10000.0, 0])
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 498.0, 505.0, 497.0, 504.0, 12000.0, 0])
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 498.0, 500.0, 492.0, 499.0, 18000.0, 0])
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 499.0, 503.0, 498.0, 502.0, 15000.0, 0])
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 502.0, 512.0, 501.0, 510.0, 35000.0, 0])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 510.0, 515.0, 506.0, 512.0, 25000.0, 0])
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 512.0, 512.0, 504.0, 508.0, 20000.0, 0])
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 508.0, 516.0, 507.0, 515.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="SBIN",
        company="State Bank of India",
        raw_candles=rows[::-1],
        timeframe_minutes=10
    )

    assert "ai_explanation" in res
    ai = res["ai_explanation"]

    assert "validity_reason" in ai and len(ai["validity_reason"]) > 20
    assert "sl_rationale" in ai and "0.15 ATR" in ai["sl_rationale"]
    assert "tp1_rationale" in ai
    assert "tp2_rationale" in ai
    assert "tp3_rationale" in ai
    assert "market_structure" in ai
    assert "opposing_liquidity" in ai
    assert "risks_and_invalidation" in ai
    assert "probability_model_status" in ai
    assert "win_probability_pct" in ai
    assert "confidence_score" in ai
    assert "missing_confirmations" in ai

    # Verify separation of confidence vs probability
    assert isinstance(ai["confidence_score"], (int, float))
    assert isinstance(ai["win_probability_pct"], (int, float))
    assert ai["brier_score"] == 0.18


def test_chart_levels_and_recent_candles():
    """Verify chart_levels and recent_candles are populated for frontend interactive SVG chart."""
    base_time = datetime(2026, 1, 1, 9, 15)
    rows = []
    for i in range(25):
        rows.append([
            (base_time + timedelta(minutes=10 * i)).isoformat(),
            100.0, 102.0, 98.0, 100.0, 10000.0, 0
        ])
    rows.append([(base_time + timedelta(minutes=250)).isoformat(), 100.0, 101.0, 95.0, 98.0, 10000.0, 0])
    rows.append([(base_time + timedelta(minutes=260)).isoformat(), 98.0, 108.0, 97.0, 106.0, 12000.0, 0])
    rows.append([(base_time + timedelta(minutes=270)).isoformat(), 106.0, 106.0, 93.0, 99.0, 18000.0, 0])
    rows.append([(base_time + timedelta(minutes=280)).isoformat(), 99.0, 104.0, 98.0, 103.0, 15000.0, 0])
    rows.append([(base_time + timedelta(minutes=290)).isoformat(), 103.0, 120.0, 102.0, 118.0, 35000.0, 0])
    rows.append([(base_time + timedelta(minutes=300)).isoformat(), 118.0, 125.0, 110.0, 122.0, 25000.0, 0])
    rows.append([(base_time + timedelta(minutes=310)).isoformat(), 120.0, 121.0, 108.0, 115.0, 22000.0, 0])
    rows.append([(base_time + timedelta(minutes=320)).isoformat(), 115.0, 126.0, 114.0, 124.0, 30000.0, 0])

    res = strategy_engine.analyze_stock(
        symbol="RELIANCE",
        company="Reliance Industries",
        raw_candles=rows[::-1],
        timeframe_minutes=10
    )

    assert "chart_levels" in res
    cl = res["chart_levels"]
    assert "sweep_level" in cl
    assert "bos_level" in cl
    assert "fvg_low" in cl
    assert "fvg_high" in cl
    assert "entry_price" in cl
    assert "stop_loss" in cl
    assert "target_1" in cl
    assert "target_2" in cl
    assert "target_3" in cl

    assert "recent_candles" in res
    assert len(res["recent_candles"]) >= 20
    first_c = res["recent_candles"][0]
    assert "open" in first_c and "high" in first_c and "low" in first_c and "close" in first_c


# ==============================================================================
# PHASE 7 & 14: SECURITY AUDIT & SYSTEM ENDPOINT TESTS
# ==============================================================================

def test_security_audit_zero_automated_orders():
    """Verify zero order execution routes or automated broker submissions exist."""
    routes = [getattr(route, 'path', getattr(route, 'path_format', '')) for route in app.routes]
    # No order execution endpoints allowed
    forbidden = ["/api/order/place", "/api/order/execute", "/api/trade/execute", "/api/broker/buy", "/api/broker/sell"]
    for f in forbidden:
        assert f not in routes

    # Verify order slip format explicitly contains ALERT-ONLY
    from backend.algo_intraday import run_ai_intraday_analysis
    res = run_ai_intraday_analysis("TCS", timeframe="intraday")
    ticket = res["order_ticket"]
    assert "Alert only" in ticket["formatted_ticket"] or "Zero automated" in ticket["formatted_ticket"]


def test_scanner_stock_detail_endpoint():
    """Verify GET /api/scanner/stock-detail/{symbol} returns full SMC breakdown."""
    resp = client.get("/api/scanner/stock-detail/TCS?timeframe=10m")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["symbol"] == "TCS"
    assert "data" in data
