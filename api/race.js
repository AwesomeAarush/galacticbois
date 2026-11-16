'use strict';
/* Race relay for Mission Control: Beyond. A Vercel Function (Node.js runtime) on the game's own address.

   Why it exists. Race mode first tried public relays (MQTT over WebSocket on ports 8084, 8884, 8081, 443).
   Many school, office and filtered networks block those, and some block WebSockets altogether. This route
   uses ordinary HTTPS requests to the same site that serves the game, so it works wherever the game loads.

   It needs a small free Redis store. In Vercel: Project → Storage → Create Database → Upstash for Redis
   (Free) → Connect to this project → Redeploy. Vercel then sets KV_REST_API_URL and KV_REST_API_TOKEN
   (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). The token stays on the server; the browser never
   sees it. Without the store this route answers {store:false} and the game uses the public relays instead.

   Protocol. Each room has two message lists, "up" (players to host) and "down" (host to players).
   POST {room, pub:[{box,msg}], poll:[{box,since}]} appends messages and returns new ones:
   {got:{box:[...]}, next:{box:n}}. since = -1 asks for the current end of the list (start listening now).
   GET returns {ok:true, store:true|false}. Lists expire 6 hours after the last message. */
const ROOM=/^[A-HJ-NP-Z2-9]{5}$/,BOXES=['up','down'],TTL=6*3600,MAX_MSG=4096,MAX_PUB=25,PAGE=100;
const storeUrl=()=>(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL||'').replace(/\/+$/,'');
const storeToken=()=>process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN||'';

function reply(res,status,obj){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj));}
function readBody(req){
  if(req.body!==undefined){const b=req.body;
    if(typeof b==='string'){try{return Promise.resolve(JSON.parse(b));}catch(e){return Promise.resolve(null);}}
    if(Buffer.isBuffer(b)){try{return Promise.resolve(JSON.parse(b.toString('utf8')));}catch(e){return Promise.resolve(null);}}
    return Promise.resolve(b);}
  return new Promise(done=>{let s='';req.on('data',c=>{s+=c;if(s.length>65536){req.destroy();done(null);}});
    req.on('end',()=>{try{done(JSON.parse(s||'null'));}catch(e){done(null);}});req.on('error',()=>done(null));});}
async function redis(cmds){
  const r=await fetch(storeUrl()+'/pipeline',{method:'POST',headers:{Authorization:'Bearer '+storeToken(),'Content-Type':'application/json'},body:JSON.stringify(cmds)});
  if(!r.ok)throw new Error('store '+r.status);return r.json();}

module.exports=async function race(req,res){
  const ready=!!(storeUrl()&&storeToken());
  if(req.method==='GET'||req.method==='HEAD')return reply(res,200,{ok:true,store:ready,v:1});
  if(req.method!=='POST')return reply(res,405,{error:'Use GET or POST.'});
  if(!ready)return reply(res,503,{error:'store-not-configured'});
  const b=await readBody(req);
  if(!b||typeof b!=='object')return reply(res,400,{error:'Bad JSON.'});
  const room=String(b.room||'');if(!ROOM.test(room))return reply(res,400,{error:'Bad room code.'});
  const key=box=>`mcb:race:${room}:${box}`,cmds=[],polls=[];
  for(const p of (Array.isArray(b.pub)?b.pub:[]).slice(0,MAX_PUB)){
    if(!p||!BOXES.includes(p.box))continue;const s=JSON.stringify(p.msg);if(!s||s.length>MAX_MSG)continue;cmds.push(['RPUSH',key(p.box),s]);}
  new Set(cmds.map(c=>c[1])).forEach(k=>cmds.push(['EXPIRE',k,String(TTL)]));
  for(const q of (Array.isArray(b.poll)?b.poll:[]).slice(0,2)){
    if(!q||!BOXES.includes(q.box))continue;const since=Math.floor(Number(q.since));
    if(!(since>=0)){polls.push({box:q.box,i:cmds.length,since:-1});cmds.push(['LLEN',key(q.box)]);}
    else{polls.push({box:q.box,i:cmds.length,since});cmds.push(['LRANGE',key(q.box),String(since),String(since+PAGE-1)]);}}
  if(!cmds.length)return reply(res,200,{got:{},next:{}});
  let out;try{out=await redis(cmds);}catch(e){return reply(res,502,{error:'The game server could not reach its store.'});}
  const got={},next={};
  for(const p of polls){const x=out[p.i];if(!x||x.error)continue;
    if(p.since<0){got[p.box]=[];next[p.box]=Number(x.result)||0;}
    else{const arr=Array.isArray(x.result)?x.result:[];
      got[p.box]=arr.map(s=>{try{return JSON.parse(s);}catch(e){return null;}}).filter(Boolean);next[p.box]=p.since+arr.length;}}
  reply(res,200,{got,next});
};
