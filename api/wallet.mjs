import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { verifyTma } from './_lib/telegramVerify.mjs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const DEFAULT_SLIP_MAX_BYTES = 5 * 1024 * 1024;

function sanitizePathSegment(value, fallback = 'user') {
  const cleaned = String(value || '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function inferSlipExtension(slip = {}) {
  const name = typeof slip.name === 'string' ? slip.name.toLowerCase() : '';
  const type = typeof slip.type === 'string' ? slip.type.toLowerCase() : '';
  const fromName = name.match(/\.([a-z0-9]{1,8})$/i);
  if (fromName) return fromName[1].toLowerCase();
  if (type.startsWith('image/')) {
    const subtype = type.split('/')[1] || '';
    if (subtype) return subtype.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'img';
  }
  if (type === 'application/pdf') return 'pdf';
  return 'bin';
}

async function ensureStorageBucket(supabase, bucket) {
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (data) return { ok: true, data };
  if (error) {
    const message = String(error.message || '');
    if (/not exist|not found/i.test(message)) {
      const { error: createErr } = await supabase.storage.createBucket(bucket, { public: false });
      if (createErr && !/already exists/i.test(String(createErr.message || ''))) {
        return { ok: false, error: createErr };
      }
      return { ok: true, data: { name: bucket } };
    }
    return { ok: false, error };
  }
  return { ok: true, data: { name: bucket } };
}

async function uploadDepositSlip({ supabase, userId, slip, maxBytes, bucket }) {
  if (!slip || !slip.data) return { data: null };
  let base64 = String(slip.data || '').trim();
  if (!base64) {
    const err = new Error('empty_slip_payload');
    err.code = 'empty_slip_payload';
    return { error: err };
  }
  base64 = base64.replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (error) {
    const err = new Error('invalid_slip_base64');
    err.code = 'invalid_slip_base64';
    err.details = error;
    return { error: err };
  }
  if (!buffer || !buffer.length) {
    const err = new Error('empty_slip_buffer');
    err.code = 'empty_slip_buffer';
    return { error: err };
  }
  if (buffer.length > maxBytes) {
    const err = new Error('slip_too_large');
    err.code = 'slip_too_large';
    err.maxBytes = maxBytes;
    return { error: err };
  }

  const safeUser = sanitizePathSegment(userId);
  const datePrefix = new Date().toISOString().slice(0, 10);
  const extension = inferSlipExtension(slip);
  const objectPath = `${safeUser}/${datePrefix}/${randomUUID()}.${extension}`;

  const bucketCheck = await ensureStorageBucket(supabase, bucket);
  if (!bucketCheck.ok) {
    const err = bucketCheck.error || new Error('bucket_unavailable');
    err.code = err.code || 'bucket_unavailable';
    return { error: err };
  }

  const upload = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, {
      contentType: slip.type || 'application/octet-stream',
      upsert: false,
    });
  if (upload.error) {
    const err = new Error(upload.error.message || 'slip_upload_failed');
    err.code = upload.error.code || 'slip_upload_failed';
    err.details = upload.error;
    return { error: err };
  }

  return {
    data: {
      bucket,
      objectPath,
      size: buffer.length,
    },
  };
}

function pickInitData(req) {
  const hAuth = req.headers['authorization'] || '';
  const hInit = req.headers['x-telegram-initdata'] || req.headers['x-telegram-init-data'] || '';
  const qInit = (req.query && (req.query.initData || req.query.initdata)) || '';
  const b = req.body || {};
  const bInit = typeof b === 'string' ? b : (b.initData || b.initdata || '');
  return hAuth || hInit || qInit || bInit || '';
}

