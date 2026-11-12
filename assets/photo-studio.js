/* Local file and preview controls shared by the cutout and upscaling tools. */
(() => {
  const get = id => document.getElementById(id);
  const settings = {
    cutout: {
      sample:'./assets/landing-runner.webp', name:'avi-runner', suffix:'cutout', applyLabel:'Background removed in AvI Studio.',
      controls:['cutoutMethod','cutoutColor','cutoutTolerance','cutoutEdge','cutoutSoft','cutoutCleanup'],
      options:sourceId => ({sourceId,method:get('cutoutMethod').value,color:get('cutoutColor').value,
        tolerance:get('cutoutTolerance').valueAsNumber,edge:get('cutoutEdge').valueAsNumber,soft:get('cutoutSoft').valueAsNumber,cleanup:get('cutoutCleanup').checked}),
      beforeRender:() => {
        const solid = get('cutoutMethod').value === 'color';
        get('cutoutColorOptions').hidden = !solid;
        get('cutoutEdge').disabled = solid || get('cutoutMethod').disabled;
        get('cutoutCleanupOption').hidden = solid;
      },
    },
    hd: {
      sample:'./assets/landing-staircase.webp', name:'avi-staircase', suffix:'hd', applyLabel:'Image upscaled in AvI Studio.',
      controls:['hdScale','hdFormat','hdSharpen'],
      options:() => ({scale:Number(get('hdScale').value),type:get('hdFormat').value,sharpen:get('hdSharpen').valueAsNumber}),
      beforeRender:source => {
        const label = get('hdDimensions');
        if (!source) { label.textContent = ''; return; }
        const factor = Math.min(Number(get('hdScale').value),4096/Math.max(source.width,source.height),
          Math.sqrt(12_000_000/(source.width*source.height)));
        const w = Math.max(1,Math.floor(source.width*factor)), h = Math.max(1,Math.floor(source.height*factor));
        label.textContent = factor <= 1 ? 'The source is already at or above the HD output limit.'
          : source.width + ' × ' + source.height + ' → ' + w + ' × ' + h + ' px';
        return factor <= 1;
      },
    },
  };

  function photoTool(mode,config) {
    const element = name => get(mode + name);
    const input = element('File');
    const sample = element('Sample');
    const run = element('Run');
    const compare = element('Compare');
    const preview = element('Preview');
    const status = element('Status');
    const download = element('Download');
    const apply = element('Apply');
    let source;
    let result;
    let worker;
    let revision = 0;
    let loading = false;
    let busy = false;
    let showOriginal = true;
    let dirty = false;
    const editor = mode === 'cutout' ? createCutoutBrush(() => {
      if (editor.active) showOriginal = false;
      render();
    },message => { status.textContent = message; }) : null;

    function render() {
      const blocked = config.beforeRender(source);
      input.disabled = sample.disabled = busy;
      run.disabled = !source || loading || busy || blocked;
      compare.disabled = !result || loading || busy || Boolean(editor?.active);
      download.disabled = apply.disabled = !result || loading || busy || dirty;
      const painted = editor?.sync(Boolean(result) && !loading && !busy && !dirty,showOriginal);
      preview.hidden = !source || painted;
      element('Empty').hidden = Boolean(source);
      compare.textContent = showOriginal ? 'Show result' : 'Show original';
      compare.setAttribute('aria-pressed',String(showOriginal && Boolean(result)));
      if (mode==='cutout') run.textContent = result ? 'Update cutout' : 'Remove background';
      const url = (showOriginal ? source : result)?.url;
      if (url && preview.getAttribute('src') !== url) preview.src = url;
    }

    async function load(read,name) {
      if (busy) return;
      const attempt = ++revision;
      loading = true;
      status.textContent = 'Opening image…';
      render();
      let bitmap;
      let loaded = false;
      try {
        const blob = await read();
        if (blob.size>32_000_000) throw new Error('Choose a file smaller than 32 MB.');
        bitmap = await createImageBitmap(blob);
        if (attempt !== revision) return;
        if (bitmap.width*bitmap.height > 36_000_000) throw new Error('Choose an image under 36 megapixels.');
        if (source) URL.revokeObjectURL(source.url);
        if (result) URL.revokeObjectURL(result.url);
        source = {blob,name,url:URL.createObjectURL(blob),width:bitmap.width,height:bitmap.height,id:attempt};
        result = null;
        editor?.setImages(null,null);
        loaded = true;
        dirty = false;
        showOriginal = true;
        status.textContent = source.width + ' × ' + source.height + ' px';
      } catch (error) {
        if (attempt === revision) status.textContent = error.name === 'Error' ? error.message : 'This image could not be opened.';
      } finally {
        bitmap?.close();
        if (attempt === revision) {
          loading = false;
          render();
          if (loaded && mode==='cutout' && get('cutoutMethod').value!=='color') run.click();
        }
      }
    }

    function process(job) {
      if (!worker) worker = new Worker('./assets/vision-worker.js?v=2');
      return new Promise((resolve,reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          worker = null;
          reject(new Error('Processing took too long. Try a smaller image.'));
        },90_000);
        worker.onmessage = ({data}) => {
          if (data.id !== job.id) return;
          if (data.progress) { status.textContent = data.progress; return; }
          clearTimeout(timer);
          if (data.error) reject(new Error(data.error));
          else resolve(data.result);
        };
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          worker = null;
          reject(new Error('Image processing could not start in this browser.'));
        };
        worker.postMessage(job);
      });
    }

    input.addEventListener('change',() => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      const name = file.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,55) || 'avi-image';
      void load(() => file,name);
    });
    sample.addEventListener('click',() => load(async () => {
      const response = await fetch(config.sample);
      if (!response.ok) throw new Error('The sample image could not be loaded.');
      return response.blob();
    },config.name));
    for (const id of config.controls) get(id).addEventListener('input',() => {
      if (result) {
        dirty = true;
        if (!busy) status.textContent = 'Run the tool again to apply the new settings.';
      }
      render();
    });
    run.addEventListener('click',async () => {
      if (!source || loading || busy) return;
      const options = config.options(source.id);
      const controls = config.controls.map(get);
      busy = true;
      editor?.hide();
      status.textContent = 'Preparing image…';
      for (const control of controls) control.disabled = true;
      render();
      try {
        const output = await process({id:source.id,mode,blob:source.blob,options});
        if (result) URL.revokeObjectURL(result.url);
        result = {...output,url:URL.createObjectURL(output.blob)};
        editor?.setImages(source,result);
        showOriginal = false;
        dirty = false;
        status.textContent = output.width + ' × ' + output.height + ' px · ready to download';
      } catch (error) { status.textContent = error.message; }
      finally {
        busy = false;
        for (const control of controls) control.disabled = false;
        render();
      }
    });
    compare.addEventListener('click',() => { showOriginal = !showOriginal; render(); });
    download.addEventListener('click',async () => {
      if (!result || dirty || busy) return;
      busy = true;
      render();
      try {
        const blob = editor?.edited ? await editor.exportBlob() : result.blob;
        const extension = {'image/png':'png','image/webp':'webp','image/jpeg':'jpg'}[blob.type];
        downloadBlob(blob,source.name + '-' + config.suffix + '-' + result.width + 'x' + result.height + '.' + extension);
      } catch { status.textContent = 'The image could not be downloaded. Try again.'; }
      finally { busy = false; render(); }
    });
    apply.addEventListener('click',async () => {
      if (!result || dirty || busy) return;
      busy = true;
      render();
      try { await applyCreatorImage(editor?.edited ? await editor.exportBlob() : result.blob,config.applyLabel); }
      catch { status.textContent = 'The image could not be added to the poster.'; }
      finally { busy = false; render(); }
    });
    render();
  }

  photoTool('cutout',settings.cutout);
  photoTool('hd',settings.hd);
})();
