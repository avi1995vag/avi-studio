const configureSocialPublishing = (() => {
  const get = id => document.getElementById(id);
  const panel = get('socialPublishing');
  const connect = get('socialConnect');
  const connected = get('socialConnected');
  const reload = get('socialReload');
  const disconnect = get('socialDisconnect');
  const channelList = get('socialChannels');
  const publishButton = get('socialPublish');
  const receiptList = get('socialReceipt');
  const check = get('socialCheck');
  const newPost = get('socialNew');
  const sessionKey = 'avi_buffer_session';
  const proofKey = 'avi_buffer_proof';
  const receiptKey = 'avi_buffer_receipt';
  const statusLabels = {sent:'Published',sending:'Sending',scheduled:'Queued by Buffer',submitting:'Submitting',
    needs_approval:'Awaiting approval in Buffer',draft:'Draft in Buffer',error:'Failed in Buffer',
    rejected:'Rejected by Buffer',unknown:'Unconfirmed. Check Buffer before reposting.'};
  let endpoint, token, batchId, busy = false, blocked = false;
  let channels = [];

  function status(message){
    get('socialStatus').textContent = message;
  }

  function selected(){
    return Array.from(channelList.querySelectorAll('input:checked'),input => channels.find(channel => channel.id===input.value));
  }

  function syncButtons(){
    publishButton.disabled = busy || Boolean(batchId) || selected().length===0;
    reload.disabled = busy;
    disconnect.disabled = busy;
    check.disabled = busy;
    check.hidden = !token || !batchId;
    newPost.disabled = busy;
    newPost.hidden = !token || !batchId || blocked;
  }

  async function api(path,options={}){
    const headers = new Headers(options.headers);
    if(token) headers.set('Authorization','Bearer ' + token);
    const response = await fetch(new URL(path,endpoint),{
      ...options,headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60_000)
    });
    const data = await response.json();
    if(!response.ok) throw Object.assign(new Error(data.error || 'The publishing service could not complete the request.'),{status:response.status});
    return data;
  }

  function requestJson(path,data){
    return api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  }

  function setToken(value){
    token = value;
    if(value) sessionStorage.setItem(sessionKey,value);
    else sessionStorage.removeItem(sessionKey);
    connect.hidden = Boolean(value);
    connected.hidden = !value;
    if(!value) receiptList.hidden = true;
    syncButtons();
  }

  function showError(error){
    if(error.status===401) setToken(null);
    status(error instanceof TypeError || error.name==='TimeoutError' ? 'Could not reach the publishing service. Try again shortly.' : error.message);
  }

  async function loadChannels(){
    busy = true;
    syncButtons();
    try {
      const previous = new Set(selected().map(channel => channel.id));
      ({channels} = await api('/channels'));
      channelList.replaceChildren();
      for(const channel of channels){
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = channel.id;
        input.checked = previous.has(channel.id);
        const name = document.createElement('span');
        name.textContent = channel.name;
        const detail = document.createElement('small');
        detail.textContent = channel.platform + ' · ' + channel.organization;
        name.append(detail);
        label.append(input,name);
        channelList.append(label);
      }
      status(channels.length ? 'Select the channels for the current artwork and caption.'
        : 'Connect a Facebook Page, X profile, or another supported channel in Buffer, then refresh channels.');
    } catch(error){ showError(error); }
    finally { busy = false; syncButtons(); }
  }

  function randomProof(){
    const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const proof = encode(crypto.getRandomValues(new Uint8Array(32)));
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(proof)).then(hash => ({proof,challenge:encode(new Uint8Array(hash))}));
  }

  async function startSignIn(){
    connect.disabled = true;
    try {
      await saveWorkspaceDraft();
      const {proof,challenge} = await randomProof();
      sessionStorage.setItem(proofKey,proof);
      const {url} = await requestJson('/oauth/start',{challenge});
      const next = new URL(url);
      if(next.origin!=='https://auth.buffer.com' || next.pathname!=='/auth') throw new Error('The Buffer sign-in link is invalid.');
      location.assign(next.href);
    } catch(error){
      showError(error);
      connect.disabled = false;
    }
  }

  async function publishImage(canvas){
    const jpeg = quality => new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',quality));
    let image = await jpeg(.9);
    if(image?.size>1_100_000) image = await jpeg(.7);
    if(image?.size>1_100_000) image = await jpeg(.5);
    if(!image || image.size>1_100_000) throw new Error('An image is too large to publish. Try the portrait output size.');
    return image;
  }

  function artwork(){
    if(draftKind==='poster'){
      if(!posterSlide) throw new Error('Create a poster first.');
      if(draftSources.poster?.kind==='link-draft') throw new Error('Check the source before publishing this headline-only draft.');
      const mode = get('posterExportSize').value;
      const height = {portrait:1350,square:1080,story:1920}[mode];
      return [fitPosterExport(get('posterCanvas'),height,posterTheme(posterSlide.posterPalette))];
    }
    if(!slides.length) throw new Error('Create a carousel first.');
    return slides.map((frame,index) => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W; canvas.height = CANVAS_H;
      drawSlide(canvas,frame,index);
      return canvas;
    });
  }

  function setBatch(id){
    batchId = id;
    if(id) sessionStorage.setItem(receiptKey,id);
    else sessionStorage.removeItem(receiptKey);
    syncButtons();
  }

  function renderReceipt(receipt){
    receiptList.replaceChildren();
    for(const item of receipt.channels){
      const line = document.createElement('li');
      line.textContent = item.label + ' — ' + (statusLabels[item.status] || 'Status pending') + (item.message ? ' ' + item.message : '');
      receiptList.append(line);
    }
    receiptList.hidden = false;
    blocked = receipt.channels.some(item => ['submitting','sending','scheduled','needs_approval','unknown'].includes(item.status));
    const unconfirmed = receipt.channels.some(item => item.status==='unknown');
    status(unconfirmed ? 'A result is unconfirmed. Check Buffer before starting another post.'
      : blocked ? 'Check post status for the latest result.' : 'Publishing results');
    // An unconfirmed result can be cleared after the editor checks Buffer.
    if(unconfirmed && !receipt.channels.some(item => ['submitting','sending','scheduled','needs_approval'].includes(item.status))) blocked = false;
    syncButtons();
  }

  async function checkStatus(){
    if(!batchId || !token || busy) return;
    busy = true;
    syncButtons();
    try { renderReceipt(await api('/posts/' + batchId)); }
    catch(error){
      if(error.status===404){
        blocked = false;
        status('No receipt yet. Check Buffer before starting another post.');
      } else showError(error);
    } finally { busy = false; syncButtons(); }
  }

  async function publishNow(){
    if(busy || batchId) return;
    const targets = selected();
    if(!targets.length) return;
    busy = true;
    syncButtons();
    try {
      if(targets.length>5) throw new Error('Choose up to five channels per post.');
      const frames = artwork();
      const smaller = targets.find(channel => frames.length>channel.maxImages);
      if(smaller) throw new Error(`${smaller.platform} accepts up to ${smaller.maxImages} images.`);
      const caption = get('caption').value;
      if(!window.confirm(`Publish ${frames.length} ${frames.length===1 ? 'image' : 'images'} with the current caption to ${targets.map(channel => channel.name).join(', ')}?`)) return;
      status('Preparing artwork…');
      const images = await Promise.all(frames.map(publishImage));
      const id = crypto.randomUUID();
      const form = new FormData();
      form.set('id',id);
      form.set('caption',caption);
      for(const channel of targets) form.append('channel',channel.id);
      images.forEach((image,index) => form.append('image',image,'artwork-' + (index+1) + '.jpg'));
      blocked = true;
      setBatch(id);
      status('Submitting to Buffer…');
      renderReceipt(await api('/posts',{method:'POST',body:form}));
    } catch(error){
      if(batchId && (!error.status || error.status>=500)){
        status('The result is unconfirmed. Check post status before trying again.');
      } else {
        if(batchId) setBatch(null);
        showError(error);
      }
    } finally { busy = false; syncButtons(); }
  }

  connect.addEventListener('click',startSignIn);
  reload.addEventListener('click',loadChannels);
  channelList.addEventListener('change',syncButtons);
  publishButton.addEventListener('click',publishNow);
  check.addEventListener('click',checkStatus);
  disconnect.addEventListener('click',async () => {
    try { await api('/session',{method:'DELETE'}); }
    catch(error){ if(error.status!==401){ showError(error); return; } }
    setToken(null);
    status('Signed out of the studio.');
  });
  newPost.addEventListener('click', () => {
    setBatch(null);
    receiptList.hidden = true;
    status('Select the channels for the current artwork and caption.');
  });

  return async value => {
    if(!value) return;
    try {
      endpoint = new URL(value);
      if(endpoint.protocol!=='https:' || endpoint.username || endpoint.password) return;
      await api('/health');
    } catch { return; }
    panel.hidden = false;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const handoff = fragment.get('buffer_connection');
    const failure = fragment.get('buffer_error');
    if(handoff || failure){
      history.replaceState(null,'',location.pathname + location.search);
      panel.open = true;
      const proof = sessionStorage.getItem(proofKey);
      sessionStorage.removeItem(proofKey);
      if(handoff){
        try {
          const result = await requestJson('/oauth/finish',{handoff,proof});
          setToken(result.token);
        } catch(error){ showError(error); return; }
      } else {
        status(failure==='account' ? 'Sign in with the Buffer account authorized for this studio.' : 'Buffer sign-in did not finish. Try again.');
        return;
      }
    } else {
      setToken(sessionStorage.getItem(sessionKey));
    }
    batchId = sessionStorage.getItem(receiptKey);
    if(token){
      await loadChannels();
      if(batchId){
        panel.open = true;
        await checkStatus();
      }
    }
  };
})();
