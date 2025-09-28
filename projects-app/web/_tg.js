// Minimal Telegram initData helper
// Returns the signed initData string when running inside Telegram WebApp.
// Returns an empty string outside Telegram.
// /web/_tg.js
export function getInitData() {
  try {
    // Authoritative source only: Telegram injects this when opened via WebApp
    return window?.Telegram?.WebApp?.initData || '';
  } catch {}
  return '';
}

export function authHeader(initData) {
  return { Authorization: `tma ${initData || ''}` };
}


// Read Telegram start param robustly
export function getStartParam() {
  try {
    // Preferred: from Telegram injection
    const p = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (p) return String(p);
  } catch {}
  try {
    // Fallbacks: query string keys Telegram/WebApps may use
    const u = new URL(location.href);
    return (
      u.searchParams.get('tgWebAppStartParam') ||
      u.searchParams.get('startapp') ||
      u.searchParams.get('start_param') ||
      ''
    );
  } catch {}
  return '';
}

// Simple banner if not inside Telegram
export function showNoTelegramBanner(id = 'tg-warning') {
  const el = document.getElementById(id);
  if (!el) return;
  const inTG = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
  el.style.display = inTG ? 'none' : 'block';
}

// --- Telegram bot deep-link helper (shared) ---
// Respects window.__BOT_USERNAME__ if set before load.
(function () {
  try {
    const g = (typeof window !== 'undefined') ? window : {};
    const DEFAULT_BOT = 'LuckyDrawForUBot';

    function currentUsername() {
      return (g.__BOT_USERNAME__ && String(g.__BOT_USERNAME__).trim()) || DEFAULT_BOT;
    }

    function tgBotLink(path = 'startapp', param = '') {
      const uname = currentUsername();
      const q = param
        ? `?${path}=${encodeURIComponent(param)}`
        : (path ? `?${path}` : '');
      return `https://t.me/${uname}${q}`;
    }

    g.tgBot = Object.assign(g.tgBot || {}, {
      get botUsername() { return currentUsername(); },
      tgBotLink,
      setBotUsername(u) { g.__BOT_USERNAME__ = String(u || '').trim(); }
    });

    // Debug tag (silent in prod logs, visible in console only)
    // console.log('TAG: tgBot helper loaded →', { bot: g.tgBot.botUsername });
  } catch (_) {
    // no-op
  }
})();
