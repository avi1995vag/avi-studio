importScripts('photo-core.js?v=2');
self.onmessage=event=>{
  try{
    const result=AviPhotoCore.inpaint(event.data,progress=>postMessage({progress}));
    postMessage({result},[result.buffer]);
  }catch(error){postMessage({error:error.message||'Photo repair could not complete.'});}
};
