# NIFTY 500 Intraday SMA 6/30 Scanner & Algorithmic Terminal

A high-performance quantitative trading terminal and decision-support system for NSE cash equities. It dynamically monitors the entire **NIFTY 500 Universe (501 Constituent Equities)** and identifies high-volume intraday trading candidates to generate ranked **BUY and SELL alerts** using **SMA 6/30 crossover on completed 10-minute candles**, relative volume surge (≥ 1.5x), price-action breakout confirmation, and liquidity filters.

> **CRITICAL SAFETY GUARANTEE: STRICTLY ALERT-ONLY SEMI-ALGO**
> This application contains **ABSOLUTELY NO AUTOMATIC ORDER PLACEMENT**. There are no broker order execution APIs, order modification APIs, or background order-placement triggers anywhere in the codebase. All trading decisions and order executions are strictly performed manually by the user in their own broker terminal.

---

## 🏛️ System Architecture

```
                      +-------------------------------------------------------------------+
                      |             React + Vite Frontend (Institutional Dark Glass)       |
                      |  - NIFTY 500 Universe Selector (All 501, N50, N100, N200, MidCap) |
                      |  - Market Session Hero & Live IST Market Telemetry (KPI Cards)    |
                      |  - Confirmed BUY & Confirmed SELL Alert Grids (5-Point Checklist) |
                      |  - NIFTY 500 Equities Table with Smooth Virtual Pagination        |
                      |  - Interactive 10m Candlestick Chart with VWAP, SMA 6/30, Supertrend|
                      |  - Pre-filled Intraday Order Execution Ticket (SL, TGT1, TGT2)    |
                      |  - 15:15 IST Mandatory Intraday Auto Square-Off Advisory Pill    |
                      +---------------------------------+---------------------------------+
                                                        |
                                          HTTP REST API & WebSocket Feed
                                                        |
                                                        v
                      +-------------------------------------------------------------------+
                      |                  Python FastAPI Backend Service                   |
                      |  - NIFTY 500 Universe Ingestion (501 Constituents + ISIN Mapping) |
                      |  - Concurrency Pool (20 workers) with 60s 10m Bar Cache           |
                      |  - Completed 10-Minute Candle Filter (IST Clock Synchronized)     |
                      |  - SMA 6 & SMA 30 Crossover Engine with RelVol & Price Action     |
                      |  - 5-Factor Quantitative Signal Scoring Engine (0 - 100 Points)   |
                      |  - Signal Deduplication Engine (Zero Repeated Trend Alerts)       |
                      |  - Upstox API v3 Client (Intraday & Historical 10m Candles)       |
                      |  - Official NSE Bhavcopy Daily Turnover & ADV Tiering Engine      |
                      |  - Intraday Backtester Engine (Friction & Slippage Adjusted)      |
                      +-----------------+-------------------------------+-----------------+
                                        |                               |
                         SQLAlchemy ORM |                               | Upstox v3 / NSE Data
                                        v                               v
                      +-----------------+-------+       +---------------+-----------------+
                      |   PostgreSQL / SQLite   |       |       Market Data Providers     |
                      | - scan_runs             |       | - Upstox API v3 (10m Candles)   |
                      | - scan_results          |       | - NSE Live Value / Quote Feed   |
                      | - bhavcopy_liquidity    |       | - Official NSE Daily Bhavcopy   |
                      | - oauth_sessions        |       | - Upstox NSE Instrument Master  |
                      +-------------------------+       +---------------------------------+
```

---

## ⚡ Core Strategy Specification

### 1. Stock Selection Strategy: NIFTY 500 Intraday Universe
- **Dynamic Watchlist**: Scans up to the entire **NIFTY 500 universe (501 constituent equities)** or target index slices:
  - `NIFTY 500 (All 501 Stocks)`
  - `NIFTY 50 (Mega Caps)`
  - `NIFTY 100 (Large Caps)`
  - `NIFTY 200 (Large & Mid)`
  - `MidCap 100 (High Momentum Mid Caps)`
  - `Most Active (Turnover Leaders)`
- **Candidate Refresh**: Configurable refresh every 1–5 minutes (default: 180 seconds).
- **Instrument Validation**:
  - Exchange: `NSE`
  - Segment: `NSE_EQ`
  - Series/Type: `EQ`
  - Rejects: Derivatives (Futures/Options), BSE securities, ETFs (e.g. `*BEES`, `SETFNIF50`), suspended symbols, and expired instruments.

