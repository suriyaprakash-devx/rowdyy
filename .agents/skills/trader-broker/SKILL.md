---
name: trader-broker
description: >-
  NSE Broker Advisory & Execution Gate. Generates institutional-grade order tickets and API payloads for Indian stock brokers (Upstox API v2/v3, Zerodha Kite Connect, Angel One SmartAPI, Groww, ICICI Direct, paper trading). Enforces strict two-step manual verification and bracket/OCO specifications with 15:15 IST auto square-off notice. Use when preparing broker execution tickets or paper trading orders.
argument-hint: "[order ticket number or symbol]"
---

# trader-broker: NSE Broker Advisory & Order Ticket Engine

Prepares institutional order execution tickets for Indian brokers while maintaining strict semi-algo safety controls.

## Safety Architecture
- **Strictly Advisory Semi-Algo**: Generates ready-to-copy order slips and standardized API payloads.
- **Two-Step Approval**: No order is executed without explicit user consent.
- **Broker Compatibility**:
  - Upstox API v2 / v3 (Intraday MIS / OCO)
  - Zerodha Kite Connect API (MIS / Cover Order)
  - Angel One SmartAPI
  - Manual Broker Terminal Copy-Paste Ticket

## Order Ticket Format
```text
=== NSE INTRADAY ORDER SLIP ===
Exchange: NSE
Segment: Equity Cash (MIS) / F&O
Symbol: [SYMBOL]
Order Type: LIMIT / SL-LIMIT
Product Code: MIS (Intraday)
Action: [BUY / SELL]
Quantity: [QTY]
Limit Entry Price: ₹[PRICE]
Trigger Price (SL): ₹[SL_PRICE]
Target 1 Price: ₹[TGT1_PRICE]
Target 2 Price: ₹[TGT2_PRICE]
Auto Square-Off Time: 15:15 IST
===============================
```

