import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Reapply the AvIStudio presentation layer without rewriting the original app.
// Usage: node tools/import-infographic-studio.mjs path/to/Infographic_Studio_v3.html
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Provide the original Infographic Studio HTML path.');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(projectRoot, 'assets/apps/infographic-studio/index.html');
const original = await readFile(sourcePath);
let html = original.toString('utf8');
const scripts = value => [...value.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(m => m[0]);
const originalScripts = scripts(html);
if (!originalScripts.length) throw new Error('No original application scripts found.');

const presentationHead = `
<meta name="description" content="Create infographics, charts, QR codes and visual stories with the AvIStudio Infographic Studio.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700;800&family=Instrument+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="app.css">
`;
const navigation = `
<a class="avi-skip" href="#area">Skip to canvas</a>
<header class="avi-header">
  <a class="avi-brand" href="../../../index.html" aria-label="AvIStudio home"><span class="avi-mark" aria-hidden="true">a</span>AvI<span>Studio</span></a>
  <span class="avi-header-divider" aria-hidden="true"></span>
  <div class="avi-app-heading"><span class="avi-eyebrow">DESIGN TOOLS</span><h1>Infographic Studio<span class="avi-app-tag">V3</span></h1></div>
  <nav class="avi-app-nav" aria-label="Studio tools">
    <a href="../../../studio.html">Workspace<span aria-hidden="true"> ↗</span></a>
    <a href="../motion-studio/">Motion</a>
    <a href="../india-motion/">India Motion</a>
    <a href="./" aria-current="page">Infographics</a>
  </nav>
</header>
`;
html = html.replace('</head>', `${presentationHead}</head>`).replace('<body>', `<body>${navigation}`);
if (scripts(html).some((script, index) => script !== originalScripts[index]) || scripts(html).length !== originalScripts.length) {
  throw new Error('Presentation changes modified an original script.');
}
for (const script of originalScripts) {
  if (!/^<script\b[^>]*\bsrc=/i.test(script)) {
    new vm.Script(script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script\s*>$/i, ''), { filename: 'infographic-original.js' });
  }
}
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, html, 'utf8');
const written = await readFile(destination, 'utf8');
if (scripts(written).some((script, index) => script !== originalScripts[index])) throw new Error('Written script equality check failed.');
const digest = value => createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({
  destination: 'assets/apps/infographic-studio/index.html',
  scriptsPreserved: originalScripts.length,
  scriptHashes: originalScripts.map(digest),
  originalBytes: original.byteLength,
  outputBytes: Buffer.byteLength(written),
  syntax: 'valid',
}, null, 2));
