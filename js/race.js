"use strict";
/* Race mode: two to six players fly the same mission at the same time and compare scores live.

   How it connects. The host's browser opens a room with a five-character code; the others type the code.
   Two kinds of route carry the messages, and the host listens on every one that works from its network:
   1. The game server: /api/race on the same site that serves the game (api/race.js, a Vercel Function with
      a free Upstash Redis store). Plain HTTPS requests, so it works wherever the game itself loads. It has to
      be switched on once in Vercel (see README, "Race mode"); until then it reports itself as not set up.
   2. Public MQTT relays over secure WebSockets: mqtt.eclipseprojects.io (port 443), broker.emqx.io (8084),
      broker.hivemq.com (8884), test.mosquitto.org (8081). Free test services with no guarantees; some networks
      block them. The MQTT library ships with the game (js/vendor/mqtt.min.js).
   A joining player tries every route at once and keeps the first one the host answers on.
   The host keeps the room: players send progress to the host, the host sends out the leaderboard.
   Messages carry only call signs, stages and scores, and are not private.
   Overrides for testing or your own relay: ?api=/path or ?api=0, ?relay=wss://a,wss://b, window.MCB_API,
   window.MCB_RELAYS.

   Fairness. Everyone gets the same seed, so the launch window day, the order and timing of cruise events,
   whether the rare events happen, the rover landing site and the ten rock formations are the same for all.
   Small chance events during the flight are still each player's own luck.

   game.js provides window.__raceStart(mission, seed, site) and window.__raceProgress(). */
