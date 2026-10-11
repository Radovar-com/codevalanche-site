import {AccountError,uuid} from './accountContract.ts';
import {operationRpc} from './operationJobs.ts';
const phases=new Set(['queued','purging','authentication','remote-access','failed']);
export async function readSelfErasureStatus(principal:any,policy:any,state:any,service:any){
 if(!state?.deletion_scheduled_for)return null;
 // Legacy metadata has no linked job: do not manufacture progress or completion.
 if(!state.erasure_job_id)return {scheduledFor:state.deletion_scheduled_for,status:'pending',phase:'unknown',canCancel:null};
 if(typeof state.erasure_job_id!=='string'||!uuid.test(state.erasure_job_id))throw new AccountError('account_service_unavailable',503);
 const row=await operationRpc(service,'codevalanche_self_erasure_status',{p_user_id:principal.userId,p_session_id:principal.sessionId,p_policy_version:policy.policyVersion});
 if(!row||row.job_id!==state.erasure_job_id||!['queued','purging','failed'].includes(row.state)||!phases.has(row.phase)
  ||typeof row.can_cancel!=='boolean'||(row.can_cancel&&(row.state!=='queued'||row.phase!=='queued'))
  ||!Number.isFinite(Date.parse(String(row.due_at)))||Date.parse(String(row.due_at))!==Date.parse(state.deletion_scheduled_for))throw new AccountError('account_service_unavailable',503);
 return {scheduledFor:new Date(row.due_at).toISOString(),status:'pending',jobId:row.job_id,phase:row.phase,canCancel:row.can_cancel};
}
