/* Creative poster templates use the same renderer in the gallery, editor, and export. */
const CREATIVE_TEMPLATES = {
  'signal-wire': {label:'Signal Wire', title:'The story in focus', body:'Put the headline first. Use the details to make the story clear.', category:'NEWS BRIEF'},
  'cutout-cover': {label:'Cutout Cover', title:'A different point of view', body:'Give one image room to lead the story.', category:'PHOTO ESSAY'},
  'quote-prism': {label:'Quote Prism', title:'Make space for a better question', body:'One thought to keep with you.', category:'IN THEIR WORDS'},
  'field-notes': {label:'Field Notes', title:'Ideas worth keeping', body:'A compact field guide for the stories, ideas, and observations that matter.', category:'NOTEBOOK'},
  'broadsheet': {label:'Broadsheet', title:'A city finds its rhythm', body:'An early look at the spaces and people reshaping the city.', category:'THE EDITION'},
  'orbit-cover': {label:'Orbit Cover', title:'A world in motion', body:'A closer look at how small changes set larger things in motion.', category:'IN FOCUS'},
  'color-block': {label:'Color Block', title:'Make room for change', body:'Fresh ideas for a familiar place and the people who make it home.', category:'PERSPECTIVE'},
  'film-strip': {label:'Film Strip', title:'Where the light falls', body:'A visual dispatch from the quieter side of the city.', category:'PHOTO DISPATCH'}
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
  const photo = (x,y,w,h) => {
    rect(theme.bg2,x,y,w,h);
    if(image) drawImgCover(ctx,image,x,y,w,h,frame);
  };
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
  } else if(frame.layout === 'field-notes'){
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
  } else if(frame.layout === 'broadsheet'){
    label(category,58,55,710,accent,32);
    label(edition,878,56,130,theme.sub);
    line(theme.sub,58,110,1022,110,3);
    title(55,151,966,280,118,serif);
    line(accent,58,442,1022,442,8);
    photo(58,478,616,682);
    line(theme.sub,707,479,707,1159);
    body(742,488,278,650,35);
  } else if(frame.layout === 'orbit-cover'){
    label(category,62,56,740);
    ctx.save();
    ctx.beginPath(); ctx.arc(540,452,318,0,Math.PI*2); ctx.clip();
    photo(222,134,636,636);
    ctx.restore();
    ctx.strokeStyle=accent; ctx.lineWidth=5;
    for(const radius of [333,356]){
      ctx.beginPath(); ctx.arc(540,452,radius,0,Math.PI*2); ctx.stroke();
    }
    rect(accent,863,431,40,40);
    title(61,846,956,207,98,serif);
    body(63,1069,939,151,37);
  } else if(frame.layout === 'color-block'){
    rect(theme.panel,36,34,1008,1188);
    rect(accent,36,34,1008,16);
    label(category,75,81,850);
    title(73,158,925,274,109);
    photo(408,460,592,697);
    rect(theme.bg,36,571,428,474);
    rect(accent,75,618,75,8);
    body(75,662,337,346,38);
    label(edition,75,1100,225,theme.sub);
  } else if(frame.layout === 'film-strip'){
    label(category,60,57,760);
    label(edition,868,57,150,theme.sub);
    rect(theme.panel,0,129,W,680);
    photo(77,158,926,622);
    for(let y=160;y<781;y+=62){
      rect(theme.bg,24,y,30,25);
      rect(theme.bg,1026,y,30,25);
    }
    title(57,854,963,207,94,serif);
    body(61,1079,950,139,37);
  }

  line(theme.sub,64,1245,1016,1245);
  label(frame.source || document.getElementById('handleText').value || 'AvI Studio',64,1263,760,theme.sub,23);
}

