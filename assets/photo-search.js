/* Search public image sources without exposing configured keys in URLs. */
function googleImageSearchLink(query) {
  return 'https://www.google.com/search?' + new URLSearchParams({tbm:'isch',q:query});
}

async function googleSearch(kind, query) {
  const key = document.getElementById('serperKey').value.trim();
  if(!key || !query) return null;
  const endpoint = kind==='images' ? 'https://google.serper.dev/images' : 'https://google.serper.dev/search';
  const response = await fetch(endpoint,{
    method:'POST',credentials:'omit',headers:{'X-API-KEY':key,'Content-Type':'application/json'},
    body:JSON.stringify({q:query.slice(0,280),num:8}),signal:AbortSignal.timeout(7500)
  });
  if(!response.ok) throw new Error(`Google search provider returned HTTP ${response.status}. Check your Serper key and quota.`);
  return response.json();
}

async function findGoogleArticleExcerpt(url) {
  if(!document.getElementById('serperKey').value.trim()) return null;
  const host = new URL(url).hostname.replace(/^www\./,'');
  const id = new URL(url).pathname.match(/\d{6,}(?=\.cms|$)/)?.[0];
  const topic = headlineFromLink(url);
  try {
    const data = await googleSearch('web',id || topic ? `site:${host} ${id ? '"' + id + '"' : topic}` : url);
    const exact = data?.organic?.find(row=>sourceKey(row.link)===sourceKey(url) &&
      typeof row.snippet==='string' && row.snippet.trim().split(/\s+/).length>=12);
    return exact ? {title:exact.title,description:exact.snippet} : null;
  } catch { return null; }
}

function searchTerms(text) {
  return [...new Set(String(text||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}][\p{L}\p{M}]+/gu) || [])]
    .filter(term=>!['the','and','with','from','for','news','photo','image','portrait','official'].includes(term));
}

async function commonsPhotoCandidates(query, strict=false){
  const terms = searchTerms(query).slice(0,7);
  if(!terms.length) return [];
  try {
    const params = new URLSearchParams({
      action:'query',format:'json',formatversion:'2',origin:'*',
      generator:'search',gsrnamespace:'6',gsrlimit:strict ? '30' : '8',
      gsrsearch:strict ? `intitle:"${terms.join(' ')}"` : terms.join(' '),
      prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'960',
      iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Attribution|NonFree'
    });
    const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params,{
      credentials:'omit',signal:AbortSignal.timeout(8000)
    });
    if(!response.ok) return [];
    const data = await response.json();
    const candidates = [];
    for(const page of (data.query?.pages || []).sort((a,b)=>(a.index||0)-(b.index||0))){
      const info = page.imageinfo?.[0];
      if(!info || info.width<(strict ? 350 : 550) || info.height<360 || !/^image\/(jpeg|png|webp)$/.test(info.mime)) continue;
      const license = info.extmetadata?.LicenseShortName?.value || '';
      const attribution = /^CC BY ([1-4]\.0|2\.5)$/i.exec(license);
      if((!(/^(public domain|cc0(?: 1\.0)?)$/i.test(license)) && !(strict && attribution)) || info.extmetadata?.NonFree?.value==='True') continue;
      const titleTerms = new Set(searchTerms(page.title));
      const hits = terms.filter(term=>titleTerms.has(term)).length;
      if(hits < (strict ? terms.length : Math.min(terms.length,Math.max(2,Math.ceil(terms.length*.6))))) continue;
      const source = safeWebUrl(info.descriptionurl);
      if(!source || new URL(source).hostname!=='commons.wikimedia.org') continue;
      const urls = [...new Set([info.thumburl,info.url].map(safeWebUrl).filter(Boolean))].filter(url=>
        ['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(url).hostname));
      const candidate = {urls,source,credit:`Related photo · Wikimedia Commons (${license})`};
      if(attribution){
        const licenseUrl = safeWebUrl(info.extmetadata?.LicenseUrl?.value);
        if(!licenseUrl || !new RegExp(`^https?://creativecommons\\.org/licenses/by/${attribution[1].replace('.','\\.')}/?$`).test(licenseUrl)) continue;
        const template = document.createElement('template');
        template.innerHTML = info.extmetadata?.Attribution?.value || info.extmetadata?.Artist?.value || '';
        const artist = template.content.textContent.replace(/\s+/g,' ').trim();
        if(!artist || artist.length>90) continue;
        candidate.source = Number.isSafeInteger(page.pageid) ? `https://commons.wikimedia.org/?curid=${page.pageid}` : source;
        candidate.photoCredit = `Photo: ${artist} · ${license} · cropped`;
        candidate.photoLicense = licenseUrl;
      }
      candidates.push(candidate);
    }
    return candidates;
  } catch { return []; }
}

async function loadCommonsPhoto(candidates,used){
  for(const candidate of candidates){
    if(used.has(candidate.source)) continue;
    for(const url of candidate.urls){
      if(used.has(url)) continue;
      const image = await loadImg(url,null,3000).catch(()=>null);
      if(image) return {...candidate,image};
      used.add(url);
    }
  }
  return null;
}

async function findCommonsPhoto(query, used=new Set()){
  return loadCommonsPhoto(await commonsPhotoCandidates(query),used);
}

function showGoogleCandidates(query, rows, apply) {
  const grid = document.getElementById('googleImageResults');
  grid.replaceChildren();
  grid.hidden = !rows.length;
  for(const row of rows.slice(0,6)){
    const url = safeWebUrl(row.imageUrl);
    const source = safeWebUrl(row.link);
    if(!url || !source) continue;
    const card = document.createElement('div');
    card.className = 'google-image-result';
    const link = document.createElement('a');
    link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const preview = safeWebUrl(row.thumbnailUrl);
    if(preview){
      const image = document.createElement('img');
      image.src = preview; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      link.append(image);
    }
    const title = document.createElement('span');
    title.textContent = (row.title || 'Open image source').slice(0,130);
    link.append(title);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn-sm'; button.textContent = 'Use photo';
    button.onclick = () => apply(url,source);
    card.append(link,button); grid.append(card);
  }
  grid.hidden = !grid.childElementCount;
  const google = document.getElementById('openGoogleImages');
  google.href = googleImageSearchLink(query);
}
