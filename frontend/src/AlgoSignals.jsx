import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  ShieldAlert,
  Sparkles,
  RotateCw,
  Search,
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Layers,
  Activity,
  Flame,
  ChevronRight,
  Info,
  Check,
  X,
  Zap,
  Calculator,
  Sliders,
  Maximize2,
  Calendar,
  DollarSign,
  LineChart,
  Filter,
  History,
  Copy,
  ExternalLink,
  FileText
} from 'lucide-react'
import './AlgoSignals.css'

const POPULAR_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'TATASTEEL',
  'SBIN',
  'ITC',
  'BHARTIARTL',
  'LT',
  'BAJFINANCE',
  'MARUTI'
]

// =========================================================================
// 1. INTERACTIVE CANDLESTICK & EMA & VOLUME SVG CHART
// =========================================================================
function InteractiveCandleChart({ history = [], currentPrice = 0, symbol = '' }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const [chartMode, setChartMode] = useState('candles') // 'candles' | 'area'
  const svgRef = useRef(null)

  const validHistory = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return []
    return history.filter(d => d && typeof d === 'object' && !isNaN(Number(d.close)))
  }, [history])

  // Dimensions
  const W = 960
  const H = 400
  const pad = { top: 30, right: 65, bottom: 45, left: 20 }
  const priceH = 260
  const volH = 65
  const volTop = pad.top + priceH + 15
  const chartW = W - pad.left - pad.right

  // Price Extents
  const minPrice = useMemo(() => {
    if (validHistory.length === 0) return 100
    const lows = validHistory.map(d => Number(d.low) || Number(d.close) || currentPrice || 100)
    return (Math.min(...lows) || 100) * 0.992
  }, [validHistory, currentPrice])

  const maxPrice = useMemo(() => {
    if (validHistory.length === 0) return 105
    const highs = validHistory.map(d => Number(d.high) || Number(d.close) || currentPrice || 105)
    return (Math.max(...highs) || 105) * 1.008
  }, [validHistory, currentPrice])

  const priceSpan = (maxPrice - minPrice) > 0 ? (maxPrice - minPrice) : 1

  // Volume Extents
  const maxVol = useMemo(() => {
    if (validHistory.length === 0) return 1
    const vols = validHistory.map(d => Number(d.volume) || 1)
    return Math.max(1, ...vols)
  }, [validHistory])

  // Scalers
  const xAt = (i) => pad.left + (i + 0.5) * (chartW / Math.max(1, validHistory.length))
  const yAtPrice = (p) => {
    const num = Number(p) || minPrice
    return pad.top + priceH - ((num - minPrice) / priceSpan) * priceH
  }
  const yAtVol = (v) => {
    const num = Number(v) || 0
    return volTop + volH - (num / maxVol) * volH
  }
  const candleW = Math.max(3, Math.min(14, (chartW / Math.max(1, validHistory.length)) * 0.65))

  // Robust SVG path builder ensuring valid initial 'M' command
  const buildSvgPath = (accessor) => {
    let isFirst = true
    const parts = []
    for (let i = 0; i < validHistory.length; i++) {
      const val = accessor(validHistory[i])
      if (val !== null && val !== undefined && !isNaN(Number(val))) {
        const x = xAt(i).toFixed(1)
        const y = yAtPrice(Number(val)).toFixed(1)
        parts.push(`${isFirst ? 'M' : 'L'} ${x} ${y}`)
        isFirst = false
      }
    }
    return parts.join(' ')
  }

  const ema20Path = useMemo(() => buildSvgPath(d => d.ema20), [validHistory, minPrice, maxPrice])
  const ema50Path = useMemo(() => buildSvgPath(d => d.ema50), [validHistory, minPrice, maxPrice])
  const vwapPath = useMemo(() => buildSvgPath(d => d.vwap), [validHistory, minPrice, maxPrice])
  const sma6Path = useMemo(() => buildSvgPath(d => d.sma6 || d.ema20), [validHistory, minPrice, maxPrice])
  const sma30Path = useMemo(() => buildSvgPath(d => d.sma30 || d.ema50), [validHistory, minPrice, maxPrice])

  // Area Path
  const areaPath = useMemo(() => {
    if (validHistory.length === 0) return ''
    const points = validHistory.map((d, i) => `${xAt(i).toFixed(1)} ${yAtPrice(d.close).toFixed(1)}`)
    const firstX = xAt(0).toFixed(1)
    const lastX = xAt(validHistory.length - 1).toFixed(1)
    const baseY = (pad.top + priceH).toFixed(1)
    return `M ${points.join(' L ')} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`
  }, [validHistory, minPrice, maxPrice])

  // Price Gridlines (4 levels)
  const gridLevels = [0.1, 0.35, 0.65, 0.9].map(ratio => {
    const p = minPrice + ratio * priceSpan
    return { price: p, y: yAtPrice(p) }
  })

  // Mouse Move
  const handleMouseMove = (e) => {
    if (!svgRef.current || validHistory.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const scaledX = (mouseX / rect.width) * W
    const relativeX = scaledX - pad.left
    if (relativeX < 0 || relativeX > chartW) {
      setHoverIndex(null)
      return
    }
    const idx = Math.floor((relativeX / chartW) * validHistory.length)
    if (idx >= 0 && idx < validHistory.length) {
      setHoverIndex(idx)
    } else {
      setHoverIndex(null)
    }
  }

  if (validHistory.length === 0) {
    return (
      <div className="candle-empty-state">
        <Clock size={20} className="text-text-muted" />
        <span>No historical candlestick sessions available</span>
      </div>
    )
  }

  const activeBar = (hoverIndex !== null && validHistory[hoverIndex]) ? validHistory[hoverIndex] : (validHistory[validHistory.length - 1] || {})
  const openVal = Number(activeBar.open) || Number(activeBar.close) || 0
  const closeVal = Number(activeBar.close) || openVal
  const isUpSession = closeVal >= openVal
  const sessionChg = closeVal - openVal
  const sessionChgPct = openVal > 0 ? (sessionChg / openVal) * 100 : 0

  return (
    <div className="candle-chart-wrapper">
      {/* Chart Control Toolbar */}
      <div className="candle-toolbar">
        <div className="candle-info-hud">
          <div className="hud-symbol-date">
            <span className="hud-sym">{symbol}</span>
            <span className="hud-date font-mono">{activeBar.date || activeBar.time || 'Completed Bar'}</span>
          </div>
          <div className="hud-ohlc font-mono">
            <span>O: <b className="text-text-main">₹{openVal.toFixed(2)}</b></span>
            <span>H: <b className="text-bullish-neon">₹{(Number(activeBar.high) || closeVal).toFixed(2)}</b></span>
            <span>L: <b className="text-bearish-neon">₹{(Number(activeBar.low) || closeVal).toFixed(2)}</b></span>
            <span>C: <b className={isUpSession ? 'text-bullish-neon' : 'text-bearish-neon'}>₹{closeVal.toFixed(2)}</b></span>
            {activeBar.vwap && <span>VWAP: <b style={{ color: '#00d4ff' }}>₹{Number(activeBar.vwap).toFixed(2)}</b></span>}
            {activeBar.sma6 && <span>SMA6: <b style={{ color: '#00e676' }}>₹{Number(activeBar.sma6).toFixed(2)}</b></span>}
            {activeBar.sma30 && <span>SMA30: <b style={{ color: '#ffd600' }}>₹{Number(activeBar.sma30).toFixed(2)}</b></span>}
            <span className={`hud-chg ${isUpSession ? 'text-bullish-neon' : 'text-bearish-neon'}`}>
              ({sessionChg >= 0 ? '+' : ''}{sessionChg.toFixed(2)} / {sessionChgPct >= 0 ? '+' : ''}{sessionChgPct.toFixed(2)}%)
            </span>
            <span className="hud-vol text-muted">Vol: {((Number(activeBar.volume) || 0) / 1000).toFixed(0)}k</span>
          </div>
        </div>

        <div className="candle-actions">
          <div className="chart-legend font-mono">
            {history[0]?.vwap && (
              <span className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: '#00d4ff' }} /> VWAP
              </span>
            )}
            <span className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: '#00e676' }} /> SMA 6
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: '#ffd600' }} /> SMA 30
            </span>
            {history[0]?.ema20 && <span className="legend-item"><span className="legend-dot dot-ema20" /> EMA 20</span>}
          </div>
          <div className="chart-mode-toggles">
            <button
              className={`mode-btn ${chartMode === 'candles' ? 'active' : ''}`}
              onClick={() => setChartMode('candles')}
              title="Candlestick View"
            >
              Candles
            </button>
            <button
              className={`mode-btn ${chartMode === 'area' ? 'active' : ''}`}
              onClick={() => setChartMode('area')}
              title="Area Line View"
            >
              Line
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="svg-container" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIndex(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="interactive-candle-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="volUpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="volDownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {gridLevels.map((g, idx) => (
            <g key={idx}>
              <line
                x1={pad.left}
                y1={g.y}
                x2={W - pad.right}
                y2={g.y}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeDasharray="4 4"
              />
              <text
                x={W - pad.right + 8}
                y={g.y + 4}
                className="svg-axis-label font-mono"
              >
                ₹{g.price.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Volume baseline */}
          <line
            x1={pad.left}
            y1={volTop}
            x2={W - pad.right}
            y2={volTop}
            stroke="rgba(255, 255, 255, 0.08)"
          />
          <text
            x={W - pad.right + 8}
            y={volTop + 14}
            className="svg-axis-label font-mono"
          >
            VOL
          </text>

          {/* Volume Bars */}
          {validHistory.map((d, i) => {
            const x = xAt(i)
            const yV = yAtVol(d.volume)
            const barH = Math.max(1, volTop + volH - yV)
            const isUp = (Number(d.close) || 0) >= (Number(d.open) || 0)
            return (
              <rect
                key={`vol-${i}`}
                x={x - candleW / 2}
                y={yV}
                width={candleW}
                height={barH}
                fill={isUp ? 'url(#volUpGrad)' : 'url(#volDownGrad)'}
                rx={1}
              />
            )
          })}

          {/* Candlesticks OR Area */}
          {chartMode === 'area' ? (
            <>
              <path d={areaPath} fill="url(#areaGradient)" />
              <path
                d={validHistory.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAtPrice(d.close).toFixed(1)}`).join(' ')}
                fill="none"
                stroke="#00d2ff"
                strokeWidth={2}
              />
            </>
          ) : (
            validHistory.map((d, i) => {
              const x = xAt(i)
              const yH = yAtPrice(d.high)
              const yL = yAtPrice(d.low)
              const yO = yAtPrice(d.open)
              const yC = yAtPrice(d.close)
              const isUp = (Number(d.close) || 0) >= (Number(d.open) || 0)
              const color = isUp ? '#10b981' : '#ef4444'
              const bodyTop = Math.min(yO, yC)
              const bodyH = Math.max(2, Math.abs(yC - yO))

              return (
                <g key={`candle-${i}`} className="candle-group">
                  {/* Wick */}
                  <line
                    x1={x}
                    y1={yH}
                    x2={x}
                    y2={yL}
                    stroke={color}
                    strokeWidth={1.2}
                    opacity={0.85}
                  />
                  {/* Body */}
                  <rect
                    x={x - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={color}
                    rx={1}
                    className="candle-rect"
                  />
                </g>
              )
            })
          )}

          {/* Intraday VWAP, SMA 6, SMA 30 Lines */}
          {vwapPath && (
            <path
              d={vwapPath}
              fill="none"
              stroke="#00d4ff"
              strokeWidth={2.0}
              strokeDasharray="4 2"
              strokeLinecap="round"
            />
          )}
          {sma6Path && (
            <path
              d={sma6Path}
              fill="none"
              stroke="#00e676"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}
          {sma30Path && (
            <path
              d={sma30Path}
              fill="none"
              stroke="#ffd600"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}

          {/* EMA Lines */}
          {ema20Path && !vwapPath && (
            <path
              d={ema20Path}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}
          {ema50Path && !vwapPath && (
            <path
              d={ema50Path}
              fill="none"
              stroke="#a855f7"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}

          {/* Interactive Crosshair Tracking */}
          {hoverIndex !== null && validHistory[hoverIndex] && (
            <g className="crosshair-group">
              <line
                x1={xAt(hoverIndex)}
                y1={pad.top}
                x2={xAt(hoverIndex)}
                y2={volTop + volH}
                stroke="rgba(255, 255, 255, 0.4)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <line
                x1={pad.left}
                y1={yAtPrice(validHistory[hoverIndex].close)}
                x2={W - pad.right}
                y2={yAtPrice(validHistory[hoverIndex].close)}
                stroke="rgba(0, 210, 255, 0.4)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <circle
                cx={xAt(hoverIndex)}
                cy={yAtPrice(validHistory[hoverIndex].close)}
                r={4}
                fill="#00d2ff"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Date Axis Ticks (Show ~5 dates) */}
          {validHistory.map((d, i) => {
            const step = Math.floor(validHistory.length / 5) || 1
            if (i % step === 0 || i === validHistory.length - 1) {
              const label = d.date ? (d.date.length > 5 ? d.date.slice(5) : d.date) : (d.time || '')
              return (
                <text
                  key={`date-${i}`}
                  x={xAt(i)}
                  y={H - 12}
                  textAnchor="middle"
                  className="svg-axis-label font-mono"
                >
                  {label}
                </text>
              )
            }
            return null
          })}
        </svg>
      </div>
    </div>
  )
}

// =========================================================================
// 2. INTERACTIVE WALK-FORWARD CUMULATIVE RETURN SVG CHART
// =========================================================================
function InteractiveEquityCurve({ returns = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  const validReturns = useMemo(() => {
    if (!Array.isArray(returns) || returns.length === 0) return []
    return returns.filter(v => typeof v === 'number' && !isNaN(v))
  }, [returns])

  if (validReturns.length === 0) {
    return <div className="equity-empty font-mono">No walk-forward curve data available</div>
  }

  const W = 620
  const H = 160
  const pad = { top: 15, right: 20, bottom: 25, left: 45 }
  const chartW = W - pad.left - pad.right
  const chartH = H - pad.top - pad.bottom

  const minVal = Math.min(0, ...validReturns) * 1.15
  const maxVal = Math.max(0, ...validReturns) * 1.15
  const valSpan = (maxVal - minVal) > 0 ? (maxVal - minVal) : 1

  const xAt = (i) => pad.left + (i / Math.max(1, validReturns.length - 1)) * chartW
  const yAt = (v) => pad.top + chartH - (((Number(v) || 0) - minVal) / valSpan) * chartH
  const zeroY = yAt(0)

  const linePath = validReturns
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(' ')

  const areaPath = `M ${xAt(0).toFixed(1)} ${zeroY.toFixed(1)} ` +
    validReturns.map((v, i) => `L ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ') +
    ` L ${xAt(validReturns.length - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`

  const finalReturn = validReturns[validReturns.length - 1] || 0
  const isPositive = finalReturn >= 0

  return (
    <div className="equity-curve-card">
      <div className="equity-header font-mono">
        <span className="equity-label">Cumulative Out-Of-Sample Return</span>
        <span className={`equity-val ${isPositive ? 'text-bullish-neon' : 'text-bearish-neon'}`}>
          {isPositive ? '+' : ''}{finalReturn.toFixed(2)}%
        </span>
      </div>

      <div className="equity-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="equity-svg"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const relX = ((e.clientX - rect.left) / rect.width) * W - pad.left
            const idx = Math.round((relX / chartW) * (validReturns.length - 1))
            if (idx >= 0 && idx < validReturns.length) setHoverIndex(idx)
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity="0.4" />
              <stop offset="100%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Zero reference line */}
          <line
            x1={pad.left}
            y1={zeroY}
            x2={W - pad.right}
            y2={zeroY}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeDasharray="4 4"
          />
          <text x={pad.left - 8} y={zeroY + 4} textAnchor="end" className="svg-axis-label font-mono">
            0%
          </text>

          {/* Area & Line */}
          <path d={areaPath} fill="url(#equityGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke={isPositive ? '#10b981' : '#ef4444'}
            strokeWidth={2}
          />

          {/* Hover indicator */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={xAt(hoverIndex)}
                y1={pad.top}
                x2={xAt(hoverIndex)}
                y2={pad.top + chartH}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeDasharray="2 2"
              />
              <circle
                cx={xAt(hoverIndex)}
                cy={yAt(returns[hoverIndex])}
                r={4}
                fill={isPositive ? '#10b981' : '#ef4444'}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* X ticks */}
          <text x={pad.left} y={H - 6} className="svg-axis-label font-mono">
            Trade 1
          </text>
          <text x={W - pad.right} y={H - 6} textAnchor="end" className="svg-axis-label font-mono">
            Trade {returns.length}
          </text>
        </svg>

        {hoverIndex !== null && (
          <div className="equity-hud-tooltip font-mono">
            Trade #{hoverIndex + 1}: <b className={returns[hoverIndex] >= 0 ? 'text-bullish-neon' : 'text-bearish-neon'}>
              {returns[hoverIndex] >= 0 ? '+' : ''}{returns[hoverIndex].toFixed(2)}%
            </b>
          </div>
        )}
      </div>
    </div>
  )
}

// =========================================================================
// 3. INTRADAY MANUAL ORDER EXECUTION SLIP & SIZING ENGINE
// =========================================================================
function OrderExecutionSlip({
  tradePlan = {},
  symbol = '',
  currentPrice = 0,
  signal = 'WAIT',
  timeframe = 'intraday',
  initialCapital = 50000,
  initialRisk = 1000
}) {
  const [productType, setProductType] = useState('MIS') // 'MIS' (5x Margin) | 'CNC' (1x Delivery)
  const [orderType, setOrderType] = useState('LIMIT') // 'LIMIT' | 'MARKET'
  const [capital, setCapital] = useState(initialCapital)
  const [riskAmount, setRiskAmount] = useState(initialRisk)
  const [customPrice, setCustomPrice] = useState('')
  const [copied, setCopied] = useState(false)

  const isSell = signal === 'SELL' || signal === 'STRONG SELL' || tradePlan?.action === 'SELL'
  const direction = isSell ? 'SELL' : 'BUY'
  const entryPrice = customPrice !== '' && !isNaN(Number(customPrice)) && Number(customPrice) > 0
    ? Number(customPrice)
    : (tradePlan.entry_price || currentPrice || 100)

  const stoplossPrice = tradePlan?.stoploss_price || (isSell ? entryPrice * 1.01 : entryPrice * 0.99)
  const target1Price = tradePlan?.target_1 || tradePlan?.target1_price || tradePlan?.target_price || (isSell ? entryPrice - Math.abs(entryPrice - stoplossPrice) * 1.5 : entryPrice + Math.abs(entryPrice - stoplossPrice) * 1.5)
  const target2Price = tradePlan?.target_2 || tradePlan?.target2_price || (isSell ? entryPrice - Math.abs(entryPrice - stoplossPrice) * 2.5 : entryPrice + Math.abs(entryPrice - stoplossPrice) * 2.5)

  const riskPerShare = Math.max(0.05, Math.abs(entryPrice - stoplossPrice))
  const suggestedQty = Math.max(1, Math.floor(riskAmount / riskPerShare))
  const totalOutlay = suggestedQty * entryPrice
  // MIS intraday margin on NSE cash is typically 20% (5x leverage)
  const marginRequired = productType === 'MIS' ? Math.ceil(totalOutlay * 0.20) : Math.ceil(totalOutlay)
  const totalRiskINR = suggestedQty * riskPerShare
  const rewardT1 = suggestedQty * Math.abs(target1Price - entryPrice)
  const rewardT2 = suggestedQty * Math.abs(target2Price - entryPrice)
  const rr1 = totalRiskINR > 0 ? (rewardT1 / totalRiskINR).toFixed(2) : '1.50'
  const rr2 = totalRiskINR > 0 ? (rewardT2 / totalRiskINR).toFixed(2) : '2.50'

  const slPct = ((riskPerShare / entryPrice) * 100).toFixed(2)
  const t1Pct = ((Math.abs(target1Price - entryPrice) / entryPrice) * 100).toFixed(2)
  const t2Pct = ((Math.abs(target2Price - entryPrice) / entryPrice) * 100).toFixed(2)

  const ticketFormattedText = `========================================
NSE INTRADAY MANUAL ORDER TICKET
========================================
Timestamp       : ${new Date().toLocaleTimeString()} IST
Symbol          : ${symbol} (NSE Cash)
Action          : ${direction}
Product         : ${productType} (${productType === 'MIS' ? 'Intraday 5x Margin' : 'CNC Delivery'})
Order Type      : ${orderType}
Trigger / Limit : ₹${entryPrice.toFixed(2)}
Quantity        : ${suggestedQty} shares
Stop Loss       : ₹${stoplossPrice.toFixed(2)} (-${slPct}%)
Target 1 (1.5R) : ₹${target1Price.toFixed(2)} (+${t1Pct}%)
Target 2 (2.5R) : ₹${target2Price.toFixed(2)} (+${t2Pct}%)
----------------------------------------
Est. Outlay     : ₹${totalOutlay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
Margin Required : ₹${marginRequired.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
Planned Risk    : ₹${totalRiskINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
Risk/Reward (T1): 1 : ${rr1}
Risk/Reward (T2): 1 : ${rr2}
Auto Square-Off : 15:15 IST
========================================
* STRICTLY ALERT-ONLY: No automated orders placed.
* Copy & execute manually in your authorized broker terminal.`

  const handleCopyTicket = async () => {
    try {
      await navigator.clipboard.writeText(ticketFormattedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = ticketFormattedText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <section className="order-slip-card">
      <div className="order-slip-header">
        <div className="order-slip-title-wrap">
          <FileText size={20} className="text-accent-cyan" />
          <h3 className="section-title" style={{ margin: 0 }}>
            Intraday Order Execution Ticket & Sizing Engine
          </h3>
          <span className={`order-slip-badge ${direction === 'BUY' ? 'buy' : 'sell'}`}>
            {direction} {timeframe.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Product Type Toggle */}
          <div className="timeframe-toggle-strip" style={{ margin: 0 }}>
            <button
              type="button"
              className={`timeframe-toggle-btn ${productType === 'MIS' ? 'active' : ''}`}
              onClick={() => setProductType('MIS')}
            >
              MIS (5x Intraday)
            </button>
            <button
              type="button"
              className={`timeframe-toggle-btn ${productType === 'CNC' ? 'active' : ''}`}
              onClick={() => setProductType('CNC')}
            >
              CNC (Cash 1x)
            </button>
          </div>

          {/* Order Type Toggle */}
          <div className="timeframe-toggle-strip" style={{ margin: 0 }}>
            <button
              type="button"
              className={`timeframe-toggle-btn ${orderType === 'LIMIT' ? 'active' : ''}`}
              onClick={() => setOrderType('LIMIT')}
            >
              LIMIT
            </button>
            <button
              type="button"
              className={`timeframe-toggle-btn ${orderType === 'MARKET' ? 'active' : ''}`}
              onClick={() => setOrderType('MARKET')}
            >
              MARKET
            </button>
          </div>
        </div>
      </div>

      {/* Sizing & Parameter Inputs */}
      <div className="order-slip-inputs-grid">
        <div className="order-input-box">
          <label>Entry / Limit Price (₹)</label>
          <input
            type="number"
            step="0.05"
            placeholder={entryPrice.toFixed(2)}
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            className="order-input-field"
          />
        </div>

        <div className="order-input-box">
          <label>Account Capital (₹)</label>
          <input
            type="number"
            step="5000"
            value={capital}
            onChange={(e) => setCapital(Math.max(1000, Number(e.target.value)))}
            className="order-input-field"
          />
        </div>

        <div className="order-input-box">
          <label>Risk Per Trade (₹)</label>
          <input
            type="number"
            step="250"
            value={riskAmount}
            onChange={(e) => setRiskAmount(Math.max(100, Number(e.target.value)))}
            className="order-input-field"
          />
        </div>

        <div className="order-input-box">
          <label>Stop Loss Distance</label>
          <div className="order-input-field" style={{ background: 'rgba(255, 51, 102, 0.08)', color: 'var(--bearish-neon)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>₹{riskPerShare.toFixed(2)}</span>
            <span style={{ fontSize: '0.74rem' }}>(-{slPct}%)</span>
          </div>
        </div>
      </div>

      {/* Targets & Quantity Matrix */}
      <div className="order-targets-matrix">
        <div className="order-target-pill">
          <span className="target-label">SUGGESTED QTY</span>
          <span className="target-val text-accent-cyan">{suggestedQty} shares</span>
          <span className="target-pnl font-mono text-muted">Max ₹{riskAmount} Risk</span>
        </div>

        <div className="order-target-pill">
          <span className="target-label">MARGIN REQUIRED</span>
          <span className="target-val font-mono">₹{marginRequired.toLocaleString('en-IN')}</span>
          <span className="target-pnl font-mono text-muted">{productType === 'MIS' ? '20% Margin (5x)' : '100% Cash (1x)'}</span>
        </div>

        <div className="order-target-pill">
          <span className="target-label">STOP LOSS</span>
          <span className="target-val text-bearish-neon">₹{stoplossPrice.toFixed(2)}</span>
          <span className="target-pnl text-bearish-neon font-mono">-₹{totalRiskINR.toFixed(0)} ({slPct}%)</span>
        </div>

        <div className="order-target-pill">
          <span className="target-label">TARGET 1 (1.5R)</span>
          <span className="target-val text-bullish-neon">₹{target1Price.toFixed(2)}</span>
          <span className="target-pnl text-bullish-neon font-mono">+₹{rewardT1.toFixed(0)} (1:{rr1})</span>
        </div>

        <div className="order-target-pill">
          <span className="target-label">TARGET 2 (2.5R)</span>
          <span className="target-val text-bullish-neon">₹{target2Price.toFixed(2)}</span>
          <span className="target-pnl text-bullish-neon font-mono">+₹{rewardT2.toFixed(0)} (1:{rr2})</span>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="order-actions-bar">
        <button
          type="button"
          className={`copy-ticket-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopyTicket}
        >
          {copied ? (
            <>
              <Check size={16} />
              <span>ORDER TICKET COPIED! ✓</span>
            </>
          ) : (
            <>
              <Copy size={16} />
              <span>COPY MANUAL ORDER TICKET</span>
            </>
          )}
        </button>

        <div className="broker-links-strip">
          <a
            href="https://pro.upstox.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="broker-launch-btn"
            title="Open Upstox Pro Web Terminal"
          >
            <ExternalLink size={13} />
            <span>Upstox Pro Terminal</span>
          </a>
          <a
            href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="broker-launch-btn"
            title="Open TradingView 10m Chart"
          >
            <ExternalLink size={13} />
            <span>TradingView 10m Chart</span>
          </a>
        </div>
      </div>

      {/* Safety Compliance Alert */}
      <div className="order-compliance-alert">
        <ShieldAlert size={18} style={{ flexShrink: 0 }} />
        <span>
          <b>STRICT ALERT-ONLY SAFETY MANDATE:</b> This platform never executes automated broker orders or accesses trading APIs for automated order placement. Review all calculated limits above, copy the order ticket, and execute manually within your authorized SEBI-registered broker account.
        </span>
      </div>
    </section>
  )
}

// =========================================================================
// MAIN ALGO SIGNALS COMPONENT
// =========================================================================
export default function AlgoSignals({ apiBase = '', initialSymbol = 'RELIANCE' }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'RELIANCE')
  const [searchInput, setSearchInput] = useState(initialSymbol || 'RELIANCE')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)

  // Intraday vs Swing Timeframe & Capital State
  const [timeframe, setTimeframe] = useState('intraday')
  const [accountCapital, setAccountCapital] = useState(50000)
  const [riskPerTrade, setRiskPerTrade] = useState(1000)

  // Checklist Filter, Checklist Direction Tab & Trades Filter
  const [checklistTab, setChecklistTab] = useState('auto') // 'auto' | 'buy' | 'sell'
  const [checkFilter, setCheckFilter] = useState('all') // 'all' | 'passed' | 'failed'
  const [tradeFilter, setTradeFilter] = useState('all') // 'all' | 'won' | 'lost'

  // Recent searches cache
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = localStorage.getItem('algo_recent_searches')
      return stored ? JSON.parse(stored) : ['TCS', 'HDFCBANK', 'INFY']
    } catch {
      return ['TCS', 'HDFCBANK', 'INFY']
    }
  })

  // Rotating loading messages
  useEffect(() => {
    let interval = null
    if (loading) {
      setLoadingStep(0)
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 4)
      }, 2000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [loading])

  const fetchAnalysis = async (symToFetch, forceRefresh = false, overrideTimeframe = null) => {
    const cleanSym = (symToFetch || symbol || 'RELIANCE').trim().toUpperCase().replace('.NS', '')
    if (!cleanSym) return
    setLoading(true)
    setError(null)
    setSymbol(cleanSym)
    setSearchInput(cleanSym)

    const activeTf = overrideTimeframe || timeframe
    if (overrideTimeframe) setTimeframe(overrideTimeframe)

    // Save to recents
    setRecentSearches(prev => {
      const updated = [cleanSym, ...prev.filter(s => s !== cleanSym)].slice(0, 8)
      try { localStorage.setItem('algo_recent_searches', JSON.stringify(updated)) } catch {}
      return updated
    })

    try {
      const endpoint = activeTf === 'intraday' ? '/api/algo/intraday-analysis' : '/api/algo/swing-analysis'
      const url = `${apiBase}${endpoint}?symbol=${encodeURIComponent(cleanSym)}&timeframe=${activeTf}&capital=${accountCapital}&risk=${riskPerTrade}${forceRefresh ? '&refresh=true' : ''}`
      const sessionId = (function() {
        try { return sessionStorage.getItem('upstox_session_id') || localStorage.getItem('upstox_session_id') || '' } catch { return '' }
      })()
      const res = await fetch(url, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-ID': sessionId, 'Authorization': `Bearer ${sessionId}` } : {}
      })
      if (!res.ok) {
        let errDetail = 'Failed to execute AI Analysis'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      const json = await res.json()
      if (json.data) {
        setData(json.data)
      } else {
        throw new Error('No analysis data received')
      }
    } catch (err) {
      setError(err.message || 'Error executing AI analysis')
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch analysis on mount or when symbol changes
  useEffect(() => {
    const sym = (initialSymbol && initialSymbol.trim()) ? initialSymbol.trim().toUpperCase() : (symbol || 'RELIANCE')
    if (!data && !loading) {
      fetchAnalysis(sym)
    } else if (initialSymbol && initialSymbol.trim() && initialSymbol.trim().toUpperCase() !== symbol.toUpperCase()) {
      fetchAnalysis(initialSymbol.trim().toUpperCase())
    }
  }, [initialSymbol])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchInput.trim()) {
      fetchAnalysis(searchInput.trim())
    }
  }

  // Signal color helpers
  const getSignalBadgeClass = (signal) => {
    switch (signal) {
      case 'STRONG BUY':
        return 'signal-strong-buy'
      case 'BUY':
        return 'signal-buy'
      case 'STRONG SELL':
      case 'SELL':
      case 'AVOID':
        return 'signal-avoid'
      default:
        return 'signal-wait'
    }
  }

  const getSignalIcon = (signal) => {
    switch (signal) {
      case 'STRONG BUY':
        return <Flame size={20} className="pulse-icon text-bullish-neon" />
      case 'BUY':
        return <TrendingUp size={20} className="text-bullish-base" />
      case 'STRONG SELL':
        return <Flame size={20} className="pulse-icon text-bearish-neon" />
      case 'SELL':
        return <TrendingDown size={20} className="text-bearish-neon" />
      case 'AVOID':
        return <ShieldAlert size={20} className="pulse-icon text-bearish-neon" />
      default:
        return <Clock size={20} className="text-warning-text" />
    }
  }

  const loadingMessages = [
    'Fetching real-time completed 10m candles & session VWAP...',
    'Feature engineering: SMA 6 & 30 Cross, Relative Volume & Supertrend (10, 2)...',
    'Executing XGBoost classifier with 5-fold walk-forward validation...',
    'Calculating dynamic ATR Stop Loss, Target 1, Target 2 & order ticket...'
  ]

  const isSellSignal = data?.signal === 'SELL' || data?.signal === 'STRONG SELL' || data?.trade_plan?.action === 'SELL'
  const activeChecklistType = checklistTab === 'auto'
    ? (isSellSignal ? 'sell' : 'buy')
    : checklistTab

  const currentConditions = activeChecklistType === 'sell' && data?.sell_conditions && data.sell_conditions.length > 0
    ? data.sell_conditions
    : (data?.buy_conditions || [])

  const currentScore = activeChecklistType === 'sell'
    ? (data?.sell_score ?? currentConditions.filter(c => c.passed).length)
    : (data?.buy_score ?? currentConditions.filter(c => c.passed).length)

  const currentTotal = currentConditions.length || 7

  // Filtered Checklist
  const filteredConditions = useMemo(() => {
    if (!currentConditions) return []
    if (checkFilter === 'passed') return currentConditions.filter(c => c.passed)
    if (checkFilter === 'failed') return currentConditions.filter(c => !c.passed)
    return currentConditions
  }, [currentConditions, checkFilter])

  // Filtered Backtest Trades
  const filteredTrades = useMemo(() => {
    if (!data?.backtest?.trades) return []
    if (tradeFilter === 'won') return data.backtest.trades.filter(t => t.won)
    if (tradeFilter === 'lost') return data.backtest.trades.filter(t => !t.won)
    return data.backtest.trades
  }, [data, tradeFilter])

  return (
    <div className="algo-swing-container">
      {/* ===================================================================== */}
      {/* 1. HEADER CONTROLS & SEARCH BAR                                       */}
      {/* ===================================================================== */}
      <section className="glass-panel algo-header-card">
        <div className="algo-header-top">
          <div className="algo-title-block">
            <div className="algo-brand-icon">
              <BrainCircuit size={24} />
            </div>
            <div>
              <div className="algo-title-row">
                <h1 className="algo-main-title">
                  {timeframe === 'intraday' ? 'INTRADAY AI SIGNAL TERMINAL' : 'AI SWING TRADING SYSTEM'}
                </h1>
                <span className="algo-version-pill">{timeframe === 'intraday' ? '10M COMPLETED BARS' : 'XGBOOST ML ENGINE'}</span>
                <span className="algo-horizon-pill">{timeframe === 'intraday' ? 'VWAP & SMA 6/30' : '5-DAY SWING'}</span>
              </div>
              <p className="algo-subtitle">
                {timeframe === 'intraday'
                  ? 'Intraday 10-minute algorithmic execution terminal with VWAP, SMA 6/30 crossover, Supertrend (10, 2.0), Relative Volume confirmation, and interactive manual order ticket calculator.'
                  : 'Supervised machine learning probability classifier with Supertrend, multi-timeframe weekly confirmation, walk-forward backtesting, and automated risk/reward trade execution.'}
              </p>

              {/* Timeframe Selector Strip */}
              <div className="timeframe-toggle-strip" style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className={`timeframe-toggle-btn ${timeframe === 'intraday' ? 'active' : ''}`}
                  onClick={() => {
                    setTimeframe('intraday')
                    if (symbol) fetchAnalysis(symbol, false, 'intraday')
                  }}
                >
                  <Zap size={13} />
                  <span>⚡ 10m Intraday (VWAP + SMA 6/30)</span>
                </button>
                <button
                  type="button"
                  className={`timeframe-toggle-btn ${timeframe === 'daily' ? 'active' : ''}`}
                  onClick={() => {
                    setTimeframe('daily')
                    if (symbol) fetchAnalysis(symbol, false, 'daily')
                  }}
                >
                  <Calendar size={13} />
                  <span>📅 Daily Swing (5Y Multi-Week ML)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="algo-search-form">
            <div className="search-box algo-search-box">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                className="search-input"
                placeholder="NSE Symbol (e.g. RELIANCE, TCS)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !searchInput.trim()}
              style={{ padding: '9px 18px', fontSize: '0.84rem' }}
            >
              {loading ? (
                <>
                  <RotateCw className="animate-spin" size={14} />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Zap size={14} />
                  <span>Analyze Stock</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fetchAnalysis(symbol, true)}
              disabled={loading}
              title="Force re-run model (bypasses cache)"
              style={{ padding: '9px 12px' }}
            >
              <RotateCw className={loading ? 'animate-spin' : ''} size={14} />
            </button>
          </form>
        </div>

        {/* Quick Tickers & Recent Searches */}
        <div className="algo-quick-strip">
          <span className="algo-quick-label">Equities:</span>
          <div className="algo-chips-wrap">
            {POPULAR_SYMBOLS.map((sym) => (
              <button
                key={sym}
                className={`quick-chip ${symbol === sym ? 'active' : ''}`}
                onClick={() => fetchAnalysis(sym)}
                disabled={loading}
              >
                {sym}
              </button>
            ))}
          </div>

          {recentSearches.length > 0 && (
            <div className="algo-recents-strip">
              <span className="algo-quick-label"><History size={12} /> Recents:</span>
              <div className="algo-chips-wrap">
                {recentSearches.map((sym) => (
                  <button
                    key={`rec-${sym}`}
                    className={`quick-chip chip-recent ${symbol === sym ? 'active' : ''}`}
                    onClick={() => fetchAnalysis(sym)}
                    disabled={loading}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ERROR NOTICE */}
      {error && (
        <div className="alert-box alert-danger">
          <AlertTriangle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {/* LOADING OVERLAY STATE */}
      {loading && (
        <div className="glass-panel algo-loading-card">
          <div className="loading-orbit">
            <BrainCircuit size={36} className="orbit-icon text-accent-cyan" />
            <div className="orbit-ring animate-spin" />
          </div>
          <div className="loading-text-main">
            {timeframe === 'intraday'
              ? `Analyzing Intraday VWAP & SMA 6/30 for ${symbol}...`
              : `Training XGBoost ML Classifier for ${symbol}...`}
          </div>
          <div className="loading-step-msg font-mono">
            {loadingMessages[loadingStep]}
          </div>
          <div className="loading-bar-track">
            <div
              className="loading-bar-fill"
              style={{ width: `${((loadingStep + 1) / loadingMessages.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* WELCOME HERO: DISPLAYED WHEN NO STOCK HAS BEEN EXECUTED YET           */}
      {/* ===================================================================== */}
      {!loading && !data && (
        <section className="glass-panel algo-welcome-hero">
          <div className="algo-welcome-badge">
            <BrainCircuit size={16} />
            <span>{timeframe === 'intraday' ? 'INTRADAY 10M TERMINAL READY' : 'AI SWING MODEL READY'} • INSTANT EXECUTION</span>
          </div>
          <h2 className="algo-welcome-title">
            {timeframe === 'intraday'
              ? 'Institutional 10-Minute SMA 6/30 & VWAP Intraday Terminal'
              : 'Institutional 4-Layer Machine Learning Swing Trading Engine'}
          </h2>
          <p className="algo-welcome-desc">
            {timeframe === 'intraday'
              ? 'Real-time 10-minute completed candles, intraday session VWAP anchor, Supertrend (10, 2.0), relative volume surge confirmation, dynamic ATR targets and interactive manual order execution slip.'
              : 'Equipped with 5-year historical training, 5-fold walk-forward cross validation, multi-timeframe weekly regime confirmation, and dynamic ATR risk-reward targets. Pick an equity below or search any NSE ticker to run the algorithm.'}
          </p>

          <div className="algo-welcome-picks">
            <div className="algo-picks-label">QUICK SELECT TOP CANDIDATES:</div>
            <div className="algo-picks-grid">
              {POPULAR_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  className="algo-pick-card"
                  onClick={() => fetchAnalysis(sym)}
                >
                  <span className="pick-sym">{sym}</span>
                  <span className="pick-action">{timeframe === 'intraday' ? 'Run Intraday →' : 'Run AI Swing →'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="algo-pillars-grid">
            <div className="pillar-card-welcome">
              <div className="pillar-num">LAYER 01</div>
              <div className="pillar-title">Technical Matrix</div>
              <div className="pillar-desc">SMA 6 & 30 Cross, Supertrend (10, 3), RSI 14, MACD, ADX 14 trend strength</div>
            </div>
            <div className="pillar-card-welcome">
              <div className="pillar-num">LAYER 02</div>
              <div className="pillar-title">XGBoost ML Classifier</div>
              <div className="pillar-desc">5-Year Historical training with TimeSeriesSplit & out-of-sample probability calibration</div>
            </div>
            <div className="pillar-card-welcome">
              <div className="pillar-num">LAYER 03</div>
              <div className="pillar-title">Regime & Weekly Confirmation</div>
              <div className="pillar-desc">Weekly EMA 20/50 alignment + NIFTY 50 benchmark momentum validation</div>
            </div>
            <div className="pillar-card-welcome">
              <div className="pillar-num">LAYER 04</div>
              <div className="pillar-title">ATR Volatility Risk Plan</div>
              <div className="pillar-desc">14-Day ATR Target 1, Target 2, Stop Loss and Kelly Criterion sizing</div>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* MAIN AI RESULTS DASHBOARD                                             */}
      {/* ===================================================================== */}
      {!loading && data && (
        <div className="algo-results-layout">
          {/* WARNINGS BANNER */}
          {data.warnings && data.warnings.length > 0 && (
            <div className="alert-box alert-warning">
              <AlertTriangle size={18} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {data.warnings.map((w, idx) => (
                  <span key={idx} style={{ fontSize: '0.84rem' }}>{w}</span>
                ))}
              </div>
            </div>
          )}

          {/* INTRADAY LIVE TELEMETRY BANNER */}
          <div className="intraday-telemetry-banner">
            <div className="telemetry-chip">
              <span className="chip-label">LTP ({timeframe === 'intraday' ? '10M BAR' : 'DAILY'})</span>
              <span className="chip-val font-mono">₹{data.current_price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="chip-sub font-mono">{data.symbol} NSE</span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">SESSION VWAP</span>
              <span className="chip-val font-mono" style={{ color: '#00d4ff' }}>
                ₹{(data.intraday_telemetry?.vwap || data.trade_plan?.entry_price || data.current_price)?.toFixed(2)}
              </span>
              <span className="chip-sub font-mono" style={{ color: (data.intraday_telemetry?.vwap_distance_pct ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                {(data.intraday_telemetry?.vwap_distance_pct ?? 0) >= 0 ? '+' : ''}{(data.intraday_telemetry?.vwap_distance_pct ?? 0).toFixed(2)}% vs VWAP
              </span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">SMA 6 vs 30</span>
              <span className="chip-val font-mono" style={{ color: '#00e676' }}>
                ₹{(data.intraday_telemetry?.sma_6 || data.indicators?.sma_6 || 0).toFixed(1)} / ₹{(data.intraday_telemetry?.sma_30 || data.indicators?.sma_30 || 0).toFixed(1)}
              </span>
              <span className="chip-sub font-mono">
                {data.intraday_telemetry?.sma_status || ((data.indicators?.sma_6 || 0) > (data.indicators?.sma_30 || 0) ? 'Bullish Cross' : 'Bearish Cross')}
              </span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">RELATIVE VOLUME</span>
              <span className="chip-val font-mono" style={{ color: '#ffd600' }}>
                {data.intraday_telemetry?.rel_vol ? `${data.intraday_telemetry.rel_vol}x` : `${data.indicators?.rel_vol || 1.5}x`}
              </span>
              <span className="chip-sub font-mono">Completed Bar</span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">RSI (14)</span>
              <span className="chip-val font-mono">
                {(data.intraday_telemetry?.rsi_14 || data.indicators?.rsi_14 || 50).toFixed(1)}
              </span>
              <span className="chip-sub font-mono">Momentum</span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">SUPERTREND</span>
              <span className="chip-val font-mono" style={{ color: (data.intraday_telemetry?.supertrend_direction === 'BULLISH' || data.supertrend?.direction === 1) ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                {data.intraday_telemetry?.supertrend_direction || (data.supertrend?.direction === 1 ? 'BULLISH' : 'BEARISH')}
              </span>
              <span className="chip-sub font-mono">10, 2.0 Dynamic</span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">ATR VOLATILITY</span>
              <span className="chip-val font-mono">
                ₹{(data.intraday_telemetry?.atr_14 || data.trade_plan?.atr_14 || 0).toFixed(2)}
              </span>
              <span className="chip-sub font-mono">True Range</span>
            </div>

            <div className="telemetry-chip">
              <span className="chip-label">SESSION CUTOFF</span>
              <span className="chip-val font-mono" style={{ color: '#ff9100' }}>
                {data.intraday_telemetry?.session_cutoff || '15:15 IST'}
              </span>
              <span className="chip-sub font-mono">Auto Square-Off</span>
            </div>
          </div>

          {/* TOP BENTO: AI SIGNAL HERO + TRADE PLAN */}
          <section className="algo-hero-grid">
            {/* HERO 1: AI SIGNAL & PROBABILITY */}
            <div className={`glass-panel algo-hero-signal-card ${getSignalBadgeClass(data.signal)}`}>
              <div className="card-ambient-glow" />
              <div className="hero-signal-top">
                <div className="hero-stock-heading">
                  <span className="stock-sym-badge">{data.symbol}</span>
                  <span className="stock-exchange-tag">NSE EQUITIES</span>
                  <span className="stock-date-tag font-mono">{data.analysis_date}</span>
                </div>
                <div className="hero-price-display font-mono">
                  <span className="price-label">Current Close (LTP)</span>
                  <span className="price-value">₹{(data.current_price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="hero-signal-center">
                <div className="probability-gauge-wrap">
                  <svg className="prob-gauge-svg" viewBox="0 0 100 100">
                    <circle className="gauge-bg" cx="50" cy="50" r="42" />
                    <circle
                      className="gauge-progress"
                      cx="50"
                      cy="50"
                      r="42"
                      style={{
                        strokeDasharray: 264,
                        strokeDashoffset: 264 - (264 * Math.min(100, Math.max(0, data.ai_probability))) / 100,
                        stroke: data.ai_probability >= 65 ? 'var(--bullish-neon)' : (data.ai_probability <= 38 ? 'var(--bearish-neon)' : 'var(--warning-text)')
                      }}
                    />
                  </svg>
                  <div className="prob-gauge-center">
                    <span className="prob-number font-mono">{(data.ai_probability ?? 50).toFixed(1)}%</span>
                    <span className="prob-label">AI PROBABILITY</span>
                  </div>
                </div>

                <div className="signal-verdict-box">
                  <div className="signal-verdict-badge">
                    {getSignalIcon(data.signal)}
                    <span className="signal-text">{data.signal}</span>
                  </div>
                  <div className="signal-summary-text">
                    {data.signal === 'STRONG BUY' && 'Institutional conviction confirmed: ≥ 6/7 Buy checks passed.'}
                    {data.signal === 'BUY' && 'Favorable technical & AI alignment: ≥ 4/7 Buy checks passed.'}
                    {data.signal === 'STRONG SELL' && 'High-conviction downward momentum: ≥ 6/7 Sell checks passed.'}
                    {data.signal === 'SELL' && 'Bearish breakdown confirmed: ≥ 4/7 Sell checks passed.'}
                    {data.signal === 'AVOID' && 'High-risk danger zone: Avoid criteria flagged.'}
                    {(data.signal === 'WAIT' || data.signal === 'WATCH / NEUTRAL') && 'Neutral consolidation: Awaiting high-probability directional trigger.'}
                  </div>
                  <div className="checks-mini-bar font-mono">
                    {isSellSignal ? (
                      <span className="checks-pass-pill" style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--bearish-neon)' }}>
                        <TrendingDown size={12} /> {data.sell_score ?? 0}/{data.sell_conditions?.length || 7} Sell Checks
                      </span>
                    ) : (
                      <span className="checks-pass-pill">
                        <Check size={12} /> {data.buy_score}/{data.buy_checks_total || data.buy_conditions?.length || 7} Buy Checks
                      </span>
                    )}
                    {(data.avoid_score || 0) > 0 && (
                      <span className="checks-avoid-pill">
                        <AlertTriangle size={12} /> {data.avoid_score} Avoid Flags
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* HERO 2: TRADE PLAN EXECUTION MATRIX */}
            <div className="glass-panel algo-trade-plan-card">
              <div className="trade-plan-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={18} className="text-accent-cyan" />
                  <span className="plan-title">QUANTITATIVE TRADE PLAN</span>
                </div>
                <div className="hold-period-badge font-mono">
                  <Clock size={13} />
                  <span>{typeof data.trade_plan?.hold_period_days === 'number' ? `Est. Hold: ~${data.trade_plan.hold_period_days} Days` : (data.trade_plan?.hold_period_days || 'Intraday Horizon')}</span>
                </div>
              </div>

              {/* Price Targets Row */}
              <div className="plan-targets-row">
                {/* Entry */}
                <div className="plan-target-box entry-box">
                  <span className="box-label">ENTRY PRICE</span>
                  <span className="box-val font-mono">₹{(data.trade_plan?.entry_price ?? 0).toFixed(2)}</span>
                  <span className="box-sub">Current Market Bar</span>
                </div>

                {/* Target */}
                <div className="plan-target-box target-box">
                  <span className="box-label">TARGET (3.0x ATR)</span>
                  <span className="box-val font-mono text-bullish-neon">₹{(data.trade_plan?.target_price ?? 0).toFixed(2)}</span>
                  <span className="box-sub text-bullish-text font-mono">+{(data.trade_plan?.target_pct ?? 0).toFixed(2)}%</span>
                </div>

                {/* Stoploss */}
                <div className="plan-target-box sl-box">
                  <span className="box-label">STOPLOSS (1.5x ATR)</span>
                  <span className="box-val font-mono text-bearish-neon">₹{(data.trade_plan?.stoploss_price ?? 0).toFixed(2)}</span>
                  <span className="box-sub text-bearish-text font-mono">-{(data.trade_plan?.stoploss_pct ?? 0).toFixed(2)}%</span>
                </div>

                {/* Risk / Reward */}
                <div className={`plan-target-box rr-box ${(data.trade_plan?.risk_reward ?? 0) >= 1.8 ? 'rr-good' : 'rr-warn'}`}>
                  <span className="box-label">RISK / REWARD</span>
                  <span className="box-val font-mono">1 : {(data.trade_plan?.risk_reward ?? 0).toFixed(2)}</span>
                  <span className="box-sub">
                    {(data.trade_plan?.risk_reward ?? 0) >= 1.8 ? 'Meets Min 1.8 R/R' : 'Below 1.8 Threshold'}
                  </span>
                </div>
              </div>

              {/* Visual Trade Plan Slider */}
              <div className="plan-slider-wrap">
                <div className="slider-markers-labels font-mono">
                  <span className="sl-marker-label">SL: ₹{(data.trade_plan?.stoploss_price ?? 0).toFixed(2)} (-{(data.trade_plan?.stoploss_pct ?? 0).toFixed(1)}%)</span>
                  <span className="entry-marker-label">Entry: ₹{(data.trade_plan?.entry_price ?? 0).toFixed(2)}</span>
                  <span className="tg-marker-label">Target: ₹{(data.trade_plan?.target_price ?? 0).toFixed(2)} (+{(data.trade_plan?.target_pct ?? 0).toFixed(1)}%)</span>
                </div>
                <div className="plan-slider-track">
                  <div className="slider-sl-zone" style={{ width: '33%' }} />
                  <div className="slider-entry-pin" style={{ left: '33%' }} />
                  <div className="slider-tg-zone" style={{ width: '67%' }} />
                </div>
              </div>

            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECTION 1.5: INTRADAY MANUAL ORDER EXECUTION TICKET & SIZING ENGINE   */}
          {/* ===================================================================== */}
          <OrderExecutionSlip
            tradePlan={data.trade_plan}
            symbol={data.symbol}
            currentPrice={data.current_price}
            signal={data.signal}
            timeframe={timeframe}
            initialCapital={accountCapital}
            initialRisk={riskPerTrade}
          />

          {/* ===================================================================== */}
          {/* SECTION 2: INTERACTIVE 45-SESSION CANDLESTICK & VOLUME CHART          */}
          {/* ===================================================================== */}
          {data.recent_history && data.recent_history.length > 0 && (
            <section className="glass-panel algo-section-card">
              <div className="section-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart3 size={18} className="text-accent-cyan" />
                  <h3 className="section-title">Interactive Price Action & Technical Moving Averages</h3>
                </div>
                <span className="section-pill font-mono">
                  45 Daily Sessions • EMA 20 & 50 Overlay
                </span>
              </div>

              <InteractiveCandleChart
                history={data.recent_history}
                currentPrice={data.current_price}
                symbol={data.symbol}
              />
            </section>
          )}

          {/* ===================================================================== */}
          {/* SECTION 3: MULTI-CONDITION BUY & SELL CONFIRMATION ENGINE             */}
          {/* ===================================================================== */}
          <section className="glass-panel algo-section-card">
            <div className="section-header-row" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} className={activeChecklistType === 'sell' ? 'text-bearish-neon' : 'text-bullish-neon'} />
                <h3 className="section-title">
                  Multi-Condition Confirmation Engine ({activeChecklistType === 'sell' ? 'SELL Breakdown' : 'BUY Setup'} Checklist)
                </h3>
              </div>

              {/* BUY vs SELL Checklist Switcher Tabs & Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {data.sell_conditions && data.sell_conditions.length > 0 && (
                  <div className="timeframe-toggle-strip" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className={`timeframe-toggle-btn ${activeChecklistType === 'buy' ? 'active' : ''}`}
                      onClick={() => setChecklistTab('buy')}
                      style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                    >
                      <TrendingUp size={12} />
                      <span>BUY Checks ({data.buy_score ?? 0}/{data.buy_conditions?.length || 7})</span>
                    </button>
                    <button
                      type="button"
                      className={`timeframe-toggle-btn ${activeChecklistType === 'sell' ? 'active' : ''}`}
                      onClick={() => setChecklistTab('sell')}
                      style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                    >
                      <TrendingDown size={12} />
                      <span>SELL Checks ({data.sell_score ?? 0}/{data.sell_conditions?.length || 7})</span>
                    </button>
                  </div>
                )}

                <div className="checklist-filter-pills font-mono">
                  <button
                    className={`filter-pill ${checkFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setCheckFilter('all')}
                  >
                    All ({currentTotal})
                  </button>
                  <button
                    className={`filter-pill ${checkFilter === 'passed' ? 'active' : ''}`}
                    onClick={() => setCheckFilter('passed')}
                  >
                    Passed ({currentScore})
                  </button>
                  <button
                    className={`filter-pill ${checkFilter === 'failed' ? 'active' : ''}`}
                    onClick={() => setCheckFilter('failed')}
                  >
                    Failed ({Math.max(0, currentTotal - currentScore)})
                  </button>
                </div>
                <span className="section-pill font-mono">
                  {currentScore} / {currentTotal} {activeChecklistType.toUpperCase()} Criteria Passed
                </span>
              </div>
            </div>

            <div className="checklist-grid">
              {filteredConditions.map((item) => (
                <div
                  key={item.id}
                  className={`check-pill-item ${item.passed ? 'check-passed' : 'check-failed'}`}
                >
                  <div className="check-icon-wrap">
                    {item.passed ? (
                      <CheckCircle2 size={16} className={activeChecklistType === 'sell' ? 'text-bearish-neon' : 'text-bullish-neon'} />
                    ) : (
                      <XCircle size={16} className="text-text-faint" />
                    )}
                  </div>
                  <div className="check-text-content">
                    <span className="check-label">{item.label}</span>
                    <div className="check-meta-row font-mono">
                      <span>Threshold: {item.threshold}</span>
                      <span className="meta-sep">•</span>
                      <span className={item.passed ? (activeChecklistType === 'sell' ? 'text-bearish-neon' : 'text-bullish-neon') : 'text-text-muted'}>
                        Actual: {item.actual}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* AVOID CONDITIONS SUB-PANEL */}
            {data.avoid_conditions && data.avoid_conditions.length > 0 && (
              <div className="avoid-flags-container">
                <div className="avoid-flags-header">
                  <AlertTriangle size={15} style={{ color: 'var(--bearish-neon)' }} />
                  <span>Avoid Criteria Monitoring (Triggers AVOID signal if ≥ 3 are active)</span>
                </div>
                <div className="avoid-flags-grid">
                  {data.avoid_conditions.map((av) => (
                    <div
                      key={av.id}
                      className={`avoid-chip ${av.passed ? 'flagged' : 'clear'}`}
                    >
                      <span className="avoid-dot" />
                      <span>{av.label}</span>
                      <span className="avoid-val font-mono">({av.actual})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ===================================================================== */}
          {/* SECTION 4: TECHNICAL INDICATORS & MULTI-TIMEFRAME                     */}
          {/* ===================================================================== */}
          <section className="algo-two-col-grid">
            {/* TECHNICAL INDICATORS MATRIX */}
            <div className="glass-panel algo-section-card">
              <div className="section-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} className="text-accent-cyan" />
                  <h3 className="section-title">Core Technical Indicators Matrix</h3>
                </div>
                <span className="section-pill font-mono">TA Suite v4.0</span>
              </div>

              <div className="indicators-bento-grid">
                {/* RSI */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">RSI (14)</span>
                    <span className={`ind-badge ${data.indicators?.rsi_status === 'OVERBOUGHT' ? 'badge-danger' : (data.indicators?.rsi_status === 'OVERSOLD' ? 'badge-bullish' : 'badge-neutral')}`}>
                      {data.indicators?.rsi_status || 'OPTIMAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono">{(data.indicators?.rsi ?? 50).toFixed(1)}</div>
                  <div className="ind-sub">Optimal momentum band: 45 - 72</div>
                </div>

                {/* ADX */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">ADX (14)</span>
                    <span className={`ind-badge ${data.indicators?.adx_status === 'STRONG' ? 'badge-bullish' : 'badge-neutral'}`}>
                      {data.indicators?.adx_status || 'TREND'} TREND
                    </span>
                  </div>
                  <div className="ind-val font-mono">{(data.indicators?.adx ?? 25).toFixed(1)}</div>
                  <div className="ind-sub">Trend strength filter (&gt;20)</div>
                </div>

                {/* SUPERTREND */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Supertrend (10, 2)</span>
                    <span className={`ind-badge ${data.indicators?.supertrend === 'BULLISH' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.indicators?.supertrend || 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono" style={{ color: data.indicators?.supertrend === 'BULLISH' ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                    {data.indicators?.supertrend || 'NEUTRAL'}
                  </div>
                  <div className="ind-sub">ATR trailing volatility band</div>
                </div>

                {/* ATR */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Average True Range (14)</span>
                    <span className="ind-badge badge-neutral">VOLATILITY</span>
                  </div>
                  <div className="ind-val font-mono">₹{(data.indicators?.atr ?? 0).toFixed(2)}</div>
                  <div className="ind-sub">SL multiplier: 1.5x | Target: 2.5x</div>
                </div>

                {/* MACD HISTOGRAM */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">MACD Histogram</span>
                    <span className={`ind-badge ${data.indicators?.macd_status === 'POSITIVE' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.indicators?.macd_status || 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono" style={{ color: (data.indicators?.macd_hist ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                    {(data.indicators?.macd_hist ?? 0) > 0 ? `+${(data.indicators?.macd_hist ?? 0).toFixed(2)}` : (data.indicators?.macd_hist ?? 0).toFixed(2)}
                  </div>
                  <div className="ind-sub">12/26/9 MACD momentum spread</div>
                </div>

                {/* VOLUME RATIO */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Volume Ratio (RVOL)</span>
                    <span className={`ind-badge ${data.indicators?.vol_status === 'SURGE' ? 'badge-bullish' : 'badge-neutral'}`}>
                      {data.indicators?.vol_status || 'NORMAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono">{(data.indicators?.vol_ratio ?? 1).toFixed(2)}x</div>
                  <div className="ind-sub">&ge;1.3x triggers volume surge</div>
                </div>

                {/* RELATIVE STRENGTH / VWAP DISTANCE */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">{timeframe === 'intraday' ? 'Distance vs VWAP' : 'RS vs NIFTY 50'}</span>
                    <span className={`ind-badge ${((data.intraday_telemetry?.vwap_distance_pct ?? data.indicators?.rs_vs_nifty_pct) ?? 0) >= 0 ? 'badge-bullish' : 'badge-danger'}`}>
                      {((data.intraday_telemetry?.vwap_distance_pct ?? data.indicators?.rs_vs_nifty_pct) ?? 0) >= 0 ? 'ABOVE / ALPHA' : 'BELOW / LAGGING'}
                    </span>
                  </div>
                  <div className="ind-val font-mono" style={{ color: ((data.intraday_telemetry?.vwap_distance_pct ?? data.indicators?.rs_vs_nifty_pct) ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                    {((data.intraday_telemetry?.vwap_distance_pct ?? data.indicators?.rs_vs_nifty_pct) ?? 0) >= 0 ? '+' : ''}{((data.intraday_telemetry?.vwap_distance_pct ?? data.indicators?.rs_vs_nifty_pct) ?? 0).toFixed(2)}%
                  </div>
                  <div className="ind-sub">{timeframe === 'intraday' ? 'Session institutional anchor' : 'Relative alpha vs benchmark'}</div>
                </div>

                {/* MOVING AVERAGES MATRIX */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">{timeframe === 'intraday' ? 'SMA 6 / SMA 30 / VWAP' : 'Moving Averages (EMA)'}</span>
                    <span className="ind-badge badge-neutral">{timeframe === 'intraday' ? '6 / 30 / VWAP' : '20 / 50 / 200'}</span>
                  </div>
                  <div className="ind-val font-mono" style={{ fontSize: '0.88rem' }}>
                    ₹{(data.indicators?.ema20 ?? data.intraday_telemetry?.sma_6 ?? 0).toFixed(0)} / ₹{(data.indicators?.ema50 ?? data.intraday_telemetry?.sma_30 ?? 0).toFixed(0)} / ₹{(data.indicators?.ema200 ?? data.intraday_telemetry?.vwap ?? 0).toFixed(0)}
                  </div>
                  <div className="ind-sub font-mono" style={{ fontSize: '0.70rem' }}>
                    Dist: {(data.indicators?.dist_ema20_pct ?? 0) > 0 ? `+${data.indicators?.dist_ema20_pct}%` : `${data.indicators?.dist_ema20_pct ?? 0}%`} vs Fast Avg
                  </div>
                </div>
              </div>
            </div>

            {/* MULTI-TIMEFRAME & MODEL QUALITY */}
            <div className="glass-panel algo-section-card">
              <div className="section-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} className="text-accent-cyan" />
                  <h3 className="section-title">Multi-Timeframe & Model Validation</h3>
                </div>
                <span className="section-pill font-mono">5-Fold TimeSeriesSplit</span>
              </div>

              {/* Multi-Timeframe Alignment */}
              <div className="mtf-cards-row">
                <div className="mtf-card">
                  <span className="mtf-label">WEEKLY HIGHER TIMEFRAME TREND</span>
                  <div className="mtf-status-row">
                    <span className={`mtf-badge ${data.multi_timeframe?.weekly_trend === 'BULLISH' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.multi_timeframe?.weekly_trend || 'NEUTRAL'}
                    </span>
                    <span className="mtf-detail">Weekly EMA 20 vs EMA 50 alignment</span>
                  </div>
                </div>

                <div className="mtf-card">
                  <span className="mtf-label">LONG-TERM STRUCTURAL REGIME</span>
                  <div className="mtf-status-row">
                    <span className={`mtf-badge ${data.multi_timeframe?.above_ema200 ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.multi_timeframe?.above_ema200 ? 'ABOVE EMA 200' : 'BELOW EMA 200'}
                    </span>
                    <span className="mtf-detail">{data.multi_timeframe?.above_ema200_label || 'Structural trend filter'}</span>
                  </div>
                </div>
              </div>

              {/* XGBoost 5-Fold Cross Validation */}
              <div className="model-cv-box">
                <div className="cv-header-row">
                  <span className="cv-title">XGBoost Cross-Validation Accuracy</span>
                  <span className="cv-mean-score font-mono">
                    {(data.model_quality?.avg_accuracy_pct ?? 0).toFixed(2)}% ± {(data.model_quality?.std_accuracy_pct ?? 0).toFixed(2)}%
                  </span>
                </div>

                <div className="folds-grid">
                  {(data.model_quality?.fold_scores || []).map((score, fIdx) => (
                    <div key={fIdx} className="fold-box">
                      <span className="fold-name">Fold {fIdx + 1}</span>
                      <span className="fold-val font-mono">{(score || 0).toFixed(1)}%</span>
                      <div className="fold-bar-track">
                        <div className="fold-bar-fill" style={{ width: `${Math.min(100, Math.max(0, score || 0))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Feature Importances */}
              {data.model_quality?.feature_importances && data.model_quality.feature_importances.length > 0 && (
                <div className="feature-importance-box">
                  <span className="feat-title">Top ML Features Impact:</span>
                  <div className="feat-tags-row">
                    {data.model_quality.feature_importances.map((f, idx) => (
                      <span key={idx} className="feat-tag font-mono">
                        {f.feature} ({f.importance}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECTION 5: WALK-FORWARD BACKTEST & CUMULATIVE RETURN CURVE            */}
          {/* ===================================================================== */}
          <section className="glass-panel algo-section-card">
            <div className="section-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={18} className="text-bullish-neon" />
                <h3 className="section-title">Walk-Forward Backtesting (Last 20% Out-Of-Sample Data)</h3>
              </div>
              <span className="section-pill font-mono">
                {data.backtest?.total_trades ?? 0} Simulated Trades
              </span>
            </div>

            {/* Backtest Stats Row */}
            <div className="backtest-stats-grid">
              <div className="bt-stat-card">
                <span className="bt-stat-label">WIN RATE</span>
                <span className="bt-stat-val font-mono text-bullish-neon">{(data.backtest?.win_rate_pct ?? 0).toFixed(1)}%</span>
                <span className="bt-stat-sub font-mono">{data.backtest?.wins ?? 0} Wins / {data.backtest?.losses ?? 0} Losses</span>
              </div>

              <div className="bt-stat-card">
                <span className="bt-stat-label">AVG PROFIT / TRADE</span>
                <span className="bt-stat-val font-mono" style={{ color: (data.backtest?.avg_profit_pct ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                  {(data.backtest?.avg_profit_pct ?? 0) >= 0 ? `+${(data.backtest?.avg_profit_pct ?? 0).toFixed(2)}%` : `${(data.backtest?.avg_profit_pct ?? 0).toFixed(2)}%`}
                </span>
                <span className="bt-stat-sub">{timeframe === 'intraday' ? '10m intraday horizon' : '5-day swing horizon'}</span>
              </div>

              <div className="bt-stat-card">
                <span className="bt-stat-label">PROFIT FACTOR</span>
                <span className="bt-stat-val font-mono text-accent-cyan">
                  {(data.backtest?.profit_factor ?? 0) > 0 ? (data.backtest?.profit_factor ?? 0).toFixed(2) : 'N/A'}
                </span>
                <span className="bt-stat-sub">{data.backtest?.profit_factor_label || 'Calculated'} Risk-Adjusted Ratio</span>
              </div>

              <div className="bt-stat-card">
                <span className="bt-stat-label">MAX DRAWDOWN</span>
                <span className="bt-stat-val font-mono text-bearish-neon">{(data.backtest?.max_drawdown_pct ?? 0).toFixed(2)}%</span>
                <span className="bt-stat-sub">Peak-to-trough drop</span>
              </div>
            </div>

            {/* Interactive Cumulative Return Curve */}
            {data.backtest?.cumulative_returns && data.backtest.cumulative_returns.length > 0 && (
              <InteractiveEquityCurve returns={data.backtest.cumulative_returns} />
            )}

            {/* Recent Trades Table with Filter Tabs */}
            {data.backtest?.trades && data.backtest.trades.length > 0 && (
              <div className="recent-trades-container">
                <div className="trades-table-header">
                  <div className="trades-table-title">Recent Walk-Forward Trades Log</div>
                  <div className="trade-filter-pills font-mono">
                    <button
                      className={`filter-pill ${tradeFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setTradeFilter('all')}
                    >
                      All ({data.backtest.trades.length})
                    </button>
                    <button
                      className={`filter-pill ${tradeFilter === 'won' ? 'active' : ''}`}
                      onClick={() => setTradeFilter('won')}
                    >
                      Wins ({data.backtest.trades.filter(t => t.won).length})
                    </button>
                    <button
                      className={`filter-pill ${tradeFilter === 'lost' ? 'active' : ''}`}
                      onClick={() => setTradeFilter('lost')}
                    >
                      Losses ({data.backtest.trades.filter(t => !t.won).length})
                    </button>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="algo-trades-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Entry Price</th>
                        <th>Exit Price (5D)</th>
                        <th>AI Probability</th>
                        <th>Outcome</th>
                        <th style={{ textAlign: 'right' }}>Return %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((t, idx) => {
                        const entryVal = Number(t.entry ?? t.entry_price ?? 0)
                        const exitVal = Number(t.exit ?? t.exit_price ?? 0)
                        const retVal = Number(t.return_pct ?? t.pnl_pct ?? 0)
                        const probVal = t.ai_prob ?? Math.round(data?.ai_probability || 60)
                        const dateVal = t.date || t.entry_date || `Bar ${idx + 1}`
                        const isWin = Boolean(t.won ?? (retVal > 0))

                        return (
                          <tr key={idx}>
                            <td className="font-mono text-muted">{dateVal}</td>
                            <td className="font-mono">₹{entryVal.toFixed(2)}</td>
                            <td className="font-mono">₹{exitVal.toFixed(2)}</td>
                            <td className="font-mono">{probVal}%</td>
                            <td>
                              <span className={`trade-status-chip ${isWin ? 'trade-won' : 'trade-lost'}`}>
                                {isWin ? 'WIN' : 'LOSS'}
                              </span>
                            </td>
                            <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: retVal >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                              {retVal >= 0 ? `+${retVal.toFixed(2)}%` : `${retVal.toFixed(2)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
