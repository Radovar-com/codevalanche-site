import {qualifiedAssets,trustedDownloadManifest} from './downloadManifest.ts';
export type DownloadRequestEvidence={requestId:string;eventName:'download_redirected'|'download_request_failed';responseClass:'3xx'|'4xx';normalizedError:'unavailable'|null;siteId:string;platform:string;architecture:string;releaseId:string;artifactId:string;observedAt:string};
export function createDownloadEvidenceStore(service:any){return async(e:DownloadRequestEvidence)=>{
 const {data,error}=await service.rpc('wa_record_download_request',{p_request_id:e.requestId,p_event_name:e.eventName,p_site_id:e.siteId,p_platform:e.platform,p_architecture:e.architecture,p_release_id:e.releaseId,p_artifact_id:e.artifactId,p_observed_at:e.observedAt});
 if(error)throw new Error('source_unavailable');return data;
};}
export function downloadCoverage({manifest=trustedDownloadManifest,providerConfigured=false,providerAvailable=true,nativeQualified=false,nativeAvailable=true,deliveryQualified=false,deliveryAvailable=true}={}){
 return {redirects:qualifiedAssets(manifest).length?'measured':'not_configured',releaseProvider:providerConfigured?(providerAvailable?'measured':'unavailable'):'not_configured',transferServed:deliveryQualified?(deliveryAvailable?'measured':'unavailable'):'not_configured',firstObservedOpens:nativeQualified?(nativeAvailable?'measured':'unavailable'):'not_configured',activations:nativeQualified?(nativeAvailable?'measured':'unavailable'):'not_configured',guestActivation:'unmeasured'};
}
