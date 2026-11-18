/* Motion Studio Ultra V11 — hosted Gemini via Interactions API. No local models.
   The LLM selects safe template IDs; numeric figures come from validated source input. */
'use strict';
(() => {
  const $id = id => document.getElementById(id);
  const BASE_COUNT = typeof SCENES!=='undefined'&&SCENES.length>=138?SCENES.length:138;
  const generated = {order:[], source:'', warnings:[], playing:false, raf:0, exporting:false};
  const numeral = s => String(s).replace(/[೦-೯]/g,ch=>String('೦೧೨೩೪೫೬೭೮೯'.indexOf(ch))).replace(/[०-९]/g,ch=>String('०१२३४५६७८९'.indexOf(ch)));
  const safeStr = (s,n=180) => String(s??'').replace(/\s+/g,' ').trim().slice(0,n);
  const numeric = s => {
    const match=numeral(s).replace(/\s/g,'').match(/[-+]?\d[\d,]*(?:\.\d+)?/);
    return match ? Number(match[0].replace(/,/g,'')) : NaN;
  };
  const isNum = s => Number.isFinite(numeric(s));
  const currencySymbol = s => (String(s).match(/[₹$€£¥]/)||[])[0]||'';
  const ktext = /[\u0C80-\u0CFF]/;
  const isKannada = s => ktext.test(s);
  const splitSentences = source => source.replace(/\r\n?/g,'\n')
    .split(/\n{2,}|\n|(?<=[.!?।])\s+(?=[^\d])/) // preserve numeric decimals
    .map(x=>x.trim().replace(/^[-*•\d]+[.)\-:]\s*/,''))
    .filter(x=>x.length>=3);
  const figures = s => [...String(s).matchAll(/(?:[₹$€£]\s*)?[-+]?[\d೦-೯०-९][\d೦-೯०-९,]*(?:\.[\d೦-೯०-९]+)?\s*(?:%|ಲಕ್ಷ|ಕೋಟಿ|LPA|crore|lakh|million|billion|k|K)?/g)]
    .map(x=>x[0].trim()).filter(x=>/\d/.test(x));
  const K = {
    finance:/ಹೂಡಿಕೆ|ಹಣ|ಬಡ್ಡಿ|ಉಳಿತಾಯ|ಲಾಭ|ನಷ್ಟ|ರೂಪಾಯಿ|ಆದಾಯ|ಖರ್ಚು|ಚಿನ್ನ|ಬ್ಯಾಂಕ್|ಷೇರು|ನಿಫ್ಟಿ|ನಿವೇಶನ|investment|invest|gold|bank|stock|mutual|finance|salary|profit|revenue|expense|cost|budget|money|saving/i,
    compare:/ಹೋಲಿಕೆ|ವಿರುದ್ಧ|ಹೆಚ್ಚು|ಕಡಿಮೆ|ತುಲನ|ವರ್ಸಸ್|ಮತ್ತು|ಹಾಗೂ|vs\.?\b|versus|compare|comparison|against|better|which|than|before and after/i,
    change:/ಮೊದಲು|ನಂತರ|ಹಿಂದೆ|ಈಗ|ಬದಲಾವಣೆ|before|after|earlier|now|then|from.*to/i,
    timeline:/ವರ್ಷ|ತಿಂಗಳು|ದಿನಗಳು|ಇತಿಹಾಸ|ಕಾಲ|ಏರಿಕೆ|ಬೆಳವಣಿಗೆ|growth|year|month|timeline|history|forecast|201[0-9]|202[0-9]/i,
    maps:/ನಕ್ಷೆ|ಮಾರ್ಗ|ಪ್ರಯಾಣ|ಜಿಲ್ಲೆ|ರಾಜ್ಯ|ದೇಶ|ನಗರ|ಸ್ಥಳ|route|map|district|state|country|travel|from.*to/i,
    quote:/ಹೇಳಿದರು|ಹೇಳಿಕೆ|ಉಲ್ಲೇಖ|ಮಾತು|quote|said|statement|speech|according to/i,
    result:/ಫಲಿತಾಂಶ|ತೀರ್ಮಾನ|ಒಟ್ಟು|ನಿರ್ಣಯ|ಕೊನೆಯಲ್ಲಿ|conclusion|result|total|overall|winner|summary/i,
    percentage:/ಶೇಕಡಾ|ಪ್ರತಿಶತ|percentage|percent|%/i
  };
  const langLabel = s => isKannada(s)?'ಕನ್ನಡ':'ENGLISH';
  const titleFrom = line => { const p=safeStr(line,140),words=p.split(/\s+/); return words.length>10 ? words.slice(0,10).join(' ')+'…' : (p.length>95?p.slice(0,92).replace(/\s+\S*$/,'')+'…':p);};
  const categoryFrom = line => {
    if(K.maps.test(line)) return 'map';
    if(K.finance.test(line)) return 'finance';
    if(K.compare.test(line)) return 'compare';
    if(K.timeline.test(line)) return 'timeline';
    if(K.quote.test(line)) return 'quote';
    if(K.result.test(line)) return 'result';
    return 'editorial';
  };
  const matches = id => SCENES.find((s,i)=>i<BASE_COUNT&&s.id===id);
  const TEMPLATES = {
    opening:['hook_clean','v8_neon_tunnel','hook','v8_aurora_ribbons'],
    finance:['stat','v8_odometer','v8_sparkline','v8_planet_orbit'],
    percent:['v8_radial_meter','v8_liquid_level','stat'],
    compare:['before','v8_wave_compare'],
    timeline:['v8_sparkline','v8_news_flash','v8_blueprint'],
    quote:['quote','v8_quote_stage','quote_panel'],
    map:['india_route','world_route','v8_blueprint'],
    result:['v8_shockwave','stat','v8_odometer'],
    editorial:['v8_blueprint','v8_quote_stage','v8_news_flash','hook_clean'],
    bar:['bar','ranking','ladder','v8_stack_towers'],
    donut:['donut','stat_tiles','metric_grid'],
    v12:['vox_collage_cutout','vox_highlighter_doc','vox_red_thread','vox_chart_cutout','ll_bento_search','ll_bento_conversion','ll_bento_analytics','mv_johnny_harris','mv_kurzgesagt','mv_iman_gadzhi','mv_dan_koe','sw_spotify_player','sw_fintech_dash','sw_apple_counter']
  };
  function hash(s){let a=2166136261;for(let i=0;i<s.length;i++){a^=s.charCodeAt(i);a=Math.imul(a,16777619)}return a>>>0}
  function choose(kind,source,index){const arr=TEMPLATES[kind]||TEMPLATES.editorial;const available=arr.filter(matches);return available[(hash(source)+index)%available.length]||matches('hook')?.id||'hook'}
  function dataTextRow(row){return Object.values(row).map(x=>String(x)).join(' • ')}
  function parseCSV(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
      else if(c===','&&!quoted){row.push(cell.trim());cell=''}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}
      else cell+=c;
    }
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);
    if(quoted)throw Error('Unclosed quoted CSV cell');
    return rows;
  }
  function parseData(text){
    text=text.trim();if(!text)return null;
    let header=[],rows=[];
    if(text[0]==='['||text[0]==='{'){
      const val=JSON.parse(text);let records=Array.isArray(val)?val:(Array.isArray(val.rows)?val.rows:Array.isArray(val.data)?val.data:null);
      if(!records||!records.length)throw Error('JSON must be an array of rows, or an object with a rows/data array.');
      if(Array.isArray(records[0])){header=records[0].map((x,i)=>String(x||`Column ${i+1}`));rows=records.slice(1).map(r=>r.map(String))}
      else if(typeof records[0]==='object'){
        header=[...new Set(records.flatMap(r=>Object.keys(r||{})))].slice(0,12);
        rows=records.map(r=>header.map(k=>r[k]==null?'':String(r[k])));
      } else throw Error('JSON records must be arrays or objects');
    } else {
      const csv=parseCSV(text);if(csv.length<2)throw Error('Enter a header line and at least one data row.');
      header=csv[0];rows=csv.slice(1);
    }
    header=header.slice(0,12).map(x=>safeStr(x,70));
    rows=rows.slice(0,100).map(r=>header.map((_,i)=>safeStr(r[i],120))).filter(r=>r.some(Boolean));
    if(!rows.length||header.length<2)throw Error('Data needs at least two columns and one nonempty row.');
    const numcols=header.map((h,i)=>({i,h,score:rows.filter(r=>isNum(r[i])).length})).filter(x=>x.score>=Math.max(1,Math.ceil(rows.length*.65)));
    const labcol=header.findIndex((_,i)=>!numcols.some(c=>c.i===i));
    return {header,rows,numcols,labcol:labcol>=0?labcol:0};
  }
  function sourceRecords(parsed,col){return parsed.rows.map(r=>({label:r[parsed.labcol],value:r[col]})).filter(x=>x.label&&isNum(x.value))}
  function findColumn(parsed,regex){const col=parsed.numcols.find(x=>regex.test(x.h));return col?.i ?? -1}
  function formatNumeric(n,original){const symbol=currencySymbol(original);return symbol+n.toLocaleString('en-IN',{maximumFractionDigits:2})}
  function sourceUnits(rows){const signs=[...new Set(rows.map(r=>currencySymbol(r.value)).filter(Boolean))];return signs.length===1?signs[0]:''}
  function formatSlideSource(items){return items.map(r=>`${r.label}: ${r.value}`).join(' · ').slice(0,260)}
  function makePlan(templateId,title,source,fields={},kind='editorial',warnings=[]){
    let base=matches(templateId)||matches('hook_clean')||SCENES[0];
    const data={};for(const f of base.fields)data[f.key]='';
    if('title' in data)data.title=titleFrom(title);
    if('tag' in data)data.tag=isKannada(source)?'ಡೇಟಾ ಆಧಾರಿತ ಕಥೆ':'YOUR SOURCE • AUTO DESIGN';
    if('description' in data)data.description=safeStr(source,170);
    if('note' in data)data.note=safeStr(source,145);
    Object.assign(data,fields);
    // Do not silently show example/default figures from templates.
    return {templateId:base.id,title:data.title||titleFrom(title),source,kind,data,warnings,duration:6};
  }
  function planScript(text,target=6){
    const routes=text.split(/\r?\n/).map(x=>x.trim()).filter(x=>{
      const p=x.split('|').map(q=>q.trim());return p.length>=3 && Number.isFinite(Number(p[1]))&&Number.isFinite(Number(p[2]))
        && Math.abs(Number(p[1]))<=90&&Math.abs(Number(p[2]))<=180;
    });
    if(routes.length>=2){
      const indian=routes.every(x=>{const p=x.split('|');return Number(p[1])>=6&&Number(p[1])<=38&&Number(p[2])>=68&&Number(p[2])<=98});
      const routeTitle=isKannada(text)?'ಸ್ಥಳಗಳ ಮಾರ್ಗ ಚಿತ್ರಣ':'Animated location journey';
      return [makePlan('hook_clean',routeTitle,text,{description:`${routes.length} supplied waypoints`},'opening'),
        makePlan(indian?'india_route':'world_route',routeTitle,routes.join('\n'),{route:routes.join('\n'),note:'Waypoints from supplied coordinates · verify location data'},'map')].slice(0,target);
    }
    let chunks=splitSentences(text);if(!chunks.length)throw Error('Add a script with at least one meaningful sentence.');
    if(chunks.length>target){ // merge adjoining lines; retain all source content and order
      const merged=[];let at=0;
      for(let i=0;i<target;i++){const take=Math.ceil((chunks.length-at)/(target-i));merged.push(chunks.slice(at,at+take).join(' '));at+=take}
      chunks=merged;
    }
    const slides=[];
    chunks.forEach((s,i)=>{
      const nums=figures(s),amounts=nums.filter(x=>/[₹$€£]/.test(x)),mode=categoryFrom(s);
      // A pair of clearly marked amounts represents a before/after comparison, not a single KPI.
      const beforeAfter=amounts.length>=2 && (K.finance.test(s)||K.timeline.test(s)||K.change.test(s));
      let kind=i===0&&chunks.length>1?'opening':beforeAfter?'compare':K.percentage.test(s)&&nums.some(x=>x.includes('%'))?'percent':mode==='compare'&&nums.length>=2?'compare':nums.length>=1&&(mode==='finance'||mode==='result')?'finance':mode;
      let id=choose(kind,s,i),fields={},warnings=[];
      if(beforeAfter&&kind==='compare')id=i%2?'before':'v8_wave_compare';
      if(nums.length===0&&['timeline','finance'].includes(kind))id='v8_blueprint';
      const pct=nums.find(n=>n.includes('%'));
      if(kind==='percent'&&pct&&(numeric(pct)>100||numeric(pct)<0))id='stat';
      if(kind==='percent'&&pct&&!/^(100|0)\s*%$/.test(pct))id=choose('percent',s,i);
      if(kind==='map'){
        const routeLines=s.split(/\n|;/).map(x=>x.trim()).filter(x=>/^.+\s*\|\s*-?\d+\.?\d*\s*\|\s*-?\d+\.?\d*/.test(x));
        if(routeLines.length<2){id='v8_blueprint';warnings.push('Map needs city | latitude | longitude coordinates; using a diagram instead.');}
        else fields.route=routeLines.join('\n');
      }
      if(['stat','v8_odometer','v8_radial_meter','v8_liquid_level','v8_sparkline','v8_shockwave','v8_planet_orbit'].includes(id)){
        fields.value=nums.find(n=>n.includes('%'))||amounts.at(-1)||nums[0]||safeStr(s,45);
        fields.note=safeStr(s,140);
      }
      if(['compare_3','compare4','before','v8_wave_compare'].includes(id)){
        if((beforeAfter?amounts:nums).length<2){id='v8_blueprint';warnings.push('Not enough comparable values to make a quantitative comparison.');}
        else {
          const values=beforeAfter?amounts:nums;
          const labels=(s.split(/\bvs\b|ವಿರುದ್ಧ|ಮತ್ತು|ಹಾಗೂ|,|;/i).map(x=>safeStr(x.replace(/[₹$€£]?\s*\d[\d,.]*\s*%?/g,''),42)).filter(Boolean));
          fields={a:beforeAfter?(isKannada(s)?'ಮೊದಲ ಹೂಡಿಕೆ':'Initial'):(labels[0]||'First'),b:beforeAfter?(isKannada(s)?'ಅಂತಿಮ ಮೌಲ್ಯ':'Final'):(labels[1]||'Second'),aValue:values[0],bValue:values.at(-1),av:values[0],bv:values.at(-1),note:safeStr(s,120)};
          if(id==='compare_3') {fields.c='';fields.cValue=''}
        }
      }
      if(id==='v8_blueprint'){
        const pieces=s.split(/,|;|ಮತ್ತು|ಹಾಗೂ/).map(x=>safeStr(x,48)).filter(Boolean);
        fields={a:pieces[0]||safeStr(s,50),b:pieces[1]||'',c:pieces[2]||'',note:pieces.length>1?'':safeStr(s,170)};
      }
      if(id==='v8_quote_stage') fields={value:safeStr(s,210),note:''};
      if(id==='quote'||id==='quote_panel')fields={quote:safeStr(s,230),description:safeStr(s,170),author:''};
      if(id==='v8_parallax_stack')fields={a:safeStr(s,60),b:'',c:'',note:''};
      if(id==='v8_news_flash')fields={value:safeStr(s,65),note:''};
      if(nums.length===0&&['finance','percent'].includes(kind)){id='v8_quote_stage';fields={value:safeStr(s,200),note:''}}
      slides.push(makePlan(id,s,s,fields,kind,warnings));
    });
    return slides;
  }
  function planDataset(parsed,notes='',max=6){
    const {header,rows,numcols}=parsed;const name=notes.trim()||`${header[parsed.labcol]} — ${header.slice(1).join(' / ')}`;
    const plans=[];let warnings=[];
    if(!numcols.length){
      warnings.push('No sufficiently numeric columns found; using text-based slides.');
      return {slides:planScript(rows.map(r=>dataTextRow(Object.fromEntries(header.map((h,i)=>[h,r[i]])))).join('\n'),max),warnings};
    }
    const valueCol=findColumn(parsed,/2026|return|final|ending|value|result|total|actual|after|profit|current|growth|ಮೌಲ್ಯ|ಅಂತಿಮ|ಲಾಭ|ಫಲ/i);
    const investedCol=findColumn(parsed,/2016|invested|invest|initial|starting|amount|before|ಹೂಡಿಕೆ|ಆರಂಭ|ಮೊತ್ತ/i);
    const firstCol=investedCol>=0?investedCol:numcols[0].i;
    const finalCol=valueCol>=0&&valueCol!==firstCol?valueCol:numcols.at(-1).i;
    const totalRow=rows.find(r=>/^(total|grand total|sum|ಒಟ್ಟು|ಮೊತ್ತ)\b/i.test(r[parsed.labcol])||/^(ಒಟ್ಟು|ಮೊತ್ತ)/.test(r[parsed.labcol]));
    const detailRows=rows.filter(r=>r!==totalRow);
    const details={...parsed,rows:detailRows};
    const first=sourceRecords(details,firstCol),end=sourceRecords(details,finalCol);
    const labels=detailRows.map(r=>r[parsed.labcol]).filter(Boolean);
    const introTag=isKannada(name)||labels.some(isKannada)?'ಡೇಟಾ ಆಧಾರಿತ ಚಿತ್ರಣ':'DATA → MOTION';
    plans.push(makePlan('hook_clean',name,name,{tag:introTag,description:`${rows.length} rows · ${numcols.length} numeric column(s)`},'opening'));
    function addChart(series,label,title,kind='bar',limit=5){
      if(!series.length)return;
      const valid=series.filter(x=>Number.isFinite(numeric(x.value))).slice(0,limit);
      if(!valid.length)return;
      const numbers=valid.map(x=>numeric(x.value));
      const sign=sourceUnits(valid),mixedCurrencies=new Set(valid.map(x=>currencySymbol(x.value)).filter(Boolean)).size>1;
      if(mixedCurrencies){warnings.push(`Mixed currencies in ${label}. Numerical comparisons require currency conversion; using text cards.`);return}
      const id=kind==='donut'&&numbers.every(n=>n>=0)&&numbers.some(n=>n>0)?'donut':'bar';
      plans.push(makePlan(id,title,formatSlideSource(valid),{labels:valid.map(x=>x.label).join(','),values:numbers.join(','),note:`${label}${sign?' · '+sign:''} · values from supplied data`},kind));
    }
    const baseSeries=sourceRecords(details,firstCol);
    const endSeries=sourceRecords(details,finalCol);
    if(firstCol!==finalCol){
      addChart(baseSeries,header[firstCol],isKannada(name)?'ಆರಂಭಿಕ ಹೂಡಿಕೆ':`${header[firstCol]} — by item`,'bar',8);
      addChart(endSeries,header[finalCol],isKannada(name)?'ಅಂತಿಮ ಮೌಲ್ಯ':`${header[finalCol]} — by item`,'bar',8);
    } else addChart(endSeries,header[finalCol],isKannada(name)?'ಮೌಲ್ಯಗಳ ಹೋಲಿಕೆ':`Comparison · ${header[finalCol]}`,'bar',8);
    if(endSeries.length>=2){
      const sorted=[...endSeries].filter(x=>isNum(x.value)).sort((a,b)=>numeric(b.value)-numeric(a.value)).slice(0,5);
      plans.push(makePlan('ranking',isKannada(name)?'ಅತ್ಯಧಿಕ ಮೌಲ್ಯಗಳು':'Top results',formatSlideSource(sorted),{
        labels:sorted.map(x=>x.label).join(','),values:sorted.map(x=>numeric(x.value)).join(','),note:`${header[finalCol]}${sourceUnits(sorted)?' · '+sourceUnits(sorted):''} · descending`},'ranking'));
    }
    const compatible=baseSeries.length===endSeries.length&&baseSeries.every((r,i)=>r.label===endSeries[i].label);
    if(firstCol!==finalCol&&compatible&&baseSeries.length>=2){
      const upto=Math.min(4,baseSeries.length),fields={};
      const keys=[['a','aValue'],['b','bValue'],['c','cValue'],['d','dValue']];
      for(let i=0;i<upto;i++){const label=baseSeries[i].label;const a=baseSeries[i].value,b=endSeries[i].value;fields[keys[i][0]]=label;fields[keys[i][1]]=b;}
      fields.note=`${header[firstCol]} → ${header[finalCol]} · final values shown`; 
      plans.push(makePlan('compare4',isKannada(name)?'ಹೂಡಿಕೆಗಳ ಫಲಿತಾಂಶ':'Compare final values',formatSlideSource(endSeries.slice(0,4)),fields,'compare'));
    }
    // Sum only truly comparable values (same known currency or unit). Never infer annualized returns.
    const allNumeric=endSeries.length===detailRows.length&&endSeries.every(x=>isNum(x.value));
    const signs=new Set(endSeries.map(x=>currencySymbol(x.value)).filter(Boolean));
    const explicitUnit=/lakh|crore|million|billion|ಲಕ್ಷ|ಕೋಟಿ/i.test(endSeries.map(x=>x.value).join(' '));
    if(allNumeric&&endSeries.length>=2&&signs.size<=1&&!explicitUnit){
      const sum=endSeries.reduce((a,x)=>a+numeric(x.value),0);
      const original=endSeries.find(x=>currencySymbol(x.value))?.value||'';
      const stated=totalRow?.[finalCol];
      if(stated&&isNum(stated)&&Math.abs(numeric(stated)-sum)>0.01)warnings.push(`Supplied total ${stated} differs from calculated row sum ${formatNumeric(sum,original)}. Review rounding or missing entries.`);
      const declared=stated&&isNum(stated)?stated:null;
      const v=declared||formatNumeric(sum,original);
      plans.push(makePlan('v8_odometer',isKannada(name)?'ಒಟ್ಟು ಮೌಲ್ಯ':'Combined value',formatSlideSource(endSeries),{value:v,note:declared?'Total as supplied in your table · verify sum':`Calculated sum of ${endSeries.length} supplied rows · ${header[finalCol]}`},'result'));
    } else if(explicitUnit) warnings.push('Totals were not calculated because mixed/ambiguous lakh/crore units require verification.');
    return {slides:plans.slice(0,Math.max(2,max)),warnings};
  }
  function addGenerated(plan){
    const original=matches(plan.templateId)||matches('hook_clean');
    const fields=original.fields.map(f=>({...f}));
    const record={id:original.id,name:plan.title.slice(0,66),category:'AI STORY',desc:`${original.name} · ${plan.kind}`,fields,seconds:plan.duration||6,
      aiMeta:{originalId:original.id,source:plan.source,kind:plan.kind,warnings:plan.warnings||[]}};
    const i=SCENES.push(record)-1;
    state.data.push({...plan.data});state.typo.push({});state.durations.push(plan.duration||6);state.bgStyles.push(null);
    generated.order.push(i);return i;
  }
  function clearGenerated(){
    stopPreview();if(state.scene>=BASE_COUNT)setScene(0);
    SCENES.splice(BASE_COUNT);state.data.splice(BASE_COUNT);state.typo.splice(BASE_COUNT);state.durations.splice(BASE_COUNT);state.bgStyles.splice(BASE_COUNT);
    generated.order=[];generated.warnings=[];state.search='';state.category='ALL';$('sceneSearch').value='';categories();sceneList();drawStoryboard();
  }
  function report(message,isErr=false){const el=$id('aiFeedback');el.textContent=message;el.classList.toggle('ai-error',isErr);info(message.slice(0,110))}
  function drawStoryboard(){
    const list=$id('aiScenes'),strip=$id('aiTimeline'),stat=$id('aiStoryboardSummary');list.replaceChildren();strip.replaceChildren();
    const total=generated.order.reduce((a,i)=>a+(state.durations[i]||6),0);
    stat.textContent=generated.order.length ? `${generated.order.length} scenes · ${total.toFixed(0)} sec · Editable storyboard` : 'Your storyboard will appear here';
    generated.order.forEach((idx,pos)=>{
      const s=SCENES[idx],data=state.data[idx];if(!s)return;
      const card=document.createElement('article');card.className='ai-scene-card';
      const top=document.createElement('div');top.className='ai-scene-top';
      const ord=document.createElement('span');ord.className='ai-scene-index';ord.textContent=String(pos+1).padStart(2,'0');
      const kind=document.createElement('span');kind.className='ai-template-kind';kind.textContent=(matches(s.aiMeta?.originalId)?.name||s.id)+' · '+s.aiMeta?.kind;
      top.append(ord,kind);card.append(top);
      const title=document.createElement('input');title.type='text';title.className='control ai-scene-title';title.value=data.title||s.name;title.setAttribute('aria-label','Scene '+(pos+1)+' headline');
      title.addEventListener('input',()=>{if('title' in data)data.title=title.value;s.name=title.value.slice(0,66);if(state.scene===idx){$('sceneTitle').textContent=s.name;renderFrame()}});card.append(title);
      const meta=document.createElement('p');meta.className='ai-scene-source';meta.textContent=s.aiMeta?.source||'';card.append(meta);
      const warn=s.aiMeta?.warnings||[];if(warn.length){const w=document.createElement('small');w.className='ai-warning';w.textContent='⚠ '+warn.join(' ');card.append(w)}
      const actions=document.createElement('div');actions.className='ai-scene-actions';
      function action(label,cb,primary=false){const b=document.createElement('button');b.type='button';b.className='btn'+(primary?' primary':'');b.textContent=label;b.onclick=cb;actions.append(b)}
      action('Edit',()=>{stopPreview();setScene(idx);setTab('content');$id('sceneTitle').scrollIntoView({block:'nearest',behavior:'smooth'})},true);
      action('↑',()=>move(pos,-1));action('↓',()=>move(pos,1));action('×',()=>remove(pos));card.append(actions);list.append(card);
      const pill=document.createElement('button');pill.type='button';pill.className='ai-timeline-pill'+(state.scene===idx?' selected':'');
      pill.textContent=`${pos+1} · ${s.name.slice(0,24)} · ${state.durations[idx]}s`;
      pill.onclick=()=>{stopPreview();setScene(idx);setTab('content');drawStoryboard()};strip.append(pill);
    });
    $id('aiStoryboardActions').hidden=!generated.order.length;
    $id('aiStripWrap').hidden=!generated.order.length;
  }
  function move(i,d){const j=i+d;if(j<0||j>=generated.order.length)return;[generated.order[i],generated.order[j]]=[generated.order[j],generated.order[i]];drawStoryboard()}
  function remove(i){const removed=generated.order.splice(i,1)[0];if(state.scene===removed)setScene(generated.order[0]??0);drawStoryboard()}
  function renderStoryAt(seconds,canvas=cv){
    let remaining=seconds;
    for(let pos=0;pos<generated.order.length;pos++){
      const idx=generated.order[pos],dur=state.durations[idx]||6;
      if(remaining<dur||pos===generated.order.length-1){
        state.scene=idx;state.t=Math.min(.9999,Math.max(0,remaining/dur));
        renderScene(canvas.getContext('2d'),idx,state.t,canvas,{thumb:canvas!==cv});return pos;
      }
      remaining-=dur;
    }
    return 0;
  }
  function stopPreview(){if(generated.raf)cancelAnimationFrame(generated.raf);generated.playing=false;generated.raf=0;const b=$id('aiPlayStory');if(b)b.textContent='▶ Play full storyboard'}
  function playStory(){
    if(generated.playing){stopPreview();return}
    if(!generated.order.length)return;
    state.playing=false;generated.playing=true;
    const total=generated.order.reduce((a,i)=>a+(state.durations[i]||6),0),start=performance.now();let last=-1;
    $id('aiPlayStory').textContent='Ⅱ Stop preview';
    function tick(now){if(!generated.playing)return;const sec=(now-start)/1000;if(sec>=total){stopPreview();setScene(generated.order[0]);state.playing=false;drawStoryboard();return}
      const pos=renderStoryAt(sec);if(last!==pos){last=pos;drawStoryboard();}
      generated.raf=requestAnimationFrame(tick);
    }
    generated.raf=requestAnimationFrame(tick)
  }
  async function askCloudAI(segments,notes){
    const connection=$id('aiConnection').value;
    const allowed=[...new Set(Object.values(TEMPLATES).flat())].filter(matches);
    const cloud=window.MotionStudioCloudAI;
    if(!cloud)throw Error('The hosted AI connection module could not be loaded.');
    const settings={connection,model:$id('aiModel').value,apiKey:$id('aiApiKey').value.trim(),
      proxyUrl:$id('aiProxyUrl').value.trim(),segments,notes,allowedTemplates:allowed};
    const result=await cloud.recommend(settings);
    generated.usedModel=result.model;
    const suggested=new Map();
    for(const slide of result.slides){
      if(Number.isInteger(slide.segment)&&slide.segment>=0&&slide.segment<segments.length&&matches(slide.template)&&!suggested.has(slide.segment)){
        suggested.set(slide.segment,slide.template);
      }
    }
    if(!suggested.size)throw Error('Cloud AI returned no valid layout suggestions; please try again.');
    return suggested;
  }
  function applyModelSuggestions(plans,prefs){
    plans.forEach((plan,i)=>{const chosen=prefs.get(i);if(!chosen)return;
      // Category safety: prevent data charts on words-only scripts and prevent unverified map routes.
      const n=figures(plan.source).length;
      const isChart=['bar','ranking','donut','timeline','waterfall','v8_stack_towers','v8_wave_compare','v8_radial_meter','v8_liquid_level'].includes(chosen);
      if(isChart && n<2)return;
      if(['world_route','india_route','map_flow','geo_salary'].includes(chosen)&&!plan.data.route)return;
      const original=matches(chosen);if(!original)return;
      const replacement=makePlan(chosen,plan.title,plan.source,{},plan.kind,plan.warnings);
      // Carry only fields compatible with chosen layout; reusing source data is safer than model-generated fields.
      for(const f of original.fields){if(plan.data[f.key])replacement.data[f.key]=plan.data[f.key]}
      if('value' in replacement.data&&!replacement.data.value){replacement.data.value=figures(plan.source)[0]||safeStr(plan.source,95)}
      if('quote' in replacement.data&&!replacement.data.quote)replacement.data.quote=safeStr(plan.source,220);
      if('a' in replacement.data&&!replacement.data.a)replacement.data.a=safeStr(plan.source,70);
      if('note' in replacement.data&&!replacement.data.note)replacement.data.note=safeStr(plan.source,150);
      // Avoid blank/invented bar data when model suggests quantitative graphics.
      if(isChart&&!replacement.data.values&&!replacement.data.seriesA)return;
      plans[i]=replacement;
    });
  }
  async function generate(){
    stopPreview();const btn=$id('aiGenerate'),content=$id('aiScript').value.trim(),data=$id('aiData').value.trim();
    if(!content&&!data){report('Paste a Kannada/English script or CSV/JSON data first.',true);return}
    btn.disabled=true;btn.textContent='Creating…';
    try{
      const max=Number($id('aiSceneCount').value)||6;let planned,warnings=[],segments=[];
      if(data){const dataset=parseData(data);const r=planDataset(dataset,content,max);planned=r.slides;warnings.push(...r.warnings);segments=planned.map(x=>x.source)}
      else {planned=planScript(content,max);segments=planned.map(x=>x.source)}
      report('Asking hosted Gemini to match your Kannada/English story with the best layouts…');
      const suggestions=await askCloudAI(segments,content);
      applyModelSuggestions(planned,suggestions);
      if(!planned.length)throw Error('No suitable scenes could be created from this input.');
      clearGenerated();generated.source=[content,data].filter(Boolean).join('\n\n');generated.warnings=warnings;
      for(const plan of planned)addGenerated(plan);
      const warningsEl=$id('aiWarnings');warningsEl.replaceChildren();warnings.forEach(w=>{const x=document.createElement('div');x.className='ai-warning';x.textContent='⚠ '+w;warningsEl.append(x)});
      state.category='ALL';categories();sceneList();setScene(generated.order[0]);state.playing=false;drawStoryboard();
      const kannada=isKannada(generated.source);if(kannada){const pick=$id('studioFont');if(pick){pick.value='Anek Kannada';pick.dispatchEvent(new Event('change',{bubbles:true}))}}
      report(`${planned.length} scenes created with ${generated.usedModel||'Gemini'}. Review numbers, text and scene design before exporting.`);
    }catch(e){report(e.message,true)}finally{btn.disabled=false;btn.textContent='✦ Generate motion storyboard'}
  }
  async function exportStory(mode){
    if(generated.exporting||state.recording||!generated.order.length)return;
    stopPreview();const old={scene:state.scene,t:state.t,playing:state.playing};
    const btn=$id(mode==='mp4'?'aiExportMP4':'aiExportWebM');btn.disabled=true;generated.exporting=true;state.recording=true;state.playing=false;
    const fps=Number($id('aiStoryFPS').value)||30,total=generated.order.reduce((a,i)=>a+(state.durations[i]||6),0);
    const [w,h]=state.ratio==='portrait'?[720,1280]:state.ratio==='square'?[1080,1080]:[1280,720];
    const temp=document.createElement('canvas');temp.width=w;temp.height=h;
    try{
      if(mode==='mp4'){
        if(!window.VideoEncoder||!window.VideoFrame)throw Error('MP4 needs Chrome/Edge with WebCodecs over HTTPS or localhost.');
        report('Loading MP4 encoder…');
        const lib=await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm');
        const config={codec:'avc1.64001f',width:w,height:h,framerate:fps,bitrate:7000000,avc:{format:'avc'}};
        const support=await VideoEncoder.isConfigSupported(config);if(!support.supported)throw Error('This browser cannot encode H.264 at this resolution.');
        const muxer=new lib.Muxer({target:new lib.ArrayBufferTarget(),video:{codec:'avc',width:w,height:h},fastStart:'in-memory',firstTimestampBehavior:'offset'});
        let err;const encoder=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>{err=e}});
        try{
          encoder.configure(config);
          const frames=Math.ceil(total*fps);
          for(let i=0;i<frames;i++){
            if(err)throw err;renderStoryAt(i/fps,temp);
            const frame=new VideoFrame(temp,{timestamp:Math.round(i*1000000/fps),duration:Math.round(1000000/fps)});
            encoder.encode(frame,{keyFrame:i%fps===0});frame.close();
            if(encoder.encodeQueueSize>8)await encoder.flush();
            if(i%15===0){report(`Encoding storyboard MP4: ${Math.round(100*i/frames)}%`);await new Promise(r=>setTimeout(r,0))}
          }
          await encoder.flush();if(err)throw err;muxer.finalize();
          const out=new Blob([muxer.target.buffer],{type:'video/mp4'});download(out,'Motion_Studio_AI_Storyboard.mp4');report('Full storyboard MP4 exported.');
        }finally{encoder.close()}
      }else{
        if(!temp.captureStream||!window.MediaRecorder)throw Error('WebM needs MediaRecorder and canvas capture support.');
        const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(MediaRecorder.isTypeSupported);
        if(!mime)throw Error('No supported WebM codec in this browser.');
        const stream=temp.captureStream(fps),chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
        const done=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onerror=e=>reject(e.error||Error('Recording error'));rec.onstop=()=>resolve()});
        renderStoryAt(0,temp);rec.start(100);const start=performance.now();
        await new Promise(resolve=>{
          function frame(now){const delta=(now-start)/1000;renderStoryAt(Math.min(delta,total),temp);if(delta>=total)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame);
        });
        rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
        if(!chunks.length)throw Error('The browser did not produce video data');
        download(new Blob(chunks,{type:mime}),'Motion_Studio_AI_Storyboard.webm');report('Full storyboard WebM exported.');
      }
    }catch(e){report('Storyboard export failed: '+e.message,true)}
    finally{state.recording=false;generated.exporting=false;btn.disabled=false;state.scene=old.scene;state.t=old.t;state.playing=old.playing;setScene(old.scene);state.playing=old.playing;resetClock(old.t);drawStoryboard()}
  }
  async function loadInputFile(file){if(!file)return;if(file.size>2*1024*1024){report('Choose a text/CSV/JSON file under 2 MB.',true);return}
    try{const text=await file.text();const target=/\.(csv|json)$/i.test(file.name)?'aiData':'aiScript';$id(target).value=text;report(`Loaded ${file.name}. Select Generate motion storyboard.`)}catch(e){report(e.message,true)}
  }
  function makeDemo(mode){if(mode==='script'){
      $id('aiScript').value=`2016ರಲ್ಲಿ ₹1,00,000 ಹಣವನ್ನು ಆರು ಹೂಡಿಕೆಗಳಲ್ಲಿ ಸಮವಾಗಿ ಹೂಡಿಕೆ ಮಾಡಲಾಗಿದೆ.\nಉಳಿತಾಯ ಖಾತೆಯಲ್ಲಿ ₹16,667 ಇಟ್ಟರೆ 2026ರಲ್ಲಿ ₹22,833 ಆಗುತ್ತದೆ.\nಸ್ಥಿರ ಠೇವಣಿಯಲ್ಲಿ ₹16,667 ಹೂಡಿಕೆ ಮಾಡಿದರೆ ₹29,833 ಆಗುತ್ತದೆ.\nಮ್ಯೂಚುಯಲ್ ಫಂಡ್‌ನಲ್ಲಿ ₹16,667 ಹೂಡಿಕೆ ₹51,833 ಆಗುತ್ತದೆ.\nಚಿನ್ನದಲ್ಲಿ ₹16,667 ಹೂಡಿಕೆ ₹78,938 ಮೌಲ್ಯ ತಲುಪುತ್ತದೆ.\nಒಟ್ಟು ಪೋರ್ಟ್‌ಫೋಲಿಯೊ ಮೌಲ್ಯ ₹2,61,340 ಎಂದು ನೀಡಲಾಗಿದೆ.`;$id('aiData').value='';
    }else{
      $id('aiScript').value='2016–2026 · ಆರು ಆಸ್ತಿಗಳ ಹೂಡಿಕೆ ಮತ್ತು ಅಂತಿಮ ಮೌಲ್ಯ';
      $id('aiData').value='Asset,Investment 2016,Value 2026\nSavings Account,16667,22833\nFixed Deposit,16667,29833\nReal Estate,16667,27167\nMutual Fund,16667,51833\nNifty 50,16667,50735\nGold,16667,78938';
    }
    report('Example loaded. These are illustrative supplied figures, not verified financial results.');
  }
  function saveAIProject(){
    const obj={format:'your-next-move-motion-studio',version:10,graphicScale:state.graphicScale,ratio:state.ratio,scene:state.scene,theme:state.theme,colors:state.colors,
      data:state.data,typo:state.typo,durations:state.durations,speed:state.speed,mapZoom:state.mapZoom,mapRegion:state.mapRegion,mapLabels:state.mapLabels,
      safe:state.safe,showGrid:state.showGrid,bgStyle:state.bgStyle,bgStyles:state.bgStyles,bgImage:state.bgImage,overlay:state.overlay,
      motionPreset:state.motionPreset,textMotion:state.textMotion,atmosphere:state.atmosphere,fxStrength:state.fxStrength,metricAnimation:state.metricAnimation,
      studioFont:window.studioTypeface||'Inter',customFont:state.customFont||null,
      ai:{generatedScenes:SCENES.slice(BASE_COUNT).map(s=>({id:s.id,name:s.name,category:s.category,desc:s.desc,seconds:s.seconds,fields:s.fields,aiMeta:s.aiMeta})),
        order:generated.order,source:generated.source,warnings:generated.warnings}};
    download(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),'Motion_Studio_Ultra_V11_AI_Project.json');report('Editable AI storyboard project saved.');
  }
  async function loadAIProject(file){try{
      const obj=JSON.parse(await file.text());
      if(obj.format!=='your-next-move-motion-studio')throw Error('Not a Motion Studio project.');
      clearGenerated();
      if(obj.ai?.generatedScenes?.length){for(const s of obj.ai.generatedScenes.slice(0,40)){
        if(!matches(s.id))continue;
        SCENES.push({id:s.id,name:safeStr(s.name),category:'AI STORY',desc:safeStr(s.desc),seconds:Number(s.seconds)||6,
          fields:matches(s.id).fields.map(f=>({...f})),aiMeta:{...s.aiMeta,originalId:s.id}});
        state.data.push(Object.fromEntries(matches(s.id).fields.map(f=>[f.key,f.value])));
        state.typo.push({});state.durations.push(Number(s.seconds)||6);state.bgStyles.push(null);
      }
      generated.order=(obj.ai.order||[]).filter(i=>Number.isInteger(i)&&i>=BASE_COUNT&&i<SCENES.length);
      generated.source=obj.ai.source||'';generated.warnings=obj.ai.warnings||[];
      $id('aiScript').value=generated.source;
      }
      // use the existing validated project loader once the scene records exist
      loadProject(file);setTimeout(()=>{drawStoryboard();categories();sceneList()},120);
    }catch(e){report('Import failed: '+e.message,true)}
  }
  function wire(){
    $id('aiGenerate').onclick=generate;
    $id('aiTestConnection').onclick=async()=>{
      const b=$id('aiTestConnection');b.disabled=true;b.textContent='Testing connection…';
      try{
        const result=await window.MotionStudioCloudAI.recommend({connection:$id('aiConnection').value,model:$id('aiModel').value,
          apiKey:$id('aiApiKey').value.trim(),proxyUrl:$id('aiProxyUrl').value.trim(),
          segments:['ಕನ್ನಡ motion graphics — test'],notes:'Connection test only',allowedTemplates:['hook_clean','quote_panel','stat']});
        report('✓ Gemini connection verified · '+result.model+'. You can generate scenes now.');
      }catch(e){report('AI connection test failed: '+e.message,true)}
      finally{b.disabled=false;b.textContent='◉ Test AI connection'}
    };
    $id('aiPlayStory').onclick=playStory;
    $id('aiExportMP4').onclick=()=>exportStory('mp4');
    $id('aiExportWebM').onclick=()=>exportStory('webm');
    $id('aiReset').onclick=()=>{clearGenerated();report('Storyboard cleared. Original templates remain available.')};
    $id('aiExampleScript').onclick=()=>makeDemo('script');$id('aiExampleData').onclick=()=>makeDemo('data');
    $id('aiFile').onchange=e=>{loadInputFile(e.target.files?.[0]);e.target.value=''};
    $id('aiConnection').onchange=e=>{
      const secure=e.target.value==='proxy';
      $id('aiDirectSettings').hidden=secure;
      $id('aiProxySettings').hidden=!secure;
    };
    $id('aiKeyReveal').onclick=()=>{
      const el=$id('aiApiKey');const visible=el.type==='text';el.type=visible?'password':'text';
      $id('aiKeyReveal').textContent=visible?'Show':'Hide';
    };
    $id('aiTabLaunch').onclick=()=>{setTab('ai');$id('aiScript').focus()};
    $id('fileProject').onchange=e=>{if(e.target.files?.[0])loadAIProject(e.target.files[0]);e.target.value=''};
    $id('saveProject').onclick=saveAIProject;
    // Existing scene selector remains fully editable.
    const originalSet=setScene;setScene=function(i){stopPreview();originalSet(i);if(generated.order.length)drawStoryboard()};
    window.MotionStudio.setScene=setScene;window.MotionStudio.saveProject=saveAIProject;window.MotionStudio.version='11.0 Gemini Interactions AI';
    window.MotionStudio.AI={planScript,parseData,planDataset,generated,generate,playStory,saveAIProject};
    document.querySelector('[data-tab="ai"]')?.addEventListener('click',()=>drawStoryboard());
    // Font shaping should be ready before PNG/MP4 rendering, including Anek Kannada.
    document.fonts?.load('700 42px "Anek Kannada"').catch(()=>{});
    drawStoryboard();
  }
  wire();
})();
