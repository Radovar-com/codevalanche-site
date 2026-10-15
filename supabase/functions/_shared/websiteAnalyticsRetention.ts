import {analyticsRpc,AnalyticsError} from './websiteAnalyticsIngestion.ts';
/** Server scheduler entrypoint; never callable by an anonymous role. T12 schedules it. */
export async function runWebsiteAnalyticsRetention(service:any,now=new Date().toISOString()){
 if(!Number.isFinite(Date.parse(now)))throw new AnalyticsError('invalid_fields');
 return analyticsRpc(service,'wa_prune_website_analytics',{p_now:now});
}
