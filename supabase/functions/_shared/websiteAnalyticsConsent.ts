import { validateContractDto } from './websiteAnalyticsContract.ts';
import type { ConsentReceipt, RevocationProof, SiteId, ConfirmedAccountContext } from './websiteAnalyticsContract.ts';

export type ConsentReceiptInput = {siteId:SiteId;policyVersion:string;generation:number;purposes:{websiteAnalytics:boolean;accountAnalytics:boolean}};
/** Construct only after verifying the current P4 principal, never from a request body. */
export type ReceiptAccountProof = Pick<ConfirmedAccountContext,'confirmed'|'principalId'|'consentGeneration'>;
export type ConsentContext = {origin:string;service:{rpc:(name:string,args:Record<string,unknown>)=>Promise<any>};account?:ReceiptAccountProof;policyVersion?:string};
const origins={radovar:'https://radovar.com',codevalanche:'https://codevalanche.com'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code:string):never=>{throw new Error(code);};
export async function hashCapability(value:string):Promise<string> {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
const capability=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function rpc(context:ConsentContext,name:string,args:Record<string,unknown>) {
 const {data,error}=await context.service.rpc(name,args);
 if(error){const code=['invalid_consent','stale_generation','invalid_fields'].find(c=>error.message?.includes(c));return fail(code??'source_unavailable');}
 return Array.isArray(data)?data[0]:data;
}
export async function issueConsentReceipt(input:ConsentReceiptInput,context:ConsentContext):Promise<ConsentReceipt> {
 if(!input||Object.keys(input).sort().join(',')!=='generation,policyVersion,purposes,siteId'||!(input.siteId in origins)||!Number.isSafeInteger(input.generation)||input.generation<1||input.generation>=Number.MAX_SAFE_INTEGER||input.policyVersion!==(context.policyVersion??'2026-10-15')||!input.purposes||Object.keys(input.purposes).sort().join(',')!=='accountAnalytics,websiteAnalytics'||typeof input.purposes.websiteAnalytics!=='boolean'||typeof input.purposes.accountAnalytics!=='boolean')return fail('invalid_fields');
 if(context.origin!==origins[input.siteId])return fail('origin_not_allowed');
 if(!input.purposes.websiteAnalytics&&!input.purposes.accountAnalytics)return fail('invalid_consent');
 const account=input.purposes.accountAnalytics?context.account:undefined;
 if(input.purposes.accountAnalytics&&(!account||account.confirmed!==true||!uuid.test(account.principalId)||!Number.isSafeInteger(account.consentGeneration)||account.consentGeneration<0))return fail('invalid_consent');
 const issuedAt=new Date(),receipt:ConsentReceipt={receiptId:crypto.randomUUID(),...input,purposes:{...input.purposes},issuedAt:issuedAt.toISOString(),expiresAt:new Date(+issuedAt+180*86400000).toISOString(),collectionToken:capability(),revocationProof:capability()};
 await rpc(context,'wa_issue_consent_receipt',{p_receipt_id:receipt.receiptId,p_site_id:receipt.siteId,p_policy_version:receipt.policyVersion,p_generation:receipt.generation,p_website_analytics:receipt.purposes.websiteAnalytics,p_account_analytics:receipt.purposes.accountAnalytics,p_issued_at:receipt.issuedAt,p_expires_at:receipt.expiresAt,p_collection_hash:await hashCapability(receipt.collectionToken),p_revocation_hash:await hashCapability(receipt.revocationProof),p_principal_id:account?.principalId??null,p_account_generation:account?.consentGeneration??null});
 return receipt;
}
export async function revokeConsentReceipt(proof:RevocationProof,context:ConsentContext):Promise<{revoked:boolean;generation:number}> {
 if(!validateContractDto('RevocationProof',proof))return fail('invalid_fields');
 const siteId=Object.entries(origins).find(([,origin])=>origin===context.origin)?.[0];
 if(!siteId)return fail('origin_not_allowed');
 const row=await rpc(context,'wa_revoke_consent_receipt',{p_receipt_id:proof.receiptId,p_generation:proof.generation,p_revocation_hash:await hashCapability(proof.capability),p_site_id:siteId});
 return {revoked:row?.revoked===true,generation:Number(row?.generation)};
}
