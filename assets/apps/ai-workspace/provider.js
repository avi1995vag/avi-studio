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
      found.push(...(data.models||[]).filter(model=>model.supportedGenerationMethods?.includes('generateContent')).map(model=>({id:model.name.replace(/^models\//,''),name:model.displayName||model.name})));
      page=data.nextPageToken;if(!page)break;
    }
    return found.sort((a,b)=>a.name.localeCompare(b.name));
  }
  async function generate({provider,key,model,input,signal}){
    if(!key.trim())throw new Error('Enter your provider API key first.');
    if(!model||! /^[a-zA-Z0-9._:/-]+$/.test(model))throw new Error('Select an available text model or enter its model ID.');
    const prompt=core.prompt(input);let content;
    if(provider==='openai'){
      const data=await request('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,body:JSON.stringify({model,messages:[{role:'user',content:prompt}],response_format:{type:'json_object'},max_completion_tokens:8000})},key);
      const choice=data.choices?.[0];if(choice?.message?.refusal)throw new Error('The model declined this request. Revise the source or instructions.');
      if(choice?.finish_reason==='length')throw new Error('The model reached its output limit. Use fewer sections or shorter source text.');
      content=choice?.message?.content;
    }else{
      const name=model.replace(/^models\//,'');
      const data=await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},signal,body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:10000}})},key);
      if(data.promptFeedback?.blockReason)throw new Error('The provider blocked this request. Review the source and try a different brief.');
      const candidate=data.candidates?.[0];if(candidate?.finishReason==='MAX_TOKENS')throw new Error('The model reached its output limit. Use fewer sections or shorter source text.');
      content=candidate?.content?.parts?.filter(part=>typeof part.text==='string'&&!part.thought).map(part=>part.text).join('\n');
    }
    if(!content)throw new Error('The model returned no usable text. Choose another text-generation model or revise the source.');
    return core.normalize(core.parseResult(content),input.source);
  }
  const api={models,generate};if(typeof module==='object'&&module.exports)module.exports=api;else root.AviProvider=api;
})(typeof window==='object'?window:globalThis);
