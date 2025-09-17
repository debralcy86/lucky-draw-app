// /web/_api.js
const BASE = location.origin;

export function getInitData() {
  try {
    const hash = location.hash && location.hash.startsWith('#')
      ? new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')
      : '';
    const qs = location.search
      ? new URLSearchParams(location.search).get('tgWebAppData')
      : '';
    const sdk = window?.Telegram?.WebApp?.initData || '';
    return hash || qs || sdk || '';
  } catch {
    return '';
  }
}

async function postJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, json };
}

async function getJSON(url) {
  const res = await fetch(url);
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, json };
}

export async function whoAmI() {
  return postJSON('/api/whoami', { initData: getInitData() });
}

export async function fetchWallet({ userId, limit = 20, offset = 0 } = {}) {
  const u = new URL(BASE + '/api/data-balance');
  if (userId) u.searchParams.set('userId', String(userId));
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset));
  return getJSON(u.toString());
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
  // backend: projects/api/handlers/profile.mjs
  return postJSON('/api/profile', { initData: getInitData(), ...profile });
}

export async function adminCredit({ userId, amount, note = '' }) {
  // backend: projects/api/handlers/admin-credit.mjs (admin only)
  return postJSON('/api/admin-credit', { initData: getInitData(), userId, amount, note });
}

export async function adminListWithdraws({ page = 1, pageSize = 50 } = {}) {
  const u = new URL(location.origin + '/api/admin-withdraws');
  u.searchParams.set('page', String(page));
  u.searchParams.set('pageSize', String(pageSize));
  return getJSON(u.toString());
}

export async function adminUpdateWithdraw({ id, status, note = '' }) {
  // status: 'approved' | 'rejected'
  return postJSON('/api/admin-withdraw-update', { initData: getInitData(), id, status, note });
}

export async function adminTxns({ userId, limit = 20, offset = 0 } = {}) {
  const u = new URL(location.origin + '/api/admin-txns');
  if (userId) u.searchParams.set('userId', String(userId));
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset));
  return getJSON(u.toString());
}

export async function listMyWithdrawRequests() {
  // backend: projects/api/handlers/withdraw-request.mjs (assumed: GET lists user's requests)
  return getJSON(location.origin + '/api/withdraw-request');
}

export async function adminDrawExec() {
  // backend: projects/api/handlers/admin-draw-exec.mjs
  return postJSON('/api/admin-draw-exec', { initData: getInitData() });
}
