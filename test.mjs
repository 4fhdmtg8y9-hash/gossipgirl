import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{hashPassword} from './worker.mjs';
test('Cloudflare publisher authorization and Supabase requests',async()=>{
 const nativeFetch=globalThis.fetch;const posts=[],sessions=[];
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',ADMIN_USERNAME:'publisher',ADMIN_PASSWORD_SALT:'test',ADMIN_PASSWORD_HASH:await hashPassword('test-password','test'),ASSETS:{fetch:async()=>new Response('Website')}};
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.headers.apikey,'sb_secret_test');const u=new URL(url);const b=options.body?JSON.parse(options.body):null;
  if(u.pathname.endsWith('/rpc/gg_login_allowed'))return Response.json(true);
  if(u.pathname.endsWith('/gg_sessions')){if(options.method==='POST'){sessions.push(b);return Response.json([b]);}if(options.method==='DELETE'){sessions.length=0;return Response.json([]);}return Response.json(sessions.filter(s=>'eq.'+s.token_hash===u.searchParams.get('token_hash')));}
  if(u.pathname.endsWith('/gg_posts')){if(options.method==='POST'){posts.push({id:'test-id',...b});return Response.json([posts.at(-1)]);}return Response.json(posts);}
  throw Error('Unexpected database request');
 };
 let cookie='';const call=(path,body,origin='https://gossip.example')=>worker.fetch(new Request('https://gossip.example'+path,{headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})}),env);
 try{
  assert.equal((await call('/api/posts')).status,200);
  assert.equal((await call('/api/posts',{text:'unauthorized'})).status,401);
  assert.equal((await call('/api/login',{username:'publisher',password:'bad'})).status,401);
  assert.equal((await call('/api/login',{},'https://evil.example')).status,403);
  const login=await call('/api/login',{username:'publisher',password:'test-password'});assert.equal(login.status,200);cookie=login.headers.get('Set-Cookie').split(';')[0];assert.match(login.headers.get('Set-Cookie'),/Secure/);
  assert.equal((await call('/api/posts',{text:'hi',photoUrl:'javascript:alert(1)'})).status,400);
  assert.equal((await call('/api/posts',{text:'Test blast',category:'party'})).status,201);
  assert.equal((await (await call('/api/posts')).json())[0].category,'party');
  assert.equal((await call('/api/logout',{})).status,200);
  assert.equal((await call('/api/posts',{text:'no'})).status,401);
 }finally{globalThis.fetch=nativeFetch;}
});
