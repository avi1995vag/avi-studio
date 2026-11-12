/* Non-destructive cutout touch-up. Strokes are stored relative to the image. */
function createCutoutBrush(onChange,onError) {
  const get = id => document.getElementById(id);
  const canvas = get('cutoutBrushCanvas');
  const toggle = get('cutoutEdit');
  const undo = get('cutoutUndo');
  const tools = get('cutoutBrushTools');
  const size = get('cutoutBrushSize');
  const mode = get('cutoutBrushMode');
  let pair, original, base, pending, pointerId;
  let strokes = [];
  let active = false;
  let opening = false;
  let frame = 0;

  async function image(url) {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    return picture;
  }

  function strokePath(stroke,w,h) {
    const radius = Math.min(w,h)*stroke.size/200;
    const path = new Path2D();
    let previous;
    for (const [u,v] of stroke.points) {
      const x = u*w, y = v*h;
      path.moveTo(x+radius,y);
      path.arc(x,y,radius,0,Math.PI*2);
      path.closePath();
      if (previous) {
        const [a,b] = previous;
        const length = Math.hypot(x-a,y-b);
        if (length) {
          const dx = (y-b)*radius/length, dy = (a-x)*radius/length;
          path.moveTo(a+dx,b+dy);
          path.lineTo(x+dx,y+dy);
          path.lineTo(x-dx,y-dy);
          path.lineTo(a-dx,b-dy);
          path.closePath();
        }
      }
      previous = [x,y];
    }
    return path;
  }

  function draw(target,edits) {
    const {width:w,height:h} = target;
    const ctx = target.getContext('2d');
    ctx.clearRect(0,0,w,h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base,0,0,w,h);
    for (const stroke of edits) {
      ctx.save();
      ctx.clip(strokePath(stroke,w,h));
      ctx.clearRect(0,0,w,h);
      if (stroke.mode === 'restore') ctx.drawImage(original,0,0,w,h);
      ctx.restore();
    }
  }

  function redraw() {
    if (!base || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (base) draw(canvas,pending ? [...strokes,pending] : strokes);
    });
  }

  function clearPending() {
    if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pending = pointerId = undefined;
  }

  function hide() {
    active = false;
    clearPending();
  }

  function sync(available,showOriginal) {
    const visible = !showOriginal && (active || (strokes.length>0 && Boolean(base)));
    canvas.hidden = !visible;
    canvas.toggleAttribute('data-editing',active);
    tools.hidden = !active;
    toggle.disabled = !available || opening;
    toggle.setAttribute('aria-pressed',String(active));
    toggle.textContent = active ? 'Done editing' : 'Touch up';
    undo.disabled = !strokes.length;
    return visible;
  }

  function setImages(source,result) {
    const samePhoto = source && source === pair?.source;
    hide();
    if (!samePhoto) strokes = [];
    pair = source && result ? {source,result} : null;
    original = base = null;
    if (samePhoto && strokes.length && pair) {
      void prepare(pair).then(onChange).catch(()=>onError('Touch-up preview could not refresh.'));
    }
  }

  async function prepare(current) {
    const pictures = await Promise.all([image(current.source.url),image(current.result.url)]);
    if (current !== pair) return false;
    [original,base] = pictures;
    const scale = Math.min(1,1000/Math.max(base.naturalWidth,base.naturalHeight));
    canvas.width = Math.max(1,Math.round(base.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(base.naturalHeight*scale));
    redraw();
    return true;
  }

  async function open() {
    if (!pair || opening) return;
    if (active) {
      hide();
      onChange();
      return;
    }
    const current = pair;
    opening = true;
    onChange();
    try {
      if (await prepare(current)) active = true;
    } catch { onError('The cutout could not open for touch-up.'); }
    finally { opening = false; onChange(); }
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return [Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)),Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height))];
  }

  function finish(event) {
    if (!pending || event.pointerId !== pointerId) return;
    strokes.push(pending);
    clearPending();
    redraw();
    onChange();
  }

  canvas.addEventListener('pointerdown',event => {
    if (!active || pending || !event.isPrimary || event.button!==0) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    pending = {mode:mode.value,size:size.valueAsNumber,points:[point(event)]};
    redraw();
  });
  canvas.addEventListener('pointermove',event => {
    if (!pending || event.pointerId!==pointerId) return;
    pending.points.push(point(event));
    redraw();
  });
  canvas.addEventListener('pointerup',finish);
  canvas.addEventListener('pointercancel',finish);
  undo.addEventListener('click',()=>{ strokes.pop(); redraw(); onChange(); });
  toggle.addEventListener('click',open);

  async function exportBlob() {
    if (!pair || !strokes.length) return pair?.result.blob;
    if (!base || !original) [original,base] = await Promise.all([image(pair.source.url),image(pair.result.url)]);
    const output = document.createElement('canvas');
    output.width = pair.result.width;
    output.height = pair.result.height;
    draw(output,strokes);
    try { return await encodeArtwork(output,'image/png'); }
    finally { output.width = output.height = 1; }
  }

  return {setImages,sync,hide,exportBlob,get active(){return active;},get edited(){return Boolean(strokes.length);}};
}
