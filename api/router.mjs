import { parse } from 'node:url';

import * as Bet from '../projects-app/api/bet.mjs';
import * as Balance from '../projects-app/api/handlers/data-balance.mjs';
import * as AdminCredit from '../projects-app/api/handlers/admin-credit.mjs';
import * as AdminMetrics from '../projects-app/api/handlers/admin-metrics.mjs';
import * as AdminTxns from '../projects-app/api/handlers/admin-txns.mjs';
import * as AdminDrawExec from '../projects-app/api/handlers/admin-draw-exec.mjs';
import * as Board from '../projects-app/api/handlers/board.mjs';
import * as BoardStream from '../projects-app/api/handlers/board-stream.mjs';
import * as OpenDraw from '../projects-app/api/handlers/open-draw.mjs';
import * as Scheduler from '../projects-app/api/draw-scheduler.mjs';
import * as Profile from '../projects-app/api/handlers/profile.mjs';
import { withdrawCreate } from '../projects-app/api/handlers/withdraw-create.mjs';
import { adminWithdraws } from '../projects-app/api/handlers/admin-withdraws.mjs';
import { adminWithdrawUpdate } from '../projects-app/api/handlers/admin-withdraw-update.mjs';
// Also import defaults for direct calls by full pathname
import profile from '../projects-app/api/handlers/profile.mjs';
import * as Whoami from '../projects-app/api/handlers/whoami.mjs';
import DebugInitEcho from '../projects-app/api/handlers/debug-init-echo.mjs';


function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function sendPreflight(res) {
  res.statusCode = 200;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-InitData, X-Debug-RID');
  return res.end();
}

export default async function handler(req, res) {
  const { pathname } = parse(req.url, true);
  const path = pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
  console.log('router_start', { method: req.method, pathname, path, ua: req.headers['user-agent'] || 'n/a' });

  // Global CORS preflight for API paths
  if (req.method === 'OPTIONS') {
    return sendPreflight(res);
  }

  try {
    // Allow direct pathname routing for specific handlers
    if (pathname === '/api/profile') {
      return profile(req, res);
    }
    // Legacy withdraw-request handler removed in favor of withdraw-create
    if (req.method === 'POST' && pathname === '/api/withdraw-create') {
      return withdrawCreate(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/admin-withdraws') {
      return adminWithdraws(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/admin-withdraw-update') {
      return adminWithdrawUpdate(req, res);
    }

    if (path === '/data-balance' || path === '/wallet') {
      if ((req.method === 'GET' || req.method === 'POST') && Balance.default) {
        return Balance.default(req, res);
      }
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/bet') {
      if (req.method === 'POST' && Bet.default) return Bet.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/admin-credit') {
      if (req.method === 'POST' && AdminCredit.default) return AdminCredit.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/admin-metrics') {
      if (req.method === 'POST' && AdminMetrics.default) return AdminMetrics.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/admin-txns') {
      if (req.method === 'POST' && AdminTxns.default) return AdminTxns.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/admin-draw-exec') {
      if (req.method === 'POST' && AdminDrawExec.default) return AdminDrawExec.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/open-draw') {
      if (req.method === 'GET' && OpenDraw.default) return OpenDraw.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/board') {
      if (req.method === 'GET' && Board.default) return Board.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/board-stream') {
      if (req.method === 'GET' && BoardStream.default) return BoardStream.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/draw-scheduler') {
      if (req.method === 'GET' && Scheduler.default) return Scheduler.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/profile') {
      if (req.method === 'POST' && Profile.default) return Profile.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    // Legacy '/withdraw-request' removed; use '/api/withdraw-create' instead

    if (path === '/whoami') {
      console.log('router_whoami_branch', { method: req.method, pathname, path });
      if (req.method === 'POST' && Whoami.default) return Whoami.default(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (path === '/debug-init-echo') {
      if (req.method === 'POST' && DebugInitEcho) return DebugInitEcho(req, res);
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    console.warn('router_404', { method: req.method, pathname, path });
    return sendJson(res, 404, { ok: false, error: 'Not Found', path });
  } catch (err) {
    console.error('router_error', { path, message: err?.message, stack: err?.stack });
    return sendJson(res, 500, { ok: false, error: 'Router crashed', details: String(err?.message || err) });
  }
}

export const config = { runtime: 'nodejs' };
