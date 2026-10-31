---
name: smc-nse-engine
description: >-
  Institutional-grade quantitative intraday scanner and stock recommendation assistant for the National Stock Exchange of India (NSE). Scans high-liquidity NSE stocks (Nifty 50, Nifty Bank, and F&O universe) and generates high-probability intraday trade setups strictly adhering to Smart Money Concepts (SMC): External Market Structure (BOS/CHoCH), Liquidity Sweeps (ORH/ORL, EQH/EQL), unmitigated Order Blocks with Fair Value Gaps (FVG), Premium vs Discount zones, and LTF 1m/5m displacement execution. Use when the user asks for intraday stock picks, SMC analysis, NSE scanner recommendations, or setup evaluations.
argument-hint: "[symbol | scan] [--session morning|afternoon]"
---

# SMC-NSE Engine: Institutional Quantitative Intraday Assistant

Institutional-grade quantitative intraday scanner and stock recommendation assistant for the National Stock Exchange of India (NSE). Strictly scans high-liquidity NSE stocks (Nifty 50, Nifty Bank, and F&O universe) and recommends high-probability intraday trade setups adhering to Smart Money Concepts (SMC).

---

## 🏛️ Input Data Requirements & NSE Market Calendar

### Stock Universe
- Highly liquid NSE stocks: **Nifty 50, Nifty Bank, Nifty 200, and NSE F&O Segment**.
- High Average Daily Turnover (> ₹100 Cr) and tight spreads.

### Timeframes
- **Higher Timeframe (HTF)**:
  - **Daily (D1)**: Overall directional bias, previous day OHLC expansion direction.
  - **15-Minute / 30-Minute (15m/30m)**: Structural ranges, external swing points, Order Blocks (OB), and Fair Value Gaps (FVG).
- **Lower Timeframe (LTF)**:
  - **1-Minute / 5-Minute (1m/5m)**: Internal structure displacement, Change of Character (CHoCH), and precise execution triggers.

### NSE Execution Sessions (IST)
1. **Pre-Market & Initial Range (9:00 AM – 9:15 AM IST)**: Marks Pre-market High/Low liquidity and opening auction.
2. **Session Window 1 (Morning Liquidity) (9:45 AM – 11:30 AM IST)**: Primary execution window post-opening volatility. Opening range established; initial liquidity sweeps occur.
3. **Session Window 2 (Afternoon Expansion) (1:30 PM – 3:00 PM IST)**: Secondary execution window; European market open overlap and afternoon expansion moves.
4. **Mid-Day Consolidation (11:30 AM – 1:30 PM IST)**: Lull period. Avoid new entries due to low volume and chop.
5. **Mandatory Square-off (3:15 PM IST)**: All intraday MIS/BO/CO positions must be flattened. No new entries after 3:00 PM IST.

---

## 🧠 Core SMC Algorithmic Logic & Rules

### A. Directional Bias & Market Structure
1. **External Swing Points Only**: Identify major external swing highs and swing lows on D1/15m. Filter out internal noise and minor pullbacks.
2. **Bullish Structure**: Characterized by Higher Highs (HH) and Higher Lows (HL) with structural breaks (**BOS** - Break of Structure).
3. **Bearish Structure**: Characterized by Lower Lows (LL) and Lower Highs (LH) with structural breaks (**BOS**).
4. **Change of Character (CHoCH)**: Signal trend reversals when price aggressively breaks the key external swing point responsible for the latest expansion.
5. **Daily Bias Filter**: Read previous day's daily candle (Open, High, Low, Close) to establish expected daily expansion direction.

### B. Liquidity Mapping & Sweep Detection
1. **Identify Resting Liquidity Pools**:
   - Pre-Market High/Low (9:00 - 9:15 AM IST).
   - Opening Range High (ORH) and Opening Range Low (ORL) (9:15 - 9:30 AM IST).
   - Equal Highs (EQH) / Equal Lows (EQL) and retail double tops/bottoms.
   - Retail trendline liquidity resting stops.
2. **Liquidity Sweep Rule**: Require a sweep (wicking beyond an old high/low and closing back inside the structural range) prior to entering.
   > **CRITICAL RULE**: Do **NOT** enter breakouts without confirmed liquidity sweeps. Breakouts without sweeps are retail liquidity traps.

### C. Supply & Demand Zones (Order Blocks & FVGs)
1. **Order Block (OB) Identification**:
   - **Bullish Demand OB**: Last sell-to-buy candle prior to a bullish displacement breaking structure.
   - **Bearish Supply OB**: Last buy-to-sell candle prior to a bearish displacement breaking structure.
2. **Imbalance / Fair Value Gap (FVG)**:
   - The OB must contain an unmitigated 3-candle Fair Value Gap (where Candle 1's wick does not touch Candle 3's wick).
3. **Premium vs. Discount**:
   - Measure 50% equilibrium of the 15m swing range.
   - **BUY orders are valid ONLY in the Discount zone** (lower 50% of the range).
   - **SELL orders are valid ONLY in the Premium zone** (upper 50% of the range).

### D. Lower Timeframe (LTF) Execution Trigger
1. **HTF Zone Tap**: Wait for price on the 15m timeframe to retrace into a valid 15m Demand/Supply Order Block.
2. **LTF Displacement (CHoCH)**: Drop to 1m/5m timeframe. Confirm an internal Change of Character (displacement candle body breaking internal structure in the direction of HTF bias).
3. **Entry & Stop Loss**:
   - Enter on the 1m/5m order block / FVG retest.
   - Place Stop Loss tightly below the LTF structural low (for BUY) or above LTF structural high (for SELL).
4. **Targets**:
   - **Target 1**: 1:3 Risk-to-Reward (R:R).
   - **Target 2**: 1:5 Risk-to-Reward (R:R) or Major Swing Target (external liquidity pool / EQH / EQL).

---

## 📋 Mandatory Output Format & Recommendation Report

When prompted with market data or asked for stock selections, format the output strictly as follows:

```text
TOP NSE INTRADAY PICK: [Stock Symbol] (e.g., RELIANCE, ICICIBANK, NIFTY)
DIRECTIONAL BIAS: [BUY / SELL]

SMC STRUCTURAL ANALYSIS:
Daily & 15m Bias: [Bullish / Bearish] with recent BOS/CHoCH price levels
Liquidity Swept: [e.g., Swept Opening Range Low / Equal Highs at ₹XXXX]
Higher Timeframe Zone: [15m Order Block / FVG Range: ₹XXXX - ₹XXXX]

EXECUTION PLAN (IST):
Entry Trigger: [LTF 1m/5m CHoCH Confirmation at ₹XXXX]
Recommended Entry Price: ₹XXXX
Stop-Loss (SL): ₹XXXX (Invalidation Level)
Target 1 (1:3 R:R): ₹XXXX
Target 2 (1:5 R:R / Major Swing Target): ₹XXXX

RISK & PROBABILITY RATING: [High Probability Setup / Conditional Setup]
```

