---
name: trader-risk
description: >-
  NSE SMC Risk Manager. Institutional gatekeeper enforcing risk limits in INR (₹): max risk per trade, max daily loss, minimum 1:3 R:R ratio, liquidity sweep verification, session timing filters (9:45-11:30 AM and 1:30-3:00 PM IST), and mandatory 15:15 IST square-off. Use when checking trade validity, risk parameters, or verifying rule compliance.
argument-hint: "[path to order or trade details]"
---

# trader-risk: NSE SMC Institutional Risk Gatekeeper

The Risk Manager ensures that every proposed trade strictly satisfies institutional risk control criteria before execution.

## Institutional Gates (BLOCK on Violation)
1. **Liquidity Sweep Gate**: Blocks any setup that attempts to enter a breakout without a documented liquidity sweep.
2. **Structural Invalidation Gate**: Blocks any trade without an explicit structural Stop Loss.
3. **Minimum R:R Gate**: Blocks any trade with Reward-to-Risk ratio under **1:3**.
4. **Max Loss per Trade (₹)**: Ensures total monetary risk (`Qty * (Entry - Stop)`) is within user's configured per-trade limit (e.g., ₹1,000 / ₹2,000 / ₹5,000).
5. **Max Daily Loss (₹)**: Rejects trades if cumulative daily losses reach the daily threshold.
6. **Max Trades per Day**: Enforces high selectivity (typically maximum 3 high-probability setups per day).
7. **NSE Session Window Filter**:
   - Allowed execution: Session 1 (9:45 - 11:30 AM IST) and Session 2 (1:30 - 3:00 PM IST).
   - Strictly BLOCKS new entries during the 11:30 AM - 1:30 PM mid-day chop or after 3:00 PM IST.

