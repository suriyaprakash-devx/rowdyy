import React, { useState, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  Sparkles,
  RotateCw,
  Copy,
  Check,
  Clock,
  Layers,
  Zap,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Search,
  CheckCircle2
} from 'lucide-react'
import './SMCEngine.css'

export default function SMCEngine({ apiBase = '' }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [session, setSession] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [filterDirection, setFilterDirection] = useState('ALL')
  const [highProbOnly, setHighProbOnly] = useState(false)
  const [riskPerTrade, setRiskPerTrade] = useState(2000)
  const [searchQuery, setSearchQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchScan = async (forceRefresh = false) => {
    setLoading(true)
    try {
      const url = `${apiBase}/api/smc/scan${forceRefresh ? '?refresh=true' : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json.results || [])
        setSession(json.session || null)
        setLastUpdated(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }))
      }
    } catch (err) {
      console.error('Failed to fetch SMC scan:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchScan(false)
    const interval = setInterval(() => {
      fetchScan(false)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const copyOrderSlip = (item) => {
    const risk = item.risk_per_share || (Math.abs(item.entry_price - item.stop_loss))
    const shares = risk > 0 ? Math.floor(riskPerTrade / risk) : 1
    const slip = `=== NSE INTRADAY ORDER SLIP ===
Exchange: NSE
Segment: Equity Cash (MIS)
Symbol: ${item.symbol}
Action: ${item.direction}
Order Type: LIMIT
Product Code: MIS (Intraday)
Quantity: ${shares}
Limit Entry Price: ₹${item.entry_price}
Trigger Price (SL): ₹${item.stop_loss}
Target 1 (1:3): ₹${item.target_1}
Target 2 (1:5): ₹${item.target_2}
Auto Square-Off Time: 15:15 IST
===============================`

    navigator.clipboard.writeText(slip)
    setCopiedId(item.symbol)
    setTimeout(() => setCopiedId(null), 2500)
  }

  const filteredData = data.filter((item) => {
    if (filterDirection !== 'ALL' && item.direction !== filterDirection) return false
    if (highProbOnly && !item.is_high_probability) return false
    if (searchQuery && !item.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="smc-container">
      {/* 1. Header & IST Market Telemetry */}
      <div className="smc-header-card">
        <div className="smc-header-main">
          <div className="smc-title-group">
            <div className="smc-icon-badge">
              <Sparkles size={24} color="#38bdf8" />
            </div>
            <div>
              <h2 className="smc-title">SMC-NSE Engine</h2>
              <p className="smc-subtitle">
                Institutional Quant Intraday Scanner &bull; 15m Supply/Demand OB &bull; Liquidity Sweeps &bull; 1:3 & 1:5 R:R
              </p>
            </div>
          </div>

          <div className="smc-session-status">
            <div className="smc-session-badge">
              <Clock size={16} />
              <span>{session?.phase || 'NSE IST Market Active'}</span>
            </div>
            {session && (
              <span className={`smc-pill ${session.can_enter ? 'pill-green' : 'pill-amber'}`}>
                {session.can_enter ? '● Execution Window Active' : '○ Standby / Consolidation'}
              </span>
            )}
            <button
              className="smc-refresh-btn"
              onClick={() => fetchScan(true)}
              disabled={loading}
              title="Refresh SMC Scan"
            >
              <RotateCw size={16} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Scanning...' : 'Scan Now'}</span>
            </button>
          </div>
        </div>

        {/* 2. Controls & Sizing Bar */}
        <div className="smc-controls-bar">
          <div className="smc-filter-group">
            <button
              className={`smc-filter-btn ${filterDirection === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterDirection('ALL')}
            >
              All Setups ({data.length})
            </button>
            <button
              className={`smc-filter-btn ${filterDirection === 'BUY' ? 'active' : ''}`}
              onClick={() => setFilterDirection('BUY')}
            >
              🟢 BUY Discount ({data.filter((d) => d.direction === 'BUY').length})
            </button>
            <button
              className={`smc-filter-btn ${filterDirection === 'SELL' ? 'active' : ''}`}
              onClick={() => setFilterDirection('SELL')}
            >
              🔴 SELL Premium ({data.filter((d) => d.direction === 'SELL').length})
            </button>
            <button
              className={`smc-filter-btn ${highProbOnly ? 'active' : ''}`}
              onClick={() => setHighProbOnly(!highProbOnly)}
            >
              🔥 Swept Liquidity Only
            </button>
          </div>

          <div className="smc-sizing-input-group">
            <Calculator size={16} color="#fbbf24" />
            <span className="smc-sizing-label">Risk Per Trade:</span>
            <div className="smc-risk-buttons">
              {[1000, 2000, 5000].map((r) => (
                <button
                  key={r}
                  className={`smc-risk-btn ${riskPerTrade === r ? 'active' : ''}`}
                  onClick={() => setRiskPerTrade(r)}
                >
                  ₹{r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Setup Cards Grid */}
      {loading && data.length === 0 ? (
        <div className="smc-empty-state">
          <RotateCw size={36} className="spin text-blue" />
          <p>Analyzing Daily & 15m Market Structure across liquid NSE constituents...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="smc-empty-state">
          <AlertTriangle size={36} color="#fbbf24" />
          <p>No active SMC setups match the selected filter. Try selecting 'All Setups'.</p>
        </div>
      ) : (
        <div className="smc-grid">
          {filteredData.map((item) => {
            const risk = item.risk_per_share || Math.abs(item.entry_price - item.stop_loss)
            const shares = risk > 0 ? Math.floor(riskPerTrade / risk) : 1
            const t1Profit = Math.round(shares * risk * 3)
            const t2Profit = Math.round(shares * risk * 5)
            const isBuy = item.direction === 'BUY'

            return (
              <div key={item.symbol} className={`smc-card ${isBuy ? 'card-buy' : 'card-sell'}`}>
                {/* Card Header */}
                <div className="smc-card-header">
                  <div>
                    <div className="smc-symbol-row">
                      <span className="smc-symbol">{item.symbol}</span>
                      <span className="smc-eq-badge">NSE CASH / F&O</span>
                      <span className={`smc-dir-badge ${isBuy ? 'dir-buy' : 'dir-sell'}`}>
                        {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {item.direction}
                      </span>
                    </div>
                    <div className="smc-cur-price">
                      LTP: <strong>₹{item.current_price}</strong>
                      <span className="smc-bias-text">&bull; D1 {item.d1_bias} Bias</span>
                    </div>
                  </div>

                  <span className={`smc-rating-pill ${item.is_high_probability ? 'rating-high' : 'rating-cond'}`}>
                    {item.rating}
                  </span>
                </div>

                {/* SMC Structural Analysis */}
                <div className="smc-analysis-box">
                  <div className="smc-analysis-row">
                    <span className="smc-label">15m Structure:</span>
                    <span className="smc-value">{item.fifteen_min_bias}</span>
                  </div>
                  <div className="smc-analysis-row">
                    <span className="smc-label">Liquidity Swept:</span>
                    <span className="smc-value swept-highlight">{item.liquidity_swept}</span>
                  </div>
                  <div className="smc-analysis-row">
                    <span className="smc-label">HTF Zone:</span>
                    <span className="smc-value font-mono">{item.htf_zone}</span>
                  </div>
                </div>

                {/* Execution Plan Grid */}
                <div className="smc-exec-grid">
                  <div className="smc-exec-item">
                    <span className="exec-label">Recommended Entry</span>
                    <span className="exec-val text-cyan font-mono">₹{item.entry_price}</span>
                  </div>
                  <div className="smc-exec-item">
                    <span className="exec-label">Structural Stop Loss</span>
                    <span className="exec-val text-red font-mono">₹{item.stop_loss}</span>
                  </div>
                  <div className="smc-exec-item">
                    <span className="exec-label">Target 1 (1:3 R:R)</span>
                    <span className="exec-val text-green font-mono">₹{item.target_1}</span>
                  </div>
                  <div className="smc-exec-item">
                    <span className="exec-label">Target 2 (1:5 R:R)</span>
                    <span className="exec-val text-gold font-mono">₹{item.target_2}</span>
                  </div>
                </div>

                {/* Position Sizing & Reward Preview */}
                <div className="smc-sizing-box">
                  <div className="sizing-calc-row">
                    <span>
                      Sized for <strong>₹{riskPerTrade}</strong> risk:
                    </span>
                    <span className="font-mono text-cyan font-bold">{shares} Shares</span>
                  </div>
                  <div className="sizing-profit-row">
                    <span>
                      T1 Gain: <strong className="text-green">+₹{t1Profit.toLocaleString('en-IN')}</strong>
                    </span>
                    <span>
                      T2 Gain: <strong className="text-gold">+₹{t2Profit.toLocaleString('en-IN')}</strong>
                    </span>
                  </div>
                </div>

                {/* Footer & Copy Slip Button */}
                <div className="smc-card-footer">
                  <span className="smc-sq-off">⏰ Mandatory 15:15 IST Square-off</span>
                  <button
                    className={`smc-copy-btn ${copiedId === item.symbol ? 'copied' : ''}`}
                    onClick={() => copyOrderSlip(item)}
                  >
                    {copiedId === item.symbol ? (
                      <>
                        <Check size={14} />
                        <span>Copied Slip!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy Order Slip</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

