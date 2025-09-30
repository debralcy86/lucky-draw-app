import React, { useCallback, useState } from 'react';
import { AppStateProvider, useAppState } from '../../state/appState';
import * as Screens from '../../screens';

function resolveScreenComponent(screen) {
  const { key, params } = screen;
  const map = {
    welcome: Screens.WelcomeScreen,
    login: Screens.LoginScreen,
    dashboard: Screens.DashboardScreen,
    join: Screens.JoinScreen,
    confirm: Screens.ConfirmScreen,
    deposit: Screens.DepositScreen,
    history: Screens.HistoryScreen,
    withdrawRequest: Screens.WithdrawRequestScreen,
    withdrawSetup: Screens.WithdrawSetupScreen,
    invite: Screens.InviteScreen,
    adminDashboard: Screens.AdminDashboardScreen,
    adminUsers: Screens.AdminUserManagementScreen,
    adminPoints: Screens.AdminPointsTrackingScreen,
    adminFigures: Screens.AdminFiguresDataScreen,
    adminResults: Screens.AdminResultPostingScreen,
  };
  if (key === 'board') {
    // Prefer group-specific exports; if missing, show default fallback below
    const g = (params && params.group) || 'A';
    const specific = {
      A: Screens.BoardAScreen,
      B: Screens.BoardBScreen,
      C: Screens.BoardCScreen,
      D: Screens.BoardDScreen,
    }[g];
    return specific;
  }
  return map[key];
}

function ShellInner() {
  const { state, navigate, setAuth } = useAppState();
  const [debugMode, setDebugMode] = useState(false);
  const [adminGate, setAdminGate] = useState({ checking: false, error: '', lastReason: '' });
  const auth = state.auth;
  const Comp = resolveScreenComponent(state.screen);

  const ensureAdmin = useCallback(async (options = {}) => {
    const { silent } = options;
    if (auth?.isAdmin) {
      return true;
    }

    if (auth?.adminCheckedAt && auth.isAdmin === false && auth?.adminDeniedReason === 'not_admin' && !options?.force) {
      if (!silent) {
        alert('Admin access is restricted to authorized accounts.');
      }
      return false;
    }

    const initDataFn = typeof Screens.getInitData === 'function' ? Screens.getInitData : null;
    const initData = initDataFn ? initDataFn() : ((typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) || '');
    if (!initData) {
      const message = 'Telegram init data missing. Open via Telegram to verify admin access.';
      setAdminGate({ checking: false, error: message, lastReason: 'missing_init_data' });
      setAuth({
        isAdmin: false,
        adminCheckedAt: new Date().toISOString(),
        adminDeniedReason: 'missing_init_data',
      });
      if (!silent) {
        alert(message);
      }
      return false;
    }

    setAdminGate({ checking: true, error: '', lastReason: '' });

    try {
      const res = await fetch('/api/whoami', {
        method: 'POST',
        headers: {
          'Authorization': 'tma ' + initData,
        },
      });
      const json = await res.json().catch(() => ({}));
      const nowIso = new Date().toISOString();

      if (!res.ok || !json?.ok) {
        const reason = json?.reason || `status_${res.status}`;
        const message = json?.message || 'Admin verification failed.';
        setAdminGate({ checking: false, error: message, lastReason: reason });
        setAuth({
          isAdmin: false,
          adminCheckedAt: nowIso,
          adminDeniedReason: reason,
          adminWhoamiStatus: 'error',
        });
        if (!silent) {
          alert(message);
        }
        return false;
      }

      const isAdmin = !!json.isAdmin;
      const patch = {
        isAdmin,
        adminCheckedAt: nowIso,
        adminDeniedReason: isAdmin ? null : (json.reason || 'not_admin'),
        whoamiTag: json.tag || auth?.whoamiTag || null,
        adminWhoamiStatus: 'ok',
      };
      if (json.userId) patch.userId = String(json.userId);
      if (json.user) patch.telegramUser = json.user;

      setAuth(patch);
      if (!isAdmin) {
        const message = 'Admin access is restricted to authorized accounts.';
        setAdminGate({ checking: false, error: message, lastReason: patch.adminDeniedReason || 'not_admin' });
        if (!silent) {
          alert(message);
        }
        return false;
      }

      setAdminGate({ checking: false, error: '', lastReason: '' });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAdminGate({ checking: false, error: message, lastReason: 'network_error' });
      setAuth({
        isAdmin: false,
        adminCheckedAt: new Date().toISOString(),
        adminDeniedReason: 'network_error',
        adminWhoamiStatus: 'network_error',
      });
      if (!silent) {
        alert(`Unable to verify admin access. ${message}`);
      }
      return false;
    }
  }, [auth, setAuth]);

  const onNavigate = useCallback((next, payload) => {
    if (typeof next === 'string' && next.startsWith('admin')) {
      ensureAdmin().then((allowed) => {
        if (allowed) {
          navigate(next, payload);
        }
      });
      return;
    }
    navigate(next, payload);
  }, [ensureAdmin, navigate]);

  const adminButtonLabel = adminGate.checking ? 'Checking admin…' : 'Admin';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Lucky Draw Mini App</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Balance: {state.wallet.balance.toLocaleString()} pts</span>
          <button onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button onClick={() => onNavigate('history')}>History</button>
          <button onClick={() => onNavigate('deposit')}>Deposit</button>
          <button onClick={() => onNavigate('withdrawRequest')}>Withdraw Request</button>
          <button onClick={() => onNavigate('withdrawSetup')}>Withdraw</button>
          <button onClick={() => onNavigate('invite')}>Invite</button>
          <button onClick={() => onNavigate('adminDashboard')} disabled={adminGate.checking}>
            {adminButtonLabel}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            Debug overlays
          </label>
          {typeof window !== 'undefined' && window.Telegram?.WebApp && (
            <button onClick={() => window.Telegram.WebApp.expand()} title="Expand to full height">Full height</button>
          )}
        </div>
        {!adminGate.checking && adminGate.error && (
          <div style={{ width: '100%', fontSize: 12, color: '#b42318' }}>
            {adminGate.error}
          </div>
        )}
      </header>
      <main>
        {Comp ? (
          <Comp onNavigate={onNavigate} params={state.screen.params} debug={debugMode} />
        ) : (
          <div style={{ padding: 24, border: '1px dashed #aaa' }}>
            <p>No screen component registered for key: <code>{state.screen.key}</code></p>
            <p>Expected exports from <code>src/screens/index.js</code>.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AppShell() {
  return (
    <AppStateProvider>
      <ShellInner />
    </AppStateProvider>
  );
}
