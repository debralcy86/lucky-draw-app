import crypto from 'crypto';
import { decode as htmlDecode } from 'html-entities';

export default async function (req, res) {
  if (String(process.env.TMA_DEBUG || '').trim()) {
    console.log('[tma-debug][enabled]', { val: String(process.env.TMA_DEBUG) });
    try {
      // Determine which source carried initData
      const fromAuth = req.headers?.authorization?.startsWith('tma ') ? req.headers.authorization.slice(4) : null;
      const fromHdrA = req.headers?.['x-telegram-initdata'] || null;
      const fromHdrB = req.headers?.['x-telegram-init-data'] || null;
      const fromQuery = req.query?.initData || null;
      const fromBody = (req.body && typeof req.body === 'object') ? (req.body.initData || null) : null;

      const src =
        fromAuth ? 'auth' :
        fromHdrA ? 'x-telegram-initdata' :
        fromHdrB ? 'x-telegram-init-data' :
        fromQuery ? 'query' :
        fromBody ? 'body' : 'none';

      const raw = String(fromAuth || fromHdrA || fromHdrB || fromQuery || fromBody || '').trim();
      console.log('[tma-debug][source]', { src, rawLen: raw.length });

      let decoded = raw;
      try { decoded = htmlDecode(decoded); } catch {}
      const hasAmp = decoded.includes('&amp;') || decoded.includes('&amp;amp;');
      console.log('[tma-debug][decoded]', { len: decoded.length, hasAmp });

      // 🔍 BEGIN TEMPORARY DEBUG BLOCK
      try {
        const rawHeader = req.headers['authorization'] || '';
        const rawInitData = rawHeader.startsWith('tma ')
          ? rawHeader.slice(4).trim()
          : rawHeader;

        console.log('[tma-debug][initData.raw.len]', rawInitData.length);
        console.log('[tma-debug][initData.raw.head]', rawInitData.slice(0, 200));

        const spPreview = new URLSearchParams(rawInitData);
        console.log('[tma-debug][user.field]', spPreview.get('user'));
        console.log('[tma-debug][auth_date]', spPreview.get('auth_date'));
        console.log('[tma-debug][chat_instance]', spPreview.get('chat_instance'));

        const keysPreview = [...spPreview.keys()].filter(k => k !== 'hash' && k !== 'signature').sort();
        const dcsPreview = keysPreview.map(k => `${k}=${spPreview.get(k)}`).join('\n');
        console.log('[tma-debug][dataCheckString.head]', dcsPreview.slice(0, 300));
      } catch (err) {
        console.error('[tma-debug][error.initDataPreview]', err);
      }
      // 🔍 END TEMPORARY DEBUG BLOCK

      const sp = new URLSearchParams(decoded);

      try {
        const u = sp.get('user');
        if (u && u.includes('\\/')) {
          sp.set('user', u.replace(/\\\//g, '/'));
          console.log('[tma-debug][user-normalized]', { hadEscapedSlashes: true });
        } else {
          console.log('[tma-debug][user-normalized]', { hadEscapedSlashes: false });
        }
      } catch {}

      const provided = sp.get('hash') || '';

      const keys = [];
      for (const [k] of sp.entries()) if (k !== 'hash' && k !== 'signature') keys.push(k);
      keys.sort((a,b)=>a.localeCompare(b));

      const dcsA = keys.map(k => `${k}=${sp.get(k) ?? ''}`).join('\n');
      const dcsAHead = dcsA.slice(0, 160);

      // RAW canonicalization (B)
      const pairs = decoded.split('&');
      const kept = [];
      for (const p of pairs) {
        const i = p.indexOf('=');
        const k = i === -1 ? p : p.slice(0, i);
        if (k === 'hash' || k === 'signature') continue;
        kept.push({ k, raw: p });
      }
      kept.sort((a,b)=>a.k.localeCompare(b.k));
      const dcsB = kept.map(x=>x.raw).join('\n');
      const dcsBHead = dcsB.slice(0, 160);

      const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
      const secret = token ? crypto.createHash('sha256').update(token, 'utf8').digest() : Buffer.alloc(32,0);
      const expectedA = crypto.createHmac('sha256', secret).update(dcsA, 'utf8').digest('hex');
      const expectedB = crypto.createHmac('sha256', secret).update(dcsB, 'utf8').digest('hex');
      const tokenFp = token ? crypto.createHash('sha256').update(token, 'utf8').digest('hex').slice(0,8) : '(none)';

      console.log('[whoami][verify]', {
        tokenFp,
        providedPrefix: provided.slice(0,12),
        expectedAPrefix: expectedA.slice(0,12),
        expectedBPrefix: expectedB.slice(0,12),
        okA: Boolean(provided && expectedA && expectedA === provided),
        okB: Boolean(provided && expectedB && expectedB === provided),
        keys,
        keptKeys: kept.map(x=>x.k),
        dcsALen: dcsA.length,
        dcsBLen: dcsB.length,
      });

      try {
        const authHeaderRaw = req.headers?.authorization || '';
        console.log('[tma-debug][authHeader.raw.head]', String(authHeaderRaw).slice(0, 160));
        console.log('[tma-debug][dcsA.head]', dcsAHead);
        console.log('[tma-debug][dcsB.head]', dcsBHead);
        console.log('[tma-debug][hashes]', {
          providedPrefix: provided.slice(0,12),
          expectedAPrefix: expectedA.slice(0,12),
          expectedBPrefix: expectedB.slice(0,12),
        });
      } catch (e) {
        console.log('[tma-debug][error]', String(e && e.message || e));
      }
    } catch (e) {
      console.log('[whoami][verify] debug error', String(e && e.message || e));
    }
  }
  const { withTMA } = await import('./_lib/tma.mjs');
  const inner = async (_req, _res) => {
    // CORS preflight fast-path
    if (_req.method === 'OPTIONS') {
      try {
        _res.setHeader('Access-Control-Allow-Origin', '*');
        _res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        _res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Cron-Key, x-cron-key, X-Telegram-InitData, X-Debug-RID');
      } catch {}
      return _res.status(204).end();
    }

    // Allow both GET and POST for easier diagnostics
    if (_req.method !== 'POST' && _req.method !== 'GET') {
      return _res.status(405).json({ ok:false, error:'method_not_allowed' });
    }

    try {
      _res.setHeader('Access-Control-Allow-Origin', '*');
    } catch {}

    const { user, userId, isAdmin, tag } = _req.tma || {};
    return _res.status(200).json({
      ok: !!(_req.tma && _req.tma.ok),
      userId,
      isAdmin: !!isAdmin,
      user: user || null,
      tag: 'whoami',
      verifyTag: tag || null,
      method: _req.method
    });
  };
  return withTMA(inner)(req, res);
}

