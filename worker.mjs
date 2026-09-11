const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',enc.encode(text)));
export async function hashPassword(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256));}
function equal(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function token(req){return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gg_session='))?.slice(11)||'';}
const json=(status,value,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
const error=(status,message)=>Object.assign(Error(message),{status});
async function readBody(req){
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw error(415,'Use JSON.');
 const reader=req.body?.getReader();if(!reader)throw error(400,'Invalid request.');
 let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw error(413,'Post is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try {const b=JSON.parse(new TextDecoder().decode(bytes));if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw error(400,'Invalid request.');}
}
async function database(env,path,method='GET',body){
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw error(503,'The database is not connected yet.');
 const headers={apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
 if(!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_'))headers.Authorization='Bearer '+env.SUPABASE_SECRET_KEY;
 const res=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!res.ok){console.error('Database request failed',res.status);throw error(503,'Could not load or save this. Please try again.');}
 return res.status===204?null:res.json();
}
async function signedIn(req,env){const t=token(req);if(!/^[a-f0-9]{64}$/.test(t))return false;const rows=await database(env,'gg_sessions?token_hash=eq.'+await digest(t)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=token_hash&limit=1');return rows.length>0;}
async function route(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(req.method==='POST'&&req.headers.get('Origin')!==url.origin)return json(403,{error:'This request is not allowed.'});
 if(req.method==='GET'&&path==='/api/posts'){
   const rows=[];let offset=0;
   for(;;){const page=await database(env,`gg_posts?select=*&order=timestamp.desc,id.desc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break;offset+=page.length;}
   return json(200,rows);
 }
 if(req.method==='GET'&&path==='/api/session')return json(200,{loggedIn:await signedIn(req,env)});
 const cookieSuffix=`; HttpOnly; SameSite=Strict; Path=/${url.protocol==='https:'?'; Secure':''}`;
 if(req.method==='POST'&&path==='/api/login'){
  if(!env.ADMIN_PASSWORD_HASH||!env.ADMIN_PASSWORD_SALT)throw error(503,'Publisher login is not configured yet.');
  const b=await readBody(req);
  const ip=req.headers.get('CF-Connecting-IP')||'local';
  const allowed=await database(env,'rpc/gg_login_allowed','POST',{attempt_key:await digest(ip+env.ADMIN_PASSWORD_SALT)});
  if(!allowed)return json(429,{error:'Too many attempts. Try again in 15 minutes.'});
  if(typeof b.password!=='string'||b.password.length>1024)return json(401,{error:'That username or password is not right.'});
  const valid=equal(await hashPassword(b.password,env.ADMIN_PASSWORD_SALT),env.ADMIN_PASSWORD_HASH)&&b.username===env.ADMIN_USERNAME;
  if(!valid)return json(401,{error:'That username or password is not right.'});
  if(token(req))await database(env,'gg_sessions?token_hash=eq.'+await digest(token(req)),'DELETE');
  const t=hex(crypto.getRandomValues(new Uint8Array(32)));
  await database(env,'gg_sessions','POST',{token_hash:await digest(t),expires_at:new Date(Date.now()+8*3600000).toISOString()});
  return json(200,{loggedIn:true},{'Set-Cookie':`gg_session=${t}; Max-Age=28800${cookieSuffix}`});
 }
 if(req.method==='POST'&&path==='/api/logout'){
  if(token(req))await database(env,'gg_sessions?token_hash=eq.'+await digest(token(req)),'DELETE');
  return json(200,{loggedIn:false},{'Set-Cookie':`gg_session=; Max-Age=0${cookieSuffix}`});
 }
 if(req.method==='POST'&&path==='/api/posts'){
  if(!await signedIn(req,env))return json(401,{error:'Please log in before publishing.'});
  const b=await readBody(req),text=typeof b.text==='string'?b.text.trim():'',photoUrl=typeof b.photoUrl==='string'?b.photoUrl.trim():'';
  if(!text||text.length>5000)return json(400,{error:'Write a tip of 1–5,000 characters.'});
  if(photoUrl){try{const u=new URL(photoUrl);if(photoUrl.length>2048||u.protocol!=='https:'||u.username||u.password)throw Error();}catch{return json(400,{error:'Use a valid HTTPS photo link.'});}}
  const rows=await database(env,'gg_posts','POST',{text,photoUrl,category:b.category==='party'?'party':'gossip',timestamp:Date.now()});
  return json(201,rows[0]);
 }
 return json(404,{error:'Not found.'});
}
export default {async fetch(req,env){
 let response;try{response=await route(req,env);}catch(e){if(!e.status)console.error('Request failed');response=json(e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}
 const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 return new Response(response.body,{status:response.status,headers});
}};
