---
name: trader-scanner
description: >-
  NSE SMC Market Scanner. Scans high-liquidity NSE stocks (Nifty 50, Nifty Bank, Nifty 200, F&O universe) for institutional Smart Money Concepts (SMC) setups: External Market Structure (BOS/CHoCH), Pre-Market High/Low sweeps (9:00-9:15 AM IST), Opening Range High/Low sweeps, Equal Highs/Lows (EQH/EQL), and unmitigated Order Blocks with Fair Value Gaps (FVG) in Premium/Discount zones. Use when the user asks to scan NSE stocks, find intraday setups, or identify market structure breaks.
argument-hint: "[nifty50 | niftybank | fno | universe] [--session 1|2]"
---

# trader-scanner: NSE Institutional SMC Scanner

The Chart Scanner scans high-liquidity NSE equities (Nifty 50, Nifty Bank, Nifty 200, and F&O universe) to identify institutional Smart Money Concepts (SMC) setups.

## Core Capabilities for NSE
1. **Universe Filtering**:
   - Focuses strictly on liquid instruments: NIFTY 50, NIFTY BANK, NIFTY FINSERVICE, and F&O active equities.
   - Requires minimum Average Daily Turnover > ₹100 Crore to prevent slippage.
2. **HTF Market Structure**:
   - Maps Daily (D1) directional bias via previous day OHLC expansion.
   - Maps 15-minute / 30-minute external swing points (BOS / CHoCH).
3. **Liquidity Mapping**:
   - Detects Pre-Market High/Low (9:00 - 9:15 AM IST).
   - Detects Opening Range (9:15 - 9:30 AM IST) Highs (ORH) and Lows (ORL).
   - Flags Equal Highs (EQH) and Equal Lows (EQL) resting liquidity.
4. **Liquidity Sweep Detection**:
   - Flags price wicking beyond old swing levels and closing back inside the range.
   - Filters out trap breakouts that lack institutional sweeps.
5. **Supply & Demand Zones**:
   - Locates unmitigated 15m Order Blocks (OB) with 3-candle Fair Value Gaps (FVG).
   - Computes 50% Equilibrium: Discount (<50%) for BUY scans, Premium (>50%) for SELL scans.

## Execution Windows (IST)
- **Pre-Market Scan**: 9:00 AM - 9:15 AM IST.
- **Morning Session Scan**: 9:45 AM - 11:30 AM IST.
- **Afternoon Expansion Scan**: 1:30 PM - 3:00 PM IST.

