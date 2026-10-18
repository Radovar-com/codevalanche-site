import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { allowedOrigin, normalizeProfile, readClaims } from './validation.mjs';
import { validateLegacyClaims, validateLegacyRequest, legacyActionRefusal } from './security.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const securityActions=new Set(['admin-list-users','admin-block-user','admin-unblock-user','admin-feedback','admin-analytics','request-deletion','cancel-deletion']);
function checked<T>(result: {data:T,error:unknown}):T { if(result.error) throw new Error('Storage operation failed'); return result.data; }
Deno.serve(async (req) => {
 const origin = req.headers.get('origin');
 const headers: Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, GET, OPTIONS'};
 if (!allowedOrigin(origin)) return new Response(JSON.stringify({error:'Origin not allowed'}),{status:403,headers});
 if(origin) headers['Access-Control-Allow-Origin']=origin;
 const requestId=crypto.randomUUID();headers['X-Request-Id']=requestId;let securityAction:string|null=null;
 const respond=(body:unknown,status=200)=>{
  // Best-effort private operational logs, not a durable administrator journal.
  // Never include the principal, token, email, target ID, query or request body.
  if(securityAction)try{console.info(JSON.stringify({event:'account_security_operation',requestId,action:securityAction,status,outcome:status>=500?'unknown':status>=400?'denied':'succeeded'}));}catch{}
  return new Response(JSON.stringify(body),{status,headers});
 };
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(!['POST','GET'].includes(req.method)) return respond({error:'Method not allowed'},405);
 try {
  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token || token.length>12000) return respond({error:'Authentication required'},401);
  const {data:{user},error} = await service.auth.getUser(token);
  if(error || !user) return respond({error:'Invalid authentication'},401);
  let claims;try{claims=readClaims(token);}catch{return respond({error:'Invalid session'},401);}
  if(!validateLegacyClaims(claims,user.id,`${url.replace(/\/$/,'')}/auth/v1`)) return respond({error:'Invalid session'},401);
  const sessions=checked(await service.rpc('codevalanche_sessions',{p_user_id:user.id})) as any[];
  if(!sessions.some(s=>s.id===claims.session_id)) return respond({error:'Session revoked'},401);
  const state=checked(await service.from('codevalanche_account_state').select('*').eq('user_id',user.id).maybeSingle());
  if(state?.blocked || ((user as typeof user & {banned_until?:string}).banned_until && new Date((user as typeof user & {banned_until?:string}).banned_until || 0)>new Date())) return respond({error:'Account blocked'},403);
  if(!checked(await service.rpc('codevalanche_rate_limit',{p_bucket:`account:${user.id}`,p_limit:60}))) return respond({error:'Too many requests'},429);
  let body:any={action:'get-account'};
  if(req.method==='POST') {
   if(!req.headers.get('content-type')?.startsWith('application/json')) return respond({error:'JSON required'},415);
   const reader=req.body?.getReader(); let size=0; const chunks:Uint8Array[]=[];
   if(reader) { while(true) {const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return respond({error:'Request too large'},413);} chunks.push(value);} }
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return respond({error:'Invalid JSON'},400);}
   if(!body || typeof body!=='object' || Array.isArray(body)) return respond({error:'Invalid body'},400);
  }
  securityAction=securityActions.has(body.action)?body.action:null;
  if(!validateLegacyClaims(claims,user.id,`${url.replace(/\/$/,'')}/auth/v1`))return respond({error:'Invalid session'},401);
  const invalid=validateLegacyRequest(body);if(invalid)return respond(invalid.body,invalid.status);
  const refusal=legacyActionRefusal(user,claims,body.action);if(refusal)return respond(refusal.body,refusal.status);
  const saveState=async (patch:Record<string,unknown>, targetId=user.id)=>{ checked(await service.from('codevalanche_account_state').upsert({user_id:targetId},{onConflict:'user_id',ignoreDuplicates:true})); checked(await service.from('codevalanche_account_state').update({...patch,updated_at:new Date().toISOString()}).eq('user_id',targetId)); };
  switch(body.action) {
   case 'get-account': {
    const name=user.user_metadata?.display_name || user.user_metadata?.full_name || '';
    return respond({id:user.id,userId:user.id,sub:user.id,session_id:claims.session_id,email:user.email,email_verified:!!user.email_confirmed_at,display_name:name,name,
     user:{id:user.id,email:user.email,displayName:name,bio:user.user_metadata?.bio||'',emailVerified:!!user.email_confirmed_at},
     signInMethods:(user.identities||[]).map(i=>({id:i.identity_id,provider:i.provider,createdAt:i.created_at})),
     sessions:sessions.map(s=>({id:s.id,createdAt:s.created_at,lastSeenAt:s.updated_at,userAgent:s.user_agent||'Unknown device',current:s.id===claims.session_id})),
     deletion:state?.deletion_scheduled_for?{scheduledFor:state.deletion_scheduled_for,status:'pending'}:null,
     analyticsConsent:state?.analytics_consent||false});
   }
   case 'update-profile': {
    let patch;try{patch=normalizeProfile(body);}catch{return respond({error:'Invalid profile'},400);}
    const result=await service.auth.admin.updateUserById(user.id,{user_metadata:{...user.user_metadata,...patch}});if(result.error)throw new Error('Profile update failed');return respond({ok:true});
   }
   case 'sign-out-current': case 'sign-out-others': {
    const result=await service.auth.admin.signOut(token,body.action==='sign-out-current'?'local':'others');if(result.error)throw new Error('Sign out failed');return respond({ok:true});
   }
   case 'revoke-session': {
    if(!uuid.test(body.sessionId||'') || !sessions.some(s=>s.id===body.sessionId)) return respond({error:'Session not found'},404);
    checked(await service.from('codevalanche_revoked_sessions').upsert({session_id:body.sessionId,user_id:user.id}));return respond({ok:true});
   }
   case 'request-deletion': {
    if(body.confirmation!=='DELETE')return respond({error:'Type DELETE to confirm'},400);
    const scheduledFor=state?.deletion_scheduled_for||new Date(Date.now()+30*86400000).toISOString();
    await saveState({deletion_requested_at:state?.deletion_requested_at||new Date().toISOString(),deletion_scheduled_for:scheduledFor});return respond({ok:true,deletion:{scheduledFor,status:'pending'}});
   }
   case 'cancel-deletion': await saveState({deletion_requested_at:null,deletion_scheduled_for:null});return respond({ok:true});
   case 'consent': if(typeof body.analytics!=='boolean')return respond({error:'Invalid consent'},400);await saveState({analytics_consent:body.analytics});return respond({ok:true});
   case 'feedback': {
    if(!['bug','idea','general'].includes(body.category)||typeof body.message!=='string'||!body.message.trim()||body.message.length>4000)return respond({error:'Invalid feedback'},400);
    if(!checked(await service.rpc('codevalanche_rate_limit',{p_bucket:`feedback:${user.id}`,p_limit:3})))return respond({error:'Too many requests'},429);
    checked(await service.from('codevalanche_feedback').insert({user_id:user.id,category:body.category,message:body.message.trim()}));return respond({ok:true});
   }
   case 'event': {
    if(body.consent!==true || state?.analytics_consent!==true)return respond({error:'Consent required'},403);
    if(!uuid.test(body.eventId||'')||!['website_view','download_clicked','app_opened'].includes(body.eventName)||!['web','windows','macos','linux','ios','android'].includes(body.platform))return respond({error:'Invalid event'},400);
    checked(await service.from('codevalanche_events').upsert({id:body.eventId,user_id:user.id,event_name:body.eventName,platform:body.platform},{onConflict:'id',ignoreDuplicates:true}));return respond({ok:true});
   }
   case 'admin-list-users': case 'admin-block-user': case 'admin-unblock-user': case 'admin-feedback': case 'admin-analytics': {
    if(user.app_metadata?.codevalanche_admin!==true)return respond({error:'Administrator required'},403);
    if(body.action==='admin-list-users') {const page=Number.isInteger(body.page)&&body.page>=1&&body.page<=10000?body.page:1;const result=await service.auth.admin.listUsers({page,perPage:50});if(result.error)throw new Error('User list failed');return respond({users:result.data.users.map(u=>({id:u.id,email:u.email,createdAt:u.created_at,lastSignInAt:u.last_sign_in_at,bannedUntil:(u as typeof u & {banned_until?:string}).banned_until})),page});}
    if(body.action==='admin-feedback')return respond({feedback:checked(await service.from('codevalanche_feedback').select('*').order('created_at',{ascending:false}).limit(100))});
    if(body.action==='admin-analytics')return respond({events:checked(await service.from('codevalanche_events').select('event_name,platform,created_at').order('created_at',{ascending:false}).limit(1000)),limit:1000});
    if(!uuid.test(body.userId||'') || body.userId===user.id)return respond({error:'Invalid target user'},400);
    const blocked=body.action==='admin-block-user';
    // Fence application access for both transitions. Unbanning the provider
    // must never make an old, already-issued application session usable again.
    await saveState({blocked:true},body.userId);
    const targetSessionResult=await service.rpc('codevalanche_sessions',{p_user_id:body.userId},{count:'exact'});
    const targetSessions=checked(targetSessionResult) as any[];
    // The existing RPC is subject to the provider row ceiling. Refuse a possibly
    // truncated result rather than claiming every current session was revoked.
    if(!Array.isArray(targetSessions)||!Number.isSafeInteger(targetSessionResult.count)||targetSessionResult.count!==targetSessions.length||targetSessions.some(s=>!uuid.test(s?.id||'')))throw new Error('Session revocation unavailable');
    if(targetSessions.length)checked(await service.from('codevalanche_revoked_sessions').upsert(targetSessions.map(s=>({session_id:s.id,user_id:body.userId}))));
    const result=await service.auth.admin.updateUserById(body.userId,{ban_duration:blocked?'876000h':'none'});if(result.error)throw new Error('Block update failed');
    if(!blocked)await saveState({blocked:false},body.userId);return respond({ok:true});
   }
   default: return respond({error:'Unknown action'},400);
  }
 } catch { return respond({error:'Account service unavailable'},503); }
});
