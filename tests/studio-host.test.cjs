const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

test('every old studio entry redirects into the shared shell without redirecting its embedded editor',()=>{
 const code=fs.readFileSync('assets/apps/suite-embed.js','utf8');
 for(const id of ['infographic-studio','motion-studio','india-motion','ai-workspace']){
   let next='',embedded=false;const window={};window.parent=window;
   const location={pathname:'/avi-studio/assets/apps/'+id+'/',href:'https://example.com/avi-studio/assets/apps/'+id+'/',search:'',replace:v=>next=String(v)};
   vm.runInNewContext(code,{window,location,URL,URLSearchParams,document:{documentElement:{classList:{add:()=>embedded=true}}}});
   assert.equal(new URL(next).pathname,'/avi-studio/studio.html');assert.equal(new URL(next).searchParams.get('studio'),id);
   next='';window.parent={};vm.runInNewContext(code,{window,location,URL,URLSearchParams,document:{documentElement:{classList:{add:()=>embedded=true}}}});assert.equal(next,'');assert.equal(embedded,true);
 }
});

test('studio navigation retains editor state and publishing takes an isolated current artwork snapshot',async()=>{
 const code=fs.readFileSync('assets/studio-host.js','utf8'),elements=new Map(),mutations=[];let mode='carousel';
 const node=(id)=>({id,value:id==='caption'?'Carousel caption':'',children:[],dataset:{},classList:{contains:()=>false,toggle(){},remove(){}},append(n){this.children.push(n)},addEventListener(){},setAttribute(){},removeAttribute(){},getAttribute(){return ''},getContext(){return {fillRect(){},drawImage(){}}},toDataURL(){return 'data:image/jpeg;base64,test'}});
 for(const id of ['studioPanel','studioHostStatus','caption','topWorkspace','artworkDownload','inspectorToggle'])elements.set(id,node(id));
 const source={width:1080,height:1350};const childDocs={getElementById:id=>id==='stage'?source:null};
 const document={getElementById:id=>elements.get(id),querySelectorAll:()=>[],querySelector:()=>node('dashboard'),createElement:tag=>tag==='iframe'?{...node('frame'),contentDocument:childDocs,contentWindow:{exportPNG:async()=>source}}:{...node('canvas'),width:0,height:0}};
 const ctx={window:{addEventListener(){}},document,URL,URLSearchParams,location:{href:'https://example.com/studio.html',search:''},history:{replaceState(){}},MutationObserver:class{constructor(fn){mutations.push(fn)}observe(){}},draftKind:'carousel',draftCaptions:{carousel:''},studioReady:true,workspaceRecord:async()=>null,loadImg:async()=>null,updateCharCount(){},switchMode(value){mode=value}};
 Object.defineProperty(ctx,'currentMode',{get:()=>mode});vm.runInNewContext(code,ctx);
 const host=ctx.window.AviStudioHost;host.open('infographic-studio');assert.equal(elements.get('caption').value,'','A carousel caption must not leak into a new studio');
 await host.preparePublish();assert.equal(host.artwork().length,1);assert.notEqual(host.artwork()[0],source,'Publishing uses a snapshot, not a moving canvas');
 const firstFrame=elements.get('studioPanel').children[0];host.open('motion-studio');host.open('infographic-studio');assert.equal(elements.get('studioPanel').children.length,2);assert.equal(elements.get('studioPanel').children[0],firstFrame,'Switching preserves the imported editor');
 mode='carousel';mutations[0]();assert.equal(elements.get('caption').value,'Carousel caption');
});
