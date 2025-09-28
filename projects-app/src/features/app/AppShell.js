import React, { useState } from 'react';
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
  const { state, navigate } = useAppState();
  const [debugMode, setDebugMode] = useState(false);
  const Comp = resolveScreenComponent(state.screen);

  const onNavigate = (next, payload) => navigate(next, payload);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Lucky Draw Mini App</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Balance: {state.wallet.balance.toLocaleString()} pts</span>
          <button onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button onClick={() => onNavigate('history')}>History</button>
          <button onClick={() => onNavigate('deposit')}>Deposit</button>
          <button onClick={() => onNavigate('withdrawRequest')}>Withdraw Request</button>
          <button onClick={() => onNavigate('withdrawSetup')}>Withdraw</button>
          <button onClick={() => onNavigate('invite')}>Invite</button>
          <button onClick={() => onNavigate('adminDashboard')}>Admin</button>
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