const Race=(()=>{
  const ALPH='ABCDEFGHJKMNPQRSTUVWXYZ23456789',MAX=6,SITES=['delta','floor','rim'],TOPIC='mcb-race/v3/';
  const RELAYS=['wss://mqtt.eclipseprojects.io/mqtt','wss://broker.emqx.io:8084/mqtt','wss://broker.hivemq.com:8884/mqtt','wss://test.mosquitto.org:8081/mqtt'];
  const LIBS=['js/vendor/mqtt.min.js','https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js'];
  const qs=new URLSearchParams(location.search);
  const API=qs.get('api')==='0'?null:(qs.get('api')||window.MCB_API||'/api/race');
  const relays=()=>qs.get('relay')?qs.get('relay').split(',').filter(Boolean):(window.MCB_RELAYS||RELAYS);
  const hostOf=u=>{try{return new URL(u).host;}catch(e){return u;}};
  let links=[],myId='',role=null,code='',myName='',players=[],cfg={mission:1,started:false,seed:0,site:'delta'},board=[],over=false,t0=0,tick=null,beat=null,finished=null,ov=null,lastStage='',lastDown=0,routes=[],lastSent=0,sendT=null;
  const seen=new Set();
  const esc=s=>String(s).replace(/[<>&"'`]/g,'');
  const fmtT=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const newCode=()=>Array.from({length:5},()=>ALPH[Math.random()*ALPH.length|0]).join(''),newId=()=>Math.random().toString(36).slice(2,12);
  const save=()=>{try{sessionStorage.setItem('mcb-race',JSON.stringify({code,name:myName,role,cfg,t0}));}catch(e){}};
  const fresh=m=>{if(!m||typeof m!=='object')return false;if(!m.mid)return true;if(seen.has(m.mid))return false;seen.add(m.mid);if(seen.size>4000)seen.clear();return true;};

  /* ---------- routes ---------- */
  let libP=null;
  function lib(){if(window.mqtt)return Promise.resolve(true);if(libP)return libP;
    libP=(async()=>{for(const src of LIBS){const ok=await new Promise(done=>{const el=document.createElement('script');el.src=src;el.onload=()=>done(!!window.mqtt);el.onerror=()=>{el.remove();done(false);};document.head.appendChild(el);});if(ok)return true;}libP=null;return false;})();return libP;}
  /* 'ready' | 'unset' (route exists, no store) | 'none' (no route on this host) | 'off' */
  async function apiState(){if(!API)return 'off';
    try{const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),6000);const r=await fetch(API,{cache:'no-store',signal:ctl.signal});clearTimeout(to);
      const j=await r.json().catch(()=>null);return j&&j.ok?(j.store?'ready':'unset'):'none';}catch(e){return 'none';}}
  /* the game-server route: polls the room's list every 1.2 s (2.5 s once the race runs); sends right away */
  function apiLink(room,listen){
    const L={kind:'api',label:'Game server',down:false};let since=-1,out=[],timer=null,flushT=null,closed=false,busy=false,handler=null,period=1200,fails=0;
    async function cycle(){if(closed||busy)return;busy=true;const pub=out.splice(0,20);
      try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({room,pub,poll:[{box:listen,since}]})});
        if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json(),n=j.next&&j.next[listen];
        if(typeof n==='number'){const got=(j.got&&j.got[listen])||[];since=n;got.forEach(m=>{if(handler)handler(listen,m);});}
        if(L.down){L.down=false;if(L.onup)L.onup();}fails=0;}
      catch(e){out=pub.concat(out).slice(-60);if(++fails>=3&&!L.down){L.down=true;if(L.ondown)L.ondown();}}
      busy=false;if(out.length&&!closed)later(80);}
    function later(ms){clearTimeout(flushT);flushT=setTimeout(cycle,ms);}
    L.onMsg=fn=>{handler=fn;};
    L.pub=(box,m)=>{if(closed)return;out.push({box,msg:m});later(40);};
    L.start=()=>{if(timer)return;timer=setInterval(cycle,period);cycle();};
    L.rate=ms=>{period=ms;if(timer){clearInterval(timer);timer=setInterval(cycle,period);}};
    L.close=()=>{if(closed)return;closed=true;clearInterval(timer);clearTimeout(flushT);
      if(out.length)try{fetch(API,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({room,pub:out.splice(0,20),poll:[]})});}catch(e){}};
    return L;}
  /* one public relay; resolves with a link once subscribed, or null after 8 s */
  function mqttLink(url,room,listen){return new Promise(res=>{let done=false,c;
    try{c=window.mqtt.connect(url,{clientId:'mcb_'+(myId||newId())+'_'+Math.random().toString(36).slice(2,6),keepalive:45,connectTimeout:6500,reconnectPeriod:3000,clean:true,protocolVersion:4});}catch(e){return res(null);}
    const L={kind:'relay',label:hostOf(url),url,down:false};let handler=null;
    L.pub=(box,m)=>{try{c.publish(TOPIC+room+'/'+box,JSON.stringify(m),{qos:1});}catch(e){}};
    L.onMsg=fn=>{handler=fn;};L.start=()=>{};L.rate=()=>{};L.close=()=>{try{c.end(true);}catch(e){}};
    c.on('message',(t,b)=>{const box=t.slice(t.lastIndexOf('/')+1);let m;try{m=JSON.parse(b.toString());}catch(e){return;}if(handler)handler(box,m);});
    c.on('offline',()=>{if(done&&!L.down){L.down=true;if(L.ondown)L.ondown();}});
    c.on('connect',()=>{if(!done){c.subscribe(TOPIC+room+'/'+listen,{qos:1},err=>{if(done)return;done=true;if(err){L.close();res(null);}else res(L);});}
      else if(L.down){L.down=false;if(L.onup)L.onup();}});
    c.on('error',()=>{});
    setTimeout(()=>{if(!done){done=true;L.close();res(null);}},8000);});}
  /* open every route at once; onLink(link) fires as each one opens; resolves with the report when all have settled */
  async function openRoutes(room,listen,onLink){const report=[];
    const got=l=>{if(onLink)onLink(l);else l.close();};
    await Promise.all([
      (async()=>{const st=await apiState();report.push({label:'Game server',kind:'api',st});if(st==='ready')got(apiLink(room,listen));})(),
      (async()=>{if(!relays().length)return;if(!await lib()){report.push({label:'Public relays',kind:'relay',st:'nolib'});return;}
        await Promise.all(relays().map(async u=>{const t=Date.now(),l=await mqttLink(u,room,listen);report.push({label:hostOf(u),kind:'relay',st:l?'ok':'fail',ms:Date.now()-t});if(l)got(l);}));})()]);
    const order=x=>x.kind==='api'?-1:relays().map(hostOf).indexOf(x.label);report.sort((a,b)=>order(a)-order(b));return {report};}
  const ST={ready:'ready',unset:'not set up on this site',none:'not on this site',off:'switched off',ok:'reachable',fail:'blocked or down',nolib:'library did not load'};
  const routeList=R=>`<ul class="plain routes">${R.map(r=>`<li class="${r.st==='ok'||r.st==='ready'?'ok':'no'}"><b>${r.st==='ok'||r.st==='ready'?'✓':'✗'}</b> ${esc(r.label)} <span class="dim">${ST[r.st]||r.st}${r.ms&&r.st==='ok'?` · ${r.ms} ms`:''}</span></li>`).join('')}</ul>`;
  function noRoute(R){const api=R.find(r=>r.kind==='api');
    return 'This network could not reach any race connection. '+(api&&api.st==='unset'?'The game server route exists but has no store yet: connect Upstash for Redis in Vercel (README, "Race mode"). ':api&&api.st==='none'?'This copy of the game has no game server route (it needs to be deployed on Vercel). ':'')+'Use "Check connection" for details, or try another network.';}
  const viaOK=()=>links.some(l=>!l.down);
  function linkState(){const el=document.getElementById('raceBoard');if(el)el.classList.toggle('lost',!viaOK());if(cfg.started)drawBoard(viaOK()?'':'Connection lost. Retrying…');}
  /* host: send to everyone on every route; guest: send to the host on its route */
  function out(box,m){m.mid=newId();links.forEach(l=>{if(!l.down||l.kind==='api')l.pub(box,m);});}
  const send=(id,m)=>out('down',Object.assign({to:id},m));
  const everyone=m=>out('down',m);
  async function check(){return (await openRoutes('CHECK','down')).report;}
  let session=0;

  /* ---------- the lobby and results window ---------- */
  function close(){if(ov){ov.remove();ov=null;}}
  function overlay(html){close();ov=document.createElement('div');ov.className='overlay race';ov.innerHTML=`<div class="modal race" role="dialog" aria-modal="true" aria-label="Race">${html}</div>`;document.body.appendChild(ov);return ov;}
  function open(defName){if(role){lobby();return;}
    const o=overlay(`<p class="kicker">Race mode ${typeof Help!=='undefined'?Help.q('race'):''}</p><h3>Race other players</h3>
      <p class="dim">Everyone flies the same mission at the same time, with the same launch window, events and rock formations. Highest score wins; time breaks ties.</p>
      <label class="kicker" for="rcName">Call sign</label><input id="rcName" class="txt" maxlength="18" value="${esc(defName||'Wayfarer')}" autocomplete="off">
      <div class="two" style="margin-top:6px"><div class="panel"><p class="kicker">Host a race</p><div class="choices two"><button type="button" class="opt" data-rm="1" aria-pressed="true"><b>Mission 1</b><span class="s">Orbiter</span></button><button type="button" class="opt" data-rm="2" aria-pressed="false"><b>Mission 2</b><span class="s">Rover</span></button></div>
          <button type="button" class="btn" id="rcHost">Create room</button></div>
        <div class="panel"><p class="kicker">Join a race</p><input id="rcCode" class="txt" maxlength="5" placeholder="Room code" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em">
          <button type="button" class="btn" id="rcJoin">Join</button></div></div>
      <p class="dim" id="rcMsg" role="status" style="font-size:.84rem;min-height:1.2em"></p><div id="rcRoutes"></div>
      <div class="row"><button type="button" class="ghost" id="rcCheck">Check connection</button><button type="button" class="ghost" id="rcX">Close</button></div>`);
    let m=1;o.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{m=+b.dataset.rm;o.querySelectorAll('[data-rm]').forEach(x=>x.setAttribute('aria-pressed',x===b));});
    const nm=()=>(o.querySelector('#rcName').value||'').replace(/[<>&"'`$\\]/g,'').trim().slice(0,18)||'Wayfarer',msg=t=>{const e=o.querySelector('#rcMsg');if(e)e.textContent=t;};
    const busy=v=>o.querySelectorAll('#rcHost,#rcJoin,#rcCheck').forEach(b=>b.disabled=v);
    o.querySelector('#rcX').onclick=close;
    o.querySelector('#rcCheck').onclick=async()=>{busy(true);msg('Checking every route from this network (up to 8 seconds)…');const R=await check();busy(false);
      const n=R.filter(r=>r.st==='ok'||r.st==='ready').length;msg(n?`Race mode can connect from here (${n} route${n>1?'s':''}). Host and players only need one route in common.`:noRoute(R));
      const el=o.querySelector('#rcRoutes');if(el)el.innerHTML=routeList(R);};
    o.querySelector('#rcHost').onclick=()=>{busy(true);msg('Opening a room on every route that works (up to 8 seconds)…');host(nm(),m).catch(e=>{busy(false);msg(e.message);if(e.report){const el=o.querySelector('#rcRoutes');if(el)el.innerHTML=routeList(e.report);}});};
    o.querySelector('#rcJoin').onclick=()=>{const c=(o.querySelector('#rcCode').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
      if(c.length!==5)return msg('Room codes have five letters and digits.');if(/[01]/.test(c))return msg('Room codes never use O, 0, I, L or 1. Check the code with the host.');
      busy(true);msg('Looking for room '+c+' on every route (up to 10 seconds)…');join(c,nm()).catch(e=>{busy(false);msg(e.message);if(e.report){const el=o.querySelector('#rcRoutes');if(el)el.innerHTML=routeList(e.report);}});};}
  function lobby(note){if(cfg.started&&!over)return;const list=role==='host'?players.filter(p=>!p.gone).map(p=>({name:p.name,host:p.host})):board.length?board:[];
    const via=links.filter(l=>!l.down).map(l=>l.label);
    const o=overlay(`<p class="kicker">Race room</p><h3 class="mono" style="letter-spacing:.2em">${code}</h3>
      <p class="dim">${role==='host'?'Share this code. Start when everyone is in.':'You are in. Waiting for the host to start.'} Mission ${cfg.mission}.</p>
      <ul class="plain racelist">${list.map(p=>`<li>${esc(p.name)}${p.host?' <span class="pill info">host</span>':''}</li>`).join('')||'<li class="dim">Connecting…</li>'}</ul>
      <p class="dim mono" style="font-size:.6rem">${role==='host'?'Open on':'Connected through'}: ${via.map(esc).join(' · ')||'—'}</p>
      ${note?`<p class="dim" style="font-size:.84rem">${note}</p>`:''}
      <div class="row">${role==='host'?`<button type="button" class="btn" id="rcGo" ${list.length<2?'disabled':''}>Start race</button>`:''}<button type="button" class="ghost" id="rcLeave">Leave</button></div>
      ${role==='host'&&list.length<2?'<p class="dim" style="font-size:.8rem">At least one other player has to join. Keep this window open: the room lives in your browser.</p>':''}`);
    const g=o.querySelector('#rcGo');if(g)g.onclick=start;o.querySelector('#rcLeave').onclick=()=>{leave();close();};}

  /* ---------- host ---------- */
  async function host(name,mission){const tok=++session;myName=name;myId=newId();cfg={mission,started:false,seed:0,site:'delta'};over=false;finished=null;code=newCode();seen.clear();links=[];
    let firstUp;const first=new Promise(r=>firstUp=r);
    const all=openRoutes(code,'up',l=>{if(tok!==session){l.close();return;}
      l.onMsg((box,m)=>{if(box==='up'&&role==='host'&&fresh(m))onHost(m);});l.ondown=linkState;l.onup=linkState;links.push(l);l.start();firstUp(true);
      if(role==='host'&&!cfg.started)lobby();});
    await Promise.race([first,all]);
    if(tok!==session)return;
    if(!links.length){const R=await all;const e=new Error(noRoute(R.report));e.report=R.report;throw e;}
    role='host';players=[{id:myId,name,host:true,prog:{}}];save();
    all.then(R=>{if(tok===session){routes=R.report;if(role==='host'&&!cfg.started)lobby();}});
    clearInterval(beat);beat=setInterval(()=>{if(role!=='host')return;if(!cfg.started)lobbyMsg();},8000);
    lobby();}
  function onHost(m){if(!m.id)return;
    if(m.t==='hello'){let p=players.find(x=>x.id===m.id)||players.find(x=>x.name===m.name&&!x.host&&(x.gone||cfg.started));
      if(cfg.started&&!p){send(m.id,{t:'refused',why:'This race has already started. Ask the host to open a new room.'});return;}
      if(!p&&players.filter(x=>!x.gone).length>=MAX){send(m.id,{t:'refused',why:'The room is full (six players).'});return;}
      if(p){p.id=m.id;p.gone=false;}else{let n=esc(m.name).slice(0,18)||'Player';while(players.some(x=>x.name===n))n=n.slice(0,15)+' '+(players.length+1);p={id:m.id,name:n,prog:{}};players.push(p);}
      p.seen=Date.now();send(m.id,{t:'welcome',name:p.name,code,cfg,started:cfg.started,elapsed:cfg.started?(Date.now()-t0)/1000:0});
      if(cfg.started)publish(true);else{lobby();lobbyMsg();}return;}
    const p=players.find(x=>x.id===m.id);if(!p)return;p.seen=Date.now();
    if(m.t==='left'){p.gone=true;if(!cfg.started){players=players.filter(x=>x!==p);lobby();lobbyMsg();}else publish(true);return;}
    if(m.t==='prog'){p.gone=false;p.prog=m.p||{};publish();}}
  const lobbyMsg=()=>everyone({t:'lobby',players:players.filter(p=>!p.gone).map(p=>({name:p.name,host:!!p.host})),cfg});
  function start(){if(role!=='host'||players.filter(p=>!p.gone).length<2)return;players=players.filter(p=>!p.gone);cfg.started=true;cfg.seed=(Math.random()*2**31)|0;cfg.site=SITES[cfg.seed%3];save();
    everyone({t:'start',cfg});begin();}
  /* the host builds the leaderboard from everyone's latest progress and sends it out (at most every 2 s) */
  function publish(now){if(role!=='host')return;players[0].prog=local();
    players.forEach(p=>{if(!p.host&&cfg.started&&p.seen&&Date.now()-p.seen>30000)p.gone=true;});
    const before=over;board=players.map(p=>({name:p.name,host:!!p.host,gone:!!p.gone,...p.prog}));
    over=cfg.started&&board.every(r=>r.done||r.gone)&&board.some(r=>r.done);drawBoard();if(over)results();
    const go=()=>{lastSent=Date.now();sendT=null;everyone({t:'board',rows:board,over});};
    if(now||over!==before||Date.now()-lastSent>2000){clearTimeout(sendT);go();}else if(!sendT)sendT=setTimeout(go,2000-(Date.now()-lastSent));}

  /* ---------- guest ---------- */
  async function join(c,name){const tok=++session;myName=name;code=c;over=false;finished=null;myId=newId();seen.clear();links=[];
    const hello={t:'hello',id:myId,name,mid:newId()},opened=[];let report=[];
    const w=await new Promise(done=>{let fin=false;const end=v=>{if(!fin){fin=true;done(v);}};
      openRoutes(c,'down',l=>{if(fin||tok!==session){l.close();return;}opened.push(l);
        l.onMsg((box,m)=>{if(box==='down'&&m&&m.to===myId&&(m.t==='welcome'||m.t==='refused'))end({m,l});});l.pub('up',hello);l.start();})
        .then(R=>{report=R.report;if(!opened.length)end({none:true});});
      setTimeout(()=>end(null),12000);});
    opened.forEach(l=>{if(!w||l!==w.l)l.close();});
    if(tok!==session){if(w&&w.l)w.l.close();return;}
    if(!w||w.none){const e=new Error(w&&w.none?noRoute(report):`No answer from room ${c}. Check the code, and that the host still has the race window open. The host and you need one route in common:`);e.report=report;throw e;}
    if(w.m.t==='refused'){w.l.close();throw new Error(w.m.why);}
    links=[w.l];routes=report;role='guest';myName=w.m.name;cfg=w.m.cfg;lastDown=Date.now();fresh(w.m);save();
    w.l.onMsg((box,m)=>{if(box==='down'&&fresh(m)){lastDown=Date.now();if(document.getElementById('raceBoard')&&!viaOK())linkState();onGuest(m);}});
    w.l.ondown=linkState;w.l.onup=()=>{linkState();w.l.pub('up',{t:'hello',id:myId,name:myName,mid:newId()});};
    clearInterval(beat);beat=setInterval(()=>{if(role!=='guest')return;const q=(Date.now()-lastDown)/1000;
      if(q>30){const el=document.getElementById('raceBoard');if(el)el.classList.add('lost');if(cfg.started)drawBoard(`No word from the host for ${Math.round(q)} s. The host may have closed the game.`);}},5000);
    if(w.m.started){t0=Date.now()-w.m.elapsed*1000;startTick();drawBoard();close();}else lobby();}
  function onGuest(m){if(m.to&&m.to!==myId)return;
    if(m.t==='lobby'){cfg=m.cfg;board=m.players;if(!cfg.started)lobby();}
    if(m.t==='start'&&!cfg.started){cfg=m.cfg;save();begin();}
    if(m.t==='board'){board=m.rows||[];over=!!m.over;const el=document.getElementById('raceBoard');if(el)el.classList.remove('lost');drawBoard();if(over)results();}
    if(m.t==='bye')lostLink({type:'host-left'});}

  /* ---------- the race itself ---------- */
  function begin(){close();let n=3;const o=document.createElement('div');o.className='racecount';document.body.appendChild(o);
    const step=()=>{o.textContent=n>0?n:'GO';if(n<0){o.remove();t0=Date.now();save();startTick();if(window.__raceStart)window.__raceStart(cfg.mission,cfg.seed,cfg.site,myName);return;}n--;setTimeout(step,800);};step();}
  function local(){const p=window.__raceProgress?window.__raceProgress():{};return Object.assign({},p,{t:t0?(Date.now()-t0)/1000:0},finished||{});}
  function startTick(){clearInterval(tick);tick=setInterval(report,5000);links.forEach(l=>l.rate(2500));report();}
  function report(){if(!role||!cfg.started)return;if(role==='host')publish();else out('up',{t:'prog',id:myId,p:local()});drawBoard();}
  function stage(){const p=window.__raceProgress?window.__raceProgress():{};if(p.stage!==lastStage){lastStage=p.stage;report();}}
  function finish(r){if(!role||!cfg.started||finished)return;finished={done:true,final:r.score,cls:r.cls,failed:!!r.failed,t:(Date.now()-t0)/1000};report();}
  function lostLink(e){const el=document.getElementById('raceBoard');if(el)el.classList.add('lost');
    const why=e&&e.type==='host-left'?'The host left. The race is over; your mission carries on.':'Connection to the race relay dropped. Reconnecting…';
    if(typeof toast==='function')toast(why);board=board.map(r=>r);drawBoard(why);}
  function rows(){const R=(board.length?board:[{name:myName,...local()}]).slice();
    R.sort((a,b)=>(b.done?b.final:b.score||0)-(a.done?a.final:a.score||0)||(a.t||0)-(b.t||0));return R;}
  function drawBoard(note){let el=document.getElementById('raceBoard');if(!role||!cfg.started){if(el)el.remove();return;}
    if(!el){el=document.createElement('aside');el.id='raceBoard';el.className='raceboard min';document.body.appendChild(el);document.body.classList.add('racing');el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.a==='min'){el.classList.toggle('min');drawBoard();}if(b.dataset.a==='res')results(true);if(b.dataset.a==='leave'){leave();}});}
    const me=myName,R=rows(),mine=R.findIndex(r=>r.name===me)+1;
    el.innerHTML=`<div class="row between"><p class="kicker">Race ${code} · ${mine?`you ${mine} of ${R.length}`:''} · ${fmtT(t0?(Date.now()-t0)/1000:0)}</p><span class="row"><button type="button" class="ghost sm" data-a="min" aria-label="Show or hide the leaderboard">${el.classList.contains('min')?'▴':'▾'}</button></span></div>
      <ol class="rb">${R.map((r,i)=>`<li class="${r.name===me?'me':''} ${r.gone?'gone':''}"><b class="num">${i+1}</b><span class="nm">${esc(r.name)}</span><span class="st">${r.done?(r.failed?'Failed':'Finished'):r.gone?'Left':esc(r.stage||'Starting')}${r.done||r.gone?'':` · ${r.step||0}/${r.of||'?'}`}</span><b class="num sc" title="${r.done?'Final score':'Score so far'}">${Math.round(r.done?r.final:r.score||0)}</b></li>`).join('')}</ol><p class="dim mono" style="font-size:.54rem;margin:0">Scores are provisional until each player reaches the debrief.</p>
      ${note?`<p class="dim" style="font-size:.74rem">${note}</p>`:''}<div class="row">${over?'<button type="button" class="btn sm" data-a="res">Results</button>':''}<button type="button" class="ghost sm" data-a="leave">Leave race</button></div>`;}
  function results(force){if(ov&&!force)return;const R=rows();
    const o=overlay(`<p class="kicker">Race ${code} · mission ${cfg.mission}</p><h3>Results</h3>
      <div class="tw"><table><tr><th>#</th><th>Call sign</th><th>Score</th><th>Time</th><th></th></tr>${R.map((r,i)=>`<tr class="${r.name===myName?'me':''}"><td class="num">${i+1}</td><td>${esc(r.name)}</td><td class="num">${Math.round(r.done?r.final:r.score||0)}</td><td class="num">${r.done?fmtT(r.t||0):'—'}</td><td>${r.done?(r.failed?'mission failed':esc(r.cls||'')):r.gone?'left':'did not finish'}</td></tr>`).join('')}</table></div>
      <p class="dim" style="font-size:.84rem">Ranking: final score, then time. A failed mission keeps the score it earned.</p>
      <div class="row"><button type="button" class="ghost" id="rcX">Close</button><button type="button" class="btn" id="rcL">Leave race</button></div>`);
    o.querySelector('#rcX').onclick=close;o.querySelector('#rcL').onclick=()=>{leave();close();};}
  function leave(){session++;clearInterval(tick);clearInterval(beat);clearTimeout(sendT);
    try{if(role==='host')everyone({t:'bye'});else if(role)out('up',{t:'left',id:myId});}catch(e){}
    const L=links;setTimeout(()=>L.forEach(l=>l.close()),500);
    links=[];role=null;players=[];board=[];cfg={mission:1,started:false,seed:0,site:'delta'};finished=null;over=false;
    try{sessionStorage.removeItem('mcb-race');}catch(e){}const el=document.getElementById('raceBoard');if(el)el.remove();document.body.classList.remove('racing');}
  /* after a page refresh a guest can rejoin the same race (the host keeps its place on the board) */
  function pending(){try{return JSON.parse(sessionStorage.getItem('mcb-race'));}catch(e){return null;}}
  async function rejoin(){const p=pending();if(!p||p.role!=='guest')return false;await join(p.code,p.name);return true;}
  addEventListener('pagehide',()=>{try{if(role==='guest'){out('up',{t:'left',id:myId});links.forEach(l=>l.close());}}catch(e){}});
  return {open,host,join,leave,finish,stage,results,rejoin,pending,check,get relay(){return links.map(l=>l.label).join(',');},get routes(){return routes;},active:()=>!!role&&cfg.started,inRoom:()=>!!role,get code(){return code;},get board(){return board;},get role(){return role;},get cfg(){return cfg;}};
})();
window.Race=Race;
