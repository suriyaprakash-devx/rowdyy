---
name: trader-exit
description: >-
  NSE SMC Exit & Invalidation Level Planner. Calculates tight structural Stop Loss (invalidation level below/above LTF swing), Target 1 (1:3 R:R), Target 2 (1:5 R:R / Major Swing Target), and enforces the mandatory 15:15 IST intraday auto square-off rule. Use when setting stop-loss, profit targets, or planning intraday exit strategy.
argument-hint: "[--entry PRICE] [--stop PRICE] [--target1 3R] [--target2 5R]"
---

# trader-exit: NSE SMC Invalidation SL & Dynamic R:R Planner

The Exit Planner establishes exact risk and reward parameters prior to order execution adhering strictly to SMC structural invalidation.

## Key Rules
1. **Structural Stop Loss (SL)**:
   - Placed tightly below the LTF structural swing low (for BUY) or above the LTF structural swing high (for SELL) that initiated the displacement.
   - Adds a small buffer (₹0.50 to ₹2.00 depending on stock price) to prevent spread wicks.
2. **Target 1 (1:3 Risk-to-Reward)**:
   - First partial profit booking / trailing stop trigger at exactly 3x the risk per share.
   - Target 1 = `Entry + 3 * (Entry - Stop)` for BUY.
   - Target 1 = `Entry - 3 * (Stop - Entry)` for SELL.
3. **Target 2 (1:5 Risk-to-Reward / Major Swing Target)**:
   - Final target at 5x the risk per share or tapping the major external liquidity pool (opposite EQH/EQL, Daily High/Low, or HTF Supply/Demand).
4. **Time-Based Exit (IST)**:
   - Mandatory **15:15 IST** auto square-off. No intraday MIS position may be held past 15:15 IST.

