export function toast(msg = '', ms = 1800) {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;z-index:9999;font:14px system-ui';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

export function spinner(on = true) {
  let s = document.getElementById('__spin');
  if (on) {
    if (s) return;
    s = document.createElement('div');
    s.id = '__spin';
    s.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.25);display:grid;place-items:center;z-index:9998';
    s.innerHTML = '<div style="width:42px;height:42px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:sp 1s linear infinite"></div>';
    const css = document.createElement('style'); css.textContent='@keyframes sp{to{transform:rotate(1turn)}}';
    s.appendChild(css);
    document.body.appendChild(s);
  } else {
    s?.remove();
  }
}
