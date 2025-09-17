// Shared Supabase client factory for Vercel Functions
// Usage (in a function):
//   import { getSupabaseAdmin } from './_lib/supabaseClient.mjs';
//   const supabase = getSupabaseAdmin();

import { createClient } from '@supabase/supabase-js';

function getEnv(name, { required = true } = {}) {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

let adminClient = null;
export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY'); // server-only key
  // Debug logs (as requested)
  console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
  console.log("SUPABASE_SERVICE_ROLE_KEY exists? =", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

let anonClient = null;
export function getSupabaseAnon() {
  if (anonClient) return anonClient;
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY', { required: false }) || '';
  // Debug: log environment wiring (never log full secrets)
  try {
    console.log('[supabase][anon] SUPABASE_URL:', url);
    console.log('[supabase][anon] ANON_KEY set:', Boolean(key), 'len:', key ? String(key).length : 0);
  } catch (_) { /* noop */ }
  anonClient = createClient(url, key, { auth: { persistSession: false } });
  return anonClient;
}

export function envSummary() {
  return {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
  };
}

