// Shared normalization, bundled into the first-party SDK. Only server-owned
// download-manifest.json is authority at the gateway/collector.
export const downloadId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)&&!/(?:access|refresh)[_-]?token|service[_-]?key/i.test(value);
export function qualifiedAssets(manifest){
 if(manifest?.version!==1||!Array.isArray(manifest.assets)||!Array.isArray(manifest.allowedOrigins))return [];
 const assets=manifest.assets.filter(asset=>{
  if(asset?.qualified!==true||!['codevalanche','radovar'].includes(asset.siteId)||!['windows','mac-arm','mac-intel','linux'].includes(asset.platform)||!['x64','arm64','x86','universal','unknown'].includes(asset.architecture)||!downloadId(asset.releaseId)||!downloadId(asset.artifactId)||asset.releaseId==='unknown'||asset.artifactId==='unknown')return false;
  try{const url=new URL(asset.targetUrl);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&manifest.allowedOrigins.includes(url.origin);}catch{return false;}
 });
 // Ambiguous routes fail closed rather than depending on array order.
 return assets.filter(a=>assets.filter(b=>a.siteId===b.siteId&&a.platform===b.platform&&a.releaseId===b.releaseId&&a.artifactId===b.artifactId).length===1);
}
export function downloadRegistry(manifest){const assets=qualifiedAssets(manifest);return {release:['unknown',...new Set(assets.map(a=>a.releaseId))],artifact:['unknown',...new Set(assets.map(a=>a.artifactId))]};}
export function downloadLinks(manifest,siteId='codevalanche'){
 let base;try{base=new URL(manifest.gatewayBaseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/download-redirect/v1'))return {};}catch{return {};}
 const assets=qualifiedAssets(manifest).filter(a=>a.siteId===siteId),links={};
 for(const a of assets){if(assets.filter(b=>a.platform===b.platform).length!==1)continue;links[a.platform]={href:`${base.href}/${a.siteId}/${a.platform}/${a.releaseId}/${a.artifactId}`,releaseId:a.releaseId,artifactId:a.artifactId,architecture:a.architecture};}
 return links;
}
