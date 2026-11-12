const INTEGRATION_KEYS = ['geminiKey','serperKey','pexelsKey','accessToken','zernioApiKey'];
const INTEGRATION_STORAGE = 'avi-studio:integration-keys:' + location.pathname.replace(/\/(?:index|studio)\.html$/,'').replace(/\/$/,'');
const keyStatus = message => { document.getElementById('keyStorageStatus').textContent = message; };

function restoreIntegrationKeys(){
  try {
    const saved = JSON.parse(localStorage.getItem(INTEGRATION_STORAGE) || '{}');
    let count = 0;
    for(const id of INTEGRATION_KEYS){
      localStorage.removeItem('app_'+id);
      if(typeof saved?.[id] === 'string' && saved[id]){
        const field = document.getElementById(id);
        if(!field.value) field.value = saved[id];
        count++;
      }
    }
    if(count) keyStatus('Saved keys restored.');
  } catch { keyStatus('Saved keys could not be restored.'); }
}

function saveIntegrationKeys(){
  const keys = Object.fromEntries(INTEGRATION_KEYS.map(id=>[id,document.getElementById(id).value.trim()]).filter(([,value])=>value));
  try {
    if(Object.keys(keys).length) localStorage.setItem(INTEGRATION_STORAGE,JSON.stringify(keys));
    else localStorage.removeItem(INTEGRATION_STORAGE);
    keyStatus(Object.keys(keys).length ? 'Keys saved on this browser.' : 'No keys entered. Saved keys cleared.');
  } catch { keyStatus('This browser blocked saving keys.'); }
}

function forgetIntegrationKeys(){
  try {
    localStorage.removeItem(INTEGRATION_STORAGE);
    for(const id of INTEGRATION_KEYS) document.getElementById(id).value = '';
    keyStatus('Saved keys removed and fields cleared.');
  } catch { keyStatus('This browser blocked removing saved keys.'); }
}

function articleText(value){
  return typeof value==='string' ? value.replace(/\s+/g,' ').trim() : '';
}

function articleExcerpt(text, limit){
  const clean = articleText(text);
  if(clean.length<=limit) return clean;
  const end = [...clean.matchAll(/[.!?।](?=\s|$)/g)].filter(match=>match.index<limit).at(-1)?.index;
  if(end>=limit/3) return clean.slice(0,end+1);
  const cut = clean.lastIndexOf(' ',limit-1);
  return clean.slice(0,cut>limit/2 ? cut : limit-1).trimEnd()+'…';
}

function articleStructuredData(root){
  const pending = [];
  for(const node of root.querySelectorAll('script[type="application/ld+json"]')){
    try { pending.push(JSON.parse(node.textContent)); } catch {}
  }
  while(pending.length){
    const value = pending.shift();
    if(Array.isArray(value)) pending.push(...value);
    else if(value && typeof value==='object'){
      if([value['@type']].flat().some(type=>typeof type==='string' && /(?:^|\/)(?:\w*NewsArticle|Article|BlogPosting)$/i.test(type))) return value;
      if(value['@graph']) pending.push(value['@graph']);
    }
  }
  return {};
}

async function readArticleMetadata(url){
  try {
    const response = await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(6500)});
    if(!response.ok || !/^(text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) return {};
    const base = response.url || url;
    if(sourceKey(base)!==sourceKey(url)) return {};
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '', size = 0;
    try {
      while(size<900000){
        const {value,done} = await reader.read();
        if(done) break;
        const chunk = value.subarray(0,900000-size);
        size += chunk.length;
        html += decoder.decode(chunk,{stream:true});
      }
    } catch {
      if(!html) return {};
    } finally { void reader.cancel().catch(()=>{}); }

    const template = document.createElement('template');
    template.innerHTML = html;
    const page = template.content;
    const meta = (key,type='property') => articleText(page.querySelector(`meta[${type}="${key}"]`)?.getAttribute('content'));
    const canonical = page.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if(canonical && sourceKey(new URL(canonical,base).href)!==sourceKey(url)) return {};
    const structured = articleStructuredData(page);
    const article = page.querySelector('[itemprop="articleBody"], article, main');
    const title = articleText(structured.headline) || meta('og:title') || articleText(article?.querySelector('h1')?.textContent);
    const paragraphs = [...(article?.querySelectorAll('p') || [])].map(p=>articleText(p.textContent))
      .filter(text=>text.split(/\s+/).length>=7).slice(0,4);
    const description = meta('og:description') || articleText(structured.description) || meta('description','name');
    const details = articleText(structured.articleBody) || paragraphs.join(' ') || description;
    const structuredImages = [structured.image].flat().slice(0,4)
      .map(image=>typeof image==='string' ? image : image?.url || image?.contentUrl);
    const urls = [meta('og:image:secure_url'),meta('og:image'),meta('og:image:url'),...structuredImages,
      meta('twitter:image','name'),meta('twitter:image:src','name'),page.querySelector('link[rel="image_src"]')?.getAttribute('href'),
      article?.querySelector('figure img, img[itemprop="image"]')?.getAttribute('src')];
    const images = [...new Set(urls.filter(Boolean).flatMap(value=>{
      try { const image = safeWebUrl(new URL(value,base).href); return image ? [image] : []; } catch { return []; }
    }))];
    return {title,description:details.slice(0,6000),images};
  } catch { return {}; }
}

function directArticleCopy(entry){
  const details = articleText(entry.description);
  const title = articleText(entry.title);
  return {
    title:articleExcerpt(title,180),
    body:articleExcerpt(details,235),
    caption:[articleExcerpt(title,180),articleExcerpt(details,680)].filter(Boolean).join('\n\n'),
    imageQuery:title.slice(0,120),
  };
}

async function installedArticleSummary(text){
  const api = globalThis.Summarizer;
  if(!api || text.length<350 || /[^\u0000-\u024f\u2000-\u206f]/u.test(text)) return '';
  const options = {type:'tldr',format:'plain-text',length:'short',expectedInputLanguages:['en'],outputLanguage:'en'};
  let summarizer;
  try {
    if(await api.availability(options)!=='available') return '';
    summarizer = await api.create(options);
    const summary = articleText(await summarizer.summarize(text.slice(0,5500),{signal:AbortSignal.timeout(7500)}));
    return summary ? articleExcerpt(summary,235) : '';
  } catch { return ''; }
  finally { summarizer?.destroy(); }
}
