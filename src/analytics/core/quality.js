/** Scalar-only native document vitals. No entry targets, names, resources, URLs or attribution are read.
 * CLS: maximum <1s-gap/<5s session window. INP: max per interactionId,
 * discarding floor(interactionCount/50) longest interactions. Native Event Timing
 * only exposes durations >=16ms; a rank not present in measured entries is unknown.
 */
export function createQuality({host,emit,scope,initialDocument,historicalConsent=false}){
 const names=['LCP','CLS','INP'],status=Object.fromEntries(names.map(name=>[name,{status:'unmeasured',reason:'not_qualified'}]));
 const observers=[],values=new Map(),sent=new Map(),ids=new Map(),revisions=new Map(),interactions=new Map();
 const started=host.performance.now(),cutoff=historicalConsent?0:started,originalScope=scope();let ended=false,clsWindow=0,clsMax=0,clsFirst=0,clsLast=0,seenShift=false,clsSupported=false,inpSupported=false,painted=false;
 const visibility=[{at:cutoff,visible:host.document.visibilityState==='visible'}];
 const onVisibility=()=>{visibility.push({at:host.performance.now(),visible:host.document.visibilityState==='visible'});};
 const count=()=>Number(host.performance.interactionCount);
 function publish(metric,value){if(Number.isFinite(value)&&value>=0){values.set(metric,value);status[metric]={status:'partial',reason:historicalConsent?'consented_document_native_buffer':'consented_document_early_observer'};}}
 function receive(type,entries){
  if(ended||scope()!==originalScope)return;
  for(const entry of entries){if(!Number.isFinite(entry.startTime)||entry.startTime<cutoff||!(visibility.findLast(state=>state.at<=entry.startTime)?.visible??historicalConsent))continue;
   if(type==='largest-contentful-paint'){const value=entry.renderTime||entry.loadTime||entry.startTime;if(Number.isFinite(value)&&value>0)publish('LCP',value);}
   if(type==='layout-shift'&&!entry.hadRecentInput&&Number.isFinite(entry.value)&&entry.value>=0){const time=entry.startTime;if(!seenShift||time-clsLast>=1000||time-clsFirst>=5000){clsFirst=time;clsWindow=entry.value;}else clsWindow+=entry.value;seenShift=true;clsLast=time;clsMax=Math.max(clsMax,clsWindow);publish('CLS',clsMax);}
   if(type==='event'&&Number.isSafeInteger(entry.interactionId)&&entry.interactionId>0&&Number.isFinite(entry.duration)&&entry.duration>=0){interactions.set(entry.interactionId,Math.max(interactions.get(entry.interactionId)??0,entry.duration));if(interactions.size>1024){inpSupported=false;status.INP={status:'unmeasured',reason:'interaction_capacity'};interactions.clear();}}
  }
 }
 function observe(type,metric,options={}){if(!host.PerformanceObserver?.supportedEntryTypes?.includes(type)){status[metric]={status:'unmeasured',reason:'unsupported_api'};return false;}try{const observer=new host.PerformanceObserver(list=>receive(type,list.getEntries()));observer.observe({type,buffered:historicalConsent,...options});observers.push({observer,type});status[metric]={status:'unmeasured',reason:'awaiting_native_entry'};return true;}catch{status[metric]={status:'unmeasured',reason:'unsupported_api'};return false;}}
 const priorPaint=host.performance.getEntriesByType('paint').some(entry=>entry.name==='first-contentful-paint');
 const qualified=initialDocument&&originalScope&&host.document.visibilityState==='visible'&&(historicalConsent||!priorPaint)&&((historicalConsent||count()===0)||!Number.isFinite(count()));
 if(!qualified){for(const name of names)status[name]={status:'unmeasured',reason:!initialDocument?'not_initial_document':!originalScope?'no_consent':priorPaint?'late_agreement':'hidden_or_interacted_start'};}
 else{host.document.addEventListener('visibilitychange',onVisibility);observe('largest-contentful-paint','LCP');clsSupported=observe('layout-shift','CLS');if(Number.isSafeInteger(count())&&count()>=0)inpSupported=observe('event','INP',{durationThreshold:16});else status.INP={status:'unmeasured',reason:'interaction_count_unsupported'};}
 function flush(){if(ended||scope()!==originalScope)return;for(const {observer,type} of observers)receive(type,observer.takeRecords());painted=painted||host.performance.getEntriesByType('paint').some(entry=>entry.name==='first-contentful-paint');if(clsSupported&&(seenShift||painted))publish('CLS',clsMax);
  if(inpSupported&&interactions.size){const rank=Math.floor(count()/50),durations=[...interactions.values()].sort((a,b)=>b-a);if(rank<durations.length)publish('INP',durations[rank]);else{values.delete('INP');status.INP={status:'unmeasured',reason:'below_native_event_threshold'};}}
  for(const [metric,value] of values){if(sent.get(metric)===value)continue;if(!ids.has(metric))ids.set(metric,metric.toLowerCase()+'_'+host.crypto.randomUUID());const revision=revisions.get(metric)??0;const result=emit('web_vital_reported',{metric,value,unit:metric==='CLS'?'score':'ms',metric_id:ids.get(metric),revision});if(result.queued){sent.set(metric,value);revisions.set(metric,revision+1);}}
 }
 return {flush,getStatus:()=>structuredClone(status),dispose(reason='lifecycle_ended'){if(ended)return;ended=true;host.document.removeEventListener('visibilitychange',onVisibility);for(const {observer} of observers)observer.disconnect();observers.length=0;interactions.clear();values.clear();for(const name of names)status[name]={status:'unmeasured',reason};}};
}
