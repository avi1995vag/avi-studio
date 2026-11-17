import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

// The source app owns its controls and rendering. Only presentation is added.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Pass the original Motion Studio HTML file path.');
const destination = path.join(root, 'assets/apps/motion-studio');
const source = await readFile(sourcePath, 'utf8');
const scripts = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => match[0]);
const navigation = `
<nav class="avi-suitebar" aria-label="AvIStudio tools">
  <a class="avi-brand" href="../../../index.html" aria-label="AvIStudio home"><span class="avi-brandmark" aria-hidden="true">a<span>v</span></span><span>AvI<span>Studio</span><small>YOUR CREATIVE WORKSPACE</small></span></a>
  <div class="avi-toolnav"><a href="../../../studio.html">Workspace</a><a href="../infographic-studio/">Infographics</a><a href="./" aria-current="page">Motion Studio <span class="avi-active-dot" aria-hidden="true"></span></a><a href="../india-motion/">India Motion</a></div>
  <a class="avi-home-link" href="../../../index.html"><span aria-hidden="true">↗</span> All tools</a>
</nav>`;
let output = source
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Motion Studio | AvIStudio</title>')
  .replace('</head>', '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&amp;family=Instrument+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link rel="stylesheet" href="./app.css"></head>')
  .replace('<body>', '<body>' + navigation);
if (!output.includes('class="avi-suitebar"') || !output.includes('href="./app.css"')) throw new Error('Source document structure changed');
const originalScripts = scripts(source);
const importedScripts = scripts(output);
if (JSON.stringify(originalScripts) !== JSON.stringify(importedScripts)) throw new Error('Source scripts changed');
for (const [index, script] of [...output.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  new vm.Script(script[1], { filename: `motion-studio-inline-${index}.js` });
}
const appScript = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)][1][1];
const catalog = vm.runInNewContext(appScript.slice(0, appScript.indexOf('const THEMES=')) + '\nSCENES.map(({id,name,category})=>({id,name,category}));');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'index.html'), output, 'utf8');
const report = {
  originalFile: path.basename(sourcePath),
  originalSha256: createHash('sha256').update(source).digest('hex'),
  scriptsPreserved: true,
  scriptSha256: originalScripts.map(script => createHash('sha256').update(script).digest('hex')),
  layoutCount: catalog.length,
  categories: [...new Set(catalog.map(scene => scene.category))],
  layouts: catalog,
  externalDependencies: {
    fonts: ['fonts.googleapis.com', 'fonts.gstatic.com'],
    mp4Muxer: 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm',
    note: 'MP4 uses browser WebCodecs over HTTPS or localhost. WebM uses MediaRecorder. Fonts and the MP4 muxer require an internet connection.'
  },
  uiChanges: ['AvIStudio navigation', 'External app.css presentation overrides', 'Document title'],
};
await writeFile(path.join(destination, 'import-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ destination, scriptsPreserved: true, scriptsSyntaxValid: true, layoutCount: catalog.length, categories: report.categories }));
