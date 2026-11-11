/* Draft persistence and workflow links shared by the static studio. */
const draftCaptions = {carousel: '', poster: ''};
const draftSources = {carousel: null, poster: null};
const persistedImages = new WeakMap();
const frameLayouts = new Set(['brief','cover','cta','split','text-focus','magazine','minimal','tweet','stats','timeline','news-card','chart-bar','hero-split','minimal-quote','dateline','spotlight','world-update','breaking-banner','editorial',...Object.keys(CREATIVE_TEMPLATES),...Object.keys(CAROUSEL_LAYOUTS)]);
let draftKind = 'carousel';
let draftDB;
let draftTimer;
let studioReady = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}

function activateDraft(mode) {
  const kind = mode === 'poster' ? 'poster' : 'carousel';
  if(mode !== 'scheduler' && mode !== 'imageGenerator' && draftKind !== kind) {
    const caption = document.getElementById('caption');
    draftCaptions[draftKind] = caption.value;
    draftKind = kind;
    caption.value = draftCaptions[kind];
    updateCharCount();
  }
  const source = draftSources[draftKind];
  const href = safeWebUrl(source?.link);
  const link = document.getElementById('draftSource');
  const check = document.getElementById('approvePosterSource');
  const labels = {article:'Publisher article read',feed:'Matching feed excerpt',excerpt:'Your pasted excerpt',
    'link-draft':'Headline only · source review required',checked:'Source checked by you','publisher-excerpt':'Publisher excerpt','google-excerpt':'Google excerpt for the same article'};
  document.getElementById('draftSourcePanel').hidden = !href;
  document.getElementById('draftSourceLabel').textContent = labels[source?.kind] || 'Original source';
  link.hidden = !href;
  check.hidden = draftKind!=='poster' || source?.kind!=='link-draft';
  if(href) link.href = href;
  document.getElementById('artworkOptions').hidden = draftKind!=='poster';
}

