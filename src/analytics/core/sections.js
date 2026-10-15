/** Explicit element registrations only; geometry is sampled without reading text or selectors. */
export function createSections({host,emit}){
 const sections=new Map();
 function observe(element,{sectionId}){const previous=sections.get(sectionId);if(previous){if(previous.element!==element){previous.since=null;previous.wasQualified=false;}previous.element=element;return;}sections.set(sectionId,{element,since:null,viewed:false,total:0,revision:0,lastReported:-1,wasQualified:false});}
 function sample(time,delta,visible,active){for(const [sectionId,s] of sections){const rect=s.element.getBoundingClientRect(),overlap=Math.max(0,Math.min(rect.bottom,host.innerHeight)-Math.max(0,rect.top));const qualifies=visible&&s.element.isConnected&&rect.height>0&&rect.width>0&&rect.right>0&&rect.left<host.innerWidth&&overlap>=Math.min(rect.height*.5,host.innerHeight*.5);
 if(!qualifies){s.since=null;s.wasQualified=false;continue;}if(s.since===null)s.since=time;
 if(!s.viewed&&time-s.since>=1000){s.viewed=emit('section_viewed',{section_id:sectionId}).queued;}
 if(active&&s.wasQualified)s.total=Math.min(86400000,s.total+delta);s.wasQualified=true;
 }}
 function flush(){for(const [sectionId,s] of sections){const total=Math.floor(s.total);if(s.viewed&&total!==s.lastReported){const result=emit('section_engagement_reported',{section_id:sectionId,active_ms_total:total,revision:s.revision});if(result.queued){s.lastReported=total;s.revision++;}}}}
 return {observe,sample,flush,pause(){for(const s of sections.values()){s.since=null;s.wasQualified=false;}},resetMeasurements(){for(const s of sections.values()){s.since=null;s.viewed=false;s.total=0;s.revision=0;s.lastReported=-1;s.wasQualified=false;}},reset(){sections.clear();}};
}
