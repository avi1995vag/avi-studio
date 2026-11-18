/* Photo editing is staged locally; only Apply changes the infographic project. */
(() => {
  'use strict';
  const Core=window.AviPhotoCore,make=()=>document.createElement('canvas');
  const dialog=document.createElement('dialog');dialog.id='aviPhotoEditor';dialog.setAttribute('aria-labelledby','aviPhotoTitle');
  dialog.innerHTML=`<header class="avi-photo-header"><div><span class="avi-photo-eyebrow">AV I STUDIO · IMAGE TOOLS</span><h2 id="aviPhotoTitle">Photo editor</h2></div><span id="aviPhotoDimensions"></span><button type="button" data-photo="close" aria-label="Close photo editor">✕</button></header>
  <div class="avi-photo-layout"><aside class="avi-photo-controls"><div class="avi-photo-open"><button type="button" data-photo="upload">Open a photo</button><button type="button" data-photo="demo">Try demo image</button></div><button type="button" data-photo="original">Load original into editor</button>
  <h3>Tools</h3><div class="avi-photo-tools" role="group" aria-label="Photo editing tools"><button type="button" data-tool="select" aria-pressed="true">◌ Select brush</button><button type="button" data-tool="pen" aria-pressed="false">⌁ Pen cut</button><button type="button" data-tool="erase" aria-pressed="false">◩ Eraser</button><button type="button" data-tool="restore" aria-pressed="false">↺ Restore brush</button><button type="button" data-tool="paint" aria-pressed="false">✎ Paint brush</button><button type="button" data-tool="clone" aria-pressed="false">⧉ Clone brush</button></div>
  <label>Brush size <output id="aviPhotoSizeValue">70 px</output><input id="aviPhotoSize" type="range" min="2" max="400" value="70"></label><label>Hardness <output id="aviPhotoHardValue">70%</output><input id="aviPhotoHard" type="range" min="0" max="100" value="70"></label><label>Opacity <output id="aviPhotoOpacityValue">100%</output><input id="aviPhotoOpacity" type="range" min="1" max="100" value="100"></label><label>Paint colour<input id="aviPhotoColour" type="color" value="#0647ff"></label>
  <h3>Selection & cutout</h3><label>Selection action<select id="aviPhotoSelectionMode"><option value="add">Add to selection</option><option value="replace">Replace selection</option><option value="subtract">Subtract selection</option></select></label><label class="avi-photo-check"><input id="aviPhotoSmooth" type="checkbox">Smooth pen curves</label><div class="avi-photo-pair"><button type="button" data-photo="finish">Finish pen path</button><button type="button" data-photo="point">Undo point</button><button type="button" data-photo="clear">Clear selection</button><button type="button" data-photo="invert">Invert selection</button><button type="button" data-photo="keep">Keep inside</button><button type="button" data-photo="remove">Erase selected</button></div>
  <h3>Clipping mask</h3><label>Mask shape<select id="aviPhotoMaskShape"><option value="circle">Circle</option><option value="rounded">Rounded frame</option><option value="heart">Heart</option><option value="star">Star</option><option value="hex">Hexagon</option><option value="diamond">Diamond</option><option value="text">Text mask</option></select></label><label>Mask text<input id="aviPhotoMaskText" type="text" value="STORY" maxlength="80"></label><button type="button" data-photo="mask">Preview mask selection</button><button type="button" data-photo="release" id="aviPhotoRelease" disabled>Release clipping mask</button><button type="button" data-photo="layout-mask" id="aviPhotoLayoutMask">Use selected shape / text</button><label class="avi-photo-check"><input id="aviPhotoHideShape" type="checkbox" checked>Hide the layout mask after Apply</label><p class="avi-photo-hint">Select a photo and an overlapping shape or text in the layout to clip them together. Masks stay separate from your photo edits.</p>
  <h3>Content-aware fill</h3><button type="button" class="avi-photo-primary" data-photo="fill">Repair selected area</button><button type="button" data-photo="stop" id="aviPhotoStop" hidden>Cancel repair</button><p class="avi-photo-hint">Paint over a small object, then repair it using nearby texture. Best on walls, sky and repeating surfaces. This is local repair, not generative AI.</p></aside>
  <section class="avi-photo-workbench" aria-label="Photo editing canvas"><div class="avi-photo-top"><div class="avi-photo-pair"><button type="button" data-photo="undo" id="aviPhotoUndo">Undo</button><button type="button" data-photo="redo" id="aviPhotoRedo">Redo</button><button type="button" data-photo="compare" id="aviPhotoCompare" aria-pressed="false">Show before</button></div><label>View<select id="aviPhotoZoom"><option value="fit">Fit photo</option><option value="1">100%</option><option value="2">200%</option></select></label></div><p id="aviPhotoToolHint">Paint over an object to select it, then choose Repair, Keep inside, or Erase selected.</p><div class="avi-photo-viewport" id="aviPhotoViewport"><div id="aviPhotoEmpty"><span>✦</span><h3>Make room for your image.</h3><p>Open a photo, or select one in your infographic and choose Photo editor.</p></div><canvas id="aviPhotoCanvas" tabindex="0" aria-label="Photo editor canvas. Arrows position the cursor, Space paints or adds a pen point, Enter closes a pen path." hidden></canvas></div><div class="avi-photo-bottom"><label class="avi-photo-check"><input id="aviPhotoShowSelection" type="checkbox" checked>Show selection</label><div class="avi-photo-pair"><button type="button" class="avi-photo-primary" data-photo="fill">Repair selection</button><button type="button" data-photo="keep">Clip to selection</button><button type="button" data-photo="remove">Erase selection</button></div><span id="aviPhotoSelectionCount">No selection</span></div></section></div>
  <footer class="avi-photo-footer"><p id="aviPhotoStatus" role="status" aria-live="polite">Your original photo stays available. Edits are applied only when you choose Apply.</p><div><button type="button" data-photo="reset">Reset edits</button><button type="button" data-photo="close">Cancel</button><button type="button" class="avi-photo-primary" data-photo="apply" id="aviPhotoApply" disabled>Apply to infographic</button></div></footer><input id="aviPhotoFile" type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden>`;
  document.body.append(dialog);
  const get=id=>dialog.querySelector('#'+id),preview=get('aviPhotoCanvas'),viewCtx=preview.getContext('2d'),work=make(),workCtx=work.getContext('2d',{willReadFrequently:true}),selectionCanvas=make(),selectionCtx=selectionCanvas.getContext('2d'),maskCanvas=make(),maskCtx=maskCanvas.getContext('2d'),clipCanvas=make(),clipCtx=clipCanvas.getContext('2d');
  let state=null,tool='select',stroke=null,penDrag=-1,hover=null,raf=0,worker=null,busy=false,comparison=false,loadVersion=0;
  const tools={select:'Paint over an object to select it. Hold Alt to subtract. Keyboard: arrows position the cursor; Space selects.',pen:'Click an outline and drag points to adjust. Click the first point or Enter to close. Keyboard: arrows move, Space adds a point, Backspace removes it.',erase:'Paint to erase pixels to transparency. Keyboard: arrows position the cursor; Space erases. Restore brush or Undo brings pixels back.',restore:'Restore pixels from the photo as it looked when you opened this editor. Keyboard: arrows position the cursor; Space restores.',paint:'Paint with your selected colour, opacity and hardness. Keyboard: arrows position the cursor; Space paints.',clone:'Alt-click a clean source point, then paint to copy its texture. Keyboard: arrows position; Alt+Enter sets the source; Space clones.'};
  const message=(value,error=false)=>{get('aviPhotoStatus').textContent=value;get('aviPhotoStatus').dataset.error=String(error);};
  const image=src=>new Promise((resolve,reject)=>{const im=new Image();if(/^https?:/.test(src))im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('This photo could not be read. Upload a local PNG, JPEG or WebP.'));im.src=src;});
  function loaded(){if(!state)throw new Error('Open a photo first.');}
  function checkpoint(){
    if(!state)return;state.history=state.history.slice(0,state.index+1);state.history.push({pixels:new Uint8ClampedArray(state.pixels.data),mask:new Uint8Array(state.mask),clip:state.clip?new Uint8Array(state.clip):null,path:state.path.map(p=>({...p})),maskApplied:state.maskApplied,layoutMask:state.layoutMask});state.index=state.history.length-1;
    const bytes=state.width*state.height*6;while(state.history.length>2&&(state.history.length>12||state.history.length*bytes>96_000_000)){state.history.shift();state.index--;}
    controls();stats();
  }
  function history(delta){if(!state||busy)return;const index=state.index+delta;if(index<0||index>=state.history.length)return;state.index=index;const item=state.history[index];state.pixels=new ImageData(new Uint8ClampedArray(item.pixels),state.width,state.height);state.mask=new Uint8Array(item.mask);state.clip=item.clip?new Uint8Array(item.clip):null;state.path=item.path.map(p=>({...p}));state.maskApplied=item.maskApplied;state.layoutMask=item.layoutMask;rebuildClip();rebuild();controls();stats();}
  function controls(){
    get('aviPhotoUndo').disabled=!state||busy||state.index===0;get('aviPhotoRedo').disabled=!state||busy||state.index>=state.history.length-1;get('aviPhotoApply').disabled=!state||busy;
    get('aviPhotoStop').hidden=!busy;get('aviPhotoLayoutMask').disabled=!state?.other;get('aviPhotoRelease').disabled=!state?.clip;
    dialog.querySelectorAll('[data-photo],[data-tool],input:not([type=file]),select').forEach(node=>{if(busy&&!['stop','close'].includes(node.dataset.photo))node.disabled=true;else if(!busy&&!['aviPhotoUndo','aviPhotoRedo','aviPhotoApply','aviPhotoLayoutMask','aviPhotoRelease'].includes(node.id))node.disabled=false;});
  }
  function stats(){if(!state)return;let selected=0;for(const value of state.mask)if(value>32)selected++;get('aviPhotoSelectionCount').textContent=selected?(100*selected/state.mask.length).toFixed(1)+'% selected':'No selection';}
  function overlay(rect){
    if(!state)return;const {width:w,height:h}=state,area=rect||{x:0,y:0,width:w,height:h},data=state.selectionImage.data;
    for(let y=area.y;y<area.y+area.height;y++)for(let x=area.x;x<area.x+area.width;x++){const i=y*w+x,j=i*4;data[j]=35;data[j+1]=103;data[j+2]=255;data[j+3]=state.mask[i]*.38;}
    selectionCtx.putImageData(state.selectionImage,0,0,area.x,area.y,area.width,area.height);
  }
  function rebuildClip(){if(!state)return;clipCtx.clearRect(0,0,state.width,state.height);if(state.clip){const pixels=new ImageData(state.width,state.height);for(let i=0;i<state.clip.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=state.clip[i];}clipCtx.putImageData(pixels,0,0);}}
  function updateWork(rect){if(state.clip){workCtx.putImageData(state.pixels,0,0);workCtx.save();workCtx.globalCompositeOperation='destination-in';workCtx.drawImage(clipCanvas,0,0);workCtx.restore();}else if(rect)workCtx.putImageData(state.pixels,0,0,rect.x,rect.y,rect.width,rect.height);else workCtx.putImageData(state.pixels,0,0);}
  function rebuild(){if(!state)return;updateWork();overlay();schedule();}
  function trace(ctx,path,smooth){
    if(!path.length)return;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);
    if(smooth&&path.length>2){for(let i=0;i<path.length;i++){const p0=path[(i-1+path.length)%path.length],p1=path[i],p2=path[(i+1)%path.length],p3=path[(i+2)%path.length];ctx.bezierCurveTo(p1.x+(p2.x-p0.x)/6,p1.y+(p2.y-p0.y)/6,p2.x-(p3.x-p1.x)/6,p2.y-(p3.y-p1.y)/6,p2.x,p2.y);}}
    else for(const point of path.slice(1))ctx.lineTo(point.x,point.y);
  }
  function draw(){
    raf=0;if(!state)return;viewCtx.clearRect(0,0,preview.width,preview.height);if(comparison)viewCtx.putImageData(state.before,0,0);else viewCtx.drawImage(work,0,0);
    const scale=preview.width/Math.max(1,preview.getBoundingClientRect().width);
    if(!comparison&&get('aviPhotoShowSelection').checked)viewCtx.drawImage(selectionCanvas,0,0);
    if(!comparison&&state.path.length){viewCtx.save();trace(viewCtx,state.path,get('aviPhotoSmooth').checked);viewCtx.strokeStyle='#0647ff';viewCtx.lineWidth=2*scale;viewCtx.setLineDash([6*scale,4*scale]);viewCtx.stroke();viewCtx.setLineDash([]);for(let i=0;i<state.path.length;i++){const p=state.path[i];viewCtx.fillStyle=i?'#fff':'#0647ff';viewCtx.beginPath();viewCtx.arc(p.x,p.y,5*scale,0,Math.PI*2);viewCtx.fill();viewCtx.stroke();}viewCtx.restore();}
    if(!comparison&&hover&&tool!=='pen'){viewCtx.save();viewCtx.lineWidth=1.5*scale;viewCtx.strokeStyle='#fff';viewCtx.shadowColor='#000';viewCtx.shadowBlur=2*scale;viewCtx.beginPath();viewCtx.arc(hover.x,hover.y,Number(get('aviPhotoSize').value)/2,0,Math.PI*2);viewCtx.stroke();viewCtx.restore();}
    if(state.clone){viewCtx.save();viewCtx.strokeStyle='#ff7c25';viewCtx.lineWidth=1.5*scale;const p=state.clone;viewCtx.beginPath();viewCtx.moveTo(p.x-7*scale,p.y);viewCtx.lineTo(p.x+7*scale,p.y);viewCtx.moveTo(p.x,p.y-7*scale);viewCtx.lineTo(p.x,p.y+7*scale);viewCtx.stroke();viewCtx.restore();}
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(draw);}
  function view(){if(!state)return;const zoom=get('aviPhotoZoom').value,viewport=get('aviPhotoViewport');const fit=Math.min(1,Math.max(80,viewport.clientWidth-48)/state.width,Math.max(80,viewport.clientHeight-48)/state.height);preview.style.width=state.width*(zoom==='fit'?fit:Number(zoom))+'px';preview.style.maxWidth='none';schedule();}
  async function loadPhoto(src,target=null,other=null){
    if(busy)stop();const version=++loadVersion,hasClip=Boolean(target?.aviPhotoMaskBase&&target?.aviPhotoClip&&src===target.src);message('Opening photo…');const im=await image(hasClip?target.aviPhotoMaskBase:src);if(version!==loadVersion)return;if(im.naturalWidth*im.naturalHeight>80_000_000)throw new Error('This photo is too large to edit in the browser. Resize it below 80 megapixels first.');
    const ratio=target?target.w/target.h:im.naturalWidth/im.naturalHeight,edge=Math.min(2048,Math.max(im.naturalWidth,im.naturalHeight));
    const width=Math.max(8,Math.round(ratio>=1?edge:edge*ratio)),height=Math.max(8,Math.round(ratio>=1?edge/ratio:edge));
    const staging=make();staging.width=width;staging.height=height;const stagingCtx=staging.getContext('2d',{willReadFrequently:true});
    if(target){
      stagingCtx.save();stagingCtx.scale(width/target.w,height/target.h);const scale=Math.max(target.w/im.naturalWidth,target.h/im.naturalHeight),dw=im.naturalWidth*scale,dh=im.naturalHeight*scale;
      stagingCtx.translate(target.w/2+(target.ix||0)/100*target.w,target.h/2+(target.iy||0)/100*target.h);const z=target.is||1;stagingCtx.scale(target.fx?-z:z,z);stagingCtx.filter=flt(target);stagingCtx.drawImage(im,-dw/2,-dh/2,dw,dh);stagingCtx.restore();
    }else stagingCtx.drawImage(im,0,0,width,height);
    const pixels=stagingCtx.getImageData(0,0,width,height);
    let clip=null;
    if(hasClip){
      const clipImage=await image(target.aviPhotoClip);if(version!==loadVersion)return;
      stagingCtx.clearRect(0,0,width,height);stagingCtx.save();stagingCtx.scale(width/target.w,height/target.h);const s=Math.max(target.w/clipImage.naturalWidth,target.h/clipImage.naturalHeight);stagingCtx.translate(target.w/2+(target.ix||0)/100*target.w,target.h/2+(target.iy||0)/100*target.h);const zoom=target.is||1;stagingCtx.scale(target.fx?-zoom:zoom,zoom);stagingCtx.filter=target.bl?'blur('+target.bl+'px)':'none';stagingCtx.drawImage(clipImage,-clipImage.naturalWidth*s/2,-clipImage.naturalHeight*s/2,clipImage.naturalWidth*s,clipImage.naturalHeight*s);stagingCtx.restore();
      const alpha=stagingCtx.getImageData(0,0,width,height).data;clip=new Uint8Array(width*height);for(let i=0;i<clip.length;i++)clip[i]=alpha[i*4+3];
    }
    for(const canvas of [preview,work,selectionCanvas,maskCanvas,clipCanvas]){canvas.width=width;canvas.height=height;}
    workCtx.putImageData(pixels,0,0);
    state={width,height,pixels,initial:new ImageData(new Uint8ClampedArray(pixels.data),width,height),before:new ImageData(Core.withMask(pixels.data,clip),width,height),clip,initialClip:clip?new Uint8Array(clip):null,mask:new Uint8Array(width*height),selectionImage:new ImageData(width,height),target,other,originalURL:src,history:[],index:-1,path:[],clone:null,maskApplied:Boolean(clip),layoutMask:false};
    hover=null;stroke=null;penDrag=-1;
    comparison=false;get('aviPhotoCompare').setAttribute('aria-pressed','false');get('aviPhotoEmpty').hidden=true;preview.hidden=false;get('aviPhotoDimensions').textContent=width+' × '+height+' px';get('aviPhotoZoom').value='fit';rebuildClip();rebuild();checkpoint();view();setTool('select');message('Ready. Brush a selection, draw a pen outline, or choose a clipping mask. The original photo is preserved.');return state;
  }
  function setTool(next){tool=next;comparison=false;get('aviPhotoCompare').setAttribute('aria-pressed','false');dialog.querySelectorAll('[data-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tool===tool)));get('aviPhotoToolHint').textContent=tools[tool];preview.style.cursor=tool==='pen'?'crosshair':'none';schedule();}
  function position(event){const rect=preview.getBoundingClientRect();return{x:Math.max(0,Math.min(state.width-1,(event.clientX-rect.left)*state.width/rect.width)),y:Math.max(0,Math.min(state.height-1,(event.clientY-rect.top)*state.height/rect.height))};}
  function finishPath(){
    loaded();if(state.path.length<3)throw new Error('Add at least three pen points before closing the path.');
    maskCtx.clearRect(0,0,state.width,state.height);maskCtx.fillStyle='#fff';trace(maskCtx,state.path,get('aviPhotoSmooth').checked);maskCtx.closePath();maskCtx.fill();mergeMask();state.path=[];checkpoint();schedule();message('Pen selection ready. Choose Keep inside, Erase selected, or Repair selected area.');
  }
  function mergeMask(forceReplace=false){
    const pixels=maskCtx.getImageData(0,0,state.width,state.height).data,mode=forceReplace?'replace':get('aviPhotoSelectionMode').value;
    for(let i=0;i<state.mask.length;i++){const value=pixels[i*4+3];state.mask[i]=mode==='replace'?value:mode==='subtract'?state.mask[i]*(1-value/255):Math.max(state.mask[i],value);}
    overlay();stats();schedule();
  }
  function cut(keep){
    loaded();if(!state.mask.some(value=>value>32))throw new Error('Create a selection or preview a clipping mask first.');
    if(keep){state.clip=new Uint8Array(state.mask);state.maskApplied=true;rebuildClip();}
    else{for(let i=0;i<state.mask.length;i++)state.pixels.data[i*4+3]*=1-state.mask[i]/255;state.layoutMask=false;}
    state.mask.fill(0);state.path=[];checkpoint();rebuild();message(keep?'Clipping mask applied. You can release it later; the photo underneath is preserved.':'Selected pixels erased. Use Undo or Restore brush to bring them back.');
  }
  async function mask(layout=false){
    loaded();maskCtx.clearRect(0,0,state.width,state.height);maskCtx.save();maskCtx.fillStyle='#fff';
    if(layout){
      const photo=state.target,other=state.other;if(!photo||!other)throw new Error('Select a photo together with an overlapping shape or text in the infographic first.');
      await document.fonts.ready;if(other.t==='text')await document.fonts.load(`${other.b?800:400} ${other.fs}px ${other.ff}`,other.txt||'ಕ');
      maskCtx.scale(state.width/photo.w,state.height/photo.h);maskCtx.translate(photo.w/2,photo.h/2);maskCtx.rotate(-(photo.r||0)*Math.PI/180);maskCtx.translate(-photo.x-photo.w/2,-photo.y-photo.h/2);maskCtx.translate(other.x+other.w/2,other.y+other.h/2);maskCtx.rotate((other.r||0)*Math.PI/180);maskCtx.translate(-other.w/2,-other.h/2);
      if(other.t==='text')drawText(maskCtx,{...other,color:'#ffffff',tsw:0,fill:'transparent'});else{pth(maskCtx,other);maskCtx.fill();}
      state.layoutMask=true;
    }else{
      const kind=get('aviPhotoMaskShape').value,w=state.width,h=state.height;
      if(kind==='text'){
        await document.fonts.ready;const value=get('aviPhotoMaskText').value.trim();if(!value)throw new Error('Enter the words to use as a text clipping mask.');const family='"Anek Kannada", Inter, sans-serif';await document.fonts.load('800 80px '+family,value);
        let size=Math.min(w*.28,h*.65);maskCtx.font=`800 ${size}px ${family}`;size*=Math.min(1,w*.88/Math.max(1,maskCtx.measureText(value).width));maskCtx.font=`800 ${size}px ${family}`;maskCtx.textAlign='center';maskCtx.textBaseline='middle';maskCtx.fillText(value,w/2,h/2);
      }
      if(kind!=='text'){
        maskCtx.clearRect(0,0,w,h);maskCtx.translate(w*.05,h*.05);pth(maskCtx,{shape:kind==='rounded'?'rect':kind,w:w*.9,h:h*.9,rad:kind==='rounded'?Math.min(w,h)*.12:0});maskCtx.fill();
      }
      state.layoutMask=false;
    }
    maskCtx.restore();mergeMask(true);if(!state.mask.some(value=>value>32))throw new Error('The mask does not overlap this photo. Move the shape or text over it in the layout first.');checkpoint();message('Mask preview ready. Choose Keep inside to clip the photo, or Undo to change it.');
  }
  function stop(){worker?.terminate();worker=null;busy=false;controls();message('Repair cancelled. The photo and selection were kept.');}
  async function repair(){
    loaded();const selected=state.mask.reduce((sum,value)=>sum+(value>32),0);if(!selected)throw new Error('Select the object with Select brush or Pen cut first.');if(selected/state.mask.length>.4)throw new Error('Select a smaller area, under 40% of the photo, so surrounding texture remains available.');
    worker=new Worker('photo-worker.js?v=2');const job=worker,editing=state;busy=true;controls();message('Matching nearby texture… 0%');
    worker.onmessage=event=>{
      if(worker!==job||state!==editing||!busy)return;
      if(event.data.progress){message(event.data.progress.phase+'… '+event.data.progress.percent+'%');return;}
      const result=event.data;worker?.terminate();worker=null;busy=false;
      if(result.error){controls();message(result.error,true);return;}
      state.pixels=new ImageData(new Uint8ClampedArray(result.result),state.width,state.height);state.mask.fill(0);state.path=[];state.layoutMask=false;checkpoint();rebuild();controls();message('Repair complete. Compare before/after and undo if the texture does not fit.');
    };
    worker.onerror=()=>{if(worker!==job||state!==editing)return;worker?.terminate();worker=null;busy=false;controls();message('Photo repair could not start. Refresh the studio and try again.',true);};
    worker.postMessage({data:new Uint8ClampedArray(state.pixels.data),mask:new Uint8Array(state.mask),width:state.width,height:state.height});
  }
  function apply(){
    loaded();if(busy)return;commit();const src=work.toDataURL('image/png');let photo=state.target;
    if(photo&&!els.includes(photo))throw new Error('The original layout photo is no longer available. Reopen it before applying edits.');
    if(!photo){const width=Math.min(W*.75,600);photo=add({t:'image',src,orig:state.originalURL,w:width,h:width*state.height/state.width,fill:'transparent',is:1,ix:0,iy:0});}
    else{
      if(!photo.orig)photo.orig=photo.src;
      if(!photo.aviPhotoState)photo.aviPhotoState=Object.fromEntries(['is','ix','iy','fx','bri','con','gs','bl','sat','hue','sep','inv','shape','rad'].map(key=>[key,photo[key]??(['is'].includes(key)?1:['bri','con','sat'].includes(key)?100:0)]));
      photo.src=src;
    }
    Object.assign(photo,{is:1,ix:0,iy:0,fx:0,bri:100,con:100,sat:100,gs:0,bl:0,hue:0,sep:0,inv:0,aviPhotoEdited:1});
    if(state.clip){
      const base=make();base.width=state.width;base.height=state.height;base.getContext('2d').putImageData(state.pixels,0,0);photo.aviPhotoMaskBase=base.toDataURL('image/png');photo.aviPhotoClip=clipCanvas.toDataURL('image/png');photo.shape='';photo.rad=0;
    }else{
      if(photo.aviPhotoMaskId){const shape=els.find(item=>item.id===photo.aviPhotoMaskId);if(shape)shape.hid=0;}
      delete photo.aviPhotoMaskBase;delete photo.aviPhotoClip;delete photo.aviPhotoMaskId;
    }
    if(state.layoutMask&&state.clip&&get('aviPhotoHideShape').checked&&state.other){state.other.hid=1;photo.aviPhotoMaskId=state.other.id;}
    sel=photo.id;ms=[photo];render();panel();commit();dialog.close();
  }
  function open(){
    if(!dialog.open)dialog.showModal();const selection=selSet(),photo=selection.find(item=>item.t==='image')||(cur()?.t==='image'?cur():null),other=selection.find(item=>item!==photo&&['shape','text'].includes(item.t));
    if(photo)void loadPhoto(photo.src,photo,other).catch(error=>message(error.message,true));else if(!state)message('Open a photo to get started, or try the demo image.');
  }
  function restoreOriginal(){const photo=selSet().find(item=>item.t==='image')||cur();if(photo?.t!=='image'||!photo.orig)return;commit();photo.src=photo.orig;Object.assign(photo,photo.aviPhotoState||{});if(photo.aviPhotoMaskId){const shape=els.find(item=>item.id===photo.aviPhotoMaskId);if(shape)shape.hid=0;}for(const key of ['aviPhotoState','aviPhotoEdited','aviPhotoMaskBase','aviPhotoClip','aviPhotoMaskId'])delete photo[key];render();panel();commit();}
  function releaseMask(){loaded();state.clip=null;state.maskApplied=false;state.layoutMask=false;checkpoint();rebuild();message('Clipping mask released. Photo edits underneath it were kept.');}
  async function originalInEditor(){loaded();const target=state.target,other=state.other,source=target?.orig||state.originalURL;const fresh=await loadPhoto(source,target?{...target,...(target.aviPhotoState||{})}:null,other);if(fresh&&state===fresh)state.target=target;}
  function demo(){
    const canvas=make();canvas.width=960;canvas.height=640;const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,960,640);gradient.addColorStop(0,'#9fc7e1');gradient.addColorStop(1,'#d9e7d9');ctx.fillStyle=gradient;ctx.fillRect(0,0,960,640);
    const pixels=ctx.getImageData(0,0,960,640);let seed=1234;for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=((seed>>>24)-128)*.06;for(let k=0;k<3;k++)pixels.data[i+k]+=noise;}ctx.putImageData(pixels,0,0);
    ctx.fillStyle='#4f7d6c';ctx.beginPath();ctx.moveTo(0,470);ctx.quadraticCurveTo(300,275,600,470);ctx.quadraticCurveTo(800,380,960,445);ctx.lineTo(960,640);ctx.lineTo(0,640);ctx.fill();ctx.fillStyle='#cf573e';ctx.fillRect(420,155,125,150);ctx.fillStyle='#f7e7cb';ctx.font='700 20px sans-serif';ctx.fillText('REMOVE',437,230);ctx.fillStyle='#856953';ctx.fillRect(474,305,16,180);
    void loadPhoto(canvas.toDataURL()).catch(error=>message(error.message,true));
  }
  preview.addEventListener('pointerdown',event=>{
    if(!state||busy||event.button!==0)return;event.preventDefault();preview.focus();const p=position(event);hover=p;comparison=false;get('aviPhotoCompare').setAttribute('aria-pressed','false');preview.setPointerCapture(event.pointerId);
    if(tool==='pen'){
      const tolerance=12*state.width/preview.getBoundingClientRect().width,index=state.path.findIndex(point=>Math.hypot(point.x-p.x,point.y-p.y)<tolerance);
      if(index===0&&state.path.length>2){try{finishPath();}catch(error){message(error.message,true);}return;}
      if(index>=0)penDrag=index;else{state.path.push(p);penDrag=state.path.length-1;}schedule();return;
    }
    if(tool==='clone'&&event.altKey){state.clone=p;schedule();message('Clone source set. Paint over the area you want to replace.');return;}
    if(tool==='clone'&&!state.clone){message('Alt-click a clean source point before using Clone brush.',true);return;}
    startStroke(p,event.altKey);
  });
  function startStroke(p,subtract=false){
    const select=tool==='select';if(select&&get('aviPhotoSelectionMode').value==='replace'&&!subtract){state.mask.fill(0);overlay();}
    const hex=get('aviPhotoColour').value,color=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
    stroke={last:p,options:{mode:select?(subtract||get('aviPhotoSelectionMode').value==='subtract'?'deselect':'select'):tool,radius:Number(get('aviPhotoSize').value)/2,hardness:Number(get('aviPhotoHard').value)/100,opacity:select?1:Number(get('aviPhotoOpacity').value)/100,color,offset:tool==='clone'?{x:state.clone.x-p.x,y:state.clone.y-p.y}:null},reference:tool==='restore'?state.initial.data:tool==='clone'?new Uint8ClampedArray(state.pixels.data):null};
    paint(p);
  }
  function paint(p){const selected=tool==='select',rect=Core.brush(selected?state.mask:state.pixels.data,state.width,state.height,stroke.last,p,stroke.options,stroke.reference);stroke.last=p;if(selected)overlay(rect);else updateWork(rect);schedule();}
  preview.addEventListener('pointermove',event=>{if(!state)return;const p=position(event);hover=p;if(penDrag>=0){state.path[penDrag]=p;schedule();}else if(stroke)paint(p);else schedule();});
  const endStroke=()=>{if(stroke||penDrag>=0){checkpoint();stroke=null;penDrag=-1;}stats();};
  preview.addEventListener('pointerup',endStroke);preview.addEventListener('pointercancel',endStroke);preview.addEventListener('pointerleave',()=>{hover=null;schedule();});
  dialog.addEventListener('click',event=>{
    const node=event.target.closest('[data-tool],[data-photo]');if(!node)return;
    if(node.dataset.tool){if(!busy)setTool(node.dataset.tool);return;}
    const actions={close:()=>{if(busy)stop();dialog.close();},upload:()=>get('aviPhotoFile').click(),demo,undo:()=>history(-1),redo:()=>history(1),compare:()=>{comparison=!comparison;get('aviPhotoCompare').setAttribute('aria-pressed',String(comparison));schedule();},finish:finishPath,point:()=>{loaded();state.path.pop();checkpoint();schedule();},clear:()=>{loaded();state.mask.fill(0);state.path=[];checkpoint();overlay();schedule();},invert:()=>{loaded();for(let i=0;i<state.mask.length;i++)state.mask[i]=255-state.mask[i];checkpoint();overlay();schedule();},keep:()=>cut(true),remove:()=>cut(false),mask:()=>mask(false),'layout-mask':()=>mask(true),fill:repair,stop,reset:()=>{loaded();state.pixels=new ImageData(new Uint8ClampedArray(state.initial.data),state.width,state.height);state.mask.fill(0);state.path=[];state.clip=state.initialClip?new Uint8Array(state.initialClip):null;state.maskApplied=Boolean(state.clip);state.layoutMask=false;rebuildClip();checkpoint();rebuild();message('Photo restored to its state when you opened the editor.');},apply};
    Promise.resolve().then(()=>node.dataset.photo==='original'?originalInEditor():node.dataset.photo==='release'?releaseMask():actions[node.dataset.photo]?.()).catch(error=>{maskCtx.restore();message(error.message,true);});
  });
  for(const [id,output,suffix] of [['aviPhotoSize','aviPhotoSizeValue',' px'],['aviPhotoHard','aviPhotoHardValue','%'],['aviPhotoOpacity','aviPhotoOpacityValue','%']])get(id).addEventListener('input',()=>{get(output).value=get(id).value+suffix;schedule();});
  for(const id of ['aviPhotoZoom','aviPhotoShowSelection','aviPhotoSmooth'])get(id).addEventListener('change',view);
  get('aviPhotoFile').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>20_000_000)throw new Error('Choose a photo smaller than 20 MB.');const reader=new FileReader();reader.onload=()=>loadPhoto(reader.result).catch(error=>message(error.message,true));reader.onerror=()=>message('This file could not be opened.',true);reader.readAsDataURL(file);}catch(error){message(error.message,true);}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(busy)stop();dialog.close();});
  new ResizeObserver(()=>{if(dialog.open&&state)view();}).observe(get('aviPhotoViewport'));
  const oldPanel=panel;panel=function(){oldPanel();if(selSet().some(item=>item.t==='image')){const box=document.createElement('details');box.open=true;box.className='avi-photo-inspector';box.innerHTML='<summary>Photo editing & clipping</summary><button type="button" class="avi-photo-launch">Open photo editor</button><p>Pen cut, soft erase, paint, shape and text masks, clone and content-aware repair.</p><button type="button" class="avi-photo-original">Restore original photo</button>';box.querySelector('.avi-photo-launch').addEventListener('click',open);box.querySelector('.avi-photo-original').addEventListener('click',restoreOriginal);document.getElementById('pn').append(box);}};
  const entry=document.createElement('button');entry.type='button';entry.textContent='✦ Photo editor';entry.id='aviPhotoOpen';entry.addEventListener('click',open);document.getElementById('bi').after(entry);
  window.AviPhotoEditor={open,isOpen:()=>dialog.open,handleKey(event){
    const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
    if(event.key==='Escape'){event.preventDefault();if(busy)stop();else dialog.close();return;}
    if(typing)return;const key=event.key.toLowerCase();
    if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();history(event.shiftKey?1:-1);return;}
    if((event.ctrlKey||event.metaKey)&&key==='y'){event.preventDefault();history(1);return;}
    if(busy)return;
    if(state&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();hover||={x:state.width/2,y:state.height/2};const step=event.shiftKey?50:10;hover.x=Math.max(0,Math.min(state.width-1,hover.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)));hover.y=Math.max(0,Math.min(state.height-1,hover.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)));schedule();return;
    }
    if(state&&key===' '){
      event.preventDefault();hover||={x:state.width/2,y:state.height/2};
      if(tool==='pen'){state.path.push({...hover});checkpoint();schedule();}
      else if(tool==='clone'&&!state.clone)message('Set a clone source with Alt-click or Alt+Enter first.',true);
      else{startStroke({...hover},event.altKey);endStroke();}return;
    }
    if(state&&tool==='clone'&&event.altKey&&key==='enter'){event.preventDefault();state.clone={...(hover||{x:state.width/2,y:state.height/2})};message('Clone source set. Move the cursor and press Space to clone.');schedule();return;}
    if(key==='enter'&&tool==='pen'){event.preventDefault();try{finishPath();}catch(error){message(error.message,true);}return;}
    if((key==='backspace'||key==='delete')&&tool==='pen'){event.preventDefault();if(state){state.path.pop();checkpoint();}schedule();return;}
    if((event.ctrlKey||event.metaKey)&&key==='s'){event.preventDefault();message('Choose Apply to infographic before saving the layout project.');return;}
    const shortcuts={b:'paint',e:'erase',r:'restore',p:'pen',s:'select',c:'clone'};if(shortcuts[key]){event.preventDefault();setTool(shortcuts[key]);}
    if(key==='['||key===']'){event.preventDefault();get('aviPhotoSize').value=Math.max(2,Math.min(400,Number(get('aviPhotoSize').value)+(key===']'?10:-10)));get('aviPhotoSizeValue').value=get('aviPhotoSize').value+' px';schedule();}
  }};
  controls();panel();
})();
