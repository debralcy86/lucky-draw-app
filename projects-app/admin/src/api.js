const hasWindow = typeof window !== 'undefined';

export function resolveApiBase() {
  const envBase = (import.meta.env?.VITE_API_BASE ?? '').trim();
  const fallbackBase = hasWindow ? (window.location?.origin || '') : '';
  const base = (envBase || fallbackBase || '').replace(/\/$/, '');
  const source = envBase ? 'env' : (base ? 'origin' : 'unset');
  return { base, source };
}

function ensureBase() {
  const { base } = resolveApiBase();
  if (!base) throw new Error('API base not configured. Set VITE_API_BASE or run behind the backend domain.');
  return base;
}

function getCronKey() {
  if (!hasWindow) return '';
  try {
    return (window.CRON_KEY || localStorage.getItem('cronKey') || '').trim();
  } catch (_) {
    return (window.CRON_KEY || '').trim();
  }
}

async function request(path, init = {}) {
  const base = ensureBase();
  const cronKey = getCronKey();
  const res = await fetch(base + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-key': cronKey,
      ...(init.headers || {}),
    },
    ...init,
  });
  let json = {};
  try {
    json = await res.json();
  } catch (_) {
    json = {};
  }
  if (!res.ok || json?.ok === false) {
    const reason = json?.error || json?.reason || `HTTP ${res.status}`;
    throw new Error(reason);
  }
  return json;
}

export const api = {
  loginWithToken: (token) =>
    request('/api/admin/session-login', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  loginWithPassword: (email, password) =>
    request('/api/admin/session-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  whoami: () => request('/api/admin/whoami'),
  logout: () => request('/api/admin/logout'),
  metrics: () => request('/api/admin-metrics'),
};
