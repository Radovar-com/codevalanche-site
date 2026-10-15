import {AccountError,uuid} from './accountContract.ts';
import {operationRpc} from './operationJobs.ts';

/** Canonical owned profile + operational outcome commit together. Optional
 * capture never gates this transaction. Profile values stay out of outcomes. */
export async function persistProfileWithOutcome({principal,validatedChanges,requestId,consentGeneration}:any,service:any){
 if(!uuid.test(principal?.userId??'')||!validatedChanges||!Object.keys(validatedChanges).length||Object.entries(validatedChanges).some(([k,v])=>!['display_name','bio'].includes(k)||typeof v!=='string'||v.length>(k==='bio'?500:80)))throw new AccountError('invalid_fields',400);
 const correlatedId=typeof requestId==='string'&&uuid.test(requestId)?requestId:null;
 try{
  const row=await operationRpc(service,'codevalanche_persist_profile_outcome',{p_user_id:principal.userId,p_changes:validatedChanges,p_request_id:correlatedId});
  if(row?.ok!==true)throw new AccountError('account_service_unavailable',503);
  return {ok:true};
 }catch(error){
  // A failed attempt is a separate best-effort operational record. Never claim
  // success from this producer, and never retain request/profile/error text.
  await operationRpc(service,'codevalanche_profile_failure',{p_user_id:principal.userId,p_request_id:correlatedId,p_code:'persistence_unavailable'}).catch(()=>undefined);
  throw error;
 }
}

export async function readOwnedProfile(service:any,user:any){
 const row=await operationRpc(service,'codevalanche_profile_read',{p_user_id:user.id});
 if(!row||typeof row.display_name!=='string'||typeof row.bio!=='string')throw new AccountError('account_service_unavailable',503);
 return row;
}
