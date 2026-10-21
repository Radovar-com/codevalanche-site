import {downloadLinks} from '../supabase/functions/_shared/downloadManifest.js';
import {renderReleaseActions} from './release-actions.js';
import {renderDownloadLanding,startRequestedDownload} from './download-experience.js';
// Core download links initialize independently of the optional analytics SDK.
window.CODEVALANCHE_DOWNLOAD_LINKS=downloadLinks(window.CODEVALANCHE_RELEASE_MANIFEST);
const translate=(text,variables={})=>window.CodevalancheLocale?.translate(text,variables)??text.replace(/\{(\w+)\}/g,(_,name)=>variables[name]??`{${name}}`);
const visitor={userAgent:navigator.userAgent,userAgentData:navigator.userAgentData,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints};
const render=()=>{
 renderReleaseActions(document,window.CODEVALANCHE_RELEASE_MANIFEST,visitor,translate);
 renderDownloadLanding(document,window.CODEVALANCHE_RELEASE_MANIFEST,visitor,translate);
 startRequestedDownload(document,window.CODEVALANCHE_RELEASE_MANIFEST);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
else render();
window.addEventListener('codevalanche-locale-ready',()=>{if(document.readyState!=='loading')render();});
