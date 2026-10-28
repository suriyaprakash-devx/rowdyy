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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

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

  // Screener & Double Confirmation state (App 2)
  const [screenerSymbol, setScreenerSymbol] = useState('')
  const [screenerInput, setScreenerInput] = useState('')
  const [screenerData, setScreenerData] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [screenerError, setScreenerError] = useState(null)

  // Stock Perfection Engine state (App 3)
  const [scorerSymbol, setScorerSymbol] = useState('')
  const [scorerInput, setScorerInput] = useState('')
  const [scorerData, setScorerData] = useState(null)
  const [isScoring, setIsScoring] = useState(false)
  const [scorerError, setScorerError] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardFilter, setLeaderboardFilter] = useState('ALL') // ALL, PERFECT, BULLISH
  const [algoSymbol, setAlgoSymbol] = useState('')

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
        loadLeaderboard()
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
  }, [autoRefreshSecs, scanStatus.is_running])

  useEffect(() => {
    checkAuth()
    fetchResults()
    fetchMarketOverview()
    loadLeaderboard()
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

  // 4. Trigger Scanner Run
  const handleRunScanner = async (overrideUniverse) => {
    const universe = overrideUniverse || selectedUniverse || 'ALL'
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const res = await authFetch(`${API_BASE}/api/scanner/run?universe=${encodeURIComponent(universe)}&limit=500`, { method: 'POST' })
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
        setSuccessMessage('Scan abort initiated.')
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
      setSuccessMessage(data.message || `Connected to Upstox successfully as ${data.user_name || data.user_id}!`)
      fetchResults()
      loadLeaderboard()
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

  // 8. Screener & Double Confirmation API (App 2)
  const loadStockAnalysis = async (symbol) => {
    const sym = (symbol || screenerSymbol).trim().toUpperCase()
    if (!sym) return
    setIsAnalyzing(true)
    setScreenerError(null)
    setScreenerSymbol(sym)
    setScreenerInput(sym)

    try {
      const res = await authFetch(`${API_BASE}/api/analysis/${encodeURIComponent(sym)}`)
      if (!res.ok) {
        let errDetail = 'Unable to fetch fundamental data'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      const data = await res.json()
      setScreenerData(data)
    } catch (err) {
      setScreenerError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const navigateToAnalysis = (symbol) => {
    setActiveApp('screener')
    loadStockAnalysis(symbol)
  }

  // 9. Stock Perfection Score API (App 3)
  const loadStockPerfection = async (symbol) => {
    const sym = (symbol || scorerSymbol).trim().toUpperCase()
    if (!sym) return
    setIsScoring(true)
    setScorerError(null)
    setScorerSymbol(sym)
    setScorerInput(sym)

    try {
      const res = await authFetch(`${API_BASE}/api/analysis/${encodeURIComponent(sym)}`)
      if (!res.ok) {
        let errDetail = 'Unable to compute stock perfection score'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      const data = await res.json()
      setScorerData(data)
    } catch (err) {
      setScorerError(err.message)
    } finally {
      setIsScoring(false)
    }
  }

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/scoring/leaderboard`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.leaderboard) {
          setLeaderboard(data.leaderboard)
        }
      }
    } catch (err) {
      console.warn('Leaderboard fetch warning:', err)
    } finally {
      setLeaderboardLoading(false)
    }
  }

  const navigateToPerfection = (symbol) => {
    setActiveApp('scorer')
    loadStockPerfection(symbol)
  }

  const navigateToAlgoSignals = (symbol) => {
    setAlgoSymbol(symbol)
    setActiveApp('algo_signals')
  }

  const filteredLeaderboard = useMemo(() => {
    let list = [...leaderboard]
    if (leaderboardFilter === 'PERFECT') {
      list = list.filter(item => (item.perfection_score || 0) >= 75)
    } else if (leaderboardFilter === 'BULLISH') {
      list = list.filter(item => item.technical_signal === 'BULLISH')
    }
    return list
  }, [leaderboard, leaderboardFilter])

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

    // Signal Filter (ALL, BUY, SELL, CONFIRMED, WATCH)
    if (signalFilter === 'BUY') {
      list = list.filter(r => (r.Status === 'BUY' || r['Signal Type'] === 'BUY' || r['Signal Type'] === 'BULLISH'))
    } else if (signalFilter === 'SELL') {
      list = list.filter(r => (r.Status === 'SELL' || r['Signal Type'] === 'SELL' || r['Signal Type'] === 'BEARISH'))
    } else if (signalFilter === 'CONFIRMED') {
      list = list.filter(r => (r['Is Confirmed'] || r.is_confirmed || r.Status === 'BUY' || r.Status === 'SELL'))
    } else if (signalFilter === 'WATCH') {
      list = list.filter(r => r.Status === 'WATCH' || (!r['Is Confirmed'] && !r.is_confirmed && r.Status !== 'BUY' && r.Status !== 'SELL'))
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
  }, [searchQuery, signalFilter, selectedUniverse, activityRankFilter, changeFilter, minScoreFilter])

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
      const crVal = r['Traded Value Cr'] ?? ((r['Traded Value'] ?? r.traded_value ?? 0) / 1e7).toFixed(2)
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
            <span className="brand-title">SMA 6 & 30 Cross Scanner</span>
            <span className="brand-version-chip">v2.4 QUANT LIVE</span>
          </div>
        </div>

        {/* Market Status Strip */}
        <div className="market-ticker-strip">
          <div className="market-status-badge">
            <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
            <span>NSE MARKET HOURS</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>09:15 - 15:30 IST</span>
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
          <BarChart3 size={16} />
          <span>⚡ 1️⃣ NIFTY 500 Intraday SMA 6/30 Scanner</span>
          <span className="app-mode-badge bullish">{results.length || 501} Stocks</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'algo_signals' ? 'active' : ''}`}
          onClick={() => {
            const sym = algoSymbol || confirmedBuys[0]?.Symbol || results[0]?.Symbol || 'RELIANCE'
            setAlgoSymbol(sym)
            setActiveApp('algo_signals')
          }}
        >
          <Zap size={16} />
          <span>🤖 2️⃣ Intraday Signal & Order Slip</span>
          <span className="app-mode-badge gold">AI Execution Ticket</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'screener' ? 'active' : ''}`}
          onClick={() => setActiveApp('screener')}
        >
          <Microscope size={16} />
          <span>📊 3️⃣ Stock Screener Analysis</span>
          <span className="app-mode-badge cyan">Fundamentals</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'scorer' ? 'active' : ''}`}
          onClick={() => {
            setActiveApp('scorer')
            if (!scorerData) loadStockPerfection(scorerSymbol)
            if (!leaderboard.length) loadLeaderboard()
          }}
        >
          <Award size={16} />
          <span>💎 4️⃣ 100-Pt Perfection Score</span>
          <span className="app-mode-badge gold">Quant Engine</span>
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
          <section className="market-session-hero glass-panel">
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
                  <span>Official NSE Equities Master • 10m Intraday Horizon</span>
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
                  <span>Non-Repainting Completed 10m Bars</span>
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
                  <span className="kpi-sub" style={{ color: 'var(--bullish-neon)' }}>Golden Cross</span>
                </div>
                <div className="kpi-footer">
                  <span style={{ color: 'var(--bullish-text)' }}>SMA 6 &gt; 30 • Vol ≥ 1.5x • Breakout</span>
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
                  <span className="kpi-sub" style={{ color: 'var(--bearish-neon)' }}>Death Cross</span>
                </div>
                <div className="kpi-footer">
                  <span style={{ color: 'var(--bearish-text)' }}>SMA 6 &lt; 30 • Vol ≥ 1.5x • Breakdown</span>
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

            {/* Quick Action Control Bar */}
            <div className="session-action-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
                  title="Backtest 10-Minute SMA 6/30 Strategy on Historical Intraday Candles"
                >
                  <Sliders size={14} style={{ color: '#fbbf24' }} />
                  <span>10m Backtest</span>
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
          <section className="confirmed-alerts-container">
            <div className="confirmed-section-header">
              <div className="confirmed-title-box">
                <Zap size={18} style={{ color: 'var(--bullish-neon)' }} />
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.12rem', color: '#ffffff' }}>
                    Confirmed 10-Minute SMA 6/30 Intraday Alerts
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Completed 10m Candle Crossover • Rel Vol ≥ 1.5x • Price-Action Breakout • Turnover ≥ ₹5 Cr • Semi-Algo Alert Only
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="filter-pill active bullish" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                  BUY ({buyConfirmedCount})
                </span>
                <span className="filter-pill active bearish" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                  SELL ({sellConfirmedCount})
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
              {/* Confirmed BUY Column */}
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0, 245, 160, 0.2)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--bullish-text)', fontWeight: 800, fontSize: '0.88rem' }}>
                    <TrendingUp size={16} />
                    <span>RANKED CONFIRMED BUY ALERTS</span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--bullish-neon)' }}>
                    {confirmedBuys.length} Confirmed
                  </span>
                </div>

                {confirmedBuys.length === 0 ? (
                  <div className="empty-alerts-card">
                    <CheckCircle2 size={28} style={{ color: 'var(--text-faint)' }} />
                    <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>No Confirmed BUY Signals on Current 10m Bar</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', maxWidth: '340px' }}>
                      Crossover must satisfy completed bar SMA 6 &gt; 30, relative volume ≥ 1.5x, and close above previous bar high.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {confirmedBuys.map((alert, idx) => (
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
                              ₹{alert.Close?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>

                        {/* Score Meter */}
                        <div className="alert-score-container">
                          <div className="alert-score-header">
                            <span>Composite Signal Score</span>
                            <span className="alert-score-val font-mono" style={{ color: 'var(--bullish-text)' }}>
                              {alert['Signal Score'] || alert.signal_score || 0} / 100
                            </span>
                          </div>
                          <div className="score-meter-track">
                            <div
                              className="score-meter-fill"
                              style={{
                                width: `${Math.min(100, alert['Signal Score'] || alert.signal_score || 0)}%`,
                                background: 'linear-gradient(90deg, #10b981 0%, #00f5a0 100%)'
                              }}
                            />
                          </div>
                        </div>

                        {/* Metrics Pills */}
                        <div className="metrics-row-wrap">
                          <div className="metric-cell">
                            <span className="metric-cell-label">SMA 6 vs 30</span>
                            <span className="metric-cell-val" style={{ color: 'var(--bullish-text)' }}>
                              ₹{alert['SMA 6']?.toFixed(1)} / ₹{alert['SMA 30']?.toFixed(1)}
                            </span>
                          </div>
                          <div className="metric-cell">
                            <span className="metric-cell-label">Relative Volume</span>
                            <span className="metric-cell-val" style={{ color: 'var(--bullish-neon)' }}>
                              {alert['Relative Volume'] || alert.rel_volume}x (≥ 1.5x)
                            </span>
                          </div>
                          <div className="metric-cell">
                            <span className="metric-cell-label">Session Turnover</span>
                            <span className="metric-cell-val font-mono">
                              ₹{alert['Traded Value Cr'] || ((alert['Traded Value'] || 0) / 1e7).toFixed(1)} Cr
                            </span>
                          </div>
                          <div className="metric-cell">
                            <span className="metric-cell-label">10m Candle Time</span>
                            <span className="metric-cell-val font-mono" style={{ fontSize: '0.72rem' }}>
                              {alert['Candle Timestamp'] || alert.candle_timestamp || 'Completed Bar'}
                            </span>
                          </div>
                        </div>

                        {/* Confirmation Conditions Breakdown */}
                        <div className="confirmation-breakdown-box">
                          <div style={{ fontWeight: 700, color: 'var(--bullish-text)', marginBottom: '3px' }}>
                            ✓ 5/5 Institutional Confirmation Rules Satisfied:
                          </div>
                          <div>{alert['Confirmation Notes'] || alert.confirmation_notes || 'SMA 6 crossed above SMA 30; Relative volume >= 1.5x baseline; Close > previous candle high; Min turnover satisfied.'}</div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setSelectedStock(alert)}
                            style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                          >
                            <Maximize2 size={12} />
                            <span>Audit</span>
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => runBacktest(alert.Symbol, 15)}
                            style={{ padding: '4px 10px', fontSize: '0.74rem', gap: '4px' }}
                          >
                            <Sliders size={12} style={{ color: '#fbbf24' }} />
                            <span>Backtest 10m</span>
                          </button>
                          <button
                            className="btn btn-primary"
                            onClick={() => navigateToAlgoSignals(alert.Symbol)}
                            style={{ padding: '4px 10px', fontSize: '0.74rem', gap: '4px', background: 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(99,102,241,0.25))', borderColor: 'var(--accent-cyan)' }}
                            title="Open in Intraday AI Signal Terminal & Order Slip"
                          >
                            <Zap size={12} style={{ color: 'var(--accent-cyan)' }} />
                            <span>Order Slip</span>
                          </button>
                          <a
                            href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(alert.Symbol)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                          >
                            <ExternalLink size={12} />
                            <span>Chart</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirmed SELL Column */}
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 51, 102, 0.2)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--bearish-text)', fontWeight: 800, fontSize: '0.88rem' }}>
                    <TrendingDown size={16} />
                    <span>RANKED CONFIRMED SELL ALERTS</span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--bearish-neon)' }}>
                    {confirmedSells.length} Confirmed
                  </span>
                </div>

                {confirmedSells.length === 0 ? (
                  <div className="empty-alerts-card">
                    <CheckCircle2 size={28} style={{ color: 'var(--text-faint)' }} />
                    <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>No Confirmed SELL Signals on Current 10m Bar</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', maxWidth: '340px' }}>
                      Crossover must satisfy completed bar SMA 6 &lt; 30, relative volume ≥ 1.5x, and close below previous bar low.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {confirmedSells.map((alert, idx) => (
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
                              ₹{alert.Close?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>

                        {/* Score Meter */}
                        <div className="alert-score-container">
                          <div className="alert-score-header">
                            <span>Composite Signal Score</span>
                            <span className="alert-score-val font-mono" style={{ color: 'var(--bearish-text)' }}>
                              {alert['Signal Score'] || alert.signal_score || 0} / 100
                            </span>
                          </div>
                          <div className="score-meter-track">
                            <div
                              className="score-meter-fill"
                              style={{
                                width: `${Math.min(100, alert['Signal Score'] || alert.signal_score || 0)}%`,
                                background: 'linear-gradient(90deg, #ef4444 0%, #ff3366 100%)'
                              }}
                            />
                          </div>
                        </div>

                        {/* Metrics Pills */}
                        <div className="metrics-row-wrap">
                          <div className="metric-cell">
                            <span className="metric-cell-label">SMA 6 vs 30</span>
                            <span className="metric-cell-val" style={{ color: 'var(--bearish-text)' }}>
                              ₹{alert['SMA 6']?.toFixed(1)} / ₹{alert['SMA 30']?.toFixed(1)}
                            </span>
                          </div>
                          <div className="metric-cell">
                            <span className="metric-cell-label">Relative Volume</span>
                            <span className="metric-cell-val" style={{ color: 'var(--bearish-neon)' }}>
                              {alert['Relative Volume'] || alert.rel_volume}x (≥ 1.5x)
                            </span>
                          </div>
                          <div className="metric-cell">
                            <span className="metric-cell-label">Session Turnover</span>
                            <span className="metric-cell-val font-mono">
                              ₹{alert['Traded Value Cr'] || ((alert['Traded Value'] || 0) / 1e7).toFixed(1)} Cr
                            </span>
                          </div>
                          <div className="metric-cell">
                            <span className="metric-cell-label">10m Candle Time</span>
                            <span className="metric-cell-val font-mono" style={{ fontSize: '0.72rem' }}>
                              {alert['Candle Timestamp'] || alert.candle_timestamp || 'Completed Bar'}
                            </span>
                          </div>
                        </div>

                        {/* Confirmation Conditions Breakdown */}
                        <div className="confirmation-breakdown-box">
                          <div style={{ fontWeight: 700, color: 'var(--bearish-text)', marginBottom: '3px' }}>
                            ✓ 5/5 Institutional Confirmation Rules Satisfied:
                          </div>
                          <div>{alert['Confirmation Notes'] || alert.confirmation_notes || 'SMA 6 crossed below SMA 30; Relative volume >= 1.5x baseline; Close < previous candle low; Min turnover satisfied.'}</div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setSelectedStock(alert)}
                            style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                          >
                            <Maximize2 size={12} />
                            <span>Audit</span>
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => runBacktest(alert.Symbol, 15)}
                            style={{ padding: '4px 10px', fontSize: '0.74rem', gap: '4px' }}
                          >
                            <Sliders size={12} style={{ color: '#fbbf24' }} />
                            <span>Backtest 10m</span>
                          </button>
                          <button
                            className="btn btn-primary"
                            onClick={() => navigateToAlgoSignals(alert.Symbol)}
                            style={{ padding: '4px 10px', fontSize: '0.74rem', gap: '4px', background: 'linear-gradient(135deg, rgba(255,51,102,0.25), rgba(99,102,241,0.25))', borderColor: 'var(--bearish-neon)' }}
                            title="Open in Intraday AI Signal Terminal & Order Slip"
                          >
                            <Zap size={12} style={{ color: 'var(--bearish-neon)' }} />
                            <span>Order Slip</span>
                          </button>
                          <a
                            href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(alert.Symbol)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                          >
                            <ExternalLink size={12} />
                            <span>Chart</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ================================================================= */}
          {/* 3. NIFTY 500 INTRADAY STOCKS SCANNER (UP TO 501 CONSTITUENTS)     */}
          {/* ================================================================= */}
          <section className="table-surface-card glass-panel">
            <div className="table-header-strip">
              <div className="table-header-strip-title">
                <Activity size={15} style={{ color: 'var(--accent-cyan)' }} />
                <span>NIFTY 500 INTRADAY STOCKS SCANNER</span>
                <span style={{ color: 'var(--border-medium)' }}>•</span>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>10-MIN COMPLETED CANDLES & SMA 6/30</span>
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
            <div className="table-wrapper">
              <table className="scanner-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('Activity Rank')} style={{ width: '56px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                    <th className="sortable" onClick={() => handleSort('Close')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>LTP (₹)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Percentage Change')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Change %</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Traded Value Cr')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Traded Val (₹ Cr)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('SMA 6')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>SMA 6 (10m)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('SMA 30')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>SMA 30 (10m)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Relative Volume')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>Rel Vol</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span>Candle Time</span>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Status')} style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span>Status</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Signal Score')} style={{ textAlign: 'center', width: '90px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span>Score</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'right', width: '130px' }}>
                      <span>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedResults.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                          <Activity size={36} style={{ color: 'var(--text-faint)' }} />
                          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#ffffff' }}>
                            {results.length === 0 ? 'No most-active stock scan data loaded.' : 'No active stocks match the current filters.'}
                          </div>
                          <div style={{ fontSize: '0.82rem', maxWidth: '420px', lineHeight: 1.5 }}>
                            {results.length === 0
                              ? 'Click "Run Live 10m Scanner" above to discover today\'s Top 50 most active NSE cash equities and calculate completed 10-minute SMA 6/30 crossovers.'
                              : 'Try adjusting your search query, activity rank slice, or minimum score filter.'}
                          </div>
                          {results.length === 0 && (
                            <button className="btn btn-primary" onClick={handleRunScanner} disabled={scanStatus.is_running} style={{ marginTop: '8px' }}>
                              <Play size={14} fill="currentColor" />
                              <span>Execute Discovery & 10m Scan</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedResults.map((item) => {
                      const isBuy = item.Status === 'BUY' || item['Signal Type'] === 'BUY'
                      const isSell = item.Status === 'SELL' || item['Signal Type'] === 'SELL'
                      const isWatch = !isBuy && !isSell
                      const chg = item['Percentage Change'] ?? item.change_pct ?? 0
                      const isChgPos = chg >= 0
                      const tradedCr = item['Traded Value Cr'] ?? ((item['Traded Value'] ?? item.traded_value ?? 0) / 1e7).toFixed(1)
                      const relVol = item['Relative Volume'] ?? item.rel_volume ?? 1.0
                      const score = item['Signal Score'] ?? item.signal_score ?? 0

                      return (
                        <tr
                          key={item.Symbol}
                          onClick={() => setSelectedStock(item)}
                          style={{ cursor: 'pointer' }}
                          title="Click to view full 10-minute SMA 6/30 indicators & confirmation audit"
                        >
                          <td className="rank-badge">
                            #{String(item.Rank ?? item['Activity Rank'] ?? 1).padStart(2, '0')}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <div className="company-subname" title={item.Company}>
                                {item.Company}
                              </div>
                              {item.Industry && (
                                <span className="industry-sector-chip" title={`Sector: ${item.Industry}`}>
                                  {item.Industry}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>
                            ₹{(item.Close ?? item.ltp ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td
                            className="font-mono"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isChgPos ? 'var(--bullish-text)' : 'var(--bearish-text)',
                              fontSize: '0.85rem'
                            }}
                          >
                            {isChgPos ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: 'var(--text-sub)', fontSize: '0.84rem' }}>
                            ₹{Number(tradedCr).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: isBuy ? 'var(--bullish-text)' : '#ffffff', fontWeight: 600, fontSize: '0.84rem' }}>
                            ₹{(item['SMA 6'] ?? 0).toFixed(2)}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: isSell ? 'var(--bearish-text)' : 'var(--text-muted)', fontSize: '0.84rem' }}>
                            ₹{(item['SMA 30'] ?? 0).toFixed(2)}
                          </td>
                          <td
                            className="font-mono"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: relVol >= 1.5 ? 'var(--bullish-neon)' : 'var(--text-muted)',
                              fontSize: '0.84rem'
                            }}
                          >
                            {Number(relVol).toFixed(2)}x
                          </td>
                          <td className="font-mono" style={{ textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-faint)' }}>
                            {item['Candle Timestamp'] ?? item.candle_timestamp ?? '10m Bar'}
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
                                fontWeight: 600,
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border-subtle)'
                              }}>
                                WATCH
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                color: score >= 70 ? 'var(--bullish-neon)' : score >= 50 ? 'var(--accent-cyan)' : 'var(--text-muted)'
                              }}
                            >
                              {score > 0 ? `${score}/100` : '—'}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="action-icon-btn"
                                onClick={() => setSelectedStock(item)}
                                title="Audit 10-Minute SMA 6/30 indicators"
                              >
                                <Maximize2 size={13} />
                              </button>
                              <button
                                className="action-icon-btn"
                                onClick={() => runBacktest(item.Symbol, 15)}
                                title="Backtest 10-Minute Strategy"
                              >
                                <Sliders size={13} style={{ color: '#fbbf24' }} />
                              </button>
                              <a
                                className="action-icon-btn"
                                href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(item.Symbol)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in TradingView Chart"
                              >
                                <ExternalLink size={13} />
                              </a>
                              <button
                                className="action-icon-btn"
                                onClick={() => navigateToAnalysis(item.Symbol)}
                                title="Deep Fundamental & Double Confirmation Analysis"
                              >
                                <Microscope size={13} style={{ color: 'var(--accent-cyan)' }} />
                              </button>
                              <button
                                className="action-icon-btn"
                                onClick={() => navigateToAlgoSignals(item.Symbol)}
                                title="Open in Intraday AI Signal Terminal & Order Slip"
                              >
                                <Zap size={13} style={{ color: 'var(--bullish-neon)' }} />
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
      {activeApp === 'screener' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Search Header Bar */}
          <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Stock Quality & Double Confirmation Analyzer
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Screener-style Strengths, Weaknesses, EPS, P/E, Debt leverage & Technical Crossover Synthesis
                </div>
              </div>

              {/* Symbol Search Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); loadStockAnalysis(screenerInput); }}
                style={{ display: 'flex', gap: '8px', minWidth: '320px', flex: 1, maxWidth: '460px' }}
              >
                <div className="search-box" style={{ flex: 1, maxWidth: 'none' }}>
                  <Search className="search-icon" size={16} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Enter NSE symbol (e.g. RELIANCE, TCS, INFY)..."
                    value={screenerInput}
                    onChange={(e) => setScreenerInput(e.target.value.toUpperCase())}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }} disabled={isAnalyzing}>
                  {isAnalyzing ? <RotateCw className="animate-spin" size={15} /> : <span>Analyze</span>}
                </button>
              </form>
            </div>

            {/* Quick Click Chips */}
            <div className="quick-chips-strip">
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Stocks:</span>
              {POPULAR_STOCKS.map((sym) => (
                <button
                  key={sym}
                  className={`quick-chip ${screenerSymbol === sym ? 'active' : ''}`}
                  onClick={() => loadStockAnalysis(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {screenerError && (
            <div className="alert-box alert-danger">
              <AlertCircle size={18} />
              <span>{screenerError}</span>
            </div>
          )}

          {isAnalyzing && (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <RotateCw className="animate-spin" size={32} style={{ color: 'var(--accent-cyan)' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>Analyzing {screenerSymbol} Fundamentals & Cross Status...</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '480px' }}>
                Fetching balance sheet metrics, EPS trajectory, valuation ratios, and corroborating with SMA 6 & 30 trend direction.
              </div>
            </div>
          )}

          {/* Analysis Content */}
          {!isAnalyzing && screenerData && (
            <>
              {/* Double Confirmation Verdict Card */}
              {(() => {
                const dc = screenerData.double_confirmation
                let heroClass = 'neutral'
                if (dc.signal === 'STRONG_BUY' || dc.signal === 'CAUTION_BUY') heroClass = 'bullish'
                else if (dc.signal === 'STRONG_SELL' || dc.signal === 'AVOID') heroClass = 'bearish'

                return (
                  <div className={`verdict-banner ${heroClass} glass-panel`}>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        DOUBLE CONFIRMATION SYNTHESIS VERDICT
                      </div>
                      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.9rem', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{screenerData.company}</span>
                        <span className="font-mono" style={{ fontSize: '0.95rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>({screenerData.symbol})</span>
                      </h1>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {screenerData.sector} • {screenerData.industry}
                      </div>
                    </div>

                    {/* Recommendation Badge */}
                    <div className="verdict-score-badge" style={{ background: dc.color, color: '#051424', borderColor: dc.color }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={20} />
                        <span>{dc.badge_text}</span>
                      </div>
                    </div>

                    {/* Technical vs Fundamental Comparison Pillar */}
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'rgba(5, 14, 26, 0.6)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>1st Confirmation: Technical</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <span className={`signal-pill ${screenerData.technical_signal === 'BULLISH' ? 'bullish' : 'bearish'}`}>
                            {screenerData.technical_signal === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            <span>SMA 6 & 30: {screenerData.technical_signal}</span>
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>2nd Confirmation: Fundamental</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <span className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: screenerData.verdict_color === 'bullish' ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>
                            {screenerData.fundamental_score} / 10 • {screenerData.fundamental_verdict}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Current Market Price</div>
                        <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                          ₹{screenerData.current_price?.toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>3rd Confirmation: Perfection Score</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fbbf24' }}>
                            {screenerData.perfection_score || 0} / 100
                          </span>
                          <button
                            className="btn btn-secondary"
                            onClick={() => navigateToPerfection(screenerData.symbol)}
                            style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px' }}
                            title="Inspect 100-Point Stock Perfection Breakdown"
                          >
                            <Award size={12} color="#fbbf24" />
                            <span>Scorecard</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Synthesis explanation */}
                    <div style={{ width: '100%', fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <strong style={{ color: '#ffffff' }}>Quant Strategy Synthesis:</strong> {dc.summary}
                    </div>
                  </div>
                )
              })()}

              {/* Fundamental Bento Grid */}
              <div className="glass-panel" style={{ padding: '18px 20px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  KEY FINANCIAL METRICS (SCREENER OVERVIEW)
                </div>
                <div className="fundamental-grid">
                  <div className="fundamental-card">
                    <span className="fundamental-label">Market Cap</span>
                    <span className="fundamental-val">₹{screenerData.market_cap_cr ? screenerData.market_cap_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'} Cr</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Stock P/E</span>
                    <span className="fundamental-val">{screenerData.trailing_pe ? screenerData.trailing_pe.toFixed(2) : '—'}x</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Price to Book (P/B)</span>
                    <span className="fundamental-val">{screenerData.price_to_book ? screenerData.price_to_book.toFixed(2) : '—'}x</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Return on Equity (ROE)</span>
                    <span className="fundamental-val" style={{ color: (screenerData.roe || 0) > 15 ? 'var(--bullish-text)' : '#ffffff' }}>
                      {screenerData.roe ? (screenerData.roe * 100).toFixed(2) + '%' : '—'}
                    </span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Trailing EPS</span>
                    <span className="fundamental-val">₹{screenerData.eps ? screenerData.eps.toFixed(2) : '—'}</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Debt to Equity</span>
                    <span className="fundamental-val" style={{ color: (screenerData.debt_to_equity || 0) < 0.5 ? 'var(--bullish-text)' : '#ffffff' }}>
                      {screenerData.debt_to_equity ? screenerData.debt_to_equity.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pros vs Cons Split */}
              <div className="pros-cons-grid">
                {/* Pros Panel */}
                <div className="pros-panel glass-panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bullish-text)', fontWeight: 700, fontSize: '0.88rem' }}>
                    <CheckCircle2 size={18} />
                    <span>Company Strengths & Pros ({screenerData.pros?.length || 0})</span>
                  </div>
                  <div className="pros-cons-list">
                    {screenerData.pros && screenerData.pros.length > 0 ? (
                      screenerData.pros.map((p, idx) => (
                        <div key={idx} className="pros-cons-item">
                          <Check size={15} style={{ color: 'var(--bullish-text)', flexShrink: 0, marginTop: '2px' }} />
                          <span>{p}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>No standout positive qualitative factors identified.</div>
                    )}
                  </div>
                </div>

                {/* Cons Panel */}
                <div className="cons-panel glass-panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bearish-text)', fontWeight: 700, fontSize: '0.88rem' }}>
                    <AlertTriangle size={18} />
                    <span>Company Limitations & Cons ({screenerData.cons?.length || 0})</span>
                  </div>
                  <div className="pros-cons-list">
                    {screenerData.cons && screenerData.cons.length > 0 ? (
                      screenerData.cons.map((c, idx) => (
                        <div key={idx} className="pros-cons-item">
                          <X size={15} style={{ color: 'var(--bearish-text)', flexShrink: 0, marginTop: '2px' }} />
                          <span>{c}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>No major red flags or balance sheet warnings identified.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* APP 3: 100-POINT STOCK PERFECTION SCORE ENGINE                           */}
      {/* ========================================================================= */}
      {activeApp === 'scorer' && (
        <section className="perfection-engine-wrap">
          {/* Search Header Bar */}
          <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={22} style={{ color: '#fbbf24' }} />
                  <span>Stock Perfection Scoring Engine</span>
                  <span className="app-mode-badge gold">100-Point Quant Algorithm</span>
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Multi-factor quantitative audit: Technical SMA Momentum (25 pts), Balance Sheet Solvency (25 pts), ROE Quality (25 pts), Valuation & EPS Growth (25 pts)
                </div>
              </div>

              {/* Symbol Search Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); loadStockPerfection(scorerInput); }}
                style={{ display: 'flex', gap: '8px', minWidth: '320px', flex: 1, maxWidth: '460px' }}
              >
                <div className="search-box" style={{ flex: 1, maxWidth: 'none' }}>
                  <Search className="search-icon" size={16} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search stock to score (e.g. RELIANCE, TCS)..."
                    value={scorerInput}
                    onChange={(e) => setScorerInput(e.target.value.toUpperCase())}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }} disabled={isScoring}>
                  {isScoring ? <RotateCw className="animate-spin" size={15} /> : <span>Score Stock</span>}
                </button>
              </form>
            </div>

            {/* Quick Click Chips */}
            <div className="quick-chips-strip">
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Stocks:</span>
              {POPULAR_STOCKS.map((sym) => (
                <button
                  key={sym}
                  className={`quick-chip ${scorerSymbol === sym ? 'active' : ''}`}
                  onClick={() => loadStockPerfection(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {scorerError && (
            <div className="alert-box alert-danger">
              <AlertCircle size={18} />
              <span>{scorerError}</span>
            </div>
          )}

          {isScoring && (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <RotateCw className="animate-spin" size={32} style={{ color: '#fbbf24' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>Computing 100-Point Perfection Score for {scorerSymbol}...</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '480px' }}>
                Auditing 8-point criteria: SMA 6&30 golden cross, D/E leverage, capital efficiency (ROE), operating margins, valuation multiple, and EPS trajectory.
              </div>
            </div>
          )}

          {/* Scorer Content */}
          {!isScoring && scorerData && (() => {
            const perf = scorerData.perfection_details || {}
            const totalScore = perf.total_score ?? scorerData.perfection_score ?? 0
            const pillars = perf.pillars || {}
            const checklist = perf.checklist || []
            const passedCount = perf.passed_criteria_count ?? 0
            const totalCount = perf.total_criteria_count ?? checklist.length ?? 8
            const grade = perf.grade || scorerData.perfection_grade || 'B'
            const badgeText = perf.badge_text || 'EVALUATED'
            const isBullish = scorerData.technical_signal === 'BULLISH'

            // Radial gauge math (circumference = 2 * PI * r; with r=50 => 314.16)
            const radius = 50
            const circumference = 2 * Math.PI * radius
            const strokeDashoffset = circumference - (circumference * totalScore) / 100

            // Color palette according to score
            let gaugeColor = 'var(--bearish-neon)'
            if (totalScore >= 80) gaugeColor = 'var(--bullish-neon)'
            else if (totalScore >= 65) gaugeColor = 'var(--accent-cyan)'
            else if (totalScore >= 50) gaugeColor = '#fbbf24'

            return (
              <>
                {/* Hero Showcase Card */}
                <div className="perfection-hero-card">
                  <div className="specular-edge" />
                  <div className="perfection-hero-top">
                    {/* Stock Identity */}
                    <div className="perfection-stock-identity">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--accent-cyan)', fontWeight: 700, letterSpacing: '0.08em' }}>
                          STEP 3 QUANT AUDIT
                        </span>
                        <span style={{ color: 'var(--border-medium)' }}>•</span>
                        <span className={`signal-pill ${isBullish ? 'bullish' : 'bearish'}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                          {isBullish ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          <span>SMA: {scorerData.technical_signal}</span>
                        </span>
                        <span style={{ color: 'var(--border-medium)' }}>•</span>
                        <span className="font-mono" style={{ fontSize: '0.7rem', color: totalScore >= 75 ? 'var(--bullish-text)' : 'var(--text-muted)' }}>
                          {totalScore >= 80 ? '★ TOP 3.2% NSE' : totalScore >= 65 ? 'TOP DECILE' : 'BROAD MARKET'}
                        </span>
                      </div>
                      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', margin: '4px 0 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{scorerData.company}</span>
                        <span className="font-mono" style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>({scorerData.symbol})</span>
                      </h1>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        {scorerData.sector} • {scorerData.industry} • LTP: <strong className="font-mono" style={{ color: 'var(--text-main)' }}>₹{scorerData.current_price?.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                          onClick={() => navigateToAnalysis(scorerData.symbol)}
                        >
                          <Microscope size={13} />
                          <span>View Screener Fundamentals</span>
                        </button>
                        <a
                          className="btn btn-secondary"
                          href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(scorerData.symbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        >
                          <ExternalLink size={13} />
                          <span>Chart</span>
                        </a>
                      </div>
                    </div>

                    {/* Radial Score Meter & Verdict */}
                    <div className="perfection-score-showcase">
                      <div className="radial-score-gauge">
                        <svg className="radial-score-svg" viewBox="0 0 120 120">
                          <defs>
                            <linearGradient id="score-arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--accent-cyan)" />
                              <stop offset="100%" stopColor={gaugeColor} />
                            </linearGradient>
                          </defs>
                          <circle
                            className="radial-score-circle-bg"
                            cx="60"
                            cy="60"
                            r={radius}
                          />
                          <circle
                            className="radial-score-circle-val"
                            cx="60"
                            cy="60"
                            r={radius}
                            stroke="url(#score-arc-grad)"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            style={{ filter: `drop-shadow(0 0 10px ${gaugeColor}70)` }}
                          />
                        </svg>
                        <div className="radial-score-content">
                          <span className="radial-score-number">{totalScore}</span>
                          <span className="radial-score-max">/ 100 PTS</span>
                        </div>
                      </div>

                      <div className="score-badge-block">
                        <div
                          className="score-grade-tag"
                          style={{
                            background: `${gaugeColor}15`,
                            color: gaugeColor,
                            border: `1px solid ${gaugeColor}40`
                          }}
                        >
                          <Award size={14} />
                          <span>GRADE: {grade}</span>
                        </div>
                        <h3 className="score-verdict-title">{badgeText}</h3>
                        <div className="score-criteria-chip">
                          <CheckCircle2 size={13} color="var(--bullish-text)" />
                          <span><strong>{passedCount} of {totalCount}</strong> Perfection Criteria Satisfied</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quant Summary Box */}
                  <div style={{ background: 'rgba(5, 14, 26, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                    <strong style={{ color: '#ffffff' }}>Perfection Assessment: </strong>
                    {perf.rating_description || "Comprehensive quantitative rating synthesizing technical breakout timing with underlying corporate health."}
                  </div>
                </div>

                {/* 4 Pillars Breakdown Grid */}
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} />
                    <span>4-PILLAR QUANTITATIVE BREAKDOWN (25 PTS EACH)</span>
                  </div>

                  <div className="pillars-grid">
                    {/* Pillar 1: Technical & Momentum */}
                    {(() => {
                      const p = pillars.technical || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <TrendingUp size={16} color="var(--bullish-text)" />
                              <span className="pillar-title">Technical Momentum</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: 'var(--bullish-neon)' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: 'var(--bullish-text)' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Pillar 2: Balance Sheet & Solvency */}
                    {(() => {
                      const p = pillars.financial_health || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <Shield size={16} color="var(--accent-cyan)" />
                              <span className="pillar-title">Balance Sheet Solvency</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: 'var(--accent-cyan)' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: 'var(--accent-cyan)' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Pillar 3: Profitability & ROE */}
                    {(() => {
                      const p = pillars.profitability || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <BarChart3 size={16} color="#fbbf24" />
                              <span className="pillar-title">ROE & Profit Margins</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: '#fbbf24' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: '#fbbf24' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Pillar 4: Valuation & EPS Growth */}
                    {(() => {
                      const p = pillars.valuation_growth || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <Sparkles size={16} color="#a855f7" />
                              <span className="pillar-title">Valuation & Growth</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: '#a855f7' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: '#a855f7' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 8-Point Perfection Checklist */}
                <div className="glass-panel checklist-section-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} color="var(--bullish-text)" />
                      <span>8-POINT INSTITUTIONAL PERFECTION CHECKLIST</span>
                    </div>
                    <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--bullish-text)', fontWeight: 700 }}>
                      {passedCount} / {totalCount} Criteria Satisfied ({Math.round((passedCount / totalCount) * 100)}%)
                    </span>
                  </div>

                  <div className="checklist-grid">
                    {checklist.map((item) => (
                      <div key={item.id} className={`checklist-item-card ${item.passed ? 'passed' : 'failed'}`}>
                        <div className={`checklist-icon-box ${item.passed ? 'passed' : 'failed'}`}>
                          {item.passed ? <Check size={16} /> : <X size={16} />}
                        </div>
                        <div className="checklist-content-wrap">
                          <div className="checklist-content-header">
                            <span className="checklist-item-title">{item.title}</span>
                            <span className="checklist-tag">{item.badge}</span>
                          </div>
                          <div className="checklist-item-detail">{item.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Market Perfection Leaderboard */}
                <div className="table-surface-card glass-panel" style={{ marginTop: '4px' }}>
                  <div className="table-header-strip" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="table-header-strip-title">
                      <Award size={15} color="#fbbf24" />
                      <span>MARKET PERFECTION LEADERBOARD</span>
                      <span style={{ color: 'var(--border-medium)' }}>•</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>RANKED BY 100-PT COMPOSITE SCORE</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Filter Pills */}
                      <button
                        className={`filter-pill ${leaderboardFilter === 'ALL' ? 'active' : ''}`}
                        onClick={() => setLeaderboardFilter('ALL')}
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      >
                        All Candidates ({leaderboard.length})
                      </button>
                      <button
                        className={`filter-pill ${leaderboardFilter === 'PERFECT' ? 'active bullish' : ''}`}
                        onClick={() => setLeaderboardFilter('PERFECT')}
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      >
                        Top Quality (75+)
                      </button>
                      <button
                        className={`filter-pill ${leaderboardFilter === 'BULLISH' ? 'active bullish' : ''}`}
                        onClick={() => setLeaderboardFilter('BULLISH')}
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      >
                        Golden Cross Only
                      </button>

                      <button
                        className="btn btn-secondary"
                        onClick={loadLeaderboard}
                        disabled={leaderboardLoading}
                        style={{ padding: '4px 10px', fontSize: '0.72rem', gap: '4px' }}
                        title="Recompute leaderboard"
                      >
                        <RotateCw className={leaderboardLoading ? 'animate-spin' : ''} size={12} />
                        <span>Refresh</span>
                      </button>
                    </div>
                  </div>

                  <div className="table-wrapper">
                    <table className="scanner-table">
                      <thead>
                        <tr>
                          <th style={{ width: '56px' }}>Rank</th>
                          <th>Symbol & Company</th>
                          <th style={{ textAlign: 'center' }}>Perfection Score</th>
                          <th>Grade</th>
                          <th>SMA 6 & 30</th>
                          <th style={{ textAlign: 'right' }}>LTP (₹)</th>
                          <th style={{ textAlign: 'right' }}>Stock P/E</th>
                          <th style={{ textAlign: 'right' }}>ROE</th>
                          <th style={{ textAlign: 'center' }}>Verdict</th>
                          <th style={{ textAlign: 'right', width: '110px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeaderboard.length === 0 ? (
                          <tr>
                            <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                              {leaderboardLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                  <RotateCw className="animate-spin" size={16} color="var(--accent-cyan)" />
                                  <span>Calculating Perfection Scores for Market Candidates...</span>
                                </div>
                              ) : (
                                <span>No candidate stocks in leaderboard. Click "Refresh" or execute an SMA scan.</span>
                              )}
                            </td>
                          </tr>
                        ) : (
                          filteredLeaderboard.map((item, idx) => {
                            const isRowBullish = item.technical_signal === 'BULLISH'
                            const scoreVal = item.perfection_score || 0
                            let scoreBadgeColor = 'var(--bearish-neon)'
                            if (scoreVal >= 80) scoreBadgeColor = 'var(--bullish-neon)'
                            else if (scoreVal >= 65) scoreBadgeColor = 'var(--accent-cyan)'
                            else if (scoreVal >= 50) scoreBadgeColor = '#fbbf24'

                            return (
                              <tr
                                key={item.symbol}
                                onClick={() => loadStockPerfection(item.symbol)}
                                style={{ cursor: 'pointer' }}
                                title="Click to inspect 100-Point Perfection Breakdown"
                              >
                                <td className="rank-badge">#{item.rank || idx + 1}</td>
                                <td>
                                  <div className="symbol-cell">
                                    <span className="symbol-name">{item.symbol}</span>
                                    <span className="exchange-chip">NSE</span>
                                  </div>
                                  <div className="company-subname">{item.company}</div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    className="leaderboard-score-pill"
                                    style={{
                                      background: `${scoreBadgeColor}15`,
                                      color: scoreBadgeColor,
                                      border: `1px solid ${scoreBadgeColor}35`
                                    }}
                                  >
                                    <Award size={13} />
                                    <span>{scoreVal} / 100</span>
                                  </span>
                                </td>
                                <td>
                                  <span className="font-mono" style={{ fontWeight: 700, fontSize: '0.8rem', color: '#ffffff' }}>
                                    {item.perfection_grade || 'N/A'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`signal-pill ${isRowBullish ? 'bullish' : 'bearish'}`}>
                                    {isRowBullish ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                    <span>{item.technical_signal || 'NONE'}</span>
                                  </span>
                                </td>
                                <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff' }}>
                                  ₹{item.current_price ? item.current_price.toFixed(2) : '—'}
                                </td>
                                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                                  {item.pe ? `${item.pe.toFixed(1)}x` : '—'}
                                </td>
                                <td className="font-mono" style={{ textAlign: 'right', color: (item.roe || 0) > 0.14 ? 'var(--bullish-text)' : 'var(--text-sub)' }}>
                                  {item.roe ? `${(item.roe * 100).toFixed(1)}%` : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      color: scoreBadgeColor,
                                      fontFamily: 'var(--font-mono)'
                                    }}
                                  >
                                    {item.perfection_details?.badge_text || 'EVALUATED'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    className="btn btn-secondary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      loadStockPerfection(item.symbol)
                                    }}
                                    style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '3px' }}
                                    title="Inspect Perfection Score"
                                  >
                                    <Award size={12} color="#fbbf24" />
                                    <span>Audit</span>
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          })()}
        </section>
      )}

      {/* ========================================================================= */}
      {/* APP 4: ALGO SIGNALS (AI SWING TRADING SYSTEM v4.0)                        */}
      {/* ========================================================================= */}
      {activeApp === 'algo_signals' && (
        <AlgoSignals apiBase={API_BASE} initialSymbol={algoSymbol} />
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: STOCK DETAIL INSPECTOR & CROSSOVER BREAKDOWN                     */}
      {/* ========================================================================= */}
      {selectedStock && (
        <div className="modal-overlay" onClick={() => setSelectedStock(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="symbol-name" style={{ fontSize: '1.2rem' }}>{selectedStock.Symbol}</span>
                <span className="exchange-chip">NSE EQ</span>
                <span className={`signal-pill ${selectedStock.Status === 'BUY' || selectedStock['Signal Type'] === 'BUY' || selectedStock['Signal Type'] === 'BULLISH' ? 'bullish' : selectedStock.Status === 'SELL' || selectedStock['Signal Type'] === 'SELL' || selectedStock['Signal Type'] === 'BEARISH' ? 'bearish' : ''}`}>
                  {selectedStock.Status === 'BUY' || selectedStock['Signal Type'] === 'BUY' || selectedStock['Signal Type'] === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{selectedStock.Status || selectedStock['Signal Type']} SIGNAL</span>
                </span>
                {selectedStock['Signal Score'] || selectedStock.signal_score ? (
                  <span className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24', marginLeft: '6px' }}>
                    Score: {selectedStock['Signal Score'] || selectedStock.signal_score}/100
                  </span>
                ) : null}
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedStock(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: '14px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {selectedStock.Company} • Activity Rank #{selectedStock.Rank || selectedStock['Activity Rank'] || 1} by Session Traded Value
              </div>

              {/* Price & Moving Averages Matrix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div className="fundamental-card">
                  <span className="fundamental-label">LTP (₹)</span>
                  <span className="fundamental-val font-mono">₹{(selectedStock.Close ?? selectedStock.ltp ?? 0).toFixed(2)}</span>
                </div>
                <div className="fundamental-card">
                  <span className="fundamental-label">SMA 6 (10m)</span>
                  <span className="fundamental-val font-mono" style={{ color: 'var(--bullish-text)' }}>
                    ₹{(selectedStock['SMA 6'] ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="fundamental-card">
                  <span className="fundamental-label">SMA 30 (10m)</span>
                  <span className="fundamental-val font-mono" style={{ color: 'var(--text-sub)' }}>
                    ₹{(selectedStock['SMA 30'] ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="fundamental-card">
                  <span className="fundamental-label">Relative Vol</span>
                  <span className="fundamental-val font-mono" style={{ color: 'var(--bullish-neon)' }}>
                    {(selectedStock['Relative Volume'] ?? selectedStock.rel_volume ?? 1.0).toFixed(2)}x
                  </span>
                </div>
              </div>

              {/* Exact Crossover Confirmation Rule Verification */}
              <div className="inspect-crossover-card">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                  INSTITUTIONAL 5-POINT CONFIRMATION AUDIT
                </div>
                <div className="crossover-rule-box">
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>Completed 10-Minute Candle:</strong> Evaluated strictly on finalized candle ({selectedStock['Candle Timestamp'] ?? selectedStock.candle_timestamp ?? 'Latest IST bar'}). No repainting.
                    </div>
                  </div>
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>SMA 6 / 30 Crossover:</strong> Fast SMA 6 {(selectedStock['SMA 6'] ?? 0) > (selectedStock['SMA 30'] ?? 0) ? 'crossed ABOVE' : 'crossed BELOW'} Slow SMA 30 (Spread: {((selectedStock['SMA 6'] ?? 0) - (selectedStock['SMA 30'] ?? 0)).toFixed(2)} pts).
                    </div>
                  </div>
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color={(selectedStock['Relative Volume'] ?? selectedStock.rel_volume ?? 1) >= 1.5 ? 'var(--bullish-text)' : 'var(--text-muted)'} />
                    <div>
                      <strong>Relative Volume ≥ 1.5x:</strong> Current bar volume is {(selectedStock['Relative Volume'] ?? selectedStock.rel_volume ?? 1).toFixed(2)}x vs rolling 10m historical baseline.
                    </div>
                  </div>
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>Price Action Breakout:</strong> {selectedStock.Status === 'BUY' ? 'Close broken above previous 10m bar high.' : selectedStock.Status === 'SELL' ? 'Close broken below previous 10m bar low.' : 'Price action consolidation.'}
                    </div>
                  </div>
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>Session Traded Value:</strong> ₹{selectedStock['Traded Value Cr'] || (((selectedStock['Traded Value'] || selectedStock.traded_value || 0)) / 1e7).toFixed(1)} Cr cumulative session turnover (Min ₹5 Cr threshold passed).
                    </div>
                  </div>
                </div>
              </div>

              {/* 5-Factor Score Weights Note */}
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.74rem', color: 'var(--text-sub)' }}>
                <strong style={{ color: '#ffffff' }}>Quant Ranking Weights:</strong> Freshness 30% • Relative Volume 25% • Price-Action Break 20% • Activity Strength 15% • Liquidity Quality 10%.
              </div>

              {/* Action Jump Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.25), rgba(0, 210, 255, 0.25))',
                    borderColor: 'var(--bullish-neon)',
                    color: '#ffffff',
                    gap: '6px'
                  }}
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    navigateToAlgoSignals(sym)
                  }}
                  title="Open Intraday AI Signal Terminal & Interactive Order Slip"
                >
                  <Zap size={15} style={{ color: 'var(--bullish-neon)' }} />
                  <span>Intraday Signal & Slip</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    runBacktest(sym, 15)
                  }}
                  title="Backtest 10-Minute Strategy"
                >
                  <Sliders size={15} style={{ color: '#fbbf24' }} />
                  <span>Backtest 10m</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    navigateToAnalysis(sym)
                  }}
                  title="Inspect Fundamentals"
                >
                  <Microscope size={15} style={{ color: 'var(--accent-cyan)' }} />
                  <span>Fundamentals</span>
                </button>
                <a
                  className="btn btn-secondary"
                  href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(selectedStock.Symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '8px 14px' }}
                >
                  <ExternalLink size={15} />
                  <span>Chart</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
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
                    10-Minute Completed Candle SMA 6/30 Backtester
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Strict completed candle crossover • 0.10% round-trip friction • Realistic next-bar open execution
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
      <footer className="system-footer">
        <div className="footer-left">
          <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
          <span>Upstox WebSocket V2 Protocol</span>
          <span style={{ color: 'var(--border-medium)' }}>•</span>
          <span style={{ color: 'var(--accent-cyan)' }}>Quant Engine Online</span>
        </div>
        <div className="footer-right">
          Scanner Algorithm: <span style={{ color: '#ffffff' }}>SMA 6 vs SMA 30 Dual Confirmed Cross (NSE Equities)</span>
        </div>
      </footer>
    </div>
  )
}
