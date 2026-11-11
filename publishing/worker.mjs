const BUFFER_AUTH = 'https://auth.buffer.com';
const BUFFER_API = 'https://api.buffer.com';
const TEN_MINUTES = 600_000;
const DAY = 86_400_000;
const MAX_IMAGE = 1_800_000;
const MAX_UPLOAD = 12_000_000;
const keyFormat = /^[A-Za-z0-9_-]{43}$/;
const batchFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const imageLimits = {facebook:10,twitter:4,instagram:10,linkedin:9,threads:10,bluesky:4,mastodon:4};
const ownerQuery = '{ account { id email } }';
const organizationsQuery = '{ account { organizations { id name } } }';
const channelsQuery = `query Channels($id: OrganizationId!) {
  channels(input: { organizationId: $id }) { id name displayName descriptor service type isDisconnected isLocked }
}`;
const publishQuery = `mutation Publish($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id status } }
    ... on MutationError { message }
  }
}`;
const statusQuery = 'query Status($id: PostId!) { post(input: { id: $id }) { status } }';

class RequestError extends Error {
  constructor(status,message){ super(message); this.status = status; }
}

class BufferTokenError extends RequestError {
  constructor(status,reason){
    super(status,'Buffer sign-in needs to be renewed.');
    this.reason = reason;
  }
}

const tokenErrors = new Set(['invalid_client','invalid_grant','invalid_request','invalid_scope','unauthorized_client','unsupported_grant_type']);

const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const randomKey = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const sql = (env,query,...params) => env.DB.prepare(query).bind(...params);

function json(data,status=200){
  return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

function cors(response,origin){
  response.headers.set('Access-Control-Allow-Origin',origin);
  response.headers.set('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
  response.headers.set('Vary','Origin');
  return response;
}

function configured(env){
  return env.DB && env.STUDIO_URL && env.SERVICE_URL && env.BUFFER_CLIENT_ID &&
    env.BUFFER_CLIENT_SECRET && env.SESSION_ENCRYPTION_KEY && env.BUFFER_OWNER_EMAIL;
}

async function boundedBody(request,limit){
  if(Number(request.headers.get('Content-Length'))>limit) throw new RequestError(413,'The upload is too large.');
  if(!request.body) throw new RequestError(400,'A request body is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for(;;){
    const {value,done} = await reader.read();
    if(done) break;
    length += value.byteLength;
    if(length>limit){
      await reader.cancel().catch(() => {});
      throw new RequestError(413,'The upload is too large.');
    }
    chunks.push(value);
  }
  return new Blob(chunks,{type:request.headers.get('Content-Type') || ''});
}

async function readJson(request){
  const body = await boundedBody(request,4096);
  try { return JSON.parse(await body.text()); }
  catch { throw new RequestError(400,'The request is invalid.'); }
}

function encryptionKey(env){
  const bytes = Uint8Array.from(atob(env.SESSION_ENCRYPTION_KEY),char => char.charCodeAt(0));
  if(bytes.length!==32) throw new Error('Invalid session encryption key');
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}

async function seal(env,value){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),encoder.encode(JSON.stringify(value)));
  const bytes = new Uint8Array(12+cipher.byteLength);
  bytes.set(iv); bytes.set(new Uint8Array(cipher),12);
  // Chunk conversion keeps long OAuth tokens within argument limits.
  let text = '';
  for(let offset=0;offset<bytes.length;offset+=1024) text += String.fromCharCode(...bytes.subarray(offset,offset+1024));
  return btoa(text);
}

async function unseal(env,value){
  const bytes = Uint8Array.from(atob(value),char => char.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},await encryptionKey(env),bytes.subarray(12));
  return JSON.parse(decoder.decode(plain));
}

