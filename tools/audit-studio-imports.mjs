import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const ids = ['infographic-studio','motion-studio','india-motion'];
const sha = value => createHash('sha256').update(value).digest('hex');
const scripts = html => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(match=>match[0]);
const attributes = (html,pattern) => [...html.matchAll(pattern)].map(match=>match[0]);
if (process.argv.length!==5) throw new Error('Pass the three original HTML files: infographic, motion, India motion.');
const results=[];
for (const [index,id] of ids.entries()) {
  const source=await readFile(process.argv[index+2],'utf8');
  const imported=await readFile(new URL('../assets/apps/'+id+'/index.html',import.meta.url),'utf8');
  const originalScripts=scripts(source);
  assert.deepEqual(scripts(imported),originalScripts,id+': application scripts changed');
  const originalIds=attributes(source,/\bid=["'][^"']+["']/gi);
  assert.deepEqual(attributes(imported,/\bid=["'][^"']+["']/gi).filter(value=>originalIds.includes(value)),originalIds,id+': element IDs changed');
  for (const pattern of [/\bdata-[\w-]+=["'][^"']*["']/gi,/\bon\w+=["'][^"']*["']/gi]) {
    assert.deepEqual(attributes(imported,pattern),attributes(source,pattern),id+': data attributes or event handlers changed');
  }
  results.push({id,sourceSha256:sha(source),scripts:originalScripts.map(sha),originalElementIds:originalIds.length});
}
console.log(JSON.stringify({version:1,apps:results},null,2));
