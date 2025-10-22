/* eslint-disable react-hooks/rules-of-hooks */
import HotspotImage from '../components/HotspotImage'
import { formatGroup, formatFigure, formatGroupFigure } from '../lib/formatters.mjs';

// Option B implementation: PNG-backed screens with an action bar.
// Each screen receives one prop: onNavigate(nextKey, params?)

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../state/appState';

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

import { apiFetch } from '../lib/apiFetch';
import { getInitData as importedGetInitData, ensureTelegramInitData } from '../lib/initData';
const getInitData = importedGetInitData;
export { importedGetInitData as getInitData };

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
    top: '86.20%',
    width: '99.40%',
    height: '4.45%',
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

  const hotspots = [
    // 1) User ID field (NON-NAV, NON-TAP) — read-only display populated from backend verification
    {
      key: 'autoUserId',
      kind: 'input',
      title: 'Verified User ID',
      left: '4.72%', top: '28.45%', width: '91.03%', height: '3.67%',
      value: userIdDisplayValue || (verifying ? 'Verifying...' : 'Pending...'),
      inputType: 'text',
      coerceNumber: false,
      readOnly: true,
      disabled: true
    },

    // 2) User Name field (input overlay)
    {
      key: 'userName',
      kind: 'input',
      title: 'User Name',
      left: '4.00%', top: '37.00%', width: '92.00%', height: '5.00%',
      value: name,
      inputType: 'text',
      coerceNumber: false,
      placeholder: nameContactReadOnly ? 'Loaded from profile' : 'Enter your name',
      readOnly: nameContactReadOnly,
      disabled: verifying,
      onChange: (v) => { if (!nameContactReadOnly) setName(v); }
    },

    // 3) Contact Number field (input overlay)
    {
      key: 'contactNumber',
      kind: 'input',
      title: 'Contact Number',
      left: '4.00%', top: '47.00%', width: '91.00%', height: '4.14%',
      value: contact,
      inputType: 'tel',
      coerceNumber: false,
      placeholder: nameContactReadOnly ? 'Loaded from profile' : 'Enter contact number',
      readOnly: nameContactReadOnly,
      disabled: verifying,
      onChange: (v) => { if (!nameContactReadOnly) setContact(v); }
    },

    // 4) Password / PIN field (input overlay)
    {
      key: 'passwordPin',
      kind: 'input',
      title: 'Password / PIN',
      left: '4.00%', top: '57.00%', width: '91.00%', height: '4.00%',
      value: pinDisplayValue,
      inputType: 'password',
      secure: true,
      placeholder: pinPlaceholder,
      readOnly: false,
      disabled: verifying,
      onChange: (v) => { setPin(v); }
    },

    // 5) Bottom button → navigate to Dashboard
    {
      key: 'submitLoginRegister',
      title: actionLabel,
      left: '2.85%',
      top: '86.68%',
      width: '95.34%',
      height: '4.54%',
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
  const balance = state?.wallet?.balance ?? 0;
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

  // Admin button hotspot logic: only visible for admins
  const isAdmin = state?.auth?.isAdmin;
  const hotspots = [
    // Balance display (NON-NAV, NON-TAP) rendered as a read-only input overlay
    {
      key: 'ptsDisplay',
      kind: 'input',
      title: 'Points Balance',
      left: '4.00%',
      top: '23.00%',
      width: '90.00%',
      height: '8.00%',
      value: `Points balance: ${Number(ptsBalance).toLocaleString()} pts`,
      readOnly: true,
      inputType: 'text',
      tabIndex: -1,
      onFocus: (e) => e.target.blur(),
      inputStyle: { textAlign: 'center', padding: '6px 10px', fontFamily: 'Inter, sans-serif', fontWeight: 'bold', fontSize: 18, backgroundColor: 'rgba(255,255,255,0)', outline: '1px solid rgba(255,255,255,0)' }
    },
    // Header back area (consistent pattern)
    { key: 'hdrBack', title: 'Log Out', left: '3.00%', top: '8.00%', width: '20.00%', height: '6.00%', onClick: () => onNavigate('login') },
    // Main action tiles (normalized widths/heights)
    { key: 'tileJoin',     title: 'Join Lucky Draw',   left: '4.00%', top: '32.00%', width: '86.00%', height: '4.00%',  onClick: () => onNavigate('join') },
    { key: 'tileHistory',  title: 'Point History',     left: '4.00%', top: '37.67%', width: '86.31%', height: '3.67%', onClick: () => onNavigate('history') },
    { key: 'tileDeposit',  title: 'Deposit Points',    left: '4.00%', top: '42.61%', width: '86.69%', height: '3.55%', onClick: () => onNavigate('deposit') },
    { key: 'tileWithdraw', title: 'Withdraw Points',   left: '4.00%', top: '45.85%', width: '86.44%', height: '3.88%', onClick: () => onNavigate('withdrawRequest') },
    { key: 'tileProfile',  title: 'Profile / Withdraw',left: '4.00%', top: '49.96%', width: '86.44%', height: '3.77%', onClick: () => onNavigate('withdrawSetup') },
    { key: 'tileInvite',   title: 'Invite / QR Link',  left: '4.00%', top: '56.06%', width: '86.44%', height: '3.99%', onClick: () => onNavigate('invite') },
    // Admin hotspot: only visible if isAdmin
    ...(isAdmin ? [
      { key: 'admin', title: 'Admin', left: '4.00%', top: '80.00%', width: '91.00%', height: '5.00%', onClick: () => onNavigate('adminDashboard') }
    ] : [])
  ];
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
        onBack={() => onNavigate('login')}
        onDraft={(d) => { console.log('Dashboard hotspot draft:', d); }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('login')}>Back</button>
        <span style={{marginLeft:8, fontSize:12, opacity:0.7}}>v: dashboard-05</span>
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

    setSubmitting(true);
    setBetError('');
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
        const msg = json?.reason || json?.error || `Bet failed (${res.status})`;
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
  }, [activeDrawId, balance, betsByGroup, fetchBetTotals, loadWalletAndHistory, onNavigate, setWalletData, state.auth, state.wallet, state.walletTxns]);

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

