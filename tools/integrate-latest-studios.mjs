import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// Only the presentation shell is injected. Application code is never rewritten.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sources=[
  {id:'infographic-studio',name:'Infographic Studio',version:'V4',file:process.argv[2]},
  {id:'motion-studio',name:'Motion Studio',version:'V12.5',file:process.argv[3],assets:true},
  {id:'india-motion',name:'India Motion',version:'V28',file:process.argv[4],data:true},
];
if(sources.some(source=>!source.file))throw new Error('Pass Infographic HTML, Motion HTML, and India Motion HTML paths.');
const digest=value=>createHash('sha256').update(value).digest('hex');
const scripts=html=>[...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(match=>match[0]);
const ids=html=>[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match=>match[1]).sort();
const manifest={version:2,apps:[]};
for(const source of sources){
  const bytes=await readFile(source.file),original=bytes.toString('utf8'),destination=join(root,'assets/apps',source.id);
  const originalScripts=scripts(original);
  const links=[['../../../index.html','Home'],['../../../studio.html','Design workspace'],['../infographic-studio/','Infographics'],['../motion-studio/','Motion'],['../india-motion/','India Motion'],['../ai-workspace/','AI workspace']];
  const navigation=`<nav class="avi-suite" aria-label="AvI Studio tools"><a class="avi-suite-brand" href="../../../index.html" aria-label="AvI Studio home"><span class="avi-suite-mark" aria-hidden="true">A</span><strong>AvI Studio</strong></a><span class="avi-suite-product">${source.name} <small>${source.version}</small></span><div class="avi-suite-links">${links.map(([href,label])=>`<a href="${href}"${href===`../${source.id}/`?' aria-current="page"':''}>${label}</a>`).join('')}</div></nav>`;
  let html=original.replace(/<title>[\s\S]*?<\/title>/i,`<title>${source.name} ${source.version} | AvI Studio</title>`).replace('</head>','<link rel="stylesheet" href="../suite-brand.css?v=2"></head>').replace(/<body([^>]*)>/i,`<body$1 data-avi-app="${source.id}">${navigation}`);
  if(JSON.stringify(scripts(html))!==JSON.stringify(originalScripts))throw new Error(`Scripts changed in ${source.id}`);
  if(JSON.stringify(ids(html))!==JSON.stringify(ids(original)))throw new Error(`Element IDs changed in ${source.id}`);
  for(const script of originalScripts)if(!/^<script\b[^>]*\bsrc=/i.test(script))new vm.Script(script.replace(/^<script\b[^>]*>/i,'').replace(/<\/script\s*>$/i,''));
  await mkdir(destination,{recursive:true});
  const files={};
  if(source.assets){
    await cp(join(dirname(source.file),'assets'),join(destination,'assets'),{recursive:true});
    await cp(join(dirname(source.file),'samples'),join(destination,'samples'),{recursive:true});
    for(const path of ['assets/world.js','assets/studio.js','assets/cloud-ai.js','assets/ai-studio.js','assets/studio.css','assets/ai-studio.css'])files[path]=digest(await readFile(join(dirname(source.file),path)));
  }
  if(source.data){const path='india-official-data.js';await cp(join(dirname(source.file),path),join(destination,path));files[path]=digest(await readFile(join(destination,path)));}
  // Integration hooks leave default native exports unchanged.
  if(source.id==='infographic-studio')html=html.replace('async function exportPNG(){','async function exportPNG(options){').replace(" H('a',{href:c.toDataURL(EX.f,.95)"," if(options?.aviCapture)return c;\n H('a',{href:c.toDataURL(EX.f,.95)");
  html=html.replace('</head>','<script src="../suite-embed.js?v=1"></script></head>').replace('suite-brand.css?v=2','suite-brand.css?v=3');
  await writeFile(join(destination,'index.html'),html);
  manifest.apps.push({id:source.id,version:source.version,sourceSha256:digest(bytes),scripts:originalScripts.map(digest),originalElementIds:ids(original).length,files});
  console.log(`${source.name} ${source.version}: ${originalScripts.length} original script tags and ${ids(original).length} element IDs preserved.`);
}
await writeFile(join(root,'assets/apps/source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
