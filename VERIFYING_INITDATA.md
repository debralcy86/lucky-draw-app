# Verifying Telegram Mini App initData

Quick steps to validate a Telegram `initData` string locally and on your backend.

## Local check (script)

- Install deps: `npm install`
- Run with envs:

```
TELEGRAM_BOT_TOKEN="123456789:AA..." INIT_DATA="query_id=...&user=...&auth_date=...&hash=..." npm run verify:init
```

- Or pass as CLI arg (raw or header form):

```
TELEGRAM_BOT_TOKEN="123456789:AA..." npm run verify:init -- "tma query_id=...&user=...&auth_date=...&hash=..."
TELEGRAM_BOT_TOKEN="123456789:AA..." npm run verify:init -- "Authorization: tma query_id=...&user=...&auth_date=...&hash=..."
```

The script prints a short preview and exits non‑zero on failure.

## Backend usage

- Send from client:

```
fetch('/api/profile', {
  method: 'POST',
  headers: { Authorization: `tma ${window.Telegram.WebApp.initData}` }
});
```

- Server validates using a local HMAC verifier (no external lib) and logs:
  - `TAG: env-check` → bot token source and length
  - `TAG: verify-start` → request id, bot id, init length
  - `TAG: initData-preview` → first 50 chars
  - `TAG: verify-failed` → reason on signature mismatch

## Common pitfalls

- Token format: full `123456789:AA...` with no spaces/newlines
- Truncation/encoding: ensure the exact `window.Telegram.WebApp.initData` string
- Freshness: `auth_date` should be recent; stale data is rejected
- Supabase user id: only proceed once a verified `userId` is present

## Generate test initData locally

You can generate a signed initData string for any bot token and user id:

```
TELEGRAM_BOT_TOKEN="123456789:AA..." npm run gen:init -- --user-id=42 --first=Alice --username=alice --query=AA-Local
```

Flags:
- `--user-id` (number), `--first`, `--username`, `--query` (default `AA-LocalTest`)
- `--tma` to prefix with `tma `, or `--header` to output `Authorization: tma ...`

Then verify it:

```
INIT_DATA="$(TELEGRAM_BOT_TOKEN=123456789:AA... npm run -s gen:init -- --user-id=42)" \
  TELEGRAM_BOT_TOKEN=123456789:AA... npm run verify:init
```
