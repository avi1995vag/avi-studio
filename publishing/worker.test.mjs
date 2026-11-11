import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.mjs';

const schema = readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
const studio = 'https://avi1995vag.github.io';
const service = 'https://publisher.example';
const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(value))).toString('base64url');
const channel = (id,service,type) => ({id,service,type,name:id,descriptor:service});

function database(){
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  return {
    native:db,
    prepare(query){
      const statement = db.prepare(query);
      return {bind(...values){
        const args = values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
        return {
          first:async () => statement.get(...args) || null,
          all:async () => ({results:statement.all(...args)}),
          run:async () => statement.run(...args)
        };
      }};
    },
    async batch(statements){
      db.exec('BEGIN');
      try {
        for(const statement of statements) await statement.run();
        db.exec('COMMIT');
      } catch(error){
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

test('authorizes the owner, protects credentials and returns one receipt per channel',async context => {
  const env = {
    DB:database(),STUDIO_URL:studio + '/avi-studio/',SERVICE_URL:service,BUFFER_OWNER_EMAIL:'owner@example.com',
    BUFFER_CLIENT_ID:'mock-client',BUFFER_CLIENT_SECRET:'mock-secret',SESSION_ENCRYPTION_KEY:Buffer.alloc(32,6).toString('base64')
  };
  let owner = 'other@example.com', token, writes = 0, refreshes = 0, hostedMedia;
  let tokenFailure, omitRefresh = false;
  const request = (path,{origin=studio,authenticated=false,...options}={}) => {
    const headers = new Headers(options.headers);
    if(origin) headers.set('Origin',origin);
    if(authenticated) headers.set('Authorization','Bearer ' + token);
    return worker.fetch(new Request(service + path,{...options,headers}),env);
  };
  const postJson = (path,data) => request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const jpeg = Uint8Array.from([255,216,255,224,0,4,1,1,0,0,255,217]);
  context.mock.method(globalThis,'fetch',async (url,options) => {
    assert.equal(options.redirect,'manual');
    if(url==='https://auth.buffer.com/token'){
      assert.equal(options.body.get('client_secret'),'mock-secret');
      if(tokenFailure) return Response.json({error:tokenFailure,error_description:'Private provider details'},{status:400});
      if(options.body.get('grant_type')==='refresh_token'){
        refreshes++;
        assert.equal(options.body.get('refresh_token'),'mock-refresh');
      } else {
        assert.equal(options.body.get('redirect_uri'),service + '/oauth/callback');
        assert.match(options.body.get('code_verifier'),/^[\w-]{43}$/);
      }
      return Response.json({access_token:'mock-access',refresh_token:omitRefresh ? undefined : 'mock-refresh',expires_in:'3600'});
    }
    assert.equal(url,'https://api.buffer.com');
    assert.equal(options.headers.Authorization,'Bearer mock-access');
    const {query,variables} = JSON.parse(options.body);
    if(query.includes('account')) return Response.json({data:{account:{id:'owner',email:owner,organizations:[{id:'org',name:'AvI'}]}}});
    if(query.includes('channels(')) return Response.json({data:{channels:[
      channel('avi-page','facebook','page'),channel('avi-x','twitter','profile'),channel('personal','facebook','profile')
    ]}});
    if(query.includes('createPost(')){
      writes++;
      assert.equal(variables.input.mode,'shareNow');
      assert.equal(variables.input.text,'Caption stays with the artwork');
      if(variables.input.channelId==='avi-page'){
        assert.deepEqual(variables.input.metadata,{facebook:{type:'post'}});
      } else {
        assert.equal(variables.input.metadata,undefined);
      }
      hostedMedia = variables.input.assets[0].image.url;
      assert.deepEqual(new Uint8Array(await (await request(new URL(hostedMedia).pathname,{origin:null})).arrayBuffer()),jpeg);
      const createPost = variables.input.channelId==='avi-x'
        ? {message:'Caption is too long for this account.'} : {post:{id:'buffer-post',status:'sending'}};
      return Response.json({data:{createPost}});
    }
    assert.equal(variables.id,'buffer-post');
    return Response.json({data:{post:{status:'sent'}}});
  });
  const proof = Buffer.alloc(32,10).toString('base64url');
  const login = async () => {
    const start = await postJson('/oauth/start',{challenge:await digest(proof)});
    assert.equal(start.status,200);
    const {url} = await start.json();
    const auth = new URL(url);
    assert.equal(auth.origin,'https://auth.buffer.com');
    assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
    const callback = '/oauth/callback?code=mock-code&state=' + auth.searchParams.get('state');
    const response = await request(callback,{origin:null});
    assert.equal(response.status,303);
    const repeat = await request(callback,{origin:null});
    assert.match(repeat.headers.get('Location'),/buffer_error=expired/);
    return new URLSearchParams(new URL(response.headers.get('Location')).hash.slice(1));
  };

  assert.equal((await request('/health',{origin:'https://different.example'})).status,403);
  const health = await request('/health');
  assert.equal(health.status,200);
  assert.equal(health.headers.get('Access-Control-Allow-Origin'),studio);
  assert.equal((await request('/channels')).status,401);
  const warnings = context.mock.method(console,'warn',() => {});
  tokenFailure = 'invalid_client';
  assert.equal((await login()).get('buffer_error'),'client');
  assert.deepEqual(JSON.parse(warnings.mock.calls[0].arguments[0]),{
    event:'buffer_sign_in_failed',stage:'token',reason:'invalid_client'
  });
  tokenFailure = undefined;
  assert.equal((await login()).get('buffer_error'),'account');
  owner = 'OWNER@example.com';
  const handoff = (await login()).get('buffer_connection');
  assert(handoff);
  const wrongProof = Buffer.alloc(32,20).toString('base64url');
  assert.equal((await postJson('/oauth/finish',{handoff,proof:wrongProof})).status,401);
  const response = await postJson('/oauth/finish',{handoff,proof});
  ({token} = await response.json());
  assert.match(token,/^[\w-]{43}$/);
  assert.equal((await postJson('/oauth/finish',{handoff,proof})).status,401);
  const stored = env.DB.native.prepare('SELECT * FROM studio_session').get();
  assert.notEqual(stored.token_hash,token);
  assert(!stored.credentials.includes('mock-access'));

  env.DB.native.prepare('UPDATE studio_session SET access_expires=0').run();
  const channels = await (await request('/channels',{authenticated:true})).json();
  assert.equal(refreshes,1);
  assert.deepEqual(channels.channels.map(item => item.id),['avi-page','avi-x']);
  const id = crypto.randomUUID();
  function form(targets){
    const body = new FormData();
    body.set('id',id);
    body.set('caption','Caption stays with the artwork');
    targets.forEach(target => body.append('channel',target));
    body.append('image',new Blob([jpeg],{type:'image/jpeg'}),'artwork.jpg');
    return body;
  }
  assert.equal((await request('/posts',{method:'POST',authenticated:true,body:form(['personal'])})).status,403);
  const [published,duplicate] = await Promise.all([
    request('/posts',{method:'POST',authenticated:true,body:form(['avi-page','avi-x'])}),
    request('/posts',{method:'POST',authenticated:true,body:form(['avi-page','avi-x'])})
  ]);
  assert.deepEqual([published.status,duplicate.status].sort(),[200,201]);
  assert.equal(writes,2);
  const receipt = await (await request('/posts/' + id,{authenticated:true})).json();
  assert.deepEqual(receipt.channels.map(item => item.status),['sent','rejected']);
  assert.equal(receipt.channels[0].postId,'buffer-post');
  assert.match(receipt.channels[1].message,/too long/);
  const media = new URL(hostedMedia).pathname;
  assert.equal((await request(media,{origin:null,method:'HEAD'})).headers.get('Content-Type'),'image/jpeg');
  await worker.scheduled({scheduledTime:Date.now()+90_000_000},env);
  assert.equal((await request(media,{origin:null})).status,404);
  assert.equal((await request('/session',{authenticated:true,method:'DELETE'})).status,200);
  assert.equal((await request('/channels',{authenticated:true})).status,401);
  omitRefresh = true;
  const shortHandoff = (await login()).get('buffer_connection');
  assert(shortHandoff);
  ({token} = await (await postJson('/oauth/finish',{handoff:shortHandoff,proof})).json());
  assert.equal((await request('/channels',{authenticated:true})).status,200);
  env.DB.native.prepare('UPDATE studio_session SET access_expires=0').run();
  assert.equal((await request('/channels',{authenticated:true})).status,401);
  assert.equal(refreshes,1);
});
