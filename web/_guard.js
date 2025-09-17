export function inTelegram() {
  return !!(window?.Telegram?.WebApp);
}

export function requireTelegramBanner() {
  if (inTelegram()) return;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#222;color:#fff;padding:10px;font:14px/1.4 system-ui;z-index:9999;text-align:center';
  div.textContent = 'Tip: open this page inside the Telegram Mini App for full functionality.';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}
