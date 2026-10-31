---
name: trader-entry
description: >-
  NSE SMC Entry Timer & Trigger. Monitors price tapping a 15m Order Block / FVG and confirms Lower Timeframe (LTF 1m/5m) Change of Character (CHoCH) displacement. Confirms entry on 1m/5m Order Block retest in Discount (BUY) or Premium (SELL). Strictly enforces the rule: NO entry without a prior liquidity sweep. Use when timing entries, confirming CHoCH triggers, or evaluating 1m/5m execution bars.
argument-hint: "[SYMBOL] [--interval 1m|5m]"
---

# trader-entry: NSE SMC Lower Timeframe (LTF) Execution Trigger

The Entry Timer turns an identified HTF setup into an exact, low-risk execution trigger using Lower Timeframe (1m/5m) Smart Money Concepts.

## Execution Rules
1. **HTF Zone Tap**:
   - The stock must tap into an unmitigated 15m Demand OB (for BUY) or Supply OB (for SELL).
2. **Premium / Discount Rule**:
   - BUY entries are valid **ONLY in the Discount zone** (< 50% of the 15m swing range).
   - SELL entries are valid **ONLY in the Premium zone** (> 50% of the 15m swing range).
3. **Liquidity Sweep Confirmation**:
   - A liquidity sweep (Pre-market high/low, ORH/ORL, EQH/EQL, or retail trendline) MUST have occurred before the trigger.
   - **Breakouts without sweeps are strictly rejected.**
4. **LTF 1m/5m Displacement & CHoCH**:
   - Drop to 1m or 5m timeframe.
   - Look for an aggressive displacement candle (large body, institutional volume) that breaks the recent internal swing high (for BUY) or swing low (for SELL), creating a **Change of Character (CHoCH)**.
5. **Entry on OB Retest**:
   - Mark the 1m/5m Order Block or Fair Value Gap responsible for the displacement.
   - Enter on the retest of this 1m/5m zone.

