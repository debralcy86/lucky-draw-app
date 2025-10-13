import LoginGate from './LoginGate.jsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, resolveApiBase } from './api'
import { BOARD_GROUPS, FIGURE_GRID_NORMALIZED, FIGURE_GRID_ASPECT } from './lib/legacyAdminSnippets.js';

function __hasCronKey() {
  try {
    const k1 = (typeof window !== 'undefined' && window.CRON_KEY) ? String(window.CRON_KEY).trim() : '';
    const k2 = (typeof localStorage !== 'undefined' && localStorage.getItem('cronKey')) ? String(localStorage.getItem('cronKey')).trim() : '';
    return Boolean(k1 || k2);
  } catch (_) {
    return Boolean(typeof window !== 'undefined' && window.CRON_KEY && String(window.CRON_KEY).trim());
  }
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <strong style={{ minWidth: 140 }}>{label}</strong>
      <span>{value}</span>
    </div>
  )
}

export default function App() {
  const [{ base, source }, setBaseInfo] = useState(() => resolveApiBase())
  const [baseNote, setBaseNote] = useState('')
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)

  const [activeGroup, setActiveGroup] = useState('A');
  const [draws, setDraws] = useState([]);
  const [txns, setTxns] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);

  const [token, setToken] = useState('')
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('changeme')

  useEffect(() => {
    const info = resolveApiBase()
    setBaseInfo(info)
    if (!info.base) {
      setBaseNote('API base unavailable. Set VITE_API_BASE to your backend domain.')
    } else if (info.source !== 'env') {
      setBaseNote('VITE_API_BASE not set; defaulting to current origin.')
    } else {
      setBaseNote('')
    }
  }, [])

  const fetchMetrics = useCallback(async () => {
    if (!__hasCronKey()) { setError('Enter CRON_KEY to fetch metrics'); return }
    try {
      setLoading(true)
      const data = await api.metrics()
      setMetrics(data)
      setError('')
    } catch (err) {
      setMetrics(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const checkSession = useCallback(async () => {
    if (!__hasCronKey()) { setStatus('unauthenticated'); setError('Enter CRON_KEY to check session'); return }
    if (!base) {
      setStatus('no-base')
      return
    }
    setStatus('checking')
    setError('')
    try {
      const info = await api.whoami()
      // const info = await api.whoami()
      const isAdmin = !!(info && (info.isAdmin === true || info.admin === true || (info.user && info.user.role === 'admin')));
      const normalized = { ...info, isAdmin };
      setUser(normalized);
      // setUser(info)
      setStatus('authenticated')
      await fetchMetrics()
    } catch (err) {
      setUser(null)
      setMetrics(null)
      setStatus('unauthenticated')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [base, fetchMetrics])

  useEffect(() => {
    if (!__hasCronKey()) return
    checkSession()
  }, [checkSession])

  const handleLogin = useCallback(async (mode) => {
    setLoading(true)
    setError('')
    try {
      if (mode === 'token' && token.trim()) {
        await api.loginWithToken(token.trim())
      } else {
        await api.loginWithPassword(email.trim(), password)
      }
      await checkSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [token, email, password, checkSession])

  const handleLogout = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await api.logout()
      setUser(null)
      setMetrics(null)
      setStatus('unauthenticated')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const metricsDisplay = useMemo(() => {
    if (!metrics) return null
    return (
      <pre style={{ background: '#0f172a', color: '#f8fafc', padding: 16, borderRadius: 8, overflowX: 'auto' }}>
        {JSON.stringify(metrics, null, 2)}
      </pre>
    )
  }, [metrics])

  return (
    <LoginGate>
      <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ marginBottom: 8 }}>Lucky Draw Admin</h1>
          <InfoRow label="API Base" value={base || '(not resolved)'} />
          <InfoRow label="Source" value={source} />
          {baseNote && (
            <div style={{ marginTop: 8, color: '#b45309', fontSize: 14 }}>
              {baseNote}
            </div>
          )}
          {(
            (!__hasCronKey() && (
              <div style={{ marginTop: 8, color: '#b45309', fontSize: 14 }}>
                Enter CRON_KEY to connect to admin APIs.
              </div>
            )) ||
            (error && (
              <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 14 }}>
                {error}
              </div>
            ))
          )}
        </header>

        {status === 'authenticated' && user ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Session</h2>
              <button onClick={checkSession} disabled={loading} style={{ padding: '6px 12px' }}>
                Refresh Session
              </button>
              <button onClick={fetchMetrics} disabled={loading} style={{ padding: '6px 12px' }}>
                Refresh Metrics
              </button>
              <button onClick={handleLogout} disabled={loading} style={{ padding: '6px 12px' }}>
                Logout
              </button>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #d0d7de', borderRadius: 8, padding: 16 }}>
              <InfoRow label="Admin?" value={String(user?.isAdmin || user?.admin || (user?.user && user.user.role === 'admin'))} />
              <InfoRow label="User ID" value={user?.userId || '—'} />
              <InfoRow label="Telegram Tag" value={user?.tag || user?.whoamiTag || '—'} />
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Metrics</h3>
              {loading && !metrics && <div>Loading metrics…</div>}
              {metricsDisplay || <div>No metrics yet.</div>}
            </div>
            <div>
              <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                {BOARD_GROUPS.map((g) => (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    style={{
                      padding: '6px 10px',
                      background: g === activeGroup ? '#2563eb' : '#e2e8f0',
                      color: g === activeGroup ? 'white' : 'black',
                      borderRadius: 6,
                      border: 'none',
                    }}
                  >
                    Group {g}
                  </button>
                ))}
              </div>
              <h3 style={{ marginTop: 32, marginBottom: 8 }}>Draws</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => {
                  try {
                    setLoading(true);
                    const res = await api.fetch('admin-draws'); // wrapper expected in api.js
                    alert(JSON.stringify(res, null, 2));
                  } catch (err) {
                    alert('Failed to load draws: ' + (err.message || err));
                  } finally {
                    setLoading(false);
                  }
                }} disabled={loading}>View Draws</button>
                <button onClick={async () => {
                  try {
                    setLoading(true);
                    const res = await api.fetch('open-draw');
                    alert('Open Draw: ' + JSON.stringify(res, null, 2));
                  } catch (err) {
                    alert('Error fetching open draw: ' + (err.message || err));
                  } finally {
                    setLoading(false);
                  }
                }} disabled={loading}>Open Draw Info</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: '#475569' }}>
                Currently viewing data for group: <strong>{activeGroup}</strong>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 style={{ margin: 0, marginBottom: 8 }}>Figures Grid (legacy layout)</h3>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: `${FIGURE_GRID_ASPECT + 6}%`, // normalized grid + breathing room
                  background: '#0b1220',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {FIGURE_GRID_NORMALIZED.map((r, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedCell(idx)}
                    title={`cell ${idx + 1}`}
                    style={{
                      position: 'absolute',
                      left: `${r.left}%`,
                      top: `${r.top}%`,
                      width: `${r.width}%`,
                      height: `${r.height}%`,
                      border: `2px solid ${selectedCell === idx ? '#38bdf8' : '#22d3ee'}`,
                      background: selectedCell === idx ? 'rgba(56,189,248,0.20)' : 'rgba(34,211,238,0.10)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              {selectedCell !== null && (
                <div style={{ color: '#e2e8f0', fontSize: 13, marginTop: 8 }}>
                  Selected cell <strong>#{selectedCell + 1}</strong> — row {Math.floor(selectedCell / 9) + 1}, col {(selectedCell % 9) + 1} — group <strong>{activeGroup}</strong>
                </div>
              )}
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
                Grid coordinates reused from <em>admin screens 09–14</em>.
              </div>
            </div>

            <div>
              <h3 style={{ marginTop: 32, marginBottom: 8 }}>Transactions</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => {
                  try {
                    setLoading(true);
                    const res = await api.fetch('admin-txns');
                    alert('Recent Transactions: ' + JSON.stringify(res, null, 2));
                  } catch (err) {
                    alert('Failed to fetch transactions: ' + (err.message || err));
                  } finally {
                    setLoading(false);
                  }
                }} disabled={loading}>View Transactions</button>
              </div>
            </div>
          </section>
        ) : (
          <section style={{ maxWidth: 420 }}>
            <h2>Admin Login</h2>
            <p style={{ color: '#475569', fontSize: 14 }}>
              Use a static token or your email/password credentials to begin an authenticated session.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleLogin(token.trim() ? 'token' : 'password')
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Static Token</span>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste admin token (optional)"
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                />
              </label>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>— or —</div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5f5' }}
                />
              </label>
              <button type="submit" disabled={loading} style={{ padding: '10px 12px' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </section>
        )}
      </div>
    </LoginGate>
  )
}
