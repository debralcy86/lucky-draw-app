import { withTMA } from './_lib/tma.mjs'
import { supabase } from './_lib/supabaseClient.mjs'

export const config = { runtime: 'nodejs' }

async function handler(req, res) {
  try {
    if (req.method !== 'POST')
      return res.status(405).json({ ok: false, error: 'method_not_allowed' })

    const { tma } = req
    if (!tma?.ok || !tma?.userId)
      return res.status(401).json({ ok: false, error: 'unauthorized' })

    const { amount, method, note } = req.body || {}
    if (!amount || amount <= 0)
      return res.status(400).json({ ok: false, error: 'invalid_amount' })

    // Fetch wallet
    const { data: wallet, error: werr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', tma.userId)
      .maybeSingle()

    if (werr) throw werr
    if (!wallet)
      return res.status(404).json({ ok: false, error: 'wallet_not_found' })

    if (Number(wallet.balance) < Number(amount))
      return res.status(400).json({ ok: false, error: 'insufficient_balance' })

    // Create withdraw record
    const { data: withdrawRow, error: wderror } = await supabase
      .from('withdraw_requests')
      .insert({
        user_id: tma.userId,
        amount,
        method,
        note,
        status: 'pending',
      })
      .select()
      .single()

    if (wderror) throw wderror

    // Insert wallet_txn entry
    const balance_after = Number(wallet.balance) - Number(amount)
    await supabase.from('wallet_txns').insert({
      user_id: tma.userId,
      type: 'debit',
      amount,
      balance_before: wallet.balance,
      balance_after,
      note: note || 'withdraw request',
    })

    // Update wallet balance
    await supabase.from('wallets')
      .update({ balance: balance_after })
      .eq('user_id', tma.userId)

    return res.status(200).json({
      ok: true,
      withdraw_id: withdrawRow.id,
      balance: balance_after,
      tag: 'withdraw-create/ok',
    })
  } catch (err) {
    console.error('[withdraw-create error]', err)
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      reason: String(err?.message || err),
    })
  }
}

export default withTMA(handler)