function normalizedFrame(frame) {
  if(!frame || typeof frame !== 'object') throw new Error('Draft contains an invalid frame.');
  const clean = {layout: frameLayouts.has(frame.layout) ? frame.layout : 'minimal'};
  for(const field of ['title','body','imageQuery','category','ticker','location','source','articleUrl','_lang','photoSource','photoLabel','photoSubject','photoCredit','photoLicense']){
    if(typeof frame[field] === 'string') clean[field] = frame[field].slice(0, 4000);
  }
  clean.title ??= '';
  clean.body ??= '';
  if(Object.hasOwn(POSTER_PALETTES,frame.posterPalette)) clean.posterPalette = frame.posterPalette;
  if(Object.hasOwn(PHOTO_FINISHES,frame.photoFinish)) clean.photoFinish = frame.photoFinish;
  for(const field of ['titleColor','bodyColor','accentColor']){
    if(typeof frame[field] === 'string' && /^#[0-9a-f]{6}$/i.test(frame[field])) clean[field] = frame[field];
  }
  for(const field of ['titleSize','bodySize']){
    if(typeof frame[field] === 'number' && Number.isFinite(frame[field])) clean[field] = Math.max(.5, Math.min(2, frame[field]));
  }
  for(const [field,min,max] of [['photoX',0,1],['photoY',0,1],['photoZoom',1,2.5]]){
    if(Number.isFinite(frame[field])) clean[field] = Math.max(min,Math.min(max,frame[field]));
  }
  if(Array.isArray(frame.chartData)){
    clean.chartData = frame.chartData.slice(0,15).filter(item =>
      item && typeof item.label === 'string' && Number.isFinite(item.value)
    ).map(item => ({label:item.label.slice(0,80),value:item.value}));
  }
  return clean;
}

function embedImage(image) {
  if(!image?.naturalWidth || !image.naturalHeight) return '';
  if(persistedImages.has(image)) return persistedImages.get(image);
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/webp', .88);
  persistedImages.set(image, data);
  return data;
}

function captureDraft(kind) {
  const design = kind === 'poster' ? (posterSlide ? [posterSlide] : []) : slides;
  return {
    version: 1, mode: kind, theme: activeTheme,
    lang: kind === 'poster' ? document.getElementById('posterLang').value : currentLang,
    caption: kind === draftKind ? document.getElementById('caption').value : draftCaptions[kind],
    source: draftSources[kind],
    slides: design.map(frame => ({
      ...normalizedFrame(frame),
      image: embedImage(kind === 'poster' ? posterImageCache['poster-main'] : slideImageOverrides[frame.cacheKey] || imageCache[frame.cacheKey])
    }))
  };
}

async function hydrateDraft(draft) {
  if(draft?.version !== 1 || !['carousel','poster'].includes(draft.mode) ||
     typeof draft.caption !== 'string' || !Array.isArray(draft.slides) ||
     draft.slides.length > (draft.mode === 'poster' ? 1 : 10)){
    throw new Error('Choose an AvI Studio draft or a draft.json from Actions.');
  }
  const clean = draft.slides.map(normalizedFrame);
  const images = await Promise.all(draft.slides.map(frame => {
    if(!frame.image) return null;
    if(typeof frame.image !== 'string' || frame.image.length > 4_000_000 ||
       !/^data:image\/(jpeg|png|webp);base64,/i.test(frame.image)) throw new Error('Unsupported draft image.');
    return loadImg(frame.image, null, 4000);
  }));
  const lang = ['English','Kannada','Bilingual'].includes(draft.lang) ? draft.lang : 'English';
  const kind = draft.mode;
  draftCaptions[kind] = draft.caption.slice(0, 12000);
  const source = draft.source;
  const link = safeWebUrl(source?.link);
  const kindOfSource = ['article','feed','excerpt','link-draft','checked','publisher-excerpt','google-excerpt'].includes(source?.kind) ? source.kind : '';
  draftSources[kind] = link ? {link,kind:kindOfSource,name:typeof source.name==='string' ? source.name.slice(0,120) : ''} : null;
  if(kind === draftKind) document.getElementById('caption').value = draftCaptions[kind];
  if(kind === 'poster') {
    posterSlide = clean[0] ? {...clean[0], id:'poster-1', cacheKey:'poster-main'} : null;
    posterImageCache = images[0] ? {'poster-main': images[0]} : {};
    document.getElementById('posterLang').value = lang;
    if(posterSlide){
      resetPosterPhoto();
      if(images[0]) applyPosterPhoto(images[0],posterSlide.photoLabel || 'Image restored with the draft.',posterPhotoAttempt,posterSlide.photoSource);
      else drawSlideOnCanvas(document.getElementById('posterCanvas'), posterSlide, 0, lang);
      openPosterEditor();
    }
  } else {
    slides = clean;
    assignCacheKeys(slides);
    currentLang = lang;
    imageCache = {};
    slideImageOverrides = {};
    images.forEach((image,index) => { if(image) slideImageOverrides[slides[index].cacheKey] = image; });
    usedImageUrls.clear();
    closeSlideEditor();
  }
}

function database() {
  if(!draftDB) {
    draftDB = new Promise((resolve,reject) => {
      const request = indexedDB.open('avi-studio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return draftDB;
}

async function workspaceRecord(value) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('workspace', value ? 'readwrite' : 'readonly');
    const store = tx.objectStore('workspace');
    const request = value ? store.put(value, 'latest') : store.get('latest');
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}

function queueDraftSave() {
  if(!studioReady) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    const state = document.getElementById('draftState');
    try {
      await saveWorkspaceDraft();
      state.textContent = 'Draft saved on this device';
    } catch { state.textContent = 'Autosave unavailable · export a draft to keep it'; }
  }, 300);
}

function saveWorkspaceDraft(){
  return workspaceRecord({carousel:captureDraft('carousel'),poster:captureDraft('poster'),mode:currentMode,activeDraft:draftKind});
}

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.download = name;
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

function saveDraftFile() {
  try {
    const draft = captureDraft(draftKind);
    if(!draft.slides.length && !draft.caption) return log('Create a design or write a caption first.', 'err');
    downloadBlob(new Blob([JSON.stringify(draft,null,2)], {type:'application/json'}), 'avi-draft.json');
    log('Draft exported.', 'ok');
  } catch(error) { log('Could not export the draft: ' + error.message, 'err'); }
}

document.getElementById('draftFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if(!file) return;
  try {
    if(file.size > 25_000_000) throw new Error('The draft file exceeds 25 MB.');
    const draft = JSON.parse(await file.text());
    if((draft.mode === 'poster' ? posterSlide : slides.length) &&
       !window.confirm('Replace the current design of this type with the imported draft?')) return;
    await hydrateDraft(draft);
    if(Object.hasOwn(THEMES, draft.theme)) setTheme(draft.theme);
    switchMode(draft.mode);
    updateCharCount();
    log('Draft imported.', 'ok');
  } catch(error) { log(error.message, 'err'); }
});

function closeSlideEditor() {
  selectedSlide = null;
  document.getElementById('slideEditor').style.display = 'none';
}

function selectEditedSlide(index) {
  closeSlideEditor();
  buildGrid();
  if(slides[index]) selectSlide(index);
}

function addBlankSlide() {
  if(slides.length >= 10) return log('A carousel supports up to 10 slides.', 'warn');
  slides.push({id: slides.length + 1, cacheKey:makeUUID(), layout:'brief', title:'Your headline', body:'Add the details here.'});
  selectEditedSlide(slides.length-1);
}

function createBlankPoster(){
  if(posterSlide && !window.confirm('Replace your current poster with a blank one?')) return;
  const settings = getPosterSettings();
  const lang = settings.language;
  const title = lang === 'Kannada' ? 'ನಿಮ್ಮ ಶೀರ್ಷಿಕೆ' : 'Your headline';
  commitPoster({title,body:'',caption:''},settings,null);
  showPosterSourceStatus('Blank poster ready. Add your own headline, details, and image.');
}

function editSlideOrder(direction) {
  const target = selectedSlide + direction;
  if(selectedSlide === null || !slides[target]) return;
  [slides[selectedSlide], slides[target]] = [slides[target], slides[selectedSlide]];
  selectEditedSlide(target);
}

function duplicateSlide() {
  if(selectedSlide === null) return;
  if(slides.length >= 10) return log('A carousel supports up to 10 slides.', 'warn');
  const original = slides[selectedSlide];
  const copy = {...structuredClone(original), cacheKey:makeUUID()};
  if(imageCache[original.cacheKey]) imageCache[copy.cacheKey] = imageCache[original.cacheKey];
  if(slideImageOverrides[original.cacheKey]) slideImageOverrides[copy.cacheKey] = slideImageOverrides[original.cacheKey];
  slides.splice(selectedSlide+1, 0, copy);
  selectEditedSlide(selectedSlide+1);
}

function removeSlide() {
  if(selectedSlide === null) return;
  const [removed] = slides.splice(selectedSlide,1);
  delete imageCache[removed.cacheKey];
  delete slideImageOverrides[removed.cacheKey];
  selectEditedSlide(Math.min(selectedSlide,slides.length-1));
}

async function copyCaption() {
  const value = document.getElementById('caption').value;
  if(!value.trim()) return log('Write a caption first.', 'warn');
  try {
    await navigator.clipboard.writeText(value);
    document.getElementById('draftState').textContent = 'Caption copied';
  } catch {
    const field = document.getElementById('caption');
    field.focus();
    field.select();
    log('Caption selected. Copy it with your keyboard.', 'warn');
  }
}

/* ZIP store format. JPEG files are already compressed. */
function zipArtwork(files) {
  const encoder = new TextEncoder();
  const local = [], central = [];
  let offset = 0, directorySize = 0;
  function header(size, signature) {
    const view = new DataView(new ArrayBuffer(size));
    view.setUint32(0, signature, true);
    return view;
  }
  for(const {name,bytes} of files){
    const label = encoder.encode(name);
    let crc = 0xffffffff;
    for(const byte of bytes){
      crc ^= byte;
      for(let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    const entry = header(30, 0x04034b50);
    entry.setUint16(4, 20, true);
    entry.setUint16(12, 33, true);
    entry.setUint32(14, ~crc, true);
    entry.setUint32(18, bytes.length, true);
    entry.setUint32(22, bytes.length, true);
    entry.setUint16(26, label.length, true);
    const record = header(46, 0x02014b50);
    record.setUint16(4, 20, true);
    new Uint8Array(record.buffer).set(new Uint8Array(entry.buffer,4,26),6);
    record.setUint32(42, offset, true);
    local.push(entry.buffer,label,bytes);
    central.push(record.buffer,label);
    offset += 30 + label.length + bytes.length;
    directorySize += 46 + label.length;
  }
  const end = header(22, 0x06054b50);
  end.setUint16(8,files.length,true);
  end.setUint16(10,files.length,true);
  end.setUint32(12,directorySize,true);
  end.setUint32(16,offset,true);
  return new Blob([...local,...central,end.buffer], {type:'application/zip'});
}

function encodeArtwork(canvas, type='image/jpeg') {
  return new Promise((resolve,reject) => canvas.toBlob(blob =>
    blob ? resolve(blob) : reject(new Error('Canvas export failed.')), type, .93));
}

function fitPosterExport(canvas, height, theme){
  if(height===canvas.height) return canvas;
  const out = document.createElement('canvas');
  out.width = CANVAS_W; out.height = height;
  const context = out.getContext('2d');
  context.fillStyle = theme.bg2;
  context.fillRect(0,0,out.width,out.height);
  const scale = Math.min(out.width/canvas.width,out.height/canvas.height);
  const w = Math.round(canvas.width*scale), h = Math.round(canvas.height*scale);
  const x = Math.floor((out.width-w)/2), y = Math.floor((out.height-h)/2);
  context.drawImage(canvas,x,y,w,h);
  if(y>=50){
    context.fillStyle = theme.accent;
    context.fillRect(64,y-23,78,3);
    context.fillRect(out.width-142,y+h+20,78,3);
  }
  return out;
}

async function downloadSinglePoster(){
  if(!posterSlide) return log('Create a poster first.','err');
  try {
    const mode = document.getElementById('posterExportSize').value;
    const format = document.getElementById('posterExportFormat').value;
    const height = {portrait:1350,square:1080,story:1920}[mode];
    const canvas = fitPosterExport(document.getElementById('posterCanvas'),height,posterTheme(posterSlide.posterPalette));
    const artwork = await encodeArtwork(canvas,'image/' + format);
    downloadBlob(artwork,`avi-poster-${mode}.${format==='png' ? 'png' : 'jpg'}`);
    log('Poster downloaded.','ok');
  } catch(error){ log(error.message,'err'); }
}

async function downloadCurrentDesign() {
  if(draftKind === 'poster') return downloadSinglePoster();
  if(!slides.length) return log('Add a frame first.', 'err');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    const images = slides.map((frame,index) => {
      drawSlide(canvas,frame,index);
      return encodeArtwork(canvas);
    });
    const files = await Promise.all(images.map(async (image,index) => ({
      name:'slide-' + String(index+1).padStart(2,'0') + '.jpg',
      bytes:new Uint8Array(await (await image).arrayBuffer())
    })));
    files.push({name:'caption.txt',bytes:new TextEncoder().encode(document.getElementById('caption').value)});
    downloadBlob(zipArtwork(files), 'avi-carousel.zip');
    log('Artwork downloaded.', 'ok');
  } catch(error) { log(error.message, 'err'); }
}

async function configureWorkflowLinks() {
  let config;
  try {
    const response = await fetch('./site.json', {cache:'no-cache',signal:AbortSignal.timeout(5000)});
    if(response.ok) config = await response.json();
  } catch {}
  void configureSocialPublishing(config?.socialPublisher);
  if(!config) return;
  try {
    const labels = {draft:'Scheduled drafts', publish:config.publishEnabled ? 'Scheduled publishing' : 'Publishing disabled', off:'Schedule off'};
    document.getElementById('automationMode').textContent = labels[config.scheduleMode] || labels.off;
    if(!/^[\w.-]+\/[\w.-]+$/.test(config.repository)) return;
    const base = 'https://github.com/' + config.repository;
    const workflow = document.getElementById('workflowLink');
    const guide = document.getElementById('setupLink');
    workflow.href = base + '/actions/workflows/autopilot.yml';
    guide.href = base + '#github-setup';
    document.getElementById('photoWorkflowLink').href = base + '/actions/workflows/article-photo.yml';
    const draftWorkflow = document.getElementById('articleDraftWorkflowLink');
    draftWorkflow.href = base + '/actions/workflows/article-photo.yml';
    draftWorkflow.hidden = false;
    workflow.hidden = guide.hidden = false;
    document.getElementById('workflowHint').textContent = 'In the publishing dashboard, select Run workflow and choose a run mode.';
  } catch {}
}

function configureAppearance(){
  const root = document.documentElement;
  const toggle = document.getElementById('appearanceToggle');
  const apply = appearance => {
    root.dataset.appearance = appearance;
    const action = appearance==='light' ? 'Switch to dark appearance' : 'Switch to light appearance';
    toggle.setAttribute('aria-label',action);
    toggle.title = action;
    document.querySelector('meta[name="theme-color"]').content = appearance==='light' ? '#faf6ee' : '#181920';
  };
  apply(lsGet('app_studioAppearance')==='light' ? 'light' : 'dark');
  toggle.addEventListener('click',() => {
    const appearance = root.dataset.appearance==='light' ? 'dark' : 'light';
    lsSet('app_studioAppearance',appearance);
    apply(appearance);
  });
}

async function initWorkspace() {
  configureAppearance();
  initializeCreativeTools();
  loadSettings();
  resetGeminiKeyStatus();
  document.getElementById('geminiKey').addEventListener('input',resetGeminiKeyStatus);
  const autoPhoto = document.getElementById('posterAutoPhoto');
  autoPhoto.checked = lsGet('app_posterAutoPhoto')!=='false';
  autoPhoto.onchange = () => lsSet('app_posterAutoPhoto',String(autoPhoto.checked));
  for(const [id,options] of [['posterExportSize',['portrait','square','story']],['posterExportFormat',['jpeg','png']]]){
    const field = document.getElementById(id);
    const saved = lsGet('app_' + id);
    if(options.includes(saved)) field.value = saved;
    field.onchange = () => lsSet('app_' + id,field.value);
  }
  try {
    const saved = await workspaceRecord();
    if(saved){
      if(saved.carousel) await hydrateDraft(saved.carousel);
      if(saved.poster) await hydrateDraft(saved.poster);
      const savedDraft = (saved.activeDraft || saved.mode) === 'poster' ? saved.poster : saved.carousel;
      if(['scheduler','imageGenerator'].includes(saved.mode) && savedDraft?.mode === 'poster') activateDraft('poster');
      if(Object.hasOwn(THEMES, savedDraft?.theme)) setTheme(savedDraft.theme);
      switchMode(saved.mode);
      document.getElementById('draftState').textContent = 'Draft restored from this device';
    }
  } catch { document.getElementById('draftState').textContent = 'Local draft restore unavailable'; }
  buildGrid();
  updateCharCount();
  studioReady = true;
  configureWorkflowLinks();
  document.fonts.ready.then(() => {
    updateCreativeGallery(true);
    buildGrid();
    if(posterSlide) drawSlideOnCanvas(document.getElementById('posterCanvas'), posterSlide, 0, document.getElementById('posterLang').value);
  });
}

initWorkspace();
