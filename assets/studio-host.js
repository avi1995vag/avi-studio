/* The existing workspace owns navigation, downloads and Buffer publishing for every editor. */
(() => {
  'use strict';
  const studios={'infographic-studio':'Infographic Studio','motion-studio':'Motion Studio','india-motion':'India Motion','ai-workspace':'AI Workspace'};
  // Bumping the loader version also refreshes embedded HTML and its versioned dependencies.
  const revision=document.currentScript?.src?new URL(document.currentScript.src).searchParams.get('v')||'1':'1';
  const panel=document.getElementById('studioPanel'),frames=new Map();
  let selected='',prepared=[],preparing=false,wasActive=false,publishTarget='';
  const captions={};
  const status=document.getElementById('studioHostStatus');
  function active(){return currentMode==='studio'&&Boolean(selected);}
  function frame(){return frames.get(selected);}
  function open(id){
    if(!studios[id])return;
    const field=document.getElementById('caption');
    if(active())captions[selected]=field.value;else draftCaptions[draftKind]=field.value;
    selected=id;prepared=[];wasActive=true;switchMode('studio');field.value=captions[id]||'';
    if(!frames.has(id)){
      const child=document.createElement('iframe');child.title=studios[id]+' editor';child.src='./assets/apps/'+id+'/?embedded=1&shell='+encodeURIComponent(revision);child.allow='fullscreen; clipboard-write';child.addEventListener('load',()=>{status.textContent='';sync();});panel.append(child);frames.set(id,child);
    }
    for(const [key,child] of frames)child.hidden=key!==id;
    document.getElementById('topWorkspace').textContent=studios[id];
    document.querySelectorAll('[data-studio]').forEach(link=>{const on=link.dataset.studio===id;link.classList.toggle('active',on);if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const url=new URL(location.href);url.searchParams.set('studio',id);history.replaceState(null,'',url);sync();
  }
  function tool(){
    if(currentMode==='tools'){
      for(const [tab,canvas,button] of [['mapGraphicsTab','mapCanvas','mapDownload'],['infographicTab','infoCanvas','infoDownload'],['backgroundTab','cutoutPreview','cutoutDownload'],['hdTab','hdPreview','hdDownload']]){
        const node=document.getElementById(tab);if(node?.getAttribute('aria-selected')==='true')return {canvas:document.getElementById(canvas),button:document.getElementById(button)};
      }
    }
    return null;
  }
  function sync(){
    if(!active()&&currentMode!=='tools')return;
    const button=document.getElementById('artworkDownload');button.hidden=false;button.disabled=preparing;button.title=active()?(selected==='ai-workspace'?'Download the current brief':'Download the current artwork'):'Download current tool artwork';
    if(active())document.getElementById('inspectorToggle').hidden=true;
  }
  function download(){
    if(active()){
      const doc=frame()?.contentDocument;if(!doc)return;
      const ids={'infographic-studio':'exp','motion-studio':'exportFrame','india-motion':'png','ai-workspace':'download-output'};
      const button=doc.getElementById(ids[selected]);
      if(selected==='ai-workspace'&&doc.getElementById('result')?.hidden){status.textContent='Create a brief first, then download it.';return;}
      button?.click();return;
    }
    const entry=tool();if(entry){if(entry.button?.disabled){status.textContent='Create an image in this tool first.';return;}entry.button?.click();}
  }
  function copyCanvas(source){
    if(!source?.width||!source?.height)throw new Error('Create artwork in the selected studio first.');
    const scale=Math.min(1,2048/Math.max(source.width,source.height)),canvas=document.createElement('canvas');canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);canvas.toDataURL('image/jpeg',.8);return canvas;
  }
  function briefArtwork(brief){
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#0647ff';ctx.fillRect(70,70,70,8);let y=140;
    function write(value,size,color,maxLines){ctx.font=`${size===58?800:500} ${size}px Inter, "Anek Kannada", sans-serif`;ctx.fillStyle=color;let line='',n=0;for(const word of value.split(/\s+/)){if(ctx.measureText(line+' '+word).width>940&&line){ctx.fillText(line,70,y);y+=size*1.4;line=word;if(++n>=maxLines)return;}else line+=(line?' ':'')+word;}if(line){ctx.fillText(line,70,y);y+=size*1.4;}}
    write(brief.title,58,'#142c50',4);y+=35;write(brief.summary,29,'#536d92',7);y+=35;for(const s of brief.sections.slice(0,3)){if(y>1070)break;write(s.heading,34,'#0647ff',2);write(s.body,26,'#344f75',3);y+=25;}ctx.font='500 18px Inter,sans-serif';ctx.fillStyle='#617da4';ctx.fillText('AvI Studio · AI brief · Review before publishing',70,1290);return canvas;
  }
  async function preparePublish(){
    if(!active()&&currentMode!=='tools')return;
    if(preparing)throw new Error('Artwork is already being prepared.');preparing=true;prepared=[];sync();status.textContent='Preparing the current artwork for preview…';
    try{
      let source,caption='';
      if(active()){
        const win=frame()?.contentWindow,doc=frame()?.contentDocument;if(!doc)throw new Error('Wait for the studio to finish loading.');
        if(selected==='infographic-studio')source=await win.exportPNG({aviCapture:true});
        else if(selected==='ai-workspace'){
          const brief=win.AviWorkspace?.getBrief();if(!brief)throw new Error('Create an AI brief before opening its publishing preview.');source=briefArtwork(brief);caption=brief.caption;
        }else{source=doc.getElementById(selected==='motion-studio'?'stage':'canvas');}
      }else{const entry=tool();if(!entry?.canvas||entry.button?.disabled)throw new Error('Create artwork in the selected tool first.');source=entry.canvas.tagName==='IMG'?imageToCanvas(entry.canvas):entry.canvas;if(entry.button.id==='cutoutDownload'&&document.getElementById('cutoutBrushCanvas')?.hidden===false)source=document.getElementById('cutoutBrushCanvas');}
      prepared=[copyCanvas(source)];
      if(caption){document.getElementById('caption').value=caption;updateCharCount();}
      else if(!active()&&publishTarget!==tool()?.button?.id)document.getElementById('caption').value='';
      publishTarget=active()?selected:tool()?.button?.id;
      status.textContent=selected==='motion-studio'||selected==='india-motion'?'Publishing preview uses the current image frame. Use the studio video export for MP4.':selected==='ai-workspace'?'Review the AI brief artwork and caption before publishing.':'';
    }catch(error){status.textContent=error.message;throw error;}finally{preparing=false;sync();}
  }
  const snapshot=()=>({id:selected,preview:prepared[0]?.toDataURL('image/jpeg',.85)||'',caption:document.getElementById('caption').value});
  window.AviStudioHost={active,open,download,sync,preparePublish,snapshot,usesArtwork:()=>active()||currentMode==='tools',artwork:()=>prepared,label:()=>active()?studios[selected]+(['motion-studio','india-motion'].includes(selected)?' · current frame':''):'Tool artwork'};
  document.querySelectorAll('.suite-link').forEach(link=>{
    const id=Object.keys(studios).find(id=>link.getAttribute('href').includes('/'+id+'/'));if(!id)return;link.dataset.studio=id;
    link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();open(id);});
  });
  new MutationObserver(()=>{
    if(!active()){
      if(wasActive){captions[selected]=document.getElementById('caption').value;document.getElementById('caption').value=draftCaptions[draftKind]||'';wasActive=false;const url=new URL(location.href);url.searchParams.delete('studio');history.replaceState(null,'',url);}
      document.querySelectorAll('[data-studio]').forEach(link=>{link.classList.remove('active');link.removeAttribute('aria-current');});
    }sync();
  }).observe(document.querySelector('.dashboard'),{attributes:true,attributeFilter:['data-workspace']});
  async function start(){
    const requested=new URLSearchParams(location.search).get('studio');
    if(studios[requested])open(requested);
    else if(currentMode==='studio'){
      const saved=(await workspaceRecord())?.studio;if(!studios[saved?.id]){switchMode('carousel');return;}open(saved.id);
      if(/^data:image\/jpeg;base64,/.test(saved.preview||'')&&saved.preview.length<6_000_000){const image=await loadImg(saved.preview,null,5000);if(image){prepared=[copyCanvas(imageToCanvas(image))];document.getElementById('caption').value=String(saved.caption||'');}}
    }
  }
  function imageToCanvas(image){const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);return canvas;}
  if(studioReady)void start();else window.addEventListener('avi-workspace-ready',()=>{void start();},{once:true});
})();
