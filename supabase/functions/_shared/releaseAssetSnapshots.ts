import {downloadId} from './downloadManifest.js';
export type ReleaseAssetSnapshot={siteId:string;source:'release_provider';releaseId:string;artifactId:string;countTotal:number;observedAt:string;sourceWatermark:string|null;assetRemoved:boolean};
function valid(s:ReleaseAssetSnapshot){return s&&['codevalanche','radovar'].includes(s.siteId)&&s.source==='release_provider'&&downloadId(s.releaseId)&&downloadId(s.artifactId)&&Number.isSafeInteger(s.countTotal)&&s.countTotal>=0&&typeof s.assetRemoved==='boolean'&&typeof s.observedAt==='string'&&/^\d{4}-\d\d-\d\dT.*Z$/.test(s.observedAt)&&Number.isFinite(Date.parse(s.observedAt))&&(s.sourceWatermark===null||typeof s.sourceWatermark==='string'&&/^\d{4}-\d\d-\d\dT.*Z$/.test(s.sourceWatermark)&&Number.isFinite(Date.parse(s.sourceWatermark))&&Date.parse(s.sourceWatermark)<=Date.parse(s.observedAt));}
export function reconcileReleaseAssetSnapshot(previous:ReleaseAssetSnapshot|null,current:ReleaseAssetSnapshot){
 if(!valid(current)||previous&&!valid(previous))throw new TypeError('invalid_fields');
 if(current.assetRemoved)return {counterStatus:'asset_removed',countDelta:null};
 if(!previous||previous.assetRemoved||['siteId','source','releaseId','artifactId'].some(k=>(previous as any)[k]!== (current as any)[k]))return {counterStatus:'baseline',countDelta:null};
 if(current.countTotal<previous.countTotal)return {counterStatus:'reset',countDelta:null};
 return {counterStatus:'measured',countDelta:current.countTotal-previous.countTotal};
}
/** Import only from a qualified trusted provider adapter, never browser input.
 * The DB RPC serializes duplicate/conflicting/out-of-order arrivals. A provider
 * counter includes its own retry/range/direct-link semantics, never completed files. */
export async function importReleaseAssetSnapshot(service:any,s:ReleaseAssetSnapshot){
 if(!valid(s))throw new TypeError('invalid_fields');
 const {data,error}=await service.rpc('wa_import_release_asset_snapshot',{p_site_id:s.siteId,p_release_id:s.releaseId,p_artifact_id:s.artifactId,p_count_total:s.countTotal,p_observed_at:s.observedAt,p_source_watermark:s.sourceWatermark,p_asset_removed:s.assetRemoved});
 if(error)throw new Error('source_unavailable');return data;
}
