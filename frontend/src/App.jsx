import React, { useState, useEffect, useMemo } from 'react'

import {

  TrendingUp,

  TrendingDown,

  Play,

  RotateCw,

  LogOut,

  Search,

  CheckCircle2,

  AlertCircle,

  Clock,

  Shield,

  Layers,

  ArrowUpDown,

  Download,

  Key,

  Eye,

  EyeOff,

  ChevronRight,

  ExternalLink,

  Sparkles,

  BarChart3,

  Microscope,

  Award,

  AlertTriangle,

  Check,

  X,

  Zap,

  Maximize2,

  Sun,

  Moon,

  Square,

  Activity,

  FileText,

  Sliders

} from 'lucide-react'

import './App.css'

import AlgoSignals from './AlgoSignals'

import SMCEngine from './SMCEngine'
import SMCChartModal from './SMCChartModal'
import SMCSettingsModal from './SMCSettingsModal'

// Dynamic API Base URL configuration for Render deployment (supports both unified and separate services)

const RAW_API_URL = import.meta.env.VITE_API_URL || ''

const API_BASE = RAW_API_URL

  ? (RAW_API_URL.startsWith('http') ? RAW_API_URL : `https://${RAW_API_URL}`).replace(/\/+$/, '')

  : ''

const UNIVERSE_OPTIONS = [

  { id: 'ALL', label: '🌐 NIFTY 500', sub: 'All 501 Equities', count: 501 },

  { id: 'NIFTY50', label: '🏆 NIFTY 50', sub: 'Mega Caps', count: 50 },

  { id: 'NIFTY100', label: '💎 NIFTY 100', sub: 'Large Caps', count: 100 },

  { id: 'NIFTY200', label: '🚀 NIFTY 200', sub: 'Large & Mid', count: 200 },

  { id: 'MIDCAP', label: '📈 MidCap 100', sub: 'Mid Caps', count: 100 },

  { id: 'MOST_ACTIVE', label: '⚡ Most Active', sub: 'Turnover Leaders', count: 50 }

]

const SESSION_STORAGE_KEY = 'upstox_session_id'

const getSessionId = () => {

  try {

    return sessionStorage.getItem(SESSION_STORAGE_KEY) || ''

  } catch {

    return ''

  }

}

const setStoredSessionId = (id) => {

  try {

    if (id) {

      sessionStorage.setItem(SESSION_STORAGE_KEY, id)

    } else {

      sessionStorage.removeItem(SESSION_STORAGE_KEY)

    }

  } catch {}

}

const authFetch = (url, options = {}) => {

  const sessionId = getSessionId()

  const headers = {

    ...(options.headers || {}),

    ...(sessionId ? { 'X-Session-ID': sessionId, 'Authorization': `Bearer ${sessionId}` } : {})

  }

  return fetch(url, {

    ...options,

    credentials: 'include',

    headers

  })

}

