export function validWebsiteEvent(overrides={}) {
  return {schema_version:1,event_id:'00000001-0000-4000-8000-000000000001',site_id:'codevalanche',event_name:'page_viewed',occurred_at:'2026-10-15T12:00:00.000Z',page_id:'home',page_instance_id:'00000002-0000-4000-8000-000000000002',page_version:'build_1',session_id:'00000003-0000-4000-8000-000000000003',anonymous_id:'00000004-0000-4000-8000-000000000004',consent_receipt_id:'00000005-0000-4000-8000-000000000005',consent_generation:1,properties:{navigation_type:'initial'},...overrides};
}
export function validConsentReceipt(overrides={}) {
  return {receiptId:'00000005-0000-4000-8000-000000000005',siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false},issuedAt:'2026-10-15T00:00:00.000Z',expiresAt:'2026-10-16T00:00:00.000Z',collectionToken:'synthetic_collection_capability_123456',revocationProof:'synthetic_revocation_capability_123456',...overrides};
}
export function reportQuery(overrides={}) {
  return {siteId:'all',from:'2026-10-15T00:00:00.000Z',to:'2026-10-16T00:00:00.000Z',timeZone:'UTC',granularity:'day',filters:{},comparison:null,...overrides};
}
export function eventContext(overrides={}) {
  return {origin:'https://codevalanche.com',receivedAt:'2026-10-15T12:00:00.000Z',receipt:validConsentReceipt(),...overrides};
}
