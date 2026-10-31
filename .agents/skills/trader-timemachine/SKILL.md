---
name: trader-timemachine
description: >-
  NSE SMC Historical Replay & Monte Carlo Simulator. Replays intraday sessions across 75 five-minute bars (9:15 AM - 3:30 PM IST) using historical NSE data. Simulates 10,000 session paths to calculate empirical probabilities of hitting 1:3 R:R and 1:5 R:R targets before Stop Loss for identified SMC setups. Use when backtesting, evaluating setup odds, or running Monte Carlo simulations.
argument-hint: "[SYMBOL] [--date YYYY-MM-DD] [--rr 1:3|1:5]"
---

# trader-timemachine: NSE Historical Replay & SMC Monte Carlo Engine

Replays historical NSE intraday sessions (75 five-minute candles between 9:15 AM and 3:30 PM IST) and simulates statistical forward outcomes.

## Simulation Framework
1. **Historical Bar Pool**:
   - Collects 5m completed bars for liquid NSE equities across the last 60 trading days.
   - Evaluates performance of SMC liquidity sweeps and Order Block retracements.
2. **10,000 Monte Carlo Replays**:
   - From the entry point, simulates 10,000 forward paths matching intraday volatility profiles of the asset.
   - Determines probability of:
     - Target 1 (1:3 R:R) reached first.
     - Target 2 (1:5 R:R) reached first.
     - Structural Stop Loss reached first.
     - Trade open at 15:15 IST square-off.
3. **Statistical Verdict**:
   - Provides honest edge evaluation: Expected Value (EV), win rate, and profit factor.

