(function(root){
  'use strict';
  const core=typeof module==='object'&&module.exports?require('./core.js'):root.AviBrief;
  async function request(url,options,key){
    let response;try{response=await fetch(url,options);}catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw error;throw new Error('Could not reach the AI provider from this browser. Check your connection, provider availability and browser access restrictions.');}
    let data;try{data=await response.json();}catch{throw new Error(`The provider returned an unreadable response (HTTP ${response.status}).`);}
    if(!response.ok){const detail=String(data?.error?.message||'').replaceAll(key,'[redacted]');throw new Error(core.apiError(response.status,detail));}
    return data;
  }
  async function models(provider,key,signal){
    if(!key.trim())throw new Error('Enter your provider API key first.');
    if(provider==='openai'){
      const data=await request('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},signal},key);
      return (data.data||[]).filter(model=>/^(gpt-|chatgpt-|o\d)/.test(model.id)&&!/(audio|transcrib|tts|realtime|image|embedding)/.test(model.id)).map(model=>({id:model.id,name:model.id})).sort((a,b)=>a.id.localeCompare(b.id));
    }
    const found=[];let page='';
    for(let i=0;i<5;i++){
      const data=await request('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''),{headers:{'x-goog-api-key':key},signal},key);
      found.push(...(data.models||[]).filter(model=>model.supportedGenerationMethods?.includes('generateContent')&&!/(image|audio|live|tts|robotics|computer-use|deep-research)/i.test(model.name)).map(model=>({id:model.name.replace(/^models\//,''),name:model.displayName||model.name})));
      page=data.nextPageToken;if(!page)break;
    }
    const rank=model=>/flash-lite/.test(model.id)?0:/flash/.test(model.id)?1:/pro/.test(model.id)?2:3;
    return found.sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name));
  }
  async function readEvents(response,onEvent){
    if(!response.body?.getReader)throw new Error('Streaming responses are unavailable in this browser. Use a current Chrome, Edge or Firefox version.');
    const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
    function consume(line){if(!line.startsWith('data:'))return;const data=line.slice(5).trim();if(!data||data==='[DONE]')return;let event;try{event=JSON.parse(data);}catch{throw new Error('The provider stream was interrupted. Your source is still here; retry when the connection is stable.');}onEvent(event);}
    try{while(true){const {value,done}=await reader.read();pending+=decoder.decode(value||new Uint8Array(),{stream:!done});let end;while((end=pending.indexOf('\n'))!==-1){const line=pending.slice(0,end).replace(/\r$/,'');pending=pending.slice(end+1);consume(line);}if(done){if(pending.trim())consume(pending);break;}}}finally{reader.releaseLock();}
  }
  async function generate({provider,key,model,input,signal,onProgress=()=>{}}){
    if(!key.trim())throw new Error('Enter your provider API key first.');
    if(!model||! /^[a-zA-Z0-9._:/-]+$/.test(model))throw new Error('Select an available text model or enter its model ID.');
    const prompt=core.prompt(input)+'\nKeep the brief compact: at most 8 angles, 12 source facts, 8 places and 3 image prompts. Each section body is at most 45 words, visual direction 15 words, narration 25 words. Summary at most 65 words. Avoid repeating the same passage in multiple fields. Return no more sections than requested.';let content;
    if(provider==='openai'){
      const data=await request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,body:JSON.stringify({model,messages:[{role:'user',content:prompt}],response_format:{type:'json_object'},max_completion_tokens:8000})},key);
      const choice=data.choices?.[0];if(choice?.message?.refusal)throw new Error('The model declined this request. Revise the source or instructions.');
      if(choice?.finish_reason==='length')throw new Error('The model reached its output limit. Use fewer sections or shorter source text.');
      content=choice?.message?.content;
    }else{
      const name=model.replace(/^models\//,'');
      const config={responseMimeType:'application/json',maxOutputTokens:6000};
      if(/^gemini-(?:3|4)[.-]/.test(name))config.thinkingConfig={thinkingLevel:'LOW'};
      else if(/^gemini-2\.5-flash/.test(name))config.thinkingConfig={thinkingBudget:0};
      if(/^gemini-(?:2\.5|[3-9])[.-]/.test(name))config.responseJsonSchema=core.schema;
      let response;
      try{response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:streamGenerateContent?alt=sse`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},signal,body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:config})});}
      catch(error){if(signal?.aborted)throw error;throw new Error('Could not connect to Gemini. Check the connection or provider availability.');}
      if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(core.apiError(response.status,String(data?.error?.message||'').replaceAll(key,'[redacted]')));}
      content='';onProgress({phase:'connected',characters:0});
      await readEvents(response,data=>{
        if(data.error)throw new Error(core.apiError(data.error.code||500,String(data.error.message||'').replaceAll(key,'[redacted]')));
        if(data.promptFeedback?.blockReason)throw new Error('The provider blocked this request. Review the source and try a different brief.');
        const candidate=data.candidates?.[0];if(candidate?.finishReason==='MAX_TOKENS')throw new Error('The model reached its output limit. Use fewer sections or shorter source text.');
        content+=(candidate?.content?.parts||[]).filter(part=>typeof part.text==='string'&&!part.thought).map(part=>part.text).join('');
        if(content.length>180000)throw new Error('The provider response was unexpectedly large. Use fewer sections.');
        onProgress({phase:'receiving',characters:content.length});
      });
    }
    if(!content)throw new Error('The model returned no usable text. Choose another text-generation model or revise the source.');
    return core.normalize(core.parseResult(content),input.source);
  }
  const api={models,generate,readEvents};if(typeof module==='object'&&module.exports)module.exports=api;else root.AviProvider=api;
})(typeof window==='object'?window:globalThis);
