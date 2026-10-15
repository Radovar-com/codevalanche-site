import {authenticateAccountContext} from './accountPrincipal.ts';
import {assertAccountOperation,policyFromState} from './accountPolicy.ts';
import {AccountError,checked} from './accountContract.ts';
import {AnalyticsError} from './websiteAnalyticsIngestion.ts';

/** Consumer session verification, never report/operator authorization. The
 * returned proof stays server-side and is rechecked under the receipt/P4 lock. */
export async function confirmWebsiteAccount(request:Request,options:any){
 try{
  const {principal,user,recovery}=await authenticateAccountContext(request,options);
  const state=checked(await options.service.from('codevalanche_account_state').select('*').eq('user_id',principal.userId).maybeSingle());
  assertAccountOperation(principal,policyFromState(state),'event.submit',{recovery});
  if(user.banned_until&&Date.parse(user.banned_until)>Date.now())throw new AnalyticsError('forbidden');
  if(state?.analytics_consent!==true||!Number.isSafeInteger(Number(state.consent_generation)))throw new AnalyticsError('invalid_consent');
  return {confirmed:true as const,principalId:principal.userId,consentGeneration:Number(state.consent_generation)};
 }catch(error){
  if(error instanceof AccountError)throw new AnalyticsError(error.status===401?'unauthenticated':error.status===503?'source_unavailable':'forbidden');
  throw error;
 }
}
