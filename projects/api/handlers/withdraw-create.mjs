// projects/api/handlers/withdraw-create.mjs
import { createClient } from '@supabase/supabase-js'
import { verifyInitData } from './telegramVerify.mjs'

function bad(res, code, obj){ res.statusCode = code; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }
function ok(res, obj){ res.statusCode = 200; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }

export async function withdrawCreate(req, res){
  const rid = Math.random().toString(36).slice(2,10)
  try {
    res.setHeader('Content-Type','application/json')
    if (req.method !== 'POST') return bad(res, 405, { ok:false, error:'Method not allowed' })

    // Parse body (support Next/Vercel or raw Node http)
    let body = {}
    try {
      if (req.body !== undefined) {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        body = raw ? JSON.parse(raw) : {}
      } else {
        const raw = await new Promise(r => { let d=''; req.on('data', c=>d+=c); req.on('end',()=>r(d)); })
        body = raw ? JSON.parse(raw) : {}
      }
    } catch {
      return bad(res, 400, { ok:false, error:'Invalid JSON' })
    }

    const auth = (req.headers?.authorization || req.headers?.Authorization || '').toString()
    const initFromHeader = auth.startsWith('tma ') ? auth.slice(4).trim() : ''
    const { initData: initFromBody, amount, note } = body
    const initData = initFromBody || initFromHeader
    if (!initData) return bad(res, 400, { ok:false, error:'Missing initData' })
    console.log(JSON.stringify({ rid, evt:'withdraw_create_start' }))

    const tg = await verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN)
    if (!tg.ok) return bad(res, 401, { ok:false, error:'Invalid Telegram initData' })
    const userId = String(tg.userId)

    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return bad(res, 400, { ok:false, error:'Invalid amount' })
    if (amt > 1000000) return bad(res, 400, { ok:false, error:'Amount too large' })

    // Supabase
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // Ensure wallet exists (auto-provision)
    const { data: w0, error: wErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (wErr) return bad(res, 500, { ok:false, error:'Wallet read failed', details:wErr.message })
    if (!w0){
      const { error: insW } = await supabase.from('wallets').upsert({ user_id:userId, balance:0 })
      if (insW) return bad(res, 500, { ok:false, error:'Wallet provision failed', details:insW.message })
    }

    // Insert request (status=pending)
    const { data: reqRow, error: rErr } = await supabase
      .from('withdraw_requests')
      .insert({ user_id: userId, amount: amt, note: note || null, status: 'pending' })
      .select()
      .single()

    if (rErr) return bad(res, 500, { ok:false, error:'Create failed', details:rErr.message })
    console.log(JSON.stringify({ rid, evt:'withdraw_create_ok', id: reqRow?.id }))
    return ok(res, { ok:true, request: { id:reqRow.id, amount:reqRow.amount, status:reqRow.status, created_at:reqRow.created_at } })
  } catch (err) {
    console.error(JSON.stringify({ rid, evt:'withdraw_create_err', msg: String(err?.message || err) }))
    return bad(res, 500, { ok:false, error:'SERVER_ERROR' })
  }
}
