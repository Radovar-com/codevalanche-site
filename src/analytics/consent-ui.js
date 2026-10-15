/** Mount once on any public page. Integrators remove the legacy CMP first. */
export function mountConsentUI({manager,document:doc=globalThis.document,mount=doc.body}={}) {
 const root=doc.createElement('aside');root.dataset.ownedConsent='';
 const style=doc.createElement('style');style.textContent=`[data-owned-consent] {font:16px/1.5 system-ui;color:#171717} [data-owned-consent] [hidden]{display:none!important} [data-owned-consent] button{font:inherit;cursor:pointer;padding:.6em .9em;border:1px solid #666;background:#fff;color:#171717;border-radius:4px} [data-owned-consent] button:focus-visible,[data-owned-consent] input:focus-visible{outline:3px solid #245bc2;outline-offset:3px} [data-owned-consent] .cmp-banner{position:fixed;bottom:1rem;right:1rem;z-index:1000;padding:1.25rem;max-width:min(34rem,calc(100vw - 2rem));background:#fff;border:1px solid #666} [data-owned-consent] .cmp-actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem} [data-owned-consent] .cmp-overlay{position:fixed;inset:0;z-index:1001;background:#0008;display:grid;place-items:center;padding:1rem} [data-owned-consent] .cmp-card{background:#fff;border:1px solid #666;padding:1.5rem;width:min(32rem,100%);max-height:90vh;overflow:auto} [data-owned-consent] label{display:block;margin:1rem 0} [data-owned-consent] .cmp-manage{position:relative}`;
 root.append(style);
 const banner=doc.createElement('section');banner.className='cmp-banner';banner.setAttribute('aria-label','Analytics choice');
 const title=doc.createElement('h2');title.textContent='Your analytics choice';
 const text=doc.createElement('p');text.textContent='Optional website analytics helps us understand visits. Essential account and security storage works with any choice.';
 const actions=doc.createElement('div');actions.className='cmp-actions';
 const button=(name,handler)=>{const b=doc.createElement('button');b.type='button';b.textContent=name;b.addEventListener('click',handler);return b;};
 const choose=enabled=>{void manager.setConsent({websiteAnalytics:enabled});close();};
 actions.append(button('Accept analytics',()=>choose(true)),button('Decline',()=>choose(false)),button('Personalize',()=>open(true)));
 banner.append(title,text,actions);
 const manage=button('Manage cookies',()=>open(false));manage.className='cmp-manage';
 const overlay=doc.createElement('div');overlay.className='cmp-overlay';overlay.hidden=true;
 const dialog=doc.createElement('section');dialog.className='cmp-card';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Cookie preferences');
 const heading=doc.createElement('h2');heading.textContent='Cookie preferences';
 const info=doc.createElement('p');info.textContent='Essential storage is required. Your choice lasts 180 days. Website analytics uses an anonymous ID for 30 days and sessions lasting up to 24 hours with a 30 minute idle limit.';
 const label=doc.createElement('label'),website=doc.createElement('input');website.type='checkbox';label.append(website,' Website analytics');
 const accountLabel=doc.createElement('label'),account=doc.createElement('input');account.type='checkbox';account.disabled=true;accountLabel.append(account,' Account analytics');
 const explanation=doc.createElement('p');explanation.textContent='Manage optional account activity separately in your signed-in account.';
 const save=button('Save preferences',()=>choose(website.checked));
 dialog.append(button('Close preferences',()=>close()),heading,info,label,accountLabel,explanation,save);overlay.append(dialog);root.append(banner,manage,overlay);mount.append(root);
 let invoker;
 function open(personalize){invoker=doc.activeElement;overlay.hidden=false;website.checked=manager.getState().websiteAnalytics;dialog.firstElementChild.focus();if(!personalize){overlay.hidden=true;banner.hidden=false;actions.querySelector('button').focus();}}
 function close(){const wasOpen=!overlay.hidden;overlay.hidden=true;render();if(wasOpen)(invoker?.isConnected&&invoker.getClientRects().length?invoker:manage).focus();}
 function render(){if(overlay.hidden)banner.hidden=manager.getState().state!=='unknown';}
 const unsubscribe=manager.subscribe(render);render();
 const keydown=event=>{
  if(overlay.hidden)return;
  if(event.key==='Escape'){event.preventDefault();overlay.hidden=true;render();manage.focus();}
  if(event.key==='Tab'){const focusable=[...dialog.querySelectorAll('button,input:not(:disabled)')],first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}
 };
 root.addEventListener('keydown',keydown);
 return {open:()=>open(true),dispose(){unsubscribe();root.remove();}};
}