function initializeCreativeTools() {
  const gallery = document.getElementById('creativeTemplates');
  const select = document.getElementById('posterLayout');
  const pickers = ['posterLayout','posterEditLayout','editLayout'];
  for(const id of pickers){
    const group = document.createElement('optgroup');
    group.label = 'Studio Collection';
    for(const [layout,template] of Object.entries(CREATIVE_TEMPLATES)){
      group.append(new Option(template.label,layout));
    }
    document.getElementById(id).append(group);
  }
  for(const option of select.options){
    const layout = option.value;
    const button = document.createElement('button');
    button.className = 'creative-template';
    button.type = 'button';
    button.dataset.layout = layout;
    const canvas = document.createElement('canvas');
    canvas.width = 216; canvas.height = 270;
    canvas.setAttribute('aria-hidden','true');
    const name = document.createElement('span');
    name.textContent = option.textContent.trim().replace(/^[^\p{L}\p{N}]+/u,'');
    button.dataset.search = (name.textContent + ' ' + option.parentElement.label).toLowerCase();
    button.append(canvas,name);
    button.onclick = () => {
      select.value = layout;
      select.dispatchEvent(new Event('change'));
    };
    gallery.append(button);
  }
  select.addEventListener('change',()=>{
    if(posterSlide) switchPosterLayout(select.value);
    else updateCreativeGallery();
  });
  document.getElementById('posterLang').addEventListener('change', () => {
    updateCreativeGallery();
    if(posterSlide) drawSlideOnCanvas(document.getElementById('posterCanvas'),posterSlide,0,document.getElementById('posterLang').value);
  });
  const search = document.getElementById('creativeSearch');
  const filter = () => {
    const terms = search.value.trim().toLowerCase().split(/\s+/);
    let visible = 0;
    for(const button of gallery.children){
      button.hidden = !terms.every(term => button.dataset.search.includes(term));
      if(!button.hidden) visible++;
    }
    document.getElementById('creativeCount').textContent = visible === gallery.childElementCount
      ? `${visible} layouts` : `${visible} of ${gallery.childElementCount}`;
    document.getElementById('creativeEmpty').hidden = visible > 0;
  };
  search.addEventListener('input',filter);
  filter();
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

let galleryArtwork;
let galleryAppearance;

function layoutSample(layout,language){
  const english = CREATIVE_TEMPLATES[layout] || {
    title:'A new view of the city', body:'From the river to the hills, familiar places take on a different shape in the morning light.',
    category:'CITY LIFE', location:'BENGALURU'
  };
  const kannada = {title:'ಕಥೆಗೆ ಹೊಸ ನೋಟ',body:'ನಗರದ ಪರಿಚಿತ ಜಾಗಗಳು ಬೆಳಗಿನ ಬೆಳಕಿನಲ್ಲಿ ಹೊಸ ರೂಪ ಪಡೆಯುತ್ತವೆ.',category:'ಮಾದರಿ ವಿನ್ಯಾಸ'};
  const copy = language === 'Kannada' ? kannada : language === 'Bilingual'
    ? {...kannada,title:kannada.title + '\n' + english.title,body:kannada.body + '\n' + english.body} : english;
  return {...copy,layout,_lang:language};
}

function gallerySampleArt(){
  if(galleryArtwork) return galleryArtwork;
  const art = document.createElement('canvas');
  art.width = 800; art.height = 800;
  const ctx = art.getContext('2d');
  const sky = ctx.createLinearGradient(0,0,0,800);
  sky.addColorStop(0,'#355475'); sky.addColorStop(.58,'#dc8763'); sky.addColorStop(1,'#f1bb85');
  ctx.fillStyle = sky; ctx.fillRect(0,0,800,800);
  ctx.fillStyle = '#ffd6a0';
  ctx.beginPath(); ctx.arc(529,301,111,0,2*Math.PI); ctx.fill();
  for(const [color,points] of [
    ['#526476',[[0,479],[176,277],[370,507],[554,396],[800,548]]],
    ['#334e57',[[0,541],[238,422],[448,579],[614,476],[800,561]]],
    ['#193940',[[0,682],[186,578],[399,666],[587,537],[800,627]]]
  ]){
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0,800);
    for(const [x,y] of points) ctx.lineTo(x,y);
    ctx.lineTo(800,800); ctx.closePath(); ctx.fill();
  }
  galleryArtwork = art;
  return art;
}

function updateCreativeGallery(force=false){
  const layout = document.getElementById('posterLayout').value;
  const language = document.getElementById('posterLang').value;
  const appearance = activeTheme + '|' + language;
  const render = force || appearance !== galleryAppearance;
  const sampleImage = gallerySampleArt();
  const scratch = render ? document.createElement('canvas') : null;
  if(scratch){ scratch.width = CANVAS_W; scratch.height = CANVAS_H; }
  for(const button of document.querySelectorAll('.creative-template')){
    const key = button.dataset.layout;
    button.setAttribute('aria-pressed',String(layout===key));
    if(scratch){
      const canvas = button.querySelector('canvas');
      drawSlide(scratch,layoutSample(key,language),0,{image:sampleImage,count:1});
      canvas.getContext('2d').drawImage(scratch,0,0,canvas.width,canvas.height);
    }
  }
  galleryAppearance = appearance;
  document.getElementById('posterPreviewLabel').textContent = posterSlide ? 'Your artwork' : 'Sample artwork';
  if(!posterSlide) drawSlide(document.getElementById('posterCanvas'),layoutSample(layout,language),0,{image:sampleImage,count:1});
}

async function loadCreativeSample(){
  if(posterSlide && !window.confirm('Replace the current poster with a design sample?')) return;
  const layout = document.getElementById('posterLayout').value;
  const lang = document.getElementById('posterLang').value;
  const copy = layoutSample(layout,lang);
  commitPoster({...copy,caption:copy.title},{layout,language:lang,type:'sample'},null);
  showPosterSourceStatus('Design sample loaded. Try a layout, edit the text, or upload a photo.');
  const attempt = posterPhotoAttempt;
  const image = await loadImg(gallerySampleArt().toDataURL('image/webp'));
  applyPosterPhoto(image,'Sample illustration. You can replace it with your own image.',attempt);
}