function num(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const initDataRaw = pickInitData(req);
  const tma = verifyTma(initDataRaw);
  if (!tma.ok) {
    return res.status(401).json({ ok: false, error: 'invalid_init_data', reason: tma.reason || null, tag: 'wallet/verify' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const action = body?.action || '';
  const amount = num(body?.amount);
  const method = body?.method || 'bank';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';

  // Allow legacy/beta clients to call `/api/wallet` with `action: "bet_totals"` without hitting amount guard
  if (action === 'bet_totals') {
    return res.status(200).json({ ok: true, tag: 'wallet/bet_totals-noop' });
  }

  if (!(amount > 0)) {
    return res.status(400).json({ ok: false, error: 'invalid_amount', tag: 'wallet/validate' });
  }
  if (action !== 'deposit' && action !== 'withdraw') {
    return res.status(400).json({ ok: false, error: 'invalid_action', tag: 'wallet/validate' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured_supabase', tag: 'wallet/env' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const userId = String(tma.userId || '').trim();
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'missing_user_id', tag: 'wallet/validate' });
  }

  try {
    let balance = 0;

    const { data: found, error: selErr } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!found) {
      const { data: created, error: insWalletErr } = await supabase
        .from('wallets')
        .insert([{ user_id: userId, balance: 0 }])
        .select('balance')
        .single();
      if (insWalletErr) throw insWalletErr;
      balance = Number(created.balance ?? 0);
    } else {
      balance = Number(found.balance ?? 0);
    }

    if (action === 'deposit') {
      const slipInput = body?.slip || null;
      const envMax = Number(process.env.DEPOSIT_SLIP_MAX_BYTES);
      const maxSlipBytes = Number.isFinite(envMax) && envMax > 0 ? envMax : DEFAULT_SLIP_MAX_BYTES;
      const slipBucket = process.env.SUPABASE_DEPOSIT_BUCKET || 'deposit_slips';

      let uploadedSlip = null;
      if (slipInput) {
        const uploaded = await uploadDepositSlip({
          supabase,
          userId,
          slip: slipInput,
          maxBytes: maxSlipBytes,
          bucket: slipBucket,
        });
        if (uploaded.error) {
          const code = uploaded.error.code || 'slip_upload_failed';
          if (code === 'slip_too_large') {
            return res.status(413).json({ ok: false, error: code, maxBytes: uploaded.error.maxBytes, tag: 'wallet/deposit-slip' });
          }
          if (code === 'invalid_slip_base64' || code === 'empty_slip_payload' || code === 'empty_slip_buffer') {
            return res.status(400).json({ ok: false, error: code, tag: 'wallet/deposit-slip' });
          }
          console.error('wallet.deposit slip upload error', uploaded.error);
          return res.status(500).json({
            ok: false,
            error: 'slip_upload_failed',
            reason: uploaded.error.message || String(uploaded.error),
            tag: 'wallet/deposit-slip',
          });
        }
        uploadedSlip = uploaded.data;
      }

      const baseNote = note || null;
      const depositRef = (typeof body?.ref === 'string' && body.ref.trim())
        ? body.ref.trim().slice(0, 120)
        : `DEP-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 1e6)
            .toString(36)
            .toUpperCase()}`;

      const insertPayload = {
        user_id: userId,
        amount,
        method,
        status: 'pending',
        ref: depositRef,
        note: baseNote,
      };

      const insert = await supabase
        .from('deposit_requests')
        .insert([insertPayload])
        .select('*')
        .maybeSingle();
      if (insert.error || !insert.data) {
        console.error('wallet.deposit insert_failed', insert.error);
        return res.status(500).json({
          ok: false,
          error: 'deposit_request_failed',
          reason: insert.error?.message || null,
          tag: 'wallet/deposit-insert',
        });
      }

      let record = insert.data;
      const slipNote = uploadedSlip ? `Slip stored at ${uploadedSlip.bucket}/${uploadedSlip.objectPath}` : '';
      let slipMetadataPersisted = !slipNote;
      if (uploadedSlip || slipNote) {
        const updatePayload = {};
        if (slipNote) {
          const combined = baseNote ? `${baseNote}\n${slipNote}` : slipNote;
          updatePayload.note = combined;
        }
        if (uploadedSlip?.objectPath) {
          updatePayload.slip_path = `${uploadedSlip.bucket}/${uploadedSlip.objectPath}`;
        }
        if (Object.keys(updatePayload).length > 0) {
          const upd = await supabase
            .from('deposit_requests')
            .update(updatePayload)
            .eq('id', record.id)
            .select('*')
            .maybeSingle();
          if (!upd.error && upd.data) {
            record = upd.data;
            slipMetadataPersisted = true;
          } else if (upd.error) {
            console.warn('wallet.deposit slip metadata update failed', upd.error);
            if (slipNote && updatePayload.note) {
              const fallback = await supabase
                .from('deposit_requests')
                .update({ note: updatePayload.note })
                .eq('id', record.id)
                .select('*')
                .maybeSingle();
              if (!fallback.error && fallback.data) {
                record = fallback.data;
                slipMetadataPersisted = true;
              } else if (fallback.error) {
                console.warn('wallet.deposit slip note fallback failed', fallback.error);
              }
            }
          }
        }
      }

      if (!slipMetadataPersisted) {
        console.error('wallet.deposit failed to persist slip metadata');
        try {
          await supabase.from('deposit_requests').delete().eq('id', record.id);
        } catch (cleanupErr) {
          console.warn('wallet.deposit cleanup delete failed', cleanupErr);
        }
        if (uploadedSlip?.objectPath) {
          try {
            await supabase.storage.from(uploadedSlip.bucket).remove([uploadedSlip.objectPath]);
          } catch (removeErr) {
            console.warn('wallet.deposit slip cleanup failed', removeErr);
          }
        }
        return res.status(500).json({
          ok: false,
          error: 'slip_metadata_failed',
          tag: 'wallet/deposit-slip',
        });
      }

      return res.status(200).json({
        ok: true,
        accepted: true,
        userId,
        amount,
        method,
        balance,
        requestId: record?.id || null,
        status: record?.status || 'pending',
        ref: record?.ref || depositRef,
        note: record?.note || baseNote,
        slipPath: uploadedSlip ? `${uploadedSlip.bucket}/${uploadedSlip.objectPath}` : null,
        tag: 'wallet/deposit-requested',
      });
    } else if (action === 'withdraw') {
      if (balance < amount) {
        return res.status(400).json({ ok: false, error: 'insufficient_balance', balance, tag: 'wallet/withdraw' });
      }
      const newBalance = balance - amount;

      const { data: txn, error: insTxnErr } = await supabase
        .from('wallet_txns')
        .insert([
          {
            user_id: userId,
            type: 'debit',
            amount,
            note: note || null,
            balance_before: balance,
            balance_after: newBalance
          }
        ])
        .select('id,created_at')
        .single();
      if (insTxnErr) throw insTxnErr;

      const { error: updErr } = await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', userId);
      if (updErr) throw updErr;

      return res.status(200).json({
        ok: true,
        accepted: true,
        userId,
        amount,
        method,
        note: note || null,
        balance: newBalance,
        txnId: txn?.id ?? null,
        tag: 'wallet/withdraw-ok'
      });
    }
  } catch (err) {
    const msg = (err && (err.message || err.msg)) || String(err);
    return res.status(500).json({ ok: false, error: 'wallet_operation_failed', reason: msg, tag: 'wallet/exception' });
  }
}