### 2. Completed 10-Minute Candle Discipline
- Indicators are computed **strictly on completed 10-minute candles**.
- An active, unclosed candle is discarded until its full 10-minute window has elapsed (e.g., a 10:00 candle is evaluated only at or after 10:10:00 IST).
- Discards future-dated or incomplete bars to eliminate look-ahead bias.

### 3. BUY Candidate Confirmation Checklist
A stock is classified as a confirmed **BUY** alert only when **all 5 conditions** are met:
1. **SMA 6/30 Crossover**:
   - Previous completed candle: `SMA 6 <= SMA 30`
   - Current completed candle: `SMA 6 > SMA 30`
2. **Relative Volume**: `Current Candle Volume / 20-period completed candle volume MA >= 1.5x`.
3. **Price-Action Breakout**: Current completed candle close is strictly greater than the previous completed candle's high (`Close > Prev High`).
4. **Liquidity Check**: Current session traded value ≥ ₹5.0 Cr and bid-ask spread ≤ 0.50%.
5. **Freshness & Deduplication**: Only fresh crossovers (or recent within 3 bars) generate alerts. Ongoing trends do **not** trigger repeat alerts.

### 4. SELL Candidate Confirmation Checklist
A stock is classified as a confirmed **SELL** alert only when **all 5 conditions** are met:
1. **SMA 6/30 Crossover**:
   - Previous completed candle: `SMA 6 >= SMA 30`
   - Current completed candle: `SMA 6 < SMA 30`
2. **Relative Volume**: `Current Candle Volume / 20-period completed candle volume MA >= 1.5x`.
3. **Price-Action Breakdown**: Current completed candle close is strictly less than the previous completed candle's low (`Close < Prev Low`).
4. **Liquidity Check**: Current session traded value ≥ ₹5.0 Cr and bid-ask spread ≤ 0.50%.
5. **Freshness & Deduplication**: Ongoing downward trends are labeled `WATCH`, preventing repeated alert fatigue.

If volume, price action, or liquidity checks fail, the stock is labeled **WATCH (Unconfirmed)** and excluded from confirmed alert grids.

### 5. 5-Factor Quantitative Signal Scoring (0 – 100 Points)
Signals are scored and ranked descending using institutional weighting:
- **Crossover Freshness (30%)**: Current bar cross = 30 pts, 1 bar ago = 24 pts, 2 bars ago = 18 pts, 3 bars ago = 12 pts, older = 5 pts.
- **Relative Volume (25%)**: 1.0x = 10 pts, 1.5x = 18 pts, 2.5x+ = 25 pts.
- **Price-Action Strength (20%)**: Breakout percentage magnitude beyond the prior bar's reference high/low.
- **Traded Value / Activity Rank (15%)**: Rank 1 = 15 pts down to Rank 50 = 6 pts.
- **Liquidity Quality (10%)**: Tight bid-ask spread (≤ 0.05% = 10 pts, ≤ 0.20% = 7 pts, ≤ 0.50% = 5 pts).

---

## 📊 NSE Bhavcopy Historical Research vs Live Intraday Data

| Data Stream | Source | Purpose | Frequency |
|---|---|---|---|
| **Live Intraday Candles** | Upstox API v3 (`/v3/historical-candle/intraday/{key}/minutes/10`) | Real-time 10m completed candles, SMA 6/30, and volume triggers | Real-time scan execution |
| **Live Most Active Ranking** | Official NSE Live Value API / Upstox Quotes | Session traded value ranking (₹ Crores) | Every 1–5 minutes |
| **Historical Daily Bhavcopy** | Official NSE Bhavcopy Archives (`PR.zip` / `sec_bhavdata_full.csv`) | 5-day ADV, historical turnover, and liquidity tiering | End-of-Day / On-Demand |

### Liquidity Tiering (from Bhavcopy ADV):
- **Tier 1 (High Liquidity)**: 5-Day ADV > ₹100 Crores
- **Tier 2 (Moderate Liquidity)**: 5-Day ADV ₹25 – ₹100 Crores
- **Tier 3 (Lower Liquidity)**: 5-Day ADV < ₹25 Crores

