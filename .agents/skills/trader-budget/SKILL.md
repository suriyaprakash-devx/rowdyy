---
name: trader-budget
description: >-
  NSE Position Sizing & INR Capital Allocator. Computes exact whole share quantities for NSE cash equities or lot sizes for NSE F&O contracts based on trading capital in INR (₹), max loss per trade in INR (₹), cash buffer percentage, and distance to SMC structural stop loss. Use when calculating position size, share quantity, or margin requirements.
argument-hint: "[capital in INR] [--risk-per-trade INR]"
---

# trader-budget: NSE Position Sizing & Capital Allocator (INR)

The Budget Manager calculates exact position sizing calibrated to the user's trading capital and risk tolerance in Indian Rupees (₹).

## Position Sizing Formulas
1. **NSE Cash Equities**:
   - `Risk_per_share = abs(Entry - Stop_Loss)`
   - `Max_Shares_by_Risk = floor(Max_Loss_per_Trade_INR / Risk_per_share)`
   - `Max_Shares_by_Capital = floor((Available_Capital_INR * Leverage_Factor) / Entry)`
   - `Final_Quantity = min(Max_Shares_by_Risk, Max_Shares_by_Capital)`
2. **NSE Futures & Options (F&O)**:
   - Sized in whole lot increments based on official NSE Lot Sizes (e.g., RELIANCE: 250, NIFTY: 25/50, BANKNIFTY: 15).
   - `Lots = floor(Max_Loss_per_Trade_INR / (Risk_per_share * Lot_Size))`

