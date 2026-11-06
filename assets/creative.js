/* Creative poster templates use the same renderer in the gallery, editor, and export. */
const CREATIVE_TEMPLATES = {
  'signal-wire': {label:'Signal Wire', title:'The story in focus', body:'Put the headline first. Use the details to make the story clear.', category:'NEWS BRIEF'},
  'cutout-cover': {label:'Cutout Cover', title:'A different point of view', body:'Give one image room to lead the story.', category:'PHOTO ESSAY'},
  'quote-prism': {label:'Quote Prism', title:'Make space for a better question', body:'One thought to keep with you.', category:'IN THEIR WORDS'},
  'field-notes': {label:'Field Notes', title:'Ideas worth keeping', body:'A compact field guide for the stories, ideas, and observations that matter.', category:'NOTEBOOK'}
};

function creativeText(ctx, text, box, fontFamily, weight, color) {
  const {x,y,width,height,size} = box;
  if(!text) return;
  const paragraphs = String(text).split(/\r?\n/);
  let lines, step;
  for(let point = size; point >= 19; point -= 2){
    ctx.font = `${weight} ${point}px ${fontFamily}`;
    step = Math.ceil(point * 1.19);
    lines = paragraphs.flatMap(paragraph => {
      const wrapped = [''];
      for(const word of paragraph.split(/\s+/)){
        const last = wrapped.length-1;
        const next = wrapped[last] ? wrapped[last] + ' ' + word : word;
        if(wrapped[last] && ctx.measureText(next).width > width) wrapped.push(word);
        else wrapped[last] = next;
      }
      return wrapped;
    });
    if(lines.length * step <= height && lines.every(line => ctx.measureText(line).width <= width)) break;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const visible = Math.max(1,Math.floor(height/step));
  lines.slice(0,visible).forEach((line,i)=>{
    ctx.fillText(line + (i===visible-1 && lines.length>visible ? '…' : ''),x,y+i*step,width);
  });
}

function drawCreativeFrame(ctx, frame, index, count, theme, image, titleFont, bodyFont) {
  const W = CANVAS_W, H = CANVAS_H;
  const accent = frame.accentColor || theme.accent;
  const ink = frame.titleColor || theme.text;
  const muted = frame.bodyColor || theme.sub;
  const title = (x,y,width,height,size,family=titleFont) => creativeText(ctx,frame.title,
    {x,y,width,height,size:Math.round(size*(frame.titleSize || 1))},family,800,ink);
  const body = (x,y,width,height,size=37) => creativeText(ctx,frame.body,
    {x,y,width,height,size:Math.round(size*(frame.bodySize || 1))},bodyFont,500,muted);
  const label = (text,x,y,width=840,color=accent,size=25) => {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = color;
    ctx.font = `700 ${size}px ${bodyFont}`; ctx.fillText(text,x,y,width);
  };
  const rect = (color,x,y,w,h) => {ctx.fillStyle=color; ctx.fillRect(x,y,w,h);};
  const line = (color,x1,y1,x2,y2,width=2) => {
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath();
    ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  };
  const number = n => String(n).padStart(2,'0');
  const edition = number(index+1) + ' / ' + number(count);
  const category = frame.category || CREATIVE_TEMPLATES[frame.layout].category;
  const serif = titleFont.startsWith('"Anek') ? titleFont : 'Georgia, serif';
  rect(theme.bg,0,0,W,H);

  if(frame.layout === 'signal-wire'){
    rect(theme.panel,0,0,W,130);
    rect(accent,0,130,W,12);
    label('AvI   /   SIGNAL WIRE',57,52,670);
    label(edition,871,52,154,theme.sub);
    if(image) drawImgCover(ctx,image,0,142,W,500,frame);
    else {
      rect(theme.bg2,0,142,W,500);
      for(let row=0;row<6;row++) for(let column=0;column<13;column++){
        ctx.fillStyle=(row+column)%4===0 ? accent : theme.sub;
        ctx.globalAlpha=(row+column)%4===0 ? .6 : .16;
        ctx.fillRect(65+column*78,177+row*76,8,8);
      }
      ctx.globalAlpha=1;
      for(let i=0;i<6;i++) line(accent,300+i*25,607,690+i*25,180,3);
    }
    rect(accent,57,692,54,7);
    label(category,130,679,820);
    title(57,737,966,245,94);
    body(59,1014,938,197,39);
  } else if(frame.layout === 'cutout-cover'){
    rect(theme.panel,0,0,W,H);
    label('AvI   /   CUTOUT',65,55,720);
    label(edition,874,55,142,theme.sub);
    rect(accent,78,148,921,633);
    rect(theme.bg,60,130,921,633);
    if(image) drawImgCover(ctx,image,71,141,899,611,frame);
    else {
      rect(theme.bg2,71,141,899,611);
      ctx.save(); ctx.beginPath(); ctx.rect(71,141,899,611); ctx.clip();
      ctx.strokeStyle=accent; ctx.lineWidth=3;
      for(let radius=85;radius<493;radius+=31){
        ctx.beginPath(); ctx.arc(656,474,radius,0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }
    rect(theme.bg,0,795,W,555);
    label(category,61,834,850);
    title(60,877,950,187,84,serif);
    body(63,1081,930,143);
  } else if(frame.layout === 'quote-prism'){
    ctx.save();
    ctx.globalAlpha=.19;
    for(let i=0;i<6;i++){
      ctx.fillStyle=i%2 ? theme.sub : accent;
      ctx.beginPath(); ctx.moveTo(W,60+i*101); ctx.lineTo(W,197+i*101); ctx.lineTo(470+i*66,0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    label('AvI   /   QUOTE PRISM',68,58,720);
    label(edition,877,58,140,theme.sub);
    if(image){
      ctx.save(); ctx.beginPath(); ctx.arc(894,358,126,0,Math.PI*2); ctx.clip();
      drawImgCover(ctx,image,768,232,252,252,frame); ctx.restore();
    }
    label('“',64,228,300,accent,232);
    title(74,462,930,460,117,serif);
    line(accent,76,946,172,946,6);
    body(75,986,911,191,40);
  } else {
    rect(theme.panel,35,33,1010,1248);
    label('AvI   /   FIELD NOTES',68,62,680);
    label(edition,871,62,150,theme.sub);
    rect(theme.bg,65,133,950,333);
    label(category,91,165,867);
    title(90,222,892,206,86);
    rect(theme.bg,65,485,486,674);
    if(image) drawImgCover(ctx,image,65,485,486,674,frame);
    else {
      ctx.save(); ctx.globalAlpha=.33;
      for(let x=91;x<540;x+=42) line(accent,x,510,x,1132);
      for(let y=510;y<1140;y+=42) line(accent,91,y,527,y);
      ctx.restore();
      ctx.strokeStyle=accent; ctx.lineWidth=7; ctx.beginPath();
      ctx.moveTo(122,1026);ctx.lineTo(259,816);ctx.lineTo(365,876);ctx.lineTo(491,649);ctx.stroke();
      label(number(index+1),103,531,210,accent,90);
    }
    rect(theme.bg,568,485,447,674);
    label('NOTES',598,520,384);
    line(accent,599,570,982,570);
    body(598,610,380,510,38);
  }

  line(theme.sub,64,1245,1016,1245);
  label(frame.source || document.getElementById('handleText').value || 'AvI Studio',64,1263,760,theme.sub,23);
}

function initializeCreativeTools() {
  const gallery = document.getElementById('creativeTemplates');
  const pickers = ['posterLayout','posterEditLayout','editLayout'];
  for(const [layout,template] of Object.entries(CREATIVE_TEMPLATES)){
    for(const id of pickers){
      const select = document.getElementById(id);
      const option = new Option(template.label,layout);
      select.append(option);
    }
    const button = document.createElement('button');
    button.className = 'creative-template';
    button.type = 'button';
    button.dataset.layout = layout;
    const canvas = document.createElement('canvas');
    canvas.width = 216; canvas.height = 270;
    canvas.setAttribute('aria-hidden','true');
    const name = document.createElement('span');
    name.textContent = template.label;
    button.append(canvas,name);
    button.onclick = () => {
      document.getElementById('posterLayout').value = layout;
      if(posterSlide) switchPosterLayout(layout);
      updateCreativeGallery();
    };
    gallery.append(button);
  }
  document.getElementById('posterLayout').addEventListener('change',()=>{
    if(posterSlide) switchPosterLayout(document.getElementById('posterLayout').value);
    updateCreativeGallery();
  });
  updateCreativeGallery();
  const container = document.getElementById('posterCropControls');
  for(const [field,label,low,high] of [
    ['photoX','Photo left / right',0,100], ['photoY','Photo up / down',0,100], ['photoZoom','Photo zoom',100,250]
  ]){
    const row = document.createElement('div');
    row.className = 'field';
    const title = document.createElement('label');
    title.textContent = label; title.htmlFor = field;
    const input = document.createElement('input');
    input.id = field; input.type = 'range'; input.min = low; input.max = high;
    input.oninput = () => applyPosterEdit(field, Number(input.value)/100);
    row.append(title,input); container.append(row);
  }
}

function updateCreativeGallery(){
  const layout = document.getElementById('posterLayout').value;
  for(const button of document.querySelectorAll('.creative-template')){
    const key = button.dataset.layout;
    button.setAttribute('aria-pressed',String(layout===key));
    const context = button.querySelector('canvas').getContext('2d');
    context.setTransform(.2,0,0,.2,0,0);
    drawCreativeFrame(context,{layout:key,...CREATIVE_TEMPLATES[key]},0,1,THEMES[activeTheme],null,'Georgia, serif','Inter, sans-serif');
  }
}

function loadCreativeSample(){
  if(posterSlide && !window.confirm('Replace the current poster with a design sample?')) return;
  const layout = document.getElementById('posterLayout').value;
  const key = Object.hasOwn(CREATIVE_TEMPLATES,layout) ? layout : 'cutout-cover';
  const lang = document.getElementById('posterLang').value;
  const sample = CREATIVE_TEMPLATES[key];
  const local = {title:'ಕಥೆಗೆ ಹೊಸ ನೋಟ',body:'ಒಂದು ಸ್ಪಷ್ಟ ಶೀರ್ಷಿಕೆ, ಓದಲು ಸುಲಭವಾದ ವಿನ್ಯಾಸ ಮತ್ತು ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಸಾಕಷ್ಟು ಜಾಗ.',category:'ಮಾದರಿ ವಿನ್ಯಾಸ'};
  const copy = lang === 'Kannada' ? local : lang === 'Bilingual'
    ? {...local,title:local.title + '\n' + sample.title,body:local.body + '\n' + sample.body} : sample;
  commitPoster({...copy,caption:copy.title},{layout:key,language:lang,type:'sample'},null);
  showPosterSourceStatus('Design sample loaded. Try a layout, edit the text, or upload a photo.');
}
