(() => {
  'use strict';
  const canvas = document.getElementById('hero-motion');
  const ctx = canvas.getContext('2d');
  const map = document.getElementById('hero-map');
  const mc = map.getContext('2d');
  const play = document.getElementById('gallery-play');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches, visible = true, frame = 0, last = 0, time = 1.8, study = 'kinetic', geography;
  const buttons = [...document.querySelectorAll('[data-study]')];
  function words(text, x, y, size, color) {
    ctx.font = `800 ${size}px "Bricolage Grotesque", sans-serif`;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function motion() {
    ctx.clearRect(0,0,900,580);
    ctx.fillStyle = study === 'kinetic' ? '#ff644e' : study === 'orbit' ? '#272041' : '#d9fc65';
    ctx.fillRect(0,0,900,580);
    if (study === 'kinetic') {
      ctx.save();ctx.translate(450,290);ctx.rotate(Math.sin(time*.65)*.035);ctx.translate(-450,-290);
      for(let i=4;i>0;i--) { ctx.globalAlpha=.1;words('LET IT',55+i*12,245+i*10,178,'#111214');words('MOVE.',55+i*12,438+i*10,190,'#111214'); }
      ctx.globalAlpha=1;words('LET IT',55,245,178,'#111214');words('MOVE.',55,438,190,'#111214');ctx.restore();
      ctx.strokeStyle='#111214';ctx.lineWidth=4;ctx.beginPath();ctx.arc(790,115,44+Math.sin(time)*8,0,Math.PI*2);ctx.stroke();
    } else if(study === 'orbit') {
      ctx.save();ctx.translate(450,300);ctx.strokeStyle='#b6a2f766';ctx.lineWidth=2;
      for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(0,0,170+i*48,75+i*28,-.4,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#d9fc65';ctx.beginPath();ctx.arc(Math.cos(time)*275,Math.sin(time)*135,24,0,Math.PI*2);ctx.fill();ctx.restore();
      words('MAKE',225,280,118,'#f4f3eb');words('WAVES.',198,403,118,'#f4f3eb');
    } else {
      words('FIND THE SIGNAL.',48,125,70,'#111214');
      const values=[.48,.73,.56,.9,.68];
      values.forEach((v,i)=>{const h=(220*v+35*Math.sin(time+i));ctx.fillStyle=['#111214','#365c45','#ff644e','#7962c8','#111214'][i];ctx.fillRect(65+i*158,475-h,116,h);});
      words('ILLUSTRATIVE DATA / NOT A LIVE METRIC',65,530,19,'#111214');
    }
  }
  function project(point) {
    const b=geography.bounds, aspect=Math.cos((b[1]+b[3])/2*Math.PI/180);
    const scale=Math.min(500/((b[2]-b[0])*aspect),490/(b[3]-b[1]));
    return [300+(point[0]-(b[0]+b[2])/2)*aspect*scale,285- (point[1]-(b[1]+b[3])/2)*scale];
  }
  function path(geometry) {
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    mc.beginPath();
    polygons.forEach(poly=>poly.forEach(ring=>{ring.forEach((p,i)=>{const q=project(p);i?mc.lineTo(...q):mc.moveTo(...q);});mc.closePath();}));
  }
  function drawMap() {
    if(!geography)return;
    mc.clearRect(0,0,600,580);mc.lineWidth=.65;
    path(geography.outline);mc.fillStyle='#41654d';mc.fill();
    geography.states.forEach(s=>{path(s.geometry);mc.fillStyle=/Karnataka/i.test(s.name)?'#d9fc65':'#41654d';mc.fill();mc.strokeStyle='#a5bc8166';mc.stroke();});
    const a=project([77.209,28.6139]), b=project([77.5946,12.9716]), c=[a[0]+100,(a[1]+b[1])/2];
    mc.strokeStyle='#f5f4dc';mc.lineWidth=2;mc.setLineDash([4,5]);mc.beginPath();mc.moveTo(...a);mc.quadraticCurveTo(...c,...b);mc.stroke();mc.setLineDash([]);
    const t=(time*.18)%1, point=[(1-t)**2*a[0]+2*(1-t)*t*c[0]+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*c[1]+t*t*b[1]];
    [a,b,point].forEach((p,i)=>{mc.beginPath();mc.arc(...p,i===2?6:4,0,Math.PI*2);mc.fillStyle='#d9fc65';mc.fill();});
    mc.font='600 15px sans-serif';mc.fillStyle='#f4f3eb';mc.fillText('DELHI',a[0]+12,a[1]-10);mc.fillText('BENGALURU',b[0]+12,b[1]+24);
  }
  function render(){motion();drawMap();}
  function tick(now){if(now-last>32){time+=Math.min((now-last)/1000,.1);last=now;render();}frame=requestAnimationFrame(tick);}
  function sync(){cancelAnimationFrame(frame);frame=0;last=performance.now();if(!paused&&visible&&!document.hidden)frame=requestAnimationFrame(tick);play.textContent=paused?'▶':'Ⅱ';play.setAttribute('aria-label',paused?'Play gallery animation':'Pause gallery animation');play.setAttribute('aria-pressed',String(paused));document.getElementById('showcase-desk').dataset.playing=String(!paused);render();}
  buttons.forEach(button=>button.addEventListener('click',()=>{study=button.dataset.study;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));canvas.setAttribute('aria-label',`${button.textContent} motion design preview`);render();}));
  play.addEventListener('click',()=>{paused=!paused;sync();});
  reduced.addEventListener('change',e=>{paused=e.matches;sync();});
  document.addEventListener('visibilitychange',sync);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(document.getElementById('showcase-desk'));
  document.fonts.ready.then(render);sync();
  fetch('./assets/india-map.json.gz').then(r=>{if(!r.ok)throw new Error('Map unavailable');return r.arrayBuffer();}).then(async buffer=>{const bytes=new Uint8Array(buffer);return bytes[0]===31&&bytes[1]===139?new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).json():JSON.parse(new TextDecoder().decode(buffer));}).then(data=>{geography=data;map.dataset.ready='true';drawMap();}).catch(()=>{map.hidden=true;document.getElementById('hero-map-fallback').hidden=false;});
  const search=document.getElementById('tool-search'), cards=[...document.querySelectorAll('.tool-card')], filters=[...document.querySelectorAll('[data-filter]')];
  let category='all';
  function filter(){const terms=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let count=0;cards.forEach(card=>{card.hidden=!( (category==='all'||card.dataset.category===category)&&terms.every(term=>card.textContent.toLocaleLowerCase().includes(term)));if(!card.hidden)count++;});document.getElementById('tool-count').textContent=`${count} tools${search.value.trim()?` for “${search.value.trim()}”`:''}`;document.getElementById('no-tools').hidden=count>0;filters.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===category)));}
  filters.forEach(b=>b.addEventListener('click',()=>{category=b.dataset.filter;filter();}));search.addEventListener('input',filter);search.addEventListener('search',filter);document.getElementById('clear-search').addEventListener('click',()=>{search.value='';category='all';filter();search.focus();});
})();
