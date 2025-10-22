// /web/_api.js
const BASE = location.origin;

export function getInitData() {
  try {
    return window?.Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

async function postJSON(path, body) {
  // TAG: v2025-10-18-auth01 postJSON header auth enabled
  const initData = getInitData();
  const headers = { 'Content-Type': 'application/json' };
  if (initData) headers['Authorization'] = 'tma ' + initData;

  const payload = { ...body };
  if (initData && !('initData' in payload)) payload.initData = initData;

  const res = await fetch(BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, json };
}

async function getJSON(url) {
  // TAG: v2025-10-18-auth01 getJSON header auth enabled
  const initData = getInitData();
  const headers = {};
  if (initData) headers['Authorization'] = 'tma ' + initData;
  const res = await fetch(url, { headers });
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, json };
}

export async function whoAmI() {
  return postJSON('/api/whoami', { initData: getInitData() });
}

export async function placeBet({ group, figure, points }) {
  return postJSON('/api/bet', { initData: getInitData(), group, figure, points });
}

export async function openDraw() {
  return getJSON(BASE + '/api/open-draw');
}

export async function createWithdraw({ amount, note = '' }) {
  return postJSON('/api/withdraw-create', { initData: getInitData(), amount, note });
}

export async function saveProfile(profile = {}) {
  // backend: projects-app/backend/handlers/profile.mjs
  const payload = (profile && typeof profile === 'object' && 'profile' in profile)
    ? { ...profile.profile }
    : { ...(profile && typeof profile === 'object' ? profile : {}) };
  return postJSON('/api/profile', { initData: getInitData(), profile: payload });
}

export async function adminCredit({ userId, amount, note = '' }) {
  // backend: projects-app/backend/handlers/admin-credit.mjs (admin only)
  return postJSON('/api/admin-credit', { initData: getInitData(), userId, amount, note });
}

// replace fetchWallet with POST
export async function fetchWallet({ userId, limit = 20, offset = 0 } = {}) {
  return postJSON('/api/data-balance', {
    initData: getInitData(),
    userId: userId ? String(userId) : undefined,
    limit,
    offset
  });
}

// replace adminListWithdraws with POST + body args (status optional: 'pending' | 'approved' | 'rejected')
export async function adminListWithdraws({ status = 'pending', limit = 50, offset = 0 } = {}) {
  return postJSON('/api/admin-withdraws', {
    initData: getInitData(),
    status,
    limit,
    offset
  });
}

// replace adminTxns with POST + body args
export async function adminTxns({ userId, limit = 20, offset = 0 } = {}) {
  return postJSON('/api/admin-txns', {
    initData: getInitData(),
    userId: userId ? String(userId) : undefined,
    limit,
    offset
  });
}

// replace adminUpdateWithdraw: use 'action' expected by backend
// action must be 'approve' or 'reject'
export async function adminUpdateWithdraw({ id, action, note = '' }) {
  return postJSON('/api/admin-withdraw-update', {
    initData: getInitData(),
    id,
    action,   // 'approve' | 'reject'
    note
  });
}

// hard-disable the retired endpoint to avoid 404/410 trips
export async function listMyWithdrawRequests() {
  return { ok: false, status: 410, json: { ok: false, error: 'withdraw-request endpoint retired' } };
}

export async function adminDrawExec() {
  // backend: projects-app/backend/handlers/admin-draw-exec.mjs
  return postJSON('/api/admin-draw-exec', { initData: getInitData() });
}