*Note: Daily Bhavcopy data is strictly used for historical liquidity baselines and is never misrepresented as today's live intraday activity.*

---

## 🔒 Security & Session Isolation Architecture

1. **Zero Order APIs**: Audited by automated tests (`test_zero_order_placement_security_audit`) verifying zero broker order placement endpoints or methods exist.
2. **Token Security**:
   - Access tokens are stored solely in browser `sessionStorage` (never in `localStorage`).
   - Requests carry isolated headers (`X-Session-ID`).
   - Zero raw tokens are logged to standard output or server log files.
   - Independent user sessions do not log out other connected users.
3. **Graceful Failures**: If the Upstox token is expired or not configured, the terminal reports data unavailability clearly rather than fabricating live market data.

---

## 🛠️ Windows PowerShell Setup Instructions

### 1. Prerequisites
- Python 3.10+ (Python 3.11/3.13 recommended)
- Node.js 18+ and npm

### 2. Environment Setup
```powershell
# Clone or navigate to the repository directory
cd "c:\Users\suriya prakash\Desktop\sma 6&30"

# Copy environment configuration template
Copy-Item .env.example .env

# Create Python virtual environment (if not already created)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r requirements.txt
```

### 3. Run Backend Server (FastAPI)
```powershell
# Launch FastAPI on port 8000
python -m uvicorn backend.main:app --reload --port 8000
```
- Interactive API Docs: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/health`
- Market Session Status: `http://localhost:8000/api/market/session`

### 4. Run Frontend Client (React + Vite)
In a separate PowerShell terminal:
```powershell
cd "c:\Users\suriya prakash\Desktop\sma 6&30\frontend"
npm install
npm run dev
```
Open `http://localhost:5173` in your web browser.

### 5. Run Automated Test Suite
```powershell
# Run all 17 unit, integration, and security tests
pytest tests/test_scanner_sma.py -v
```

---

## 🚀 Render Cloud Deployment Instructions

The repository includes a ready-to-deploy `render.yaml` blueprint and multi-stage `Dockerfile`.

### Option A: Render Blueprint (Infrastructure-as-Code)
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New** > **Blueprint**.
3. Connect your repository. Render will parse `render.yaml` and configure:
   - Web Service: Multi-stage Docker container (serves Vite SPA + FastAPI API on port 8000).
   - PostgreSQL Database: Free managed database instance.
4. Set Environment Variables in Render:
   - `UPSTOX_CLIENT_ID`: Your Upstox App Client ID
   - `UPSTOX_CLIENT_SECRET`: Your Upstox App Client Secret
   - `SESSION_SECRET_KEY`: A secure random secret string
   - `DATABASE_URL`: Automatically populated by Render PostgreSQL

### Option B: Docker Manual Build & Run
```bash
# Build multi-stage Docker image
docker build -t nse-sma-scanner .

# Run container on port 8000
docker run -p 8000:8000 --env-file .env nse-sma-scanner
```

---

## 📡 API Endpoint Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check and system uptime |
| `/api/market/session` | GET | NSE market session status, IST clock, Upstox connectivity, Nifty 50 |
| `/api/stocks/most-active` | GET | Ranked Top 50 Most Active NSE stocks by traded value |
| `/api/scanner/run` | POST | Triggers 10-minute SMA 6/30 scanner evaluation |
| `/api/scanner/status` | GET | Current scanner running status, progress, and candidate count |
| `/api/scanner/results` | GET | Returns ranked confirmed BUY/SELL alerts and active watchlist |
| `/api/algo/intraday-analysis` | GET | Intraday 10m VWAP + SMA 6/30 + Supertrend + ML + Manual Order Slip |
| `/api/algo/swing-analysis` | GET | AI Swing multi-timeframe analysis & walk-forward backtest |
| `/api/bhavcopy/summary` | GET | Official NSE Bhavcopy 5-day ADV, top turnover, and liquidity tiers |
| `/api/backtest/run` | POST | Intraday 10-minute SMA 6/30 backtest with 0.10% friction |
| `/api/auth/token` | POST | Authenticates daily Upstox Access Token |
| `/api/auth/status` | GET | Checks active Upstox session validity |
| `/api/auth/logout` | POST | Terminate session isolated to current caller |

---

## ⚖️ License & Disclaimer
Strictly for analytical, quantitative research, and decision-support purposes only. No financial advice or automatic order execution is provided.
