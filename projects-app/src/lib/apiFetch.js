import { getInitData } from './initData';

// Centralized API fetch helper for Telegram Mini App
// 🧩 Version tag: v2025-10-19-ux02
export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const rawInit = getInitData({ refresh: true });
  if (rawInit) headers.set('Authorization', `tma ${rawInit}`);

  try {
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      const mime = res.headers.get('content-type') || '';
      let preview = '';
      try {
        const clone = res.clone();
        const body = mime.includes('application/json') ? await clone.json() : await clone.text();
        const str = typeof body === 'string' ? body : JSON.stringify(body);
        preview = str.slice(0, 120);
      } catch {}

      if (preview) {
        showToast(`API Error ${res.status}: ${preview}`);
      } else {
        showToast(`API Error ${res.status}`);
      }
    }

    return res;
  } catch (err) {
    console.error('apiFetch failed', err);
    showToast('⚠️ Network or server error');
    throw err;
  }
}

function showToast(msg) {
  if (typeof document === 'undefined') return;

  const old = document.querySelector('.ld-toast');
  if (old && old.textContent === msg) return;

  const t = document.createElement('div');
  t.className = 'ld-toast';
  t.textContent = msg;
  t.style.cssText = `
    position:fixed;bottom:20px;left:50%;
    transform:translateX(-50%);
    background:#222;color:#fff;
    padding:10px 16px;border-radius:12px;
    font-size:14px;z-index:999999;
    box-shadow:0 6px 14px rgba(0,0,0,0.25);
    max-width:90vw;text-align:center;line-height:1.3;
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
console.log('TAG: v2025-10-19-ux02 apiFetch toast patch active');
