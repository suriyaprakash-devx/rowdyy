import React, { useState } from 'react'
import {
  Sliders,
  X,
  ShieldCheck,
  Bell,
  Clock,
  Layout,
  Target,
  AlertOctagon,
  Save,
  Check
} from 'lucide-react'

export default function SMCSettingsModal({
  isOpen,
  onClose,
  config,
  onSave
}) {
  const [timeframe, setTimeframe] = useState(config?.timeframe || '10m')
  const [universe, setUniverse] = useState(config?.universe || 'ALL')
  const [refreshInterval, setRefreshInterval] = useState(config?.refreshInterval ?? 180)
  const [maxRiskInr, setMaxRiskInr] = useState(config?.maxRiskInr || 1000)
  const [capitalInr, setCapitalInr] = useState(config?.capitalInr || 50000)
  const [minRewardRisk, setMinRewardRisk] = useState(config?.minRewardRisk || '1:2')
  const [soundAlerts, setSoundAlerts] = useState(config?.soundAlerts ?? true)
  const [viewMode, setViewMode] = useState(config?.viewMode || 'cards_and_table')
  const [savedSuccess, setSavedSuccess] = useState(false)

  if (!isOpen) return null

  const handleSave = () => {
    onSave({
      timeframe,
      universe,
      refreshInterval,
      maxRiskInr: Number(maxRiskInr),
      capitalInr: Number(capitalInr),
      minRewardRisk,
      soundAlerts,
      viewMode
    })
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onClose()
    }, 600)
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '92vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(30, 41, 59, 0.5)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="#60a5fa" />
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
              Scanner & Risk Preferences
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Timeframe & Universe */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Clock size={13} /> Default Completed Candle
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  fontSize: '0.82rem'
                }}
              >
                <option value="5m">5-Minute Candles (Fast Intraday)</option>
                <option value="10m">10-Minute Candles (Standard Recommended)</option>
                <option value="15m">15-Minute Candles (Structural Anchor)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Layout size={13} /> Stock Universe
              </label>
              <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  fontSize: '0.82rem'
                }}
              >
                <option value="ALL">NIFTY 500 Constituents (Full Universe)</option>
                <option value="MOST_ACTIVE">Top 50 Most Active by Traded Value</option>
                <option value="NIFTY50">NIFTY 50 Bluechips Only</option>
                <option value="NIFTY100">NIFTY 100 Large Caps</option>
                <option value="NIFTY200">NIFTY 200 Universe</option>
              </select>
            </div>
          </div>

          {/* Auto Refresh & Min R:R */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Clock size={13} /> Auto-Scan Cadence
              </label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  fontSize: '0.82rem'
                }}
              >
                <option value={60}>Every 1 Minute (60s)</option>
                <option value={180}>Every 3 Minutes (180s - Recommended)</option>
                <option value={300}>Every 5 Minutes (300s)</option>
                <option value={0}>Manual Only (Off)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Target size={13} /> Minimum Reward-to-Risk
              </label>
              <select
                value={minRewardRisk}
                onChange={(e) => setMinRewardRisk(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  fontSize: '0.82rem'
                }}
              >
                <option value="1:2">1:2 Minimum (Asymmetric)</option>
                <option value="1:2.5">1:2.5 Minimum</option>
                <option value="1:3">1:3 Minimum (High Confluence)</option>
              </select>
            </div>
          </div>

          {/* Risk Budgeting Controls */}
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', marginBottom: '10px' }}>
              INR Risk & Capital Allocation (Trader-Budget)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Trading Capital (₹ INR)
                </label>
                <input
                  type="number"
                  value={capitalInr}
                  onChange={(e) => setCapitalInr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Max Risk Per Setup (₹ INR)
                </label>
                <input
                  type="number"
                  value={maxRiskInr}
                  onChange={(e) => setMaxRiskInr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Sound & Notifications */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={16} color="#fbbf24" />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>Audio Alert on Confirmed SMC Signal</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Plays a soft chime when a valid BUY or SELL setup triggers</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={soundAlerts}
              onChange={(e) => setSoundAlerts(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </div>

          {/* Mandatory Safety Notice */}
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '12px', display: 'flex', gap: '10px' }}>
            <AlertOctagon size={18} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.74rem', color: '#fca5a5', lineHeight: '1.4' }}>
              <strong>Institutional Compliance & Safety Gate (Locked):</strong> Automated broker order execution is permanently disabled by system design. All positions require manual broker ticket submission. Mandatory 15:15 IST auto square-off warning cannot be bypassed.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: 'rgba(30, 41, 59, 0.5)'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: savedSuccess ? '#10b981' : 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {savedSuccess ? <Check size={14} /> : <Save size={14} />}
            <span>{savedSuccess ? 'Saved Preferences!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
