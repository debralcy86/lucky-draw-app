/* eslint-disable react-hooks/rules-of-hooks */
import HotspotImage from '../components/HotspotImage.js'
import { formatGroup, formatFigure, formatGroupFigure } from '../lib/formatters.mjs';

// Option B implementation: PNG-backed screens with an action bar.
// Each screen receives one prop: onNavigate(nextKey, params?)

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../state/appState.js';

// PNG imports (figma assets)
import PngLogin from '../assets/figma/01.1_Login_Register.png';
import PngWelcome from '../assets/figma/01_Welcome.png';
import PngDashboard from '../assets/figma/02_Dashboard.png';
import PngJoin from '../assets/figma/02.1_Join Lucky Draw.png';
import PngBoardA from '../assets/figma/03_LuckyDraw_GroupA.png';
import PngBoardB from '../assets/figma/03.1_LuckyDraw_GroupB.png';
import PngBoardC from '../assets/figma/03.2_LuckyDraw_GroupC.png';
import PngBoardD from '../assets/figma/03.3_LuckyDraw_GroupD.png';
import PngDeposit from '../assets/figma/04_Deposit.png';
import PngWithdrawRequest from '../assets/figma/05_Withdraw_Request.png';
import PngHistory from '../assets/figma/06_Point_History.png';
import PngWithdraw from '../assets/figma/07_Profile_Withdraw.png';
import PngInvite from '../assets/figma/08_Invite_QR_Link.png';
// Admin PNGs (09–13)
import PngAdminDash from '../assets/figma/09_Admin_Dashboard.png';
import PngAdminUsers from '../assets/figma/10_Admin_User_Management.png';
import PngAdminPoints from '../assets/figma/11_Admin_Points_Tracking.png';
import PngAdminFigures from '../assets/figma/12_Admin_Figures_Data.png';
import PngAdminResults from '../assets/figma/13_Admin_Result_Posting.png';
import PngAdminReports from '../assets/figma/14_Admin_Reports.png'

import { apiFetch } from '../lib/apiFetch.js';
import { getInitData as importedGetInitData, ensureTelegramInitData } from '../lib/initData.js';
const getInitData = importedGetInitData;
export { importedGetInitData as getInitData };

export function AdminDashboardScreen(props) {
  const { onNavigate, debug = false, ...rest } = props;

  const options = React.useMemo(
    () => [
      { key: 'user',    label: 'User Management', component: AdminUserManagementScreen },
      { key: 'points',  label: 'Points Tracking', component: AdminPointsTrackingScreen },
      { key: 'figures', label: 'Figures Data',    component: AdminFiguresDataScreen },
      { key: 'result',  label: 'Result Posting',  component: AdminResultPostingScreen },
      { key: 'reports', label: 'Reports',         component: AdminReportsScreen },
    ],
    []
  );

  const [selectedKey, setSelectedKey] = React.useState(options[0].key);
  const Selected = React.useMemo(
    () => options.find(o => o.key === selectedKey)?.component || AdminUserManagementScreen,
    [options, selectedKey]
  );

  return (
    <div style={{ padding: 12, minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'Inter, sans-serif', color: '#000' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label htmlFor="admin-dashboard-select" style={{ fontWeight: 600, fontSize: 14 }}>Admin Screen:</label>
        <select
          id="admin-dashboard-select"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          style={{ maxWidth: 320, padding: '6px 10px', borderRadius: 8, border: '1px solid #d0d0d0', fontSize: 14, outline: 'none' }}
          aria-label="Choose admin screen"
        >
          {options.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      <div style={{ minHeight: 300 }}>
        <Selected onNavigate={onNavigate} debug={debug} {...rest} />
      </div>
    </div>
  );
}

// Telegram bot wiring (centralized)
// You can override at runtime by setting window.__BOT_USERNAME__ = 'LuckyDrawForUBot'
const BOT_USERNAME = (typeof window !== 'undefined' && window.__BOT_USERNAME__) || 'LuckyDrawForUBot';

// 🧩 Version tag: v2025-10-19-ux01
(function ensureTelegramContextBanner() {
  if (typeof window === 'undefined') return;
  const initData = ensureTelegramInitData();
  const hasTelegramContext = Boolean(
    initData || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
  );
  if (hasTelegramContext) {
    console.log('TAG: v2025-10-19-ux01 banner skipped (Telegram context detected)');
    return;
  }
  if (document.getElementById('tg-open-warning')) return;

  const banner = document.createElement('div');
  banner.id = 'tg-open-warning';
  banner.textContent = '⚠️ Please open this Mini App inside Telegram to continue.';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;
    background:#ffb347;color:#000;
    padding:10px 14px;text-align:center;
    font-weight:600;z-index:999999;font-family:system-ui,-apple-system,Segoe UI,Roboto;
    box-shadow:0 2px 8px rgba(0,0,0,0.15);
  `;
  document.body.prepend(banner);
  console.log('TAG: v2025-10-19-ux01 banner injected');
})();

// Helper: build a deep link. You can switch between startapp / start as needed.
export function tgBotLink(path = 'startapp', param = '') {
  const q = param ? `?${path}=${encodeURIComponent(param)}` : (path ? `?${path}` : '');
  return `https://t.me/${BOT_USERNAME}${q}`;
}

const FIGURE_GRID_COORDS = (() => {
  const rows = [
    { top: 29.93, width: 12.79, height: 3.20, start: 10.45, spacing: 13.05 },
    { top: 39.36, width: 12.79, height: 3.20, start: 10.45, spacing: 13.05 },
    { top: 48.79, width: 12.79, height: 3.20, start: 10.45, spacing: 13.05 },
    { top: 58.22, width: 12.79, height: 3.20, start: 10.45, spacing: 13.05 },
    { top: 67.65, width: 12.79, height: 3.20, start: 10.45, spacing: 13.05 },
    { top: 77.08, width: 12.79, height: 3.20, start: 10.45, spacing: 13.05 },
  ];
  const toPct = (value) => `${value.toFixed(2)}%`;
  const overrides = {
    5: { left: '63.00%', top: '30.00%', width: '12.00%', height: '3.00%' },
    6: { left: '77.00%', top: '30.00%', width: '13.00%', height: '3.00%' },
  };
  return rows.flatMap((row, rowIndex) => (
    Array.from({ length: 6 }, (_, colIndex) => {
      const id = rowIndex * 6 + colIndex + 1;
      const left = row.start + row.spacing * colIndex;
      return {
        id,
        figure: id,
        left: toPct(left),
        top: toPct(row.top),
        width: toPct(row.width),
        height: toPct(row.height),
      };
    })
  )).map((entry) => overrides[entry.id] ? { ...entry, ...overrides[entry.id] } : entry);
})();

// Persist staged bets across Board screens
const STAGED_KEY = 'LD_staged_bets_v1';
function readStagedBets() {
  try {
    const raw = localStorage.getItem(STAGED_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    if (obj && ['A','B','C','D'].every(k => obj[k] && typeof obj[k] === 'object')) return obj;
  } catch {}
  return { A:{}, B:{}, C:{}, D:{} };
}
function writeStagedBets(map) {
  try { localStorage.setItem(STAGED_KEY, JSON.stringify(map)); } catch {}
}
function clearStagedBets() {
  try { localStorage.removeItem(STAGED_KEY); } catch {}
}

const BET_BYPASS_STORAGE_KEY = 'LD_bypass_bet_api';
const BET_BYPASS_QUERY_PARAM = 'bypassBet';

function parseTruthyFlag(value) {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized);
}

function isBetApiBypassEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__LD_BYPASS_BET_API === true) return true;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.has(BET_BYPASS_QUERY_PARAM)) {
      return parseTruthyFlag(params.get(BET_BYPASS_QUERY_PARAM));
    }
  } catch {}
  try {
    const stored = window.localStorage.getItem(BET_BYPASS_STORAGE_KEY);
    if (stored) {
      return parseTruthyFlag(stored);
    }
  } catch {}
  return false;
}

const BOARD_GROUPS = ['A', 'B', 'C', 'D'];

const BOARD_PNG_BY_GROUP = {
  A: PngBoardA,
  B: PngBoardB,
  C: PngBoardC,
  D: PngBoardD,
};

const TOP_NAV_RECTS = [
  { group: 'A', left: '8.24%', top: '16.45%', width: '17.52%', height: '4.32%' },
  { group: 'B', left: '30.52%', top: '16.45%', width: '17.52%', height: '4.32%' },
  { group: 'C', left: '52.28%', top: '16.45%', width: '17.52%', height: '4.32%' },
  { group: 'D', left: '76.00%', top: '16.45%', width: '18.00%', height: '4.50%' },
];

const TOTAL_PANEL_RECT = { left: '2.03%', top: '85.23%', width: '95.90%', height: '4.11%' };
const PLACE_BUTTON_RECT = { left: '1.07%', top: '90.80%', width: '97.11%', height: '4.00%' };

function createTopNavHotspots(activeGroup, onNavigate) {
  return TOP_NAV_RECTS.map(({ group, ...rect }) => {
    const key = `nav${group}`;
    const title = `Group ${group}`;
    const isActive = group === activeGroup;
    return {
      key,
      title,
      ...rect,
      ...(isActive ? {} : { onClick: () => onNavigate('board', { group }) }),
    };
  });
}

function createActionHotspots(group, onPlace) {
  return [
    { key: `total${group}`, title: 'Total Points Panel', ...TOTAL_PANEL_RECT },
    { key: `place${group}`, title: 'Place Points', ...PLACE_BUTTON_RECT, onClick: onPlace },
  ];
}

function createEmptyBetsMap() {
  return BOARD_GROUPS.reduce((acc, grp) => {
    acc[grp] = {};
    return acc;
  }, {});
}

function useHotspotDebug(label, enabled, hotspots) {
  useEffect(() => {
    if (!enabled) return;
    console.log(`[hotspots:${label}]`, hotspots);
  }, [enabled, hotspots, label]);
}

// --- Telegram initData + API helper (now centralized in ../lib/initData) ---

