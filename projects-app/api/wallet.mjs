export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import verifyInitData from './_lib/telegramVerify.mjs';
import { Buffer } from 'node:buffer';

function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, x-admin-token');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Type')}
function j(res,code,obj){res.status(code).setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(obj))}
function ok(res,d){return j(res,200,{ok:true,...d})}
function bad(res,r,extra){return j(res,400,{ok:false,reason:r,...(extra||{})})}
function err(res,r,extra){return j(res,500,{ok:false,reason:r,...(extra||{})})}
function rid(){return Math.random().toString(36).slice(2,10)}
async function readJSON(req){if(typeof req.json==='function'){try{return await req.json()}catch(e){}}try{const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString('utf8');return raw?JSON.parse(raw):{}}catch(e){return null}}

function supa(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)}

async function getBalance(sb,userId){
  const { data, error } = await sb.from('wallets').select('balance').eq('user_id',userId).maybeSingle()
  if (error) return { error }
  return { balance: Number(data?.balance ?? 0) }
}

async function ensureWallet(sb,userId){
  const { data, error } = await sb.from('wallets').upsert({ user_id:userId, balance:0 },{ onConflict:'user_id' }).select('user_id,balance').maybeSingle()
  return { data, error }
}

export default async function handler(req,res){
  cors(res)
  if(req.method==='OPTIONS') return res.status(200).end()
  if(req.method!=='POST') return bad(res,'method_not_allowed')

  const sb = supa()
  const body = await readJSON(req)
  if(!body || typeof body!=='object') return bad(res,'invalid_json')

  const adminToken = String(req.headers['x-admin-token']||'').trim()
  const isAdminToken = adminToken && adminToken === process.env.ADMIN_TOKEN

  if(isAdminToken){
    const action = String(body.action||'').trim()
    if(action==='deposit'){
      const userId = String(body.userId||'').trim()
      const amount = Number(body.amount)
      const method = String(body.method||'').slice(0,50)
      const ref = String(body.ref||'').slice(0,64)
      const note = String(body.note||'').slice(0,200)
      if(!userId) return bad(res,'missing_userId')
      if(!Number.isFinite(amount) || amount<=0) return bad(res,'invalid_amount')
      if(!method) return bad(res,'missing_method')
      const w0 = await ensureWallet(sb,userId)
      if(w0.error) return err(res,'wallet_upsert_failed',{message:String(w0.error.message||w0.error)})
      const bal0 = Number(w0.data?.balance??0)
      const dep = await sb.from('deposit_requests').insert({ user_id:userId, amount, method, ref, note, status:'pending' }).select('id').maybeSingle()
      if(dep.error) return err(res,'deposit_request_insert_failed',{message:String(dep.error.message||dep.error)})
      const tx = await sb.from('wallet_txns').insert({ user_id:userId, type:'deposit_pending', amount, balance_after:bal0, note:`deposit request #${dep.data.id}${method?` via ${method}`:''}${ref?` ref:${ref}`:''}` })
      if(tx.error) return err(res,'txn_insert_failed',{message:String(tx.error.message||tx.error), requestId:dep.data.id, status:'pending'})
      return ok(res,{rid:rid(), requestId:dep.data.id, status:'pending'})
    }
    if(action==='withdraw'){
      const userId = String(body.userId||'').trim()
      const amount = Number(body.amount)
      const destination = String(body.destination||'').slice(0,120)
      const note = String(body.note||'').slice(0,200)
      if(!userId) return bad(res,'missing_userId')
      if(!Number.isFinite(amount) || amount<=0) return bad(res,'invalid_amount')
      if(!destination) return bad(res,'missing_destination')
      const balRes = await getBalance(sb,userId)
      if(balRes.error) return err(res,'wallet_fetch_failed',{message:String(balRes.error.message||balRes.error)})
      const bal0 = balRes.balance
      if(bal0 < amount) return bad(res,'insufficient_balance',{balance:bal0})
      const wr = await sb.from('withdraw_requests').insert({ user_id:userId, amount, destination, note, status:'pending' }).select('id').maybeSingle()
      if(wr.error) return err(res,'withdraw_request_insert_failed',{message:String(wr.error.message||wr.error)})
      const masked = destination.length>8 ? destination.slice(0,4)+'…'+destination.slice(-4) : destination
      const tx = await sb.from('wallet_txns').insert({ user_id:userId, type:'withdraw_pending', amount, balance_after:bal0, note:`withdraw request #${wr.data.id} to ${masked}` })
      if(tx.error) return err(res,'txn_insert_failed',{message:String(tx.error.message||tx.error), requestId:wr.data.id, status:'pending'})
      return ok(res,{rid:rid(), requestId:wr.data.id, status:'pending'})
    }
    if(action==='credit' || action==='debit'){
      const userId = String(body.userId||'').trim()
      const delta = Number(body.delta)
      const note = String(body.note||'').slice(0,200)
      if(!userId) return bad(res,'missing_userId')
      if(!Number.isFinite(delta)) return bad(res,'invalid_delta')
      const wSel = await sb.from('wallets').select('balance').eq('user_id',userId).maybeSingle()
      if(wSel.error) return err(res,'wallet_fetch_failed',{message:String(wSel.error.message||wSel.error)})
      const oldBal = Number(wSel.data?.balance??0)
      const newBal = oldBal + delta
      if(newBal < 0) return bad(res,'insufficient_balance',{balance:oldBal})
      const wUpd = await sb.from('wallets').upsert({ user_id:userId, balance:newBal },{ onConflict:'user_id' }).select('user_id,balance').maybeSingle()
      if(wUpd.error) return err(res,'wallet_update_failed',{message:String(wUpd.error.message||wUpd.error)})
      const txType = delta>=0 ? 'credit' : 'debit'
      const txIns = await sb.from('wallet_txns').insert({ user_id:userId, type:txType, amount:Math.abs(delta), balance_after:newBal, note })
      if(txIns.error) return err(res,'txn_insert_failed',{message:String(txIns.error.message||txIns.error)})
      return ok(res,{rid:rid(), userId, balance:newBal})
    }
    return bad(res,'unknown_action')
  }

  const auth = String(req.headers.authorization||'')
  if(!auth.startsWith('tma ')) return bad(res,'missing_tma')
  const initData = auth.slice(4)
  const v = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN)
  if(!v?.ok) return bad(res,'invalid_tma')
  const userId = String(v.userId)
  const action = String(body.action||'').trim()

  if(action==='deposit'){
    const amount = Number(body.amount)
    const method = String(body.method||'').slice(0,50)
    const ref = String(body.ref||'').slice(0,64)
    const note = String(body.note||'').slice(0,200)
    if(!Number.isFinite(amount) || amount<=0) return bad(res,'invalid_amount')
    if(!method) return bad(res,'missing_method')
    const w0 = await ensureWallet(sb,userId)
    if(w0.error) return err(res,'wallet_upsert_failed',{message:String(w0.error.message||w0.error)})
    const bal0 = Number(w0.data?.balance??0)
    const dep = await sb.from('deposit_requests').insert({ user_id:userId, amount, method, ref, note, status:'pending' }).select('id').maybeSingle()
    if(dep.error) return err(res,'deposit_request_insert_failed',{message:String(dep.error.message||dep.error)})
    const tx = await sb.from('wallet_txns').insert({ user_id:userId, type:'deposit_pending', amount, balance_after:bal0, note:`deposit request #${dep.data.id}${method?` via ${method}`:''}${ref?` ref:${ref}`:''}` })
    if(tx.error) return err(res,'txn_insert_failed',{message:String(tx.error.message||tx.error), requestId:dep.data.id, status:'pending'})
    return ok(res,{rid:rid(), requestId:dep.data.id, status:'pending'})
  }

  if(action==='withdraw'){
    const amount = Number(body.amount)
    const destination = String(body.destination||'').slice(0,120)
    const note = String(body.note||'').slice(0,200)
    if(!Number.isFinite(amount) || amount<=0) return bad(res,'invalid_amount')
    if(!destination) return bad(res,'missing_destination')
    const balRes = await getBalance(sb,userId)
    if(balRes.error) return err(res,'wallet_fetch_failed',{message:String(balRes.error.message||balRes.error)})
    const bal0 = balRes.balance
    if(bal0 < amount) return bad(res,'insufficient_balance',{balance:bal0})
    const wr = await sb.from('withdraw_requests').insert({ user_id:userId, amount, destination, note, status:'pending' }).select('id').maybeSingle()
    if(wr.error) return err(res,'withdraw_request_insert_failed',{message:String(wr.error.message||wr.error)})
    const masked = destination.length>8 ? destination.slice(0,4)+'…'+destination.slice(-4) : destination
    const tx = await sb.from('wallet_txns').insert({ user_id:userId, type:'withdraw_pending', amount, balance_after:bal0, note:`withdraw request #${wr.data.id} to ${masked}` })
    if(tx.error) return err(res,'txn_insert_failed',{message:String(tx.error.message||tx.error), requestId:wr.data.id, status:'pending'})
    return ok(res,{rid:rid(), requestId:wr.data.id, status:'pending'})
  }

  return bad(res,'unknown_action')
}
