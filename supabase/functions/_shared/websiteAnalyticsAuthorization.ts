import {authenticateAccountContext} from './accountPrincipal.ts';
import {readCredentialStamp} from './credentialStamp.ts';
import {authorizeAdmin} from './adminAuthorization.ts';
import {AnalyticsError,analyticsRpc} from './websiteAnalyticsIngestion.ts';
import {operatorOAuthEvidence} from './operatorOAuthProof.ts';

/** Reuses current P3/P4 provider-token, session, membership and MFA authority. */
export async function authorizeWebsiteReport(request:Request,options:{service:any;issuer:string;clientIds?:string[];operatorClientIds?:string[]}) {
 try {
  const {principal,user,recovery,claims}=await authenticateAccountContext(request,options);
  const evidence=recovery?await operatorOAuthEvidence(options.service,principal,claims,undefined,(options.operatorClientIds??[]).filter(id=>(options.clientIds??[]).includes(id))):await readCredentialStamp(options.service,principal);
  if(!evidence.qualified)throw new AnalyticsError('source_unavailable');
  if(!evidence.sessionActive)throw new AnalyticsError('unauthenticated');
  if(evidence.recoveryOnly||evidence.currentStatus!=='active'||evidence.blocked||(user.banned_until&&Date.parse(user.banned_until)>Date.now()))throw new AnalyticsError('forbidden');
  const actor=await authorizeAdmin(principal,'admin.analytics.summary',null,{service:options.service,evidence});
  await analyticsRpc(options.service,'wa_assert_report_actor',{p_actor_id:principal.userId});
  return actor;
 }catch(error){
  if(error instanceof AnalyticsError)throw error;
  const status=(error as any)?.status;
  throw new AnalyticsError(status===401?'unauthenticated':status===403?'forbidden':'source_unavailable');
 }
}