function parseTelegramUserId(initData) {
  if (!initData) return '';
  try {
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    if (!userParam) return '';
    const parsed = JSON.parse(userParam);
    if (parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch (_) {}
  return '';
}

function safeTrim(value) {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function normalizeWithdrawPayload({
  withdrawMethod = '',
  withdrawDest = '',
  withdrawHolder = '',
  accountName = '',
  name = '',
} = {}) {
  const method = safeTrim(withdrawMethod).toLowerCase();
  const destination = safeTrim(withdrawDest);
  const holderSource = withdrawHolder || accountName || name || '';
  const holder = safeTrim(holderSource);
  return { method, destination, holder };
}

function normalizeBetsFromResponse(bets) {
  if (!Array.isArray(bets)) return [];
  return bets.map((bet) => {
    const rawGroup = bet.group || bet.group_code || bet.groupCode || '';
    const group = typeof rawGroup === 'string' ? rawGroup.trim().toUpperCase() : '';
    const createdAt = bet.created_at || bet.createdAt || bet.timestamp || null;
    const points = Number(bet.points ?? bet.amount ?? 0);
    return {
      ...bet,
      group,
      points,
      created_at: createdAt,
      createdAt,
    };
  });
}

async function requestWalletAndHistory(initDataValue, { fallbackUserId = '', debug = false } = {}) {
  try {
    const res = await apiFetch('/api/data-balance', {
      method: 'GET',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (debug) {
        console.log('data-balance response (error)', { status: res.status, json });
      }
      const errorMessage = json?.error ? `Balance fetch failed: ${json.error}` : 'Balance fetch failed.';
      return { wallet: null, txns: [], bets: [], errorMessage };
    }
    const walletPayload = json?.wallet || (fallbackUserId ? { user_id: fallbackUserId, balance: 0 } : null);
    const txnsPayload = Array.isArray(json?.txns) ? json.txns : [];
    const betsPayload = normalizeBetsFromResponse(json?.bets);
    return { wallet: walletPayload, txns: txnsPayload, bets: betsPayload, errorMessage: '' };
  } catch (err) {
    if (debug) {
      console.log('data-balance fetch exception', err);
    }
    return { wallet: null, txns: [], bets: [], errorMessage: 'Unable to load wallet data.' };
  }
}

function useLoadWalletAndHistory({ debug = false, setWalletData, onError }) {
  return useCallback(async (initDataValue, options = {}) => {
    const { silent = false, fallbackUserId = '' } = options || {};
    if (!initDataValue) return null;

    const result = await requestWalletAndHistory(initDataValue, { fallbackUserId, debug });
    if (!result || result.errorMessage) {
      if (!silent && result?.errorMessage && typeof onError === 'function') {
        onError(result.errorMessage);
      }
      return null;
    }

    const { wallet, txns, bets } = result;
    if ((wallet || txns.length || bets.length) && typeof setWalletData === 'function') {
      setWalletData({ wallet, txns, bets });
    }
    return { wallet, txns, bets };
  }, [debug, onError, setWalletData]);
}

// --- end helper ---

function ScreenFrame({ title, png, children }) {
  useEffect(() => {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
    } catch (_) {}
  }, []);

  return (
    <div style={{ padding: 12, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ margin: '8px 0' }}>{title}</h2>
      {png && (
        <img
          src={png}
          alt={title}
          style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid #eee', borderRadius: 6 }}
        />
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export function WelcomeScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  const hotspots = [
  {
    left: '0%',
    top: '87.00%',
    width: '99.40%',
    height: '5.45%',
    onClick: () => onNavigate('login'),
  },
];
  const showOverlay = edit;
  useHotspotDebug('welcome', debug, hotspots);
  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngWelcome}
        alt="Welcome"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onDraft={(d) => { console.log('Welcome hotspot draft:', d); }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('login')}>Continue</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function LoginScreen({ onNavigate, debug = false }) {
  const { state, setAuth, setWalletData } = useAppState();
  const [edit, setEdit] = useState(false);
  // Auto-generated user id display (non-interactive field)
  const [userId, setUserId] = useState('');
  // Form fields for backend 'user profile'
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [pin, setPin] = useState('');
  const [profileExists, setProfileExists] = useState(null); // null = unknown, true/false once verified
  const [hasStoredPin, setHasStoredPin] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleWalletError = useCallback((message) => {
    setErrorMessage(message || '');
  }, [setErrorMessage]);

  const loadWalletAndHistory = useLoadWalletAndHistory({
    debug,
    setWalletData,
    onError: handleWalletError,
  });

  // Prefill userId + profile from cache → Telegram → backend
  useEffect(() => {
    let alive = true;

    // 1) From localStorage (dev convenience / persists refresh)
    try {
      const cached = localStorage.getItem('LD_userId');
      if (cached) {
        setUserId((prev) => prev || String(cached));
      }
      const cachedProfile = localStorage.getItem('LD_profile');
      if (cachedProfile) {
        const parsed = JSON.parse(cachedProfile);
        if (parsed?.name) setName((prev) => prev || String(parsed.name));
        if (parsed?.contact) setContact((prev) => prev || String(parsed.contact));
      }
    } catch {}

    // 2) From Telegram init data (signed user id)
    const ensuredInitData = ensureTelegramInitData();
    const initUserId = parseTelegramUserId(ensuredInitData);
    if (initUserId) {
      setUserId((prev) => (prev && !prev.startsWith('U')) ? prev : initUserId);
      try { localStorage.setItem('LD_userId', initUserId); } catch {}
    }

    // 3) From backend (/api/profile) using Authorization: tma & initData
    (async () => {
      const initData = getInitData({ refresh: true });
      if (!initData) {
        setStatusMessage('Waiting for Telegram init data. Open inside Telegram to continue.');
        return;
      }

      setVerifying(true);
      setStatusMessage('Verifying your Telegram account...');
      setErrorMessage('');
      const initDataUserId = parseTelegramUserId(initData);

      try {
        const res = await apiFetch('/api/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        const json = await res.json().catch(() => ({}));

        if (!alive) return;

        const backendId =
          json?.profile?.user_id ||
          json?.wallet?.user_id ||
          '';
        const resolvedUserId = backendId || initDataUserId;
        if (resolvedUserId) {
          setUserId(resolvedUserId);
          try { localStorage.setItem('LD_userId', resolvedUserId); } catch {}
        }

        if (!res.ok) {
          const errText = json?.error || `Profile lookup failed (${res.status})`;
          if (res.status === 401) {
            setErrorMessage('Telegram session invalid or expired. Relaunch the mini app from Telegram.');
            setStatusMessage('');
          } else if (res.status === 400 && String(errText).toLowerCase().includes('initdata')) {
            setErrorMessage('Telegram init data missing.');
            setStatusMessage('Waiting for Telegram init data. Open inside Telegram to continue.');
          } else {
            setErrorMessage(String(errText));
            setStatusMessage('');
          }
          setProfileExists(false);
          setHasStoredPin(false);
          if (debug) {
            console.log('profile-verify error', { status: res.status, json });
          }
          return;
        }

        const exists = Boolean(json?.profile_exists);
        setProfileExists(exists);
        setHasStoredPin(Boolean(json?.profile?.has_pin));

        if (exists && json?.profile) {
          setName(json.profile.name || '');
          setContact(json.profile.contact || '');
        }

        if (exists) {
          setStatusMessage('Account found. Tap Log In to continue.');
        } else {
          setStatusMessage('No profile found. Please register to continue.');
        }

        const profileForAuth = json?.profile || null;
        if (resolvedUserId) {
          setAuth({
            userId: resolvedUserId,
            name: profileForAuth?.name || '',
            contact: profileForAuth?.contact || '',
            status: exists ? 'verified' : 'pending',
            withdrawMethod: profileForAuth?.withdraw_method || '',
            withdrawDest: profileForAuth?.withdraw_dest || '',
            withdrawHolder: profileForAuth?.withdraw_holder || '',
            profile: profileForAuth,
          });
        }

        const fetched = await loadWalletAndHistory(initData, { silent: true, fallbackUserId: resolvedUserId || '' });
        if (json?.wallet || fetched?.wallet || fetched?.txns || fetched?.bets) {
          setWalletData({
            wallet: fetched?.wallet || json?.wallet || state.wallet,
            txns: fetched?.txns || state.walletTxns || [],
            bets: Array.isArray(fetched?.bets) ? fetched.bets : state.bets || [],
          });
        }
      } catch (e) {
        if (!alive) return;
        const message = e?.message ? String(e.message) : String(e);
        setErrorMessage(`Unable to reach server: ${message}`);
        setStatusMessage('');
        if (debug) {
          console.log('profile-verify exception', e);
        }
      } finally {
        if (alive) {
          setVerifying(false);
        }
      }
    })();

    return () => { alive = false; };
  }, [debug, loadWalletAndHistory, setAuth, setWalletData]);

  // Save profile to backend helper
  async function saveProfileRemote(initData, payload) {
    try {
      const res = await apiFetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: payload,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (debug) {
        console.log('profile-save response', { status: res.status, json });
      }
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      if (debug) {
        console.log('profile-save error', e);
      }
      return { ok: false, error: String(e) };
    }
  }

  async function handleContinue() {
    if (verifying || saving) return;

    const initData = getInitData({ refresh: true });
    if (!initData) {
      console.log('[Telegram] initData missing — open this inside Telegram WebApp.');
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }

    let actualUserId = userId;
    if (!actualUserId) {
      const fromInit = parseTelegramUserId(initData);
      if (fromInit) {
        actualUserId = fromInit;
        setUserId(fromInit);
        try { localStorage.setItem('LD_userId', fromInit); } catch {}
      }
    }
    if (!actualUserId) {
      alert('Telegram account details unavailable. Relaunch the mini app from Telegram.');
      return;
    }

    const trimmedName = safeTrim(name);
    const trimmedContact = safeTrim(contact);
    const trimmedPin = safeTrim(pin);

    if (profileExists === true) {
      setStatusMessage('Logged in. Redirecting to dashboard...');
      setErrorMessage('');
      setAuth({
        userId: actualUserId,
        name: trimmedName || name || '',
        contact: trimmedContact || contact || '',
        status: 'verified',
        profile: {
          user_id: actualUserId,
          name: trimmedName || name || '',
          contact: trimmedContact || contact || '',
        },
      });
      await loadWalletAndHistory(initData, { silent: true, fallbackUserId: actualUserId });
      onNavigate('dashboard');
      return;
    }

    if (!trimmedName || !trimmedContact || !trimmedPin) {
      alert('Please fill in Name, Contact Number, and Password/PIN before registering.');
      return;
    }

    setSaving(true);
    setStatusMessage('Registering profile...');
    setErrorMessage('');

    const payload = { userId: actualUserId, name: trimmedName, contact: trimmedContact, pin: trimmedPin };
    const out = await saveProfileRemote(initData, payload);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('LD_profile', JSON.stringify(payload));
      }
    } catch {}

    if (!out.ok) {
      const errText = out?.json?.error || out?.error || 'Profile save failed';
      setErrorMessage(String(errText));
      setStatusMessage('');
      alert(`Backend profile save not confirmed. ${errText}`);
      setSaving(false);
      return;
    }

    const savedProfile = out?.json?.profile || { user_id: actualUserId, name: trimmedName, contact: trimmedContact };
    const savedWallet = out?.json?.wallet || null;

    setAuth({
      userId: actualUserId,
      name: savedProfile?.name || trimmedName,
      contact: savedProfile?.contact || trimmedContact,
      status: 'registered',
      withdrawMethod: savedProfile?.withdraw_method || '',
      withdrawDest: savedProfile?.withdraw_dest || '',
      withdrawHolder: savedProfile?.withdraw_holder || '',
      profile: savedProfile,
    });
    if (savedWallet) {
      setWalletData({ wallet: savedWallet, txns: out?.json?.txns || [] });
    }

    setHasStoredPin(true);
    setProfileExists(true);
    setStatusMessage('Registration complete. Redirecting to dashboard...');
    setErrorMessage('');
    setPin('');
    setSaving(false);

    await loadWalletAndHistory(initData, { silent: true, fallbackUserId: actualUserId });
    onNavigate('dashboard');
  }

  const userIdDisplayValue = (() => {
    if (verifying) return 'Verifying...';
    if (profileExists === false) return 'null';
    return userId || '';
  })();

  // Keep name/contact locked after profile exists, but PIN must remain interactive
  const nameContactReadOnly = profileExists === true;
  // For PIN, always bind to live state so user can type; use placeholder for masking
  const pinDisplayValue = pin;
  const pinPlaceholder = (profileExists === true && hasStoredPin) ? 'Enter PIN' : 'Set PIN';
  const actionLabel = verifying ? 'Verifying...' : (profileExists === true ? (saving ? 'Logging In...' : 'Log In') : (saving ? 'Registering...' : 'Register'));
  const canSubmit = !verifying && !saving && (
    profileExists === true ||
    (safeTrim(name) && safeTrim(contact) && safeTrim(pin))
  );

  const   hotspots = [
    // 1) User ID field (NON-NAV, NON-TAP) — read-only display populated from backend verification
    {
        key: 'autoUserId',
      kind: 'input',
      title: 'Verified User ID',
      left: '4.00%', top: '30.00%', width: '92.00%', height: '5.00%',
      value: userIdDisplayValue || (verifying ? 'Verifying...' : 'Pending...'),
      inputType: 'text',
      coerceNumber: false,
      readOnly: true,
      disabled: true,
      inputStyle: {
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
      },
    },

    // 2) User Name field (input overlay)
    {
      key: 'userName',
      kind: 'input',
      title: 'User Name',
      left: '4.00%', top: '39.00%', width: '92.00%', height: '5.00%',
      value: name,
      inputType: 'text',
      coerceNumber: false,
      placeholder: nameContactReadOnly ? 'Loaded from profile' : 'Enter your name',
      readOnly: nameContactReadOnly,
      disabled: verifying && profileExists === true,
      onChange: (v) => { if (!nameContactReadOnly) setName(v); },
      inputStyle: {
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
      },
    },

    // 3) Contact Number field (input overlay)
    {
      key: 'contactNumber',
      kind: 'input',
      title: 'Contact Number',
      left: '4.00%', top: '47.00%', width: '92.00%', height: '5.00%',
      value: contact,
      inputType: 'tel',
      coerceNumber: false,
      placeholder: nameContactReadOnly ? 'Loaded from profile' : 'Enter contact number',
      readOnly: nameContactReadOnly,
      disabled: verifying && profileExists === true,
      onChange: (v) => { if (!nameContactReadOnly) setContact(v); },
      inputStyle: {
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
      },
    },

    // 4) Password / PIN field (input overlay)
    {
      key: 'passwordPin',
      kind: 'input',
      title: 'Password / PIN',
      left: '4.00%', top: '55.00%', width: '92.00%', height: '5.00%',
      value: pinDisplayValue,
      inputType: 'password',
      secure: true,
      placeholder: pinPlaceholder,
      readOnly: false,
      disabled: verifying && profileExists === true,
      onChange: (v) => { setPin(v); },
      inputStyle: {
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
      },
    },

    // 5) Bottom button → navigate to Dashboard
    {
      key: 'submitLoginRegister',
      title: actionLabel,
      left: '2.85%',
      top: '86.68%',
      width: '95.34%',
      height: '5.00%',
      onClick: canSubmit ? handleContinue : undefined
    },
  ];
  const showOverlay = edit;
  useHotspotDebug('login', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngLogin}
        alt="Login / Register"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onDraft={(d) => { console.log('Login hotspot draft:', d); }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={handleContinue} disabled={!canSubmit}>{actionLabel}</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        <span style={{marginLeft:8, fontSize:12, opacity:0.7}}>v: login-profile-05</span>
      </div>
      {(statusMessage || errorMessage) && (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.4 }}>
          {statusMessage && (
            <div style={{ color: '#1f3a5f' }}>{statusMessage}</div>
          )}
          {errorMessage && (
            <div style={{ color: '#b00020' }}>{errorMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardScreen({ onNavigate, debug = false }) {
  const { state, setWalletData } = useAppState();
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    let active = true;
    const initData = getInitData();
    if (!initData) return () => { active = false; };
    (async () => {
      try {
        const res = await apiFetch('/api/data-balance', {
          method: 'GET',
        });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && (json?.wallet || Array.isArray(json?.txns) || Array.isArray(json?.bets))) {
          setWalletData({
            wallet: json.wallet || null,
            txns: Array.isArray(json.txns) ? json.txns : [],
            bets: normalizeBetsFromResponse(json.bets),
          });
        } else if (debug) {
          console.log('dashboard data-balance response', { status: res.status, json });
        }
      } catch (err) {
        if (active && debug) {
          console.log('dashboard data-balance fetch error', err);
        }
      }
    })();
    return () => { active = false; };
  }, [debug, setWalletData, state?.auth?.userId]);

  // TAG: dashboard-pts-01
  const [ptsBalance, setPtsBalance] = useState(0);
  useEffect(() => {
    const init = getInitData && getInitData();
    if (!init) return;
    (async () => {
      try {
        const r = await apiFetch('/api/data-balance', { method: 'GET' });
        const j = await r.json().catch(() => ({}));
        const b = (j && (j.balance ?? j?.wallet?.balance)) ?? 0;
        setPtsBalance(Number(b) || 0);
      } catch {}
    })();
  }, []);

  const hotspots = useMemo(() => {
    const actionSpecs = [
      { key: 'tileJoin_v3', title: 'Join Lucky Draw',       top: '26.00%', width: '86.00%', onClick: () => onNavigate('join') },
      { key: 'tileHistory_v3', title: 'Point History',      top: '34.00%', width: '86.00%', onClick: () => onNavigate('history') },
      { key: 'tileDeposit_v3', title: 'Deposit Points',     top: '41.00%', width: '86.00%', onClick: () => onNavigate('deposit') },
      { key: 'tileWithdraw_v3', title: 'Withdraw Points',   top: '48.00%', width: '86.00%', onClick: () => onNavigate('withdrawRequest') },
      { key: 'tileProfile_v3', title: 'Profile / Withdraw', top: '57.00%', width: '85.00%', onClick: () => onNavigate('withdrawSetup') },
      { key: 'tileInvite_v3', title: 'Invite / QR Link',    top: '64.00%', width: '86.00%', onClick: () => onNavigate('invite') },
    ];

    return [
      // Balance display (NON-NAV, NON-TAP) rendered as a read-only input overlay
      {
        key: 'ptsDisplay_v3',
        kind: 'input',
        title: 'Points Balance',
        left: '5.00%',
        top: '9.00%',
        width: '90.00%',
        height: '8.00%',
        value: `Points balance: ${Number(ptsBalance).toLocaleString()} pts`,
        readOnly: true,
        inputType: 'text',
        tabIndex: -1,
        onFocus: (e) => e.target.blur(),
        inputStyle: { textAlign: 'center', padding: '6px 10px', fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: 18, backgroundColor: 'rgba(255,255,255,0)', outline: '1px solid rgba(255,255,255,0)' }
      },
      ...actionSpecs.map(spec => ({
        key: spec.key,
        title: spec.title,
        left: '4.00%',
        top: spec.top,
        width: spec.width,
        height: '5.00%',
        onClick: spec.onClick,
      })),
    ];
  }, [onNavigate, ptsBalance]);
  const showOverlay = edit;
  useHotspotDebug('dashboard', debug, hotspots);
  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngDashboard}
        alt="Dashboard"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onDraft={(d) => { console.log('Dashboard hotspot draft:', d); }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('login')}>Log Out</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        <span style={{marginLeft:8, fontSize:12, opacity:0.7}}>v: dashboard-08</span>
      </div>
    </div>
  );
}

export function JoinScreen({ onNavigate, debug = false }) {
  // Render PNG with invisible overlay hotspots, no action bar/title
  const { state } = useAppState();
  const balance = state?.wallet?.balance ?? 0;
  const [edit, setEdit] = useState(false);
  const hotspots = [
    {
      key: 'joinBalance',
      title: `Balance: ${balance.toLocaleString()} pts`,
      left: '10.00%',
      top: '24.00%',
      width: '79.00%',
      height: '6.00%',
      onClick: () => alert(`Balance: ${balance.toLocaleString()} pts`),
    },
    // Header back area (consistent pattern)
    { key: 'hdrBack', title: 'Back', left: '3.00%', top: '8.00%', width: '20.00%', height: '6.00%', onClick: () => onNavigate('dashboard') },
    // Group tiles (normalized widths/heights)
    { key: 'grpA', title: 'Join Group A', left: '5.81%',  top: '35.60%', width: '17.37%', height: '5.31%', onClick: () => onNavigate('board', { group: 'A' }) },
    { key: 'grpB', title: 'Join Group B', left: '28.91%', top: '35.60%', width: '17.37%', height: '5.31%', onClick: () => onNavigate('board', { group: 'B' }) },
    { key: 'grpC', title: 'Join Group C', left: '52.16%', top: '35.60%', width: '17.37%', height: '5.31%', onClick: () => onNavigate('board', { group: 'C' }) },
    { key: 'grpD', title: 'Join Group D', left: '75.16%', top: '35.60%', width: '17.37%', height: '5.31%', onClick: () => onNavigate('board', { group: 'D' }) },
  ];

  const showOverlay = edit;
  useHotspotDebug('join', debug, hotspots);

  // hotspots handled by HotspotImage; no inline styles required here

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngJoin}
        alt="Join Lucky Draw"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => {
          // eslint-disable-next-line no-console
          console.log('Copy this into hotspots array:', d);
        }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

function BoardScreenBase({ group, onNavigate, debug = false }) {
  const { state, setWalletData } = useAppState();
  const balance = state?.wallet?.balance ?? 0;
  const [edit, setEdit] = useState(false);
  const [points] = useState(10);
  const [betsByGroup, setBetsByGroup] = useState(() => readStagedBets());
  const [activeDrawId, setActiveDrawId] = useState(null);
  const [betError, setBetError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupTotals, setGroupTotals] = useState({ A: 0, B: 0, C: 0, D: 0 });

  const handleWalletRefreshError = useCallback((message) => {
    if (message) {
      setBetError(message);
      if (debug) {
        console.warn('[board] wallet refresh error', message);
      }
    }
  }, [debug, setBetError]);

  const loadWalletAndHistory = useLoadWalletAndHistory({
    debug,
    setWalletData,
    onError: handleWalletRefreshError,
  });

  const groupBets = betsByGroup[group] || {};

  const stagedTotals = useMemo(() => (
    BOARD_GROUPS.reduce((acc, grp) => {
      const staged = Object.values(betsByGroup[grp] || {}).reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)), 0);
      acc[grp] = staged;
      return acc;
    }, {})
  ), [betsByGroup]);

  const hasAnyStaged = useMemo(
    () => BOARD_GROUPS.some((grp) => stagedTotals[grp] > 0),
    [stagedTotals]
  );

  const toggleFigure = useCallback((figure) => {
    setBetsByGroup((prev) => {
      const currentGroup = { ...(prev[group] || {}) };
      if (currentGroup[figure] == null) currentGroup[figure] = points;
      const next = { ...prev, [group]: currentGroup };
      writeStagedBets(next);
      return next;
    });
  }, [group, points]);

  const setFigurePoints = useCallback((figure, value) => {
    setBetsByGroup((prev) => {
      const currentGroup = { ...(prev[group] || {}) };
      const n = Math.max(0, Math.floor(Number(value) || 0));
      if (n <= 0) delete currentGroup[figure];
      else currentGroup[figure] = n;
      const next = { ...prev, [group]: currentGroup };
      writeStagedBets(next);
      return next;
    });
  }, [group]);

  const fetchBetTotals = useCallback(async (initDataValue, drawIdHint = null) => {
    if (!initDataValue) return;
    try {
      const res = await apiFetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'bet_totals',
          draw_id: drawIdHint || activeDrawId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error || json?.reason || `Failed to load bet totals (${res.status})`;
        console.warn('[board] bet_totals fetch failed', msg);
        return;
      }
      const totals = json?.totals || {};
      setGroupTotals(() => {
        const map = {};
        BOARD_GROUPS.forEach((grp) => {
          map[grp] = Number(totals[grp] ?? 0);
        });
        return map;
      });
      setActiveDrawId((prev) => json.draw_id || drawIdHint || prev || null);
    } catch (error) {
      console.error('[board] bet_totals exception', error);
    }
  }, [activeDrawId]);

  const runSimulatedBet = useCallback((entriesToApply, totalSpend, message) => {
    const simulatedBalance = Math.max(0, balance - totalSpend);
    const currentWallet = state?.wallet || {};
    const userId = currentWallet.user_id || state?.auth?.userId || '';
    const walletSnapshot = {
      ...currentWallet,
      user_id: userId,
      balance: simulatedBalance,
    };
    setWalletData({
      wallet: walletSnapshot,
      txns: Array.isArray(state?.walletTxns) ? state.walletTxns : [],
      bets: Array.isArray(state?.bets) ? state.bets : [],
    });
    setGroupTotals((prev) => {
      const next = { ...prev };
      entriesToApply.forEach(({ group: grp, amount }) => {
        next[grp] = Number(next[grp] ?? 0) + amount;
      });
      return next;
    });
    setBetsByGroup(createEmptyBetsMap());
    clearStagedBets();
    alert(message || 'Simulated bet success.');
    try { window.dispatchEvent(new CustomEvent('wallet:updated', { detail: { bypass: true } })); } catch {}
    onNavigate('dashboard');
  }, [balance, onNavigate, setGroupTotals, setWalletData, state]);

  useEffect(() => {
    const initData = getInitData();
    if (!initData) return;
    fetchBetTotals(initData);
  }, [fetchBetTotals]);

  const handlePlacePoints = useCallback(async () => {
    const initData = getInitData();
    if (!initData) {
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }

    const entries = [];
    BOARD_GROUPS.forEach((grp) => {
      const staged = betsByGroup[grp] || {};
      Object.entries(staged).forEach(([fig, value]) => {
        const amount = Math.max(0, Math.floor(Number(value) || 0));
        if (amount > 0) {
          entries.push({ group: grp, figure: Number(fig), amount });
        }
      });
    });

    if (!entries.length) {
      alert('Select at least one figure to place a bet.');
      return;
    }

    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (total > balance) {
      alert(`Total points (${total}) exceed your balance (${balance}). Reduce points or deposit more.`);
      return;
    }

    setBetError('');

    if (isBetApiBypassEnabled()) {
      console.info('[board] /api/bet bypass active — simulating success for test mode.');
      runSimulatedBet(entries, total, 'Bypass mode: simulated bet success.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/bet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drawId: activeDrawId || undefined,
          bets: entries,
        }),
      });
      const json = await res.json().catch(() => ({}));
      const responseDrawId = json?.draw?.id || json?.draw_id || null;
      if (!res.ok || !json?.ok) {
        const reason = json?.reason || json?.error;
        if (reason === 'no_scheduled_draw' || reason === 'no_open_draw') {
          console.warn('[board] bet API returned', reason, '— simulating local success for testing.');
          runSimulatedBet(entries, total, 'Simulated bet success (no draw scheduled yet).');
          return;
        }
        const msg = reason || `Bet failed (${res.status})`;
        setBetError(msg);
        alert(msg);
        await fetchBetTotals(initData, responseDrawId);
        return;
      }

      const newBalance = Number(json.balance ?? balance);
      const updatedWallet = {
        ...(state.wallet || {}),
        user_id: state.wallet?.user_id || state.auth?.userId || '',
        balance: newBalance,
      };
      const refreshed = await loadWalletAndHistory(initData, { silent: true, fallbackUserId: updatedWallet.user_id || '' });
      setWalletData({
        wallet: refreshed?.wallet || updatedWallet,
        txns: refreshed?.txns || state.walletTxns || [],
        bets: Array.isArray(refreshed?.bets) ? refreshed.bets : state.bets || [],
      });

      setBetsByGroup(createEmptyBetsMap());
      clearStagedBets();
      await fetchBetTotals(initData, responseDrawId);
      alert('Bets placed!');
      try { window.dispatchEvent(new CustomEvent('wallet:updated')); } catch {}
      onNavigate('dashboard');
    } catch (error) {
      console.error('[board] bet submit error', error);
      const msg = error?.message ? String(error.message) : 'Bet submission failed. Please try again.';
      setBetError(msg);
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  }, [activeDrawId, balance, betsByGroup, fetchBetTotals, loadWalletAndHistory, onNavigate, runSimulatedBet, setWalletData, state.auth, state.bets, state.wallet, state.walletTxns]);

  const baseFigureHotspots = useMemo(
    () => FIGURE_GRID_COORDS.map(({ figure, left, top, width, height }) => ({
      key: `${group}_fig_${figure}`,
      // Prefix group code to figure label
      title: `${group}#${figure}`,
      figure,
      left,
      top,
      width,
      height,
    })),
    [group],
  );

  const figureHotspots = baseFigureHotspots.map((spot) => {
    const { figure, left, top, width, height, title } = spot;
    const current = groupBets[figure];
    return current != null
      ? {
          key: `input_${group}_${figure}`,
          kind: 'input',
          // Prefix group code to figure label
          title: `Points for ${group}#${figure}`,
          left,
          top,
          width,
          height,
          value: current,
          onChange: (value) => setFigurePoints(figure, value),
        }
      : {
          key: spot.key,
          title,
          left,
          top,
          width,
          height,
          onClick: () => toggleFigure(figure),
        };
  });

  const topNav = useMemo(() => createTopNavHotspots(group, onNavigate), [group, onNavigate]);
  const actionHotspots = useMemo(() => createActionHotspots(group, handlePlacePoints), [group, handlePlacePoints]);
  const hotspots = [...topNav, ...figureHotspots, ...actionHotspots];
  const showOverlay = edit;
  useHotspotDebug(`board${group}`, debug, hotspots);

  const remoteGroupTotal = Number(groupTotals[group] || 0);
  const stagedGroupTotal = Number(stagedTotals[group] || 0);
  const totalPoints = remoteGroupTotal + stagedGroupTotal;

  const currentIndex = BOARD_GROUPS.indexOf(group);
  const prevGroup = currentIndex > 0 ? BOARD_GROUPS[currentIndex - 1] : null;
  const nextGroup = currentIndex < BOARD_GROUPS.length - 1 ? BOARD_GROUPS[currentIndex + 1] : null;
  const boardImage = BOARD_PNG_BY_GROUP[group];

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={boardImage}
        alt={`Group ${group}`}
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('join')}
        onDraft={(draft) => { console.log(`${group} hotspot draft:`, draft); }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>Total Points:</strong> {totalPoints.toLocaleString()}&nbsp;
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            ({remoteGroupTotal.toLocaleString()} pooled&nbsp;/ {stagedGroupTotal.toLocaleString()} staging)
          </span>
        </div>
        <button disabled={!hasAnyStaged || submitting} onClick={handlePlacePoints}>
          {submitting ? 'Placing…' : 'Place Points'}
        </button>
        {prevGroup && (
          <button onClick={() => onNavigate('board', { group: prevGroup })}>{`← Prev: Group ${prevGroup}`}</button>
        )}
        {nextGroup ? (
          <button onClick={() => onNavigate('board', { group: nextGroup })}>{`Next: Group ${nextGroup} →`}</button>
        ) : (
          <button onClick={() => onNavigate('dashboard')}>Done</button>
        )}
        <button onClick={() => onNavigate('join')}>Back</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>draw: {activeDrawId || '—'}</span>
      </div>
      {betError && (
        <div style={{ marginTop: 8, color: '#b42318', fontSize: 13 }}>{betError}</div>
      )}
    </div>
  );
}

