/** Qualification is an explicit receipt-bound operation UUID, never a time,
 * email, device, or Guest-history join. Signup/login lack a qualified provider
 * nonce handoff today and remain unassigned. Successful profile joins happen
 * in SQL using the original principal and independent P4 snapshot of the A
 * receipt. Confirmed failures have no trusted original P4 snapshot and stay
 * unassigned; a later consent state must never be used to retrofit one. */
export function conversionCounts(concept:string,count:number|null,qualified:number|null){
 if(count===null)return {count:null,attributedCount:null,unattributedCount:null};
 if(concept!=='profile_update_succeeded'&&concept!=='profile_update_failed')return {count,attributedCount:0,unattributedCount:count};
 if(qualified===null||!Number.isSafeInteger(qualified)||qualified<0||qualified>count)throw new Error('source_unavailable');
 return {count,attributedCount:qualified,unattributedCount:count-qualified};
}
