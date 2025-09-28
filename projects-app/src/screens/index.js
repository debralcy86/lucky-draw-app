// Option B implementation: PNG-backed screens with an action bar.
// Each screen receives one prop: onNavigate(nextKey, params?)

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../state/appState';
import HotspotImage from '../components/HotspotImage';

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
    { top: 29.93, width: 11.83, height: 3.43, start: 10.45, spacing: 12.41 },
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

function useHotspotDebug(label, enabled, hotspots) {
  useEffect(() => {
    if (!enabled) return;
    console.log(`[hotspots:${label}]`, hotspots);
  }, [enabled, hotspots, label]);
}

// --- Telegram initData + API helper (inline, step 1) ---
function getInitData() {
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
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function LoginScreen({ onNavigate, debug = false }) {
  const { setAuth } = useAppState();
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
  }, [debug]);

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
      setAuth({ userId: actualUserId, name: trimmedName, contact: trimmedContact, status: 'verified' });
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

    setHasStoredPin(true);
    setProfileExists(true);
    setStatusMessage('Registration complete. Redirecting to dashboard...');
    setErrorMessage('');
    setPin('');
    setSaving(false);

    setAuth({ userId: actualUserId, name: trimmedName, contact: trimmedContact, status: 'registered' });
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
  const { state } = useAppState();
  const [edit, setEdit] = useState(false);
  const balance = state?.wallet?.balance ?? 0;
  const hotspots = [
    {
      ...( // preserve key/title/kind if present
        { key: 'balanceBanner', title: `Points balance: ${balance.toLocaleString()} pts`, ariaLabel: 'Current points balance', onClick: () => alert(`Points balance: ${balance.toLocaleString()} pts`) }
      ),
      left: '5.21%',
      top: '20.54%',
      width: '86.73%',
      height: '9.31%',
    },
    {
      key: 'cardJoin',
      title: 'Join layout',
      left: '5.00%',
      top: '32.00%',
      width: '86.00%',
      height: '4.00%',
      onClick: () => onNavigate('join'),
    },
    {
      ...( // preserve key/title/kind if present
        { key: 'tileJoin', title: 'Join Lucky Draw', onClick: () => onNavigate('join') }
      ),
      left: '4.55%',
      top: '37.67%',
      width: '86.31%',
      height: '3.67%',
    },
    {
      ...( // preserve key/title/kind if present
        { key: 'tileHistory', title: 'Point History', onClick: () => onNavigate('history') }
      ),
      left: '4.55%',
      top: '37.67%',
      width: '86.31%',
      height: '3.67%',
    },
    {
      ...( // preserve key/title/kind if present
        { key: 'tileDeposit', title: 'Deposit Points', onClick: () => onNavigate('deposit') }
      ),
      left: '4.62%',
      top: '42.61%',
      width: '86.69%',
      height: '3.55%',
    },
    {
      ...( // preserve key/title/kind if present
        { key: 'tileWithdraw', title: 'Withdraw Points', onClick: () => onNavigate('withdrawRequest') }
      ),
      left: '4.86%',
      top: '47.85%',
      width: '86.44%',
      height: '3.88%',
    },
    {
      ...( // preserve key/title/kind if present
        { key: 'tileProfile', title: 'Profile / Withdraw', onClick: () => onNavigate('withdrawSetup') }
      ),
      left: '4.62%',
      top: '52.96%',
      width: '86.44%',
      height: '3.77%',
    },
    {
      ...( // preserve key/title/kind if present
        { key: 'tileInvite', title: 'Invite / QR Link', onClick: () => onNavigate('invite') }
      ),
      left: '4.62%',
      top: '58.06%',
      width: '86.44%',
      height: '3.99%',
    },
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
        <button onClick={() => onNavigate('join')}>Join</button>
        <button onClick={() => onNavigate('history')}>History</button>
        <button onClick={() => onNavigate('deposit')}>Deposit</button>
        <button onClick={() => onNavigate('withdrawRequest')}>Withdraw</button>
        <button onClick={() => onNavigate('withdrawSetup')}>Profile</button>
        <button onClick={() => onNavigate('invite')}>Invite</button>
        <button onClick={() => onNavigate('adminDashboard')}>Admin</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        <span style={{marginLeft:8, fontSize:12, opacity:0.7}}>v: dashboard-04</span>
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
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

function BoardScreenBase({ group, onNavigate, debug = false }) {
  const { placeBet } = useAppState();
  const [edit, setEdit] = useState(false);
  const [points] = useState(10);
  const [bets, setBets] = useState({});

  const toggleFigure = useCallback((figure) => {
    setBets((prev) => ({ ...prev, [figure]: prev[figure] ?? points }));
  }, [points]);

  const setFigurePoints = useCallback((figure, value) => {
    setBets((prev) => {
      const next = { ...prev, [figure]: value };
      if (value <= 0) {
        delete next[figure];
      }
      return next;
    });
  }, []);

  const handlePlacePoints = useCallback(() => {
    const entries = Object.entries(bets)
      .map(([key, value]) => [Number(key), Math.max(0, Math.floor(Number(value) || 0))])
      .filter(([, value]) => value > 0);

    if (entries.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    for (const [figure, value] of entries) {
      placeBet({ group, figure, points: value, drawAt: timestamp });
    }
    alert('Bets placed!');
    onNavigate('dashboard');
  }, [bets, group, onNavigate, placeBet]);

  const baseFigureHotspots = useMemo(
    () => FIGURE_GRID_COORDS.map(({ figure, left, top, width, height }) => ({
      key: `${group}_fig_${figure}`,
      title: `Figure ${figure}`,
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
    const current = bets[figure];
    return current != null
      ? {
          key: `input_${group}_${figure}`,
          kind: 'input',
          title: `Points for ${figure}`,
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

  const totalPoints = useMemo(
    () => Object.values(bets).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [bets],
  );

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
        <div><strong>Total Points:</strong> {totalPoints}</div>
        <button disabled={Object.keys(bets).length === 0} onClick={handlePlacePoints}>Place Points</button>
        <button onClick={() => setEdit((value) => !value)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
        {prevGroup && (
          <button onClick={() => onNavigate('board', { group: prevGroup })}>{`← Prev: Group ${prevGroup}`}</button>
        )}
        {nextGroup ? (
          <button onClick={() => onNavigate('board', { group: nextGroup })}>{`Next: Group ${nextGroup} →`}</button>
        ) : (
          <button onClick={() => onNavigate('dashboard')}>Done</button>
        )}
        <button onClick={() => onNavigate('join')}>Back</button>
      </div>
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
  const { state, placeBet } = useAppState();
  const wallet = state.wallet || { balance: 0 };
  const [points, setPoints] = useState(() => (params?.points ?? 10));
  const group = params?.group ?? 'A';
  const figure = params?.figure ?? 1;

  const canPlace = useMemo(() => Number.isFinite(Number(points)) && Number(points) > 0 && Number(points) <= wallet.balance, [points, wallet.balance]);

  function onPlace() {
    const amt = Math.floor(Number(points) || 0);
    if (amt <= 0) return;
    placeBet({ group, figure, points: amt, drawAt: new Date().toISOString() });
    onNavigate('dashboard');
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
      <button onClick={onPlace} disabled={!canPlace}>Place Bet</button>
      <button onClick={() => onNavigate('join')}>Back</button>
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

  const handleDeposit = () => {
    if (!canSubmit) {
      alert('Enter a deposit amount greater than zero.');
      return;
    }
    credit(normalizedAmount);
    console.log('Deposit submitted (placeholder)', { amount: normalizedAmount, note, uploadSlip });
    alert(`Deposit recorded for ${normalizedAmount} pts (placeholder).`);
    setNote('');
    setUploadSlip('');
    onNavigate('dashboard');
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
      inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
      onChange: setNote,
    },
    {
      key: 'uploadSlipInput',
      kind: 'input',
      title: 'Upload slip link',
      left: '4.24%',
      top: '42.38%',
      width: '91.52%',
      height: '6.42%',
      value: uploadSlip,
      inputType: 'text',
      coerceNumber: false,
      placeholder: 'Attach proof of payment URL',
      inputStyle: { textAlign: 'left', padding: '0 16px', fontWeight: 500 },
      onChange: setUploadSlip,
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
        <button onClick={() => setEdit((v) => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
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
      const labelParts = [bankLabel, accountNumber ? `• ${accountNumber}` : null].filter(Boolean);
      return {
        id: entry.id || entry.value || accountNumber || `withdraw-destination-${index}`,
        label: labelParts.length > 0 ? labelParts.join(' ') : 'Saved destination',
        bank: bankLabel,
        accountNumber,
        accountHolder,
      };
    });

    if (mapped.length > 0) return mapped;

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

  const handleRequest = () => {
    if (normalizedAmount <= 0) {
      alert('Enter a withdraw amount greater than zero.');
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
    debit(normalizedAmount);
    console.log('Withdraw request submitted (placeholder)', {
      amount: normalizedAmount,
      destination: {
        bank: activeDestination.bank,
        accountNumber: activeDestination.accountNumber,
        accountHolder: activeDestination.accountHolder,
      },
    });
    alert(`Withdraw request submitted for ${normalizedAmount} pts (placeholder).`);
    setAmount(0);
    onNavigate('dashboard');
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
        <button onClick={() => setEdit((v) => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function HistoryScreen({ onNavigate, debug = false }) {
  const { state } = useAppState();
  const bets = state.bets;
  const txns = state.walletTxns;
  const [edit, setEdit] = useState(false);
  const hotspots = [
    {
      key: 'historyLedger',
      title: 'Points transaction history',
      ariaLabel: 'Points transaction history',
      left: '3.76%',
      top: '13.63%',
      width: '92.18%',
      height: '40.59%',
      onClick: () => {/* no navigation */},
    },
  ];
  const showOverlay = edit;
  useHotspotDebug('history', debug, hotspots);

  const historyRows = useMemo(() => {
    const mappedTxns = txns.map((t) => {
      const typeLower = (t.note || '').toLowerCase();
      let label = 'Transaction';
      if (t.type === 'bet') label = 'Bet';
      else if (t.type === 'credit') label = typeLower.includes('win') ? 'Win' : 'Deposit';
      else if (t.type === 'debit') label = 'Withdraw';
      return {
        id: `txn-${t.id}`,
        timestamp: t.createdAt,
        transaction: label,
        figure: '-',
        points: (t.type === 'debit' ? -1 : 1) * t.amount,
      };
    });

    const mappedBets = bets.map((b) => ({
      id: `bet-${b.id}`,
      timestamp: b.createdAt,
      transaction: 'Bet',
      figure: b.figure != null ? String(b.figure) : '-',
      points: -Math.abs(b.points),
    }));

    return [...mappedTxns, ...mappedBets]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [txns, bets]);

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
        <h3 style={{ margin: '8px 0' }}>Points History</h3>
        {historyRows.length === 0 ? (
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

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => onNavigate('dashboard')}>Back</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function WithdrawSetupScreen({ onNavigate, debug = false }) {
  const { state } = useAppState();
  const auth = state?.auth || {};
  const [edit, setEdit] = useState(false);
  const [selectedBank, setSelectedBank] = useState(auth.bank || '');
  const [accountNumber, setAccountNumber] = useState(auth.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(auth.accountName || auth.name || '');

  useEffect(() => {
    if (auth.bank) setSelectedBank(auth.bank);
    if (auth.accountNumber) setAccountNumber(auth.accountNumber);
    if (auth.accountName) setAccountHolder(auth.accountName);
  }, [auth.bank, auth.accountNumber, auth.accountName]);

  const userName = auth.name || auth.fullName || 'User Name';
  const userId = auth.userId || auth.telegramId || auth.id || 'Unknown ID';
  const summaryDisplay = `${userName} · ID ${userId}`;

  const bankOptions = auth.availableBanks || [
    { label: 'Maybank', value: 'maybank' },
    { label: 'CIMB', value: 'cimb' },
    { label: 'Public Bank', value: 'public-bank' },
    { label: 'Touch n Go eWallet', value: 'tng' },
    { label: 'GrabPay', value: 'grabpay' },
  ];

  const handleSaveInfo = () => {
    const payload = {
      bank: selectedBank,
      accountNumber,
      accountHolder,
    };
    console.log('Save withdraw info (placeholder)', payload);
    alert('Withdraw info saved (placeholder). Connect to backend to persist.');
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
      title: 'Save Bank / Wallet Info',
      left: '4.00%',
      top: '49.00%',
      width: '92.00%',
      height: '5.00%',
      onClick: handleSaveInfo,
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
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
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
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
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

// Admin Screens (09–13)
export function AdminDashboardScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  // computed totals for display bar
  const { state } = useAppState();
  const totalUsers = Array.isArray(state?.users) ? state.users.length : 0;
  const totalPoints = Array.isArray(state?.wallets)
    ? state.wallets.reduce((sum, w) => sum + (Number(w?.balance) || 0), 0)
    : 0;

  const hotspots = [
    // Totals display bar (non-nav; shows computed values)
    { 
      key: 'totals',
      title: `Total Users: ${totalUsers}, Total Points: ${totalPoints.toLocaleString()}`,
      left: '4.37%',
      top: '8.53%',
      width: '91.00%',
      height: '9.34%',
      onClick: () => alert(`Users: ${totalUsers}, Points: ${totalPoints.toLocaleString()}`)
    },

    // Vertical list (exact coordinates provided)
    { key: 'users',   title: 'Users',            left: '4.00%', top: '20.39%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminUsers') },
    { key: 'points',  title: 'Points',           left: '4.00%', top: '27.00%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminPoints') },
    { key: 'figures', title: 'Figures',          left: '4.00%', top: '33.66%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminFigures') },
    { key: 'results', title: 'Results Posting',  left: '4.00%', top: '40.31%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminResults') },
    { key: 'reports', title: 'Reports',          left: '4.00%', top: '46.93%', width: '91.66%', height: '5.00%', onClick: () => onNavigate('adminResults') },
  ];
  const showOverlay = edit;
  useHotspotDebug('admin-dashboard', debug, hotspots);
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
        <button onClick={() => onNavigate('adminUsers')}>Users</button>
        <button onClick={() => onNavigate('adminPoints')}>Points</button>
        <button onClick={() => onNavigate('adminFigures')}>Figures</button>
        <button onClick={() => onNavigate('adminResults')}>Results Posting</button>
        <button onClick={() => onNavigate('adminResults')}>Reports</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function AdminUserManagementScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);

  // Search field state (Name/ID/Contact)
  const [q, setQ] = useState('');

  // Table rows rendered as hotspots beneath the search bar
  const rowTopPercents = [22.73, 29.35, 35.96, 42.57, 49.29, 55.90];
  const rowHotspots = rowTopPercents.map((top, idx) => ({
    key: `row${idx + 1}`,
    left: '4.05%',
    top: `${top}%`,
    width: '91.60%',
    height: '5.53%',
    onClick: () => console.log(`Row ${idx + 1} tapped`),
  }));

  const hotspots = [
    // Search User (non-navigation input overlay)
    {
      key: 'searchUser',
      kind: 'input',
      title: 'Search User',
      left: '4.00%', top: '12.00%', width: '90.60%', height: '6.08%',
      value: q,
      onChange: (v) => setQ(v),
    },
    ...rowHotspots,
  ];

  const showOverlay = edit;
  useHotspotDebug('admin-users', debug, hotspots);
  return (
    <div style={{ padding: 12 }}>
      <HotspotImage
        src={PngAdminUsers}
        alt="Admin: User Management"
        hotspots={hotspots}
        editable={edit}
        showOverlay={showOverlay}
        interactionsEnabled={!edit}
        onBack={() => onNavigate('adminDashboard')}
        onDraft={(d) => console.log('AdminUsers draft:', d)}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back to Admin</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function AdminPointsTrackingScreen({ onNavigate, debug = false }) {
  const { state } = useAppState();
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
  const rows = useMemo(() => filteredTxns.slice(0, maxDisplayRows).map((t) => {
    const typeLower = (t.note || '').toLowerCase();
    let txnLabel = 'Transaction';
    if (t.type === 'bet') txnLabel = 'Bet';
    else if (t.type === 'credit') txnLabel = typeLower.includes('win') ? 'Win' : 'Deposit';
    else if (t.type === 'debit') txnLabel = 'Withdraw';
    return {
      id: t.id,
      userId: t.userId || authUserId,
      amount: t.amount,
      txnLabel,
      timestamp: t.createdAt,
    };
  }), [filteredTxns, authUserId]);

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
                      {row.amount >= 0 ? '+' : ''}{row.amount.toLocaleString()}
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
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function AdminFiguresDataScreen({ onNavigate, debug = false }) {
  const [edit, setEdit] = useState(false);
  const hotspots = [
    {
      key: 'filters',
      title: 'Filter selection',
      left: '4.04%',
      top: '10.70%',
      width: '69.22%',
      height: '2.00%',
      onClick: () => alert('Open filters for date/group selection (placeholder)'),
    },
    {
      key: 'groupA',
      title: 'Group A total points (live)',
      left: '4.89%',
      top: '16.90%',
      width: '40.73%',
      height: '17.87%',
    },
    {
      key: 'groupA-details',
      title: 'Group A tracking bets',
      left: '4.89%',
      top: '35.98%',
      width: '40.82%',
      height: '2.16%',
      onClick: () => alert('View Group A tracking bets (placeholder)'),
    },
    {
      key: 'groupB',
      title: 'Group B total points (live)',
      left: '54.72%',
      top: '16.90%',
      width: '40.73%',
      height: '17.87%',
    },
    {
      key: 'groupB-details',
      title: 'Group B tracking bets',
      left: '54.72%',
      top: '35.98%',
      width: '40.82%',
      height: '2.16%',
      onClick: () => alert('View Group B tracking bets (placeholder)'),
    },
    {
      key: 'groupC',
      title: 'Group C total points (live)',
      left: '5.23%',
      top: '43.86%',
      width: '40.65%',
      height: '18.89%',
    },
    {
      key: 'groupC-details',
      title: 'Group C tracking bets',
      left: '5.31%',
      top: '63.02%',
      width: '40.31%',
      height: '2.55%',
      onClick: () => alert('View Group C tracking bets (placeholder)'),
    },
    {
      key: 'groupD',
      title: 'Group D total points (live)',
      left: '55.23%',
      top: '43.86%',
      width: '40.14%',
      height: '18.53%',
    },
    {
      key: 'groupD-details',
      title: 'Group D tracking bets',
      left: '55.31%',
      top: '62.70%',
      width: '40.14%',
      height: '2.39%',
      onClick: () => alert('View Group D tracking bets (placeholder)'),
    },
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
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}

export function AdminResultPostingScreen({ onNavigate, debug = false }) {
  const { postResult } = useAppState();
  const [edit, setEdit] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [selectedFigure, setSelectedFigure] = useState('1');
  const [gifFile, setGifFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = useRef(null);

  const groupOptions = useMemo(() => ['A', 'B', 'C', 'D'].map((value) => ({ value, label: `Group ${value}` })), []);
  const figureOptions = useMemo(() => Array.from({ length: 36 }, (_, idx) => {
    const value = String(idx + 1);
    return { value, label: `Figure ${idx + 1}` };
  }), []);

  const handleFileClick = useCallback(() => {
    if (edit) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, [edit]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
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
    { key: 'backDash', title: 'Back to Admin',  left: '4.29%', top: '1.90%', width: '13.78%', height: '0.82%',  onClick: () => onNavigate('adminDashboard') },
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
        <div style={{ marginTop: 8, fontSize: 13, color: '#b42318' }}>
          {statusMessage}
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('adminDashboard')}>Back to Admin</button>
        <button onClick={() => setEdit(v => !v)}>{edit ? 'Done Tagging' : 'Edit hotspots'}</button>
      </div>
    </div>
  );
}
