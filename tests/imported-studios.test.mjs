import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('assets/apps/source-manifest.json',root),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
for (const app of manifest.apps) test(app.id+' retains the original application scripts and local assets',async()=>{
  const url=new URL('assets/apps/'+app.id+'/index.html',root);
  const html=await readFile(url,'utf8');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(match=>sha(match[0])),app.scripts);
  assert.equal([...html.matchAll(/\bid=["'][^"']+["']/gi)].length,app.originalElementIds);
  assert.ok(!/<iframe\b/i.test(html),'each editor is a standalone page');
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    if (/^(?:https?:|data:|#)/.test(match[1])) continue;
    await access(new URL(match[1].split('?')[0],url));
  }
  for (const path of ['../../../index.html','../../../studio.html']) assert.ok(html.includes(path), 'suite/home navigation remains available');
});
test('India Motion keeps the supplied map data exactly',async()=>{
  const data=await readFile(new URL('assets/apps/india-motion/india-official-data.js',root));
  assert.equal(sha(data),'fb06dc01088b68922d7062cf39d053cb81f2bd8e0934b195cde82aae13c215f1');
});
test('workspace navigation exposes all three new standalone studios',async()=>{
  const html=await readFile(new URL('index.html',root),'utf8');
  for(const app of manifest.apps) assert.ok(html.includes('./assets/apps/'+app.id+'/'));
});
test('landing directory has 15 tools and all local destinations exist',async()=>{
  const html=await readFile(new URL('landing.html',root),'utf8');
  assert.equal([...html.matchAll(/<a\b[^>]*\bdata-category=["'][^"']+["'][^>]*>/gi)].length,15);
  for(const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href=match[1];
    if (/^(?:https?:|#|mailto:)/.test(href)) continue;
    let path=href.split(/[?#]/)[0];
    if(path==='./' || path==='./index.html') path='landing.html';
    else if(path==='./studio.html') path='index.html';
    else if(path.endsWith('/')) path+='index.html';
    await access(new URL(path,root));
  }
});