async function bufferTokens(env,params){
  const response = await fetch(BUFFER_AUTH + '/token',{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(15_000),
    headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:new URLSearchParams({client_id:env.BUFFER_CLIENT_ID,client_secret:env.BUFFER_CLIENT_SECRET,...params})
  });
  const data = await response.json().catch(() => null);
  if(!response.ok){
    throw new BufferTokenError(response.status===400 || response.status===401 ? 401 : 502,
      tokenErrors.has(data?.error) ? data.error : `http_${response.status}`);
  }
  const expiresIn = Number(data?.expires_in);
  if(typeof data?.access_token!=='string' || !data.access_token || !Number.isFinite(expiresIn) || expiresIn<=0){
    throw new BufferTokenError(502,'unexpected_token_response');
  }
  const refresh = typeof data.refresh_token==='string' && data.refresh_token ? data.refresh_token : null;
  return {
    credentials:await seal(env,{access:data.access_token,refresh}),
    expires:Date.now()+expiresIn*1000,
    access:data.access_token
  };
}

async function bufferRequest(token,query,variables={}){
  const response = await fetch(BUFFER_API,{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(15_000),
    headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},
    body:JSON.stringify({query,variables})
  });
  if(response.status===401) throw new RequestError(401,'Sign in to Buffer again.');
  if(!response.ok) throw new RequestError(502,'Buffer is temporarily unavailable.');
  const result = await response.json();
  if(result.errors?.length || !result.data) throw new RequestError(502,'Buffer could not complete the request.');
  return result.data;
}

async function startLogin(request,env){
  const {challenge} = (await readJson(request)) || {};
  if(typeof challenge!=='string' || !keyFormat.test(challenge)) throw new RequestError(400,'Invalid sign-in challenge.');
  const state = randomKey(), verifier = randomKey();
  await sql(env,'INSERT INTO oauth_flow VALUES (?, ?, ?, ?)',state,challenge,verifier,Date.now()+TEN_MINUTES).run();
  const url = new URL(BUFFER_AUTH + '/auth');
  url.search = new URLSearchParams({
    client_id:env.BUFFER_CLIENT_ID,response_type:'code',redirect_uri:new URL('/oauth/callback',env.SERVICE_URL),
    scope:'account:read posts:read posts:write offline_access',state,code_challenge:await digest(verifier),code_challenge_method:'S256'
  });
  return json({url:url.href});
}