export function DepositScreen({ onNavigate, debug = false }) {
  const { credit } = useAppState();
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState(50);
  const [note, setNote] = useState('');
  const [uploadSlip, setUploadSlip] = useState('');

  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const canSubmit = normalizedAmount > 0;

  const handleDeposit = async () => {
    if (!canSubmit) {
      alert('Enter a deposit amount greater than zero.');
      return;
    }
    const initData = getInitData();
    if (!initData) {
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }
    try {
      const trimmedNote = safeTrim(note);
      const payload = {
        action: 'deposit',
        amount: normalizedAmount,
        method: 'bank',
      };
      if (trimmedNote) payload.note = trimmedNote;
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
      // Optimistic local state update as fallback (credit is from appState)
      try { credit(normalizedAmount); } catch {}
      alert(`Deposit recorded for ${normalizedAmount} pts.`);
      setNote('');
      setUploadSlip('');
      onNavigate('dashboard');
    } catch (e) {
      console.log('Deposit error:', e);
      alert('Network error while creating deposit. Please try again.');
    }
  };

  const hotspots = [
    {
      key: 'amountInput',
      kind: 'input',
      title: 'Deposit amount',
      left: '3.65%',
      top: '15.22%',
      width: '92.48%',
      height: '6.78%',
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
      top: '28.85%',
      width: '91.76%',
      height: '6.42%',
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
      left: '4.24%',
      top: '42.38%',
      width: '91.52%',
      height: '6.42%',
      // show plain text value; no native file UI
      value: uploadSlip ? `Slip: ${uploadSlip}` : 'Tap to attach payment slip (jpg/png/pdf)',
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
        // create file input element within real user gesture
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            setUploadSlip(file.name);
          }
          document.body.removeChild(input);
        });

        // must call directly within same click gesture
        input.click();
      },
    },
    {
      key: 'submitDeposit',
      title: 'Submit deposit',
      left: '3.52%',
      top: '57.31%',
      width: '91.52%',
      height: '8.00%',
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
      left: '3.65%',
      top: '15.22%',
      width: '92.48%',
      height: '6.78%',
      value: amount,
      inputType: 'number',
      min: 0,
      step: 10,
      coerceNumber: true,
      onChange: setAmount,
      placeholder: 'Amount',
    },
    {
      key: 'destinationSelect',
      kind: 'select',
      title: 'Withdrawal destination',
      left: '4.00%',
      top: '28.85%',
      width: '91.76%',
      height: '6.42%',
      value: destinationId,
      options: destinationOptions,
      placeholder: destinationRecords.length ? 'Select destination' : 'Setup destination in Profile',
      disabled: destinationRecords.length === 0,
      onChange: setDestinationId,
    },
    {
      key: 'accountHolderDisplay',
      kind: 'input',
      title: 'Account holder',
      left: '4.24%',
      top: '42.38%',
      width: '91.52%',
      height: '6.42%',
      value: accountHolderName || 'Account holder name',
      inputType: 'text',
      coerceNumber: false,
      readOnly: true,
      inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
    },
    {
      key: 'submitWithdraw',
      title: 'Submit withdraw request',
      left: '3.52%',
      top: '57.31%',
      width: '91.52%',
      height: '8.00%',
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
    // Always read the freshest initData at call-time; retry if missing
    let initNow = getInitData && getInitData({ refresh: true });
    if (!initNow) {
      initNow = ensureTelegramInitData && ensureTelegramInitData();
    }
    if (!initNow) {
      console.warn('HistoryScreen: initData not yet ready, skipping loadTxns.');
      return;
    }
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

  // Trigger initial history load on mount and whenever limit/offset changes
  useEffect(() => {
    loadTxns();
  }, [loadTxns, limit, offset]);

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
  const safeBets = Array.isArray(bets) ? bets : [];

  // Recompute historyRows with full null-safety (map only on arrays)
  const historyRows = useMemo(() => {
    // Using shared formatters from src/lib/formatters.mjs

    // Map server txns → table rows
    const mappedTxns = safeTxns.map((t) => {
      const note = typeof t?.note === 'string' ? t.note : '';
      const typeLower = note.toLowerCase();
      const isBetTxn = (t?.type === 'bet') || note.startsWith('bet:');

      // Try to extract group/figure from various note patterns
      let group = t?.group_code || t?.group || '';
      let figure = t?.figure || '';

      if (isBetTxn) {
        const mColon = note.match(/\bbet\s*:\s*([ABCD])\s*:\s*[^:\s]+?\s*:\s*(\d{1,2})\b/i);
        if (mColon) { group = group || mColon[1]; figure = figure || mColon[2]; }

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
  }, [safeTxns, safeBets]);

  // Now safely slice visible rows (previous bug: referenced historyRows before it was defined)
  const visibleRows = useMemo(() => historyRows.slice(0, maxDisplayRows), [historyRows]);

  // Ledger area from the PNG (absolute coords used across the file)
  const LEDGER_TOP_START = 16.50;   // first row top %
  const LEDGER_ROW_GAP   = 4.00;    // percent gap between rows
  const LEDGER_ROW_H     = 3.10;    // row height %

  // Column positions inside the ledger area, tuned to the PNG
  const COLS = {
    date:       { left:  6.50, width: 26.00 },
    txn:        { left: 54.00, width: 25.00 },
    figure:     { left: 73.50, width: 24.50 },
    points:     { left: 82.50, width: 24.50 },
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

      <div style={{ width: '100%', marginTop: 16 }}>
        <h3 style={{ margin: '8px 0' }}>
          Points History <span style={{ fontSize: 12, opacity: 0.6 }}>v: history-05</span>
        </h3>
        {loading && <div style={{ padding: 8, color: '#1f3a5f' }}>Loading…</div>}
        {err && <div style={{ padding: 8, color: '#b42318' }}>{err}</div>}
        {(!loading && !err && historyRows.length === 0) ? (
          <div style={{ padding: 8, color: '#666' }}>No history yet.</div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Date &amp; Time</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Transaction</th>
                  <th style={{ textAlign: 'center', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Figure</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{new Date(row.timestamp).toLocaleString()}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{row.transaction}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px', textAlign: 'center' }}>{row.figure}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px', textAlign: 'right', color: row.points >= 0 ? '#1a7f37' : '#b42318' }}>
                      {row.points >= 0 ? '+' : ''}{row.points.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

// Admin Screens (09–13)
export function AdminDashboardScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  const { state } = useAppState();
  const isAdmin = !!state?.auth?.isAdmin;

  // Always call hook in a non-conditional position with a stable array
  useHotspotDebug('admin-dashboard', debug, []);

  // --- NEW: server-backed metrics state ---
  const [serverUsers, setServerUsers] = useState(null);
  const [serverPoints, setServerPoints] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsErr, setMetricsErr] = useState('');

  // Fetch live totals from backend (Supabase via /api/admin-metrics)
  useEffect(() => {
    const init = getInitData && getInitData();
    if (!init || !isAdmin) return;
    let abort = false;
    (async () => {
      try {
        setMetricsLoading(true); setMetricsErr('');
        const r = await fetch('/api/admin-metrics', {
          headers: { 'Authorization': 'tma ' + init }
        });
        const j = await r.json().catch(() => ({}));
        if (abort) return;
        if (!r.ok) {
          setMetricsErr(String(j?.error || j?.reason || `metrics status ${r.status}`));
          setServerUsers(null); setServerPoints(null);
        } else {
          // Be flexible with field names from the API
          const su = j?.users_count ?? j?.users ?? j?.total_users;
          const sp = j?.total_points ?? j?.total_balance ?? j?.points_sum;
          setServerUsers(Number(su));
          setServerPoints(Number(sp));
        }
      } catch (e) {
        if (!abort) { setMetricsErr(String(e?.message || e)); }
      } finally {
        if (!abort) setMetricsLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [isAdmin]);

  if (!isAdmin) {
    return <AdminAccessRequired onNavigate={onNavigate} reason={state?.auth?.adminDeniedReason} />;
  }

  // Fallback to in-memory state if server values are missing
  const stateUsersCount = Array.isArray(state?.users) ? state.users.length : 0;
  const statePointsSum = Array.isArray(state?.wallets)
    ? state.wallets.reduce((sum, w) => sum + (Number(w?.balance) || 0), 0)
    : 0;

  const totalUsers = Number.isFinite(serverUsers) ? serverUsers : stateUsersCount;
  const totalPoints = Number.isFinite(serverPoints) ? serverPoints : statePointsSum;

  // Small visible version tag + console marker
  const versionTag = 'admin-dash-v: metrics-01';
  try { console.log('TAG:', versionTag, { totalUsers, totalPoints, metricsLoading, metricsErr }); } catch {}

  const hotspots = [
    // Totals display bar (non-nav; shows computed values)
    {
      key: 'totals',
      title: `Total Users: ${totalUsers} • Total Points: ${Number(totalPoints).toLocaleString()}${metricsLoading ? ' (syncing…) ' : ''} — ${versionTag}`,
      left: '4.37%',
      top: '8.53%',
      width: '91.00%',
      height: '9.34%',
      onClick: () => alert(`Users: ${totalUsers}\nPoints: ${Number(totalPoints).toLocaleString()}${metricsErr ? `\nNote: ${metricsErr}` : ''}`),
    },

    // Vertical list (exact coordinates provided)
    { key: 'users', title: 'Users', left: '4.00%', top: '20.39%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminUsers') },
    { key: 'points', title: 'Points', left: '4.00%', top: '27.00%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminPoints') },
    { key: 'figures', title: 'Figures', left: '4.00%', top: '33.66%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminFigures') },
    { key: 'results', title: 'Results Posting', left: '4.00%', top: '40.31%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminResults') },
    { key: 'reports', title: 'Reports', left: '4.00%', top: '46.93%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminReports') },
  ];
  const showOverlay = edit;
  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngAdminDash}
        alt="Admin: Dashboard"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => console.log('AdminDashboard draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <span style={{ fontSize: 12, opacity: 0.6 }}>v: {versionTag}</span>
      </div>
    </div>
  );
}

export function AdminUserManagementScreen({ onNavigate, debug = false }) {
  const { state } = useAppState();
  const isAdmin = !!state?.auth?.isAdmin;
  const [searchText, setSearchText] = useState('');
  const [focusedUserId, setFocusedUserId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [colWidths, setColWidths] = useState({
  userId: 18,
  userName: 22,
  contact: 18,
  profile: 22,
  status: 10,
  actions: 10,
});

  // Remote users from SQL via /api/admin
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');

  // Debounced fetch to backend admin users search
  useEffect(() => {
    let abort = false;
    const initData = getInitData();
    const q = (searchText || '').trim();
    async function run() {
      try {
        setLoadingUsers(true); setUsersError('');
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'tma ' + (initData || '') },
          body: JSON.stringify({ action: 'users', query: q, limit: 25 })
        });
        const json = await res.json().catch(() => ({}));
        if (abort) return;
        if (!res.ok || json.ok === false) {
          setUsersError(json.error || 'Failed to load users');
          setRemoteUsers([]);
        } else {
          const rows = Array.isArray(json.users) ? json.users : (Array.isArray(json.rows) ? json.rows : []);
          setRemoteUsers(rows);
        }
      } catch (e) {
        if (!abort) { setUsersError(String(e.message || e)); setRemoteUsers([]); }
      } finally { if (!abort) setLoadingUsers(false); }
    }
    const t = setTimeout(run, 250);
    return () => { abort = true; clearTimeout(t); };
  }, [searchText]);

  const users = useMemo(() => (
    Array.isArray(remoteUsers) && remoteUsers.length ? remoteUsers : (Array.isArray(state?.users) ? state.users : [])
  ), [remoteUsers, state?.users]);

  const normalise = useCallback((value) => (value == null ? '' : String(value).toLowerCase()), []);

  const filteredUsers = useMemo(() => {
    const needle = normalise(searchText).trim();
    let filtered = users;
    if (needle) {
      filtered = filtered.filter((user) => {
        const haystack = [
          user?.name,
          user?.fullName,
          user?.username,
          user?.contact,
          user?.phone,
          user?.email,
          user?.telegramId,
          user?.id,
        ]
          .map(normalise)
          .filter(Boolean);
        return haystack.some((entry) => entry.includes(needle));
      });
    }
    if (statusFilter) {
      filtered = filtered.filter((u) => {
        const status = String(u?.status || u?.requestStatus || u?.approvalStatus || '');
        return status.toLowerCase().includes('request');
      });
    }
    return filtered;
  }, [users, searchText, normalise, statusFilter]);

  const visibleUsers = useMemo(
    () => filteredUsers.slice(0, 6),
    [filteredUsers]
  );

  const resolveUserId = useCallback((user, fallback) => {
    const id =
      user?.id ||
      user?.userId ||
      user?.telegramId ||
      user?.phone ||
      user?.email ||
      fallback;
    return id ? String(id) : null;
  }, []);

  const focusedUser = useMemo(() => {
    if (!focusedUserId) {
      return visibleUsers[0] || filteredUsers[0] || null;
    }
    return filteredUsers.find((user, idx) => resolveUserId(user, `idx-${idx}`) === focusedUserId) || null;
  }, [filteredUsers, focusedUserId, resolveUserId, visibleUsers]);

  useEffect(() => {
    if (!focusedUser && filteredUsers.length > 0) {
      const fallbackId = resolveUserId(filteredUsers[0], 'idx-0');
      setFocusedUserId(fallbackId);
    }
  }, [filteredUsers, focusedUser, resolveUserId]);

  const getDisplayName = useCallback((user) => {
    return (
      user?.name ||
      user?.fullName ||
      user?.username ||
      (user?.telegramId ? `@${user.telegramId}` : null) ||
      user?.contact ||
      user?.phone ||
      user?.email ||
      resolveUserId(user, 'user') ||
      'User'
    );
  }, [resolveUserId]);

  const rowTopPercents = [22.73, 29.35, 35.96, 42.57, 49.29, 55.90];
  const rowHotspots = rowTopPercents.flatMap((top, idx) => {
    const user = visibleUsers[idx];
    const fallbackId = `idx-${idx}`;
    const userId = user ? resolveUserId(user, fallbackId) : fallbackId;
    const name = user ? getDisplayName(user) : '';
    const contact = user ? (user.contact || user.phone || user.email || '') : '';
    return [
      // Clickable row hitbox (for focus/select)
      {
        key: `rowHit_${idx + 1}`,
        left: '4.05%', top: `${top}%`, width: '91.60%', height: '5.53%',
        title: user ? `Inspect ${name}` : 'Empty user row',
        ...(user ? { onClick: () => setFocusedUserId(userId) } : {}),
      },
      // Name (rendered as read-only input to display text inside the layout)
      {
        key: `rowName_${idx + 1}`,
        kind: 'input',
        title: 'User',
        left: '6.50%', top: `${top + 1.1}%`, width: '46.00%', height: '3.20%',
        value: name,
        readOnly: true,
        inputType: 'text',
        coerceNumber: false,
        inputStyle: { background: '#fff', opacity: 1, filter: 'none', WebkitBackdropFilter: 'none', border: '0', boxShadow: 'none', color: '#111827', fontWeight: 600, padding: 0 }
      },
      // Contact (right side)
      {
        key: `rowContact_${idx + 1}`,
        kind: 'input',
        title: 'Contact',
        left: '54.50%', top: `${top + 1.1}%`, width: '39.00%', height: '3.20%',
        value: contact,
        readOnly: true,
        inputType: 'text',
        coerceNumber: false,
        inputStyle: { background: '#fff', opacity: 1, filter: 'none', WebkitBackdropFilter: 'none', border: '0', boxShadow: 'none', color: '#374151', textAlign: 'right', padding: 0 }
      },
    ];
  });

  const hotspots = useMemo(() => (
    [
      {
        key: 'statusFilter',
        kind: 'select',
        title: 'Filter: Status',
        left: '4.00%',
        top: '8.00%',
        width: '42.00%',
        height: '4.50%',
        value: statusFilter,
        options: [
          { label: 'All', value: '' },
          { label: 'Request', value: 'request' },
        ],
        placeholder: 'Status: All',
        onChange: setStatusFilter,
      },
      {
        key: 'searchUser',
        kind: 'input',
        title: 'Search user',
        left: '4.00%',
        top: '13.00%',
        width: '90.60%',
        height: '6.08%',
        value: searchText,
        inputType: 'text',        // force text input (no numeric spinner)
        inputMode: 'search',      // mobile keyboard hint
        coerceNumber: false,      // never coerce to number
        placeholder: 'Search by ID, username, name or contact',
        onChange: setSearchText,

        // Pure text look: remove blue border/outline/shadow/overlay
        inputStyle: {
          position: 'relative',
          zIndex: 5,
          background: 'rgba(255,255,255,0)',
          backgroundColor: 'rgba(255,255,255,0)',
          opacity: 1,
          filter: 'none',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: '0',
          outline: '1px solid rgba(255,255,255,0)',
          boxShadow: 'none',
          borderRadius: 10,
          color: '#0f172a',
          fontWeight: 600,
          padding: '0 16px',
        },

        // Defensive: kill focus ring on some browsers
        onFocus: (e) => e.target && e.target.blur && e.target.blur(),
      },
  
      ...rowHotspots,
    ]
  ), [rowHotspots, searchText, statusFilter]);

  useHotspotDebug('admin-users', debug && isAdmin, hotspots);

  if (!isAdmin) {
    return <AdminAccessRequired onNavigate={onNavigate} reason={state?.auth?.adminDeniedReason} />;
  }

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngAdminUsers}
        alt="Admin: User Management"
        hotspots={hotspots}
        editable={false}
        showOverlay={false}
        interactionsEnabled
        onBack={() => onNavigate('adminDashboard')}
        onDraft={(d) => console.log('AdminUsers draft:', d)}
      />
      {/* Admin Users: Inline adjustable table (v: admin-users-02) */}
      <div style={{ marginTop: 12 }}>
        <h3 style={{ margin: '8px 0' }}>Users</h3>

        {/* Column width sliders */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
          {[
            ['UserID', 'userId'],
            ['UserName', 'userName'],
            ['ContactNumber', 'contact'],
            ['Profile (wallet info)', 'profile'],
            ['Status', 'status'],
            ['Approve/Reject', 'actions'],
          ].map(([label, key]) => (
            <label key={key} style={{ fontSize: 12 }}>
              {label}:&nbsp;
              <input
                type="range"
                min={8}
                max={40}
                step={1}
                value={colWidths[key]}
                onChange={(e) => setColWidths((w) => ({ ...w, [key]: Number(e.target.value) }))}
              />
              &nbsp;<span>{colWidths[key]}%</span>
            </label>
          ))}
        </div>

        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px', width: `${colWidths.userId}%` }}>UserID</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px', width: `${colWidths.userName}%` }}>UserName</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px', width: `${colWidths.contact}%` }}>ContactNumber</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px', width: `${colWidths.profile}%` }}>Profile (wallet info)</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px', width: `${colWidths.status}%` }}>Status (request?)</th>
                <th style={{ textAlign: 'center', borderBottom: '1px solid #ddd', padding: '6px 8px', width: `${colWidths.actions}%` }}>Approve / Reject</th>
              </tr>
            </thead>
            <tbody>
              {(typeof visibleUsers !== 'undefined' ? visibleUsers : filteredUsers).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '8px', color: '#777' }}>No users to display.</td>
                </tr>
              ) : (
                (typeof visibleUsers !== 'undefined' ? visibleUsers : filteredUsers).map((u, i) => {
                  const id = String(u?.user_id || u?.userId || u?.telegramId || u?.id || i);
                  const name = String(u?.name || u?.username || u?.fullName || '');
                  const contact = String(u?.contact || u?.phone || u?.email || '');
                  const status = String(
                    u?.status || u?.requestStatus || u?.approvalStatus || (u?.request ? 'request' : '') || ''
                  ).toLowerCase();
                  const walletInfo = (() => {
                    try {
                      const wallets = Array.isArray(state?.wallets) ? state.wallets : [];
                      const w = wallets.find((ww) => String(ww?.user_id || ww?.userId || ww?.id) === String(id));
                      if (!w) return '';
                      const bal = Number(w?.balance ?? 0);
                      const cnt = Number(w?.txn_count ?? w?.transactions_count ?? 0);
                      return `Balance: ${bal.toLocaleString()} · Txns: ${cnt}`;
                    } catch { return ''; }
                  })();

                  return (
                    <tr key={`${id}-${i}`}>
                      <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{id}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{name}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{contact}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{walletInfo}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{status}</td>
                      <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px', textAlign: 'center' }}>
                        <button style={{ marginRight: 6 }} onClick={() => alert(`Approve ${id}`)}>Approve</button>
                        <button onClick={() => alert(`Reject ${id}`)}>Reject</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {loadingUsers && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#1f3a5f' }}>Loading latest users…</div>
      )}
      {usersError && (
        <div style={{ marginTop: 4, fontSize: 13, color: '#b42318' }}>{usersError}</div>
      )}
    </div>
  );
}

export function AdminPointsTrackingScreen({ onNavigate, debug = false }) {
  const { state } = useAppState();
  const isAdmin = !!state?.auth?.isAdmin;
  const [selectedDate, setSelectedDate] = useState('');
  const [drawTime, setDrawTime] = useState('');
  useHotspotDebug(
    'admin-points',
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

  const walletTxns = useMemo(() => state?.walletTxns || [], [state?.walletTxns]);
  const authUserId = state?.auth?.userId || '-';
  const [edit, setEdit] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  const filteredTxns = useMemo(() => {
    if (!filterValue) return walletTxns;
    if (filterValue === 'deposit') return walletTxns.filter((t) => t.type === 'credit');
    if (filterValue === 'withdrawal') return walletTxns.filter((t) => t.type === 'debit');
    if (filterValue === 'bet') return walletTxns.filter((t) => t.type === 'bet');
    return walletTxns;
  }, [walletTxns, filterValue]);

  const maxDisplayRows = 10;
  const rows = useMemo(
    () =>
      filteredTxns.slice(0, maxDisplayRows).map((t) => {
        const typeLower = (t.note || '').toLowerCase();
        let txnLabel = 'Transaction';
        if (t.type === 'bet') txnLabel = 'Bet';
        else if (t.type === 'credit') txnLabel = typeLower.includes('win') ? 'Win' : 'Deposit';
        else if (t.type === 'debit') txnLabel = 'Withdraw';
        const rawAmount = Number(t.amount) || 0;
        const isNegative = t.type === 'debit' || t.type === 'bet';
        const signedAmount = isNegative ? -Math.abs(rawAmount) : Math.abs(rawAmount);
        return {
          id: t.id,
          userId: t.userId || authUserId,
          amount: signedAmount,
          txnLabel,
          timestamp: t.createdAt,
        };
      }),
    [filteredTxns, authUserId]
  );

  const handleRowClick = useCallback((row) => {
    alert(
      `User: ${row.userId}\nTransaction: ${row.txnLabel}\nPoints: ${row.amount}\nTime: ${new Date(row.timestamp).toLocaleString()}`
    );
  }, []);

  const rowHeight = 3.79;
  const rowTopStart = 12.03;
  const rowHotspots = Array.from({ length: maxDisplayRows }, (_, idx) => {
    const row = rows[idx];
    const top = (rowTopStart + rowHeight * idx).toFixed(2);
    return {
      key: `pointsRow${idx + 1}`,
      title: row ? `Open transaction ${row.txnLabel}` : 'Empty transaction slot',
      left: '3.38%',
      top: `${top}%`,
      width: '92.75%',
      height: `${rowHeight}%`,
      ...(row ? { onClick: () => handleRowClick(row) } : {}),
    };
  });

  const hotspots = [
    { key: 'backDash', title: 'Back to Admin', left: '4.00%', top: '1.72%', width: '14.54%', height: '0.90%', onClick: () => onNavigate('adminDashboard') },
    {
      key: 'filter',
      kind: 'select',
      title: 'Filter transactions',
      left: '13.86%',
      top: '7.24%',
      width: '47.94%',
      height: '2.31%',
      value: filterValue,
      placeholder: 'Filter: All',
      options: [
        { label: 'All', value: '' },
        { label: 'Deposit', value: 'deposit' },
        { label: 'Withdrawals', value: 'withdrawal' },
        { label: 'Bet', value: 'bet' },
      ],
      onChange: setFilterValue,
    },
    {
      key: 'export',
      title: 'Export data',
      left: '69.46%',
      top: '7.24%',
      width: '25.12%',
      height: '2.31%',
      onClick: () => alert('Exporting data… (placeholder for CSV/PDF export)'),
    },
    ...rowHotspots,
  ];

  const showOverlay = edit;
  useHotspotDebug('admin-points', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngAdminPoints}
        alt="Admin: Points Tracking"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('adminDashboard')}
        onDraft={(d) => console.log('AdminPoints draft:', d)}
      />
      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: '8px 0' }}>Points Transactions</h3>
        {rows.length === 0 ? (
          <div style={{ padding: 8, color: '#666' }}>No transactions yet.</div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>User ID</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Transaction</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Points</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{row.userId}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{row.txnLabel}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px', textAlign: 'right', color: row.amount >= 0 ? '#1a7f37' : '#b42318' }}>
                      {row.amount >= 0 ? '+' : ''}
                      {row.amount.toLocaleString()}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', padding: '6px 8px' }}>{new Date(row.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back to Admin</button>
        <button onClick={() => onNavigate('adminFigures')}>Next: Figures</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function AdminFiguresDataScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  const { state, setWalletData } = useAppState();
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = !!state?.auth?.isAdmin;
  useHotspotDebug(
    'admin-figures',
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
  const handleRefresh = useCallback(async () => {
    const init = getInitData();
    if (!init) {
      alert('Open inside Telegram to continue (initData missing).');
      return;
    }
    setRefreshing(true);
    try {
      const r = await fetch('/api/data-balance', { headers: { Authorization: 'tma ' + init } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j?.wallet || Array.isArray(j?.txns) || Array.isArray(j?.bets))) {
        setWalletData({
          wallet: j.wallet || state.wallet || null,
          txns: Array.isArray(j.txns) ? j.txns : (state.walletTxns || []),
          bets: normalizeBetsFromResponse(j.bets),
        });
      }
    } catch (e) {
      console.log('AdminFigures refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [setWalletData, state.wallet, state.walletTxns]);

  // --- Step #4 Safe Version (restore render + prepare overlays) ---
  const groupARect = { left: 4.89, top: 16.90, width: 40.73, height: 17.87 };

  // Safe guards
  const bets = Array.isArray(state?.bets) ? state.bets : [];
  const txns = Array.isArray(state?.walletTxns) ? state.walletTxns : [];

  // Temporary debug
  console.log('AdminFiguresDataScreen loaded', { bets: bets.length, txns: txns.length });

  // ---- Safe helpers to compute per-figure totals and overlays for all groups ----
  const parseFigureFromNote = (note) => {
    const s = String(note || '').toUpperCase();
    const mEq = s.match(/\b([ABCD])\s*=\s*(\d{1,2})\b/); // A=12
    if (mEq) return { group: mEq[1], figure: Number(mEq[2]) };
    const mCompact = s.match(/\b([ABCD])\s*(\d{1,2})\b/); // A12
    if (mCompact) return { group: mCompact[1], figure: Number(mCompact[2]) };
    return null;
  };

  const computeFigureTotals = (groupCode) => {
    const totals = new Map();
    // From in-memory bets first
    for (const b of (Array.isArray(bets) ? bets : [])) {
      const g = String(b?.group_code || b?.group || '').toUpperCase();
      const f = Number(b?.figure);
      const pts = Math.abs(Number(b?.points ?? b?.amount ?? 0));
      if (g === groupCode && Number.isFinite(f) && f >= 1 && f <= 36 && Number.isFinite(pts)) {
        totals.set(f, (totals.get(f) || 0) + pts);
      }
    }
    // Wallet transactions fallback (type=bet and note encodes group/figure)
    for (const t of (Array.isArray(txns) ? txns : [])) {
      const type = String(t?.type || '').toLowerCase();
      if (type !== 'bet') continue;
      const parsed = parseFigureFromNote(t?.note);
      if (!parsed) continue;
      const { group, figure } = parsed;
      const pts = Math.abs(Number(t?.amount) || 0);
      if (group === groupCode && Number.isFinite(figure) && figure >= 1 && figure <= 36 && Number.isFinite(pts)) {
        totals.set(figure, (totals.get(figure) || 0) + pts);
      }
    }
    return totals; // Map<figure, total>
  };

  const makeFigureOverlays = (groupCode, rect, totalsMap) => {
    const overlays = [];
    const rows = 6, cols = 6;
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;   // 0..35
        const figure = idx + 1;     // 1..36
        const total = Number(totalsMap.get(figure) || 0);
        const show = Number.isFinite(total) && total > 0;
        overlays.push({
          key: `fig_${groupCode}_${figure}`,
          kind: 'input',
          title: `${groupCode}#${figure}`,
          left: `${(rect.left + cellW * c).toFixed(2)}%`,
          top: `${(rect.top + cellH * r).toFixed(2)}%`,
          width: `${cellW.toFixed(2)}%`,
          height: `${cellH.toFixed(2)}%`,
          value: show ? `${groupCode}#${figure}: ${total.toLocaleString()}` : '',
          readOnly: true,
          inputType: 'text',
          coerceNumber: false,
          inputStyle: {
            background: 'transparent', border: '0', boxShadow: 'none',
            textAlign: 'center', fontWeight: 700,
            color: show ? '#1f2937' : 'transparent', padding: 0,
          },
        });
      }
    }
    return overlays;
  };

  // Rects for groups from your coordinates
  const groupBRect = { left: 54.72, top: 16.90, width: 40.73, height: 17.87 };
  const groupCRect = { left:  5.23, top: 43.86, width: 40.65, height: 18.89 };
  const groupDRect = { left: 55.23, top: 43.86, width: 40.14, height: 18.53 };

  // Compute totals and overlays (memoized)
  const totalsA = useMemo(() => computeFigureTotals('A'), [bets, txns]);
  const totalsB = useMemo(() => computeFigureTotals('B'), [bets, txns]);
  const totalsC = useMemo(() => computeFigureTotals('C'), [bets, txns]);
  const totalsD = useMemo(() => computeFigureTotals('D'), [bets, txns]);

  const overlaysA = useMemo(() => makeFigureOverlays('A', groupARect, totalsA), [totalsA]);
  const overlaysB = useMemo(() => makeFigureOverlays('B', groupBRect, totalsB), [totalsB]);
  const overlaysC = useMemo(() => makeFigureOverlays('C', groupCRect, totalsC), [totalsC]);
  const overlaysD = useMemo(() => makeFigureOverlays('D', groupDRect, totalsD), [totalsD]);

  // Totals per group for the separator bands
  const sumTotals = (map) => Array.from(map.values()).reduce((a, b) => a + Number(b || 0), 0);
  const totalA = useMemo(() => sumTotals(totalsA), [totalsA]);
  const totalB = useMemo(() => sumTotals(totalsB), [totalsB]);
  const totalC = useMemo(() => sumTotals(totalsC), [totalsC]);
  const totalD = useMemo(() => sumTotals(totalsD), [totalsD]);

  const totalBandInput = (key, title, left, top, width, height, value) => ({
    key,
    kind: 'input',
    title,
    left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
    value,
    readOnly: true, inputType: 'text', coerceNumber: false,
    inputStyle: { background: 'transparent', border: '0', boxShadow: 'none', textAlign: 'center', fontWeight: 700, color: '#111827', padding: 0 },
  });

  // --- Date and drawTime filters with correct defaults ---
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [drawTime, setDrawTime] = useState('00:00');

  const hotspots = [
    {
      key: 'dateFilter',
      kind: 'input',
      title: 'Date selection filter',
      left: '4.04%',
      top: '10.70%',
      width: '34.50%',     // half of 69.22%
      height: '3.00%',
      value: selectedDate,
      placeholder: 'YYYY-MM-DD',
      inputType: 'text',   // keep generic; can switch to 'date' if your runtime supports it
      inputStyle: { textAlign: 'left', padding: '0 8px', background: '#fff', border: '0' },
      onChange: setSelectedDate,
    },
    {
      key: 'drawTime',
      kind: 'select',
      title: 'Draw time',
      left: '40.54%',      // 4.04 + 34.50 to align exactly after date input
      top: '10.70%',
      width: '34.50%',     // 69.22 total - 34.50
      height: '3.00%',
      value: drawTime,
      options: [
        { label: '00:00', value: '00:00' },
        { label: '06:00', value: '06:00' },
        { label: '12:00', value: '12:00' },
        { label: '18:00', value: '18:00' },
      ],
      placeholder: 'Select time',
      onChange: setDrawTime,
    },
    {
      key: 'groupA',
      title: 'Group A total points (live)',
      left: '4.89%',
      top: '16.90%',
      width: '40.73%',
      height: '17.87%',
    },
    ...overlaysA,
    totalBandInput('groupA-total', 'Total points bets grpA', 4.89, 35.98, 40.82, 2.16, `Total A: ${totalA.toLocaleString()} pts`),
    {
      key: 'groupB',
      title: 'Group B total points (live)',
      left: '54.72%',
      top: '16.90%',
      width: '40.73%',
      height: '17.87%',
    },
    ...overlaysB,
    totalBandInput('groupB-total', 'Total points bets grpB', 54.72, 35.98, 40.82, 2.16, `Total B: ${totalB.toLocaleString()} pts`),
    {
      key: 'groupC',
      title: 'Group C total points (live)',
      left: '5.23%',
      top: '43.86%',
      width: '40.65%',
      height: '18.89%',
    },
    ...overlaysC,
    totalBandInput('groupC-total', 'Total points bets grpC', 5.31, 63.02, 40.31, 2.55, `Total C: ${totalC.toLocaleString()} pts`),
    {
      key: 'groupD',
      title: 'Group D total points (live)',
      left: '55.23%',
      top: '43.86%',
      width: '40.14%',
      height: '18.53%',
    },
    ...overlaysD,
    totalBandInput('groupD-total', 'Total points bets grpD', 55.31, 62.70, 40.14, 2.39, `Total D: ${totalD.toLocaleString()} pts`),
  ];

  const showOverlay = edit;
  useHotspotDebug('admin-figures', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngAdminFigures}
        alt="Admin: Figures Data"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('adminDashboard')}
        onDraft={(d) => console.log('AdminFigures draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back to Admin</button>
        <button onClick={() => onNavigate('adminResults')}>Next: Results</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        <button onClick={handleRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
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
    { key: 'backDash', title: 'Back to Admin', left: '4.29%', top: '1.90%', width: '13.78%', height: '0.82%', onClick: () => onNavigate('adminDashboard') },
    {
      key: 'groupSelect',
      title: 'Select group',
      kind: 'select',
      left: '4.21%',
      top: '12.27%',
      width: '91.58%',
      height: '5.46%',
      value: selectedGroup,
      options: groupOptions,
      placeholder: 'Select group',
      onChange: setSelectedGroup,
    },
    {
      key: 'figureSelect',
      title: 'Select figure',
      kind: 'select',
      left: '4.29%',
      top: '21.61%',
      width: '91.41%',
      height: '5.61%',
      value: selectedFigure,
      options: figureOptions,
      placeholder: 'Select figure',
      onChange: setSelectedFigure,
    },
    {
      key: 'gifUpload',
      title: gifFile ? `Selected GIF: ${gifFile.name}` : 'Upload result GIF',
      left: '4.29%',
      top: '29.11%',
      width: '91.50%',
      height: '16.37%',
      onClick: handleFileClick,
    },
    {
      key: 'post',
      title: isPosting ? 'Posting results…' : 'Post Results',
      left: '3.95%',
      top: '50.61%',
      width: '91.92%',
      height: '5.54%',
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

    const fetchReports = useCallback(async () => {
      if (!initData) { alert('Open inside Telegram (initData).'); return; }
      setLoading(true); setErr('');
      try {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'tma ' + initData },
          body: JSON.stringify({ action: 'reports', table, status: status || undefined, limit, offset })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          const msg = json?.reason || `Reports fetch failed (${res.status})`;
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
    {rows.length === 0 ? (
      <div style={{ color: '#777' }}>{loading ? 'Loading…' : 'No rows.'}</div>
    ) : (
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
    )}
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
        background: '#333',
        color: '#fff',
        border: 'none',
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
