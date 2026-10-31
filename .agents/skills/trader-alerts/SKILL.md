---
name: trader-alerts
description: >-
  NSE Market Telemetry & SMC Price Alerts. Tracks IST market milestones (9:00 AM Pre-market, 9:15 AM Open, 9:45 AM Session 1, 11:30 AM Mid-day Chop, 1:30 PM Session 2, 15:00 PM Cutoff, 15:15 PM Square-off) and monitors price alerts for 15m HTF zone taps, liquidity sweeps, LTF CHoCH triggers, and Target/SL hits. Use when setting price alerts or checking market session status.
argument-hint: "[symbol] [--alert tap|sweep|choch|target|stop]"
---

# trader-alerts: NSE Market Telemetry & SMC Price Alerts

Price Alerts monitors key price levels, SMC structural triggers, and Indian Standard Time (IST) market sessions.

## Market Milestones (IST)
- **09:00 AM**: Pre-Market Session Open (Discovery of gap and Pre-Market High/Low).
- **09:15 AM**: Normal Market Open (Opening auction volatility).
- **09:45 AM**: Session 1 Open (Opening range established, institutional liquidity active).
- **11:30 AM**: Mid-day Consolidation Warning (Avoid fresh entries).
- **01:30 PM**: Session 2 Open (European open liquidity, afternoon expansion).
- **03:00 PM**: New Entry Cutoff (No further orders allowed).
- **03:15 PM**: Mandatory Intraday Auto Square-Off.
- **03:30 PM**: Market Close.

## SMC Structural Alerts
- **Zone Tap Alert**: Rings when 15m price retraces into Demand/Supply Order Block.
- **Liquidity Sweep Alert**: Rings when price wicks beyond ORH/ORL/EQH/EQL and re-enters.
- **CHoCH Trigger Alert**: Rings when 1m/5m displacement breaks internal structure.
- **Target & SL Alerts**: Rings when Target 1 (1:3), Target 2 (1:5), or Invalidation SL is reached.

