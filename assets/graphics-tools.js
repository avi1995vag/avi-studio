/* Editable graphics rendered to publication-size canvases. */
(() => {
  const get = id => document.getElementById(id);
  const palettes = {
    violet:{bg:'#201735',card:'#34264b',ink:'#fff2ff',soft:'#dcc8ed',accent:'#deaaff',secondary:'#ffc2a8',line:'#705683'},
    cream:{bg:'#fff2de',card:'#f3d8c5',ink:'#321a2a',soft:'#5f3e4b',accent:'#af3b3f',secondary:'#223f84',line:'#ba9390'},
    green:{bg:'#142f2a',card:'#234640',ink:'#eff8e5',soft:'#c7dbbd',accent:'#e2fa91',secondary:'#f0ba9e',line:'#597568'},
  };
  const designLooks = {
    signal:['#201735','#34264b','#fff2ff','#deaaff','#ffc2a8'], coral:['#24161b','#3f242c','#fff7f4','#ff7667','#ffd166'], mint:['#102b29','#1e4943','#effff7','#6ee7c7','#8cb7ff'], saffron:['#281908','#4a2b0d','#fff7e7','#ffb02e','#ef5d43'], ink:['#101418','#20272e','#eff4f8','#a5d8ff','#7bdcb5'], ultra:['#101b43','#21347b','#f5f7ff','#7fa8ff','#f7a8d8'], rose:['#321522','#55233b','#fff0f5','#ff8cb9','#ffd166'], lime:['#17210e','#29391b','#f5ffe9','#c8ff54','#7cd6ff'], sky:['#122738','#213d53','#effaff','#75c9ff','#ffe080'], plum:['#2a1731','#482653','#fff2ff','#e2a7ff','#8be6d1'], sand:['#3b2b1d','#5b432d','#fff8ed','#f2c078','#81c8ff'], teal:['#0d2c32','#17454d','#edfdff','#61d9d4','#ffbd8a'], ember:['#2e1710','#51281d','#fff5ed','#ff8b5d','#f8d166'], slate:['#19222d','#2b394a','#f3f7fc','#9ec1ff','#81e3c1'], orchid:['#2a183c','#47275f','#fbf1ff','#d4a4ff','#ffb0c6'], ocean:['#102e4b','#1c4a6e','#edf9ff','#61d4ff','#a1f0d3'], clay:['#3b221c','#604034','#fff4ee','#e69066','#97c9cf'], moss:['#1c2c1c','#314934','#f2faeb','#a6d979','#f0c287'], midnight:['#0e1118','#1a2030','#f2f5ff','#93a8ff','#f0b4ff'], sun:['#332307','#594013','#fff8e6','#ffd35b','#ff9278'], berry:['#321428','#572344','#fff2fb','#ff86c2','#aa9cff'], aqua:['#0e3138','#1c515b','#effdff','#71e2ee','#ffd27c'], wine:['#31121b','#571f30','#fff2f4','#ee7588','#e9b66b'], paper:['#f4eee2','#e7d9c5','#2c2520','#c65e4b','#315d8e'], cobalt:['#101d4b','#203779','#f5f7ff','#6f9cff','#ffcf70'], fern:['#15281e','#294335','#f0fbf4','#8ed782','#f3c477'], neon:['#15151d','#282834','#fbfbff','#b0ff4a','#ff6fbd'], peach:['#3b211f','#5d3934','#fff4f0','#ffae8d','#8fc6ff'], graphite:['#17191d','#292d35','#f7f7f7','#c8cdd7','#78d7c1'], lavender:['#292238','#453a59','#fbf8ff','#baa7ff','#ffb8d2'], ruby:['#351217','#5d2029','#fff4f4','#fa6f7c','#f5cb70'], ice:['#17313b','#285160','#effcff','#82e1ff','#aec4ff'], ochre:['#39260d','#60441c','#fff8e9','#efb64f','#df7a52'], jade:['#112d25','#1f4a3e','#effff8','#70dfb1','#ffe07a'], noir:['#111111','#222222','#ffffff','#fafafa','#b7ff5b'],
  };
  const fonts = '"Bricolage Grotesque","Noto Sans Kannada","Nirmala UI",sans-serif';
  let activeFont = fonts;
  const decimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const formatNumber = new Intl.NumberFormat(undefined,{maximumFractionDigits:8});
  const number = value => formatNumber.format(value);
  const validNumber = value => decimal.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e15;
  const skippedRows = count => count + (count===1 ? ' row skipped.' : ' rows skipped.');

  function font(ctx,size,weight=700) {
    ctx.font = weight + ' ' + size + 'px ' + activeFont;
  }

  function text(ctx,value,x,y,maxWidth) {
    ctx.fillText(value,x,y,maxWidth);
  }

  function lines(ctx,value,x,y,width,lineHeight,maxLines) {
    const words = value.trim().split(/\s+/u).filter(Boolean);
    for (let row=0; words.length && row<maxLines; row++) {
      let line = words.shift();
      while (words.length && ctx.measureText(line + ' ' + words[0]).width < width) line += ' ' + words.shift();
      if (row === maxLines - 1 && words.length) line += '…';
      text(ctx,line,x,y,width);
      y += lineHeight;
    }
    return y;
  }

  function block(ctx,x,y,w,h,r,color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,r);
    ctx.fill();
  }

  function begin(canvas,height,theme,title,subtitle,source,kind,options={}) {
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0,0,1080,height);
    if (!options.noFrame) {
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(28,28,1024,height-56,24);
      ctx.stroke();
    }
    ctx.fillStyle = theme.accent;
    const titleX = Number(options.titleX || 0), titleY = Number(options.titleY || 0);
    const deckX = Number(options.deckX || titleX), deckY = Number(options.deckY || titleY);
    ctx.fillRect(65+titleX,61+titleY,42,8);
    font(ctx,24,700);
    text(ctx,kind,123+titleX,75+titleY,820);
    ctx.fillStyle = theme.ink;
    const titleSize = Number(options.titleSize || 74);
    const bodySize = Number(options.bodySize || 32);
    font(ctx,titleSize,800);
    let y = lines(ctx,title,64+titleX,165+titleY,952,Math.round(titleSize*1.07),2);
    ctx.fillStyle = theme.soft;
    font(ctx,bodySize,550);
    if (subtitle.trim()) y = lines(ctx,subtitle,67+deckX,y-10+deckY,940,Math.round(bodySize*1.18),2) + 8;
    ctx.fillStyle = theme.line;
    ctx.fillRect(64,height-105,952,2);
    ctx.fillStyle = theme.soft;
    font(ctx,22,600);
    text(ctx,source,66,height-68,948);
    return {ctx,top:Math.max(y+15,240),bottom:height-136};
  }

  function editable(ids,key,render) {
    const fields = ids.map(get);
    try {
      const stored = JSON.parse(lsGet(key));
      if (stored) for (const field of fields) {
        const value = stored[field.id];
        if (field.type === 'checkbox' && typeof value === 'boolean') field.checked = value;
        else if (typeof value === 'string' && (field.tagName !== 'SELECT' || [...field.options].some(option => option.value === value))) field.value = value;
      }
    } catch {}
    const save = () => {
      lsSet(key,JSON.stringify(Object.fromEntries(fields.map(field => [field.id,field.type === 'checkbox' ? field.checked : field.value]))));
      render();
    };
    for (const field of fields) field.addEventListener('input',save);
    return save;
  }

  function actions(prefix,canvas,filename,description) {
    const download = get(prefix+'Download');
    const apply = get(prefix+'Apply');
    const status = get(prefix+'Status');
    let valid = false;
    let busy = false;
    function enable(next) {
      valid = next;
      download.disabled = apply.disabled = !valid || busy;
    }
    async function run(toPoster) {
      if (!valid || busy) return;
      busy = true;
      enable(valid);
      try {
        const blob = await encodeArtwork(canvas,'image/png');
        if (toPoster) await applyCreatorImage(blob,description);
        else downloadBlob(blob,filename);
      } catch { status.textContent = 'Could not export this graphic. Try again.'; }
      finally {
        busy = false;
        enable(valid);
      }
    }
    download.addEventListener('click',() => run(false));
    apply.addEventListener('click',() => run(true));
    return enable;
  }

  const infoCanvas = get('infoCanvas');
  const infoStatus = get('infoStatus');
  const enableInfo = actions('info',infoCanvas,'avi-infographic.png','Infographic created in AvI Studio.');
  const templates = {
    bars:{name:'BAR CHART',hint:'Up to six lines in Label | Number format. Negative values are supported.',sample:'Research | 32\nWriting | 25\nDesign | 28\nReview | 15'},
    timeline:{name:'TIMELINE',hint:'Up to six events in Date or step | Description format.',sample:'08:00 | Select the lead story\n10:30 | Verify the source material\n13:00 | Design the visual\n17:00 | Publish the edition'},
    stats:{name:'KEY FIGURES',hint:'Up to six cards in Label | Value format. Values can include units.',sample:'Sources checked | 12\nPhoto options | 6\nDrafts reviewed | 3\nFinal edition | 1'},
    comparison:{name:'COMPARISON',hint:'Two columns in Heading | Detail format. Separate points with semicolons.',sample:'Single poster | One strong image;Short headline;Quick to scan\nCarousel | Multiple frames;Step-by-step detail;Room for context'},
  };

  function drawBars(ctx,entries,theme,top,bottom) {
    const values = entries.map(entry => Number(entry[1]));
    const lo = Math.min(0,...values), hi = Math.max(0,...values);
    const row = (bottom-top)/entries.length;
    const scale = 914/(hi-lo || 1);
    const zero = 83 - lo*scale;
    for (const [index,[label,value]] of entries.entries()) {
      const y = top + index*row;
      ctx.fillStyle = theme.ink;
      font(ctx,29);
      text(ctx,label,82,y+37,625);
      ctx.textAlign = 'right';
      text(ctx,number(Number(value)),998,y+37,270);
      ctx.textAlign = 'left';
      const barY = y + 52;
      const h = Math.min(36,Math.max(16,row-63));
      block(ctx,82,barY,916,h,9,theme.card);
      const length = Math.abs(Number(value)*scale);
      if (length) block(ctx,Number(value)<0 ? zero-length : zero,barY,length,h,Math.min(8,length/2),Number(value)<0 ? theme.secondary : theme.accent);
    }
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = theme.line;
      ctx.beginPath();
      ctx.moveTo(zero,top+49);
      ctx.lineTo(zero,bottom-10);
      ctx.stroke();
    }
  }

  function drawTimeline(ctx,entries,theme,top,bottom) {
    const row = (bottom-top)/entries.length;
    ctx.fillStyle = theme.line;
    ctx.fillRect(111,top+34,3,Math.max(1,(entries.length-1)*row));
    for (const [index,[label,value]] of entries.entries()) {
      const y = top + index*row;
      block(ctx,98,y+23,28,28,14,theme.accent);
      block(ctx,160,y+6,832,row-13,16,theme.card);
      ctx.fillStyle = theme.accent;
      font(ctx,26,750);
      text(ctx,label,185,y+36,775);
      ctx.fillStyle = theme.ink;
      font(ctx,29,650);
      lines(ctx,value,185,y+67,775,31,row>=111 ? 2 : 1);
    }
  }

  function drawStats(ctx,entries,theme,top,bottom) {
    const rows = Math.ceil(entries.length/2);
    const cellH = (bottom-top)/rows;
    for (const [index,[label,value]] of entries.entries()) {
      const x = 72 + (index%2)*475, y = top + Math.floor(index/2)*cellH;
      block(ctx,x,y,459,cellH-14,18,theme.card);
      ctx.fillStyle = theme.accent;
      font(ctx,Math.min(80,cellH*.36),800);
      text(ctx,value,x+23,y+cellH*.47,411);
      ctx.fillStyle = theme.ink;
      font(ctx,29,650);
      lines(ctx,label,x+23,y+cellH*.68,411,32,2);
    }
  }

  function drawComparison(ctx,entries,theme,top,bottom) {
    for (const [index,[label,value]] of entries.entries()) {
      const x = 70 + index*476;
      block(ctx,x,top,459,bottom-top,20,theme.card);
      ctx.fillStyle = index ? theme.secondary : theme.accent;
      font(ctx,43,800);
      const start = lines(ctx,label,x+22,top+63,412,48,2);
      const items = value.split(';').map(part => part.trim()).filter(Boolean).slice(0,5);
      const row = Math.min(110,(bottom-start-25)/Math.max(1,items.length));
      for (const [i,item] of items.entries()) {
        const y = start + 18 + i*row;
        ctx.fillStyle = theme.line;
        ctx.fillRect(x+24,y-19,410,2);
        ctx.fillStyle = theme.ink;
        font(ctx,28,650);
        lines(ctx,item,x+24,y+16,410,31,row>=68 ? 2 : 1);
      }
    }
  }

  function renderInfo() {
    activeFont = fonts;
    const selected = get('infoTemplate').value;
    const config = templates[selected];
    const limit = selected === 'comparison' ? 2 : 6;
    const height = Number(get('infoShape').value);
    const theme = palettes[get('infoTheme').value];
    const entries = [];
    let skipped = 0;
    for (const line of get('infoData').value.split('\n').filter(value => value.trim())) {
      const divider = line.indexOf('|');
      const label = line.slice(0,divider).trim();
      const value = line.slice(divider+1).trim();
      if (divider<1 || !label || !value || entries.length===limit ||
        (selected==='bars' && !validNumber(value))) {
        skipped++;
      } else entries.push([label,value]);
    }
    get('infoHint').textContent = config.hint;
    const {ctx,top,bottom} = begin(infoCanvas,height,theme,get('infoTitle').value || 'Untitled infographic',
      get('infoDeck').value,get('infoSource').value,config.name);
    if (entries.length) {
      const draw = {bars:drawBars,timeline:drawTimeline,stats:drawStats,comparison:drawComparison}[selected];
      draw(ctx,entries,theme,top,bottom);
    }
    const valid = entries.length >= (selected==='comparison' ? 2 : 1);
    infoStatus.textContent = !valid ? 'Enter ' + (selected==='comparison' ? 'two valid columns.' : 'at least one valid entry.')
      : skipped ? skippedRows(skipped) + ' Check the format and entry limit.' : '';
    infoCanvas.setAttribute('aria-label',get('infoTitle').value + '. ' + entries.map(([label,value]) => label + ': ' + value).join('. '));
    enableInfo(valid);
  }

  const saveInfo = editable(['infoTemplate','infoTheme','infoTitle','infoDeck','infoData','infoSource','infoShape'],'app_infographic',renderInfo);
  get('infoSample').addEventListener('click',() => {
    get('infoData').value = templates[get('infoTemplate').value].sample;
    saveInfo();
  });
  renderInfo();

  const mapCanvas = get('mapCanvas');
  const mapStatus = get('mapStatus');
  const enableMap = actions('map',mapCanvas,'avi-map-graphic.png','Map graphic created in AvI Studio.');
  const regions = {
    world:[-180,180,-58,84], southAsia:[59,101,4,42],
    europe:[-25,45,33,72], africa:[-26,58,-38,39], americas:[-169,-29,-58,76], eastAsia:[90,180,-48,55],
  };
  const territory = get('mapRegion');
  const mapScope = get('mapScope');
  const mapDesign = get('mapDesign');
  const statePick = get('mapStatePick');
  const stateFocus = get('mapStateFocus');
  const stateValues = get('mapStateValues');
  const mapKey = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s*&\s*/g,' and ');
  const isIndia = () => territory.value.startsWith('india');
  const isStates = () => territory.value === 'indiaStates';
  const isDistricts = () => territory.value === 'indiaDistricts';
  const isPC = () => territory.value === 'indiaPC';
  const isAC = () => territory.value === 'indiaAC';
  const isBoundaryLayer = () => isDistricts() || isPC() || isAC();
  const mapDataKey = () => isDistricts() ? 'districts' : isPC() ? 'pc' : isAC() ? 'ac' : isIndia() ? 'india' : 'world';
  const dataSets = {};
  let focusCode = '';
  let hitAreas = [];
  let outlineHitPath;
  let open = false;
  let dragAreas = [];
  let dragState = null;
  let suppressMapClick = false;
  let mapPositions = {title:{x:0,y:0},deck:{x:0,y:0},map:{x:0,y:0},pins:{x:0,y:0},rail:{x:0,y:0}};

  function safePositions(value) {
    const next = {title:{x:0,y:0},deck:{x:0,y:0},map:{x:0,y:0},pins:{x:0,y:0},rail:{x:0,y:0}};
    for (const key of Object.keys(next)) if (value?.[key] && Number.isFinite(value[key].x) && Number.isFinite(value[key].y)) {
      next[key] = {x:Math.max(-300,Math.min(300,value[key].x)),y:Math.max(-300,Math.min(300,value[key].y))};
    }
    return next;
  }

  function mapTypeface() {
    const presets = {
      anek:'"Anek Kannada","Noto Sans Kannada","Nirmala UI",sans-serif',
      noto:'"Noto Sans Kannada","Nirmala UI",sans-serif',
      bricolage:fonts,
      system:'"Nirmala UI","Noto Sans Kannada",sans-serif',
    };
    return get('mapFont').value === 'custom' ? (get('mapCustomFont').value.trim() || presets.anek) : presets[get('mapFont').value] || presets.anek;
  }

  function featureBounds(features) {
    const values = [];
    const stack = features.map(feature=>feature.geometry?.coordinates).filter(Boolean);
    while (stack.length) {
      const value = stack.pop();
      if (!Array.isArray(value)) continue;
      if (Number.isFinite(value[0]) && Number.isFinite(value[1])) values.push(value);
      else for (const item of value) stack.push(item);
    }
    let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
    for (const point of values) if (Number.isFinite(point?.[0]) && Number.isFinite(point?.[1])) {
      west=Math.min(west,point[0]); east=Math.max(east,point[0]); south=Math.min(south,point[1]); north=Math.max(north,point[1]);
    }
    return Number.isFinite(west) ? [west,east,south,north] : [65,98,5,37];
  }

  function featureIdentity(properties={}) {
    const value = properties.code || properties.dtcode || properties.pc_id || properties.PC_ID || properties.AC_NO || properties.district || properties.pc_name || properties.PC_NAME || properties.AC_NAME || properties.ADM0_A3;
    return value === undefined || value === null ? '' : String(value);
  }

  function featureLabel(properties={}) {
    return properties.district || properties.pc_name || properties.PC_NAME || properties.AC_NAME || properties.ADMIN || properties.NAME || featureIdentity(properties) || 'Area';
  }

  function featureState(properties={}) {
    return properties.state || properties.state_name || properties.st_name || properties.ST_NAME || '';
  }

  function stateDisplayName(value) {
    const raw = String(value || '').trim().replace(/\s+/g,' ');
    if (!raw) return '';
    const overrides = {
      'andaman and nicobar islands':'Andaman & Nicobar Islands',
      'dadra and nagar haveli and daman and diu':'Dadra & Nagar Haveli and Daman & Diu',
      'jammu and kashmir':'Jammu & Kashmir',
      'nct of delhi':'Delhi',
    };
    const key = mapKey(raw);
    if (overrides[key]) return overrides[key];
    return raw.toLocaleLowerCase('en-IN').replace(/(^|[\s-])[a-z]/g,letter=>letter.toLocaleUpperCase('en-IN'));
  }

  function syncScopeCopy(boundaryLayer) {
    const type = isDistricts() ? 'district' : isPC() ? 'Lok Sabha constituency' : isAC() ? 'Assembly constituency' : 'map';
    get('mapScopeLabel').textContent = boundaryLayer ? 'State / UT focus' : 'State / UT focus';
    get('mapScopeHint').textContent = boundaryLayer
      ? 'Show ' + type + ' boundaries for one state at a time.'
      : 'Choose a boundary map first to focus on a state.';
  }

  function refreshMapScopes(data) {
    const current = mapScope.value === 'all' ? 'all' : mapKey(mapScope.value);
    const states = new Map();
    for (const feature of data.features || []) {
      const raw = featureState(feature.properties);
      const key = mapKey(raw);
      if (key && !states.has(key)) states.set(key,stateDisplayName(raw));
    }
    const options = [...states.entries()].sort((a,b)=>a[1].localeCompare(b[1],'en-IN')).map(([key,name])=>new Option(name,key));
    mapScope.replaceChildren(new Option('All India','all'),...options);
    mapScope.value = [...mapScope.options].some(option=>option.value===current) ? current : 'all';
  }

  function projector(bounds,top,bottom,frame) {
    const [west,east,south,north] = bounds;
    const aspect = Math.cos((south+north)*Math.PI/360);
    const area = frame || {x:90,y:top,width:900,height:bottom-top};
    const scale = Math.min(area.width/((east-west)*aspect),(area.height-38)/(north-south));
    const width = (east-west)*scale*aspect, height = (north-south)*scale;
    const x = area.x+(area.width-width)/2, y = area.y+(area.height-height)/2;
    return {x,y,width,height,point:([lon,lat]) => [x+(lon-west)*scale*aspect,y+(north-lat)*scale]};
  }

  function indiaBounds([west,south,east,north], zoom=false) {
    const pad = zoom ? Math.max(.08,(east-west)*.13,(north-south)*.13) : .7;
    return [west-pad,east+pad,south-pad,north+pad];
  }

  function mixColor(a,b,t) {
    const rgb = value => value.slice(1).match(/../g).map(pair => parseInt(pair,16));
    const from = rgb(a), to = rgb(b);
    return 'rgb(' + from.map((channel,i) => Math.round(channel + (to[i]-channel)*t)).join(',') + ')';
  }

  function polygonPath(geometry,project) {
    const path = new Path2D();
    const polygons = geometry.type==='Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      if (!ring.length) continue;
      path.moveTo(...project(ring[0]));
      for (let i=1; i<ring.length; i++) path.lineTo(...project(ring[i]));
      path.closePath();
    }
    return path;
  }

  function drawCalloutRail(ctx,rows,theme,top,bottom,map,layout,offset={x:0,y:0}) {
    const selected = rows.slice(0,4);
    if (!selected.length) return;
    const rightSide = layout === 'briefing';
    const x = (rightSide ? 682 : 64) + offset.x, w = 334;
    const available = bottom-top-20;
    const h = Math.max(98,Math.min(138,(available-(selected.length-1)*16)/selected.length));
    selected.forEach((row,index) => {
      const y = top+10+index*(h+16)+offset.y;
      const accent = ['#ef6b73','#f4bd50','#5ed1c5','#8674f7'][index];
      const [anchorX,anchorY] = map.point(row.state.anchor);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(anchorX,anchorY);
      const elbow = rightSide ? map.x+map.width+18 : map.x-18;
      ctx.lineTo(elbow,anchorY);
      ctx.lineTo(elbow,y+h/2);
      ctx.lineTo(rightSide ? x : x+w,y+h/2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(anchorX,anchorY,17,0,Math.PI*2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = theme.bg;
      ctx.textAlign = 'center';
      font(ctx,20,800);
      text(ctx,String(index+1),anchorX,anchorY+7,28);
      ctx.textAlign = 'left';
      block(ctx,x,y,w,h,18,theme.card);
      block(ctx,x+18,y+17,42,42,21,accent);
      ctx.fillStyle = theme.bg;
      ctx.textAlign = 'center';
      font(ctx,22,800);
      text(ctx,String(index+1),x+39,y+45,30);
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.ink;
      font(ctx,25,800);
      text(ctx,row.state.name,x+75,y+35,w-92);
      if (Number.isFinite(row.value)) {
        ctx.fillStyle = accent;
        font(ctx,24,800);
        text(ctx,number(row.value),x+75,y+62,w-92);
      }
      ctx.fillStyle = theme.soft;
      font(ctx,19,600);
      lines(ctx,row.note || 'Highlighted state',x+18,y+h-24,w-36,23,2);
    });
    if (layout==='dashboard') {
      const y = bottom-118+offset.y;
      block(ctx,x,y,w,108,18,theme.bg);
      ctx.fillStyle = theme.accent;
      font(ctx,18,800);
      text(ctx,'STORY SIGNAL',x+18,y+30,w-36);
      ctx.fillStyle = theme.ink;
      font(ctx,39,800);
      text(ctx,String(rows.length).padStart(2,'0'),x+18,y+78,110);
      ctx.fillStyle = theme.soft;
      font(ctx,19,600);
      lines(ctx,'state highlights ready for your story',x+100,y+57,w-118,23,2);
    }
  }

  function renderMap() {
    activeFont = mapTypeface();
    mapCanvas.dataset.draggable = 'true';
    const india = isIndia(), stateMode = isStates(), boundaryLayer = isBoundaryLayer();
    // India boundary views are intentionally state-first. This avoids stale
    // district/constituency names leaking between different map layers.
    get('mapCountryOptions').hidden = india;
    get('mapStateOptions').hidden = !stateMode;
    get('mapLayoutField').hidden = !(stateMode || boundaryLayer);
    get('mapScopeRow').hidden = false;
    mapScope.disabled = !boundaryLayer;
    syncScopeCopy(boundaryLayer);
    get('mapIndiaCredits').hidden = !india;
    get('mapWorldCredits').hidden = india;
    stateFocus.setAttribute('aria-pressed',String(Boolean(focusCode)));
    stateFocus.textContent = focusCode ? 'Show all India' : 'Focus state';
    hitAreas = [];
    outlineHitPath = null;
    const data = dataSets[mapDataKey()];
    if (!data) {
      enableMap(false);
      if (open) void loadMap(mapDataKey());
      return;
    }

    const baseTheme = get('mapDesign').value === 'signal' ? palettes[get('mapTheme').value] : (() => {
      const [bg,card,ink,accent,secondary] = designLooks[get('mapDesign').value] || designLooks.signal;
      return {bg,card,ink,accent,secondary,soft:ink+'bb',line:accent+'88'};
    })();
    const theme = get('mapUseCustomColors').checked ? {...baseTheme,ink:get('mapTextColor').value,accent:get('mapAccentColor').value,card:get('mapPanelColor').value} : baseTheme;
    const layout = (stateMode || boundaryLayer) ? get('mapLayout').value : 'atlas';
    const height = Number(get('mapShape').value);
    const credit = [get('mapSource').value.trim(),stateMode ? 'India viewpoint · Natural Earth · © OpenStreetMap contributors (openstreetmap.org/copyright)'
      : india ? 'Made with Natural Earth · India viewpoint' : 'Made with Natural Earth'].filter(Boolean).join('  ·  ');
    const titleSize = Number(get('mapTitleSize').value);
    const bodySize = Number(get('mapBodySize').value);
    const {ctx,top,bottom} = begin(mapCanvas,height,theme,get('mapTitle').value || 'Untitled map',get('mapDeck').value,credit,'MAP GRAPHIC',{
      titleX:mapPositions.title.x,titleY:mapPositions.title.y,deckX:mapPositions.deck.x,deckY:mapPositions.deck.y,titleSize,bodySize,noFrame:true,
    });
    const focus = stateMode && focusCode ? data.states.find(state => state.code === focusCode) : null;
    const scopeKey = boundaryLayer ? mapKey(mapScope.value) : 'all';
    const scopedFeatures = boundaryLayer && scopeKey !== 'all'
      ? data.features.filter(feature=>mapKey(featureState(feature.properties))===scopeKey)
      : data.features;
    const scopeName = boundaryLayer && scopeKey !== 'all'
      ? (mapScope.options[mapScope.selectedIndex]?.textContent || 'the selected state')
      : 'All India';
    const view = boundaryLayer ? featureBounds(scopedFeatures) : india ? indiaBounds(focus ? focus.bounds : data.bounds, Boolean(focus)) : regions[territory.value];
    const fills = new Map();
    const stateRows = [];
    let skipped = 0;
    const savedValues = get('mapValues').value;
    const input = stateMode || india ? '' : savedValues;
    for (const line of input.split('\n').filter(value => value.trim())) {
      const [label,raw,note] = line.split('|');
      const id = data.names.get(mapKey(label));
      const value = raw?.trim();
      if (!id || (value && !validNumber(value))) skipped++;
      else {
        const numeric = value ? Number(value) : null;
        fills.set(id,numeric);
        if (stateMode) {
          const state = data.states.find(item => item.code===id);
          if (state) stateRows.push({id,state,value:numeric,note:note?.trim() || ''});
        }
      }
    }
    const values = [...fills.values()].filter(Number.isFinite);
    const low = values.length ? Math.min(...values) : 0;
    const high = values.length ? Math.max(...values) : 1;
    const categorical = ['#a43e50','#416a8b','#507850','#a75332','#6b4d8a','#277d79'];
    const railLayout = stateMode && !focus && layout!=='atlas' && layout!=='spotlight';
    const legendSpace = values.length ? 77 : 8;
    const railWidth = railLayout ? 520 : 0;
    const rightRail = layout === 'briefing';
    const mapScale = Number(get('mapScale').value)/100;
    const defaultFrame = railLayout ? {x:rightRail ? 64 : railWidth,y:top,width:500,height:bottom-top-legendSpace} : {x:90,y:top,width:900,height:bottom-top-legendSpace};
    const scaledFrame = {width:defaultFrame.width*mapScale,height:(defaultFrame.height)*mapScale};
    scaledFrame.x = defaultFrame.x+(defaultFrame.width-scaledFrame.width)/2+mapPositions.map.x;
    scaledFrame.y = defaultFrame.y+(defaultFrame.height-scaledFrame.height)/2+mapPositions.map.y;
    const map = projector(view,top,bottom-legendSpace,scaledFrame);
    dragAreas = [
      {key:'title',x:42+mapPositions.title.x,y:38+mapPositions.title.y,w:996,h:170},
      {key:'deck',x:42+mapPositions.deck.x,y:140+mapPositions.deck.y,w:996,h:115},
      {key:'map',x:map.x-22,y:map.y-22,w:map.width+44,h:map.height+44},
    ];
    const labelBoxes = [];
    block(ctx,map.x-13,map.y-13,map.width+26,map.height+26,18,theme.bg);
    ctx.save();
    ctx.beginPath();
    ctx.rect(map.x,map.y,map.width,map.height);
    ctx.clip();
    ctx.lineJoin = 'round';

    function labelAt(label,x,y,color) {
      font(ctx,23,800);
      const width = Math.min(250,ctx.measureText(label).width) + 18;
      const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
      const candidates = [[0,0],[0,-36],[0,36],[30,-65],[-30,65]];
      for (const [dx,dy] of candidates) {
        const left = clamp(x+dx-width/2,map.x+4,map.x+map.width-width-4);
        const top = clamp(y+dy-20,map.y+4,map.y+map.height-34);
        const box = [left,top,left+width,top+30];
        if (labelBoxes.some(([l,t,r,b]) => box[0]<r+4 && box[2]>l-4 && box[1]<b+4 && box[3]>t-4)) continue;
        labelBoxes.push(box);
        if (dx || dy) {
          ctx.beginPath();
          ctx.moveTo(x,y);
          ctx.lineTo(clamp(x,left,left+width),clamp(y,top,top+30));
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = theme.line;
          ctx.stroke();
        }
        block(ctx,left,top,width,30,6,theme.bg);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        text(ctx,label,left+width/2,top+22,width-12);
        ctx.textAlign = 'left';
        return;
      }
    }

    function featureColor(id,index) {
      const value = fills.get(id);
      if (!fills.has(id)) return mixColor(theme.card,theme.ink,.18);
      if (value===null) return stateMode ? categorical[index%categorical.length] : theme.accent;
      return mixColor(theme.card,theme.accent,high===low ? .9 : .28 + .72*((value-low)/(high-low)));
    }

    if (india && !boundaryLayer) {
      const outline = polygonPath(data.outline,map.point);
      ctx.fillStyle = stateMode ? mixColor(theme.card,theme.ink,.18) : theme.accent;
      outlineHitPath = outline;
      if (!focus) ctx.fill(outline,'evenodd');
      if (stateMode) {
        ctx.save();
        ctx.clip(outline,'evenodd');
        const states = focus ? [focus] : data.states;
        for (const state of states) {
          const path = polygonPath(state.geometry,map.point);
          ctx.fillStyle = focus && !fills.has(state.code) ? theme.accent : featureColor(state.code,[...fills.keys()].indexOf(state.code));
          ctx.fill(path,'evenodd');
          ctx.lineWidth = 1.55;
          ctx.strokeStyle = theme.bg;
          ctx.stroke(path);
          hitAreas.push({code:state.code,path});
        }
        ctx.restore();
        const labels = railLayout ? 'off' : get('mapLabels').value;
        if (labels !== 'off') {
          const named = [...states].sort((a,b)=>Number(fills.has(b.code))-Number(fills.has(a.code)));
          for (const state of named) {
            if (!focus && !fills.has(state.code) && labels !== 'codes') continue;
            const [x,y] = map.point(state.anchor);
            const value = fills.get(state.code);
            const name = focus || labels==='highlights' ? state.name : state.code.slice(3);
            labelAt(name+(Number.isFinite(value) ? ' · '+number(value) : ''),x,y,theme.ink);
          }
        }
      }
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = theme.line;
      if (!focus) ctx.stroke(outline);
    } else {
      ctx.lineWidth = 1.25;
      for (const {geometry,properties} of scopedFeatures) {
        if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) continue;
        const path = polygonPath(geometry,map.point);
        ctx.fillStyle = featureColor(featureIdentity(properties),0);
        ctx.strokeStyle = theme.bg;
        ctx.fill(path,'evenodd');
        ctx.stroke(path);
      }
    }

    const editorialMarkers = isDistricts() && data.editorialMarkers
      ? [...data.editorialMarkers.values()].filter(marker=>scopeKey==='all' || marker.stateKey===scopeKey)
      : [];
    for (const marker of editorialMarkers) {
      const [x,y] = map.point([marker.lon,marker.lat]);
      const radius = 11*Number(get('mapMarkerSize').value)/100;
      ctx.beginPath();
      ctx.arc(x,y,radius,0,Math.PI*2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.bg;
      ctx.stroke();
      labelAt(marker.label,x+radius+18,y+radius+10,theme.ink);
      dragAreas.push({key:'pins',x:x-radius-14,y:y-radius-14,w:radius*2+28,h:radius*2+28});
    }

    let pinCount = 0;
    for (const line of get('mapPins').value.split('\n').filter(value => value.trim())) {
      const [label,latText,lonText] = line.split('|').map(value => value.trim());
      const lat = Number(latText), lon = Number(lonText);
      if (!label || !latText || !lonText || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180 || pinCount===10) {
        skipped++;
        continue;
      }
      if (lon<view[0] || lon>view[1] || lat<view[2] || lat>view[3]) continue;
      const [baseX,baseY] = map.point([lon,lat]);
      const x = baseX+mapPositions.pins.x, y = baseY+mapPositions.pins.y;
      if (focus && !ctx.isPointInPath(hitAreas[0].path,baseX,baseY,'evenodd')) continue;
      pinCount++;
      ctx.beginPath();
      const marker = 10*Number(get('mapMarkerSize').value)/100;
      ctx.arc(x,y,marker,0,Math.PI*2);
      ctx.fillStyle = theme.secondary;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 3;
      ctx.stroke();
      labelAt(label,x+marker+20,y+marker+12,theme.ink);
      dragAreas.push({key:'pins',x:x-marker-14,y:y-marker-14,w:marker*2+28,h:marker*2+28});
    }
    ctx.restore();

    if (railLayout) {
      drawCalloutRail(ctx,stateRows,theme,top,bottom-legendSpace,map,layout,mapPositions.rail);
      dragAreas.push({key:'rail',x:(layout==='briefing' ? 660 : 44)+mapPositions.rail.x,y:top+mapPositions.rail.y,w:376,h:bottom-top-legendSpace});
    }

    if (values.length) {
      const x = 95, y = bottom-44, width = 320;
      const gradient = ctx.createLinearGradient(x,0,x+width,0);
      gradient.addColorStop(0,mixColor(theme.card,theme.accent,.28));
      gradient.addColorStop(1,theme.accent);
      ctx.fillStyle = gradient;
      ctx.fillRect(x,y,width,15);
      ctx.fillStyle = theme.ink;
      font(ctx,22);
      text(ctx,number(low),x,y+40,150);
      if (low!==high) {
        ctx.textAlign = 'right';
        text(ctx,number(high),x+width,y+40,150);
        ctx.textAlign = 'left';
      }
    }
    const scopedMessage = boundaryLayer ? 'Showing ' + scopedFeatures.length.toLocaleString('en-IN') + ' ' + (isDistricts() ? 'district' : isPC() ? 'Lok Sabha constituency' : 'Assembly constituency') + (scopeKey==='all' ? ' boundaries across India.' : ' boundaries in ' + scopeName + '.') + ' ' : '';
    const markerMessage = editorialMarkers.length ? 'Vijayanagara is marked at its district headquarters; the supplied boundary layer predates its 2021 creation, so no boundary has been invented. ' : '';
    mapStatus.textContent = (skipped ? skippedRows(skipped) + ' Check names, coordinates, and formats. ' : '') + scopedMessage + markerMessage + 'Drag headline, map, pins, or fact cards to arrange this composition.';
    const subject = stateMode ? (focus ? focus.name : 'India, 36 states and union territories') : boundaryLayer ? scopeName + ' boundary map' : india ? 'India national outline' : 'Regional map';
    mapCanvas.setAttribute('aria-label',subject + '. ' + fills.size + ' highlights and ' + pinCount + ' visible pins.');
    enableMap(true);
  }

  const inflight = new Set();
  async function loadMap(key) {
    if (inflight.has(key)) return;
    inflight.add(key);
    mapStatus.textContent = 'Loading map data…';
    try {
      if (key==='india') {
        const localMap = self.AVI_INDIA_MAP;
        let data;
        if (localMap) data = JSON.parse(JSON.stringify(localMap));
        else {
          const response = await fetch('./assets/india-map.json.gz');
          if (!response.ok) throw new Error();
          const bytes = await response.arrayBuffer();
          const header = new Uint8Array(bytes,0,2);
          data = header[0]===31 && header[1]===139
            ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
            : JSON.parse(new TextDecoder().decode(bytes));
        }
        if (data.states?.length!==36 || !data.outline) throw new Error();
        data.names = new Map();
        const options = [];
        for (const state of data.states) {
          for (const value of [state.name,state.code,state.code.slice(3)]) data.names.set(mapKey(value),state.code);
          const option = document.createElement('option');
          option.value = state.code;
          option.textContent = state.name;
          options.push(option);
        }
        for (const [alias,code] of [['ಕರ್ನಾಟಕ','IN-KA'],['Orissa','IN-OD'],['Telengana','IN-TG'],['Pondicherry','IN-PY'],['Uttaranchal','IN-UT'],['New Delhi','IN-DL']]) data.names.set(mapKey(alias),code);
        statePick.replaceChildren(...options);
        statePick.value = 'IN-KA';
        statePick.disabled = get('mapStateHighlight').disabled = stateFocus.disabled = false;
        dataSets.india = data;
      } else if (key==='districts') {
        const response = await fetch('./assets/india-districts-display.geojson');
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.features) || data.features.length < 700) throw new Error();
        data.names = new Map();
        for (const feature of data.features) {
          const p = feature.properties || {};
          for (const value of [p.district,p.code]) if (value) data.names.set(mapKey(value),p.code || p.district);
        }
        // The supplied Survey of India display layer predates the 2021
        // Vijayanagara split. Keep the update visible and searchable without
        // inventing a district boundary that the source does not contain.
        const vijayanagara = {id:'editorial-vijayanagara',label:'Vijayanagara · Karnataka',stateKey:'karnataka',lon:76.391,lat:15.267};
        data.editorialMarkers = new Map([[vijayanagara.id,vijayanagara]]);
        data.names.set(mapKey('Vijayanagara'),vijayanagara.id);
        data.names.set(mapKey('Vijayanagara District'),vijayanagara.id);
        data.names.set(mapKey('Vijayanagar'),vijayanagara.id);
        data.bounds = featureBounds(data.features);
        dataSets.districts = data;
        refreshMapScopes(data);
      } else if (key==='pc' || key==='ac') {
        const response = await fetch(key==='pc' ? './assets/india-pc-2019-display.geojson' : './assets/india-ac-display.geojson');
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.features) || !data.features.length) throw new Error();
        data.names = new Map();
        for (const feature of data.features) {
          const p = feature.properties || {}, id = String(featureIdentity(p));
          for (const value of [featureLabel(p),id,p.pc_name,p.PC_NAME,p.AC_NAME]) if (value) data.names.set(mapKey(value),id);
        }
        data.bounds = featureBounds(data.features);
        dataSets[key] = data;
        refreshMapScopes(data);
      } else {
        const response = await fetch('./assets/vision/world.geojson');
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.features) || !data.features.length) throw new Error();
        data.names = new Map();
        for (const {properties:p} of data.features) for (const value of [p.ADMIN,p.NAME,p.NAME_LONG,p.ADM0_A3,p.ISO_A2,p.ISO_A3,p.ISO_A3_EH]) {
          if (value && value!=='-99') data.names.set(mapKey(value),p.ADM0_A3);
        }
        dataSets.world = data;
      }
      if (key===mapDataKey()) renderMap();
    } catch (error) {
      console.error('Map layer error',key,error);
      if (key===mapDataKey()) mapStatus.textContent = 'Map data could not load: ' + (error?.message || 'unknown error');
    } finally { inflight.delete(key); }
  }

  const saveMap = editable(['mapRegion','mapScope','mapDesign','mapTheme','mapLayout','mapTitle','mapDeck','mapValues','mapPins','mapSource','mapShape','mapStateValues','mapLabels','mapFont','mapCustomFont','mapTitleSize','mapBodySize','mapScale','mapMarkerSize','mapUseCustomColors','mapTextColor','mapAccentColor','mapPanelColor'],'app_mapGraphic',renderMap);
  const syncMapControls = () => {
    get('mapCustomColors').hidden = !get('mapUseCustomColors').checked;
    for (const [id,suffix] of [['mapTitleSize',''],['mapBodySize',''],['mapScale','%'],['mapMarkerSize','%']]) get(id+'Out').textContent = get(id).value+suffix;
  };
  try { mapPositions = safePositions(JSON.parse(lsGet('app_mapPositions') || 'null')); } catch {}
  for (const id of ['mapTitleSize','mapBodySize','mapScale','mapMarkerSize','mapUseCustomColors']) get(id).addEventListener('input',syncMapControls);
  get('mapUseCustomColors').addEventListener('change',syncMapControls);
  get('mapResetPositions').addEventListener('click',()=>{ mapPositions = safePositions(); lsSet('app_mapPositions',JSON.stringify(mapPositions)); renderMap(); });
  syncMapControls();

  function canvasPoint(event) {
    const rect = mapCanvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*mapCanvas.width/rect.width,y:(event.clientY-rect.top)*mapCanvas.height/rect.height};
  }
  mapCanvas.addEventListener('pointerdown',event=>{
    const point = canvasPoint(event);
    const area = [...dragAreas].reverse().find(item=>point.x>=item.x && point.x<=item.x+item.w && point.y>=item.y && point.y<=item.y+item.h);
    if (!area) return;
    dragState = {key:area.key,start:point,position:{...mapPositions[area.key]},moving:false};
    mapCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  mapCanvas.addEventListener('pointermove',event=>{
    if (!dragState) return;
    const point = canvasPoint(event);
    if (!dragState.moving && Math.hypot(point.x-dragState.start.x,point.y-dragState.start.y)<4) return;
    dragState.moving = true;
    mapCanvas.dataset.dragging = 'true';
    mapPositions[dragState.key] = {x:Math.round(dragState.position.x+point.x-dragState.start.x),y:Math.round(dragState.position.y+point.y-dragState.start.y)};
    renderMap();
  });
  function endMapDrag(event) {
    if (!dragState) return;
    if (dragState.moving) {
      mapPositions = safePositions(mapPositions);
      lsSet('app_mapPositions',JSON.stringify(mapPositions));
      suppressMapClick = true;
    }
    dragState = null;
    delete mapCanvas.dataset.dragging;
    if (mapCanvas.hasPointerCapture(event.pointerId)) mapCanvas.releasePointerCapture(event.pointerId);
    renderMap();
  }
  mapCanvas.addEventListener('pointerup',endMapDrag);
  mapCanvas.addEventListener('pointercancel',endMapDrag);

  function toggleState(code) {
    const data = dataSets.india;
    const state = data?.states.find(item=>item.code===code);
    if (!state) return;
    const lines = stateValues.value.split('\n').filter(line=>line.trim());
    const remaining = lines.filter(line=>data.names.get(mapKey(line.split('|')[0]))!==code);
    stateValues.value = (remaining.length === lines.length ? [...lines,state.name] : remaining).join('\n');
    saveMap();
  }

  get('mapStateHighlight').addEventListener('click',()=>toggleState(statePick.value));
  stateFocus.addEventListener('click',()=>{ focusCode = focusCode ? '' : statePick.value; renderMap(); });
  statePick.addEventListener('change',()=>{ if (focusCode) { focusCode = statePick.value; renderMap(); } });
  territory.addEventListener('change',()=>{
    focusCode = '';
    if (isBoundaryLayer() && get('mapValues').value.trim().toUpperCase() === 'IND') get('mapValues').value = '';
    renderMap();
  });
  mapScope.addEventListener('change',renderMap);
  mapCanvas.addEventListener('click',event=>{
    if (suppressMapClick) { suppressMapClick = false; return; }
    if (!isStates() || !hitAreas.length) return;
    const rect = mapCanvas.getBoundingClientRect();
    const x = (event.clientX-rect.left)*mapCanvas.width/rect.width;
    const y = (event.clientY-rect.top)*mapCanvas.height/rect.height;
    const ctx = mapCanvas.getContext('2d');
    if (!outlineHitPath || !ctx.isPointInPath(outlineHitPath,x,y,'evenodd')) return;
    const hit = hitAreas.find(({path})=>ctx.isPointInPath(path,x,y,'evenodd'));
    if (!hit) return;
    statePick.value = hit.code;
    toggleState(hit.code);
  });
  get('mapGraphicsLab').addEventListener('creator-tool-open',()=>{ open = true; renderMap(); });
  document.fonts.ready.then(() => { renderInfo(); if(open) renderMap(); });
})();
