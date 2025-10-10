export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
async function req(path: string, init: RequestInit = {}) {
  const r = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers||{}) },
    ...init
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as any)?.ok === false) throw new Error((j as any).error || (j as any).reason || `status_${r.status}`);
  return j as any;
}
export const api = {
  loginWithToken: (token: string) => req('/api/admin/session-login', { method: 'POST', body: JSON.stringify({ token }) }),
  loginWithPassword: (email: string, password: string) => req('/api/admin/session-login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  whoami: () => req('/api/admin/whoami'),
  logout: () => req('/api/admin/logout'),
  metrics: () => req('/api/admin-metrics')
};
