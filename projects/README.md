# Local API Runner

This folder mirrors your API utilities and a `wallet` endpoint with a tiny Node runner for local sanity checks.

## Prerequisites

- Node.js 18+
- From `projects/` folder, install deps:

```bash
npm install
```

## Environment

You can either export variables or create a `.env.local` file.

- Sample file: `.env.local.example` → copy to `.env.local` and edit values.
- The local server auto-loads `api/../.env.local` if present.

## Run

```bash
# from projects/
npm run start         # defaults to PORT=3001
# or specify a different port
PORT=4000 npm run start
```

## Test requests

GET current data balance and last 50 txns:

```bash
curl -s "http://localhost:3001/api/data-balance?userId=USER_123"
```

POST credit/debit (admin only):

```bash
curl -s -X POST "http://localhost:3001/api/data-balance" \
  -H 'Content-Type: application/json' \
  -H 'x-admin-token: dev-admin-token' \
  --data '{"userId":"USER_123","delta":5,"note":"manual adj"}'

Admin token rules:
- Uses `ADMIN_TOKENS` (comma-separated) or `ADMIN_TOKEN` from env.
- If none configured, defaults to `dev-admin-token` for local dev.
- You can pass either header: `x-admin-token: <token>` or `Authorization: Bearer <token>`.
```

Errors inside the handler are logged as `WALLET_API_UNCAUGHT` and returned with the JSON shape you specified.