export default function App() {

  // Obsidian Black Glass Theme permanently active

  useEffect(() => {

    document.documentElement.setAttribute('data-theme', 'dark')

    localStorage.setItem('upstox_glass_theme', 'dark')

  }, [])

  // Navigation: 'scanner' (App 1) vs 'screener' (App 2) vs 'scorer' (App 3)

  const [activeApp, setActiveApp] = useState('scanner')

  const [authStatus, setAuthStatus] = useState({

    loading: false,

    authenticated: false,

    configured: true,

    user_id: null,

    user_name: null,

    message: null

  })

  // Direct Token state

  const [directToken, setDirectToken] = useState('')

  const [isSubmittingToken, setIsSubmittingToken] = useState(false)

  const [showToken, setShowToken] = useState(false)

  const [showUpdateModal, setShowUpdateModal] = useState(false)

  const [updateTokenInput, setUpdateTokenInput] = useState('')

  const [showUpdateToken, setShowUpdateToken] = useState(false)

  // Scanner state (App 1)

  const [scanStatus, setScanStatus] = useState({

    status: 'idle',

    is_running: false,

    progress_message: 'Ready to scan.',

    stocks_scanned: 0,

    total_stocks: 0,

    signals_found: 0,

    error: null

  })

  const [results, setResults] = useState([])

  const [confirmedBuys, setConfirmedBuys] = useState([])

  const [confirmedSells, setConfirmedSells] = useState([])

  const [mostActiveStocks, setMostActiveStocks] = useState([])

  const [marketOverview, setMarketOverview] = useState(null)

  const [lastScanTime, setLastScanTime] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')

  const [signalFilter, setSignalFilter] = useState('ALL') // ALL, BUY, SELL, WATCH

  const [selectedUniverse, setSelectedUniverse] = useState('ALL') // ALL, NIFTY50, NIFTY100, NIFTY200, MIDCAP, MOST_ACTIVE

  const [currentPage, setCurrentPage] = useState(1)

  const [pageSize, setPageSize] = useState(50) // 25, 50, 100, 250, 600

  const [activityRankFilter, setActivityRankFilter] = useState(500) // 10, 25, 50, 100, 200, 500

  const [changeFilter, setChangeFilter] = useState('ALL') // ALL, GAINERS, LOSERS

  const [minScoreFilter, setMinScoreFilter] = useState(0) // 0, 50, 60, 70, 80

  const [autoRefreshSecs, setAutoRefreshSecs] = useState(180) // 0 (off), 60 (1m), 180 (3m), 300 (5m)

  const [sortField, setSortField] = useState('Activity Rank')

  const [sortDirection, setSortDirection] = useState('asc') // asc, desc

  const [selectedStock, setSelectedStock] = useState(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  const [isRefreshing, setIsRefreshing] = useState(false)

  const [errorMessage, setErrorMessage] = useState(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState('10m')
  const [showPositionModal, setShowPositionModal] = useState(false)
  const [calcStock, setCalcStock] = useState(null)
  const [calcCapital, setCalcCapital] = useState(100000)
  const [calcRisk, setCalcRisk] = useState(1500)
  const [calcResult, setCalcResult] = useState(null)
  const [calcLoading, setCalcLoading] = useState(false)

  // Pro Trader Setup: Broker Order Ticket Modal & Filter State
  const [showBrokerModal, setShowBrokerModal] = useState(false)
  const [brokerStock, setBrokerStock] = useState(null)
  const [selectedBroker, setSelectedBroker] = useState('ZERODHA') // ZERODHA, UPSTOX, ANGEL, GROWW
  const [copiedSlipId, setCopiedSlipId] = useState(null)
  const [confirmedViewFilter, setConfirmedViewFilter] = useState('ALL') // ALL, BUY, SELL, HIGH_CONFLUENCE

  // IST Session Phase Calculator (trader-alerts)
  const getISTSessionPhase = () => {
    const now = new Date()
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const day = istTime.getDay()
    const mins = istTime.getHours() * 60 + istTime.getMinutes()

    if (day === 0 || day === 6) {
      return { status: 'WEEKEND', label: 'MARKET CLOSED (WEEKEND)', canEnter: false, color: '#94a3b8' }
    }
    if (mins < 540) {
      return { status: 'PRE_OPEN', label: 'PRE-MARKET OPENS AT 9:00 AM IST', canEnter: false, color: '#94a3b8' }
    } else if (mins < 555) {
      return { status: 'AUCTION', label: 'PRE-MARKET AUCTION (9:00 - 9:15 AM)', canEnter: false, color: '#fbbf24' }
    } else if (mins < 585) {
      return { status: 'OPENING', label: 'OPENING VOLATILITY / ORH-ORL RANGE (9:15 - 9:45 AM)', canEnter: false, color: '#fbbf24' }
    } else if (mins < 690) {
      return { status: 'SESSION_1', label: 'SESSION 1: MORNING LIQUIDITY (9:45 - 11:30 AM) • PRIME EXECUTION', canEnter: true, color: '#00f5a0' }
    } else if (mins < 810) {
      return { status: 'LULL', label: 'MID-DAY LULL (11:30 AM - 1:30 PM) • CHOP / NO NEW ENTRIES', canEnter: false, color: '#f59e0b' }
    } else if (mins < 900) {
      return { status: 'SESSION_2', label: 'SESSION 2: AFTERNOON EXPANSION (1:30 - 3:00 PM) • PRIME EXECUTION', canEnter: true, color: '#00f5a0' }
    } else if (mins < 915) {
      return { status: 'CUTOFF', label: 'NEW ENTRY CUTOFF (3:00 - 3:15 PM) • NO FRESH ORDERS', canEnter: false, color: '#ff3366' }
    } else if (mins < 930) {
      return { status: 'SQUARE_OFF', label: 'MANDATORY MIS AUTO SQUARE-OFF (3:15 PM)', canEnter: false, color: '#ef4444' }
    } else {
      return { status: 'CLOSED', label: 'MARKET CLOSED (POST-MARKET)', canEnter: false, color: '#64748b' }
    }
  }

  // Institutional Broker Order Ticket Generator (trader-broker & trader-budget)
  const generateBrokerSlipText = (stock, broker = 'ZERODHA') => {
    if (!stock) return ''
    const entry = Number(stock.Entry ?? stock.Close ?? 0)
    const sl = Number(stock['Stop-Loss'] ?? stock['Stop Loss'] ?? 0)
    const t1 = Number(stock['Target 1'] ?? 0)
    const t2 = Number(stock['Target 2'] ?? 0)
    const isBuy = (stock.Status || stock.Signal || stock['Signal Type'] || '').toUpperCase().includes('BUY')
    const risk = Math.max(0.1, Math.abs(entry - sl))
    const shares = Math.max(1, Math.floor(calcRisk / risk))
    const margin = Math.round((entry * shares) / 5)

    if (broker === 'ZERODHA') {
      return `=== ZERODHA KITE INTRADAY ORDER TICKET ===\n` +
             `Instrument: NSE:${stock.Symbol}\n` +
             `Segment: MIS (Intraday Cash - 5x Leverage)\n` +
             `Action: ${isBuy ? 'BUY' : 'SELL'}\n` +
             `Order Type: LIMIT\n` +
             `Quantity: ${shares} Shares\n` +
             `Limit Entry Price: ₹${entry.toFixed(2)}\n` +
             `Stop Loss Trigger (SL-M): ₹${sl.toFixed(2)}\n` +
             `Target 1 (1:2 R:R): ₹${t1.toFixed(2)}\n` +
             `Target 2 (1:3 R:R): ₹${t2.toFixed(2)}\n` +
             `Approx Margin Required: ₹${margin.toLocaleString('en-IN')}\n` +
             `Auto Square-Off: 15:15 IST (Mandatory MIS closure)\n` +
             `Strategy: SMC Institutional Liquidity Sweep + BOS + FVG\n` +
             `===========================================`
    } else if (broker === 'UPSTOX') {
      return `=== UPSTOX API V3 INTRADAY ORDER SLIP ===\n` +
             `Exchange: NSE_EQ\n` +
             `Symbol: ${stock.Symbol}\n` +
             `Transaction Type: ${isBuy ? 'BUY' : 'SELL'}\n` +
             `Order Type: LIMIT\n` +
             `Product: I (Intraday MIS)\n` +
             `Quantity: ${shares}\n` +
             `Price: ₹${entry.toFixed(2)}\n` +
             `Trigger Price: ₹${sl.toFixed(2)}\n` +
             `Target Price (1:2): ₹${t1.toFixed(2)}\n` +
             `Target Price (1:3): ₹${t2.toFixed(2)}\n` +
             `Margin: ₹${margin.toLocaleString('en-IN')}\n` +
             `Auto Square-Off: 15:15 IST\n` +
             `==========================================`
    } else if (broker === 'ANGEL') {
      return `=== ANGEL ONE SMARTAPI ORDER SLIP ===\n` +
             `Exchange: NSE\n` +
             `Tradingsymbol: ${stock.Symbol}-EQ\n` +
             `Transactiontype: ${isBuy ? 'BUY' : 'SELL'}\n` +
             `Producttype: INTRADAY\n` +
             `Ordertype: LIMIT\n` +
             `Quantity: ${shares}\n` +
             `Price: ₹${entry.toFixed(2)}\n` +
             `Triggerprice: ₹${sl.toFixed(2)}\n` +
             `Squareoff: ₹${Math.abs(t1 - entry).toFixed(2)}\n` +
             `Stoploss: ₹${risk.toFixed(2)}\n` +
             `Mandatory MIS Square-off: 15:15 IST\n` +
             `======================================`
    } else {
      return `=== NSE INTRADAY PRO TRADER ORDER TICKET ===\n` +
             `Exchange: NSE (Cash Equities)\n` +
             `Symbol: ${stock.Symbol} (${stock.Company || ''})\n` +
             `Side: ${isBuy ? 'BUY' : 'SELL'}\n` +
             `Product: MIS (Intraday 5x Leverage)\n` +
             `Quantity: ${shares} Shares (Risk: ₹${calcRisk})\n` +
             `Limit Entry Price: ₹${entry.toFixed(2)}\n` +
             `Structural SL Trigger: ₹${sl.toFixed(2)}\n` +
             `Target 1 (1:2 R:R): ₹${t1.toFixed(2)}\n` +
             `Target 2 (1:3 R:R): ₹${t2.toFixed(2)}\n` +
             `Risk-to-Reward: ${stock['Risk/Reward'] || '1:2.0'}\n` +
             `Margin Required: ₹${margin.toLocaleString('en-IN')}\n` +
             `Auto Square-Off Time: 15:15 IST\n` +
             `============================================`
    }
  }

  const copyBrokerOrderSlip = (stock, broker = 'ZERODHA') => {
    if (!stock) return
    const text = generateBrokerSlipText(stock, broker)
    navigator.clipboard.writeText(text)
    setCopiedSlipId(stock.Symbol)
    addToast(`Copied ${broker} Order Ticket for ${stock.Symbol}!`, 'success')
    setTimeout(() => setCopiedSlipId(null), 3000)
  }

  const openBrokerTicketModal = (stock) => {
    setBrokerStock(stock)
    setShowBrokerModal(true)
  }

  const [successMessage, setSuccessMessage] = useState(null)

  // Floating Toast Notifications state

  const [toasts, setToasts] = useState([])

  const addToast = (msg, type = 'info') => {

    if (!msg) return

    const id = Date.now() + Math.random().toString(36).substr(2, 4)

    setToasts(prev => [...prev, { id, message: msg, type }])

    setTimeout(() => {

      setToasts(prev => prev.filter(t => t.id !== id))

    }, 4500)

  }

  const removeToast = (id) => {

    setToasts(prev => prev.filter(t => t.id !== id))

  }

  // Bhavcopy & Liquidity Research State

  const [showBhavcopyModal, setShowBhavcopyModal] = useState(false)

  const [bhavcopyData, setBhavcopyData] = useState(null)

  const [bhavcopyLoading, setBhavcopyLoading] = useState(false)

  // 10-Minute Strategy Backtest State

  const [showBacktestModal, setShowBacktestModal] = useState(false)

  const [backtestSymbol, setBacktestSymbol] = useState('RELIANCE')

  const [backtestDays, setBacktestDays] = useState(15)

  const [backtestData, setBacktestData] = useState(null)

  const [backtestLoading, setBacktestLoading] = useState(false)

  // Real-time clock for telemetry

  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {

    const timer = setInterval(() => setCurrentTime(new Date()), 1000)

    return () => clearInterval(timer)

  }, [])

  // Dismiss modals with ESC key

  useEffect(() => {

    const handleEsc = (e) => {

      if (e.key === 'Escape') {

        setSelectedStock(null)

        setShowBacktestModal(false)

        setShowBhavcopyModal(false)

        setShowUpdateModal(false)

      }

    }

    window.addEventListener('keydown', handleEsc)

    return () => window.removeEventListener('keydown', handleEsc)

  }, [])

  // Auto-refresh authentication session every 5 minutes

  useEffect(() => {

    const authTimer = setInterval(() => {

      checkAuth()

    }, 5 * 60 * 1000)

    return () => clearInterval(authTimer)

  }, [])

  const POPULAR_STOCKS = ['TCS', 'HDFCBANK', 'INFY', 'TATASTEEL', 'SBIN', 'ITC', 'BHARTIARTL', 'LT', 'ICICIBANK', 'RELIANCE']

  // 1. Check Authentication Status on mount

  const checkAuth = async () => {

    try {

      const res = await authFetch(`${API_BASE}/api/auth/status`)

      if (!res.ok) {

        setStoredSessionId(null)

        setAuthStatus(prev => ({ ...prev, loading: false, authenticated: false }))

        return

      }

      const data = await res.json()

      if (data.authenticated) {

        if (data.session_id) setStoredSessionId(data.session_id)

        setAuthStatus({

          loading: false,

          authenticated: true,

          configured: data.configured !== false,

          user_id: data.user_id,

          user_name: data.user_name,

          email: data.email,

          broker: data.broker,

          expires_at: data.expires_at,

          message: data.message

        })

        fetchResults()


      } else {

        setStoredSessionId(null)

        setAuthStatus({

          loading: false,

          authenticated: false,

          configured: data.configured !== false,

          user_id: null,

          user_name: null,

          message: data.message

        })

      }

    } catch (err) {

      console.error('Failed to fetch auth status:', err)

      setAuthStatus({

        loading: false,

        authenticated: false,

        configured: true,

        user_id: null,

        user_name: null,

        message: 'Could not connect to backend service.'

      })

    }

  }

  // 2. Fetch Market Session & Overview

  const fetchMarketOverview = async () => {

    try {

      const res = await authFetch(`${API_BASE}/api/market/session`)

      if (res.ok) {

        const data = await res.json()

        setMarketOverview(data)

      }

    } catch (err) {

      console.debug('Error fetching market session overview:', err)

    }

  }

  // 3. Fetch Latest Scanner Results

  const fetchResults = async () => {

    setIsRefreshing(true)

    try {

      fetchMarketOverview()

      const res = await authFetch(`${API_BASE}/api/scanner/results`)

      if (res.status === 401) {

        setStoredSessionId(null)

        setAuthStatus(prev => ({ ...prev, authenticated: false, message: 'Upstox authentication expired. Please re-enter your access token.' }))

        return

      }

      if (!res.ok) return

      const data = await res.json()

      if (data) {

        const stocks = data.most_active_stocks || data.results || []

        setMostActiveStocks(stocks)

        setResults(stocks)

        setConfirmedBuys(data.confirmed_buys || [])

        setConfirmedSells(data.confirmed_sells || [])

        setLastScanTime(new Date())

        if (data.market_session) {

          setMarketOverview(prev => ({ ...(prev || {}), market_session: data.market_session }))

        }

      }

    } catch (err) {

      console.error('Error fetching scanner results:', err)

    } finally {

      setIsRefreshing(false)

    }

  }

  // 4. Load NSE Bhavcopy Summary for Research

  const loadBhavcopyResearch = async () => {

    setBhavcopyLoading(true)

    try {

      const res = await authFetch(`${API_BASE}/api/bhavcopy/summary`)

      if (res.ok) {

        const data = await res.json()

        setBhavcopyData(data)

      }

    } catch (err) {

      console.error('Error fetching Bhavcopy summary:', err)

    } finally {

      setBhavcopyLoading(false)

    }

  }

  // 5. Run Intraday 10-Minute Backtest

  const runBacktest = async (symToTest, days = 15) => {

    const symbol = (symToTest || backtestSymbol).trim().toUpperCase()

    if (!symbol) return

    setBacktestSymbol(symbol)

    setBacktestLoading(true)

    setShowBacktestModal(true)

    try {

      const res = await authFetch(`${API_BASE}/api/backtest/run`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ symbol, days_back: days })

      })

      if (res.ok) {

        const data = await res.json()

        setBacktestData(data)

      }

    } catch (err) {

      console.error('Error running backtest:', err)

    } finally {

      setBacktestLoading(false)

    }

  }

  // Auto-Refresh Effect

  useEffect(() => {

    if (autoRefreshSecs > 0 && !scanStatus.is_running) {

      const timer = setInterval(() => {

        fetchResults()

      }, autoRefreshSecs * 1000)

      return () => clearInterval(timer)

    }

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [autoRefreshSecs, scanStatus.is_running])

  useEffect(() => {

    checkAuth()

    fetchResults()

    fetchMarketOverview()


  }, [])

  // 3. Poll Scanner Status while running

  useEffect(() => {

    let intervalId = null

    if (scanStatus.is_running) {

      intervalId = setInterval(async () => {

        try {

          const res = await authFetch(`${API_BASE}/api/scanner/status`)

          if (!res.ok) return

          const data = await res.json()

          setScanStatus(data)

          if (!data.is_running) {

            clearInterval(intervalId)

            fetchResults()

          }

        } catch (err) {

          console.error('Status poll error:', err)

        }

      }, 1000)

    }

    return () => {

      if (intervalId) clearInterval(intervalId)

    }

  }, [scanStatus.is_running])


  // Open Position Size Calculator Modal with prefilled parameters
  const openPositionCalculator = async (stock, overrideCapital, overrideRisk) => {
    if (!stock) return
    setCalcStock(stock)
    setShowPositionModal(true)
    setCalcLoading(true)

    const cap = overrideCapital !== undefined ? overrideCapital : calcCapital
    const rsk = overrideRisk !== undefined ? overrideRisk : calcRisk
    const entry = Number(stock.Entry ?? stock.Close ?? stock.ltp ?? 100)
    const isShort = (stock.Signal === 'SELL' || stock['Signal Type'] === 'SELL')
    const sl = Number(stock['Stop-Loss'] ?? stock['Stop Loss'] ?? (isShort ? entry * 1.015 : entry * 0.985))
    const t1 = Number(stock['Target 1'] ?? (isShort ? entry - 2 * Math.abs(entry - sl) : entry + 2 * Math.abs(entry - sl)))
    const t2 = Number(stock['Target 2'] ?? (isShort ? entry - 3 * Math.abs(entry - sl) : entry + 3 * Math.abs(entry - sl)))

    try {
      const res = await authFetch(`${API_BASE}/api/scanner/position-size`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capital_inr: cap,
          risk_pct_or_inr: rsk,
          entry_price: entry,
          stop_loss: sl,
          target_1: t1,
          target_2: t2,
          is_short: isShort,
          leverage_mis: 5.0
        })
      })
      if (res.ok) {
        const data = await res.json()
        setCalcResult(data)
      }
    } catch (err) {
      console.error('Position size calculation error:', err)
    } finally {
      setCalcLoading(false)
    }
  }

  // 4. Trigger Scanner Run

  const handleRunScanner = async (overrideUniverse) => {

    const universe = overrideUniverse || selectedUniverse || 'ALL'

    setErrorMessage(null)

    setSuccessMessage(null)

    try {

      const res = await authFetch(`${API_BASE}/api/scanner/run?universe=${encodeURIComponent(universe)}&limit=500&timeframe=${encodeURIComponent(selectedTimeframe)}`, { method: 'POST' })

      if (res.status === 401) {

        setErrorMessage('Upstox authentication expired. Please reconnect or enter your latest access token.')

        setStoredSessionId(null)

        setAuthStatus(prev => ({ ...prev, authenticated: false }))

        return

      }

      if (res.status === 409) {

        setScanStatus(prev => ({ ...prev, is_running: true }))

        return

      }

      if (!res.ok) {

        let errDetail = 'Failed to trigger scan'

        try {

          const errorData = await res.json()

          errDetail = errorData.detail || errorData.message || errDetail

        } catch {

          const text = await res.text()

          errDetail = text || errDetail

        }

        throw new Error(errDetail)

      }

      setScanStatus(prev => ({

        ...prev,

        status: 'running',

        is_running: true,

        progress_message: `Starting completed 10m intraday scan across NIFTY ${universe === 'ALL' ? '500' : universe}...`,

        stocks_scanned: 0

      }))

    } catch (err) {

      setErrorMessage(err.message)

    }

  }

  // Trigger Scanner Stop

  const handleStopScanner = async () => {

    try {

      const res = await authFetch(`${API_BASE}/api/scanner/stop`, { method: 'POST' })

      if (res.ok) {

        setSuccessMessage('Scan abort initiated.'); addToast('Scan abort initiated.', 'info')

      } else {

        const err = await res.json().catch(() => ({}))

        setErrorMessage(err.message || 'Failed to stop scanner.')

      }

    } catch (err) {

      console.error('Failed to stop scanner:', err)

      setErrorMessage('Failed to send scanner stop request.')

    }

  }

  // 5. Connect via Direct Access Token

  const handleConnectWithToken = async (tokenString) => {

    let token = (tokenString || directToken).trim()

    if (!token) {

      setErrorMessage('Please paste your Upstox access token.')

      return

    }

    if (token.toLowerCase().startsWith('bearer ')) {

      token = token.slice(7).trim()

    }

    setIsSubmittingToken(true)

    setErrorMessage(null)

    setSuccessMessage(null)

    try {

      const res = await fetch(`${API_BASE}/api/auth/token`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        credentials: 'include',

        body: JSON.stringify({ access_token: token })

      })

      let data = {}

      try {

        data = await res.json()

      } catch {

        const text = await res.text()

        data = { detail: text }

      }

      if (!res.ok) {

        throw new Error(data.detail || data.message || 'Failed to verify Upstox access token')

      }

      // Store private session ID locally for this browser session

      if (data.session_id) {

        setStoredSessionId(data.session_id)

      }

      setAuthStatus({

        loading: false,

        authenticated: true,

        configured: true,

        user_id: data.user_id,

        user_name: data.user_name,

        email: data.email,

        broker: data.broker || 'UPSTOX',

        expires_at: data.expires_at,

        message: data.message

      })

      setDirectToken('')

      setUpdateTokenInput('')

      setShowUpdateModal(false)

      setSuccessMessage(data.message || `Connected to Upstox successfully as ${data.user_name || data.user_id}!`); addToast(`Connected to Upstox as ${data.user_name || data.user_id}!`, 'success')

      fetchResults()

  
    } catch (err) {

      setErrorMessage(err.message)

    } finally {

      setIsSubmittingToken(false)

    }

  }

  // Disconnect Upstox Session

  const handleLogout = async () => {

    try {

      await authFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' })

    } catch (err) {

      console.warn('Logout error:', err)

    } finally {

      setStoredSessionId(null)

      setAuthStatus({

        loading: false,

        authenticated: false,

        configured: true,

        user_id: null,

        user_name: null,

        message: 'Logged out successfully.'

      })

      setResults([])

    }

  }

  const navigateToAlgoSignals = (symbol) => {

    setAlgoSymbol(symbol)

    setActiveApp('algo_signals')

  }

  // Filter and Sort Results (App 1: NIFTY 500 Stocks Universe)

  const filteredAndSortedResults = useMemo(() => {

    let list = [...results]

    // Universe / Index Filter

    if (selectedUniverse === 'NIFTY50') {

      list = list.filter(r => r.is_nifty50)

    } else if (selectedUniverse === 'NIFTY100') {

      list = list.filter(r => r.is_nifty100 || r.is_nifty50)

    } else if (selectedUniverse === 'NIFTY200') {

      list = list.filter(r => r.is_nifty200 || r.is_nifty100 || r.is_nifty50)

    } else if (selectedUniverse === 'MIDCAP') {

      list = list.filter(r => r.is_midcap)

    } else if (selectedUniverse === 'MOST_ACTIVE') {

      list = list.filter(r => (r.Rank || r['Activity Rank'] || 0) <= 50)

    }

    if (searchQuery.trim()) {

      const q = searchQuery.toLowerCase().trim()

      list = list.filter(r =>

        (r.Symbol || '').toLowerCase().includes(q) ||

        (r.Company || '').toLowerCase().includes(q) ||

        (r.Industry || '').toLowerCase().includes(q)

      )

    }

    // Signal Filter (ALL, BUY, SELL, CONFIRMED, WATCH, HIGH_VOL, HIGH_MOMENTUM, MOST_ACTIVE)

    if (signalFilter === 'BUY') {

      list = list.filter(r => (r.Status === 'BUY' || r['Signal Type'] === 'BUY' || r['Signal Type'] === 'BULLISH'))

    } else if (signalFilter === 'SELL') {

      list = list.filter(r => (r.Status === 'SELL' || r['Signal Type'] === 'SELL' || r['Signal Type'] === 'BEARISH'))

    } else if (signalFilter === 'CONFIRMED') {

      list = list.filter(r => (r['Is Confirmed'] === true || r.Status === 'BUY' || r.Status === 'SELL'))

    } else if (signalFilter === 'HIGH_VOL') {

      list = list.filter(r => (r['ATR Pct'] ?? 0) >= 1.4 || r['Volatility State'] === 'HIGH_EXPANSION')

    } else if (signalFilter === 'HIGH_MOMENTUM') {

      list = list.filter(r => (r['Relative Volume'] ?? r.rel_volume ?? 1) >= 1.5 && (r.Close >= (r.VWAP || 0)))

    } else if (signalFilter === 'MOST_ACTIVE') {

      list = list.filter(r => (r['Traded Value Cr'] || 0) >= 10.0 || (r.Rank || r['Activity Rank'] || 0) <= 50)

    } else if (signalFilter === 'WATCH') {

      list = list.filter(r => r.Status === 'WATCH' || (r['Is Confirmed'] !== true && r.Status !== 'BUY' && r.Status !== 'SELL'))

    }

    // Activity Rank Filter (Top 10, 25, 50, 100, 200, 500)

    if (activityRankFilter && activityRankFilter < 500) {

      list = list.filter(r => (r.Rank || r['Activity Rank'] || 0) <= activityRankFilter)

    }

    // Change Filter (ALL, GAINERS, LOSERS)

    if (changeFilter === 'GAINERS') {

      list = list.filter(r => (r['Percentage Change'] ?? r.change_pct ?? 0) > 0)

    } else if (changeFilter === 'LOSERS') {

      list = list.filter(r => (r['Percentage Change'] ?? r.change_pct ?? 0) < 0)

    }

    // Min Score Filter

    if (minScoreFilter > 0) {

      list = list.filter(r => (r['Signal Score'] ?? r.signal_score ?? 0) >= minScoreFilter)

    }

    // Sort

    list.sort((a, b) => {

      let valA = a[sortField] ?? a[sortField.toLowerCase().replace(/ /g, '_')]

      let valB = b[sortField] ?? b[sortField.toLowerCase().replace(/ /g, '_')]

      if (sortField === 'Activity Rank' || sortField === 'Rank') {

        valA = a.Rank ?? a['Activity Rank'] ?? 999

        valB = b.Rank ?? b['Activity Rank'] ?? 999

      } else if (sortField === 'Percentage Change') {

        valA = a['Percentage Change'] ?? a.change_pct ?? 0

        valB = b['Percentage Change'] ?? b.change_pct ?? 0

      } else if (sortField === 'Traded Value' || sortField === 'Traded Value Cr') {

        valA = a['Traded Value Cr'] ?? ((a['Traded Value'] ?? a.traded_value ?? 0) / 1e7)

        valB = b['Traded Value Cr'] ?? ((b['Traded Value'] ?? b.traded_value ?? 0) / 1e7)

      } else if (sortField === 'Relative Volume') {

        valA = a['Relative Volume'] ?? a.rel_volume ?? 0

        valB = b['Relative Volume'] ?? b.rel_volume ?? 0

      } else if (sortField === 'Signal Score') {

        valA = a['Signal Score'] ?? a.signal_score ?? 0

        valB = b['Signal Score'] ?? b.signal_score ?? 0

      }

      if (typeof valA === 'string') {

        const comp = valA.localeCompare(valB)

        return sortDirection === 'asc' ? comp : -comp

      } else {

        const comp = (valA ?? 0) - (valB ?? 0)

        return sortDirection === 'asc' ? comp : -comp

      }

    })

    return list

  }, [results, selectedUniverse, searchQuery, signalFilter, activityRankFilter, changeFilter, minScoreFilter, sortField, sortDirection])

  // Reset page when filter inputs change

  useEffect(() => {

    setCurrentPage(1)

  }, [searchQuery, signalFilter, selectedUniverse, activityRankFilter, changeFilter, minScoreFilter, pageSize])

  // Pagination calculation for high performance rendering of up to 501 rows

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedResults.length / pageSize))

  const paginatedResults = useMemo(() => {

    if (pageSize >= 500) return filteredAndSortedResults

    const start = (currentPage - 1) * pageSize

    return filteredAndSortedResults.slice(start, start + pageSize)

  }, [filteredAndSortedResults, currentPage, pageSize])

  const handleSort = (field) => {

    if (sortField === field) {

      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))

    } else {

      setSortField(field)

      setSortDirection(field === 'Activity Rank' || field === 'Rank' ? 'asc' : 'desc')

    }

  }

  // Export CSV

  const handleExportCSV = () => {

    if (!filteredAndSortedResults.length) return

    const headers = [

      'Rank', 'Symbol', 'Company', 'LTP', 'Percentage Change %',

      'Cumulative Volume', 'Traded Value (Cr)', 'SMA 6', 'SMA 30',

      'Relative Volume', 'Status', 'Signal Score', 'Is Confirmed',

      'Candle Timestamp', 'Freshness', 'Confirmation Notes'

    ]

    const csvRows = [headers.join(',')]

    for (const r of filteredAndSortedResults) {

      const crVal = parseFloat(r['Traded Value Cr'] ?? ((r['Traded Value'] ?? r.traded_value ?? 0) / 1e7)).toFixed(2)

      csvRows.push([

        r.Rank ?? r['Activity Rank'] ?? '',

        `"${r.Symbol || ''}"`,

        `"${(r.Company || '').replace(/"/g, '""')}"`,

        r.Close ?? r.ltp ?? '',

        r['Percentage Change'] ?? r.change_pct ?? 0,

        r['Cumulative Volume'] ?? r.cumulative_volume ?? 0,

        crVal,

        r['SMA 6'] ?? '',

        r['SMA 30'] ?? '',

        r['Relative Volume'] ?? r.rel_volume ?? '',

        `"${r.Status || 'WATCH'}"`,

        r['Signal Score'] ?? r.signal_score ?? 0,

        r['Is Confirmed'] ?? r.is_confirmed ?? false,

        `"${r['Candle Timestamp'] ?? r.candle_timestamp ?? ''}"`,

        `"${r.Freshness ?? r.freshness ?? ''}"`,

        `"${(r['Confirmation Notes'] ?? r.confirmation_notes ?? '').replace(/"/g, '""')}"`

      ].join(','))

    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })

    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')

    link.href = url

    link.setAttribute('download', `nse_most_active_sma_scan_${new Date().toISOString().slice(0, 10)}.csv`)

    document.body.appendChild(link)

    link.click()

    document.body.removeChild(link)

  }

  // Count summaries for Most Active Stocks & Confirmed Alerts

  const buyConfirmedCount = useMemo(() => confirmedBuys.length, [confirmedBuys])

  const sellConfirmedCount = useMemo(() => confirmedSells.length, [confirmedSells])

  const watchCount = useMemo(() => results.filter(r => r.Status === 'WATCH' || (!r['Is Confirmed'] && !r.is_confirmed)).length, [results])

  const totalActiveCount = useMemo(() => results.length, [results])

  // Progress Calculation

  const progressPercent = scanStatus.total_stocks > 0

    ? Math.min(100, Math.round((scanStatus.stocks_scanned / scanStatus.total_stocks) * 100))

    : scanStatus.is_running ? 20 : 100

  return (

    <div className="app-container">

      {/* ===================================================================== */}

      {/* TOP NAVIGATION BAR                                                    */}

      {/* ===================================================================== */}

      <header className="app-header glass-panel">

        <div className="specular-edge" />

        <div className="brand-section">

          <div className="brand-icon-box">

            <Zap size={20} />

          </div>

          <div className="brand-title-wrap">
            <span className="brand-title">High-Momentum Volatility Scanner (HMV-Alpha)</span>
            <span className="brand-version-chip">SMC INSTITUTIONAL LIVE</span>
          </div>

        </div>

        {/* Market Status Strip */}

        <div className="market-ticker-strip">

          <div className="market-status-badge">

            <span className="pulse-beacon" style={{ backgroundColor: marketOverview?.market_session?.is_open ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }} />

            <span style={{ color: marketOverview?.market_session?.is_open ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>

              {marketOverview?.market_session?.phase || 'NSE MARKET'}

            </span>

            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>

              {marketOverview?.market_session?.current_time_ist || '09:15 - 15:30 IST'}

            </span>

          </div>

        </div>

        {/* Header Actions */}

        <div className="header-actions">

          {authStatus.authenticated ? (

            <>

              <div className="gateway-status-pill">

                <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />

                <span style={{ color: 'var(--bullish-text)', fontWeight: 600 }}>Upstox Connected</span>

                {authStatus.user_name && (

                  <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '8px' }}>

                    {authStatus.user_name}

                  </span>

                )}

              </div>

              <button

                id="btn-update-token"

                className="btn btn-secondary"

                onClick={() => setShowUpdateModal(true)}

                title="Update daily Upstox access token"

                style={{ padding: '7px 12px', fontSize: '0.78rem' }}

              >

                <Key size={14} style={{ color: 'var(--accent-cyan)' }} />

                <span>Update Token</span>

              </button>

              <button

                id="btn-logout"

                className="btn btn-danger"

                onClick={handleLogout}

                title="Disconnect Upstox session"

                style={{ padding: '7px 12px', fontSize: '0.78rem' }}

              >

                <LogOut size={14} />

                <span>Disconnect</span>

              </button>

            </>

          ) : (

            <>

              <div className="gateway-status-pill">

                <span className="pulse-beacon" style={{ backgroundColor: 'var(--accent-cyan)' }} />

                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>Live Market Feed (NIFTY 500)</span>

              </div>

              <button

                id="btn-connect-token-header"

                className="btn btn-primary"

                onClick={() => setShowUpdateModal(true)}

                title="Connect Upstox Daily Access Token"

                style={{ padding: '7px 14px', fontSize: '0.78rem', gap: '6px' }}

              >

                <Key size={14} />

                <span>Connect Upstox Token</span>

              </button>

            </>

          )}

        </div>

      </header>

      {/* 4-App Integrated Algorithmic Trading Workflow */}

      <nav className="app-mode-nav">
        <button
          className={`app-mode-btn ${activeApp === 'scanner' ? 'active' : ''}`}
          onClick={() => setActiveApp('scanner')}
        >
          <Zap size={16} />
          <span>⚡ 1️⃣ High-Momentum Volatility Scanner (HMV-Alpha)</span>
          <span className="app-mode-badge bullish">{results.length || 501} Stocks</span>
        </button>

        <button
          className={`app-mode-btn ${activeApp === 'smc_engine' ? 'active' : ''}`}
          onClick={() => setActiveApp('smc_engine')}
        >
          <Sparkles size={16} />
          <span>🏛️ 2️⃣ SMC-NSE Engine</span>
          <span className="app-mode-badge cyan">1:3 & 1:5 SMC</span>
        </button>

        <button
          className={`app-mode-btn ${activeApp === 'algo_signals' ? 'active' : ''}`}
          onClick={() => {
            const sym = algoSymbol || confirmedBuys[0]?.Symbol || results[0]?.Symbol || 'RELIANCE'
            setAlgoSymbol(sym)
            setActiveApp('algo_signals')
          }}
        >
          <Activity size={16} />
          <span>🤖 3️⃣ Intraday Signal & Order Slip</span>
          <span className="app-mode-badge gold">Execution Ticket</span>
        </button>
      </nav>

      {/* Notifications */}

      {successMessage && (

        <div className="alert-box alert-success">

          <CheckCircle2 size={18} />

          <span style={{ flex: 1 }}>{successMessage}</span>

          <button

            onClick={() => setSuccessMessage(null)}

            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}

          >

            ×

          </button>

        </div>

      )}

      {errorMessage && (

        <div className="alert-box alert-danger">

          <AlertCircle size={18} />

          <span style={{ flex: 1 }}>{errorMessage}</span>

          <button

            onClick={() => setErrorMessage(null)}

            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}

          >

            ×

          </button>

        </div>

      )}

      {/* ========================================================================= */}

      {/* APP 1: SMA TECHNICAL SCANNER                                              */}

      {/* ========================================================================= */}

      {activeApp === 'scanner' && (

        <>

          {/* Real Daily Access Token Login Prompt Banner (if not authenticated) */}

          {!authStatus.authenticated && (

            <div className="login-prompt-banner glass-panel" style={{

              margin: '0 0 16px',

              padding: '14px 20px',

              borderRadius: 'var(--radius-md)',

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'space-between',

              gap: '16px',

              border: '1px solid rgba(0, 210, 255, 0.3)',

              background: 'linear-gradient(90deg, rgba(0, 210, 255, 0.08) 0%, rgba(13, 17, 23, 0.95) 100%)',

              flexWrap: 'wrap'

            }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                <div style={{

                  width: '34px',

                  height: '34px',

                  borderRadius: '8px',

                  background: 'rgba(0, 210, 255, 0.15)',

                  border: '1px solid rgba(0, 210, 255, 0.4)',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center',

                  color: 'var(--accent-cyan)'

                }}>

                  <Key size={18} />

                </div>

                <div>

                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>

                    Upstox Daily API Access Token Authentication

                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>

                    Enter your official Upstox token for high-speed streaming and live trading, or continue with the Free Real-Time Market Feed for all 200 NIFTY equities.

                  </div>

                </div>

              </div>

              <div style={{ display: 'flex', gap: '10px' }}>

                <button

                  className="btn btn-primary"

                  onClick={() => setShowUpdateModal(true)}

                  style={{ padding: '8px 18px', fontSize: '0.82rem', gap: '6px' }}

                >

                  <Key size={14} />

                  <span>Enter Access Token</span>

                </button>

                <a

                  href="https://developer.upstox.com/"

                  target="_blank"

                  rel="noopener noreferrer"

                  className="btn btn-secondary"

                  style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '4px' }}

                >

                  <span>Developer Portal</span>

                  <ExternalLink size={12} />

                </a>

              </div>

            </div>

          )}

          {/* ================================================================= */}

          {/* 1. MARKET OVERVIEW & TELEMETRY HERO BANNER                        */}

          {/* ================================================================= */}

                    {/* ================================================================= */}
          {/* 0. STRATEGY COMMAND & NSE SESSION TELEMETRY                      */}
          {/* ================================================================= */}
          <section className="market-session-hero glass-panel" style={{ flexDirection: "column", gap: "14px", alignItems: "stretch" }}>
<div className="session-status-banner">

              <div className="session-status-left">

                <span className={`pulse-beacon ${marketOverview?.market_session?.is_open ? 'pulse-green' : 'pulse-amber'}`} />

                <span className="session-badge-text">

                  NSE SESSION: {marketOverview?.market_session?.session || (marketOverview?.market_session?.is_open ? 'REGULAR MARKET OPEN' : 'MARKET CLOSED')}

                </span>

                <span className="session-clock font-mono">

                  {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST

                </span>

              </div>

              <div className="session-status-right">

                <span className="status-label-chip">

                  <span className="pulse-beacon" style={{ backgroundColor: authStatus.authenticated ? 'var(--bullish-neon)' : 'var(--accent-cyan)' }} />

                  {authStatus.authenticated ? 'Upstox API v3 Live Active' : 'Real-Time Dynamic Active Discovery'}

                </span>

                <span className="safety-guarantee-pill">

                  <Shield size={12} />

                  <span>ALERT-ONLY • ZERO ORDER PLACEMENT</span>

                </span>

              </div>

            </div>

{/* Live IST Market Milestones Timeline (trader-alerts) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', padding: '6px 12px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div className="ist-session-timeline">
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginRight: '4px' }}>IST Phases:</span>
                {[
                  { time: '09:00', label: 'Pre-Market', phase: 'AUCTION' },
                  { time: '09:15', label: 'ORH/ORL Range', phase: 'OPENING' },
                  { time: '09:45-11:30', label: 'Session 1: Morning Liquidity', phase: 'SESSION_1' },
                  { time: '11:30-13:30', label: 'Mid-Day Lull (Chop)', phase: 'LULL' },
                  { time: '13:30-15:00', label: 'Session 2: Afternoon Expansion', phase: 'SESSION_2' },
                  { time: '15:15', label: 'MIS Square-Off', phase: 'SQUARE_OFF' }
                ].map((step, idx) => {
                  const currentPhase = getISTSessionPhase().status
                  const isActive = currentPhase === step.phase
                  return (
                    <div
                      key={idx}
                      className={`ist-timeline-step ${isActive ? 'active' : ''} ${step.phase === 'LULL' ? 'lull' : ''} ${step.phase === 'SQUARE_OFF' ? 'cutoff' : ''}`}
                      title={step.label}
                    >
                      <span>{step.time}</span>
                      <span>{step.label}</span>
                      {isActive && <span className="pulse-beacon pulse-green" style={{ width: '6px', height: '6px' }} />}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`risk-gate-badge ${getISTSessionPhase().canEnter ? 'risk-gate-pass' : 'risk-gate-warn'}`}>
                  {getISTSessionPhase().canEnter ? '🟢 ENTRIES PERMITTED' : '🟡 AVOID NEW ENTRIES'}
                </span>
              </div>
            </div>

{/* Quick Action Control Bar */}

            <div className="session-action-bar">

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

                {/* Top Timeframe Selector */}
                <div className="timeframe-selector-bar" title="Select Completed Candle Timeframe (5m, 10m, 15m)">
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginRight: '4px', textTransform: 'uppercase' }}>TF:</span>
                  {['5m', '10m', '15m'].map((tf) => (
                    <button
                      key={tf}
                      className={`timeframe-pill-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTimeframe(tf)
                        addToast(`Timeframe set to ${tf}. Click Scan to analyze.`, 'info')
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* Top Universe Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(5, 14, 26, 0.6)', padding: '2px 5px', borderRadius: '6px', border: '1px solid var(--border-medium)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginRight: '2px', textTransform: 'uppercase' }}>Scope:</span>
                  {[
                    { id: 'MOST_ACTIVE', label: 'Top 50 Active' },
                    { id: 'NIFTY50', label: 'Nifty 50' },
                    { id: 'ALL', label: 'NIFTY 500' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`timeframe-pill-btn ${selectedUniverse === opt.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedUniverse(opt.id)
                        setCurrentPage(1)
                      }}
                      style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button

                  id="btn-run-scanner"

                  className="btn btn-primary"

                  onClick={() => handleRunScanner(selectedUniverse)}

                  disabled={scanStatus.is_running}

                  style={{ padding: '8px 20px', fontSize: '0.85rem' }}

                >

                  {scanStatus.is_running ? (

                    <>

                      <RotateCw className="animate-spin" size={15} />

                      <span>Scanning NIFTY {selectedUniverse === 'ALL' ? '500' : selectedUniverse}...</span>

                    </>

                  ) : (

                    <>

                      <Play size={15} fill="currentColor" />

                      <span>⚡ Scan NIFTY {selectedUniverse === 'ALL' ? '500' : selectedUniverse} Intraday</span>

                    </>

                  )}

                </button>

                {scanStatus.is_running && (

                  <button

                    id="btn-stop-scanner"

                    className="btn btn-danger"

                    onClick={handleStopScanner}

                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}

                  >

                    <Square size={14} fill="currentColor" />

                    <span>Stop</span>

                  </button>

                )}

                <button
                  id="btn-settings-modal"
                  className="btn btn-secondary"
                  onClick={() => setShowSettingsModal(true)}
                  style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '5px' }}
                  title="Configure Scanner and Risk Settings"
                >
                  <Sliders size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <span>Settings</span>
                </button>
                <button

                  id="btn-refresh-results"

                  className="btn btn-secondary"

                  onClick={fetchResults}

                  disabled={isRefreshing || scanStatus.is_running}

                  style={{ padding: '8px 14px', fontSize: '0.82rem' }}

                  title="Refresh latest scan results"

                >

                  <RotateCw className={isRefreshing ? 'animate-spin' : ''} size={14} />

                  <span>Refresh</span>

                </button>

                {/* Auto Refresh Dropdown */}

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>

                  <Clock size={13} />

                  <span>Cadence:</span>

                  <select

                    className="custom-select"

                    value={autoRefreshSecs}

                    onChange={(e) => setAutoRefreshSecs(Number(e.target.value))}

                    style={{

                      background: 'rgba(5, 14, 26, 0.8)',

                      color: 'var(--accent-cyan)',

                      border: '1px solid var(--border-medium)',

                      borderRadius: '4px',

                      padding: '4px 8px',

                      fontSize: '0.78rem',

                      fontFamily: 'var(--font-mono)'

                    }}

                  >

                    <option value={60}>Every 1 Min</option>

                    <option value={180}>Every 3 Mins</option>

                    <option value={300}>Every 5 Mins</option>

                    <option value={0}>Manual Only</option>

                  </select>

                </div>

              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

                <button

                  className="btn btn-secondary"

                  onClick={() => {

                    setShowBhavcopyModal(true)

                    loadBhavcopyResearch()

                  }}

                  style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '6px' }}

                  title="View Official NSE Bhavcopy Daily Turnover & ADV Baseline"

                >

                  <FileText size={14} style={{ color: 'var(--accent-cyan)' }} />

                  <span>NSE Bhavcopy Research</span>

                </button>

                <button

                  className="btn btn-secondary"

                  onClick={() => {

                    setShowBacktestModal(true)

                    if (!backtestData) runBacktest('RELIANCE', 15)

                  }}

                  style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '6px' }}

                  title="Backtest HMV-Alpha Strategy on Historical Intraday Candles"

                >

                  <Sliders size={14} style={{ color: '#fbbf24' }} />

                  <span>SMC Backtest</span>

                </button>

              </div>

            </div>
          </section>