export function BoardAScreen(props) {
  return <BoardScreenBase group="A" {...props} />;
}

export function BoardBScreen(props) {
  return <BoardScreenBase group="B" {...props} />;
}

export function BoardCScreen(props) {
  return <BoardScreenBase group="C" {...props} />;
}

export function BoardDScreen(props) {
  return <BoardScreenBase group="D" {...props} />;
}

export function ConfirmScreen({ onNavigate, params, debug = false }) {
  const { state, setWalletData } = useAppState();
  const wallet = state.wallet || { balance: 0 };
  const [points, setPoints] = useState(() => (params?.points ?? 10));
  const group = params?.group ?? 'A';
  const figure = params?.figure ?? 1;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canPlace = useMemo(() => Number.isFinite(Number(points)) && Number(points) > 0 && Number(points) <= wallet.balance, [points, wallet.balance]);

  async function onPlace() {
    const amt = Math.floor(Number(points) || 0);
    if (amt <= 0) return;
    const initData = getInitData();
    if (!initData) {
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/bet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bets: [{ group, figure, amount: amt }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.reason || json?.error || `Bet failed (${res.status})`;
        setError(msg);
        alert(msg);
        return;
      }
      const newBalance = Number(json.balance ?? wallet.balance);
      const updatedWallet = {
        ...(state.wallet || {}),
        user_id: state.wallet?.user_id || state.auth?.userId || '',
        balance: newBalance,
      };
      setWalletData({ wallet: updatedWallet, txns: state.walletTxns || [] });
      alert('Bet placed!');
      try { window.dispatchEvent(new CustomEvent('wallet:updated')); } catch {}
      onNavigate('dashboard');
    } catch (e) {
      console.error('[confirm] bet error', e);
      const msg = e?.message ? String(e.message) : 'Network error while placing bet.';
      setError(msg);
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenFrame title="Confirm Bet" png={PngWelcome}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div><strong>Group:</strong> {group}</div>
        <div><strong>Figure:</strong> {figure}</div>
        <div><strong>Balance:</strong> {wallet.balance.toLocaleString()} pts</div>
        <label>
          <span style={{ marginRight: 8 }}>Points:</span>
          <input
            type="number"
            min={1}
            step={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            style={{ width: 120 }}
          />
        </label>
        <div style={{ color: canPlace ? '#333' : '#c00' }}>
          {canPlace ? 'Ready to place bet.' : 'Insufficient balance or invalid amount.'}
        </div>
      </div>
      <button onClick={onPlace} disabled={!canPlace || submitting}>{submitting ? 'Placing…' : 'Place Bet'}</button>
      <button onClick={() => onNavigate('join')}>Back</button>
      {error && (
        <div style={{ marginTop: 8, color: '#b42318', fontSize: 13 }}>{error}</div>
      )}
    </ScreenFrame>
  );
}

const DEPOSIT_SLIP_MAX_BYTES = 5 * 1024 * 1024; // 5 MB limit

export function DepositScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(50);
  const [note, setNote] = useState('');
  const [uploadSlip, setUploadSlip] = useState('');
  const [uploadSlipInfo, setUploadSlipInfo] = useState(null);
  const [slipProcessing, setSlipProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const canSubmit = normalizedAmount > 0 && !!uploadSlipInfo && !slipProcessing;

  const readFileAsBase64 = useCallback((file) => {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        reject(new Error('FileReader unavailable'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const { result } = reader;
        if (typeof result === 'string') {
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        } else {
          reject(new Error('Unexpected FileReader result'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  const handleSlipPick = useCallback(() => {
    if (slipProcessing) {
      alert('Previous slip is still processing. Please wait a moment.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      try {
        if (input && input.parentNode) {
          input.parentNode.removeChild(input);
        }
      } catch {}
    };

    input.addEventListener(
      'change',
      async (event) => {
        try {
          const file = event.target.files && event.target.files[0];
          if (!file) {
            cleanup();
            return;
          }
          if (file.size > DEPOSIT_SLIP_MAX_BYTES) {
            const maxMb = (DEPOSIT_SLIP_MAX_BYTES / (1024 * 1024)).toFixed(1);
            alert(`Slip file is too large. Maximum size is ${maxMb} MB.`);
            setUploadSlip('');
            setUploadSlipInfo(null);
            cleanup();
            return;
          }
          setSlipProcessing(true);
          setUploadSlip('');
          setUploadSlipInfo(null);
          const base64 = await readFileAsBase64(file);
          setUploadSlip(file.name);
          setUploadSlipInfo({
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: base64,
          });
        } catch (error) {
          console.error('Deposit slip processing failed', error);
          alert('Failed to read the selected slip. Please try again.');
          setUploadSlip('');
          setUploadSlipInfo(null);
        } finally {
          setSlipProcessing(false);
          cleanup();
        }
      },
      { once: true }
    );

    input.click();
  }, [readFileAsBase64, slipProcessing]);

  const handleDeposit = async () => {
    if (submitting) return;
    if (!canSubmit) {
      if (!uploadSlipInfo) {
        alert('Attach your payment slip before submitting.');
      } else if (slipProcessing) {
        alert('Slip file is still processing. Please wait and try again.');
      } else {
        alert('Enter a deposit amount greater than zero.');
      }
      return;
    }
    const initData = getInitData();
    if (!initData) {
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }
    try {
      setSubmitting(true);
      const trimmedNote = safeTrim(note);
      const payload = {
        action: 'deposit',
        amount: normalizedAmount,
        method: 'bank',
      };
      if (trimmedNote) payload.note = trimmedNote;
      if (uploadSlipInfo && uploadSlipInfo.data) {
        payload.slip = {
          name: uploadSlipInfo.name,
          type: uploadSlipInfo.type,
          size: uploadSlipInfo.size,
          data: uploadSlipInfo.data,
          encoding: 'base64',
        };
      }
      const res = await apiFetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || json?.reason || `Deposit failed (${res.status})`;
        alert(msg);
        return;
      }
      alert('Deposit request submitted. Admin will review shortly.');
      setAmount(50);
      setNote('');
      setUploadSlip('');
      setUploadSlipInfo(null);
      onNavigate('dashboard');
    } catch (e) {
      console.log('Deposit error:', e);
      alert('Network error while creating deposit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hotspots = [
    {
      key: 'amountInput',
      kind: 'input',
      title: 'Deposit amount',
      left: '4.00%',
      top: '34.00%',
      width: '91.00%',
      height: '6.00%',
      value: amount,
      inputType: 'number',
      min: 0,
      step: 10,
      coerceNumber: true,
      onChange: setAmount,
      placeholder: 'Amount',
      inputStyle: {
        textAlign: 'left',
        padding: '0 16px',
        fontWeight: 500,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0)',       // transparent background
        backgroundColor: 'rgba(255,255,255,0)',
        outline: '1px solid rgba(255,255,255,0)',// invisible outline
        border: '0',
        boxShadow: 'none',
        filter: 'none',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
        caretColor: 'transparent',
      },
    },
    {
      key: 'noteInput',
      kind: 'input',
      title: 'Deposit note',
      left: '4.00%',
      top: '43.00%',
      width: '91.00%',
      height: '6.00%',
      value: note,
      inputType: 'text',
      coerceNumber: false,
      placeholder: 'Note for admin (optional)',
      inputStyle: {
        textAlign: 'left',
        padding: '0 16px',
        fontWeight: 500,
        cursor: 'text',
        background: 'rgba(255,255,255,0)',       // transparent background
        backgroundColor: 'rgba(255,255,255,0)',
        outline: '1px solid rgba(255,255,255,0)',// invisible outline
        border: '0',
        boxShadow: 'none',
        filter: 'none',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
      },
      onChange: setNote,
    },
    {
      key: 'uploadSlipInput',
      kind: 'input',
      title: 'Attach Slip (Upload File)',
      left: '4.00%',
      top: '52.00%',
      width: '91.00%',
      height: '6.00%',
      // show plain text value; no native file UI
      value: slipProcessing
        ? 'Processing slip…'
        : uploadSlip
          ? `Slip: ${uploadSlip}`
          : 'Tap to attach payment slip (jpg/png/pdf)',
      inputType: 'text',          // force text so browser doesn't render file control
      readOnly: true,             // prevent caret/keyboard
      tabIndex: -1,               // skip focus
      coerceNumber: false,
      placeholder: '',
      inputStyle: {
        textAlign: 'left',
        padding: '0 16px',
        fontWeight: 500,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0)',       // transparent background
        backgroundColor: 'rgba(255,255,255,0)',
        outline: '1px solid rgba(255,255,255,0)',// invisible outline
        border: '0',
        boxShadow: 'none',
        filter: 'none',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
        caretColor: 'transparent',
      },
      onFocus: (e) => e.target.blur(), // kill focus ring on some browsers
      onClick: () => {
        handleSlipPick();
      },
    },
    {
      key: 'submitDeposit',
      title: submitting ? 'Submitting deposit…' : 'Submit deposit',
      left: '1.00%',
      top: '86.00%',
      width: '98.00%',
      height: '5.00%',
      onClick: handleDeposit,
    },
  ];

  const showOverlay = edit;
  useHotspotDebug('deposit', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngDeposit}
        alt="Deposit"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => console.log('Deposit hotspot draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function WithdrawRequestScreen({ onNavigate, debug = false }) {
  const { state, debit } = useAppState();
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(50);
  const auth = state?.auth || {};
  const balance = state?.wallet?.balance ?? 0;

  const destinationRecords = useMemo(() => {
    const accounts = Array.isArray(auth.withdrawAccounts) ? auth.withdrawAccounts : [];
    const mapped = accounts.map((entry, index) => {
      const bankLabel = entry.label || entry.bankLabel || entry.bank || entry.wallet || 'Saved destination';
      const accountNumber = entry.accountNumber || entry.number || entry.id || '';
      const accountHolder = entry.accountHolder || entry.accountName || entry.name || auth.accountName || auth.name || '';
      const method = (entry.method || entry.type || 'bank').toLowerCase();
      const labelParts = [bankLabel, accountNumber ? `• ${accountNumber}` : null].filter(Boolean);
      const destinationDisplay = entry.destination || labelParts.filter(Boolean).join(' ') || bankLabel;
      return {
        id: entry.id || entry.value || accountNumber || `withdraw-destination-${index}`,
        label: labelParts.length > 0 ? labelParts.join(' ') : 'Saved destination',
        bank: bankLabel,
        accountNumber,
        accountHolder,
        method,
        destination: destinationDisplay,
      };
    });

    if (mapped.length > 0) return mapped;

    if (auth.withdrawDest || auth.withdrawHolder || auth.withdrawMethod) {
      const method = (auth.withdrawMethod || auth.withdraw_method || 'bank').toLowerCase();
      const destString = auth.withdrawDest || '';
      const parts = destString.split(':');
      const accNum = parts.length > 1 ? parts.slice(1).join(':').trim() : destString;
      return [{
        id: 'primary-withdraw-destination',
        label: destString || `${method} • ${accNum}`,
        bank: method,
        accountNumber: accNum,
        accountHolder: auth.withdrawHolder || auth.accountName || auth.name || '',
        method,
        destination: destString || `${method} ${accNum}`.trim(),
      }];
    }

    if (auth.bank || auth.accountNumber || auth.accountName || auth.name) {
      const bankLabel = auth.bankLabel || auth.bank || 'Primary destination';
      const accountNumber = auth.accountNumber || '';
      const accountHolder = auth.accountName || auth.name || '';
      const labelParts = [bankLabel, accountNumber ? `• ${accountNumber}` : null].filter(Boolean);
      return [{
        id: accountNumber || auth.bank || 'primary-destination',
        label: labelParts.length > 0 ? labelParts.join(' ') : 'Primary destination',
        bank: bankLabel,
        accountNumber,
        accountHolder,
        method: 'bank',
        destination: labelParts.length > 0 ? labelParts.join(' ') : bankLabel,
      }];
    }

    return [];
  }, [auth]);

  const [destinationId, setDestinationId] = useState(() => destinationRecords[0]?.id || '');

  useEffect(() => {
    if (!destinationRecords.length) {
      setDestinationId('');
      return;
    }
    setDestinationId((prev) => (destinationRecords.some((entry) => entry.id === prev) ? prev : destinationRecords[0].id));
  }, [destinationRecords]);

  const activeDestination = destinationRecords.find((entry) => entry.id === destinationId) || null;
  const accountHolderName = activeDestination?.accountHolder || auth.accountName || auth.name || '';

  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));

  const handleRequest = async () => {
    if (normalizedAmount <= 0) {
      alert('Enter a withdraw amount greater than zero.');
      return;
    }
    if (normalizedAmount < 10) {
      alert('Minimum withdrawal is 10 points.');
      return;
    }
    if (normalizedAmount > balance) {
      alert('Enter an amount within your available balance.');
      return;
    }
    if (!activeDestination) {
      alert('Select a withdrawal destination from your profile setup.');
      return;
    }
    const initData = getInitData();
    if (!initData) {
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }
    try {
      const normalized = normalizeWithdrawPayload({
        withdrawMethod: activeDestination.method || auth.withdrawMethod || 'bank',
        withdrawDest: activeDestination.destination || `${activeDestination.bank || auth.withdrawMethod || 'bank'}:${activeDestination.accountNumber || auth.withdrawDest || ''}`,
        withdrawHolder: activeDestination.accountHolder,
        accountName: auth.accountName,
        name: auth.name,
      });

      const payload = {
        action: 'withdraw',
        amount: normalizedAmount,
        method: normalized.method || 'bank',
        destination: normalized.destination,
        account_holder: normalized.holder || accountHolderName || auth.withdrawHolder || auth.name || '',
      };
      const res = await apiFetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || json?.reason || `Withdraw request failed (${res.status})`;
        alert(msg);
        return;
      }
      // Optimistic local state update as fallback (debit is from appState)
      try { debit(normalizedAmount); } catch {}
      alert(`Withdraw request submitted for ${normalizedAmount} pts.`);
      setAmount(0);
      onNavigate('dashboard');
    } catch (e) {
      console.log('Withdraw error:', e);
      alert('Network error while creating withdraw request. Please try again.');
    }
  };

  const destinationOptions = destinationRecords.map((entry) => ({ value: entry.id, label: entry.label }));

  const hotspots = [
    {
      key: 'amountInput',
      kind: 'input',
      title: 'Withdraw amount',
      left: '4.00%',
      top: '34.00%',
      width: '91.00%',
      height: '6.00%',
      value: amount,
      inputType: 'number',
      min: 0,
      step: 10,
      coerceNumber: true,
      onChange: setAmount,
      placeholder: 'Amount',
      inputStyle: {
        textAlign: 'left',
        padding: '0 16px',
        fontWeight: 500,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
        outline: '1px solid rgba(255,255,255,0)',
        border: '0',
        boxShadow: 'none',
        filter: 'none',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
        caretColor: 'transparent',
      },
    },
    {
      key: 'destinationSelect',
      kind: 'select',
      title: 'Withdrawal destination',
      left: '4.00%',
      top: '43.00%',
      width: '91.00%',
      height: '6.00%',
      value: destinationId,
      options: destinationOptions,
      placeholder: destinationRecords.length ? 'Select destination' : 'Setup destination in Profile',
      disabled: destinationRecords.length === 0,
      onChange: setDestinationId,
      selectStyle: {
        textAlign: 'left',
        padding: '0 16px',
        fontWeight: 500,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
        outline: '1px solid rgba(255,255,255,0)',
        border: '0',
        boxShadow: 'none',
        filter: 'none',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
      },
    },
    {
      key: 'accountHolderDisplay',
      kind: 'input',
      title: 'Account holder',
      left: '4.00%',
      top: '53.00%',
      width: '91.00%',
      height: '6.00%',
      value: accountHolderName || 'Account holder name',
      inputType: 'text',
      coerceNumber: false,
      readOnly: true,
      inputStyle: {
        textAlign: 'left',
        padding: '0 16px',
        fontWeight: 500,
        cursor: 'default',
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
        outline: '1px solid rgba(255,255,255,0)',
        border: '0',
        boxShadow: 'none',
        filter: 'none',
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
      },
    },
    {
      key: 'submitWithdraw',
      title: 'Submit withdraw request',
      left: '1.00%',
      top: '85.00%',
      width: '97.00%',
      height: '6.00%',
      buttonStyle: {
        background: 'rgba(255,255,255,0)',
        backgroundColor: 'rgba(255,255,255,0)',
        border: 'none',
      },
      onClick: handleRequest,
    },
  ];

  const showOverlay = edit;
  useHotspotDebug('withdraw-request', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngWithdrawRequest}
        alt="Withdraw Request"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => console.log('Withdraw request hotspot draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function HistoryScreen({ onNavigate, debug = false }) {
  const { state } = useAppState();
  const [edit, setEdit] = useState(false);
  // TAG: history-live-01
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const loadTxns = useCallback(async () => {
    // Always read the freshest initData at call-time to avoid stale closure
    const initNow = getInitData && getInitData({ refresh: true });
    if (!initNow) return;
    setLoading(true); setErr('');
    try {
      const r = await apiFetch(`/api/data-balance?limit=${limit}&offset=${offset}`);
      const j = await r.json().catch(() => ({}));
      const txns = Array.isArray(j?.txns)
        ? j.txns
        : Array.isArray(j?.transactions)
          ? j.transactions
          : [];
      setRows(txns);
    } catch (e) {
      setErr(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);


  useEffect(() => {
    function onWalletUpdated() {
      // slight debounce so backend finishes writes
      setTimeout(() => loadTxns(), 120);
    }
    window.addEventListener('wallet:updated', onWalletUpdated);
    return () => window.removeEventListener('wallet:updated', onWalletUpdated);
  }, [loadTxns]);

  useEffect(() => {
    let cancelled = false;

    // Attempt an immediate load (covers the normal case where initData is present)
    loadTxns();

    // If initData isn't ready yet (running outside Telegram and then opened),
    // poll briefly until it becomes available, then load once.
    if (!(getInitData && getInitData())) {
      const timer = setInterval(() => {
        const ready = getInitData && getInitData();
        if (ready) {
          clearInterval(timer);
          if (!cancelled) loadTxns();
        }
      }, 400);
      return () => { cancelled = true; clearInterval(timer); };
    }

    return () => { cancelled = true; };
  }, [loadTxns]);

  // Normalize inputs: server txns (rows) + any in-memory txns/bets as fallback
  const serverTxns = rows;
  const fallbackTxns = Array.isArray(state?.walletTxns) ? state.walletTxns : [];
  const txns = serverTxns.length ? serverTxns : fallbackTxns;
  const bets = Array.isArray(state?.bets) ? state.bets : [];

  // --- Render rows inside PNG layout (ledger box) ---
  // Build a unified, null-safe history list first
  const maxDisplayRows = 10;

  // Guard against undefined arrays (txns/bets now defined above)
  const safeTxns = Array.isArray(txns) ? txns : [];
  const safeTxnsFiltered = safeTxns.filter(t => !/^bet:/i.test(t.note || ''));
  const safeBets = Array.isArray(bets) ? bets : [];

  // Recompute historyRows with full null-safety (map only on arrays)
  const historyRows = useMemo(() => {
    // Using shared formatters from src/lib/formatters.mjs

    // Map server txns → table rows
    const mappedTxns = safeTxnsFiltered.map((t) => {
      const note = typeof t?.note === 'string' ? t.note : '';
      const typeLower = note.toLowerCase();
      const isBetTxn = (t?.type === 'bet') || note.startsWith('bet:');

      // Try to extract group/figure from various note patterns
      let group = t?.group_code || t?.group || '';
      let figure = t?.figure || '';

      if (isBetTxn) {
        const mHash = note.match(/\b([ABCD])#(\d{1,2})\b/i);
        if (mHash) { group = group || mHash[1]; figure = figure || mHash[2]; }

        const mG = note.match(/\bgroup\s*=\s*([ABCD])\b/i);
        const mF = note.match(/\bfigure\s*=\s*(\d{1,2})\b/i);
        if (mG) group = group || mG[1];
        if (mF) figure = figure || mF[1];

        const mComma = note.match(/\bbet\s*:\s*([ABCD])\s*,\s*(\d{1,2})\b/i);
        if (mComma) { group = group || mComma[1]; figure = figure || mComma[2]; }

        const mCompact = note.match(/\b([ABCD])\s*([1-9][0-9]?)\b/i);
        if (mCompact) { group = group || mCompact[1]; figure = figure || mCompact[2]; }
      }

      const g = formatGroup(group);
      const f = formatFigure(figure);
      const figureLabel = formatGroupFigure(g, f) || (t?.figure != null ? String(t.figure) : '-');

      // Transaction label
      let label = 'Transaction';
      if (isBetTxn || t?.type === 'bet') label = 'Bet';
      else if ((t?.type || '').toLowerCase() === 'credit' || typeLower.includes('deposit')) label = 'Deposit';
      else if ((t?.type || '').toLowerCase() === 'debit' || typeLower.includes('withdraw')) label = 'Withdraw';

      const rawAmount = Number(t?.amount) || 0;
      const isNegative = isBetTxn || (t?.type === 'debit');
      const signedAmount = isNegative ? -Math.abs(rawAmount) : Math.abs(rawAmount);
      const timestamp = t?.createdAt || t?.created_at || t?.timestamp || new Date().toISOString();

      return {
        id: `txn-${t?.id ?? `${signedAmount}-${Math.random().toString(36).slice(2)}`}`,
        timestamp,
        transaction: label,
        figure: figureLabel,
        points: signedAmount,
      };
    });

    // Map in-memory bets → table rows
    const mappedBets = safeBets.map((b) => {
      const g0 = b?.group_code || b?.group || '';
      const f0 = b?.figure;
      const gg = formatGroup(g0);
      const ff = formatFigure(f0);
      const figureLabel = (gg && ff) ? formatGroupFigure(gg, ff) : (b?.figure != null ? String(b.figure) : '-');

      return {
        id: `bet-${b?.id ?? `${b?.figure}-${Math.random().toString(36).slice(2)}`}`,
        timestamp: b?.createdAt || b?.created_at || b?.timestamp || new Date().toISOString(),
        transaction: 'Bet',
        figure: figureLabel,
        points: -Math.abs(b?.points ?? b?.amount ?? 0),
      };
    });

    // Combine and sort by newest first
    return [...mappedTxns, ...mappedBets].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [safeTxnsFiltered, safeBets]);

  // Now safely slice visible rows (previous bug: referenced historyRows before it was defined)
  const visibleRows = useMemo(() => historyRows.slice(0, maxDisplayRows), [historyRows]);

  // Ledger area from the PNG (absolute coords used across the file)
  const LEDGER_TOP_START = 16.50;   // first row top %
  const LEDGER_ROW_GAP   = 4.00;    // percent gap between rows
  const LEDGER_ROW_H     = 3.10;    // row height %

  // Column positions inside the ledger area, tuned to the PNG
  const COLS = {
    date:       { left:  6.50, width: 38.00 },
    txn:        { left: 45.00, width: 20.50 },
    figure:     { left: 65.50, width: 13.50 },
    points:     { left: 79.50, width: 15.00 },
  };

  // Build read-only input hotspots per row/column
  const rowHotspots = visibleRows.flatMap((row, idx) => {
    const top = (LEDGER_TOP_START + LEDGER_ROW_GAP * idx).toFixed(2) + '%';
    const baseStyle = {
      background: '#fff',
      opacity: 1,
      filter: 'none',
      WebkitBackdropFilter: 'none',
      border: '0',
      boxShadow: 'none',
      color: '#111827',
      padding: 0,
    };
    const dateVal   = row?.timestamp ? new Date(row.timestamp).toLocaleString() : '';
    const txnVal    = row?.transaction ?? '';
    const figVal    = row?.figure ?? '';
    const ptsRaw    = Number(row?.points ?? 0);
    const ptsPrefix = ptsRaw >= 0 ? '+' : '';
    const ptsVal    = `${ptsPrefix}${Number(ptsRaw).toLocaleString()}`;

    return [
      {
        key: `hist_date_${idx}`,
        kind: 'input',
        title: 'Date & Time',
        left: `${COLS.date.left}%`,
        top,
        width: `${COLS.date.width}%`,
        height: `${LEDGER_ROW_H}%`,
        value: dateVal,
        readOnly: true,
        inputType: 'text',
        coerceNumber: false,
        inputStyle: { ...baseStyle, color: '#111827', textAlign: 'left' },
      },
      {
        key: `hist_txn_${idx}`,
        kind: 'input',
        title: 'Transaction',
        left: `${COLS.txn.left}%`,
        top,
        width: `${COLS.txn.width}%`,
        height: `${LEDGER_ROW_H}%`,
        value: txnVal,
        readOnly: true,
        inputType: 'text',
        coerceNumber: false,
        inputStyle: { ...baseStyle, color: '#374151', textAlign: 'left', fontWeight: 600 },
      },
      {
        key: `hist_fig_${idx}`,
        kind: 'input',
        title: 'Figure',
        left: `${COLS.figure.left}%`,
        top,
        width: `${COLS.figure.width}%`,
        height: `${LEDGER_ROW_H}%`,
        value: figVal,
        readOnly: true,
        inputType: 'text',
        coerceNumber: false,
        inputStyle: { ...baseStyle, color: '#374151', textAlign: 'center', fontWeight: 600 },
      },
      {
        key: `hist_pts_${idx}`,
        kind: 'input',
        title: 'Points',
        left: `${COLS.points.left}%`,
        top,
        width: `${COLS.points.width}%`,
        height: `${LEDGER_ROW_H}%`,
        value: ptsVal,
        readOnly: true,
        inputType: 'text',
        coerceNumber: false,
        inputStyle: { ...baseStyle, color: ptsRaw >= 0 ? '#1a7f37' : '#b42318', textAlign: 'right', fontWeight: 700 },
      },
    ];
  });

  const hotspots = [
    {
      key: 'historyLedger',
      title: 'Points transaction history',
      left: '3.76%',
      top: '13.63%',
      width: '92.18%',
      height: '40.59%',
      onClick: () => {/* non-nav hitbox */},
    },
    ...rowHotspots,
  ];

  const showOverlay = edit;
  useHotspotDebug('history', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngHistory}
        alt="History"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => console.log('History hotspot draft:', d)}
      />


      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit((v) => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        <button onClick={() => loadTxns()} disabled={loading}>Refresh</button>
        <button onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={offset === 0 || loading}>Prev</button>
        <button onClick={() => setOffset((o) => o + limit)} disabled={loading}>Next</button>
      </div>
    </div>
  );
}
export function WithdrawSetupScreen({ onNavigate, debug = false }) {
    const { state, setAuth } = useAppState();
    const auth = state?.auth || {};
    const [edit, setEdit] = useState(false);
    const initialMethod = (auth.withdrawMethod || auth.withdraw_method || auth.bank || 'bank').toLowerCase();
    const initialAccount = (() => {
      if (auth.withdrawDest) {
        const parts = String(auth.withdrawDest).split(':');
        return parts.length > 1 ? parts.slice(1).join(':').trim() : auth.withdrawDest;
      }
      return auth.accountNumber || '';
    })();
    const [selectedBank, setSelectedBank] = useState(initialMethod);
    const [accountNumber, setAccountNumber] = useState(initialAccount);
    const [accountHolder, setAccountHolder] = useState(auth.withdrawHolder || auth.accountName || auth.name || '');
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const [saveError, setSaveError] = useState('');

    useEffect(() => {
      const nextMethod = (auth.withdrawMethod || auth.withdraw_method || auth.bank || 'bank').toLowerCase();
      setSelectedBank(nextMethod);
      if (auth.withdrawDest) {
        const parts = String(auth.withdrawDest).split(':');
        setAccountNumber(parts.length > 1 ? parts.slice(1).join(':').trim() : auth.withdrawDest);
      } else if (auth.accountNumber) {
        setAccountNumber(auth.accountNumber);
      }
      if (auth.withdrawHolder || auth.accountName || auth.name) {
        setAccountHolder(auth.withdrawHolder || auth.accountName || auth.name || '');
      }
    }, [auth.withdrawDest, auth.withdrawHolder, auth.withdrawMethod, auth.accountNumber, auth.accountName, auth.bank, auth.name]);

    const userName = auth.name || auth.fullName || 'User Name';
    const userId = auth.userId || auth.telegramId || auth.id || 'Unknown ID';
    const summaryDisplay = `${userName} · ID ${userId}`;

    const bankOptions = auth.availableBanks || [
      { label: 'Maybank', value: 'maybank' },
      { label: 'CIMB', value: 'cimb' },
      { label: 'Public Bank', value: 'public-bank' },
      { label: 'Touch n Go eWallet', value: 'ewallet' },
      { label: 'Agent / GrabPay', value: 'agent' },
    ];

    const handleSaveInfo = async () => {
      const method = selectedBank || 'bank';
      const trimmedAccount = accountNumber.trim();
      const trimmedHolder = accountHolder.trim();
      if (!method) {
        alert('Select a bank or e-wallet option.');
        return;
      }
      if (!trimmedAccount) {
        alert('Enter an account / wallet number.');
        return;
      }
      if (!trimmedHolder) {
        alert('Enter the account holder name.');
        return;
      }
      const initData = getInitData();
      if (!initData) {
        alert('Open inside Telegram to continue (initData missing).');
        return;
      }
      setSaving(true);
      setSaveStatus('');
      setSaveError('');
      try {
        const normalized = normalizeWithdrawPayload({
          withdrawMethod: method,
          withdrawDest: `${method}:${trimmedAccount}`,
          withdrawHolder: trimmedHolder,
          accountName: auth.accountName,
          name: auth.name,
        });
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'tma ' + initData,
          },
          body: JSON.stringify({
            initData,
            profile: {
              withdrawMethod: normalized.method,
              withdrawDest: normalized.destination,
              withdrawHolder: normalized.holder,
            },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          const message = json?.error || json?.reason || `Failed to save withdraw info (${res.status})`;
          setSaveError(message);
          alert(message);
          return;
        }
        const profile = json.profile || {};
        setSaveStatus('Withdraw info saved.');
        setAuth({
          withdrawMethod: profile.withdraw_method || normalized.method,
          withdrawDest: profile.withdraw_dest || normalized.destination,
          withdrawHolder: profile.withdraw_holder || normalized.holder,
          profile: { ...(auth.profile || {}), ...profile },
        });
        try {
          localStorage.setItem('LD_profile', JSON.stringify(profile));
        } catch {}
        alert('Withdraw info saved.');
      } catch (error) {
        console.error('withdraw-info-save', error);
        const message = error?.message ? String(error.message) : 'Failed to save withdraw info.';
        setSaveError(message);
        alert(message);
      } finally {
        setSaving(false);
      }
    };

    const handleSaveNewDestination = async () => {
      const method = (selectedBank || 'bank').toLowerCase();
      const trimmedAccount = accountNumber.trim();
      const trimmedHolder = accountHolder.trim();
      if (!method) {
        alert('Select a bank or e-wallet option.');
        return;
      }
      if (!trimmedAccount) {
        alert('Enter an account / wallet number.');
        return;
      }
      if (!trimmedHolder) {
        alert('Enter the account holder name.');
        return;
      }
      const initData = getInitData();
      if (!initData) {
        alert('Open inside Telegram to continue (initData missing).');
        return;
      }
      setSaving(true);
      setSaveStatus('');
      setSaveError('');
      try {
        // Derive a human label from options, fallback to method
        const bankOpt = (bankOptions || []).find((o) => o.value === method || o.value === selectedBank || o.label?.toLowerCase() === method);
        const bankLabel = bankOpt?.label || method;

        const normalized = normalizeWithdrawPayload({
          withdrawMethod: method,
          withdrawDest: `${method}:${trimmedAccount}`,
          withdrawHolder: trimmedHolder,
          accountName: auth.accountName,
          name: auth.name,
        });

        // Compose a new destination entry
        const newEntry = {
          id: `dest-${Date.now()}`,
          method: normalized.method,
          bank: bankLabel,
          bankLabel,
          accountNumber: trimmedAccount,
          accountHolder: normalized.holder,
          destination: normalized.destination,
        };

        // Append to existing withdrawAccounts (client-side)
        const existing = Array.isArray(auth.withdrawAccounts) ? auth.withdrawAccounts : [];
        const nextAccounts = [...existing, newEntry];

        // Persist to backend (compatible with older server: single fields + optional array)
        const payload = {
          initData,
          profile: {
            withdrawMethod: normalized.method,
            withdrawDest: normalized.destination,
            withdrawHolder: normalized.holder,
            withdrawAccounts: nextAccounts,
          },
        };

        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'tma ' + initData,
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          const message = json?.error || json?.reason || `Failed to save new destination (${res.status})`;
          setSaveError(message);
          alert(message);
          return;
        }

        const profile = json.profile || {};
        // Update client auth state with new array while keeping single-field compatibility
        setAuth({
          ...auth,
          withdrawMethod: profile.withdraw_method || normalized.method,
          withdrawDest: profile.withdraw_dest || normalized.destination,
          withdrawHolder: profile.withdraw_holder || normalized.holder,
          withdrawAccounts: Array.isArray(profile.withdraw_accounts) ? profile.withdraw_accounts : nextAccounts,
          profile: { ...(auth.profile || {}), ...profile },
        });

        try {
          const cached = {
            ...(profile || {}),
            withdraw_accounts: Array.isArray(profile.withdraw_accounts) ? profile.withdraw_accounts : nextAccounts,
          };
          localStorage.setItem('LD_profile', JSON.stringify(cached));
        } catch {}

        setSaveStatus('New withdrawal destination saved.');
        alert('New withdrawal destination saved.');
      } catch (error) {
        console.error('withdraw-new-destination-save', error);
        const message = error?.message ? String(error.message) : 'Failed to save new destination.';
        setSaveError(message);
        alert(message);
      } finally {
        setSaving(false);
      }
    };

    const hotspots = [
      {
        key: 'userSummary',
        kind: 'input',
        title: 'User summary',
        left: '4.00%',
        top: '9.00%',
        width: '91.00%',
        height: '10.00%',
        value: summaryDisplay,
        readOnly: true,
        inputType: 'text',
        inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
      },
      {
        key: 'bankSelect',
        kind: 'select',
        title: 'Bank/e-Wallet',
        left: '4.00%',
        top: '22.00%',
        width: '92.00%',
        height: '6.00%',
        value: selectedBank,
        placeholder: 'Select Bank / e-Wallet',
        options: bankOptions,
        onChange: setSelectedBank,
      },
      {
        key: 'accountNumber',
        kind: 'input',
        title: 'Account Number',
        left: '4.00%',
        top: '30.00%',
        width: '91.00%',
        height: '5.00%',
        value: accountNumber,
        placeholder: 'example : 01111624835',
        inputType: 'text',
        inputMode: 'numeric',
        inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
        onChange: setAccountNumber,
      },
      {
        key: 'accountHolder',
        kind: 'input',
        title: 'Account Holder Name',
        left: '4.00%',
        top: '39.00%',
        width: '92.00%',
        height: '6.00%',
        value: accountHolder,
        placeholder: 'example: Abu Bin Mohd',
        inputType: 'text',
        inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
        onChange: setAccountHolder,
      },
      {
        key: 'submitWithdraw',
        title: saving ? 'Saving…' : 'Save Bank / Wallet Info',
        left: '4.00%',
        top: '49.00%',
        width: '92.00%',
        height: '5.00%',
        onClick: handleSaveInfo,
      },
      {
        key: 'saveNewDestination',
        title: saving ? 'Saving…' : 'Save as New Destination',
        left: '4.00%',
        top: '55.00%',
        width: '92.00%',
        height: '5.00%',
        onClick: handleSaveNewDestination,
      },
    ];
    const showOverlay = edit;
    useHotspotDebug('withdraw', debug, hotspots);
    return (
      <div style={{ padding: 12 }}>
        <HotspotImage
          src={PngWithdraw}
          alt="Withdraw Setup"
          hotspots={hotspots}
          editable={edit}
          showOverlay={showOverlay}
          interactionsEnabled={!edit}
          onBack={() => onNavigate('dashboard')}
          onDraft={(d) => console.log('Withdraw hotspot draft:', d)}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => onNavigate('dashboard')}>Back</button>
          <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        </div>
        {saveStatus && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#1a7f37' }}>{saveStatus}</div>
        )}
        {saveError && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#b42318' }}>{saveError}</div>
        )}
      </div>
    );
}

export function InviteScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  // Deep link to Telegram bot (Mini App)
  const inviteLink = tgBotLink('startapp', 'invite');
  const hotspots = [
    // QR area (placeholder action for now)
    { left: '22.00%', top: '11.00%', width: '55.00%', height: '26.00%', onClick: () => console.log('QR tapped — will show backend QR later') },
    // Invite link display box
    {
      key: 'inviteDisplay',
      kind: 'input',
      title: 'Generated invite link',
      left: '4.00%',
      top: '42.00%',
      width: '92.00%',
      height: '6.00%',
      value: inviteLink,
      readOnly: true,
      inputType: 'text',
      inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
    },
    // Copy Link button (real copy)
    { left: '4.00%', top: '50.66%', width: '91.69%', height: '5.66%', onClick: async () => {
      try {
        await navigator.clipboard.writeText(inviteLink);
        console.log('Copied:', inviteLink);
        alert('Invite link copied!');
      } catch (e) {
        console.log('Copy failed:', e);
        alert('Copy failed. Please copy manually.');
      }
    }}
  ];
  const showOverlay = edit;
  useHotspotDebug('invite', debug, hotspots);
  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngInvite}
        alt="Invite"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => console.log('Invite hotspot draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

// Admin 09 layout (5 hotspots, same size as #2)
const admin09Hotspots = [
  { left: '3.57%', top: '20.45%', width: '91.33%', height: '5.08%' }, // 1
  { left: '3.57%', top: '26.83%', width: '91.33%', height: '5.08%' }, // 2
  { left: '3.57%', top: '33.21%', width: '91.33%', height: '5.08%' }, // 3
  { left: '3.57%', top: '39.59%', width: '91.33%', height: '5.08%' }, // 4
  { left: '3.57%', top: '45.97%', width: '91.33%', height: '5.08%' }, // 5
];

function formatAdminAccessReason(reason) {
  if (!reason) return '';
  const value = String(reason);
  const normalized = value.toLowerCase();
  if (normalized === 'missing_init_data') {
    return 'Launch this mini app from Telegram to verify admin access.';
  }
  if (normalized === 'not_admin') {
    return 'Your Telegram account is not authorized for admin access.';
  }
  if (normalized === 'network_error') {
    return 'Network error while verifying admin access. Try again.';
  }
  if (normalized.startsWith('status_')) {
    const code = value.slice(7) || '?';
    return `Server responded with status ${code} while verifying admin access.`;
  }
  if (normalized === 'verify_failed') {
    return 'Admin verification failed. Refresh the mini app and try again.';
  }
  if (normalized === 'missing_tma_header') {
    return 'Authorization header missing. Relaunch the mini app from Telegram.';
  }
  return value;
}

function AdminAccessRequired({ onNavigate, reason }) {
  const message = formatAdminAccessReason(reason);
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Admin access required</h2>
      <p style={{ margin: '12px 0' }}>{message || 'Admin access is restricted to authorized accounts.'}</p>
      <button onClick={() => onNavigate('dashboard')}>Back to Dashboard</button>
    </div>
  );
}

// (Stray duplicate AdminDashboardScreen and its hooks removed)
export function AdminUserManagementScreen({ onNavigate, debug = false }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [limit, setLimit] = React.useState(25);
  const [offset, setOffset] = React.useState(0);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setError('');
    const initData = getInitData();
    if (!initData) {
      setError('Missing Telegram init data. Please open this mini app inside Telegram.');
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'tma ' + initData },
        body: JSON.stringify({ action: 'list_profiles', limit, offset }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const reason = json?.reason || json?.error || `HTTP ${res.status}`;
        setError(`Failed to load profiles: ${reason}`);
        setRows([]);
        return;
      }
      const list = Array.isArray(json?.profiles) ? json.profiles : (Array.isArray(json?.rows) ? json.rows : []);
      setRows(list);
    } catch (e) {
      setError(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  React.useEffect(() => { loadUsers(); }, [loadUsers]);

  async function callAdmin(action, payload) {
    const init = (typeof getInitData === 'function' ? getInitData() : '');
    if (!init) { alert('Missing admin initData'); return null; }
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `tma ${init}` },
      body: JSON.stringify({ action, ...payload })
    });
    const j = await r.json().catch(() => ({}));
    if (!j || j.ok !== true) {
      console.warn('admin call failed', action, j);
      alert(`Admin action failed: ${j && j.reason || 'unknown_error'}`);
      return null;
    }
    return j;
  }

  async function onToggleAdmin(u) {
    const resp = await callAdmin('user_update', { user_id: u.user_id, is_admin: !u.is_admin });
    if (resp && typeof loadUsers === 'function') loadUsers();
  }

  async function onResetPin(u) {
    const resp = await callAdmin('user_reset_pin', { user_id: u.user_id });
    if (resp) alert(`PIN reset for ${u.user_id}. New PIN: ${resp.new_pin}`);
  }

  async function onApproveReject(kind, rowData) {
    const isDeposit = kind.startsWith('deposit');
    let requestId = null;

    if (rowData && typeof rowData === 'object') {
      requestId = isDeposit ? rowData.deposit_request_id : rowData.withdraw_request_id;
    }

    if (!requestId) {
      requestId = window.prompt(`Enter ${kind} request id`);
    }

    if (!requestId) return;

    if (kind === 'withdraw-approve') {
      const r = await callAdmin('approve_withdraw', { requestId, approve: true });
      if (r) {
        alert('Withdraw approved');
        await loadUsers();
      }
    } else if (kind === 'withdraw-reject') {
      const r = await callAdmin('approve_withdraw', { requestId, approve: false });
      if (r) {
        alert('Withdraw rejected');
        await loadUsers();
      }
    } else if (kind === 'deposit-approve') {
      const r = await callAdmin('approve_deposit', { requestId });
      if (r) {
        alert('Deposit approved');
        await loadUsers();
      }
    } else if (kind === 'deposit-reject') {
      const r = await callAdmin('reject_deposit', { requestId });
      if (r) {
        alert('Deposit rejected');
        await loadUsers();
      }
    }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back</button>
        <button onClick={loadUsers} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
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
        <div style={{ marginLeft:'auto', fontSize:12, opacity:0.7 }}>v: admin-users-table-01</div>
      </div>

      {error && <div style={{ color:'#b42318', fontSize:13 }}>{error}</div>}

      <div style={{ overflowX:'auto', border:'1px solid #e5e7eb', borderRadius:8 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Inter, system-ui, sans-serif', fontSize:14 }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>User ID</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Name</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Contact</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Admin</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Has PIN</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Updated</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Status / Request Type</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding:'12px 10px', color:'#6b7280' }}>
                {loading ? 'Loading…' : 'No rows'}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.user_id || r.id}>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{r.user_id || r.id}</td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{r.name || r.full_name || ''}</td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{r.contact || r.phone || ''}</td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{String(r.is_admin ?? false)}</td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{String(r.has_pin ?? false)}</td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{r.updated_at || r.created_at || ''}</td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>
                  {(() => {
                    const status = r.active_request_status ?? r.status;
                    const type = r.active_request_type ?? r.request_type;
                    if (status && type) return `${type}: ${status}`;
                    return status || type || '-';
                  })()}
                </td>
                <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6', whiteSpace:'nowrap' }}>
                  <button onClick={() => onToggleAdmin(r)}>
                    {r.is_admin ? 'Revoke Admin' : 'Make Admin'}
                  </button>
                  <button onClick={() => onResetPin(r)} style={{ marginLeft: 6 }}>
                    Reset PIN
                  </button>

                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize:12, opacity:0.8, marginBottom:4 }}>
                      Deposit {r.deposit_status ? `(${r.deposit_status}${r.deposit_request_id ? ` • ${r.deposit_request_id}` : ''})` : '—'}
                    </div>
                    <button
                      onClick={() => onApproveReject('deposit-approve', r)}
                      disabled={!r.deposit_request_id}
                    >
                      Approve Deposit
                    </button>
                    <button
                      onClick={() => onApproveReject('deposit-reject', r)}
                      style={{ marginLeft: 6 }}
                      disabled={!r.deposit_request_id}
                    >
                      Reject Deposit
                    </button>
                    {!r.deposit_request_id && (
                      <span style={{ marginLeft: 6, fontSize:12, color:'#6b7280' }}>No pending deposit</span>
                    )}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize:12, opacity:0.8, marginBottom:4 }}>
                      Withdraw {r.withdraw_status ? `(${r.withdraw_status}${r.withdraw_request_id ? ` • ${r.withdraw_request_id}` : ''})` : '—'}
                    </div>
                    <button
                      onClick={() => onApproveReject('withdraw-approve', r)}
                      disabled={!r.withdraw_request_id}
                    >
                      Approve Withdraw
                    </button>
                    <button
                      onClick={() => onApproveReject('withdraw-reject', r)}
                      style={{ marginLeft: 6 }}
                      disabled={!r.withdraw_request_id}
                    >
                      Reject Withdraw
                    </button>
                    {!r.withdraw_request_id && (
                      <span style={{ marginLeft: 6, fontSize:12, color:'#6b7280' }}>No pending withdraw</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset===0 || loading}>Prev</button>
        <button onClick={() => setOffset(offset + limit)} disabled={loading}>Next</button>
        <span style={{ fontSize:12, opacity:0.7 }}>offset {offset}</span>
      </div>
    </div>
  );
}

export function AdminPointsTrackingScreen({ onNavigate, debug = false }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [limit, setLimit] = React.useState(50);
  const [offset, setOffset] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    const initData = getInitData();
    if (!initData) {
      setError('Missing Telegram init data. Please open this mini app inside Telegram.');
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'tma ' + initData },
        body: JSON.stringify({ action: 'list_wallet_txns', limit, offset }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const reason = json?.reason || json?.error || `HTTP ${res.status}`;
        setError(`Failed to load transactions: ${reason}`);
        setRows([]);
        return;
      }
      const list = Array.isArray(json?.txns) ? json.txns : (Array.isArray(json?.rows) ? json.rows : []);
      setRows(list);
    } catch (e) {
      setError(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back</button>
        <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span>Limit</span>
          <input
            type="number"
            min={10}
            max={200}
            step={10}
            value={limit}
            onChange={(e) => setLimit(Math.max(10, Math.min(200, Number(e.target.value) || 50)))}
            style={{ width: 80 }}
          />
        </label>
        <div style={{ marginLeft:'auto', fontSize:12, opacity:0.7 }}>v: admin-points-table-01</div>
      </div>

      {error && <div style={{ color:'#b42318', fontSize:13 }}>{error}</div>}

      <div style={{ overflowX:'auto', border:'1px solid #e5e7eb', borderRadius:8 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Inter, system-ui, sans-serif', fontSize:14 }}>
          <thead style={{ background:'#f9fafb' }}>
            <tr>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Time</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>User</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Type</th>
              <th style={{ textAlign:'right', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Amount</th>
              <th style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #e5e7eb' }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding:'12px 10px', color:'#6b7280' }}>
                {loading ? 'Loading…' : 'No rows'}
              </td></tr>
            )}
            {rows.map((t) => {
              const ts = t.created_at || t.timestamp || t.createdAt || '';
              const amt = Number(t.amount) || 0;
              return (
                <tr key={t.id}>
                  <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{ts}</td>
                  <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{t.user_id}</td>
                  <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{t.type}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: amt >= 0 ? '#065f46' : '#b42318', fontWeight: 700 }}>
                    {amt >= 0 ? `+${amt}` : `${amt}`}
                  </td>
                  <td style={{ padding:'8px 10px', borderBottom:'1px solid #f3f4f6' }}>{t.note || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset===0 || loading}>Prev</button>
        <button onClick={() => setOffset(offset + limit)} disabled={loading}>Next</button>
        <span style={{ fontSize:12, opacity:0.7 }}>offset {offset}</span>
      </div>
    </div>
  );
}

export function AdminFiguresDataScreen({ onNavigate, debug = false }) {
  const [group, setGroup] = React.useState('A');
  const [drawId, setDrawId] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [totals, setTotals] = React.useState(() => {
    const m = new Map();
    for (let f = 1; f <= 36; f += 1) m.set(f, 0);
    return m;
  });

  const normalizeTotals = React.useCallback((payload) => {
    // Accept multiple shapes:
    // 1) { totalsByFigure: { "1": 10, "2": 0, ... } }
    // 2) { totals: [{ figure: 1, points: 10 }, ...] }
    // 3) { rows: [{ figure: 1, sum: 10 }, ...] }
    const map = new Map();
    for (let i = 1; i <= 36; i++) map.set(i, 0);

    if (payload && payload.totalsByFigure && typeof payload.totalsByFigure === 'object') {
      Object.entries(payload.totalsByFigure).forEach(([k, v]) => {
        const f = Number(k);
        if (f >= 1 && f <= 36) map.set(f, Number(v) || 0);
      });
      return map;
    }

    const arr = Array.isArray(payload?.totals) ? payload.totals
      : Array.isArray(payload?.rows) ? payload.rows
      : Array.isArray(payload) ? payload
      : [];

    arr.forEach((row) => {
      const f = Number(row?.figure ?? row?.fig ?? row?.id);
      const pts = Number(row?.points ?? row?.sum ?? row?.total ?? 0);
      if (Number.isFinite(f) && f >= 1 && f <= 36) map.set(f, pts);
    });

    return map;
  }, []);

  const fetchTotals = React.useCallback(async (g) => {
    setLoading(true); setError('');
    try {
      // Prefer admin endpoint which returns per-figure totals for the current open draw & group
      const res = await apiFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'figure_totals', group: g })
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.ok === false) {
        const reason = json?.reason || json?.error || `HTTP ${res.status}`;
        throw new Error(`Failed to load figure totals: ${reason}`);
      }

      // Draw hint (if provided by backend)
      const hintDrawId = json?.draw?.id || json?.draw_id || json?.open_draw_id || null;
      if (hintDrawId) setDrawId(hintDrawId);

      setTotals(normalizeTotals(json));
    } catch (err) {
      // Fallback: try wallet bet_totals (group-level only)
      try {
        const r2 = await apiFetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bet_totals' })
        });
        const j2 = await r2.json().catch(() => ({}));
        if (r2.ok && j2) {
          setError(`Per-figure totals unavailable; showing zeros. (${String(err?.message || err)})`);
        } else {
          setError(String(err?.message || err));
        }
      } catch {
        setError(String(err?.message || err));
      }
    } finally {
      setLoading(false);
    }
  }, [normalizeTotals]);

  React.useEffect(() => { fetchTotals(group); }, [fetchTotals, group]);

  // Build 6×6 grid
  const grid = React.useMemo(() => {
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const cols = [];
      for (let c = 0; c < 6; c++) {
        const f = r * 6 + c + 1;
        cols.push({ f, pts: totals.get(f) || 0 });
      }
      rows.push(cols);
    }
    return rows;
  }, [totals]);

  // Bottom summary string
  const summaryText = React.useMemo(() => {
    const parts = [];
    for (let f = 1; f <= 36; f += 1) {
      const v = totals.get(f) || 0;
      if (v > 0) parts.push(`F${f}=${v}pts`);
    }
    return parts.length ? parts.join(', ') : 'No live bets yet.';
  }, [totals]);

  // Optional: Execute draw from here (since AdminDashboard was dropped)
  const executeNow = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/admin-draw-exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-key': 'test-12345-xyz' },
        body: JSON.stringify({ group, action: 'execute_now' })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const reason = json?.reason || json?.error || `HTTP ${res.status}`;
        throw new Error(`Execute failed: ${reason}`);
      }
      await fetchTotals(group);
      onNavigate('adminResults');
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [fetchTotals, group, onNavigate]);

  return (
    <div style={{ padding: 12, minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back</button>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span>Group</span>
          <select value={group} onChange={(e)=>setGroup(e.target.value)} aria-label='Select group'>
            <option value='A'>A</option>
            <option value='B'>B</option>
            <option value='C'>C</option>
            <option value='D'>D</option>
          </select>
        </label>
        <button onClick={() => fetchTotals(group)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button onClick={executeNow} disabled={loading}>Execute Now</button>
        <div style={{ marginLeft:'auto', fontSize:12, opacity:0.7 }}>
          {drawId ? `Draw #${drawId}` : 'Draw: —'} · v: admin-figures-slim-01
        </div>
      </div>

      {/* Hybrid layout: faint PNG background + responsive table */}
      <div style={{ position:'relative', width:'100%', border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
        <img src={PngAdminFigures} alt='Admin Figures' style={{ width:'100%', height:'auto', display:'block', opacity: 0.2 }} />
        <div style={{ position:'absolute', inset: 8, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'min(820px, 100%)', overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
              <tbody>
                {grid.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell) => (
                      <td key={cell.f} style={{ border:'1px solid #e5e7eb', padding:'10px 8px', textAlign:'center', minWidth: 72 }}>
                        <div style={{ fontWeight:700 }}>{cell.f}</div>
                        <div style={{ fontSize:12, color:'#374151' }}>{cell.pts} pts</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom totals */}
      <div style={{ padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#f9fafb', fontSize:13 }}>
        <strong>Current TOTAL LIVE BET:</strong> {summaryText}
      </div>

      {error && <div style={{ color:'#b42318', fontSize:13 }}>{error}</div>}
    </div>
  );
}

export function AdminResultPostingScreen({ onNavigate, debug = false }) {
  const { state, postResult } = useAppState();
  const isAdmin = !!state?.auth?.isAdmin;
  const [edit, setEdit] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [selectedFigure, setSelectedFigure] = useState('1');
  const [gifFile, setGifFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef(null);

  useHotspotDebug(
    'admin-results',
    debug,
    isAdmin
      ? [
          {
            key: 'placeholder',
            title: 'placeholder',
            left: '0%',
            top: '0%',
            width: '0%',
            height: '0%',
          },
        ]
      : []
  );

  if (!isAdmin) {
    return <AdminAccessRequired onNavigate={onNavigate} reason={state?.auth?.adminDeniedReason} />;
  }

  const figureOptions = useMemo(
    () => Array.from({ length: 36 }, (_, idx) => ({ label: `Figure ${idx + 1}`, value: String(idx + 1) })),
    []
  );
  const groupOptions = useMemo(
    () => ['A', 'B', 'C', 'D'].map((group) => ({ label: `Group ${group}`, value: group })),
    []
  );

  const handleFileClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setGifFile(null);
      setStatusMessage('');
      return;
    }
    const isGif = (file.type && file.type.toLowerCase() === 'image/gif') || /\.gif$/i.test(file.name);
    if (!isGif) {
      setStatusMessage('Please select a .gif file.');
      setGifFile(null);
      event.target.value = '';
      return;
    }
    setGifFile(file);
    setStatusMessage('');
  }, []);

  const handlePost = useCallback(async () => {
    if (isPosting) return;
    if (!selectedGroup || !selectedFigure) {
      setStatusMessage('Select both a group and figure.');
      return;
    }
    if (!gifFile) {
      setStatusMessage('Upload the winning GIF before posting.');
      return;
    }

    setIsPosting(true);
    setStatusMessage('');
    try {
      await postResult({ group: selectedGroup, figure: Number(selectedFigure), gifFile });
      alert(`Results for Group ${selectedGroup}, Figure ${selectedFigure} posted.`);
      setGifFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onNavigate('adminDashboard');
    } catch (error) {
      console.error('Failed to post result', error);
      setStatusMessage('Failed to post results. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }, [gifFile, isPosting, onNavigate, postResult, selectedFigure, selectedGroup]);

  const hotspots = [
    {
      key: 'backDash',
      title: 'Back to Admin',
      left: '2.56%',
      top: '5.35%',
      width: '43.59%',
      height: '11.47%',
      onClick: () => onNavigate('adminDashboard'),
    },
    {
      key: 'groupSelect',
      title: 'Select group',
      kind: 'select',
      left: '3.85%',
      top: '19.88%',
      width: '92.31%',
      height: '9.17%',
      value: selectedGroup,
      options: groupOptions,
      placeholder: 'Select group',
      onChange: setSelectedGroup,
    },
    {
      key: 'figureSelect',
      title: 'Select figure',
      kind: 'select',
      left: '3.85%',
      top: '32.11%',
      width: '92.31%',
      height: '9.17%',
      value: selectedFigure,
      options: figureOptions,
      placeholder: 'Select figure',
      onChange: setSelectedFigure,
    },
    {
      key: 'gifUpload',
      title: gifFile ? `Selected GIF: ${gifFile.name}` : 'Upload result GIF',
      left: '4.36%',
      top: '48.93%',
      width: '91.79%',
      height: '15.29%',
      onClick: handleFileClick,
    },
    {
      key: 'post',
      title: isPosting ? 'Posting results…' : 'Post Results',
      left: '6.41%',
      top: '79.51%',
      width: '87.95%',
      height: '12.23%',
      onClick: handlePost,
    },
  ];

  const showOverlay = edit;
  useHotspotDebug('admin-results', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <HotspotImage
        src={PngAdminResults}
        alt="Admin: Result Posting"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('adminDashboard')}
        onDraft={(d) => console.log('AdminResults draft:', d)}
      />
      {gifFile && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          Selected GIF: {gifFile.name}
        </div>
      )}
      {statusMessage && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#b42318' }}>{statusMessage}</div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back to Admin</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

  // --- Layout 14: Admin Reports (connected to /api/admin?action=reports) ---
  // TAG: admin-reports-01
  export function AdminReportsScreen({ onNavigate, debug = false }) {
    const [edit, setEdit] = useState(false);
    const [table, setTable] = useState('wallet_txns'); // default
    const [status, setStatus] = useState('');          // '', 'approved', 'pending', 'rejected'
    const [search, setSearch] = useState('');          // client-side filter for now
    const [limit, setLimit] = useState(50);
    const [offset, setOffset] = useState(0);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [totals, setTotals] = useState({ count: 0 });

    const initData = getInitData();
    const isDepositTable = table === 'deposit_requests';
    const isWithdrawTable = table === 'withdraw_requests';

    const fetchReports = useCallback(async () => {
      if (!initData) { alert('Open inside Telegram (initData).'); return; }
      setLoading(true); setErr('');
      try {
        const res = await apiFetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reports', table, status: status || undefined, limit, offset })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          const msg = json?.reason || json?.error || `Reports fetch failed (${res.status})`;
          setErr(String(msg));
          setRows([]);
        } else {
          const raw = Array.isArray(json.rows) ? json.rows : [];
          // simple client-side search filter (optional)
          const filtered = search
            ? raw.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
            : raw;
          setRows(filtered);
          setTotals({ count: raw.length });
        }
      } catch (e) {
        setErr(e?.message || String(e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, [initData, table, status, limit, offset, search]);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    const handleDepositDecision = useCallback(async (requestId, approve) => {
      if (!requestId) return;
      try {
        const res = await apiFetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: approve ? 'approve_deposit' : 'reject_deposit',
            requestId,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          const msg = json?.reason || json?.error || `Failed to ${approve ? 'approve' : 'reject'} deposit (${res.status})`;
          alert(msg);
          return;
        }
        await fetchReports();
        alert(approve ? 'Deposit approved.' : 'Deposit rejected.');
      } catch (error) {
        const message = error?.message ? `Failed to update deposit: ${error.message}` : 'Failed to update deposit request.';
        alert(message);
      }
    }, [fetchReports]);

    const handleWithdrawDecision = useCallback(async (requestId, approve) => {
      if (!requestId) return;
      try {
        const res = await apiFetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve_withdraw',
            requestId,
            approve,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          const msg = json?.reason || json?.error || `Failed to ${approve ? 'approve' : 'reject'} withdraw (${res.status})`;
          alert(msg);
          return;
        }
        await fetchReports();
        alert(approve ? 'Withdraw approved.' : 'Withdraw rejected.');
      } catch (error) {
        const message = error?.message ? `Failed to update withdraw: ${error.message}` : 'Failed to update withdraw request.';
        alert(message);
      }
    }, [fetchReports]);

    const formatDateTime = useCallback((value) => {
      if (!value) return '—';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return value;
      return dt.toLocaleString();
    }, []);

    const renderRowsTable = () => {
      if (rows.length === 0) {
        return <div style={{ color: '#777' }}>{loading ? 'Loading…' : 'No rows.'}</div>;
      }

      if (isDepositTable) {
        return (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Created</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>User</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Amount</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Ref</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Note / Slip</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const amount = Number(row.amount) || 0;
                const statusText = row.status || 'pending';
                const pending = statusText === 'pending';
                return (
                  <tr key={row.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', whiteSpace: 'nowrap' }}>{formatDateTime(row.created_at)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', whiteSpace: 'nowrap' }}>{row.user_id || '—'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                      {amount.toLocaleString()}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      {row.ref || '—'}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px' }}>
                      {row.note ? <div style={{ marginBottom: 4 }}>{row.note}</div> : null}
                      {row.slip_path ? <code style={{ fontSize: 11 }}>{row.slip_path}</code> : null}
                      {!row.note && !row.slip_path ? '—' : null}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', fontWeight: 600, textTransform: 'capitalize' }}>
                      {statusText}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px' }}>
                      {pending ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => handleDepositDecision(row.id, true)} disabled={loading}>Approve</button>
                          <button onClick={() => handleDepositDecision(row.id, false)} disabled={loading}>Reject</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.6 }}>No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }

      if (isWithdrawTable) {
        return (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Created</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>User</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Amount</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Destination</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 6px', background: '#f9fafb' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const amount = Number(row.amount) || 0;
                const statusText = row.status || 'pending';
                const pending = statusText === 'pending';
                return (
                  <tr key={row.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', whiteSpace: 'nowrap' }}>{formatDateTime(row.created_at)}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', whiteSpace: 'nowrap' }}>{row.user_id || '—'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                      {amount.toLocaleString()}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px' }}>
                      {row.destination || row.note || '—'}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px', fontWeight: 600, textTransform: 'capitalize' }}>
                      {statusText}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '4px 6px' }}>
                      {pending ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => handleWithdrawDecision(row.id, true)} disabled={loading}>Approve</button>
                          <button onClick={() => handleWithdrawDecision(row.id, false)} disabled={loading}>Reject</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.6 }}>No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }

      return (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {Object.keys(rows[0]).map((k) => (
                <th
                  key={k}
                  style={{
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                    padding: '4px 6px',
                    whiteSpace: 'nowrap',
                    background: '#f9fafb',
                  }}
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const type = (r.type || '').toLowerCase();
              const status = (r.status || '').toLowerCase();
              let color = '';
              if (type === 'credit') color = '#148f2b';
              else if (type === 'debit') color = '#b42318';
              else if (status === 'pending') color = '#f59e0b';
              else if (status === 'approved') color = '#0284c7';
              else if (status === 'rejected') color = '#6b7280';
              return (
                <tr key={r.id || i}>
                  {Object.keys(rows[0]).map((k) => (
                    <td
                      key={k}
                      style={{
                        borderBottom: '1px solid #eee',
                        padding: '4px 6px',
                        whiteSpace: 'nowrap',
                        color: k === 'type' || k === 'status' ? color : undefined,
                        fontWeight: k === 'type' || k === 'status' ? 600 : 400,
                      }}
                    >
                      {String(r[k] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    };

    const hotspots = [
      { key: 'hdrBack', title: 'Back', left: '3%', top: '6%', width: '15%', height: '5.5%', onClick: () => onNavigate('adminDashboard') },
      { key: 'totalsBar', title: `Total rows: ${totals.count}`, left: '2%', top: '9%', width: '96%', height: '5.5%' },

      { key: 'tableSelect', kind: 'select', title: 'Table', left: '3%', top: '16%', width: '44%', height: '5.5%',
        value: table, options: [
          { label: 'wallet_txns', value: 'wallet_txns' },
          { label: 'withdraw_requests', value: 'withdraw_requests' },
          { label: 'deposit_requests', value: 'deposit_requests' },
          { label: 'draws', value: 'draws' },
          { label: 'bets', value: 'bets' },
          { label: 'wallets', value: 'wallets' },
          { label: 'profiles', value: 'profiles' },
        ],
        onChange: (v) => { setOffset(0); setTable(v); }
      },
      { key: 'statusSelect', kind: 'select', title: 'Status', left: '53%', top: '16%', width: '20%', height: '5.5%',
        value: status, options: [
          { label: 'All', value: '' },
          { label: 'approved', value: 'approved' },
          { label: 'pending', value: 'pending' },
          { label: 'rejected', value: 'rejected' },
        ],
        onChange: (v) => { setOffset(0); setStatus(v); }
      },
      { key: 'refreshBtn', title: loading ? 'Loading…' : 'Refresh', left: '76%', top: '16%', width: '20%', height: '5.5%', onClick: loading ? undefined : fetchReports },

      { key: 'searchInput', kind: 'input', title: 'Search', left: '3%', top: '23%', width: '60%', height: '5.5%',
        value: search, inputType: 'text', placeholder: 'Search current page…',
        onChange: (v) => setSearch(v)
      },
      { key: 'limitSelect', kind: 'select', title: 'Limit', left: '65%', top: '23%', width: '15%', height: '5.5%',
        value: String(limit), options: [{label:'50',value:'50'},{label:'100',value:'100'},{label:'200',value:'200'}],
        onChange: (v) => { setOffset(0); setLimit(Number(v)||50); }
      },
      { key: 'exportCsv', title: 'Export CSV', left: '82%', top: '23%', width: '14%', height: '5.5%',
        onClick: () => {
          const header = rows[0] ? Object.keys(rows[0]) : [];
          const lines = [header.join(',')].concat(rows.map(r => header.map(k => JSON.stringify(r[k] ?? '')).join(',')));
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${table}-${Date.now()}.csv`; a.click();
          URL.revokeObjectURL(url);
        }
      },

      { key: 'grid', title: 'Data Grid', left: '3%', top: '30%', width: '94%', height: '48%' },

      { key: 'prevPage', title: 'Prev', left: '3%', top: '80%', width: '20%', height: '5.5%',
        onClick: () => setOffset(o => Math.max(0, o - limit))
      },
      { key: 'pageIndicator', kind: 'input', title: 'Page', left: '25%', top: '80%', width: '50%', height: '5.5%',
        value: `offset ${offset} · limit ${limit}`, readOnly: true
      },
      { key: 'nextPage', title: 'Next', left: '77%', top: '80%', width: '20%', height: '5.5%',
        onClick: () => setOffset(o => o + limit)
      },
    ];
    const showOverlay = edit;
    useHotspotDebug('admin-reports', debug, hotspots);

    return (
      <div style={{ padding: 12 }}>
        <HotspotImage
          src={PngAdminReports}
          alt="Admin Reports"
          hotspots={hotspots}
          editable={edit}
          showOverlay={showOverlay}
          interactionsEnabled={!edit}
          onBack={() => onNavigate('adminDashboard')}
          onDraft={(d) => console.log('AdminReports hotspot draft:', d)}
        />
        {/* --- Inline data grid inside hotspot --- */}
    {/* --- Inline data grid inside hotspot (v: admin-reports-02) --- */}
      <div
    style={{
      position: 'absolute',
      left: '3%',
      top: '30%',
      width: '94%',
      height: 'calc(55vh)',
      overflow: 'auto',
      background: 'rgba(255,255,255,0.97)',
      borderRadius: 8,
      padding: 8,
      fontSize: 13,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}
    >
    <h3 style={{ margin: '4px 0', fontWeight: 600 }}>Rows ({rows.length})</h3>
    {err && <div style={{ color: '#b42318', marginBottom: 6 }}>{err}</div>}
    {renderRowsTable()}
    </div>
    {/* --- Footer Controls --- */}
    <div
      style={{
      position: 'absolute',
      left: '3%',
      top: '87%',
      width: '94%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 8px',
    }}
    >
    <button
      onClick={() => onNavigate('adminDashboard')}
      style={{
        background: '#f3f4f6',
        color: '#000',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        padding: '6px 12px',
        cursor: 'pointer',
      }}
    >
      Back
    </button>
    <span style={{ fontSize: 12, opacity: 0.7 }}>v: admin-reports-01</span>
    </div>
      </div>);
}

