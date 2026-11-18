(() => {
  'use strict';
  const $=id=>document.getElementById(id),core=window.AviBrief;
  let brief=null,view='brief',operation=null,timer=null,progressTimer=null;
  window.AviWorkspace={getBrief:()=>brief};
  const storageKey=()=>`avi_ai_byok_v1_${$('provider').value}`;
  const status=(message,tone='')=>{$('request-status').textContent=message;$('request-status').dataset.tone=tone;};
  function saveKey(){
    try{if($('remember-key').checked)localStorage.setItem(storageKey(),JSON.stringify({key:$('api-key').value,model:$('model-id').value||$('model').value}));else localStorage.removeItem(storageKey());}
    catch{status('Browser storage is unavailable. Your key will be used only in this tab.');}
  }
  function restoreProvider(){
    $('api-key').value='';$('model-id').value='';$('model').replaceChildren(new Option('Load models or enter a model ID below',''));$('remember-key').checked=false;
    try{const value=JSON.parse(localStorage.getItem(storageKey())||'null');if(value?.key){$('api-key').value=value.key;$('model-id').value=value.model||'';$('remember-key').checked=true;}}catch{}
    $('api-key').type='password';$('show-key').textContent='Show';$('show-key').setAttribute('aria-label','Show API key');
    $('provider-docs').href=$('provider').value==='openai'?'https://platform.openai.com/api-keys':'https://aistudio.google.com/apikey';
  }
  function busy(active){
    $('generate').disabled=active;$('load-models').disabled=active;$('provider').disabled=active;$('example').disabled=active;
    $('cancel').hidden=!active;$('generate').textContent=active?'Working on your brief…':'✦ Create my brief';
  }
  function begin(generation=false){operation=new AbortController();const started=Date.now();timer=setTimeout(()=>operation?.abort('timeout'),generation?240000:30000);if(generation)progressTimer=setInterval(()=>{if(!$('request-status').dataset.receiving)status('Waiting for the model… '+Math.round((Date.now()-started)/1000)+' seconds. You can cancel at any time.');},1000);busy(true);return operation;}
  function finish(){clearTimeout(timer);clearInterval(progressTimer);delete $('request-status').dataset.receiving;operation=null;busy(false);}
  const toolLinks={brief:['../../../studio.html','design workspace'],ideas:['../../../studio.html','design workspace'],poster:['../../../studio.html?view=poster','Poster Studio'],carousel:['../../../studio.html?view=carousel','Carousel Studio'],motion:['../motion-studio/','Motion Studio'],infographic:['../infographic-studio/','Infographic Studio'],maps:['../india-motion/','India Motion'],images:['../../../studio.html?view=imageGenerator','AI Images'],caption:['../../../studio.html?panel=publish','publishing']};
  function showOutput(){
    if(!brief)return;
    $('output-text').value=core.format(brief,view);$('output-label').textContent=view==='brief'?'Creative brief':`${view[0].toUpperCase()+view.slice(1)} · tool-ready output`;
    document.querySelectorAll('[data-output]').forEach(button=>{const active=button.dataset.output===view;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
    const [href,name]=toolLinks[view];$('open-tool').href=href;$('open-tool').textContent=`Open ${name} ↗`;
  }
  function displayBrief(value,kind){
    brief=value;view='brief';$('empty-output').hidden=true;$('result').hidden=false;$('result-kind').textContent=kind;
    const title=document.createElement('h3'),summary=document.createElement('p');title.textContent=brief.title;summary.textContent=brief.summary;$('brief-overview').replaceChildren(title,summary);
    const notes=brief.verificationNotes.length?brief.verificationNotes:['All included source figures have matching quoted excerpts. Review the wording and source claims before publishing.'];
    $('review-list').replaceChildren(...notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li;}));$('notes-count').textContent=brief.verificationNotes.length?`· ${brief.verificationNotes.length} notes`:'· source checks';
    $('download-csv').disabled=!brief.facts.length;showOutput();
  }
  $('source').addEventListener('input',()=>{$('source-count').textContent=$('source').value.length;});
  $('provider').addEventListener('change',()=>{restoreProvider();status('Provider changed. Load models or enter a model ID available to your key.');});
  $('show-key').addEventListener('click',()=>{const visible=$('api-key').type==='password';$('api-key').type=visible?'text':'password';$('show-key').textContent=visible?'Hide':'Show';$('show-key').setAttribute('aria-label',visible?'Hide API key':'Show API key');});
  $('remember-key').addEventListener('change',()=>{saveKey();status($('remember-key').checked?'Key saved in this browser. You can forget it at any time.':'Saved key removed. The current key remains only in this tab.');});
  $('api-key').addEventListener('change',saveKey);$('model-id').addEventListener('change',saveKey);
  $('model').addEventListener('change',()=>{$('model-id').value='';saveKey();});
  $('forget-key').addEventListener('click',()=>{try{localStorage.removeItem(storageKey());}catch{}$('remember-key').checked=false;$('api-key').value='';status('Saved key removed and the key field cleared.');});
  $('cancel').addEventListener('click',()=>operation?.abort('cancelled'));
  $('load-models').addEventListener('click',async()=>{
    const key=$('api-key').value.trim();if(!key){status('Enter your provider API key first.','error');$('api-key').focus();return;}
    const task=begin();status('Loading text models available to your key…');
    try{const models=await AviProvider.models($('provider').value,key,task.signal);$('model').replaceChildren(new Option('Choose a text model',''),...models.map(model=>new Option(model.name,model.id)));const recommended=$('provider').value==='gemini'?models.find(model=>/flash/.test(model.id)):null;if(recommended){$('model').value=recommended.id;$('model-id').value='';saveKey();}status(models.length?`${models.length} text models loaded. ${recommended?recommended.name+' selected for fast briefs. You can change it above.':'Choose a model, then create your brief.'}`:'No text models were listed. Enter a model ID that your provider account can use.',models.length?'success':'');}
    catch(error){status(task.signal.aborted?'Model lookup cancelled or timed out.':error.message,'error');}finally{finish();}
  });
  $('generate').addEventListener('click',async()=>{
    const source=$('source').value.trim(),key=$('api-key').value.trim(),model=($('model-id').value.trim()||$('model').value);
    if(!source){status('Paste a paragraph or source data first.','error');$('source').focus();return;}
    if(!key){status('Connect your provider key to generate. The example preview does not require a key.','error');$('api-key').focus();return;}
    if(!model){status('Load your available models or enter an available model ID.','error');$('model-id').focus();return;}
    saveKey();const task=begin(true);status('Shaping your source into a structured brief…');
    try{const result=await AviProvider.generate({provider:$('provider').value,key,model,input:{source,task:$('task').value,target:$('target').value,language:$('language').value,tone:$('tone').value,count:Number($('count').value)},signal:task.signal,onProgress:progress=>{if(progress.characters){$('request-status').dataset.receiving='true';status('Receiving your brief… '+progress.characters.toLocaleString()+' characters.');}}});displayBrief(result,'AI GENERATED · REVIEW BEFORE USE');status('Your brief is ready. Choose a tool tab, copy its formatted output, or download an editable infographic.','success');}
    catch(error){status(task.signal.aborted?(task.signal.reason==='timeout'?'The request timed out. Try fewer scenes, shorter source text, or another model.':'Request cancelled. Your previous brief is still available.'):error.message,'error');}
    finally{finish();}
  });
  document.querySelectorAll('[data-output]').forEach(button=>{
    button.addEventListener('click',()=>{view=button.dataset.output;showOutput();});
    button.addEventListener('keydown',event=>{const tabs=[...document.querySelectorAll('[data-output]')],index=tabs.indexOf(button);let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();tabs[next].click();tabs[next].focus();}});
  });
  $('copy-output').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('output-text').value);status('Output copied. Open the selected studio and use it in the relevant text or data field.','success');}catch{status('Clipboard access is unavailable. Select the output text or download it instead.','error');}});
  function download(data,name,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  $('download-output').addEventListener('click',()=>download($('output-text').value,`avi-${view}.txt`,'text/plain;charset=utf-8'));
  $('download-brief').addEventListener('click',()=>download(JSON.stringify({format:'avi-creative-brief',version:1,brief},null,2),'avi-creative-brief.json','application/json'));
  $('download-csv').addEventListener('click',()=>download(core.csv(brief),'avi-source-data.csv','text/csv;charset=utf-8'));
  $('download-infographic').addEventListener('click',()=>download(JSON.stringify(core.infographicProject(brief),null,2),'avi-infographic-project.json','application/json'));
  $('example').addEventListener('click',()=>{
    const source='A community reading project opened new libraries in three cities. Bengaluru added 12 libraries. Mysuru added 8 libraries. Mangaluru added 5 libraries. The project aims to make books easier to access.';
    $('source').value=source;$('source-count').textContent=source.length;
    displayBrief(core.normalize({title:'More books. Closer to home.',summary:'An example creative brief about a community reading project in Bengaluru, Mysuru and Mangaluru.',angles:[{title:'A library around the corner',hook:'Start with the everyday journey to find a good book.',format:'Photo-led carousel'},{title:'Three cities, one reading movement',hook:'Compare the supplied library counts with a simple graphic.',format:'Infographic or motion explainer'}],sections:[{heading:'Books within reach',body:'A community reading project opened new libraries in three cities.',visual:'A bold headline over a library photograph.',narration:'A new chapter in local access to books.'},{heading:'Three cities, more spaces to read',body:'Bengaluru added 12 libraries. Mysuru added 8 libraries. Mangaluru added 5 libraries.',visual:'Compare the three supplied figures in a labelled bar chart.',narration:'Show each city name with its original figure.'},{heading:'The next chapter',body:'The project aims to make books easier to access.',visual:'A simple closing card with a book illustration.',narration:'End with the stated purpose, without claiming results not in the source.'}],facts:[{label:'Bengaluru',value:'12',unit:'libraries',evidence:'Bengaluru added 12 libraries.'},{label:'Mysuru',value:'8',unit:'libraries',evidence:'Mysuru added 8 libraries.'},{label:'Mangaluru',value:'5',unit:'libraries',evidence:'Mangaluru added 5 libraries.'}],locations:[{name:'Bengaluru',latitude:null,longitude:null,note:'12 libraries'},{name:'Mysuru',latitude:null,longitude:null,note:'8 libraries'},{name:'Mangaluru',latitude:null,longitude:null,note:'5 libraries'}],imagePrompts:['Editorial illustration of an open book becoming a welcoming community library, clean electric-blue and white palette, no text.'],caption:'More spaces to read, closer to home. A community reading project across three cities.',verificationNotes:['Demonstration data only. This is a labelled example, not a news report or an AI provider response.']},source),'EXAMPLE · NO API REQUEST');
    status('Example loaded locally. Replace the paragraph and connect your own key to generate a real brief.');
  });
  restoreProvider();
})();
