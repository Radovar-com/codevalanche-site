import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
export const userId='11111111-1111-4111-8111-111111111111', sessionId='22222222-2222-4222-8222-222222222222';
export const issuer='https://example.supabase.co/auth/v1';
export const validClaims=()=>({sub:userId,session_id:sessionId,iss:issuer,aud:'authenticated',role:'authenticated',aal:'aal1',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]});
export function request(action,extras={},claims=validClaims(),method='POST') {
 const jwt=`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
 return new Request('https://example.test',{method,headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json',origin:'https://codevalanche.com'},...(method==='POST'?{body:JSON.stringify({action,...extras})}:{})});
}
export async function loadHandler(db) {
 const file=new URL('../functions/codevalanche-account/index.ts',import.meta.url);
 let source=await readFile(file,'utf8');const names=[],values=[];
 const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)];
 for(const match of imports) {
  const module=match[2].startsWith('npm:')?{createClient:()=>db}:await import(new URL(match[2],file));
  for(const name of match[1].split(',').map(n=>n.trim()).filter(Boolean)){names.push(name);values.push(module[name]);}
 }
 for(const match of imports)source=source.replace(match[0],'');let handler;
 new Function(...names,'Deno',stripTypeScriptTypes(source))(...values,{env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',ACCOUNT_OAUTH_CLIENT_IDS:'mobile-approved'})[key]},serve:fn=>{handler=fn}});
 return handler;
}
export function fixture() {
 const user={id:userId,email:'test@example.test',email_confirmed_at:'2026-09-08',user_metadata:{display_name:'Test'},app_metadata:{},identities:[]};
 const f={user,active:true,state:{blocked:false,status:'active',policy_version:1},writes:[]};
 f.db={auth:{getUser:async()=>({data:{user:f.user},error:null}),admin:{updateUserById:async(id,patch)=>{f.writes.push({id,patch});return {error:null}},signOut:async()=>({error:null})}},rpc:async(name)=>({data:name==='codevalanche_sessions'?(f.active?[{id:sessionId}]:[]):true,error:null}),from:table=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:f.state,error:null}),upsert:async(data)=>{f.writes.push({table,data});return {data:null,error:null}},update(data){f.writes.push({table,data});return {eq:async()=>({data:null,error:null})}}})};
 return f;
}
