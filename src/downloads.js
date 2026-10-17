import {downloadLinks} from '../supabase/functions/_shared/downloadManifest.js';
import {renderReleaseActions} from './release-actions.js';
// Core download links initialize independently of the optional analytics SDK.
window.CODEVALANCHE_DOWNLOAD_LINKS=downloadLinks(window.CODEVALANCHE_RELEASE_MANIFEST);
const render=()=>renderReleaseActions(document,window.CODEVALANCHE_RELEASE_MANIFEST,navigator,(text,variables={})=>window.CodevalancheLocale?.translate(text,variables)??text.replace(/\{(\w+)\}/g,(_,name)=>variables[name]??`{${name}}`));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
else render();
window.addEventListener('codevalanche-locale-ready',()=>{if(document.readyState!=='loading')render();});
