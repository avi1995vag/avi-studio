import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// This importer changes only the document shell and stylesheet. The original
// inline application script and map dataset must remain exactly as supplied.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Pass the original India Motion source folder path.');
const source = path.resolve(process.argv[2]);
const destination = path.join(root, 'assets/apps/india-motion');
const original = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const scripts = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => ({ attributes: match[1], code: match[2] }));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
let html = original;

function replaceOnce(before, after) {
  if (html.split(before).length !== 2) throw new Error(`Expected one shell marker: ${before.slice(0, 70)}`);
  html = html.replace(before, after);
}

replaceOnce('<title>India Motion Studio V24 — Ultimate After Effects Geopolitics, Defense & Travel Route Animator</title>', '<title>India Motion — AvIStudio</title>');
replaceOnce('</head>', '<link rel="preconnect" href="https://fonts.googleapis.com"/>\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\n<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>\n<link rel="stylesheet" href="./app.css"/>\n</head>');
replaceOnce('<body>', `<body>
<nav class="aviShell" aria-label="AvIStudio tools">
  <a class="aviBrand" href="../../../index.html" aria-label="AvIStudio home"><span class="aviBrandMark" aria-hidden="true">Av<span>i</span></span><span>AvIStudio<span class="aviBrandDot">.</span></span></a>
  <div class="aviToolLinks">
    <a href="../../../studio.html">News Studio</a>
    <a href="../infographic-studio/">Infographic</a>
    <a href="../motion-studio/">Motion</a>
    <a class="isCurrent" href="./" aria-current="page">India Motion</a>
  </div>
  <a class="aviBack" href="../../../index.html"><span aria-hidden="true">↗</span> All tools</a>
</nav>`);
replaceOnce('<span class="logoSymbol">AE</span>', '<span class="logoSymbol" aria-hidden="true">◈</span>');
replaceOnce('<strong>INDIA MOTION STUDIO</strong>', '<strong>India Motion</strong>');
replaceOnce('<span>EXPLAINER · DEFENSE · ROUTE V24</span>', '<span>MAPS THAT TELL A STORY</span>');
replaceOnce('🌍 1. World Geopolitics</button>', 'World</button>');
replaceOnce('🇮🇳 2. India (States)</button>', 'India</button>');
replaceOnce('🏛️ 3. State (31 KA Districts)</button>', 'Districts</button>');
replaceOnce('🚆 4. Travel Route Animator</button>', 'Travel routes</button>');

const originalScripts = scripts(original);
const importedScripts = scripts(html);
if (JSON.stringify(originalScripts) !== JSON.stringify(importedScripts)) throw new Error('Application scripts changed during import');
originalScripts.filter(script => script.code.trim()).forEach((script, index) => new vm.Script(script.code, { filename: `india-motion-inline-${index}.js` }));
const ids = markup => [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]).sort();
if (JSON.stringify(ids(original)) !== JSON.stringify(ids(html))) throw new Error('Original element IDs changed during import');

fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, 'index.html'), html);
const dataSource = path.join(source, 'india-official-data.js');
const dataDestination = path.join(destination, 'india-official-data.js');
fs.copyFileSync(dataSource, dataDestination);
if (digest(fs.readFileSync(dataSource)) !== digest(fs.readFileSync(dataDestination))) throw new Error('Map data changed during import');
console.log(JSON.stringify({ destination, applicationScriptsPreserved: true, originalElementIdsPreserved: true, inlineScriptSha256: digest(originalScripts.filter(script => script.code.trim()).map(script => script.code).join('')), dataSha256: digest(fs.readFileSync(dataDestination)) }, null, 2));