function returnToStudio(env,fragment){
  const url = new URL(env.STUDIO_URL);
  url.hash = new URLSearchParams(fragment).toString();
  return new Response(null,{status:303,headers:{Location:url.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}

async function callback(url,env){
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if(!keyFormat.test(state)) return returnToStudio(env,{buffer_error:'expired'});
  const row = await sql(env,'DELETE FROM oauth_flow WHERE state=? AND expires>? RETURNING browser_challenge, verifier',state,Date.now()).first();
  if(!row || !code || code.length>2048) return returnToStudio(env,{buffer_error:row ? 'cancelled' : 'expired'});
  let stage = 'token';
  try {
    const tokens = await bufferTokens(env,{
      grant_type:'authorization_code',code,code_verifier:row.verifier,redirect_uri:new URL('/oauth/callback',env.SERVICE_URL)
    });
    stage = 'account';
    const {account} = await bufferRequest(tokens.access,ownerQuery);
    if(typeof account?.id!=='string' || typeof account.email!=='string') throw new RequestError(502,'Buffer did not return account information.');
    if(account.email.trim().toLowerCase()!==env.BUFFER_OWNER_EMAIL.trim().toLowerCase()){
      return returnToStudio(env,{buffer_error:'account'});
    }
    stage = 'handoff';
    const handoff = randomKey();
    await sql(env,'INSERT INTO oauth_handoff VALUES (?, ?, ?, ?, ?, ?)',
      await digest(handoff),row.browser_challenge,account.id,tokens.credentials,tokens.expires,Date.now()+TEN_MINUTES).run();
    return returnToStudio(env,{buffer_connection:handoff});
  } catch(error){
    const reason = error instanceof BufferTokenError ? error.reason : error instanceof RequestError ? `http_${error.status}` : 'unexpected';
    console.warn(JSON.stringify({event:'buffer_sign_in_failed',stage,reason}));
    const result = reason==='invalid_client' || reason==='unauthorized_client' ? 'client'
      : reason==='invalid_grant' ? 'invalid_grant'
      : stage==='account' ? 'account_unavailable' : 'connection';
    return returnToStudio(env,{buffer_error:result});
  }
}

async function finishLogin(request,env){
  const {handoff,proof} = (await readJson(request)) || {};
  if(typeof handoff!=='string' || typeof proof!=='string' || !keyFormat.test(handoff) || !keyFormat.test(proof)){
    throw new RequestError(400,'Start a new Buffer sign-in from the studio.');
  }
  const row = await sql(env,`DELETE FROM oauth_handoff WHERE code_hash=? AND browser_challenge=? AND expires>?
    RETURNING account_id,credentials,access_expires`,await digest(handoff),await digest(proof),Date.now()).first();
  if(!row) throw new RequestError(401,'The sign-in expired. Connect to Buffer again.');
  const token = randomKey();
  await sql(env,'INSERT INTO studio_session VALUES (?, ?, ?, ?, ?, NULL)',
    await digest(token),row.account_id,row.credentials,row.access_expires,Date.now()+7*DAY).run();
  return json({token});
}

async function session(request,env){
  const token = (request.headers.get('Authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if(!token) throw new RequestError(401,'Connect to Buffer first.');
  const hash = await digest(token);
  const row = await sql(env,'SELECT * FROM studio_session WHERE token_hash=? AND expires>?',hash,Date.now()).first();
  if(!row) throw new RequestError(401,'Your studio session expired. Connect to Buffer again.');
  return row;
}

async function accessToken(env,row){
  const stored = await unseal(env,row.credentials);
  if(row.access_expires>Date.now()+30_000) return stored.access;
  if(!stored.refresh){
    await sql(env,'DELETE FROM studio_session WHERE token_hash=? AND access_expires=?',row.token_hash,row.access_expires).run();
    throw new RequestError(401,'Connect to Buffer again.');
  }
  const locked = await sql(env,`UPDATE studio_session SET refresh_started=?
    WHERE token_hash=? AND access_expires=? AND refresh_started IS NULL RETURNING token_hash`,
    Date.now(),row.token_hash,row.access_expires).first();
  if(!locked){
    const latest = await sql(env,'SELECT * FROM studio_session WHERE token_hash=?',row.token_hash).first();
    if(!latest || (latest.refresh_started && latest.refresh_started<Date.now()-30_000)){
      await sql(env,'DELETE FROM studio_session WHERE token_hash=? AND access_expires=?',row.token_hash,row.access_expires).run();
      throw new RequestError(401,'Connect to Buffer again.');
    }
    if(latest.access_expires>Date.now()+30_000) return (await unseal(env,latest.credentials)).access;
    throw new RequestError(409,'Buffer sign-in is being refreshed. Try again shortly.');
  }
  try {
    const tokens = await bufferTokens(env,{grant_type:'refresh_token',refresh_token:stored.refresh});
    await sql(env,'UPDATE studio_session SET credentials=?, access_expires=?, refresh_started=NULL WHERE token_hash=?',
      tokens.credentials,tokens.expires,row.token_hash).run();
    return tokens.access;
  } catch {
    // A timed-out refresh can have consumed the old single-use token.
    await sql(env,'DELETE FROM studio_session WHERE token_hash=?',row.token_hash).run();
    throw new RequestError(401,'Connect to Buffer again.');
  }
}

async function listChannels(token){
  const {account} = await bufferRequest(token,organizationsQuery);
  const groups = await Promise.all(account.organizations.slice(0,8).map(async organization => {
    const {channels} = await bufferRequest(token,channelsQuery,{id:organization.id});
    return channels.filter(channel => Object.hasOwn(imageLimits,channel.service) && !channel.isLocked && !channel.isDisconnected
      && (channel.service!=='facebook' || channel.type==='page')
      && (channel.service!=='instagram' || channel.type==='business')
    ).map(channel => ({id:channel.id,name:channel.displayName || channel.name,platform:channel.descriptor,
      service:channel.service,organization:organization.name,maxImages:imageLimits[channel.service]}));
  }));
  return groups.flat();
}

async function receivePost(request){
  const body = await boundedBody(request,MAX_UPLOAD);
  let fields;
  try { fields = await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type') || ''}}).formData(); }
  catch { throw new RequestError(400,'The artwork upload could not be read.'); }
  const id = fields.get('id'), caption = fields.get('caption');
  const channelIds = fields.getAll('channel');
  const images = fields.getAll('image');
  if(typeof id!=='string' || !batchFormat.test(id) || typeof caption!=='string' || caption.length>5000 ||
     !channelIds.length || channelIds.length>5 || new Set(channelIds).size!==channelIds.length ||
     channelIds.some(channel => typeof channel!=='string' || channel.length>160) || !images.length || images.length>10){
    throw new RequestError(400,'Choose up to five channels and include one to ten images.');
  }
  const files = await Promise.all(images.map(async file => {
    if(!(file instanceof File) || file.type!=='image/jpeg' || file.size<10 || file.size>MAX_IMAGE){
      throw new RequestError(413,'Each image must be a JPEG under 1.8 MB.');
    }
    const data = await file.arrayBuffer(), bytes = new Uint8Array(data);
    if(bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255 || bytes.at(-2)!==255 || bytes.at(-1)!==217){
      throw new RequestError(400,'An image is not a valid JPEG.');
    }
    return {id:randomKey(),data};
  }));
  return {id,caption,channelIds,files};
}

async function receipt(env,id,accountId){
  const batch = await sql(env,'SELECT created FROM publish_batch WHERE id=? AND account_id=?',id,accountId).first();
  if(!batch) return null;
  const {results} = await sql(env,'SELECT channel_id,label,status,post_id,message FROM publish_target WHERE batch_id=? ORDER BY rowid',id).all();
  return {id,created:batch.created,channels:results.map(row => ({
    channelId:row.channel_id,label:row.label,postId:row.post_id,message:row.message,
    status:row.status==='submitting' && batch.created<Date.now()-90_000 ? 'unknown' : row.status
  }))};
}

async function publish(request,env,row){
  const draft = await receivePost(request);
  const previous = await receipt(env,draft.id,row.account_id);
  if(previous) return json(previous);
  const token = await accessToken(env,row);
  const channels = await listChannels(token);
  const targets = draft.channelIds.map(id => channels.find(channel => channel.id===id));
  if(targets.some(channel => !channel)) throw new RequestError(403,'A selected channel is no longer available.');
  const smaller = targets.find(channel => draft.files.length>channel.maxImages);
  if(smaller) throw new RequestError(422,`${smaller.platform} accepts up to ${smaller.maxImages} images. Choose a shorter design or another channel.`);
  const now = Date.now();
  try {
    await env.DB.batch([
      sql(env,'INSERT INTO publish_batch VALUES (?, ?, ?)',draft.id,row.account_id,now),
      ...draft.files.map(file => sql(env,'INSERT INTO publish_media VALUES (?, ?, ?)',file.id,file.data,now+DAY)),
      ...targets.map(channel => sql(env,`INSERT INTO publish_target (batch_id,channel_id,label,status)
        VALUES (?, ?, ?, 'submitting')`,draft.id,channel.id,channel.platform + ' · ' + channel.name))
    ]);
  } catch(error){
    const existing = await receipt(env,draft.id,row.account_id);
    if(existing) return json(existing);
    throw error;
  }
  const assets = draft.files.map(file => ({image:{url:new URL('/media/' + file.id + '.jpg',env.SERVICE_URL).href}}));
  await Promise.all(targets.map(async channel => {
    let status = 'unknown', postId = null, message = 'Check Buffer before trying to publish this post again.';
    try {
      const input = {channelId:channel.id,text:draft.caption,schedulingType:'automatic',mode:'shareNow',assets};
      if(channel.service==='facebook' || channel.service==='instagram'){
        input.metadata = {[channel.service]:{type:'post'}};
      }
      const {createPost} = await bufferRequest(token,publishQuery,{input});
      if(createPost?.post?.id){
        status = createPost.post.status || 'sending'; postId = createPost.post.id; message = null;
      } else if(typeof createPost?.message==='string'){
        status = 'rejected'; message = createPost.message.slice(0,280);
      }
    } catch(error){
      if(error.status===401){ status = 'rejected'; message = 'Buffer authorization expired. Reconnect before posting.'; }
    }
    await sql(env,'UPDATE publish_target SET status=?,post_id=?,message=? WHERE batch_id=? AND channel_id=?',
      status,postId,message,draft.id,channel.id).run();
  }));
  return json(await receipt(env,draft.id,row.account_id),201);
}

async function checkPost(env,id,row){
  const current = await receipt(env,id,row.account_id);
  if(!current) throw new RequestError(404,'No publishing receipt found.');
  const pending = current.channels.filter(channel => channel.postId && ['scheduled','sending','needs_approval','draft'].includes(channel.status));
  if(!pending.length) return json(current);
  const token = await accessToken(env,row);
  await Promise.all(pending.map(async channel => {
    try {
      const {post} = await bufferRequest(token,statusQuery,{id:channel.postId});
      if(post?.status && post.status!==channel.status){
        await sql(env,'UPDATE publish_target SET status=? WHERE batch_id=? AND channel_id=?',
          post.status,id,channel.channelId).run();
      }
    } catch(error){
      if(error.status===401) throw error;
    }
  }));
  return json(await receipt(env,id,row.account_id));
}

async function serveMedia(env,id,head){
  const file = await sql(env,'SELECT contents FROM publish_media WHERE id=? AND expires>?',id,Date.now()).first();
  if(!file) return new Response(null,{status:404});
  const bytes = Uint8Array.from(file.contents);
  return new Response(head ? null : bytes,{headers:{
    'Content-Type':'image/jpeg','Content-Length':String(bytes.byteLength),'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'
  }});
}

export default {
  async fetch(request,env){
    const url = new URL(request.url);
    const studio = env.STUDIO_URL ? new URL(env.STUDIO_URL).origin : '';
    const sameOrigin = studio && request.headers.get('Origin')===studio;
    const method = request.method;
    const mediaId = url.pathname.match(/^\/media\/([A-Za-z0-9_-]{43})\.jpg$/)?.[1];
    try {
      if(!configured(env)) throw new RequestError(503,'Direct publishing setup is incomplete.');
      if(mediaId && ['HEAD','GET'].includes(method)) return await serveMedia(env,mediaId,method==='HEAD');
      if(url.pathname==='/oauth/callback' && method==='GET') return await callback(url,env);
      if(!sameOrigin) throw new RequestError(403,'Open publishing from AvI Studio.');
      if(method==='OPTIONS') return cors(new Response(null,{status:204}),studio);
      if(url.pathname==='/health' && method==='GET'){
        await sql(env,'SELECT token_hash FROM studio_session LIMIT 0').all();
        return cors(json({ready:true}),studio);
      }
      if(url.pathname==='/oauth/start' && method==='POST') return cors(await startLogin(request,env),studio);
      if(url.pathname==='/oauth/finish' && method==='POST') return cors(await finishLogin(request,env),studio);
      const row = await session(request,env);
      if(url.pathname==='/session' && method==='DELETE'){
        await sql(env,'DELETE FROM studio_session WHERE token_hash=?',row.token_hash).run();
        return cors(json({signedOut:true}),studio);
      }
      if(url.pathname==='/channels' && method==='GET'){
        return cors(json({channels:await listChannels(await accessToken(env,row))}),studio);
      }
      if(url.pathname==='/posts' && method==='POST') return cors(await publish(request,env,row),studio);
      const postId = url.pathname.startsWith('/posts/') && url.pathname.slice(7);
      if(method==='GET' && batchFormat.test(postId)) return cors(await checkPost(env,postId,row),studio);
      throw new RequestError(404,'Publishing endpoint not found.');
    } catch(error){
      if(!(error instanceof RequestError)) console.error(JSON.stringify({event:'publishing_request_failed',method,type:error.name}));
      const response = json({error:error.status ? error.message : 'Publishing service temporarily unavailable.'},error.status || 500);
      return sameOrigin ? cors(response,studio) : response;
    }
  },
  async scheduled(controller,env){
    const now = controller.scheduledTime;
    await env.DB.batch([
      sql(env,'DELETE FROM oauth_flow WHERE expires<=?',now),
      sql(env,'DELETE FROM oauth_handoff WHERE expires<=?',now),
      sql(env,'DELETE FROM studio_session WHERE expires<=?',now),
      sql(env,'DELETE FROM publish_media WHERE expires<=?',now),
      sql(env,'DELETE FROM publish_batch WHERE created<=?',now-7*DAY)
    ]);
  }
};
