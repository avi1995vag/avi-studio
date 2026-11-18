const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/apps/ai-workspace/core.js'),provider=require('../assets/apps/ai-workspace/provider.js');
const source='Bengaluru added 12 libraries. Mysuru added 8 libraries.';
const raw={title:'A new chapter',summary:'New libraries in two cities.',angles:[],sections:[{heading:'Access to books',body:source,visual:'Compare the supplied counts.',narration:'More libraries.'}],facts:[{label:'Bengaluru',value:'12',unit:'libraries',evidence:'Bengaluru added 12 libraries.'}],locations:[{name:'Bengaluru',latitude:12.9716,longitude:77.5946,note:'Libraries'}],imagePrompts:[],caption:'More books.',verificationNotes:[]};
test('unsupported figures and inferred coordinates are excluded from usable outputs',()=>{
 const result=core.normalize({...raw,facts:[...raw.facts,{label:'Invented',value:'99',unit:'libraries',evidence:'Bengaluru added 12 libraries.'}]},source);
 assert.equal(result.facts.length,1);assert.equal(result.locations[0].latitude,null);assert.equal(result.locations[0].longitude,null);assert.equal(result.verificationNotes.length,2);assert.doesNotMatch(core.format(result,'maps'),/12\.9716/);
});
test('structured response validation rejects incomplete output',()=>{
 assert.throws(()=>core.parseResult('{"title":'),/incomplete/);assert.throws(()=>core.normalize({title:'x'},source),/missing/);assert.equal(core.parseResult('```json\n{"title":"safe"}\n```').title,'safe');
});
test('CSV escapes spreadsheet formulas and quote/newline content',()=>{
 const data=core.csv({facts:[{label:'=IMPORTXML("https://example.com")',value:'12',unit:'libraries',evidence:'quoted "source"\nnext line'}]});assert.match(data,/'=IMPORTXML/);assert.match(data,/""source""/);assert.match(data,/\r\n/);
});
test('editable infographic matches supplied V4 import shape and preserves Kannada',()=>{
 const b=core.normalize({...raw,title:'ಪುಸ್ತಕಗಳ ಹೊಸ ಅಧ್ಯಾಯ'},source),project=core.infographicProject(b);
 assert.equal(project.W,1080);assert.equal(project.bg,'#ffffff');assert.equal(project.els[0].txt,'ಪುಸ್ತಕಗಳ ಹೊಸ ಅಧ್ಯಾಯ');assert.ok(project.els.every(e=>e.y+e.h<project.HH),'Every editable text box fits inside the canvas');assert.ok(project.els.every(e=>e.t==='text'&&e.id<project.nid&&Number.isFinite(e.h)));
});
test('Gemini uses key headers, supported model discovery, JSON output and evidence validation',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);const calls=[];
 global.fetch=async(url,opts)=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>url.includes('/models?')?{models:[{name:'models/test-text',displayName:'Text',supportedGenerationMethods:['generateContent']},{name:'models/test-image',supportedGenerationMethods:['embedContent']}]}:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(raw)}]}}]}};};
 const models=await provider.models('gemini','test-only-key');assert.deepEqual(models,[{id:'test-text',name:'Text'}]);
 const result=await provider.generate({provider:'gemini',key:'test-only-key',model:'test-text',input:{source,task:'Format',target:'All tools',language:'Kannada',tone:'Clear',count:3}});
 assert.equal(result.facts[0].value,'12');assert.ok(!calls[1].url.includes('test-only-key'));assert.equal(calls[1].opts.headers['x-goog-api-key'],'test-only-key');assert.equal(JSON.parse(calls[1].opts.body).generationConfig.responseMimeType,'application/json');
});
test('provider quota, refusal and truncated generation produce actionable failures',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);
 global.fetch=async()=>({ok:false,status:429,json:async()=>({error:{message:'quota'}})});
 await assert.rejects(provider.models('gemini','test-only-key'),/quota/);
 global.fetch=async()=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:'length',message:{content:'{unfinished'}}]})});
 await assert.rejects(provider.generate({provider:'openai',key:'test-only-key',model:'gpt-example',input:{source,count:3}}),/output limit/);
});
test('no Automation entry remains and AI workspace is linked',async()=>{
 const fs=require('node:fs');const landing=fs.readFileSync('landing.html','utf8'),workspace=fs.readFileSync('index.html','utf8');
 assert.doesNotMatch(landing,/view=scheduler/);assert.doesNotMatch(workspace,/data-mode="scheduler"/);assert.match(workspace,/ai-workspace/);assert.match(landing,/215 layouts/);
});
