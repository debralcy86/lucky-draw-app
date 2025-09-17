// projects/api/handlers/health.mjs
import { createClient } from '@supabase/supabase-js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function health(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    const bot = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

    const summary = {
      SUPABASE_URL: Boolean(url),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_KEY: Boolean(process.env.SUPABASE_KEY),
      TELEGRAM_BOT_TOKEN: Boolean(bot),
    };

    if (!url || !key) {
      return send(res, 500, { ok: false, rid, error: 'Missing Supabase envs', env: summary });
    }

    const client = createClient(url, key, { auth: { persistSession: false } });
    let supabase = 'connected';
    try {
      const { error } = await client.from('profiles').select('user_id').limit(1);
      if (error) throw error;
    } catch (inner) {
      supabase = `error: ${inner?.message || inner}`;
    }

    return send(res, supabase === 'connected' ? 200 : 500, {
      ok: supabase === 'connected',
      rid,
      env: summary,
      supabase,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('health_check_error', { rid, error: err?.message || err });
    return send(res, 500, { ok: false, rid, error: 'Health check failed' });
  }
}
