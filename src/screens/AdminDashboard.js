import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/apiFetch.js';
import {
  AdminPointsTrackingScreen,
  AdminFiguresDataScreen,
  AdminResultPostingScreen,
  AdminReportsScreen,
  getInitData,
} from '.';

export function AdminUserManagementScreen({ onNavigate = () => {}, debug = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [toast, setToast] = useState({ message: '', kind: 'info' });
  const [toastTimer, setToastTimer] = useState(null);

  function showToast(message, kind = 'info', ttlMs = 2500) {
    try {
      if (toastTimer) clearTimeout(toastTimer);
    } catch (e) {}
    setToast({ message: String(message || ''), kind });
    const t = setTimeout(() => setToast({ message: '', kind }), ttlMs);
    setToastTimer(t);
  }

  useEffect(() => {
    return () => {
      if (toastTimer) {
        try {
          clearTimeout(toastTimer);
        } catch (e) {}
      }
    };
  }, [toastTimer]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    const initData = typeof getInitData === 'function' ? getInitData() : '';
    if (!initData) {
      setError('Missing Telegram init data. Please open this mini app inside Telegram.');
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch('/api/admin', {
        method: 'POST',
        initData,
        jsonBody: { action: 'list_profiles', limit, offset },
      });
      if (!res || res.ok === false) {
        const reason = (res && (res.reason || res.error)) || `HTTP error`;
        setError(`Failed to load profiles: ${reason}`);
        setRows([]);
        return;
      }
      const list = Array.isArray(res.profiles)
        ? res.profiles
        : Array.isArray(res.rows)
        ? res.rows
        : [];
      setRows(list);
    } catch (err) {
      setError(String(err?.message || err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function callAdmin(action, payload = {}) {
    const init = typeof getInitData === 'function' ? getInitData() : '';
    if (!init) {
      setError('Missing admin initData');
      return null;
    }
    try {
      const json = await apiFetch('/api/admin', {
        method: 'POST',
        initData: init,
        jsonBody: { action, ...payload },
      });
      if (!json || json.ok !== true) {
        showToast(
          `Admin action failed: ${(json && (json.reason || json.error)) || 'unknown_error'}`,
          'error',
          3500
        );
        return null;
      }
      return json;
    } catch (e) {
      showToast('Admin action failed: ' + String(e?.message || e), 'error', 3500);
      return null;
    }
  }

  async function onToggleAdmin(user) {
    const resp = await callAdmin('user_update', { user_id: user.user_id, is_admin: !user.is_admin });
    if (resp) loadUsers();
  }

  async function onResetPin(user) {
    const resp = await callAdmin('user_reset_pin', { user_id: user.user_id });
    if (resp && resp.new_pin) {
      showToast(`PIN reset for ${user.user_id}. New PIN: ${resp.new_pin}`, 'success', 4000);
    } else if (resp) {
      showToast(`PIN reset for ${user.user_id}`, 'success', 4000);
    }
  }

  async function handleRequestAction(type, action, row) {
    if (!row) return;
    const activeMatches = row.active_request_type === type;
    let requestId = activeMatches ? row.active_request_id : null;
    if (!requestId) {
      requestId = type === 'deposit' ? row.deposit_request_id : row.withdraw_request_id;
    }
    if (!requestId) {
      requestId = window.prompt(`Enter ${type} request id`);
    }
    if (!requestId) return;
    try {
      if (type === 'deposit') {
        const endpointAction = action === 'approve' ? 'approve_deposit' : 'reject_deposit';
        const resp = await callAdmin(endpointAction, { requestId });
        if (resp) {
          const verb = action === 'approve' ? 'approved' : 'rejected';
          showToast(`Deposit ${verb}`, 'success');
          await loadUsers();
        }
        return;
      }
      const approve = action === 'approve';
      const resp = await callAdmin('approve_withdraw', { requestId, approve });
      if (resp) {
        showToast(`Withdraw ${approve ? 'approved' : 'rejected'}`, 'success');
        await loadUsers();
      }
    } catch (err) {
      console.error('admin.action.error', err);
      showToast('Admin action failed. Check console for details.', 'error', 4000);
    }
  }

  function buildRequestInfo(row, type) {
    const active = row.active_request_type === type;
    const activeStatus = active ? row.active_request_status : null;
    const activeId = active ? row.active_request_id : null;
    const legacyStatus = type === 'deposit' ? row.deposit_status : row.withdraw_status;
    const legacyId = type === 'deposit' ? row.deposit_request_id : row.withdraw_request_id;
    const effectiveId = activeId || legacyId || null;
    const shortId = effectiveId ? `${String(effectiveId).slice(0, 8)}...` : '';
    let label;
    if (active) {
      label =
        activeStatus === 'pending'
          ? `${type === 'deposit' ? 'Deposit' : 'Withdraw'}: pending`
          : `${type === 'deposit' ? 'Deposit' : 'Withdraw'}: ${activeStatus} ${
              shortId ? `(${shortId})` : ''
            }`;
    } else if (legacyStatus) {
      label = `${type === 'deposit' ? 'Deposit' : 'Withdraw'}: ${legacyStatus} ${
        shortId ? `(${shortId})` : ''
      }`;
    } else {
      label = `No pending ${type}`;
    }
    return {
      label,
      canApprove: active && activeStatus === 'pending',
      shortId,
    };
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back</button>
        <button onClick={loadUsers} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span>Limit</span>
          <input
            type="number"
            min={5}
            max={200}
            step={5}
            value={limit}
            onChange={(e) => setLimit(Math.max(5, Math.min(200, Number(e.target.value) || 25)))}
            style={{ width: 80 }}
          />
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>v: admin-users-table-02</div>
      </div>

      {toast.message ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            border: '1px solid ' + (toast.kind === 'error' ? '#b42318' : toast.kind === 'success' ? '#0a7' : '#2563eb'),
            background: toast.kind === 'error' ? '#FEF2F2' : toast.kind === 'success' ? '#ECFDF5' : '#EFF6FF',
            color: toast.kind === 'error' ? '#7F1D1D' : toast.kind === 'success' ? '#065F46' : '#1E3A8A',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      ) : null}

      {error && <div style={{ color: '#b42318', fontSize: 13 }}>{error}</div>}

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14 }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>User ID</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Contact</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Admin</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Has PIN</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Updated</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Status / Request Type</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '12px 10px', color: '#6b7280' }}>
                  {loading ? 'Loading...' : 'No rows'}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const deposit = buildRequestInfo(row, 'deposit');
              const withdraw = buildRequestInfo(row, 'withdraw');
              return (
                <tr key={row.user_id || row.id}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{row.user_id || row.id}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{row.name || row.full_name || ''}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{row.contact || row.phone || ''}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{String(row.is_admin ?? false)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{String(row.has_pin ?? false)}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>{row.updated_at || row.created_at || ''}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    {(() => {
                      const status = row.active_request_status ?? row.status;
                      const type = row.active_request_type ?? row.request_type;
                      if (status && type) return `${type}: ${status}`;
                      return status || type || '-';
                    })()}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                    <button onClick={() => onToggleAdmin(row)}>{row.is_admin ? 'Revoke Admin' : 'Make Admin'}</button>
                    <button onClick={() => onResetPin(row)} style={{ marginLeft: 6 }}>
                      Reset PIN
                    </button>

                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{deposit.label}</div>
                      <button onClick={() => handleRequestAction('deposit', 'approve', row)} disabled={!deposit.canApprove}>
                        Approve Deposit
                      </button>
                      <button onClick={() => handleRequestAction('deposit', 'reject', row)} style={{ marginLeft: 6 }} disabled={!deposit.canApprove}>
                        Reject Deposit
                      </button>
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{withdraw.label}</div>
                      <button onClick={() => handleRequestAction('withdraw', 'approve', row)} disabled={!withdraw.canApprove}>
                        Approve Withdraw
                      </button>
                      <button onClick={() => handleRequestAction('withdraw', 'reject', row)} style={{ marginLeft: 6 }} disabled={!withdraw.canApprove}>
                        Reject Withdraw
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setOffset((prev) => Math.max(0, prev - limit))} disabled={offset === 0 || loading}>
          Prev
        </button>
        <button onClick={() => setOffset((prev) => prev + limit)} disabled={loading || rows.length < limit}>
          Next
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboardScreen({ onNavigate = () => {}, debug = false, ...rest }) {
  const screenOptions = useMemo(
    () => [
      { key: 'userManagement', label: 'User Management', component: AdminUserManagementScreen },
      { key: 'pointsTracking', label: 'Points Tracking', component: AdminPointsTrackingScreen },
      { key: 'figuresData', label: 'Figures Data', component: AdminFiguresDataScreen },
      { key: 'resultPosting', label: 'Result Posting', component: AdminResultPostingScreen },
      { key: 'reports', label: 'Reports', component: AdminReportsScreen },
    ],
    []
  );
  const [selectedKey, setSelectedKey] = useState(screenOptions[0].key);
  const [metrics, setMetrics] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function authHeaders() {
    const init = (getInitData && getInitData()) || '';
    const headers = { 'Content-Type': 'application/json' };
    if (init) headers['Authorization'] = 'tma ' + init;
    if (typeof window !== 'undefined' && window.__CRON_KEY__) headers['x-cron-key'] = window.__CRON_KEY__;
    return headers;
  }

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'metrics' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.reason || 'Failed to load metrics');
      setMetrics(json.metrics || json);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTxns = useCallback(async () => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'txns', limit: 10 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.reason || 'Failed to load txns');
      setTxns(Array.isArray(json.txns) ? json.txns : []);
    } catch (e) {
      setError((prev) => prev || String(e.message || e));
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchTxns();
  }, [fetchMetrics, fetchTxns]);

  const SelectedScreenComponent = useMemo(() => {
    const option = screenOptions.find((opt) => opt.key === selectedKey);
    return option ? option.component : null;
  }, [selectedKey, screenOptions]);

  return (
    <div style={{ color: '#000', padding: '1rem', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid #333', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>Overview</strong>
          {loading && <span>Loading...</span>}
          {error && <span style={{ color: '#ff6b6b' }}>{error}</span>}
          <button onClick={() => { fetchMetrics(); fetchTxns(); }} style={{ padding: '0.4rem 0.8rem' }}>
            Refresh
          </button>
        </div>
        <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <div>Total Users: {metrics?.total_users ?? metrics?.profiles ?? '-'}</div>
          <div>Total Balance: {metrics?.total_balance ?? '-'}</div>
          <div>Open Draw: {metrics?.open_draw ?? '-'}</div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Latest Transactions</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Date</th>
                <th align="left">Type</th>
                <th align="right">Amount</th>
                <th align="center">User</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td>{t.type}</td>
                  <td align="right">{t.amount}</td>
                  <td align="center">{t.user_id ? String(t.user_id).slice(-4) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} style={{ marginBottom: '1rem', padding: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
        {screenOptions.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>

      {SelectedScreenComponent ? <SelectedScreenComponent onNavigate={onNavigate} debug={debug} {...rest} /> : null}
    </div>
  );
}

