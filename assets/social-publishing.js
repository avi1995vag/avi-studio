const configureSocialPublishing = (() => {
  const get = id => document.getElementById(id);
  const panel = get('socialPublishing');
  const connect = get('socialConnect');
  const connected = get('socialConnected');
  const manage = get('socialManage');
  const retry = get('socialRetry');
  const reload = get('socialReload');
  const disconnect = get('socialDisconnect');
  const channelList = get('socialChannels');
  const publishButton = get('socialPublish');
  const receiptList = get('socialReceipt');
  const check = get('socialCheck');
  const newPost = get('socialNew');
  const caption = get('caption');
  const captionEditor = get('socialDraftCaption');
  const captionCount = get('socialCaptionCount');
  const sessionKey = 'avi_buffer_session';
  const proofKey = 'avi_buffer_proof';
  const receiptKey = 'avi_buffer_receipt';
  const statusLabels = {sent:'Published',sending:'Sending',scheduled:'Queued by Buffer',submitting:'Submitting',
    needs_approval:'Awaiting approval in Buffer',draft:'Draft in Buffer',error:'Failed in Buffer',
    rejected:'Rejected by Buffer',unknown:'Unconfirmed. Check Buffer before reposting.'};
  let endpoint, token, batchId, busy = false, blocked = false, ready = false, checking = false;
  let allRejected = false;
  let completed = false;
  let refreshOnReturn = false;
  let channels = [];

  function status(message, state=''){
    const element = get('socialStatus');
    element.textContent = message;
    element.dataset.state = state;
  }

  function summary(message){
    get('socialSummary').textContent = message;
  }

  function draftSize(){
    return draftKind==='poster' ? Number(Boolean(posterSlide)) : slides.length;
  }

  function posterForPublishing(){
    const height = {portrait:1350,square:1080,story:1920}[get('posterExportSize').value];
    return fitPosterExport(get('posterCanvas'),height,posterTheme(posterSlide.posterPalette));
  }

  function renderDraftPreview(){
    const preview = get('socialPreview');
    const empty = get('socialDraftEmpty');
    const count = get('socialDraftCount');
    const size = draftSize();
    preview.hidden = count.hidden = get('socialCaptionEditor').hidden = size===0;
    empty.hidden = size>0;
    if(!size) return;
    let source;
    if(draftKind==='poster') source = posterForPublishing();
    else {
      source = document.createElement('canvas');
      source.width = CANVAS_W;
      source.height = CANVAS_H;
      drawSlide(source,slides[0],0);
    }
    preview.height = Math.round(preview.width * source.height / source.width);
    preview.getContext('2d').drawImage(source,0,0,preview.width,preview.height);
    count.textContent = draftKind==='poster' ? 'Single poster' : `Carousel · ${size} ${size===1 ? 'slide' : 'slides'}`;
    captionEditor.value = caption.value;
    updateCaptionCount();
  }

  function updateCaptionCount(){
    const count = captionEditor.value.length;
    captionCount.textContent = `${count} / 2200`;
    captionCount.classList.toggle('over-limit',count>2200);
  }

  function openDialog(){
    renderDraftPreview();
    if(!panel.open) panel.showModal();
    syncButtons();
  }

  function selected(){
    return Array.from(channelList.querySelectorAll('input:checked'),input => channels.find(channel => channel.id===input.value));
  }

  function syncButtons(){
    connect.disabled = !ready || busy;
    retry.disabled = checking;
    publishButton.disabled = !ready || !token || busy || (Boolean(batchId) && !completed) || selected().length===0 || draftSize()===0;
    captionEditor.readOnly = busy;
    reload.disabled = busy;
    disconnect.disabled = busy;
    check.disabled = busy;
    check.hidden = !token || !batchId;
    newPost.disabled = busy;
    newPost.hidden = !token || !batchId || blocked || completed;
  }

  async function api(path,options={},timeout=60_000){
    const headers = new Headers(options.headers);
    if(token) headers.set('Authorization','Bearer ' + token);
    const response = await fetch(new URL(path,endpoint),{
      ...options,headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeout)
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
    if(!value){
      allRejected = false;
      completed = false;
      receiptList.hidden = true;
      channels = [];
      channelList.replaceChildren();
      get('socialChannelPicker').hidden = true;
      manage.classList.remove('btn-p');
      manage.textContent = 'Connect channels in Buffer ↗';
      summary('Sign in to Buffer');
    }
    syncButtons();
  }

  function showError(error){
    if(error.status===401) setToken(null);
    status(error instanceof TypeError || error.name==='TimeoutError' ? 'Could not reach the publishing service. Try again shortly.' : error.message,'error');
  }

  async function loadChannels(){
    if(!ready || !token || busy) return;
    busy = true;
    if(receiptList.hidden) status('Loading your Buffer channels…');
    summary('Loading channels…');
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
      get('socialChannelPicker').hidden = channels.length===0;
      manage.classList.toggle('btn-p',channels.length===0);
      manage.textContent = channels.length ? 'Manage channels in Buffer ↗' : 'Connect channels in Buffer ↗';
      summary(channels.length ? `${channels.length} ${channels.length===1 ? 'channel' : 'channels'} connected` : 'Buffer connected · add channels');
      if(!batchId || receiptList.hidden){
        status(channels.length ? (draftSize() ? 'Select where to publish your artwork and caption.' : 'Create a draft to publish to your channels.')
          : 'Buffer is connected. Add a Facebook Page, X profile, or another channel in Buffer, then return here.');
      }
    } catch(error){
      showError(error);
      if(token) summary('Channels unavailable · refresh');
    }
    finally { busy = false; syncButtons(); }
  }

  function randomProof(){
    const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const proof = encode(crypto.getRandomValues(new Uint8Array(32)));
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(proof)).then(hash => ({proof,challenge:encode(new Uint8Array(hash))}));
  }

  async function startSignIn(){
    if(!ready || busy) return;
    busy = true;
    syncButtons();
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
      busy = false;
      syncButtons();
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
      return [posterForPublishing()];
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
    allRejected = false;
    completed = false;
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
    allRejected = receipt.channels.length>0 && receipt.channels.every(item => item.status==='rejected');
    completed = receipt.channels.length>0 && receipt.channels.every(item => ['sent','rejected','error','draft'].includes(item.status));
    blocked = receipt.channels.some(item => ['submitting','sending','scheduled','needs_approval','unknown'].includes(item.status));
    const unconfirmed = receipt.channels.some(item => item.status==='unknown');
    status(unconfirmed ? 'A result is unconfirmed. Check Buffer before starting another post.'
      : blocked ? 'Check post status for the latest result.'
      : allRejected ? 'Buffer rejected the previous attempt. Select your channels and click Publish now to try again.'
      : completed ? 'The previous submission is shown below. Publish now sends the draft in this preview as a new post.'
      : 'Check post status for the latest result.');
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
        allRejected = false;
        completed = false;
        blocked = false;
        status('No receipt yet. Check Buffer before starting another post.');
      } else showError(error);
    } finally { busy = false; syncButtons(); }
  }

  async function publishNow(){
    if(publishButton.disabled) return;
    const targets = selected();
    let submitted = false;
    busy = true;
    syncButtons();
    try {
      if(targets.length>5) throw new Error('Choose up to five channels per post.');
      const frames = artwork();
      const smaller = targets.find(channel => frames.length>channel.maxImages);
      if(smaller) throw new Error(`${smaller.platform} accepts up to ${smaller.maxImages} images.`);
      const postCaption = caption.value;
      const previous = completed && !allRejected ? 'This creates a new post. If you send the same artwork and caption again, it can appear twice.\n\n' : '';
      if(!window.confirm(`${previous}Publish ${frames.length} ${frames.length===1 ? 'image' : 'images'} with the current caption to ${targets.map(channel => channel.name).join(', ')}?`)) return;
      status('Preparing artwork…');
      const images = await Promise.all(frames.map(publishImage));
      const id = crypto.randomUUID();
      const form = new FormData();
      form.set('id',id);
      form.set('caption',postCaption);
      for(const channel of targets) form.append('channel',channel.id);
      images.forEach((image,index) => form.append('image',image,'artwork-' + (index+1) + '.jpg'));
      blocked = true;
      setBatch(id);
      receiptList.hidden = true;
      submitted = true;
      status('Submitting to Buffer…');
      renderReceipt(await api('/posts',{method:'POST',body:form}));
    } catch(error){
      if(submitted && (!error.status || error.status>=500)){
        status('The result is unconfirmed. Check post status before trying again.');
      } else {
        if(submitted) setBatch(null);
        showError(error);
      }
    } finally { busy = false; syncButtons(); }
  }

  connect.addEventListener('click',startSignIn);
  for(const button of document.querySelectorAll('[data-open-publishing]')){
    button.addEventListener('click', () => {
      openDialog();
      if(ready && token && !batchId) void loadChannels();
    });
  }
  captionEditor.addEventListener('input', () => {
    caption.value = captionEditor.value;
    updateCharCount();
    updateCaptionCount();
  });
  manage.addEventListener('click', () => { refreshOnReturn = true; });
  function refreshReturningChannels(){
    if(!refreshOnReturn || !panel.open || !ready || !token || busy || document.hidden) return;
    refreshOnReturn = false;
    void loadChannels();
  }
  window.addEventListener('focus',refreshReturningChannels);
  document.addEventListener('visibilitychange',refreshReturningChannels);
  reload.addEventListener('click',loadChannels);
  channelList.addEventListener('change',syncButtons);
  publishButton.addEventListener('click',publishNow);
  check.addEventListener('click',checkStatus);
  disconnect.addEventListener('click',async () => {
    if(busy) return;
    busy = true;
    syncButtons();
    try {
      await api('/session',{method:'DELETE'});
      setToken(null);
      status('Signed out of the studio.');
    } catch(error){ showError(error); }
    finally { busy = false; syncButtons(); }
  });
  newPost.addEventListener('click', () => {
    setBatch(null);
    receiptList.hidden = true;
    status('Select the channels for the current artwork and caption.');
  });

  async function initialize(value){
    if(checking) return;
    checking = true;
    ready = false;
    retry.hidden = true;
    summary('Checking publishing service…');
    status('Checking publishing service…');
    syncButtons();
    try {
      endpoint = new URL(value);
      if(endpoint.protocol!=='https:' || endpoint.username || endpoint.password) throw new Error('Invalid service URL.');
      if((await api('/health',{},8000)).ready!==true) throw new Error('Publishing service is unavailable.');
    } catch {
      status(value ? 'The publishing service is unavailable. Retry the connection or open Buffer to manage channels.'
        : 'Direct publishing is unavailable on this copy of the studio. You can still open Buffer to manage channels.','error');
      summary('Publishing service unavailable');
      retry.hidden = false;
      checking = false;
      syncButtons();
      return;
    }
    checking = false;
    ready = true;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const handoff = fragment.get('buffer_connection');
    const failure = fragment.get('buffer_error');
    setBatch(sessionStorage.getItem(receiptKey));
    if(handoff || failure){
      history.replaceState(null,'',location.pathname + location.search);
      setToken(null);
      openDialog();
      const proof = sessionStorage.getItem(proofKey);
      sessionStorage.removeItem(proofKey);
      if(handoff){
        busy = true;
        status('Finishing Buffer sign-in…');
        syncButtons();
        try {
          const result = await requestJson('/oauth/finish',{handoff,proof});
          setToken(result.token);
        } catch(error){ showError(error); return; }
        finally { busy = false; syncButtons(); }
      } else {
        const messages = {
          account:'Sign in with the Buffer account authorized for this studio.',
          account_unavailable:'Buffer could not confirm your account details. Try signing in again.',
          client:'Buffer rejected the studio’s app credentials.',
          invalid_grant:'Buffer rejected this sign-in attempt. Start a new sign-in from this tab.',
          expired:'The Buffer sign-in link expired. Start again from this tab.',
          cancelled:'Buffer sign-in was canceled. You can start again here.'
        };
        status(messages[failure] || 'Buffer sign-in did not finish. Try again here.','error');
        return;
      }
    } else {
      setToken(sessionStorage.getItem(sessionKey));
    }
    if(token){
      await loadChannels();
      if(batchId){
        openDialog();
        await checkStatus();
      }
    } else {
      status('Sign in with Buffer to load your connected channels.');
    }
  }

  retry.addEventListener('click',async () => {
    retry.disabled = true;
    let value;
    try {
      const response = await fetch('./site.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(response.ok) value = (await response.json()).socialPublisher;
    } catch {}
    await initialize(value);
  });
  return initialize;
})();
