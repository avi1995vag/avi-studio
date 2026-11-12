/* Editable graphics rendered to publication-size canvases. */
(() => {
  const get = id => document.getElementById(id);
  const palettes = {
    violet:{bg:'#201735',card:'#34264b',ink:'#fff2ff',soft:'#dcc8ed',accent:'#deaaff',secondary:'#ffc2a8',line:'#705683'},
    cream:{bg:'#fff2de',card:'#f3d8c5',ink:'#321a2a',soft:'#5f3e4b',accent:'#af3b3f',secondary:'#223f84',line:'#ba9390'},
    green:{bg:'#142f2a',card:'#234640',ink:'#eff8e5',soft:'#c7dbbd',accent:'#e2fa91',secondary:'#f0ba9e',line:'#597568'},
  };
  const fonts = '"Bricolage Grotesque","Noto Sans Kannada","Nirmala UI",sans-serif';
  const decimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const formatNumber = new Intl.NumberFormat(undefined,{maximumFractionDigits:8});
  const number = value => formatNumber.format(value);
  const validNumber = value => decimal.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e15;
  const skippedRows = count => count + (count===1 ? ' row skipped.' : ' rows skipped.');

  function font(ctx,size,weight=700) {
    ctx.font = weight + ' ' + size + 'px ' + fonts;
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

  function begin(canvas,height,theme,title,subtitle,source,kind) {
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0,0,1080,height);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(28,28,1024,height-56,24);
    ctx.stroke();
    ctx.fillStyle = theme.accent;
    ctx.fillRect(65,61,42,8);
    font(ctx,24,700);
    text(ctx,kind,123,75,820);
    ctx.fillStyle = theme.ink;
    font(ctx,74,800);
    let y = lines(ctx,title,64,165,952,79,2);
    ctx.fillStyle = theme.soft;
    font(ctx,32,550);
    if (subtitle.trim()) y = lines(ctx,subtitle,67,y-10,940,38,2) + 8;
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
        if (typeof value === 'string' && (field.tagName !== 'SELECT' || [...field.options].some(option => option.value === value))) field.value = value;
      }
    } catch {}
    const save = () => {
      lsSet(key,JSON.stringify(Object.fromEntries(fields.map(field => [field.id,field.value]))));
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
  const statePick = get('mapStatePick');
  const stateFocus = get('mapStateFocus');
  const stateValues = get('mapStateValues');
  const mapKey = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s*&\s*/g,' and ');
  const isIndia = () => territory.value.startsWith('india');
  const isStates = () => territory.value === 'indiaStates';
  const dataSets = {};
  let focusCode = '';
  let hitAreas = [];
  let outlineHitPath;
  let open = false;

  function projector(bounds,top,bottom) {
    const [west,east,south,north] = bounds;
    const aspect = Math.cos((south+north)*Math.PI/360);
    const scale = Math.min(900/((east-west)*aspect),(bottom-top-38)/(north-south));
    const width = (east-west)*scale*aspect, height = (north-south)*scale;
    const x = (1080-width)/2, y = (top+bottom-height)/2;
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

  function renderMap() {
    const india = isIndia(), stateMode = isStates();
    get('mapCountryOptions').hidden = india;
    get('mapStateOptions').hidden = !stateMode;
    get('mapIndiaCredits').hidden = !india;
    get('mapWorldCredits').hidden = india;
    stateFocus.setAttribute('aria-pressed',String(Boolean(focusCode)));
    stateFocus.textContent = focusCode ? 'Show all India' : 'Focus state';
    hitAreas = [];
    outlineHitPath = null;
    const data = dataSets[india ? 'india' : 'world'];
    if (!data) {
      enableMap(false);
      if (open) void loadMap(india ? 'india' : 'world');
      return;
    }

    const theme = palettes[get('mapTheme').value];
    const height = Number(get('mapShape').value);
    const credit = [get('mapSource').value.trim(),stateMode ? 'India viewpoint · Natural Earth · © OpenStreetMap contributors (openstreetmap.org/copyright)'
      : india ? 'Made with Natural Earth · India viewpoint' : 'Made with Natural Earth'].filter(Boolean).join('  ·  ');
    const {ctx,top,bottom} = begin(mapCanvas,height,theme,get('mapTitle').value || 'Untitled map',get('mapDeck').value,credit,'MAP GRAPHIC');
    const focus = stateMode && focusCode ? data.states.find(state => state.code === focusCode) : null;
    const view = india ? indiaBounds(focus ? focus.bounds : data.bounds, Boolean(focus)) : regions[territory.value];
    const fills = new Map();
    let skipped = 0;
    const input = stateMode ? stateValues.value : india ? '' : get('mapValues').value;
    for (const line of input.split('\n').filter(value => value.trim())) {
      const [label,raw] = line.split('|');
      const id = data.names.get(mapKey(label));
      const value = raw?.trim();
      if (!id || (value && !validNumber(value))) skipped++;
      else fills.set(id,value ? Number(value) : null);
    }
    const values = [...fills.values()].filter(Number.isFinite);
    const low = values.length ? Math.min(...values) : 0;
    const high = values.length ? Math.max(...values) : 1;
    const categorical = ['#a43e50','#416a8b','#507850','#a75332','#6b4d8a','#277d79'];
    const map = projector(view,top,bottom-(values.length ? 77 : 8));
    const labelBoxes = [];
    block(ctx,map.x-13,map.y-13,map.width+26,map.height+26,18,theme.card);
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

    if (india) {
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
        const labels = get('mapLabels').value;
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
      for (const {geometry,properties} of data.features) {
        if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) continue;
        const path = polygonPath(geometry,map.point);
        ctx.fillStyle = featureColor(properties.ADM0_A3,0);
        ctx.strokeStyle = theme.bg;
        ctx.fill(path,'evenodd');
        ctx.stroke(path);
      }
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
      const [x,y] = map.point([lon,lat]);
      if (focus && !ctx.isPointInPath(hitAreas[0].path,x,y,'evenodd')) continue;
      pinCount++;
      ctx.beginPath();
      ctx.arc(x,y,10,0,Math.PI*2);
      ctx.fillStyle = theme.secondary;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 3;
      ctx.stroke();
      labelAt(label,x+30,y+22,theme.ink);
    }
    ctx.restore();

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
    mapStatus.textContent = skipped ? skippedRows(skipped) + ' Check names, coordinates, and formats.' : '';
    const subject = stateMode ? (focus ? focus.name : 'India, 36 states and union territories') : india ? 'India national outline' : 'Regional map';
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
        const response = await fetch('./assets/india-map.json.gz');
        if (!response.ok) throw new Error();
        const bytes = await response.arrayBuffer();
        const header = new Uint8Array(bytes,0,2);
        const data = header[0]===31 && header[1]===139
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
          : JSON.parse(new TextDecoder().decode(bytes));
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
      if (key===(isIndia() ? 'india' : 'world')) renderMap();
    } catch {
      if (key===(isIndia() ? 'india' : 'world')) mapStatus.textContent = 'Map data could not load. Switch tabs and return to try again.';
    } finally { inflight.delete(key); }
  }

  const saveMap = editable(['mapRegion','mapTheme','mapTitle','mapDeck','mapValues','mapPins','mapSource','mapShape','mapStateValues','mapLabels'],'app_mapGraphic',renderMap);
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
  territory.addEventListener('change',()=>{ focusCode = ''; renderMap(); });
  mapCanvas.addEventListener('click',event=>{
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
