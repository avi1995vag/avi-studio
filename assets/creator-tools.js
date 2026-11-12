/* Browser-only image and caption preparation for the studio. */
const selectCreatorTab = (() => {
  const tabList = document.querySelector('.creator-tabs');
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];

  function select(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
  }

  for (const tab of tabs) tab.addEventListener('click', () => select(tab));
  tabList.addEventListener('keydown', event => {
    if (!tabs.includes(event.target) || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs.find(tab => tab !== event.target);
    select(next);
    next.focus();
  });
  return select;
})();

function openCreatorTool(tabId) {
  if (currentMode !== 'tools') switchMode('tools');
  const tab = document.getElementById(tabId);
  selectCreatorTab(tab);
  tab.focus({preventScroll:true});
  window.scrollTo({top:0});
}

(() => {
  const get = id => document.getElementById(id);
  const sizes = {portrait:[1080,1350], square:[1080,1080], story:[1080,1920], landscape:[1200,628], thumbnail:[1280,720]};
  const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const file = get('labFile');
  const size = get('labSize');
  const width = get('labWidth');
  const height = get('labHeight');
  const fit = get('labFit');
  const format = get('labFormat');
  const quality = get('labQuality');
  const preview = get('labCanvas');
  const status = get('labStatus');
  const outputButtons = ['labDownload','labPack','labApply'].map(get);
  const sourceButtons = [file,get('labSample'),get('labLoadPoster')];
  let image;
  let baseName = 'avi-image';
  let ticket = 0;
  let loading = false;
  let exporting = false;

  function settings() {
    return {type:format.value, quality:quality.valueAsNumber / 100, fit:fit.value === 'fit',
      x:get('labX').valueAsNumber / 100, y:get('labY').valueAsNumber / 100};
  }

  function dimensions() {
    if (size.value !== 'custom') return sizes[size.value];
    return width.validity.valid && height.validity.valid ? [width.valueAsNumber,height.valueAsNumber] : null;
  }

  function drawImage(canvas, source, w, h, options) {
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (options.type === 'image/jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0,0,w,h);
    }
    const scale = options.fit ? Math.min(w/source.width,h/source.height) : Math.max(w/source.width,h/source.height);
    const drawnWidth = source.width * scale;
    const drawnHeight = source.height * scale;
    const x = (w - drawnWidth) * (options.fit ? .5 : options.x);
    const y = (h - drawnHeight) * (options.fit ? .5 : options.y);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source,x,y,drawnWidth,drawnHeight);
  }

  function render() {
    const outputSize = dimensions();
    get('labCustom').hidden = size.value !== 'custom';
    get('labPosition').hidden = fit.value === 'fit';
    get('labQualityField').hidden = format.value === 'image/png';
    get('labQualityValue').value = quality.value + '%';
    get('labDimensions').textContent = outputSize ? outputSize.join(' × ') + ' px' : 'Enter 32–4096 px per side';
    preview.hidden = !image || !outputSize;
    get('labEmpty').hidden = !preview.hidden;
    get('labEmpty').textContent = image ? 'Enter a valid output size.' : 'Choose an image to preview the crop.';
    for (const button of outputButtons) {
      button.disabled = loading || exporting || !image || (!outputSize && button.id !== 'labPack');
    }
    for (const input of sourceButtons) input.disabled = exporting;
    if (preview.hidden) return;
    const [w,h] = outputSize;
    const scale = Math.min(1,720/Math.max(w,h));
    drawImage(preview,image,Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)),settings());
  }

  function showPalette() {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 48;
    const context = sample.getContext('2d',{willReadFrequently:true});
    context.drawImage(image,0,0,48,48);
    const {data} = context.getImageData(0,0,48,48);
    const groups = new Map();
    for (let i=0; i<data.length; i+=4) {
      if (data[i+3] < 128) continue;
      const [r,g,b] = data.subarray(i,i+3);
      const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
      const bin = groups.get(key) || [0,0,0,0];
      bin[0] += r;
      bin[1] += g;
      bin[2] += b;
      bin[3]++;
      groups.set(key,bin);
    }
    const colors = [];
    for (const [r,g,b,count] of [...groups.values()].sort((a,b) => b[3]-a[3])) {
      const color = [r,g,b].map(channel => Math.round(channel/count));
      const similar = colors.some(previous => previous.reduce((total,channel,i) => total + (channel-color[i])**2,0) < 57**2);
      if (!similar) colors.push(color);
      if (colors.length === 5) break;
    }
    const buttons = colors.map(color => {
      const hex = '#' + color.map(channel => channel.toString(16).padStart(2,'0')).join('').toUpperCase();
      const button = document.createElement('button');
      const chip = document.createElement('span');
      chip.style.background = hex;
      chip.setAttribute('aria-hidden','true');
      button.type = 'button';
      button.setAttribute('aria-label','Copy color ' + hex);
      button.append(chip,hex);
      button.addEventListener('click',async () => {
        try {
          await navigator.clipboard.writeText(hex);
          status.textContent = 'Copied ' + hex + '.';
        } catch { status.textContent = 'Palette color ' + hex; }
      });
      return button;
    });
    get('labSwatches').replaceChildren(...buttons);
    get('labPalette').hidden = !buttons.length;
  }

  async function loadImage(read, name) {
    if (exporting) return;
    const attempt = ++ticket;
    loading = true;
    status.textContent = 'Opening image…';
    render();
    let bitmap;
    try {
      bitmap = await createImageBitmap(await read());
      if (attempt !== ticket) return;
      if (bitmap.width * bitmap.height > 36_000_000) throw new Error('Choose an image under 36 megapixels.');
      image?.close();
      image = bitmap;
      bitmap = null;
      baseName = name;
      get('labX').value = get('labY').value = '50';
      showPalette();
      status.textContent = 'Source · ' + image.width + ' × ' + image.height + ' px';
    } catch (error) {
      if (attempt === ticket) status.textContent = error.name === 'Error' ? error.message : 'This image could not be opened.';
    } finally {
      bitmap?.close();
      if (attempt === ticket) {
        loading = false;
        render();
      }
    }
  }

  function encode(canvas, options) {
    return new Promise((resolve,reject) => canvas.toBlob(blob => {
      if (blob?.type === options.type) resolve(blob);
      else reject(new Error('This browser could not export the selected format.'));
    },options.type,options.quality));
  }

  async function exportImage(action) {
    const outputSize = dimensions();
    if (!image || loading || exporting || (!outputSize && action !== 'pack')) return;
    const options = settings();
    const canvas = document.createElement('canvas');
    const extension = extensions[options.type];
    exporting = true;
    status.textContent = action === 'pack' ? 'Building the size pack…' : 'Preparing the image…';
    render();
    try {
      if (action === 'pack') {
        const files = [];
        for (const [label,[w,h]] of Object.entries(sizes)) {
          drawImage(canvas,image,w,h,options);
          const blob = await encode(canvas,options);
          files.push({name:baseName + '-' + label + '-' + w + 'x' + h + '.' + extension,bytes:new Uint8Array(await blob.arrayBuffer())});
        }
        downloadBlob(zipArtwork(files),baseName + '-size-pack.zip');
        status.textContent = 'Downloaded five image sizes.';
      } else {
        const [w,h] = outputSize;
        drawImage(canvas,image,w,h,options);
        const blob = await encode(canvas,options);
        if (action === 'download') {
          downloadBlob(blob,baseName + '-' + w + 'x' + h + '.' + extension);
          status.textContent = 'Downloaded ' + w + ' × ' + h + ' image.';
        } else {
          const result = new Image();
          result.src = await new Promise((resolve,reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          await result.decode();
          if (!posterSlide) createBlankPoster();
          else switchMode('poster');
          applyPosterPhoto(result,'Image prepared in Image Lab.',++posterPhotoAttempt);
          get('posterPreviewTitle').closest('.poster-stage').scrollIntoView({block:'start'});
          status.textContent = 'Image applied to the poster.';
        }
      }
    } catch (error) { status.textContent = error.message; }
    finally {
      canvas.width = canvas.height = 1;
      exporting = false;
      render();
    }
  }

  file.addEventListener('change', () => {
    const upload = file.files[0];
    file.value = '';
    if (!upload) return;
    const name = upload.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,55) || 'avi-image';
    void loadImage(() => {
      if (upload.size > 32_000_000) throw new Error('Choose a file smaller than 32 MB.');
      return upload;
    },name);
  });
  get('labSample').addEventListener('click', () => loadImage(async () => {
    const response = await fetch('./assets/landing-staircase.webp');
    if (!response.ok) throw new Error('The sample image could not be loaded.');
    return response.blob();
  },'avi-staircase'));
  get('labLoadPoster').addEventListener('click', () => loadImage(() => {
    if (!posterSlide) throw new Error('Create a poster first or try the sample image.');
    return get('posterCanvas');
  },'avi-poster'));
  for (const control of [size,width,height,fit,format,quality,get('labX'),get('labY')]) control.addEventListener('input',render);
  get('labDownload').addEventListener('click', () => exportImage('download'));
  get('labPack').addEventListener('click', () => exportImage('pack'));
  get('labApply').addEventListener('click', () => exportImage('poster'));
  render();
})();

