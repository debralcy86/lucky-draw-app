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

const ADMIN_PORTAL_PATH = '/web/admin.html';

// Telegram bot wiring (centralized)
// You can override at runtime by setting window.__BOT_USERNAME__ = 'LuckyDrawForUBot'
const BOT_USERNAME = (typeof window !== 'undefined' && window.__BOT_USERNAME__) || 'LuckyDrawForUBot';

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

// --- Telegram initData + API helper (inline, step 1) ---
export function getInitData() {
  try {
    const hasWin = typeof window !== 'undefined';
    const loc = hasWin && window.location ? window.location : null;
    const hash = loc ? (loc.hash || '') : '';
    const search = loc ? (loc.search || '') : '';
    const fromHash = hash.startsWith('#') ? new URLSearchParams(hash.slice(1)).get('tgWebAppData') : null;
    const fromSearch = search ? new URLSearchParams(search).get('tgWebAppData') : null;
    const fromTG = (hasWin && window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp.initData : '';
    return fromHash || fromSearch || fromTG || '';
  } catch (_) {
    return '';
  }
}

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
    const res = await fetch('/api/data-balance', {
      method: 'GET',
      headers: {
        'Authorization': 'tma ' + initDataValue,
      },
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

    // 2) From Telegram context (verified user id visible to client)
    try {
      const tgUnsafe = window?.Telegram?.WebApp?.initDataUnsafe;
      const tgId = tgUnsafe?.user?.id ? String(tgUnsafe.user.id) : '';
      if (tgId) {
        setUserId((prev) => (prev && !prev.startsWith('U')) ? prev : tgId);
        try { localStorage.setItem('LD_userId', tgId); } catch {}
      }
    } catch {}

    // 3) From backend (/api/profile) using Authorization: tma & initData
    (async () => {
      const initData = getInitData();
      if (!initData) {
        setStatusMessage('Waiting for Telegram init data. Open inside Telegram to continue.');
        return;
      }

      setVerifying(true);
      setStatusMessage('Verifying your Telegram account...');
      setErrorMessage('');
      const initDataUserId = parseTelegramUserId(initData);

      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'tma ' + initData
          },
          body: JSON.stringify({ initData })
        });
        const json = await res.json().catch(() => ({}));

        if (!alive) return;

        const backendId =
          json?.profile?.user_id ||
          json?.wallet?.user_id ||
          (window?.Telegram?.WebApp?.initDataUnsafe?.user?.id ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : '') ||
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

  function genUserId() {
    // Simple readable ID: U + yyyymmdd + - + 6 random base36 chars
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `U${y}${m}${day}-${rand}`;
  }

  // Save profile to backend helper
  async function saveProfileRemote(initData, payload) {
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'tma ' + (initData || '')
        },
        body: JSON.stringify({
          initData,
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

    const initData = getInitData();
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
      try {
        const tgUnsafe = window?.Telegram?.WebApp?.initDataUnsafe;
        if (tgUnsafe?.user?.id) {
          actualUserId = String(tgUnsafe.user.id);
          setUserId(actualUserId);
        }
      } catch {}
    }
    if (!actualUserId) {
      actualUserId = genUserId();
      setUserId(actualUserId);
      try { localStorage.setItem('LD_userId', actualUserId); } catch {}
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

  const pinDisplayValue = profileExists === true && hasStoredPin ? '****' : pin;
  const fieldsReadOnly = profileExists === true;
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
      placeholder: fieldsReadOnly ? 'Loaded from profile' : 'Enter your name',
      readOnly: fieldsReadOnly,
      disabled: verifying,
      onChange: (v) => { if (!fieldsReadOnly) setName(v); }
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
      placeholder: fieldsReadOnly ? 'Loaded from profile' : 'Enter contact number',
      readOnly: fieldsReadOnly,
      disabled: verifying,
      onChange: (v) => { if (!fieldsReadOnly) setContact(v); }
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
      placeholder: fieldsReadOnly ? (hasStoredPin ? 'PIN on file' : 'Set PIN') : 'Set a secure PIN',
      readOnly: fieldsReadOnly,
      disabled: verifying || fieldsReadOnly,
      onChange: (v) => { if (!fieldsReadOnly) setPin(v); }
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
        const res = await fetch('/api/data-balance', {
          method: 'GET',
          headers: { 'Authorization': 'tma ' + initData },
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
        const r = await fetch('/api/data-balance', { headers: { Authorization: 'tma ' + init } });
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

export function InviteScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  const hotspots = [
    // Header back area
    { key: 'hdrBack', title: 'Back', left: '3.00%', top: '8.00%', width: '20.00%', height: '6.00%', onClick: () => onNavigate('dashboard') },
    // QR / Link interaction area
    {
      key: 'qrShare',
      title: 'Share / Copy Invite Link',
      left: '8.00%',
      top: '30.00%',
      width: '84.00%',
      height: '28.00%',
      onClick: () => {
        try {
          const url = tgBotLink('startapp');
          if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(url);
            alert('Invite link copied to clipboard:\n' + url);
          } else {
            alert('Invite link:\n' + url);
          }
        } catch (e) {
          alert('Invite link: ' + tgBotLink('startapp'));
        }
      }
    },
  ];
  const showOverlay = edit;
  useHotspotDebug('invite', debug, hotspots);

  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngInvite}
        alt="Invite / QR Link"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('dashboard')}
        onDraft={(d) => console.log('Invite hotspot draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
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
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'tma ' + initDataValue,
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
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'tma ' + initData,
        },
        body: JSON.stringify({
          action: 'bet',
          draw_id: activeDrawId || undefined,
          bets: entries,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.reason || json?.error || `Bet failed (${res.status})`;
        setBetError(msg);
        alert(msg);
        await fetchBetTotals(initData, json?.draw_id || null);
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
      await fetchBetTotals(initData, json.draw_id || null);
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
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'tma ' + initData,
        },
        body: JSON.stringify({
          action: 'bet',
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
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'tma ' + initData,
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
      const payload = {
        action: 'withdraw',
        amount: normalizedAmount,
        method: (activeDestination.method || 'bank').toLowerCase(),
        // Compose destination using WithdrawSetupScreen stored values
        destination: `${activeDestination.bank || auth.withdrawMethod || 'bank'}:${activeDestination.accountNumber || auth.withdrawDest || ''}`.trim(),
        account_holder: activeDestination.accountHolder || accountHolderName || auth.withdrawHolder || auth.name || '',
      };
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'tma ' + initData,
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

  const init = getInitData && getInitData();

  const loadTxns = useCallback(async () => {
    if (!init) return;
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/data-balance?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: 'tma ' + init },
      });
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
  }, [init, limit, offset]);
useEffect(() => {
  function onWalletUpdated() {
    // slight debounce so backend finishes writes
    setTimeout(() => loadTxns(), 120);
  }
  window.addEventListener('wallet:updated', onWalletUpdated);
  return () => window.removeEventListener('wallet:updated', onWalletUpdated);
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



  // --- History layout geometry (percentages) ---
  const HDR_TOP = 12.0;          // header bar bottom edge
  const ROW_TOP_START = 18.5;    // where first data row begins
  const ROW_HEIGHT = 4.8;        // per-row height
  const ROW_GAP = 0.8;           // vertical spacing between rows
  const MAX_ROWS = 10;           // visible rows, keep in sync with your slicing

  // Columns (left → width) | tune these three numbers if needed
  const COL_DATE_LEFT = 3.5,  COL_DATE_W = 38.0;  // “07/10/2025, 21:19:…”
  const COL_TXN_LEFT  = 43.0, COL_TXN_W  = 32.0;  // “Withdraw / Bet”
  const COL_AMT_LEFT  = 77.0, COL_AMT_W  = 19.0;  // right-aligned amount


  // Build row hotspots for each visible row
  const rowHotspots = Array.from({ length: MAX_ROWS }, (_, i) => {
    const r = visibleRows[i];
    const top = ROW_TOP_START + i * (ROW_HEIGHT + ROW_GAP);

    // Whole-row tap target (optional)
    const base = {
      key: `histRow-${i + 1}`,
      title: r ? `Open ${r.transaction}` : 'Empty slot',
      left: '3.0%',
      top: `${top}%`,
      width: '94.0%',
      height: `${ROW_HEIGHT}%`,
      ...(r
        ? {
            onClick: () => {
              try {
                console.log('[history] row click', r);
              } catch (_) {}
            },
          }
        : {}),
    };

    // Column cells
    const dateCell = {
      key: `histDate-${i + 1}`,
      title: r ? new Date(r.timestamp).toLocaleString() : '',
      left: `${COL_DATE_LEFT}%`,
      top: `${top}%`,
      width: `${COL_DATE_W}%`,
      height: `${ROW_HEIGHT}%`,
      readOnly: true,
      inputType: 'text',
      coerceNumber: false,
      inputStyle: {
        textAlign: 'left',
        padding: 0,
        background: 'transparent',
        border: '0',
        boxShadow: 'none',
        fontWeight: 600,
        color: '#111827',
      },
    };

    const txnCell = {
      key: `histTxn-${i + 1}`,
      title: r ? r.transaction : '',
      left: `${COL_TXN_LEFT}%`,
      top: `${top}%`,
      width: `${COL_TXN_W}%`,
      height: `${ROW_HEIGHT}%`,
      readOnly: true,
      inputType: 'text',
      coerceNumber: false,
      inputStyle: {
        textAlign: 'left',
        padding: 0,
        background: 'transparent',
        border: '0',
        boxShadow: 'none',
        color: '#111827',
      },
    };

    const amt = r ? Number(r.points || 0) : 0;
    const amtCell = {
      key: `histAmt-${i + 1}`,
      title: r ? (amt > 0 ? `+${amt}` : `${amt}`) : '',
      left: `${COL_AMT_LEFT}%`,
      top: `${top}%`,
      width: `${COL_AMT_W}%`,
      height: `${ROW_HEIGHT}%`,
      readOnly: true,
      inputType: 'text',
      coerceNumber: false,
      inputStyle: {
        textAlign: 'right',
        padding: 0,
        background: 'transparent',
        border: '0',
        boxShadow: 'none',
        fontWeight: 700,
        color: r && amt < 0 ? '#b91c1c' : '#065f46',
      },
    };

    return [base, dateCell, txnCell, amtCell];
  }).flat();

  // Compose final hotspots for the History screen
  const hotspots = [
    // ... your Back button etc.
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
        onDraft={(d) => console.log('History draft:', d)}
      />
      {loading && <div>Loading transactions...</div>}
      {err && <div style={{ color: 'red', marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back to Dashboard</button>
        <button onClick={() => setEdit(!edit)}>{edit ? 'Done Editing' : 'Edit hotspots'}</button>
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
        const destination = `${method}:${trimmedAccount}`;
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'tma ' + initData,
          },
          body: JSON.stringify({
            initData,
            profile: {
              withdrawMethod: method,
              withdrawDest: destination,
              withdrawHolder: trimmedHolder,
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
          withdrawMethod: profile.withdraw_method || method,
          withdrawDest: profile.withdraw_dest || destination,
          withdrawHolder: profile.withdraw_holder || trimmedHolder,
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

        // Compose a new destination entry
        const newEntry = {
          id: `dest-${Date.now()}`,
          method,
          bank: bankLabel,
          bankLabel,
          accountNumber: trimmedAccount,
          accountHolder: trimmedHolder,
          destination: `${method}:${trimmedAccount}`,
        };

        // Append to existing withdrawAccounts (client-side)
        const existing = Array.isArray(auth.withdrawAccounts) ? auth.withdrawAccounts : [];
        const nextAccounts = [...existing, newEntry];

        // Persist to backend (compatible with older server: single fields + optional array)
        const payload = {
          initData,
          profile: {
            withdrawMethod: method,
            withdrawDest: newEntry.destination,
            withdrawHolder: trimmedHolder,
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
          withdrawMethod: profile.withdraw_method || method,
          withdrawDest: profile.withdraw_dest || newEntry.destination,
          withdrawHolder: profile.withdraw_holder || trimmedHolder,
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
          onDraft={(d) => console.log('Withdraw setup hotspot draft:', d)}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => onNavigate('dashboard')}>Back</button>
          <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        </div>
      </div>
  );
}

function AdminPortalRedirectScreen({ onNavigate, screenName }) {
  const hasNavigate = typeof onNavigate === 'function';
  const redirectFlag = useRef(false);

  const adminUrl = useMemo(() => {
    const fallback = screenName ? `${ADMIN_PORTAL_PATH}#${screenName}` : ADMIN_PORTAL_PATH;
    if (typeof window === 'undefined') return fallback;
    try {
      const target = new URL(ADMIN_PORTAL_PATH, window.location.origin);
      if (screenName) {
        target.hash = screenName;
      }
      return target.toString();
    } catch (_) {
      return fallback;
    }
  }, [screenName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (redirectFlag.current) return;
    redirectFlag.current = true;
    window.location.assign(adminUrl);
  }, [adminUrl]);

  const handleOpenPortal = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.assign(adminUrl);
    }
  }, [adminUrl]);

  const handleBack = useCallback(() => {
    if (hasNavigate) {
      onNavigate('dashboard');
    }
  }, [hasNavigate, onNavigate]);

  return (
    <ScreenFrame title="Admin Portal" png={PngAdminDash}>
      <div style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 360 }}>
        The admin experience now lives in a dedicated portal. You will be redirected automatically,
        but you can also use the button below to open the admin tools manually.
      </div>
      <button onClick={handleOpenPortal}>Open admin portal</button>
      {hasNavigate && (
        <button onClick={handleBack}>Back to dashboard</button>
      )}
      <div style={{ fontSize: 12, opacity: 0.7, wordBreak: 'break-all' }}>{adminUrl}</div>
    </ScreenFrame>
  );
}

export function AdminDashboardScreen(props) {
  return <AdminPortalRedirectScreen {...props} screenName="overview" />;
}

export function AdminUserManagementScreen(props) {
  return <AdminPortalRedirectScreen {...props} screenName="users" />;
}

export function AdminPointsTrackingScreen(props) {
  return <AdminPortalRedirectScreen {...props} screenName="txns" />;
}

export function AdminFiguresDataScreen(props) {
  return <AdminPortalRedirectScreen {...props} screenName="figures" />;
}

export function AdminResultPostingScreen(props) {
  return <AdminPortalRedirectScreen {...props} screenName="results" />;
}

export function AdminReportsScreen(props) {
  return <AdminPortalRedirectScreen {...props} screenName="reports" />;
}
// Barrel-style named export for namespace imports
// Allows: import { Screens } from '../../screens'; or import * as Screens from '../../screens';
export const Screens = {
  WelcomeScreen,
  LoginScreen,
  DashboardScreen,
  JoinScreen,
  InviteScreen,
  BoardAScreen,
  BoardBScreen,
  BoardCScreen,
  BoardDScreen,
  ConfirmScreen,
  DepositScreen,
  WithdrawRequestScreen,
  HistoryScreen,
  WithdrawSetupScreen,
  AdminDashboardScreen,
  AdminUserManagementScreen,
  AdminPointsTrackingScreen,
  AdminFiguresDataScreen,
  AdminResultPostingScreen,
  AdminReportsScreen,
};
