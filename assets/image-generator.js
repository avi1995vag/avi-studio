/* AI Horde's documented anonymous credential is public. */
(() => {
  const base = 'https://aihorde.net/api/v2/generate';
  const headers = {'Client-Agent':'AviStudio:1.0:https://avi1995vag.github.io/avi-studio/'};
  const shapes = {portrait:[512,640],square:[512,512],landscape:[640,512]};
  const get = id => document.getElementById(id);
  const form = get('imageGeneratorForm');
  const promptField = get('imageGeneratorPrompt');
  const shapeField = get('imageGeneratorShape');
  const runButton = get('imageGeneratorRun');
  const cancelButton = get('imageGeneratorCancel');
  const status = get('imageGeneratorStatus');
  const stage = get('imageResultStage');
  const preview = get('imageGeneratorPreview');
  let activeJob;
  let result;

  function showStatus(message,warning=false){
    status.textContent = message;
    status.dataset.tone = warning ? 'warning' : 'info';
    status.hidden = false;
  }

  async function request(path,signal,options={}){
    const response = await fetch(base + path,{
      ...options, headers:{...headers,...options.headers},
      signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),
      cache:'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      const message = response.status === 429 ? 'The free queue is busy. Try again in a few minutes.'
        : response.status >= 500 ? 'AI Horde is temporarily unavailable.'
        : data.message || `AI Horde returned HTTP ${response.status}.`;
      throw Object.assign(new Error(message),{status:response.status});
    }
    return data;
  }

  function stopRemote(job){
    if(!job.id) return;
    const signal = new AbortController().signal;
    void request('/status/' + job.id,signal,{method:'DELETE',keepalive:true}).catch(() => {});
  }

  function waitForPoll(signal){
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort',abort);
        resolve();
      },5000);
      function abort(){
        clearTimeout(timer);
        reject(signal.reason);
      }
      if(signal.aborted) abort();
      else signal.addEventListener('abort',abort,{once:true});
    });
  }

  async function generate(prompt,shape,job){
    const signal = job.controller.signal;
    const [width,height] = shapes[shape];
    const queued = await request('/async',signal,{
      method:'POST',
      headers:{apikey:'0000000000','Content-Type':'application/json'},
      body:JSON.stringify({
        prompt, models:['stable_diffusion'],
        params:{width,height,steps:18,n:1,sampler_name:'k_euler'},
        nsfw:false,censor_nsfw:true,r2:false
      })
    });
    if(typeof queued.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(queued.id)){
      throw new Error('AI Horde did not return a job ID. Try again shortly.');
    }
    job.id = queued.id;
    showStatus('Image queued. Waiting for a worker…');
    let consecutiveErrors = 0;
    for(;;){
      await waitForPoll(signal);
      let check;
      try {
        check = await request('/check/' + job.id,signal);
        consecutiveErrors = 0;
      } catch(error){
        if(signal.aborted || (error.status && error.status < 500) || ++consecutiveErrors >= 3) throw error;
        showStatus('Reconnecting to the image queue…');
        continue;
      }
      if(check.faulted) throw new Error('AI Horde could not generate this image. Try again with a different prompt.');
      if(check.done) break;
      if(check.is_possible === false){
        showStatus('Waiting for a compatible worker in the free queue…');
      } else if(check.processing > 0){
        showStatus('A worker is generating your image…');
      } else {
        const position = Number(check.queue_position);
        showStatus(position > 0 ? `Waiting in the free queue. Position ${position}.` : 'Waiting for a worker…');
      }
    }
    const completed = await request('/status/' + job.id,signal);
    const generation = completed.generations?.[0];
    if(generation?.censored || ['censored','csam'].includes(generation?.state)){
      throw new Error('AI Horde filtered this result. Try a different prompt.');
    }
    if(typeof generation?.img !== 'string' || !generation.img.startsWith('UklGR')){
      throw new Error('AI Horde did not return a usable image. Try again shortly.');
    }
    const bytes = Uint8Array.from(atob(generation.img), char => char.charCodeAt(0));
    const image = await loadImg('data:image/webp;base64,' + generation.img);
    signal.throwIfAborted();
    return {image,blob:new Blob([bytes],{type:'image/webp'}),shape};
  }

  shapeField.addEventListener('change', () => {
    if(!result) stage.dataset.shape = shapeField.value;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if(activeJob) return;
    const prompt = promptField.value.trim();
    if(!prompt){
      showStatus('Enter an image prompt.',true);
      promptField.focus();
      return;
    }
    const shape = shapeField.value;
    const job = {controller:new AbortController()};
    const timer = setTimeout(() => job.controller.abort(new DOMException('Queue timed out','TimeoutError')),300000);
    activeJob = job;
    runButton.disabled = true;
    cancelButton.hidden = false;
    cancelButton.disabled = false;
    if(!result) stage.dataset.shape = shape;
    showStatus('Submitting your prompt…');
    try {
      result = await generate(prompt,shape,job);
      preview.src = result.image.src;
      preview.hidden = false;
      stage.dataset.shape = result.shape;
      get('imageGeneratorPlaceholder').hidden = true;
      get('imageGeneratorActions').hidden = false;
      showStatus(`Image ready · ${result.image.naturalWidth} × ${result.image.naturalHeight} px`);
    } catch(error){
      stopRemote(job);
      const reason = job.controller.signal.reason;
      if(reason?.name === 'AbortError') showStatus('Stopped waiting for this image.');
      else if(reason?.name === 'TimeoutError') showStatus('The free queue took too long. You can try again.',true);
      else if(error instanceof TypeError || error.name === 'TimeoutError') showStatus('Could not reach AI Horde. Check your connection and try again.',true);
      else showStatus(error.message,true);
    } finally {
      clearTimeout(timer);
      activeJob = null;
      runButton.disabled = false;
      cancelButton.hidden = true;
    }
  });

  cancelButton.addEventListener('click', () => {
    cancelButton.disabled = true;
    activeJob?.controller.abort();
  });
  get('imageGeneratorDownload').addEventListener('click', () => {
    if(result) downloadBlob(result.blob,'avi-studio-ai-image.webp');
  });
  get('imageGeneratorApply').addEventListener('click', () => {
    if(!result) return;
    if(!posterSlide) createBlankPoster();
    else switchMode('poster');
    applyPosterPhoto(result.image,'AI-generated image from AI Horde.',++posterPhotoAttempt);
    get('posterPreviewTitle').closest('.poster-stage').scrollIntoView({block:'start'});
  });
})();