(() => {
  const get = id => document.getElementById(id);
  const caption = get('labCaption');
  const hashtags = get('labHashtags');
  const clean = get('labClean');
  const status = get('labCaptionStatus');
  const graphemes = new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const urlPattern = /https?:\/\/[^\s<>()]+/gi;
  const hashtagPattern = /#[\p{L}\p{N}\p{M}_]+/gu;
  let output = '';

  const limitRules = [
    ['Instagram',2196,text => text.length + (text.match(/\n/g) || []).length],
    ['Threads',500,text => text.length],
    ['X · Free',280,text => withUrls(text,xWeight,() => 23)],
    ['LinkedIn',3000,text => withUrls(text,part => part.length,() => 24)],
    ['Facebook',5000,text => text.length],
    ['Bluesky',300,text => withUrls(text,graphemeCount,link => {
      try {
        const url = new URL(link);
        return graphemeCount(url.host) + Math.min(16,graphemeCount(url.pathname + url.search + url.hash));
      } catch { return graphemeCount(link); }
    })],
  ];

  function withUrls(text,count,countUrl) {
    let total = 0;
    let start = 0;
    for (const match of text.matchAll(urlPattern)) {
      const url = match[0].replace(/[.,!?;:]+$/,'');
      total += count(text.slice(start,match.index)) + countUrl(url);
      start = match.index + url.length;
    }
    return total + count(text.slice(start));
  }

  function graphemeCount(text) {
    let count = 0;
    for (const segment of graphemes.segment(text)) count++;
    return count;
  }

  function xWeight(text) {
    let weight = 0;
    for (const {segment} of graphemes.segment(text.normalize('NFC'))) {
      if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(segment)) {
        weight += 2;
        continue;
      }
      for (const symbol of segment) {
        const code = symbol.codePointAt(0);
        weight += code <= 0x10ff || (code >= 0x2000 && code <= 0x200d)
          || (code >= 0x2010 && code <= 0x201f) || (code >= 0x2032 && code <= 0x2037) ? 1 : 2;
      }
    }
    return weight;
  }

  function captionText() {
    const input = caption.value;
    const text = clean.checked ? input.replace(/[ \t]+/g,' ').replace(/^ +| +$/gm,'').replace(/\n{3,}/g,'\n\n').trim() : input;
    const used = new Set((text.match(hashtagPattern) || []).map(tag => tag.normalize('NFC').toLowerCase()));
    const extra = [];
    for (const value of hashtags.value.split(/[\s,;]+/u)) {
      const word = value.replace(/^#+/,'').normalize('NFC');
      if (!/^[\p{L}\p{N}\p{M}_]+$/u.test(word)) continue;
      const tag = '#' + word;
      const key = tag.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      extra.push(tag);
    }
    return [text,extra.join(' ')].filter(Boolean).join('\n\n');
  }

  function renderCaption() {
    output = captionText();
    get('labCaptionPreview').textContent = output.trim() ? output : 'Your formatted caption will appear here.';
    const rows = limitRules.map(([network,limit,count]) => {
      const used = count(output);
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const result = document.createElement('span');
      name.textContent = network;
      result.textContent = used + ' / ' + limit + (used > limit ? ' · ' + (used-limit) + ' over' : '');
      row.toggleAttribute('data-over',used > limit);
      row.append(name,result);
      return row;
    });
    get('labCaptionLimits').replaceChildren(...rows);
    get('labCopyCaption').disabled = get('labUseCaption').disabled = !output.trim();
  }

  function saveCaption() {
    lsSet('app_captionLab',JSON.stringify({text:caption.value,hashtags:hashtags.value,clean:clean.checked}));
    status.textContent = '';
    renderCaption();
  }

  function loadDraftCaption() {
    caption.value = get('caption').value;
    hashtags.value = '';
    saveCaption();
  }

  try {
    const saved = JSON.parse(lsGet('app_captionLab'));
    if (saved) {
      caption.value = saved.text || '';
      hashtags.value = saved.hashtags || '';
      clean.checked = saved.clean !== false;
    }
  } catch {}
  for (const control of [caption,hashtags,clean]) control.addEventListener('input',saveCaption);
  get('labLoadCaption').addEventListener('click',loadDraftCaption);
  get('openCaptionLab').addEventListener('click',() => {
    openCreatorTool('captionLabTab');
    if (!caption.value && !hashtags.value) loadDraftCaption();
  });
  get('labUseCaption').addEventListener('click',() => {
    get('caption').value = output;
    updateCharCount();
    status.textContent = 'Caption added to the current ' + draftKind + ' draft.';
  });
  get('labCopyCaption').addEventListener('click',async () => {
    try {
      await navigator.clipboard.writeText(output);
      status.textContent = 'Caption copied.';
    } catch { status.textContent = 'Select the caption preview to copy it.'; }
  });
  renderCaption();
})();
