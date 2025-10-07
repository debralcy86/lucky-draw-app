import { createClient } from '@supabase/supabase-js';

function missing(key) {
  const err = new Error(`Missing ${key}`);
  err.code = 'config_missing';
  err.field = key;
  return err;
}

export function createServiceClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL) throw missing('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) throw missing('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function ensureWallet(client, userId) {
  const existing = await client
    .from('wallets')
    .select('user_id,balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing.error && existing.error.code !== 'PGRST116') {
    // Propagate unexpected errors
    return { error: existing.error };
  }

  if (existing.data) {
    // Normalize balance to number
    return { data: { user_id: existing.data.user_id, balance: Number(existing.data.balance ?? 0) } };
  }

  const insert = await client
    .from('wallets')
    .insert({ user_id: userId, balance: 0 })
    .select('user_id,balance')
    .maybeSingle();

  if (insert.error) {
    return { error: insert.error };
  }

  const wallet = insert.data || { user_id: userId, balance: 0 };
  wallet.balance = Number(wallet.balance ?? 0);
  return { data: wallet };
}

export async function fetchWallet(client, userId) {
  const { data, error } = await client
    .from('wallets')
    .select('user_id,balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { error };
  const wallet = data ? { ...data, balance: Number(data.balance ?? 0) } : null;
  return { data: wallet };
}

export async function listTransactions(client, userId, { limit = 20, offset = 0 } = {}) {
  const rangeStart = Math.max(0, offset);
  const rangeEnd = rangeStart + Math.max(1, limit) - 1;
  const { data, error } = await client
    .from('wallet_txns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(rangeStart, rangeEnd);
  if (error) return { error };
  const mapped = (data || []).map((row) => ({
    ...row,
    createdAt: row.created_at || row.createdAt || null,
  }));
  return { data: mapped };
}

export async function adjustWalletBalance(client, { userId, delta, note, type }) {
  const { data: walletRow, error: fetchErr } = await fetchWallet(client, userId);
  if (fetchErr) return { error: fetchErr, code: 'wallet_fetch_failed' };
  const current = Number(walletRow?.balance ?? 0);
  const next = current + delta;
  if (next < 0) {
    const err = new Error('insufficient_balance');
    err.code = 'insufficient_balance';
    return { error: err, balance: current, code: 'insufficient_balance' };
  }

  const { error: upsertErr } = await client
    .from('wallets')
    .upsert({ user_id: userId, balance: next }, { onConflict: 'user_id' });
  if (upsertErr) return { error: upsertErr, code: 'wallet_update_failed' };

  const txn = {
    user_id: userId,
    type: type || (delta >= 0 ? 'credit' : 'debit'),
    amount: Math.abs(delta),
    balance_after: next,
    note: note || null,
  };
  const { error: txnErr } = await client.from('wallet_txns').insert(txn);
  if (txnErr) return { error: txnErr, code: 'txn_insert_failed' };

  return { balance: next, txn };
}

export async function insertTransaction(client, txn) {
  return client.from('wallet_txns').insert(txn);
}
