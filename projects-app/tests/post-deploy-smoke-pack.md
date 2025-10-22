## Lucky Draw Mini App – Post-Deploy Smoke Pack (v2025-10-18-ux02)

Run these inside the Telegram Mini App console after deploying with cache-buster (`?v=2025-10-18-ux02`) to ensure auth and betting workflows remain healthy.

### 1. WhoAmI (auth)
```js
const initData = window.Telegram?.WebApp?.initData || '';
await fetch('/api/whoami?v=2025-10-18-ux02', {
  headers: { Authorization: 'tma ' + initData },
}).then(r => r.json()).then(x => (console.log('whoami:', x), x));
```

### 2. Wallet / Balance
```js
const initData = window.Telegram?.WebApp?.initData || '';
await fetch('/api/data-balance?v=2025-10-18-ux02', {
  headers: { Authorization: 'tma ' + initData },
}).then(r => r.json()).then(x => (console.log('data-balance:', x), x));
```

### 3. Place Test Bet
```js
const initData = window.Telegram?.WebApp?.initData || '';
await fetch('/api/bet?v=2025-10-18-ux02', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'tma ' + initData,
  },
  body: JSON.stringify({ drawId: '<OPEN_DRAW_ID>', group: 'A', figure: 1, amount: 1 }),
}).then(r => r.json()).then(x => (console.log('bet:', x), x));
```

If any call fails you should see the unified toast (`TAG: v2025-10-18-ux02 apiFetch toast patch active`) and console error details for quick diagnosis.
