/* Runs segmentation and image resampling off the main thread. */
let session;
let cachedMask;
const modelSide = 320;
const maxPixels = 12_000_000;
const maxSide = 4096;

function fitSize(width,height,scale) {
  const factor = Math.min(scale,maxSide/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
  return [Math.max(1,Math.floor(width*factor)),Math.max(1,Math.floor(height*factor))];
}

function canvasContext(width,height) {
  const canvas = new OffscreenCanvas(width,height);
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingQuality = 'high';
  return {canvas,ctx};
}

async function subjectMask(bitmap,sourceId,progress) {
  if (cachedMask?.sourceId === sourceId) return cachedMask.canvas;
  if (!session) {
    progress('Loading the local subject model…');
    if (!self.ort) importScripts('./vision/ort.wasm.min.js');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('./vision/',self.location.href).href;
    const response = await fetch('./vision/u2netp.onnx');
    if (!response.ok) throw new Error('The subject model could not load. Try the solid-color method or retry.');
    session = await ort.InferenceSession.create(await response.arrayBuffer(),{executionProviders:['wasm']});
  }
  progress('Finding the subject…');
  const {canvas,ctx} = canvasContext(modelSide,modelSide);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,modelSide,modelSide);
  ctx.drawImage(bitmap,0,0,modelSide,modelSide);
  const frame = ctx.getImageData(0,0,modelSide,modelSide);
  const plane = modelSide*modelSide;
  const input = new Float32Array(3*plane);
  const mean = [.485,.456,.406], dev = [.229,.224,.225];
  for (let channel=0; channel<3; channel++) {
    for (let i=0; i<plane; i++) input[channel*plane+i] = (frame.data[4*i+channel]/255-mean[channel])/dev[channel];
  }
  const tensor = new ort.Tensor('float32',input,[1,3,modelSide,modelSide]);
  const name = session.outputNames[0];
  const result = await session.run({[session.inputNames[0]]:tensor},[name]);
  const data = result[name].data;
  if (data.length < plane) throw new Error('The subject model returned an incomplete mask.');
  let low = Infinity, high = -Infinity;
  for (let i=0; i<plane; i++) {
    low = Math.min(low,data[i]);
    high = Math.max(high,data[i]);
  }
  if (!(high-low > .00001)) throw new Error('A clear subject was not detected. Try a different photo or the solid-color method.');
  for (let i=0; i<plane; i++) {
    const level = (data[i]-low)/(high-low)*255;
    frame.data[4*i] = frame.data[4*i+1] = frame.data[4*i+2] = level;
    frame.data[4*i+3] = 255;
  }
  ctx.putImageData(frame,0,0);
  cachedMask = {sourceId,canvas};
  return canvas;
}

function smoothstep(value,start,end) {
  const level = Math.min(1,Math.max(0,(value-start)/(end-start)));
  return level*level*(3-2*level);
}

async function removeBackground(bitmap,options,progress) {
  const [width,height] = fitSize(bitmap.width,bitmap.height,1);
  const {canvas,ctx} = canvasContext(width,height);
  ctx.drawImage(bitmap,0,0,width,height);
  const frame = ctx.getImageData(0,0,width,height);
  if (options.method === 'subject') {
    const mask = await subjectMask(bitmap,options.sourceId,progress);
    const {ctx:maskCtx} = canvasContext(width,height);
    maskCtx.drawImage(mask,0,0,width,height);
    const alpha = maskCtx.getImageData(0,0,width,height).data;
    const threshold = options.edge / 100;
    const softness = options.soft / 100;
    for (let i=0; i<frame.data.length; i+=4) {
      frame.data[i+3] *= smoothstep(alpha[i]/255,threshold-softness,threshold+softness);
    }
  } else {
    progress('Removing the selected background color…');
    const [r,g,b] = options.color.slice(1).match(/../g).map(pair => parseInt(pair,16));
    const softness = Math.max(2,options.soft);
    const start = Math.max(0,options.tolerance-softness);
    const end = options.tolerance+softness;
    for (let i=0; i<frame.data.length; i+=4) {
      const dr=frame.data[i]-r, dg=frame.data[i+1]-g, db=frame.data[i+2]-b;
      frame.data[i+3] *= smoothstep(Math.sqrt(dr*dr+dg*dg+db*db),start,end);
    }
  }
  ctx.putImageData(frame,0,0);
  return {blob:await canvas.convertToBlob({type:'image/png'}),width,height};
}

function sharpenImage(ctx,width,height,amount) {
  if (!amount) return;
  const frame = ctx.getImageData(0,0,width,height);
  const input = frame.data.slice();
  const stride = width*4;
  const gain = amount/100*.9;
  for (let y=1; y<height-1; y++) for (let x=1; x<width-1; x++) {
    const i = y*stride+x*4;
    if (input[i+3]<224 || input[i-1]<224 || input[i+7]<224 || input[i-stride+3]<224 || input[i+stride+3]<224) continue;
    for (let c=0; c<3; c++) {
      const p = i+c;
      const blur = (input[p-4]+input[p+4]+input[p-stride]+input[p+stride])*.25;
      frame.data[p] = input[p] + (input[p]-blur)*gain;
    }
  }
  ctx.putImageData(frame,0,0);
}

async function upscale(bitmap,options,progress) {
  const [width,height] = fitSize(bitmap.width,bitmap.height,options.scale);
  if (width<=bitmap.width && height<=bitmap.height) throw new Error('This source is already at the HD output limit. Try a smaller image.');
  progress('Resampling image and refining edges…');
  const {canvas,ctx} = canvasContext(width,height);
  if (options.type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,width,height);
  }
  ctx.drawImage(bitmap,0,0,width,height);
  sharpenImage(ctx,width,height,options.sharpen);
  const blob = await canvas.convertToBlob({type:options.type,quality:.94});
  if (blob.type !== options.type) throw new Error('This browser could not export the selected format.');
  return {blob,width,height};
}

self.addEventListener('message',async ({data:{id,mode,blob,options}}) => {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
    const progress = message => self.postMessage({id,progress:message});
    const result = mode === 'cutout' ? await removeBackground(bitmap,options,progress) : await upscale(bitmap,options,progress);
    self.postMessage({id,result});
  } catch (error) {
    self.postMessage({id,error:error.message || 'The image could not be processed.'});
  } finally { bitmap?.close(); }
});