{/* Scanner Progress Bar */}

          {scanStatus.is_running && (

            <section className="glass-panel progress-panel">

              <div className="progress-header">

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

                  <RotateCw className="animate-spin" size={16} style={{ color: 'var(--accent-cyan)' }} />

                  <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{scanStatus.progress_message}</span>

                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                  <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.9rem' }}>

                    {progressPercent}%

                  </span>

                  <button

                    className="btn btn-danger"

                    onClick={handleStopScanner}

                    style={{ padding: '4px 10px', fontSize: '0.74rem' }}

                  >

                    <Square size={12} fill="currentColor" />

                    <span>Stop</span>

                  </button>

                </div>

              </div>

              <div className="progress-bar-bg">

                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />

              </div>

            </section>

          )}

          {/* ================================================================= */}

          {/* 2. CONFIRMED BUY AND SELL ALERTS SECTION (RANKED BY SCORE)        */}

          {/* ================================================================= */}

          {/* ================================================================= */}
          {/* 2. HIGH-MOMENTUM VOLATILITY (HMV-ALPHA) BUY & SELL SHOWCASE      */}
          {/* ================================================================= */}
          
<section className="confirmed-alerts-container">
            <div className="confirmed-section-header">
              <div className="confirmed-title-box">
                <Zap size={20} style={{ color: 'var(--bullish-neon)' }} />
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>High-Momentum Volatility (HMV-Alpha) Active Signals</span>
                    <span className="brand-version-chip" style={{ fontSize: '0.65rem' }}>{selectedTimeframe} SMC</span>
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Liquidity Sweep • Structural BOS • 3-Candle FVG Retracement • Asymmetric 1:2 & 1:3 Targets • Strictly Alert-Only
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`filter-pill ${confirmedViewFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setConfirmedViewFilter('ALL')}
                  style={{ padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  All Signals ({confirmedBuys.length + confirmedSells.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${confirmedViewFilter === 'BUY' ? 'active bullish' : ''}`}
                  onClick={() => setConfirmedViewFilter('BUY')}
                  style={{ padding: '5px 12px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  🟢 BUY ({confirmedBuys.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${confirmedViewFilter === 'SELL' ? 'active bearish' : ''}`}
                  onClick={() => setConfirmedViewFilter('SELL')}
                  style={{ padding: '5px 12px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  🔴 SELL ({confirmedSells.length})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${confirmedViewFilter === 'HIGH_CONFLUENCE' ? 'active' : ''}`}
                  onClick={() => setConfirmedViewFilter('HIGH_CONFLUENCE')}
                  style={{ padding: '5px 12px', fontSize: '0.78rem', color: '#fbbf24', cursor: 'pointer' }}
                >
                  ⭐ Score ≥ 85
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
              {/* Confirmed BUY Column */}
              {(confirmedViewFilter === 'ALL' || confirmedViewFilter === 'BUY' || confirmedViewFilter === 'HIGH_CONFLUENCE') && (
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0, 245, 160, 0.2)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--bullish-text)', fontWeight: 800, fontSize: '0.9rem' }}>
                    <TrendingUp size={18} />
                    <span>RANKED CONFIRMED BUY SETUPS</span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--bullish-neon)' }}>
                    {confirmedBuys.length} Confirmed
                  </span>
                </div>

                {confirmedBuys.length === 0 ? (
                  <div className="empty-alerts-card">
                    <CheckCircle2 size={28} style={{ color: 'var(--text-faint)' }} />
                    <div style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: 600 }}>No Confirmed BUY Signals on Current {selectedTimeframe} Bar</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.45 }}>
                      Waiting for Completed Candle: Sweep of Swing Low + Bullish BOS above Swing High + Bullish FVG Retracement + Volume ≥ 1.5x.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {confirmedBuys.filter(b => confirmedViewFilter !== 'HIGH_CONFLUENCE' || Number(b.Score ?? b['Signal Score'] ?? 0) >= 85).map((alert, idx) => {
                      const score = Number(alert.Score ?? alert['Signal Score'] ?? 0)
                      const entryVal = Number(alert.Entry ?? alert.Close ?? alert.ltp ?? 0)
                      const slVal = Number(alert['Stop-Loss'] ?? alert['Stop Loss'] ?? 0)
                      const t1Val = Number(alert['Target 1'] ?? 0)
                      const t2Val = Number(alert['Target 2'] ?? 0)
                      const fvgZone = alert['FVG Zone'] ?? (alert['FVG Low'] ? `₹${alert['FVG Low']} - ₹${alert['FVG High']}` : '—')
                      const sweepText = alert.Sweep ?? alert['Sweep Type'] ?? 'None'
                      const bosText = alert.BOS ?? 'None'

                      return (
                        <div key={alert.Symbol} className="alert-card-confirmed alert-card-buy">
                          <div className="alert-card-top">
                            <div className="alert-symbol-row">
                              <span className="alert-rank-tag">#{String(idx + 1).padStart(2, '0')}</span>
                              <div>
                                <span className="alert-symbol-text">{alert.Symbol}</span>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{alert.Company}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span className="alert-badge alert-badge-buy">CONFIRMED BUY</span>
                              <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                                ₹{entryVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>

                          {/* Score Meter */}
                          <div className="alert-score-container">
                            <div className="alert-score-header">
                              <span>Confluence Score: {score >= 85 ? 'High-Confluence Setup' : 'Valid Setup'}</span>
                              <span className="alert-score-val font-mono" style={{ color: 'var(--bullish-text)' }}>
                                {score.toFixed(1)} / 100
                              </span>
                            </div>
                            <div className="score-meter-track">
                              <div
                                className="score-meter-fill"
                                style={{
                                  width: `${Math.min(100, score)}%`,
                                  background: 'linear-gradient(90deg, #10b981 0%, #00f5a0 100%)'
                                }}
                              />
                            </div>
                          </div>

                          {/* Execution Plan Grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', background: 'rgba(0, 0, 0, 0.25)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ENTRY</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: '#ffffff' }}>₹{entryVal.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>STOP LOSS</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--bearish-text)' }}>₹{slVal.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TARGET 1 (1:2)</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--bullish-text)' }}>₹{t1Val.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TARGET 2 (1:3)</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>₹{t2Val.toFixed(2)}</div>
                            </div>
                          </div>

                          {/* SMC Breakdown Box */}
                          <div className="confirmation-breakdown-box">
                            <div style={{ fontWeight: 700, color: 'var(--bullish-text)', marginBottom: '3px' }}>
                              ✓ Institutional Confluence Validated:
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div>• <strong>Sweep:</strong> {sweepText}</div>
                              <div>• <strong>BOS:</strong> {bosText}</div>
                              <div>• <strong>FVG Zone:</strong> {fvgZone}</div>
                              <div>• <strong>Volume Ratio:</strong> {Number(alert['Volume Ratio'] ?? alert['Relative Volume'] ?? 1.5).toFixed(2)}x baseline</div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => openPositionCalculator(alert)}
                              style={{ padding: '5px 12px', fontSize: '0.76rem', gap: '4px', background: 'linear-gradient(135deg, rgba(0,245,160,0.3), rgba(0,210,255,0.3))', borderColor: 'var(--bullish-neon)' }}
                              title="Calculate whole share quantities & MIS margin"
                            >
                              <span>🧮 1-Click Size</span>
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => openBrokerTicketModal(alert)}
                              style={{ padding: '5px 10px', fontSize: '0.74rem', gap: '4px', color: 'var(--accent-cyan)', borderColor: 'rgba(0, 210, 255, 0.4)' }}
                              title="Open ready-to-execute broker order ticket (Zerodha, Upstox, Angel, Groww)"
                            >
                              <span>📋 Broker Slip</span>
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setSelectedStock(alert)}
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            >
                              <span>Inspect</span>
                            </button>
                            <a
                              href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(alert.Symbol)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            >
                              <ExternalLink size={12} />
                              <span>Chart</span>
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>)}

              {/* Confirmed SELL Column */}
              {(confirmedViewFilter === 'ALL' || confirmedViewFilter === 'SELL' || confirmedViewFilter === 'HIGH_CONFLUENCE') && (
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 51, 102, 0.2)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--bearish-text)', fontWeight: 800, fontSize: '0.9rem' }}>
                    <TrendingDown size={18} />
                    <span>RANKED CONFIRMED SELL SETUPS</span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--bearish-neon)' }}>
                    {confirmedSells.length} Confirmed
                  </span>
                </div>

                {confirmedSells.length === 0 ? (
                  <div className="empty-alerts-card">
                    <CheckCircle2 size={28} style={{ color: 'var(--text-faint)' }} />
                    <div style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: 600 }}>No Confirmed SELL Signals on Current {selectedTimeframe} Bar</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: 1.45 }}>
                      Waiting for Completed Candle: Sweep of Swing High + Bearish BOS below Swing Low + Bearish FVG Retracement + Volume ≥ 1.5x.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {confirmedSells.filter(s => confirmedViewFilter !== 'HIGH_CONFLUENCE' || Number(s.Score ?? s['Signal Score'] ?? 0) >= 85).map((alert, idx) => {
                      const score = Number(alert.Score ?? alert['Signal Score'] ?? 0)
                      const entryVal = Number(alert.Entry ?? alert.Close ?? alert.ltp ?? 0)
                      const slVal = Number(alert['Stop-Loss'] ?? alert['Stop Loss'] ?? 0)
                      const t1Val = Number(alert['Target 1'] ?? 0)
                      const t2Val = Number(alert['Target 2'] ?? 0)
                      const fvgZone = alert['FVG Zone'] ?? (alert['FVG Low'] ? `₹${alert['FVG Low']} - ₹${alert['FVG High']}` : '—')
                      const sweepText = alert.Sweep ?? alert['Sweep Type'] ?? 'None'
                      const bosText = alert.BOS ?? 'None'

                      return (
                        <div key={alert.Symbol} className="alert-card-confirmed alert-card-sell">
                          <div className="alert-card-top">
                            <div className="alert-symbol-row">
                              <span className="alert-rank-tag">#{String(idx + 1).padStart(2, '0')}</span>
                              <div>
                                <span className="alert-symbol-text">{alert.Symbol}</span>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{alert.Company}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span className="alert-badge alert-badge-sell">CONFIRMED SELL</span>
                              <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                                ₹{entryVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>

                          {/* Score Meter */}
                          <div className="alert-score-container">
                            <div className="alert-score-header">
                              <span>Confluence Score: {score >= 85 ? 'High-Confluence Setup' : 'Valid Setup'}</span>
                              <span className="alert-score-val font-mono" style={{ color: 'var(--bearish-text)' }}>
                                {score.toFixed(1)} / 100
                              </span>
                            </div>
                            <div className="score-meter-track">
                              <div
                                className="score-meter-fill"
                                style={{
                                  width: `${Math.min(100, score)}%`,
                                  background: 'linear-gradient(90deg, #ef4444 0%, #ff3366 100%)'
                                }}
                              />
                            </div>
                          </div>

                          {/* Execution Plan Grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', background: 'rgba(0, 0, 0, 0.25)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ENTRY</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: '#ffffff' }}>₹{entryVal.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>STOP LOSS</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--bullish-text)' }}>₹{slVal.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TARGET 1 (1:2)</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--bearish-text)' }}>₹{t1Val.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TARGET 2 (1:3)</div>
                              <div className="font-mono" style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>₹{t2Val.toFixed(2)}</div>
                            </div>
                          </div>

                          {/* SMC Breakdown Box */}
                          <div className="confirmation-breakdown-box">
                            <div style={{ fontWeight: 700, color: 'var(--bearish-text)', marginBottom: '3px' }}>
                              ✓ Institutional Confluence Validated:
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div>• <strong>Sweep:</strong> {sweepText}</div>
                              <div>• <strong>BOS:</strong> {bosText}</div>
                              <div>• <strong>FVG Zone:</strong> {fvgZone}</div>
                              <div>• <strong>Volume Ratio:</strong> {Number(alert['Volume Ratio'] ?? alert['Relative Volume'] ?? 1.5).toFixed(2)}x baseline</div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => openPositionCalculator(alert)}
                              style={{ padding: '5px 12px', fontSize: '0.76rem', gap: '4px', background: 'linear-gradient(135deg, rgba(255,51,102,0.3), rgba(0,210,255,0.3))', borderColor: 'var(--bearish-neon)' }}
                              title="Calculate whole share quantities & MIS margin"
                            >
                              <span>🧮 1-Click Size</span>
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => openBrokerTicketModal(alert)}
                              style={{ padding: '5px 10px', fontSize: '0.74rem', gap: '4px', color: 'var(--accent-cyan)', borderColor: 'rgba(0, 210, 255, 0.4)' }}
                              title="Open ready-to-execute broker order ticket (Zerodha, Upstox, Angel, Groww)"
                            >
                              <span>📋 Broker Slip</span>
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setSelectedStock(alert)}
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            >
                              <span>Inspect</span>
                            </button>
                            <a
                              href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(alert.Symbol)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                            >
                              <ExternalLink size={12} />
                              <span>Chart</span>
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              )}
            </div>
          </section>

          {/* ================================================================= */}
          {/* 2. MARKET OVERVIEW & TELEMETRY KPIS                             */}
          {/* ================================================================= */}
          <section className="overview-kpi-grid glass-panel" style={{ padding: "16px 20px", borderRadius: "var(--radius-md)" }}>
{/* Overview KPI Cards */}

            <div className="overview-kpi-grid">

              {/* KPI 1: Universe Checked */}

              <div className="overview-kpi-card">

                <div className="kpi-label">

                  <span>NIFTY 500 UNIVERSE</span>

                  <Layers size={14} className="text-muted" />

                </div>

                <div className="kpi-val-row">

                  <span className="kpi-val font-mono">501</span>

                  <span className="kpi-sub">Constituents</span>

                </div>

                <div className="kpi-footer">

                  <span>Official NSE Equities Master • SMC Intraday Horizon</span>

                </div>

              </div>

              {/* KPI 2: Intraday Active Scope */}

              <div className="overview-kpi-card">

                <div className="kpi-label">

                  <span>INTRADAY SCAN SCOPE</span>

                  <Activity size={14} style={{ color: 'var(--accent-cyan)' }} />

                </div>

                <div className="kpi-val-row">

                  <span className="kpi-val font-mono" style={{ color: 'var(--accent-cyan)' }}>

                    {filteredAndSortedResults.length}

                  </span>

                  <span className="kpi-sub">{selectedUniverse === 'ALL' ? 'NIFTY 500' : selectedUniverse}</span>

                </div>

                <div className="kpi-footer">

                  <span>Completed Candle Signals</span>

                </div>

              </div>

              {/* KPI 3: Confirmed BUY Alerts */}

              <div className="overview-kpi-card glow-bullish">

                <div className="kpi-label" style={{ color: 'var(--bullish-text)' }}>

                  <span>CONFIRMED BUY ALERTS</span>

                  <TrendingUp size={14} />

                </div>

                <div className="kpi-val-row">

                  <span className="kpi-val font-mono" style={{ color: 'var(--bullish-text)' }}>

                    {buyConfirmedCount}

                  </span>

                  <span className="kpi-sub" style={{ color: 'var(--bullish-neon)' }}>Sweep + BOS + FVG</span>

                </div>

                <div className="kpi-footer">

                  <span style={{ color: 'var(--bullish-text)' }}>Bullish Sweep • BOS • FVG Retrace</span>

                </div>

              </div>

              {/* KPI 4: Confirmed SELL Alerts */}

              <div className="overview-kpi-card glow-bearish">

                <div className="kpi-label" style={{ color: 'var(--bearish-text)' }}>

                  <span>CONFIRMED SELL ALERTS</span>

                  <TrendingDown size={14} />

                </div>

                <div className="kpi-val-row">

                  <span className="kpi-val font-mono" style={{ color: 'var(--bearish-text)' }}>

                    {sellConfirmedCount}

                  </span>

                  <span className="kpi-sub" style={{ color: 'var(--bearish-neon)' }}>Sweep + BOS + FVG</span>

                </div>

                <div className="kpi-footer">

                  <span style={{ color: 'var(--bearish-text)' }}>Bearish Sweep • BOS • FVG Retrace</span>

                </div>

              </div>

              {/* KPI 5: NIFTY 50 Benchmark */}

              <div className="overview-kpi-card">

                <div className="kpi-label">

                  <span>NIFTY 50 BENCHMARK</span>

                  <BarChart3 size={14} className="text-muted" />

                </div>

                <div className="kpi-val-row">

                  <span className="kpi-val font-mono">

                    {marketOverview?.nifty_50?.ltp ? `₹${marketOverview.nifty_50.ltp.toLocaleString('en-IN')}` : '24,350.00'}

                  </span>

                  <span

                    className="kpi-sub font-mono"

                    style={{

                      color: (marketOverview?.nifty_50?.change_pct ?? 0) >= 0 ? 'var(--bullish-text)' : 'var(--bearish-text)',

                      fontWeight: 700

                    }}

                  >

                    {((marketOverview?.nifty_50?.change_pct ?? 0) >= 0 ? '+' : '') + (marketOverview?.nifty_50?.change_pct ?? 0.35).toFixed(2)}%

                  </span>

                </div>

                <div className="kpi-footer">

                  <span>Last Updated: {lastScanTime ? lastScanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Ready'}</span>

                </div>

              </div>

            </div>
          </section>



          {/* 3. NIFTY 500 INTRADAY STOCKS SCANNER (UP TO 501 CONSTITUENTS)     */}

          {/* ================================================================= */}

          <section className="table-surface-card glass-panel">

            <div className="table-header-strip">

              <div className="table-header-strip-title">

                <Zap size={15} style={{ color: 'var(--bullish-neon)' }} />

                <span>INSTITUTIONAL HIGH-MOMENTUM & VOLATILITY SCANNER (HMV-ALPHA)</span>

                <span style={{ color: 'var(--border-medium)' }}>•</span>

                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>MOST ACTIVE & HIGH ATR VOLATILITY BREAKOUTS • VWAP & SMC ANCHOR</span>

              </div>

              <div className="font-mono" style={{ color: 'var(--text-faint)', fontSize: '0.76rem' }}>

                Showing {filteredAndSortedResults.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredAndSortedResults.length)} of {filteredAndSortedResults.length} equities (Universe: {selectedUniverse})

              </div>

            </div>

            {/* Universe Selector Pills Strip */}

            <div className="universe-selector-bar" style={{ margin: '8px 14px 2px' }}>

              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>

                Universe:

              </span>

              {UNIVERSE_OPTIONS.map(opt => (

                <button

                  key={opt.id}

                  className={`universe-tab-pill ${selectedUniverse === opt.id ? 'active' : ''}`}

                  onClick={() => {

                    setSelectedUniverse(opt.id)

                    setCurrentPage(1)

                  }}

                  title={`Filter or scan ${opt.label} (${opt.sub})`}

                >

                  <span>{opt.label}</span>

                  <span className="universe-count-chip">{opt.count}</span>

                </button>

              ))}

            </div>

            {/* Filter and Search Bar */}

            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>

                {/* Search Box */}

                <div className="search-box" style={{ maxWidth: '280px' }}>

                  <Search className="search-icon" size={15} />

                  <input

                    type="text"

                    className="search-input"

                    placeholder="Search stock or sector..."

                    value={searchQuery}

                    onChange={(e) => setSearchQuery(e.target.value)}

                  />

                </div>

                {/* Signal Filter Pills */}

                <div className="filter-pills" style={{ flexWrap: 'nowrap' }}>

                  <button

                    className={`filter-pill ${signalFilter === 'ALL' ? 'active' : ''}`}

                    onClick={() => setSignalFilter('ALL')}

                  >

                    All ({totalActiveCount})

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'CONFIRMED' ? 'active' : ''}`}

                    onClick={() => setSignalFilter('CONFIRMED')}

                    style={{ color: 'var(--accent-cyan)' }}

                  >

                    Confirmed ({buyConfirmedCount + sellConfirmedCount})

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'BUY' ? 'active bullish' : ''}`}

                    onClick={() => setSignalFilter('BUY')}

                  >

                    BUY ({buyConfirmedCount})

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'SELL' ? 'active bearish' : ''}`}

                    onClick={() => setSignalFilter('SELL')}

                  >

                    SELL ({sellConfirmedCount})

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'WATCH' ? 'active' : ''}`}

                    onClick={() => setSignalFilter('WATCH')}

                  >

                    Watch ({watchCount})

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'HIGH_VOL' ? 'active' : ''}`}

                    onClick={() => setSignalFilter('HIGH_VOL')}

                    style={{ color: '#fbbf24', borderColor: signalFilter === 'HIGH_VOL' ? '#fbbf24' : undefined }}

                    title="Filter high volatility stocks (ATR% >= 1.4%)"

                  >

                    ⚡ High Vol (≥1.4%)

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'HIGH_MOMENTUM' ? 'active' : ''}`}

                    onClick={() => setSignalFilter('HIGH_MOMENTUM')}

                    style={{ color: 'var(--accent-cyan)', borderColor: signalFilter === 'HIGH_MOMENTUM' ? 'var(--accent-cyan)' : undefined }}

                    title="Filter high momentum stocks (Rel Vol >= 1.5x & Price >= VWAP)"

                  >

                    🚀 High Momentum

                  </button>

                  <button

                    className={`filter-pill ${signalFilter === 'MOST_ACTIVE' ? 'active' : ''}`}

                    onClick={() => setSignalFilter('MOST_ACTIVE')}

                    style={{ color: 'var(--bullish-text)', borderColor: signalFilter === 'MOST_ACTIVE' ? 'var(--bullish-text)' : undefined }}

                    title="Filter turnover leaders (> ₹10 Cr or Top 50 Activity)"

                  >

                    🏆 Most Active

                  </button>

                </div>

              </div>

              {/* Secondary Select Filters */}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>

                {/* Rank Filter */}

                <select

                  value={activityRankFilter}

                  onChange={(e) => setActivityRankFilter(Number(e.target.value))}

                  style={{

                    background: 'rgba(5, 14, 26, 0.8)',

                    color: 'var(--text-sub)',

                    border: '1px solid var(--border-medium)',

                    borderRadius: '4px',

                    padding: '5px 8px',

                    fontSize: '0.74rem'

                  }}

                >

                  <option value={500}>All 500 Equities</option>

                  <option value={200}>Top 200 Equities</option>

                  <option value={100}>Top 100 Equities</option>

                  <option value={50}>Top 50 Active</option>

                  <option value={25}>Top 25 Active</option>

                  <option value={10}>Top 10 Active</option>

                </select>

                {/* % Change Filter */}

                <select

                  value={changeFilter}

                  onChange={(e) => setChangeFilter(e.target.value)}

                  style={{

                    background: 'rgba(5, 14, 26, 0.8)',

                    color: 'var(--text-sub)',

                    border: '1px solid var(--border-medium)',

                    borderRadius: '4px',

                    padding: '5px 8px',

                    fontSize: '0.74rem'

                  }}

                >

                  <option value="ALL">All % Change</option>

                  <option value="GAINERS">Gainers (&gt; 0%)</option>

                  <option value="LOSERS">Losers (&lt; 0%)</option>

                </select>

                {/* Score Filter */}

                <select

                  value={minScoreFilter}

                  onChange={(e) => setMinScoreFilter(Number(e.target.value))}

                  style={{

                    background: 'rgba(5, 14, 26, 0.8)',

                    color: 'var(--text-sub)',

                    border: '1px solid var(--border-medium)',

                    borderRadius: '4px',

                    padding: '5px 8px',

                    fontSize: '0.74rem'

                  }}

                >

                  <option value={0}>Any Score</option>

                  <option value={50}>Score ≥ 50</option>

                  <option value={65}>Score ≥ 65</option>

                  <option value={80}>Score ≥ 80</option>

                </select>

                
                {/* Timeframe Selector */}
                <div className="timeframe-selector-bar" title="Select Completed Candle Timeframe (5m, 10m, 15m)">
                  {['5m', '10m', '15m'].map((tf) => (
                    <button
                      key={tf}
                      className={`timeframe-pill-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTimeframe(tf)
                        addToast(`Candle timeframe set to ${tf}. Click Scan to refresh signals.`, 'info')
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* Export CSV */}

                <button

                  className="btn btn-secondary"

                  onClick={handleExportCSV}

                  disabled={!filteredAndSortedResults.length}

                  style={{ padding: '5px 10px', fontSize: '0.74rem', gap: '4px' }}

                >

                  <Download size={12} />

                  <span>CSV</span>

                </button>

              </div>

            </div>

            {/* Table */}

            {/* Institutional SMC Table: Liquidity Sweep + BOS + FVG */}
            <div className="table-wrapper">
              <table className="scanner-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('Activity Rank')} style={{ width: '48px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span>Rank</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Symbol')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Symbol & Company</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Status')} style={{ textAlign: 'center', width: '85px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span>Signal</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Signal Score')} style={{ textAlign: 'center', width: '90px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span>Score</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span>Liquidity Sweep</span>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span>BOS</span>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span>FVG Zone</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Close')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Entry (₹)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span>Stop-Loss (₹)</span>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span>Target 1 (1:2)</span>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span>Target 2 (1:3)</span>
                    </th>
                    <th style={{ textAlign: 'center', width: '70px' }}>
                      <span>R:R</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Relative Volume')} style={{ textAlign: 'right', width: '75px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Rel Vol</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', width: '95px' }}>
                      <span>Signal Time</span>
                    </th>
                    <th style={{ textAlign: 'right', width: '130px' }}>
                      <span>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedResults.length === 0 ? (
                    <tr>
                      <td colSpan={15} style={{ padding: 0 }}>
                        <div className="table-empty-state">
                          <div className="table-empty-icon">
                            <Search size={22} />
                          </div>
                          <div className="table-empty-title">
                            {results.length === 0 ? 'No institutional SMC setup data loaded' : 'No stocks match your filter criteria'}
                          </div>
                          <div className="table-empty-desc">
                            {results.length === 0
                              ? `Click "Scan NIFTY Intraday" above to scan for Liquidity Sweeps, BOS, and FVGs on ${selectedTimeframe} candles.`
                              : 'Try adjusting your search query, selecting "All Signals", or loosening the minimum score threshold.'}
                          </div>
                          {results.length > 0 && (
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setSearchQuery('')
                                setSignalFilter('ALL')
                                setSelectedUniverse('ALL')
                                setActivityRankFilter(500)
                                setChangeFilter('ALL')
                                setMinScoreFilter(0)
                              }}
                              style={{ padding: '6px 14px', fontSize: '0.78rem', marginTop: '6px' }}
                            >
                              <RotateCw size={12} />
                              <span>Reset Filters</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedResults.map((item) => {
                      const sig = item.Signal ?? item.Status ?? item['Signal Type'] ?? 'WATCH'
                      const isBuy = sig === 'BUY'
                      const isSell = sig === 'SELL'
                      const isWatch = !isBuy && !isSell
                      const score = Number(item.Score ?? item['Signal Score'] ?? 0)
                      const relVol = Number(item['Volume Ratio'] ?? item['Relative Volume'] ?? 1.0)
                      const entryVal = Number(item.Entry ?? item.Close ?? item.ltp ?? 0)
                      const slVal = Number(item['Stop-Loss'] ?? item['Stop Loss'] ?? 0)
                      const t1Val = Number(item['Target 1'] ?? 0)
                      const t2Val = Number(item['Target 2'] ?? 0)
                      const fvgZone = item['FVG Zone'] ?? (item['FVG Low'] ? `₹${item['FVG Low']} - ₹${item['FVG High']}` : '—')
                      const sweepText = item.Sweep ?? item['Sweep Type'] ?? 'None'
                      const bosText = item.BOS ?? 'None'
                      const timeStr = item['Signal Time'] ?? item['Candle Timestamp'] ?? '—'
                      const rankVal = item.Rank ?? item['Activity Rank'] ?? 1

                      return (
                        <tr
                          key={item.Symbol}
                          onClick={() => setSelectedStock(item)}
                          style={{ cursor: 'pointer' }}
                          title="Click to view full SMC structural breakdown & indicators"
                        >
                          <td className="rank-badge">
                            #{String(rankVal).padStart(2, '0')}
                          </td>
                          <td>
                            <div className="symbol-cell">
                              <span className="symbol-name">{item.Symbol}</span>
                              <span className="exchange-chip">NSE EQ</span>
                              {item.is_nifty50 && <span className="index-tag tag-n50">N50</span>}
                              {!item.is_nifty50 && item.is_nifty100 && <span className="index-tag tag-n100">N100</span>}
                              {!item.is_nifty100 && item.is_nifty200 && <span className="index-tag tag-n200">N200</span>}
                              {!item.is_nifty200 && item.is_midcap && <span className="index-tag tag-midcap">MIDCAP</span>}
                              {!item.is_nifty50 && !item.is_nifty100 && !item.is_nifty200 && !item.is_midcap && (
                                <span className="index-tag tag-n500">N500</span>
                              )}
                            </div>
                            <div className="company-subname" title={item.Company}>
                              {item.Company}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isBuy && (
                              <span className="signal-pill bullish">
                                <TrendingUp size={12} />
                                <span>BUY</span>
                              </span>
                            )}
                            {isSell && (
                              <span className="signal-pill bearish">
                                <TrendingDown size={12} />
                                <span>SELL</span>
                              </span>
                            )}
                            {isWatch && (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '0.70rem',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border-subtle)'
                              }}>
                                WATCH
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="confluence-badge">
                              <span className={score >= 85 ? 'confluence-badge-high' : score >= 75 ? 'confluence-badge-valid' : score >= 60 ? 'confluence-badge-watch' : 'confluence-badge-ignore'}>
                                {score.toFixed(1)}
                              </span>
                              <span className="confluence-tier-sub" style={{ color: score >= 85 ? 'var(--bullish-text)' : score >= 75 ? 'var(--accent-cyan)' : score >= 60 ? '#fbbf24' : 'var(--text-muted)' }}>
                                {score >= 85 ? 'High' : score >= 75 ? 'Valid' : score >= 60 ? 'Watch' : 'Ignore'}
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`smc-tag-sweep ${sweepText.includes('Bullish') ? 'bullish' : sweepText.includes('Bearish') ? 'bearish' : 'none'}`}>
                              {sweepText}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`smc-tag-bos ${bosText.includes('Bullish') ? 'bullish' : bosText.includes('Bearish') ? 'bearish' : 'none'}`}>
                              {bosText}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {fvgZone !== '—' && fvgZone !== 'None' ? (
                              <span className="fvg-zone-tag">{fvgZone}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>—</span>
                            )}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff', fontSize: '0.85rem' }}>
                            ₹{entryVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: slVal > 0 ? (isBuy ? 'var(--bearish-text)' : 'var(--bullish-text)') : 'var(--text-muted)', fontSize: '0.82rem' }}>
                            {slVal > 0 ? `₹${slVal.toFixed(2)}` : '—'}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: t1Val > 0 ? 'var(--bullish-text)' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                            {t1Val > 0 ? `₹${t1Val.toFixed(2)}` : '—'}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: t2Val > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                            {t2Val > 0 ? `₹${t2Val.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: isBuy || isSell ? '#ffffff' : 'var(--text-muted)', fontWeight: 600 }}>
                              {item['Risk/Reward'] ?? item['Risk Reward'] ?? '1:2 / 1:3'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={relVol >= 1.5 ? 'rel-vol-high' : relVol >= 1.0 ? 'rel-vol-normal' : 'rel-vol-low'}>
                              {relVol.toFixed(2)}x
                            </span>
                          </td>
                          <td className="font-mono" style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {timeStr.includes('T') ? timeStr.split('T')[1].slice(0, 5) : timeStr.slice(0, 10)}
                          </td>
                          <td>
                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => openPositionCalculator(item)}
                                title="Open Position Sizing & Risk Calculator"
                                style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--accent-cyan)', borderColor: 'rgba(0, 210, 255, 0.3)' }}
                              >
                                🧮 <span>Size</span>
                              </button>
                              <button
                                className="btn-slip"
                                onClick={() => openBrokerTicketModal(item)}
                                title="Open Institutional Broker Order Ticket (Zerodha, Upstox, Angel One, Groww)"
                              >
                                📋 <span>Slip</span>
                              </button>
                              <button
                                className="btn btn-secondary"
                                onClick={() => setSelectedStock(item)}
                                title="Inspect SMC Structure & Invalidation"
                                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                              >
                                <span>Inspect</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Pagination Controls */}

            {filteredAndSortedResults.length > 0 && (

              <div className="table-pagination-bar">

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                  <span>Rows per page:</span>

                  <select

                    value={pageSize}

                    onChange={(e) => {

                      setPageSize(Number(e.target.value))

                      setCurrentPage(1)

                    }}

                    style={{

                      background: 'rgba(5, 14, 26, 0.8)',

                      color: 'var(--accent-cyan)',

                      border: '1px solid var(--border-medium)',

                      borderRadius: '4px',

                      padding: '3px 8px',

                      fontSize: '0.76rem',

                      fontFamily: 'var(--font-mono)'

                    }}

                  >

                    <option value={25}>25</option>

                    <option value={50}>50</option>

                    <option value={100}>100</option>

                    <option value={250}>250</option>

                    <option value={600}>All ({filteredAndSortedResults.length})</option>

                  </select>

                  <span style={{ color: 'var(--text-faint)' }}>

                    Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedResults.length)}–{Math.min(currentPage * pageSize, filteredAndSortedResults.length)} of {filteredAndSortedResults.length}

                  </span>

                </div>

                <div className="pagination-controls">

                  <button

                    className="pagination-btn"

                    onClick={() => setCurrentPage(1)}

                    disabled={currentPage <= 1}

                    title="First Page"

                  >

                    «

                  </button>

                  <button

                    className="pagination-btn"

                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}

                    disabled={currentPage <= 1}

                  >

                    ‹ Prev

                  </button>

                  <span className="pagination-page-indicator">

                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>

                  </span>

                  <button

                    className="pagination-btn"

                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}

                    disabled={currentPage >= totalPages}

                  >

                    Next ›

                  </button>

                  <button

                    className="pagination-btn"

                    onClick={() => setCurrentPage(totalPages)}

                    disabled={currentPage >= totalPages}

                    title="Last Page"

                  >

                    »

                  </button>

                </div>

              </div>

            )}

          </section>

        </>

      )}

      {/* ========================================================================= */}

      {/* APP 2: SCREENER FUNDAMENTAL & DOUBLE CONFIRMATION ANALYZER                */}

      {/* ========================================================================= */}

      {activeApp === 'smc_engine' && (

        <SMCEngine apiBase={API_BASE} />

      )}

      {activeApp === 'algo_signals' && (

        <AlgoSignals apiBase={API_BASE} initialSymbol={algoSymbol} />

      )}

      {/* ========================================================================= */}

      {/* ========================================================================= */}
      {/* MODAL 1: INTERACTIVE CANDLESTICK CHART & INSTITUTIONAL AI EXPLANATION     */}
      {/* ========================================================================= */}
      {selectedStock && (
        <SMCChartModal
          stock={selectedStock}
          timeframe={selectedTimeframe}
          onClose={() => setSelectedStock(null)}
          onOpenCalculator={(stk) => {
            setSelectedStock(null)
            openPositionCalculator(stk)
          }}
          onOpenOrderTicket={(stk) => {
            setSelectedStock(null)
            openBrokerTicketModal(stk)
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SCANNER & RISK SETTINGS (PREFERENCES & CONTROLS)                 */}
      {/* ========================================================================= */}
      <SMCSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        config={{
          timeframe: selectedTimeframe,
          universe: selectedUniverse,
          refreshInterval: autoRefreshSecs,
          maxRiskInr: 1000,
          capitalInr: 50000,
          minRewardRisk: '1:2',
          soundAlerts: true,
          viewMode: 'cards_and_table'
        }}
        onSave={(newCfg) => {
          if (newCfg.timeframe && newCfg.timeframe !== selectedTimeframe) {
            setSelectedTimeframe(newCfg.timeframe)
          }
          if (newCfg.universe && newCfg.universe !== selectedUniverse) {
            setSelectedUniverse(newCfg.universe)
          }
          if (newCfg.refreshInterval !== undefined) {
            setAutoRefreshSecs(newCfg.refreshInterval)
          }
          addToast('Updated scanner and risk parameters!', 'success')
        }}
      />

      {/* MODAL 3: NSE BHAVCOPY LIQUIDITY RESEARCH & HISTORICAL TURNOVER            */}

      {/* ========================================================================= */}

      {showBhavcopyModal && (

        <div className="modal-backdrop" onClick={() => setShowBhavcopyModal(false)}>

          <div className="modal-content-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>

            <div className="modal-header">

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(0, 210, 255, 0.12)', border: '1px solid rgba(0, 210, 255, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>

                  <FileText size={16} />

                </div>

                <div>

                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.08rem', color: '#ffffff' }}>

                    NSE Bhavcopy Daily Activity & Liquidity Research

                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>

                    Official NSE Daily Trading Activity • Historical ADV Baseline & Liquidity Tiering

                  </div>

                </div>

              </div>

              <button className="modal-close-btn" onClick={() => setShowBhavcopyModal(false)}>

                <X size={18} />

              </button>

            </div>

            <div className="modal-body" style={{ gap: '16px' }}>

              {/* Compliance / Source Integrity Banner */}

              <div style={{

                background: 'rgba(56, 189, 248, 0.08)',

                border: '1px solid rgba(56, 189, 248, 0.25)',

                borderRadius: 'var(--radius-sm)',

                padding: '12px 16px',

                fontSize: '0.76rem',

                color: '#bae6fd',

                lineHeight: 1.5

              }}>

                <strong>Historical Data Protocol:</strong> NSE Bhavcopy is downloaded from the official exchange repository and used strictly for historical daily activity, 5-day average daily volume (ADV) baseline calculations, and liquidity tiering. It is <em>never</em> substituted for today's live intraday active ranking.

              </div>

              {bhavcopyLoading ? (

                <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>

                  <RotateCw className="animate-spin" size={28} style={{ color: 'var(--accent-cyan)' }} />

                  <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Fetching official NSE Bhavcopy summary...</span>

                </div>

              ) : bhavcopyData ? (

                <>

                  {/* Summary Bento Row */}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Bhavcopy Date</span>

                      <span className="fundamental-val font-mono" style={{ color: '#ffffff', fontSize: '0.9rem' }}>

                        {bhavcopyData.bhavcopy_date || 'Latest Completed'}

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Total Securities</span>

                      <span className="fundamental-val font-mono" style={{ color: 'var(--accent-cyan)' }}>

                        {bhavcopyData.total_securities || 0}

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Tier 1 (&gt; ₹100 Cr)</span>

                      <span className="fundamental-val font-mono" style={{ color: 'var(--bullish-text)' }}>

                        {bhavcopyData.liquidity_tiers?.tier_1_mega_cap_count || 0} Equities

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Tier 2 (₹25-100 Cr)</span>

                      <span className="fundamental-val font-mono" style={{ color: '#fbbf24' }}>

                        {bhavcopyData.liquidity_tiers?.tier_2_large_cap_count || 0} Equities

                      </span>

                    </div>

                  </div>

                  {/* Top Turnover Table */}

                  <div style={{ marginTop: '6px' }}>

                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px' }}>

                      Top Equities by Bhavcopy Traded Turnover (₹ Cr)

                    </div>

                    <div className="table-wrapper" style={{ maxHeight: '320px', overflowY: 'auto' }}>

                      <table className="scanner-table">

                        <thead>

                          <tr>

                            <th>Rank</th>

                            <th>Symbol</th>

                            <th style={{ textAlign: 'right' }}>Close (₹)</th>

                            <th style={{ textAlign: 'right' }}>Traded Volume</th>

                            <th style={{ textAlign: 'right' }}>Turnover (₹ Cr)</th>

                            <th style={{ textAlign: 'right' }}>Delivery %</th>

                            <th style={{ textAlign: 'center' }}>Liquidity Tier</th>

                          </tr>

                        </thead>

                        <tbody>

                          {(bhavcopyData.top_traded_by_value || []).map((stock, i) => (

                            <tr key={stock.symbol || i}>

                              <td className="rank-badge">#{i + 1}</td>

                              <td className="font-mono" style={{ fontWeight: 700, color: '#ffffff' }}>{stock.symbol}</td>

                              <td className="font-mono" style={{ textAlign: 'right' }}>₹{stock.close_price?.toFixed(2)}</td>

                              <td className="font-mono" style={{ textAlign: 'right', color: 'var(--text-sub)' }}>

                                {stock.volume?.toLocaleString('en-IN')}

                              </td>

                              <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--bullish-text)' }}>

                                ₹{stock.turnover_cr?.toFixed(2)} Cr

                              </td>

                              <td className="font-mono" style={{ textAlign: 'right', color: 'var(--accent-cyan)' }}>

                                {stock.delivery_pct ? `${stock.delivery_pct.toFixed(1)}%` : '—'}

                              </td>

                              <td style={{ textAlign: 'center' }}>

                                <span style={{

                                  padding: '2px 6px',

                                  borderRadius: '3px',

                                  fontSize: '0.68rem',

                                  fontFamily: 'var(--font-mono)',

                                  fontWeight: 700,

                                  background: stock.turnover_cr >= 100 ? 'rgba(0, 245, 160, 0.15)' : 'rgba(251, 191, 36, 0.15)',

                                  color: stock.turnover_cr >= 100 ? 'var(--bullish-text)' : '#fbbf24',

                                  border: `1px solid ${stock.turnover_cr >= 100 ? 'rgba(0, 245, 160, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`

                                }}>

                                  {stock.liquidity_tier || (stock.turnover_cr >= 100 ? 'Tier 1' : 'Tier 2')}

                                </span>

                              </td>

                            </tr>

                          ))}

                        </tbody>

                      </table>

                    </div>

                  </div>

                </>

              ) : (

                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>

                  Failed to load Bhavcopy data. Check network or server status.

                </div>

              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>

                <button className="btn btn-secondary" onClick={() => setShowBhavcopyModal(false)}>

                  Close

                </button>

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ========================================================================= */}

      {/* MODAL 4: 10-MINUTE SMA 6/30 STRATEGY INTRADAY BACKTEST ENGINE            */}

      {/* ========================================================================= */}

      {showBacktestModal && (

        <div className="modal-backdrop" onClick={() => setShowBacktestModal(false)}>

          <div className="modal-content-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '920px' }}>

            <div className="modal-header">

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>

                  <Sliders size={16} />

                </div>

                <div>

                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.08rem', color: '#ffffff' }}>

                    High-Momentum Volatility (HMV-Alpha) SMC Backtester

                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>

                    Strict completed candle execution • Liquidity Sweep + BOS + FVG • 0.10% friction

                  </div>

                </div>

              </div>

              <button className="modal-close-btn" onClick={() => setShowBacktestModal(false)}>

                <X size={18} />

              </button>

            </div>

            <div className="modal-body" style={{ gap: '16px' }}>

              {/* Backtest Input Controls */}

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(5, 14, 26, 0.6)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>Symbol:</span>

                  <input

                    type="text"

                    value={backtestSymbol}

                    onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())}

                    style={{

                      background: 'rgba(0, 0, 0, 0.4)',

                      border: '1px solid var(--border-medium)',

                      borderRadius: '4px',

                      color: '#ffffff',

                      padding: '5px 10px',

                      fontSize: '0.82rem',

                      fontFamily: 'var(--font-mono)',

                      width: '120px'

                    }}

                  />

                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>Days Back:</span>

                  <select

                    value={backtestDays}

                    onChange={(e) => setBacktestDays(Number(e.target.value))}

                    style={{

                      background: 'rgba(0, 0, 0, 0.4)',

                      border: '1px solid var(--border-medium)',

                      borderRadius: '4px',

                      color: 'var(--accent-cyan)',

                      padding: '5px 10px',

                      fontSize: '0.82rem',

                      fontFamily: 'var(--font-mono)'

                    }}

                  >

                    <option value={5}>5 Days</option>

                    <option value={10}>10 Days</option>

                    <option value={15}>15 Days</option>

                    <option value={30}>30 Days</option>

                  </select>

                </div>

                <button

                  className="btn btn-primary"

                  onClick={() => runBacktest(backtestSymbol, backtestDays)}

                  disabled={backtestLoading}

                  style={{ padding: '6px 16px', fontSize: '0.82rem' }}

                >

                  {backtestLoading ? (

                    <>

                      <RotateCw className="animate-spin" size={14} />

                      <span>Backtesting...</span>

                    </>

                  ) : (

                    <>

                      <Play size={14} fill="currentColor" />

                      <span>Execute Backtest</span>

                    </>

                  )}

                </button>

              </div>

              {backtestLoading ? (

                <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>

                  <RotateCw className="animate-spin" size={28} style={{ color: '#fbbf24' }} />

                  <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Evaluating completed 10-minute candles & applying friction...</span>

                </div>

              ) : backtestData ? (

                <>

                  {/* Results KPI Cards */}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Total Trades</span>

                      <span className="fundamental-val font-mono" style={{ color: '#ffffff' }}>

                        {backtestData.total_trades || 0}

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Win Rate %</span>

                      <span className="fundamental-val font-mono" style={{ color: (backtestData.win_rate_pct || 0) >= 50 ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>

                        {backtestData.win_rate_pct?.toFixed(1)}%

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Net Return %</span>

                      <span className="fundamental-val font-mono" style={{ color: (backtestData.net_return_pct || 0) >= 0 ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>

                        {((backtestData.net_return_pct || 0) >= 0 ? '+' : '') + (backtestData.net_return_pct?.toFixed(2) || '0.00')}%

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Profit Factor</span>

                      <span className="fundamental-val font-mono" style={{ color: (backtestData.profit_factor || 0) >= 1.2 ? 'var(--bullish-text)' : '#ffffff' }}>

                        {backtestData.profit_factor?.toFixed(2) || '—'}

                      </span>

                    </div>

                    <div className="fundamental-card">

                      <span className="fundamental-label">Max Drawdown</span>

                      <span className="fundamental-val font-mono" style={{ color: 'var(--bearish-text)' }}>

                        {backtestData.max_drawdown_pct ? `-${backtestData.max_drawdown_pct.toFixed(2)}%` : '0.00%'}

                      </span>

                    </div>

                  </div>

                  {/* Trade Log Table */}

                  <div>

                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '8px' }}>

                      Intraday 10-Minute Trade Execution Log ({backtestData.trades?.length || 0} Trades)

                    </div>

                    <div className="table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto' }}>

                      <table className="scanner-table">

                        <thead>

                          <tr>

                            <th>#</th>

                            <th>Entry Time</th>

                            <th>Exit Time</th>

                            <th>Type</th>

                            <th style={{ textAlign: 'right' }}>Entry (₹)</th>

                            <th style={{ textAlign: 'right' }}>Exit (₹)</th>

                            <th style={{ textAlign: 'right' }}>Gross %</th>

                            <th style={{ textAlign: 'right' }}>Net % (after costs)</th>

                            <th>Exit Reason</th>

                          </tr>

                        </thead>

                        <tbody>

                          {(backtestData.trades || []).length === 0 ? (

                            <tr>

                              <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>

                                No trades triggered during this period.

                              </td>

                            </tr>

                          ) : (

                            backtestData.trades.map((t, idx) => {

                              const isWin = (t.net_return_pct || 0) > 0

                              return (

                                <tr key={idx}>

                                  <td className="rank-badge">#{idx + 1}</td>

                                  <td className="font-mono" style={{ fontSize: '0.74rem' }}>{t.entry_time || '—'}</td>

                                  <td className="font-mono" style={{ fontSize: '0.74rem' }}>{t.exit_time || '—'}</td>

                                  <td>

                                    <span className={`signal-pill ${t.direction === 'BUY' ? 'bullish' : 'bearish'}`} style={{ padding: '2px 6px', fontSize: '0.68rem' }}>

                                      {t.direction}

                                    </span>

                                  </td>

                                  <td className="font-mono" style={{ textAlign: 'right' }}>₹{t.entry_price?.toFixed(2)}</td>

                                  <td className="font-mono" style={{ textAlign: 'right' }}>₹{t.exit_price?.toFixed(2)}</td>

                                  <td className="font-mono" style={{ textAlign: 'right', color: t.gross_return_pct >= 0 ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>

                                    {t.gross_return_pct >= 0 ? `+${t.gross_return_pct.toFixed(2)}%` : `${t.gross_return_pct.toFixed(2)}%`}

                                  </td>

                                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: isWin ? 'var(--bullish-neon)' : 'var(--bearish-text)' }}>

                                    {t.net_return_pct >= 0 ? `+${t.net_return_pct.toFixed(2)}%` : `${t.net_return_pct.toFixed(2)}%`}

                                  </td>

                                  <td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{t.exit_reason || 'Reversal cross'}</td>

                                </tr>

                              )

                            })

                          )}

                        </tbody>

                      </table>

                    </div>

                  </div>

                </>

              ) : (

                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>

                  Click "Execute Backtest" to run historical testing.

                </div>

              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>

                <button className="btn btn-secondary" onClick={() => setShowBacktestModal(false)}>

                  Close

                </button>

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ========================================================================= */}

      {/* MODAL 2: AUTHENTIC UPSTOX DAILY ACCESS TOKEN LOGIN DIALOG                 */}

      {/* ========================================================================= */}

      {showUpdateModal && (

        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>

          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>

            <div className="modal-header">

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(0, 210, 255, 0.12)', border: '1px solid rgba(0, 210, 255, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>

                  <Key size={16} />

                </div>

                <div>

                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.08rem', color: '#ffffff' }}>

                    {authStatus.authenticated ? 'Switch Upstox Access Token' : 'Upstox Daily Access Token Login'}

                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>

                    SEBI-compliant daily authentication for Upstox API v2

                  </div>

                </div>

              </div>

              <button className="modal-close-btn" onClick={() => setShowUpdateModal(false)}>

                <X size={18} />

              </button>

            </div>

            <div className="modal-body" style={{ gap: '18px' }}>

              {/* How to get Token: 3-Step Institutional Guide */}

              <div style={{

                background: 'rgba(5, 14, 26, 0.7)',

                border: '1px solid var(--border-medium)',

                borderRadius: 'var(--radius-md)',

                padding: '14px 16px',

                display: 'flex',

                flexDirection: 'column',

                gap: '8px'

              }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>

                    HOW TO GENERATE YOUR DAILY TOKEN (3 STEPS)

                  </span>

                  <a

                    href="https://developer.upstox.com/"

                    target="_blank"

                    rel="noopener noreferrer"

                    style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}

                  >

                    <span>Developer Console</span>

                    <ExternalLink size={11} />

                  </a>

                </div>

                <div style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '5px', lineHeight: 1.45 }}>

                  <div><strong>1.</strong> Log in to your <a href="https://developer.upstox.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>Upstox Developer Console</a>.</div>

                  <div><strong>2.</strong> Select your App and click <strong>Generate Access Token</strong> for today's session.</div>

                  <div><strong>3.</strong> Copy the token string (starts with <code>eyJ...</code>) and paste it below.</div>

                </div>

              </div>

              {/* Token Input Box */}

              <div className="token-input-container">

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>

                  <span>DAILY ACCESS TOKEN</span>

                  <span style={{ fontSize: '0.68rem', color: 'var(--bullish-neon)', fontFamily: 'var(--font-mono)' }}>VALID TILL 03:30 AM IST</span>

                </div>

                <div className="token-input-wrapper">

                  <input

                    type={showUpdateToken ? 'text' : 'password'}

                    className="token-input"

                    placeholder="Paste your daily Upstox token (eyJhbGci...)"

                    value={updateTokenInput}

                    onChange={(e) => setUpdateTokenInput(e.target.value)}

                    onKeyDown={(e) => e.key === 'Enter' && handleConnectWithToken(updateTokenInput)}

                    disabled={isSubmittingToken}

                  />

                  {navigator.clipboard && (

                    <button

                      type="button"

                      className="token-visibility-btn"

                      onClick={async () => {

                        try {

                          const text = await navigator.clipboard.readText()

                          if (text) setUpdateTokenInput(text.trim())

                        } catch {}

                      }}

                      title="Paste from clipboard"

                      style={{ right: '40px', fontSize: '0.7rem' }}

                    >

                      Paste

                    </button>

                  )}

                  <button

                    type="button"

                    className="token-visibility-btn"

                    onClick={() => setShowUpdateToken(!showUpdateToken)}

                    title={showUpdateToken ? 'Hide token' : 'Show token'}

                  >

                    {showUpdateToken ? <EyeOff size={15} /> : <Eye size={15} />}

                  </button>

                </div>

              </div>

              {/* Action Buttons */}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>

                <button

                  className="btn btn-primary"

                  onClick={() => handleConnectWithToken(updateTokenInput)}

                  disabled={isSubmittingToken || !updateTokenInput.trim()}

                  style={{ width: '100%', padding: '11px 20px', fontSize: '0.88rem', justifyContent: 'center' }}

                >

                  {isSubmittingToken ? (

                    <>

                      <RotateCw className="animate-spin" size={15} />

                      <span>Validating with Upstox API v2...</span>

                    </>

                  ) : (

                    <>

                      <Key size={15} />

                      <span>{authStatus.authenticated ? 'Validate & Update Session' : 'Log In with Access Token'}</span>

                    </>

                  )}

                </button>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>

                  <button

                    className="btn btn-secondary"

                    onClick={() => {

                      setShowUpdateModal(false)

                      fetchResults()

                    }}

                    style={{ flex: 1, padding: '9px 14px', fontSize: '0.78rem', justifyContent: 'center' }}

                  >

                    <span>Continue with Free Real-Time Feed</span>

                  </button>

                  <button

                    className="btn btn-secondary"

                    onClick={() => setShowUpdateModal(false)}

                    style={{ padding: '9px 16px', fontSize: '0.78rem' }}

                  >

                    Close

                  </button>

                </div>

              </div>

            </div>

          </div>

        </div>

      )}

      {/* ========================================================================= */}

      {/* SYSTEM TELEMETRY & ENGINE STATUS FOOTER                                   */}

      {/* ========================================================================= */}

      
      {/* ========================================================================= */}
      
      {/* ========================================================================= */}
      {/* MODAL 5: PRO TRADER BROKER ORDER TICKET (ZERODHA, UPSTOX, ANGEL, GROWW)   */}
      {/* ========================================================================= */}
      {showBrokerModal && brokerStock && (
        <div className="modal-overlay" onClick={() => setShowBrokerModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="symbol-name" style={{ fontSize: '1.2rem' }}>{brokerStock.Symbol}</span>
                <span className="exchange-chip">NSE MIS (INTRADAY)</span>
                <span className={`signal-pill ${(brokerStock.Status || brokerStock.Signal || '').includes('BUY') ? 'bullish' : 'bearish'}`}>
                  {(brokerStock.Status || brokerStock.Signal || 'BUY')} ORDER TICKET
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowBrokerModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: '14px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Select your broker below to format the order parameters with 1-click clipboard copy. 
                Strictly semi-automated manual execution with mandatory 15:15 IST auto square-off.
              </div>

              {/* Broker Switcher */}
              <div className="broker-tab-strip">
                {[
                  { id: 'ZERODHA', label: 'Zerodha Kite' },
                  { id: 'UPSTOX', label: 'Upstox v3' },
                  { id: 'ANGEL', label: 'Angel One' },
                  { id: 'GROWW', label: 'Groww / Direct' }
                ].map(b => (
                  <button
                    key={b.id}
                    className={`broker-tab-btn ${selectedBroker === b.id ? 'active' : ''}`}
                    onClick={() => setSelectedBroker(b.id)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {/* Order Slip Terminal Box */}
              <pre className="order-slip-terminal font-mono">
                {generateBrokerSlipText(brokerStock, selectedBroker)}
              </pre>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => copyBrokerOrderSlip(brokerStock, selectedBroker)}
                  style={{ flex: 1, padding: '10px 16px', fontSize: '0.85rem', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, rgba(0,245,160,0.3), rgba(0,210,255,0.3))', borderColor: 'var(--bullish-neon)' }}
                >
                  <Copy size={15} />
                  <span>{copiedSlipId === brokerStock.Symbol ? '✓ Order Ticket Copied!' : `Copy ${selectedBroker} Order Ticket`}</span>
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => setShowBrokerModal(false)}
                  style={{ padding: '10px 16px', fontSize: '0.85rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POSITION SIZING & RISK MANAGEMENT CALCULATOR MODAL                        */}
      {/* ========================================================================= */}
      {showPositionModal && calcStock && (
        <div className="pos-size-overlay" onClick={() => setShowPositionModal(false)}>
          <div className="pos-size-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-size-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(0, 210, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)', fontWeight: 800 }}>
                  ₹
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ffffff' }}>
                    Position Sizing Calculator — {calcStock.Symbol}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    NSE Cash Equities Intraday MIS Allocation & Risk Guard
                  </div>
                </div>
              </div>
              <button className="toast-close-btn" onClick={() => setShowPositionModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="pos-size-body">
              {/* Capital & Risk Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-sub)', marginBottom: '4px', fontWeight: 600 }}>
                    Trading Capital (₹ INR):
                  </label>
                  <input
                    type="number"
                    value={calcCapital}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setCalcCapital(val)
                      openPositionCalculator(calcStock, val, calcRisk)
                    }}
                    style={{ width: '100%', background: 'rgba(5, 14, 26, 0.9)', border: '1px solid var(--border-medium)', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-sub)', marginBottom: '4px', fontWeight: 600 }}>
                    Max Risk Per Trade (₹ INR):
                  </label>
                  <input
                    type="number"
                    value={calcRisk}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setCalcRisk(val)
                      openPositionCalculator(calcStock, calcCapital, val)
                    }}
                    style={{ width: '100%', background: 'rgba(5, 14, 26, 0.9)', border: '1px solid var(--border-medium)', color: '#ffffff', padding: '8px 12px', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Trade Parameter Cards */}
              <div className="pos-size-grid">
                <div className="pos-size-card">
                  <div className="pos-size-card-title">Entry Price</div>
                  <div className="pos-size-card-val">
                    ₹{Number(calcStock.Entry ?? calcStock.Close ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="pos-size-card">
                  <div className="pos-size-card-title">Structural Stop-Loss</div>
                  <div className="pos-size-card-val" style={{ color: 'var(--bearish-text)' }}>
                    ₹{Number(calcStock['Stop-Loss'] ?? calcStock['Stop Loss'] ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Calculated Outputs */}
              {calcResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="pos-size-grid">
                    <div className="pos-size-card" style={{ borderColor: 'rgba(0, 245, 160, 0.4)', background: 'rgba(0, 245, 160, 0.05)' }}>
                      <div className="pos-size-card-title">Recommended Shares</div>
                      <div className="pos-size-card-val bullish">
                        {calcResult.order_sizing?.recommended_quantity} Shares
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-sub)', marginTop: '2px' }}>
                        Value: ₹{calcResult.order_sizing?.position_value_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="pos-size-card" style={{ borderColor: 'rgba(0, 210, 255, 0.4)', background: 'rgba(0, 210, 255, 0.05)' }}>
                      <div className="pos-size-card-title">5x MIS Margin Required</div>
                      <div className="pos-size-card-val" style={{ color: 'var(--accent-cyan)' }}>
                        ₹{calcResult.order_sizing?.margin_required_inr?.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-sub)', marginTop: '2px' }}>
                        Actual Risk: ₹{calcResult.capital_and_risk?.actual_risk_inr} ({calcResult.capital_and_risk?.risk_pct_of_capital}%)
                      </div>
                    </div>
                  </div>

                  <div className="pos-size-grid">
                    <div className="pos-size-card">
                      <div className="pos-size-card-title">Target 1 (1:2 R:R) Profit</div>
                      <div className="pos-size-card-val bullish">
                        +₹{calcResult.profit_projections?.target_1_profit_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="pos-size-card">
                      <div className="pos-size-card-title">Target 2 (1:3 R:R) Profit</div>
                      <div className="pos-size-card-val" style={{ color: 'var(--accent-cyan)' }}>
                        +₹{calcResult.profit_projections?.target_2_profit_inr?.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Mandatory Square-off notice */}
                  <div className="pos-compliance-banner">
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>MANDATORY 15:15 IST SQUARE-OFF:</strong> {calcResult.compliance_notice}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowPositionModal(false)}
                  style={{ padding: '8px 18px', fontSize: '0.80rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="system-footer">

        <div className="footer-left">

          <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />

          <span>Upstox WebSocket V2 Protocol</span>

          <span style={{ color: 'var(--border-medium)' }}>•</span>

          <span style={{ color: 'var(--accent-cyan)' }}>Quant Engine Online</span>

        </div>

        <div className="footer-right">

          Scanner Algorithm: <span style={{ color: "#ffffff" }}>Institutional Liquidity Sweep + BOS + FVG (HMV-Alpha)</span>

        </div>

      </footer>

      {/* Floating Auto-Dismiss Toast Container */}

      {toasts.length > 0 && (

        <div className="toast-container">

          {toasts.map((t) => (

            <div key={t.id} className={`toast-pill toast-${t.type}`}>

              {t.type === 'success' && <CheckCircle2 size={16} />}

              {t.type === 'error' && <AlertCircle size={16} />}

              {t.type === 'info' && <Zap size={16} />}

              <span style={{ flex: 1 }}>{t.message}</span>

              <button

                className="toast-close-btn"

                onClick={() => removeToast(t.id)}

                title="Dismiss"

              >

                <X size={14} />

              </button>

            </div>

          ))}

        </div>

      )}

    </div>

  )

}

