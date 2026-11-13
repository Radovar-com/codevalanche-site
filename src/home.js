// Homepage motion and micro-interactions. Content is complete without this file.
(function(){
  var motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function(s,r){return (r||document).querySelector(s)}, $$ = function(s,r){return [].slice.call((r||document).querySelectorAll(s))};

  // spotlight hover
  $$('.logo,.cell').forEach(function(el){el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();el.style.setProperty('--mx',(e.clientX-r.left)+'px');el.style.setProperty('--my',(e.clientY-r.top)+'px')})});

  // reveal (only hides things once we know we can show them again)
  if(motion && 'IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.remove('pre');e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -12% 0px'});
    $$('.rev').forEach(function(el){var r=el.getBoundingClientRect(); if(r.top>innerHeight*0.9){el.classList.add('pre')} else {el.classList.add('in')} io.observe(el)});
    setTimeout(function(){$$('.pre').forEach(function(el){var r=el.getBoundingClientRect(); if(r.top<innerHeight){el.classList.remove('pre')}})},2500);
  } else { $$('.row').forEach(function(r){r.classList.add('in')}) }

  // approvals
  function wire(card, onAllow){ $$('button',card).forEach(function(b){b.addEventListener('click',function(){
    var deny=b.id==='deny'||b.getAttribute('data-allow')==='deny';
    var t=$('b',card), r=$('.risk',card); t.textContent=deny?'Denied':'Allowed once'; r.textContent=deny?'The agent was told':'Running now'; r.style.color=deny?'#ff8f8f':'var(--ok)';
    card.style.borderColor=deny?'rgba(255,143,143,.5)':'rgba(87,217,163,.55)'; $$('button',card).forEach(function(x){x.disabled=true;x.style.opacity=.45;x.style.pointerEvents='none'});
    if(onAllow) onAllow(deny);
    setTimeout(function(){t.textContent='Needs approval'; r.textContent='Medium risk'; r.style.color=''; card.style.borderColor=''; $$('button',card).forEach(function(x){x.disabled=false;x.style.opacity='';x.style.pointerEvents=''}); if(onAllow) onAllow(null)},5200);
  })})}
  wire($('#happ'),function(deny){var d=$('#d2'),s=$('#st2'),sd=$('#sd2'); sd.className=(deny===false)?'spin':'dot wait'; if(deny===null){d.className='dot wait';s.textContent='Needs your approval'} else if(deny){s.textContent='Stopped. Waiting for you'} else {d.className='spin';s.textContent='Running the tests'}});
  wire($('#app2'));
  (function(){var u=$('#undo'); if(!u) return; u.addEventListener('click',function(){var l=$('span',u); l.textContent='Files restored'; u.style.color='var(--ok)'; u.style.borderColor='rgba(87,217,163,.5)'; setTimeout(function(){l.textContent="Undo this turn's changes"; u.style.color=''; u.style.borderColor=''},3200)})})();

  // local models toggles
  $$('[data-lm]').forEach(function(row){var b=$('button',row), st=$('.state span',row); b.addEventListener('click',function(){var on=row.classList.toggle('run'); st.textContent=on?'Running':'Ready'; b.textContent=on?'Stop':'Start'; b.classList.toggle('solid',!on)})});

  // final orbit
  (function(){var o=$('#orbit'), tpl=$('#chips'); if(!o||!tpl) return; var ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('preserveAspectRatio','none'); o.appendChild(svg);
    $$('span',tpl.content).forEach(function(s,i){var x=+s.dataset.x,y=+s.dataset.y; ['','p'].forEach(function(c){var l=document.createElementNS(ns,'line'); l.setAttribute('x1',x);l.setAttribute('y1',y);l.setAttribute('x2',50);l.setAttribute('y2',50); if(c){l.setAttribute('class','p');l.style.animationDelay=(-i*0.45)+'s'} svg.appendChild(l)});
      var c=document.createElement('span'); c.className='chip'; c.style.left=x+'%'; c.style.top=y+'%'; c.style.animationDelay=(-i*0.8)+'s'; c.innerHTML=s.innerHTML; o.appendChild(c)});
  })();

  if(!motion) return;

  // hero sequence
  var parts=$$('[data-h]'); parts.forEach(function(el){el.style.visibility='hidden'});
  function show(n,delay){setTimeout(function(){parts.forEach(function(el){if(el.dataset.h==n){el.style.visibility='';el.classList.add('pop')}})},delay)}
  show(0,500);show(1,1150);show(2,1550);show(3,1950);show(4,2900);
  var steps1=['Reading src/format.ts','Editing src/format.ts','Adding 3 tests','Running the tests'], steps3=['Reading the trip model','Editing PackingList.tsx','Checking the layout'], k=0;
  setInterval(function(){k++; var a=$('#st1'),b=$('#st3'); a.textContent=steps1[k%steps1.length]; b.textContent=steps3[k%steps3.length]},2600);

  // hero tilt
  var wrap=$('#winwrap'), win=$('#win');
  if(matchMedia('(hover:hover)').matches){ wrap.addEventListener('pointermove',function(e){var r=wrap.getBoundingClientRect(), x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5; win.style.transform='rotateX('+(-y*2.2)+'deg) rotateY('+(x*2.6)+'deg)'}); wrap.addEventListener('pointerleave',function(){win.style.transform=''}) }

  // typing
  (function(){var el=$('#typed'), send=$('#send1'), full=el.textContent, i=full.length; function type(){ if(i<=full.length){el.textContent=full.slice(0,i); send.classList.toggle('ready',i>0); i++; setTimeout(type, 26+Math.random()*40)} else {setTimeout(function(){i=0; el.textContent=''; send.classList.remove('ready'); setTimeout(type,900)},3600)} } setTimeout(function(){i=0;el.textContent='';send.classList.remove('ready');type()},1800)})();

  // team statuses
  (function(){var cards=$$('#team .task'), seq=[['Reading','Editing','Testing','Done'],['Reading','Editing','Testing','Done'],['Reading','Editing','Checking','Done']], t=0;
    setInterval(function(){t=(t+1)%6; cards.forEach(function(c,i){var step=Math.min(Math.max(t-(i>1?1:0),0),3), ic=$('[data-ic]',c), st=$('[data-st]',c); if(t===0){step=0} st.textContent=seq[i][step]; if(step===3){ic.className='dot done';ic.innerHTML='<svg class="ui"><use href="#u-check"/></svg>'} else {ic.className='spin';ic.innerHTML=''}})},1900)})();

  // voice loop
  (function(){var st=$('#vstage'), line=$('#vline'), ph=$('#vph'); var states=[['listen','Listening…','<em>You</em>Make the header stay on top and run the tests.',4200],['think','Thinking…','',1500],['speak','Agent is speaking…','<em>Codevalanche</em>Done. The header stays on top now, and all 18 tests pass.',4800]], n=0;
    function next(){n=(n+1)%states.length; var s=states[n]; line.style.opacity=0; setTimeout(function(){st.dataset.s=s[0]; ph.textContent=s[1]; line.innerHTML=s[2]; line.style.opacity=1},380); setTimeout(next,s[3])} setTimeout(next,4200)})();

  // ridge field: stacked contour lines that drift like snow sliding off a ridge
  (function(){var c=$('#ridges'); if(!c||!c.getContext) return; var x=c.getContext('2d'), W,H,D=Math.min(devicePixelRatio||1,2), t=0, vis=true;
    function size(){W=c.clientWidth;H=c.clientHeight;c.width=W*D;c.height=H*D;x.setTransform(D,0,0,D,0,0)} size(); addEventListener('resize',size);
    function peak(u,c0,w){var d=(u-c0)/w; return Math.exp(-d*d)}
    function draw(){ if(vis){ x.clearRect(0,0,W,H); var L=34; for(var k=0;k<L;k++){ var p=k/(L-1), g=x.createLinearGradient(0,0,W,0); var a=(0.05+0.3*(1-p))*(0.55+0.45*Math.sin(t*0.6+k*0.5)); g.addColorStop(0,'rgba(110,231,208,0)'); g.addColorStop(0.3,'rgba(110,231,208,'+a+')'); g.addColorStop(0.7,'rgba(122,167,255,'+a+')'); g.addColorStop(1,'rgba(182,157,255,0)'); x.strokeStyle=g; x.lineWidth=1; x.beginPath();
        for(var px=0;px<=W;px+=6){ var u=px/W, amp=(1-p)*H*0.34; var y=H*(0.2+p*0.5) - amp*( 0.95*peak(u,0.26+0.02*Math.sin(t*0.25+p*3),0.11+p*0.08) + 0.7*peak(u,0.56+0.02*Math.cos(t*0.2+p*2),0.13+p*0.08) + 0.5*peak(u,0.82+0.015*Math.sin(t*0.3+p*4),0.1+p*0.06) ) + Math.sin(u*14+t*0.7+k*0.6)*3*(1-p) + Math.sin(u*37-t*0.5+k)*1.4; if(px===0) x.moveTo(px,y); else x.lineTo(px,y) } x.stroke() } t+=0.012 } requestAnimationFrame(draw) }
    if('IntersectionObserver' in window){ new IntersectionObserver(function(e){vis=e[0].isIntersecting}).observe(c) } draw() })();
})();
