/* Movable, local-only charts and annotations for the map canvas. */
(() => {
  'use strict';
  const STORAGE_KEY = 'app_mapWidgets_v1';
  const MAX_WIDGETS = 20;
  const MAX_ROWS = 10;
  const TYPES = {pie:'Pie',donut:'Donut',bars:'Horizontal bars',chart:'Column chart',stat:'Statistic',text:'Text'};
  const FONT = '"Anek Kannada","Noto Sans Kannada","Nirmala UI",sans-serif';
  const DEFAULT_DATA = 'Group A | 45\nGroup B | 35\nGroup C | 20';
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const finite = (value,fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const hex = value => /^#[a-f\d]{6}$/i.test(String(value || ''));
  const short = (value,max) => String(value ?? '').slice(0,max);
  const keyFor = widget => 'widget:' + widget.id;
  const number = value => new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value);
  let panel = null;
  let controls = {};
  let lastCanvas = {width:1080,height:1350};
  let lastAreas = new Map();
  let storageWarning = '';
  let sequence = 0;

  function defaultPosition(index) {
    return {x:.52+(index%4)*.035,y:.43+(index%4)*.04};
  }

  function cleanWidget(raw,index) {
    if (!raw || !Object.hasOwn(TYPES,raw.type)) return null;
    const pos = defaultPosition(index);
    return {
      id:/^[a-z\d_-]{1,64}$/i.test(raw.id || '') ? raw.id : 'restored_' + index,
      type:raw.type,title:short(raw.title,120),data:short(raw.data ?? DEFAULT_DATA,4000),
      body:short(raw.body ?? 'Add your note here.',1500),
      x:clamp(finite(raw.x,pos.x),0,1),y:clamp(finite(raw.y,pos.y),0,1),
      scale:clamp(finite(raw.scale,1),.5,2),fontSize:clamp(finite(raw.fontSize,18),12,40),
      color:hex(raw.color) ? raw.color : '#ffffff',customColor:raw.customColor===true,
      visible:raw.visible!==false,background:raw.background!==false,
    };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const widgets = Array.isArray(raw?.widgets) ? raw.widgets.slice(0,MAX_WIDGETS).map(cleanWidget).filter(Boolean) : [];
      const ids = new Set();
      for (const widget of widgets) {
        while (ids.has(widget.id)) widget.id += '_' + (++sequence);
        ids.add(widget.id);
      }
      return {widgets,selected:widgets.some(widget=>widget.id===raw?.selected) ? raw.selected : widgets[0]?.id || ''};
    } catch { return {widgets:[],selected:''}; }
  }
  const state = load();
  const selected = () => state.widgets.find(widget=>widget.id===state.selected);
  const find = key => state.widgets.find(widget=>keyFor(widget)===key || widget.id===key);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,...state}));
      storageWarning = '';
    } catch { storageWarning = 'Changes stay in this tab because local storage is unavailable.'; }
  }

  function announceChange(save=true) {
    if (save) persist();
    updateStatus();
    document.dispatchEvent(new CustomEvent('avi-map-widgets-change'));
  }

  function parseRows(widget) {
    const lines = widget.data.split(/\r?\n/).map((line,index)=>({line:line.trim(),lineNumber:index+1})).filter(item=>item.line);
    if (!lines.length) return {rows:[],error:'Add at least one data row.'};
    if (lines.length>MAX_ROWS) return {rows:[],error:'Use at most ' + MAX_ROWS + ' data rows per element.'};
    const rows = [];
    for (const {line,lineNumber} of lines) {
      const parts = line.split('|').map(part=>part.trim());
      if (parts.length<2 || parts.length>3 || !parts[0]) return {rows:[],error:'Row ' + lineNumber + ': use Label | Number | optional #hex color.'};
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(parts[1]) || !Number.isFinite(Number(parts[1])) || Math.abs(Number(parts[1]))>1e15) {
        return {rows:[],error:'Row ' + lineNumber + ': enter a finite number, up to 1,000,000,000,000,000.'};
      }
      if (parts[2] && !hex(parts[2])) return {rows:[],error:'Row ' + lineNumber + ': color must use six hex digits, for example #3b82f6.'};
      if ((widget.type==='pie' || widget.type==='donut') && Number(parts[1])<=0) return {rows:[],error:'Row ' + lineNumber + ': pie and donut values must be greater than zero.'};
      rows.push({label:short(parts[0],80),value:Number(parts[1]),color:parts[2] || ''});
    }
    if (widget.type==='stat' && rows.length!==1) return {rows:[],error:'A statistic uses one row: Label | Number.'};
    return {rows,error:''};
  }

  function make(tag,className,text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text!==undefined) el.textContent = text;
    return el;
  }

  function button(label,handler,className='') {
    const el = make('button','mw-button ' + className,label);
    el.type = 'button';
    el.addEventListener('click',handler);
    return el;
  }

  function field(label,input,hint) {
    const wrap = make('label','mw-field');
    wrap.append(make('span','mw-label',label),input);
    if (hint) wrap.append(make('span','mw-hint',hint));
    return wrap;
  }

  function input(type,value,handler,attributes={}) {
    const el = make('input','mw-input');
    el.type = type;
    if (type==='checkbox') el.checked = value;
    else el.value = value;
    for (const [key,val] of Object.entries(attributes)) el.setAttribute(key,String(val));
    el.addEventListener(type==='checkbox' ? 'change' : 'input',()=>handler(type==='checkbox' ? el.checked : el.value));
    return el;
  }

  function updateStatus() {
    const widget = selected();
    if (controls.error) {
      const error = widget && widget.type!=='text' ? parseRows(widget).error : '';
      controls.error.textContent = error;
      controls.error.hidden = !error;
      if (controls.data) {
        controls.data.setAttribute('aria-invalid',error ? 'true' : 'false');
      }
    }
    if (controls.storage) {
      controls.storage.textContent = storageWarning;
      controls.storage.hidden = !storageWarning;
    }
    if (controls.select && widget) {
      const option = [...controls.select.options].find(item=>item.value===widget.id);
      if (option) option.textContent = (widget.title.trim() || TYPES[widget.type]) + (widget.visible ? '' : ' (hidden)');
    }
  }

  function syncPositionFields() {
    const widget = selected();
    if (!widget) return;
    for (const axis of ['x','y']) if (controls[axis] && document.activeElement!==controls[axis]) {
      controls[axis].value = (widget[axis]*100).toFixed(1).replace(/\.0$/,'');
    }
  }

  function refreshPanel() {
    if (!panel) return;
    panel.replaceChildren();
    controls = {};
    const heading = make('div','mw-heading');
    heading.append(make('h4','','Charts & text'),make('span','mw-count',state.widgets.length + ' / ' + MAX_WIDGETS));
    panel.append(heading,make('p','mw-help','Add an element, then drag it anywhere on the map. Each element keeps its own data and position.'));
    const addGrid = make('div','mw-add-grid');
    for (const [type,label] of Object.entries(TYPES)) {
      const addButton = button('+ ' + label,()=>add(type));
      addButton.disabled = state.widgets.length>=MAX_WIDGETS;
      addGrid.append(addButton);
    }
    panel.append(addGrid);
    controls.storage = make('p','mw-error');
    controls.storage.setAttribute('role','status');
    panel.append(controls.storage);
    if (!state.widgets.length) {
      panel.append(make('p','mw-help','No elements yet. Choose a chart or text above.'));
      updateStatus();
      return;
    }
    const selector = make('select','mw-input');
    selector.setAttribute('aria-label','Selected map element');
    for (const widget of state.widgets) {
      const option = make('option','',(widget.title.trim() || TYPES[widget.type]) + (widget.visible ? '' : ' (hidden)'));
      option.value = widget.id;
      selector.append(option);
    }
    selector.value = state.selected;
    selector.addEventListener('change',()=>select(selector.value));
    controls.select = selector;
    panel.append(field('Selected element',selector));
    const widget = selected();
    if (!widget) return;
    const actions = make('div','mw-actions');
    const visible = input('checkbox',widget.visible,value=>{widget.visible=value;announceChange();});
    actions.append(field('Visible on map',visible),button('Remove',()=>remove(widget.id),'mw-remove'));
    panel.append(actions);
    const title = input('text',widget.title,value=>{widget.title=value;announceChange();},{maxlength:120});
    panel.append(field('Title / label',title));
    if (widget.type==='text') {
      const body = make('textarea','mw-input mw-textarea');
      body.value = widget.body;
      body.rows = 4;
      body.maxLength = 1500;
      body.addEventListener('input',()=>{widget.body=body.value;announceChange();});
      panel.append(field('Text',body,'Line breaks are preserved.'));
    } else {
      const data = make('textarea','mw-input mw-textarea');
      data.value = widget.data;
      data.rows = widget.type==='stat' ? 2 : 5;
      data.maxLength = 4000;
      data.spellcheck = false;
      data.setAttribute('aria-describedby','map-widget-data-help map-widget-data-error');
      data.addEventListener('input',()=>{widget.data=data.value;announceChange();});
      const help = make('p','mw-hint',widget.type==='stat' ? 'One row: Label | Number | optional #hex color' : 'One row per item: Label | Number | optional #hex color. Maximum 10 items.' + ((widget.type==='pie' || widget.type==='donut') ? ' Values must be positive.' : ' Negative values are supported.'));
      help.id = 'map-widget-data-help';
      controls.data = data;
      controls.error = make('p','mw-error');
      controls.error.id = 'map-widget-data-error';
      controls.error.setAttribute('role','status');
      panel.append(field('Data',data),help,controls.error);
    }
    const size = input('range',widget.scale,value=>{widget.scale=Number(value);sizeValue.textContent=Math.round(widget.scale*100)+'%';size.setAttribute('aria-valuetext',sizeValue.textContent);announceChange();},{min:.5,max:2,step:.05,'aria-label':'Element size','aria-valuetext':Math.round(widget.scale*100)+'%'});
    const sizeValue = make('output','',Math.round(widget.scale*100)+'%');
    const sizeLabel = field('Size',size);
    sizeLabel.firstChild.append(' ',sizeValue);
    panel.append(sizeLabel);
    const styleRow = make('div','mw-two-columns');
    const fontSize = input('number',widget.fontSize,value=>{
      if (value==='') return;
      widget.fontSize=clamp(finite(value,18),12,40);announceChange();
    },{min:12,max:40,step:1});
    const color = input('color',widget.color,value=>{widget.color=value;announceChange();},{'aria-label':'Element text color'});
    color.disabled = !widget.customColor;
    styleRow.append(field('Font size',fontSize),field('Text color',color));
    panel.append(styleRow,field('Use custom text color',input('checkbox',widget.customColor,value=>{widget.customColor=value;color.disabled=!value;announceChange();})),field('Panel background',input('checkbox',widget.background,value=>{widget.background=value;announceChange();})));
    const positionRow = make('div','mw-two-columns');
    for (const axis of ['x','y']) {
      controls[axis] = input('number',Number((widget[axis]*100).toFixed(1)),value=>{
        if (value==='') return;
        widget[axis]=clamp(finite(value,50),0,100)/100;announceChange();
      },{min:0,max:100,step:.5});
      controls[axis].addEventListener('blur',syncPositionFields);
      positionRow.append(field(axis.toUpperCase() + ' center (%)',controls[axis]));
    }
    panel.append(positionRow,make('p','mw-hint','Positions stay inside the canvas. Nudge by 10 canvas pixels with these buttons.'));
    const nudge = make('div','mw-nudge');
    for (const [label,dx,dy] of [['Left',-10,0],['Up',0,-10],['Down',0,10],['Right',10,0]]) {
      nudge.append(button(label,()=>{move(keyFor(widget),dx,dy);endDrag();}));
    }
    panel.append(nudge,button('Reset this position',()=>resetPosition(widget.id),'mw-reset'));
    updateStatus();
  }

  function mount(root) {
    panel = root || document.getElementById('mapWidgetsPanel');
    if (panel) { panel.classList.add('map-widgets-panel'); refreshPanel(); }
    return Boolean(panel);
  }

  function add(type) {
    if (!Object.hasOwn(TYPES,type) || state.widgets.length>=MAX_WIDGETS) return null;
    const id = 'mw_' + Date.now().toString(36) + '_' + (++sequence).toString(36);
    const count = state.widgets.filter(widget=>widget.type===type).length;
    const widget = cleanWidget({id,type,title:TYPES[type]+(count ? ' '+(count+1) : ''),data:type==='stat' ? 'Total | 72' : DEFAULT_DATA,...defaultPosition(state.widgets.length)},state.widgets.length);
    state.widgets.push(widget);
    state.selected = id;
    refreshPanel();
    announceChange();
    return keyFor(widget);
  }

  function select(key) {
    const widget = find(key);
    if (!widget) return false;
    if (state.selected!==widget.id) { state.selected=widget.id;refreshPanel();announceChange(); }
    return true;
  }

  function remove(key) {
    const widget = find(key);
    if (!widget) return;
    const index = state.widgets.indexOf(widget);
    state.widgets.splice(index,1);
    if (state.selected===widget.id) state.selected=state.widgets[Math.max(0,index-1)]?.id || '';
    lastAreas.delete(keyFor(widget));
    refreshPanel();
    announceChange();
  }

  function move(key,dx,dy) {
    const widget = find(key);
    if (!widget || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    select(key);
    const area = lastAreas.get(keyFor(widget));
    const halfW = area ? area.w/2 : 0;
    const halfH = area ? area.h/2 : 0;
    const x = area ? area.x+halfW : widget.x*lastCanvas.width;
    const y = area ? area.y+halfH : widget.y*lastCanvas.height;
    widget.x=clamp(x+dx,halfW,lastCanvas.width-halfW)/lastCanvas.width;
    widget.y=clamp(y+dy,halfH,lastCanvas.height-halfH)/lastCanvas.height;
    // Update cached bounds so multiple deltas also work before the next render.
    if (area) lastAreas.set(keyFor(widget),{...area,x:widget.x*lastCanvas.width-halfW,y:widget.y*lastCanvas.height-halfH});
    syncPositionFields();
    announceChange(false);
    return true;
  }

  function endDrag() { persist();syncPositionFields();updateStatus(); }

  function resetPosition(key) {
    state.widgets.forEach((widget,index)=>{if (!key || find(key)===widget) Object.assign(widget,defaultPosition(index));});
    syncPositionFields();
    announceChange();
  }

  function rounded(ctx,x,y,width,height,radius) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x,y,width,height,radius);
    else ctx.rect(x,y,width,height);
  }

  function setFont(ctx,size,weight=600,family=FONT) { ctx.font=weight+' '+size+'px '+family; }

  function fitText(ctx,value,x,y,width) {
    const str = String(value);
    if (ctx.measureText(str).width<=width) {ctx.fillText(str,x,y);return;}
    const chars = Array.from(str);
    while (chars.length && ctx.measureText(chars.join('')+'…').width>width) chars.pop();
    ctx.fillText(chars.join('')+'…',x,y);
  }

  function wrappedLines(ctx,value,width,maxLines) {
    const output = [];
    const paragraphs = String(value).split(/\r?\n/);
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/u).filter(Boolean);
      if (!words.length) output.push('');
      let line = '';
      for (const word of words) {
        if (line && ctx.measureText(line+' '+word).width>width) {output.push(line);line='';}
        if (ctx.measureText(word).width>width) {
          if (line) {output.push(line);line='';}
          let segment='';
          for (const char of Array.from(word)) {
            if (segment && ctx.measureText(segment+char).width>width) {output.push(segment);segment='';}
            segment+=char;
          }
          line=segment;
        } else line+=(line ? ' ' : '')+word;
      }
      if (line) output.push(line);
    }
    if (output.length>maxLines) {output.length=maxLines;output[maxLines-1]+='…';}
    return output;
  }

  function layout(ctx,widget,rows,error,family) {
    const f = widget.fontSize;
    const titleHeight = widget.title.trim() ? f*1.3+16 : 0;
    const width = widget.type==='stat' ? 310 : widget.type==='pie' || widget.type==='donut' ? 390 : 420;
    let contentHeight;
    let bodyLines=[];
    if (error) contentHeight=110;
    else if (widget.type==='pie' || widget.type==='donut') contentHeight=Math.max(172,rows.length*(f*2+8));
    else if (widget.type==='bars') contentHeight=rows.length*(f*1.3+28)+22;
    else if (widget.type==='chart') contentHeight=238+f*1.3;
    else if (widget.type==='stat') contentHeight=f*4.6;
    else {
      setFont(ctx,f,500,family);
      bodyLines=wrappedLines(ctx,widget.body,width-40,18);
      contentHeight=Math.max(f*1.4,bodyLines.length*f*1.4);
    }
    return {width,height:40+titleHeight+contentHeight,top:20+titleHeight,bodyLines};
  }

  function drawPie(ctx,widget,rows,box,palette,ink,family) {
    const f=widget.fontSize;
    const total=rows.reduce((sum,row)=>sum+row.value,0);
    const radius=76,cx=102,cy=box.top+86;
    let angle=-Math.PI/2;
    rows.forEach((row,index)=>{
      const end=angle+row.value/total*Math.PI*2;
      ctx.beginPath();
      if (widget.type==='donut') {
        ctx.arc(cx,cy,radius,angle,end);
        ctx.arc(cx,cy,radius*.59,end,angle,true);
      } else {ctx.moveTo(cx,cy);ctx.arc(cx,cy,radius,angle,end);}
      ctx.closePath();
      ctx.fillStyle=row.color || palette[index%palette.length];ctx.fill();
      angle=end;
    });
    if (widget.type==='donut') {
      ctx.save();
      ctx.fillStyle=ink;setFont(ctx,Math.min(f*1.4,27),750,family);ctx.textAlign='center';fitText(ctx,number(total),cx,cy+f*.3,radius*1.02);
      ctx.restore();
    }
    rows.forEach((row,index)=>{
      const y=box.top+f+index*(f*2+8);
      ctx.fillStyle=row.color || palette[index%palette.length];ctx.fillRect(198,y-f+3,10,10);
      ctx.fillStyle=ink;setFont(ctx,f*.88,600,family);fitText(ctx,row.label,216,y,box.width-236);
      setFont(ctx,f*.76,500,family);fitText(ctx,number(row.value)+' · '+number(row.value/total*100)+'%',216,y+f,box.width-236);
    });
  }

  function drawBars(ctx,widget,rows,box,palette,ink,line,family) {
    const f=widget.fontSize;
    const min=Math.min(0,...rows.map(row=>row.value)),max=Math.max(0,...rows.map(row=>row.value));
    const span=max-min || 1,left=20,width=box.width-40;
    const zero=left+(-min/span)*width;
    rows.forEach((row,index)=>{
      const y=box.top+index*(f*1.3+28);
      ctx.fillStyle=ink;setFont(ctx,f,600,family);fitText(ctx,row.label,left,y+f,width*.65);
      ctx.textAlign='right';fitText(ctx,number(row.value),left+width,y+f,width*.3);ctx.textAlign='left';
      const barY=y+f+9,barH=15,end=left+(row.value-min)/span*width;
      ctx.fillStyle=line;ctx.fillRect(left,barY,width,barH);
      ctx.fillStyle=row.color || palette[index%palette.length];ctx.fillRect(Math.min(zero,end),barY,Math.max(row.value===0 ? 0 : 1,Math.abs(end-zero)),barH);
      ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(zero,barY-3);ctx.lineTo(zero,barY+barH+3);ctx.stroke();
    });
  }

  function drawColumns(ctx,widget,rows,box,palette,ink,line,family) {
    const f=widget.fontSize,left=52,right=box.width-20,top=box.top+20,bottom=box.top+196;
    const min=Math.min(0,...rows.map(row=>row.value)),max=Math.max(0,...rows.map(row=>row.value));
    const span=max-min || 1,zero=bottom-(0-min)/span*(bottom-top);
    const slot=(right-left)/rows.length;
    ctx.strokeStyle=line;ctx.lineWidth=1;
    for (let index=0;index<=4;index++) {
      const y=top+(bottom-top)*index/4;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    }
    ctx.fillStyle=ink;setFont(ctx,Math.max(11,f*.65),500,family);ctx.textAlign='right';
    fitText(ctx,number(max),left-7,top+4,43);fitText(ctx,number(min),left-7,bottom+4,43);
    ctx.textAlign='left';
    rows.forEach((row,index)=>{
      const center=left+slot*(index+.5),end=bottom-(row.value-min)/span*(bottom-top),barWidth=slot*.62;
      ctx.fillStyle=row.color || palette[index%palette.length];ctx.fillRect(center-barWidth/2,Math.min(zero,end),barWidth,Math.max(row.value===0 ? 0 : 1,Math.abs(end-zero)));
      ctx.fillStyle=ink;ctx.textAlign='center';setFont(ctx,Math.max(10,Math.min(f*.8,slot*.48)),600,family);
      fitText(ctx,number(row.value),center,row.value>=0 ? end-7 : end+14,slot-4);
      setFont(ctx,Math.max(10,Math.min(f*.8,slot*.48)),500,family);
      fitText(ctx,row.label,center,bottom+f+13,slot-5);
    });
    ctx.textAlign='left';ctx.strokeStyle=ink;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(left,zero);ctx.lineTo(right,zero);ctx.stroke();
  }

  function render(ctx,theme={},canvasWidth=1080,canvasHeight=1350) {
    if (!ctx || !(canvasWidth>0) || !(canvasHeight>0)) return [];
    lastCanvas={width:canvasWidth,height:canvasHeight};
    lastAreas=new Map();
    const regions=[];
    const ink=theme.ink || '#172033',card=theme.card || '#ffffff',line=theme.line || '#d9dee7';
    const palette=[theme.accent || '#3b82f6',theme.secondary || '#db5a42','#2e9c8a','#9370db','#d8a128','#dc5b84','#487aa7','#68863d','#b86b42','#4b9fae'];
    const family=theme.fontFamily || theme.font || FONT;
    for (const widget of state.widgets) {
      if (!widget.visible) continue;
      ctx.save();
      const {rows,error}=widget.type==='text' ? {rows:[],error:''} : parseRows(widget);
      const box=layout(ctx,widget,rows,error,family);
      const scale=Math.min(widget.scale*canvasWidth/1080,canvasWidth/box.width,canvasHeight/box.height);
      const w=box.width*scale,h=box.height*scale;
      const x=clamp(widget.x*canvasWidth-w/2,0,canvasWidth-w),y=clamp(widget.y*canvasHeight-h/2,0,canvasHeight-h);
      widget.x=(x+w/2)/canvasWidth;widget.y=(y+h/2)/canvasHeight;
      ctx.translate(x,y);ctx.scale(scale,scale);
      ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.lineWidth=1.5;
      if (widget.background) {rounded(ctx,0,0,box.width,box.height,16);ctx.fillStyle=card;ctx.fill();ctx.strokeStyle=line;ctx.stroke();}
      rounded(ctx,0,0,box.width,box.height,widget.background ? 16 : 0);ctx.clip();
      const color=widget.customColor ? widget.color : ink;
      ctx.fillStyle=color;
      if (widget.title.trim()) {setFont(ctx,widget.fontSize*1.12,750,family);fitText(ctx,widget.title,20,20+widget.fontSize*1.1,box.width-40);}
      if (error) {
        setFont(ctx,widget.fontSize,600,family);
        const messages=wrappedLines(ctx,error,box.width-40,4);
        messages.forEach((message,index)=>ctx.fillText(message,20,box.top+widget.fontSize+index*widget.fontSize*1.3));
      } else if (widget.type==='pie' || widget.type==='donut') drawPie(ctx,widget,rows,{...box,card},palette,color,family);
      else if (widget.type==='bars') drawBars(ctx,widget,rows,box,palette,color,line,family);
      else if (widget.type==='chart') drawColumns(ctx,widget,rows,box,palette,color,line,family);
      else if (widget.type==='stat') {
        ctx.fillStyle=rows[0].color || palette[0];setFont(ctx,widget.fontSize*2.6,800,family);fitText(ctx,number(rows[0].value),20,box.top+widget.fontSize*2.5,box.width-40);
        ctx.fillStyle=color;setFont(ctx,widget.fontSize,600,family);fitText(ctx,rows[0].label,20,box.top+widget.fontSize*4,box.width-40);
      } else {
        setFont(ctx,widget.fontSize,500,family);box.bodyLines.forEach((text,index)=>fitText(ctx,text,20,box.top+widget.fontSize+index*widget.fontSize*1.4,box.width-40));
      }
      ctx.restore();
      const area={key:keyFor(widget),x,y,w,h};
      regions.push(area);lastAreas.set(area.key,area);
    }
    syncPositionFields();
    return regions;
  }

  window.AviMapWidgets = Object.freeze({render,move,endDrag,resetPosition,select,mount,add,remove,getState:()=>JSON.parse(JSON.stringify(state))});
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>mount(),{once:true});
  else mount();
})();
