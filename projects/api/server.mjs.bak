// Simple local server to exercise api/wallet.mjs
import http from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { withdrawCreate } from './handlers/withdraw-create.mjs'

// Light env loader (no external deps)
// Supports both ".env.local" and "env.local" in the parent folder (projects/)
(() => {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const candidates = [
      path.resolve(here, '../.env.local'),
      path.resolve(here, '../env.local'),
    ];

    const loaded = [];
    for (const envPath of candidates) {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
      loaded.push(envPath);
    }

    if (loaded.length) {
      console.log(`[env] Loaded: ${loaded.join(', ')}`);
    } else {
      console.log('[env] No local env files found (.env.local or env.local)');
    }
  } catch (e) {
    console.warn('[env] Failed to load env files:', e?.message || e);
  }
})();

// Admin token diagnostic (masked; shows only counts and lengths)
(() => {
  try {
    const raw = String(process.env.ADMIN_TOKENS || process.env.ADMIN_TOKEN || '');
    if (!raw) {
      console.log('[auth] Admin tokens: none configured (using dev-admin-token locally)');
    } else {
      const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
      const summary = tokens.map((t, i) => `#${i + 1}[len=${t.length}]`).join(', ');
      console.log(`[auth] Admin tokens configured: ${tokens.length} (${summary})`);
    }
  } catch (e) {
    console.warn('[auth] Failed to summarize admin tokens:', e?.message || e);
  }
})();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    // Provide Next.js-like query object expected by the handler
    req.query = Object.fromEntries(url.searchParams.entries());

    // Minimal hello check without importing other modules
    if (url.pathname === '/api/hello') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, message: 'hello' }));
    }

    if (url.pathname === '/api/wallet') {
      // Lazy import so that /api/hello works without installing deps
      const { default: wallet } = await import('./handlers/data-balance.mjs');
      return wallet(req, res);
    }

    // POST /api/withdraw-create
    if (req.method === 'POST' && url.pathname === '/api/withdraw-create') {
      return withdrawCreate(req, res);
    }

    // Explicit data-balance endpoint (parity with new handler)
    if (url.pathname === '/api/data-balance') {
      const { default: handler } = await import('./handlers/data-balance.mjs');
      return handler(req, res);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  } catch (err) {
    console.error('[server] Uncaught', err);
    try {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'SERVER_ERROR', message: String(err?.message || err) }));
    } catch {}
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
