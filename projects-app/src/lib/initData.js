let cachedInitData = null;

function computeInitData() {
  try {
    if (typeof window === 'undefined') return '';

    const { location = null, Telegram = null } = window;
    const hash = location?.hash || '';
    const search = location?.search || '';
    const fromTelegram = Telegram?.WebApp?.initData || '';
    if (fromTelegram) return fromTelegram;

    const fromHash = hash.startsWith('#')
      ? new URLSearchParams(hash.slice(1)).get('tgWebAppData')
      : null;
    if (fromHash) return fromHash;

    const fromSearch = search
      ? new URLSearchParams(search).get('tgWebAppData')
      : null;
    if (fromSearch) return fromSearch;

    return '';
  } catch (_) {
    return '';
  }
}

export function getInitData(options = {}) {
  const { refresh = false } = options || {};
  if (refresh || cachedInitData === null) {
    const computed = computeInitData();
    if (computed) {
      cachedInitData = computed;
      return cachedInitData;
    }
    if (cachedInitData === null) {
      return '';
    }
  }
  return cachedInitData || '';
}

export function refreshInitData() {
  cachedInitData = computeInitData() || cachedInitData || '';
  return cachedInitData;
}

export function ensureTelegramInitData() {
  const initData = refreshInitData();
  try {
    if (
      typeof window !== 'undefined' &&
      initData &&
      window.Telegram &&
      window.Telegram.WebApp &&
      !window.Telegram.WebApp.initData
    ) {
      window.Telegram.WebApp.initData = initData;
    }
  } catch (_) {}
  return initData;
}

export function clearCachedInitData() {
  cachedInitData = null;
}
