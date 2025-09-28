export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');}
function ok(res,d){return res.status(200).json({ok:true,...d});}
function bad(res,r){return res.status(400).json({ok:false,reason:r});}
export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='GET') return bad(res,'method_not_allowed');
  const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data,error}=await sb.from('draws').select('id,status,scheduled_at').eq('status','open').order('scheduled_at',{ascending:true});
  if(error) return res.status(500).json({ok:false,reason:'draws_query_failed',message:String(error.message||error)});
  return ok(res,{draws:data||[]});
}
