import {createAnalyticsClient,createConsentManager,createConsentTransport} from './analytics/owned-analytics.js';
import {mountConsentUI} from './analytics/consent-ui.js';
import {resolveMarketingRoute} from './locales/manifest.js';
import {initializeLocale,localizeDocument} from './locales/runtime.js';

// One first-party client/CMP per document. Collection is a separately qualified release switch.
const config=window.CODEVALANCHE_ANALYTICS??{};
let baseUrl='';
try { const url=new URL(config.baseUrl);const local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);if(config.enabled===true&&(url.protocol==='https:'||local)&&!url.username&&!url.password&&!url.search&&!url.hash)baseUrl=url.href.replace(/\/$/,''); } catch {}
// A denied storage getter must not prevent the CMP or ordinary site controls mounting.
let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,removeItem:()=>{},setItem:()=>{throw new Error('Storage unavailable');}};}
const consentHost={localStorage:storage,document,location,crypto:window.crypto,BroadcastChannel:window.BroadcastChannel,addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)};
const consent=createConsentManager({siteId:'codevalanche',window:consentHost,transport:baseUrl?createConsentTransport({baseUrl}):{}});
const client=createAnalyticsClient({siteId:'codevalanche',downloadManifest:window.CODEVALANCHE_RELEASE_MANIFEST,baseUrl,consentManager:baseUrl?consent:{...consent,getCollectionContext:()=>null,acceptAck:()=>false},pageVersion:config.pageVersion??'owned_analytics_1'});
const manager=client.consentManager;
const path=location.pathname;
const marketingRoute=resolveMarketingRoute(path);
const pageId=path.startsWith('/account/authorize')?'account_authorize':path.startsWith('/account/')?'account':(marketingRoute?.pageId??'not_found');
const account=['account','account_authorize'].includes(pageId);
const download=document.querySelector('#download');if(download)download.dataset.releaseStatus=download.querySelector('[data-download-platform]')?'configured':'not_configured';
const page=client.startPage({pageId,surface:account?'pre_auth':'marketing'});
for(const element of document.querySelectorAll('[data-analytics-section]'))page.observeSection(element,{sectionId:element.dataset.analyticsSection});
let requestedGeneration=-1;
const setConsent=async choice=>{const operation=client.setConsent(choice);requestedGeneration=choice?.websiteAnalytics===true?manager.getState().generation:-1;renderStatus();await operation;renderStatus();};
const ui=mountConsentUI({manager:{getState:manager.getState,subscribe:manager.subscribe,setConsent}});
const status=document.createElement('p');status.dataset.ownedStatus='';status.setAttribute('role','status');document.querySelector('[data-owned-consent] .cmp-card').append(status);
const bannerStatus=status.cloneNode();document.querySelector('[data-owned-consent] .cmp-banner').append(bannerStatus);
const availability=status.cloneNode();document.querySelector('[data-owned-consent]').append(availability);
const style=document.createElement('style');style.textContent=`[data-owned-consent]{padding:1rem;max-width:100%;color:var(--ink,#171717);font-family:var(--font-sans,system-ui)}[data-owned-consent] .cmp-banner,[data-owned-consent] .cmp-card,[data-owned-consent] button{color:var(--ink,#171717);background:var(--bg-raised,#fff);border-color:var(--muted,#666)}[data-owned-consent] h2{font-size:1.25rem;line-height:1.3;margin:0 0 .75rem}[data-owned-consent] p{font-size:.875rem;line-height:1.5;overflow-wrap:anywhere}[data-owned-consent] .cmp-card{box-sizing:border-box}[data-owned-consent] .cmp-manage{margin-bottom:.5rem}`;document.querySelector('[data-owned-consent]').append(style);
const getStatus=()=>!baseUrl?'not_configured':manager.getCollectionContext({touchActivity:false})?'ready':(manager.getState().websiteAnalytics||requestedGeneration===manager.getState().generation)?'unavailable':'disabled';
function renderStatus(){const value=getStatus();const message=value==='not_configured'?'Website analytics is not enabled for this release. Your preference can be saved; no optional observations are sent.':value==='unavailable'?'Website analytics is unavailable. Your preference is saved, but collection needs a valid receipt.':value==='ready'?'Website analytics is available with your consent. Account activity has a separate signed-in choice.':'Optional website analytics is off.';const translated=window.CodevalancheLocale?.translate(message)??message;status.textContent=bannerStatus.textContent=availability.textContent=translated;availability.hidden=!['unavailable','not_configured'].includes(value);}
manager.subscribe(renderStatus);renderStatus();
const track=(name,properties,context)=>client.track(name,properties,context);
window.CodevalancheAnalytics=Object.freeze({track,consentManager:manager,setConsent,flush:reason=>client.flush(reason),getStatus});
// Compatibility exposes only the strict owned vocabulary, with no legacy backend or auto-capture.
window.CodevalancheFunnel=Object.freeze({track});
window.CodevalancheConsent=Object.freeze({get:()=>manager.getState(),set:value=>setConsent({websiteAnalytics:value==='accepted'}),open:ui.open});
for(const button of document.querySelectorAll('[data-open-consent]'))button.addEventListener('click',ui.open);

function placement(link){return link.closest('header')?'header':link.closest('footer')?'footer':link.closest('.hero')?'hero':link.closest('#download')?'download':'inline';}
const platform=value=>value?.startsWith('mac-')?'macos':['windows','linux','ios','android'].includes(value)?value:'unknown';
const architecture=value=>value==='mac-arm'?'arm64':value==='mac-intel'?'x64':'unknown';
document.addEventListener('click',event=>{
 const link=event.target.closest?.('a[href]');if(!link||event.defaultPrevented)return;
 const place=placement(link),key=link.dataset.downloadPlatform;
 if(key){track('download_clicked',{cta_id:'download',platform:platform(key),architecture:link.dataset.downloadArchitecture??architecture(key),release_id:link.dataset.downloadRelease??'unknown',artifact_id:link.dataset.downloadArtifact??'unknown',placement:place});return;}
 let url;try{url=new URL(link.href,location.href);}catch{return;}
 if(url.origin===location.origin&&['/account/','/account.html'].includes(url.pathname)){track('account_entry_clicked',{placement:place,entry_mode:'signin'});return;}
 if(url.protocol==='mailto:'){const id=link.dataset.contactId;if(['info','press','security'].includes(id))track('contact_clicked',{contact_id:id,placement:place});return;}
 const target=resolveMarketingRoute(url.pathname)?.pageId;
 if(url.origin===location.origin&&target)track('navigation_used',{navigation_id:url.hash?'anchor':place==='header'?'header':place==='footer'?'footer':'anchor',target_page_id:target,placement:place});
});
for(const detail of document.querySelectorAll('details[data-analytics-faq]'))detail.addEventListener('toggle',()=>track('faq_toggled',{faq_id:detail.dataset.analyticsFaq,expanded:detail.open}));
// No automatic choice renewal. Missing receipt/provider never enables capture.
void initializeLocale(document).then(state=>localizeDocument(document,state.catalog,state.locale)).catch(()=>{});
