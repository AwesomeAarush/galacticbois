"use strict";
/* Race mode: two to six players fly the same mission at the same time and compare scores live.

   How it connects. The host's browser opens a room with a short code; the others type the code. Browsers then
   talk directly to each other (WebRTC data channels) through PeerJS. PeerJS's free public server only
   introduces the browsers; game data goes peer to peer. No accounts, no keys, no game server.
   The host relays: every player sends progress to the host, and the host sends everyone the leaderboard.
   To use your own PeerJS server instead, set window.MCB_PEER={host,port,path} before this file loads, or add
   ?peerhost=...&peerport=... to the address (the tests do this).

   Fairness. Everyone gets the same seed, so the launch window day, the order and timing of cruise events,
   whether the rare events happen, the rover landing site and the ten rock formations are the same for all.
   Small chance events during the flight are still each player's own luck.

   game.js provides window.__raceStart(mission, seed, site) and window.__raceProgress(). */
const Race=(()=>{
  const LIB='https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',PREFIX='mcb-race-',ALPH='ABCDEFGHJKMNPQRSTUVWXYZ23456789',MAX=6,SITES=['delta','floor','rim'];
  const qs=new URLSearchParams(location.search);
  let peer=null,role=null,code='',myName='',hostConn=null,players=[],cfg={mission:1,started:false,seed:0,site:'delta'},board=[],over=false,t0=0,tick=null,finished=null,ov=null,lastStage='';
  const esc=s=>String(s).replace(/[<>&"'`]/g,'');
  const fmtT=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  function opts(){const o={debug:0},M=window.MCB_PEER||{},h=qs.get('peerhost')||M.host;
    if(h){o.host=h;o.port=+(qs.get('peerport')||M.port||443);o.path=qs.get('peerpath')||M.path||'/';o.secure=o.port===443;}
    if(qs.get('peerlocal'))o.config={iceServers:[]};return o;}
  function lib(){return new Promise((res,rej)=>{if(window.Peer)return res();const s=document.createElement('script');s.src=LIB;s.onload=()=>res();
    s.onerror=()=>rej(new Error('The networking library did not load. Check your internet connection and try again.'));document.head.appendChild(s);});}
  const newCode=()=>Array.from({length:5},()=>ALPH[Math.random()*ALPH.length|0]).join('');
  const save=()=>{try{sessionStorage.setItem('mcb-race',JSON.stringify({code,name:myName,role,cfg,t0}));}catch(e){}};
  const send=(c,m)=>{try{if(c&&c.open)c.send(m);}catch(e){}};
  const everyone=m=>players.forEach(p=>{if(p.conn)send(p.conn,m);});

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
      <p class="dim" id="rcMsg" style="font-size:.84rem;min-height:1.2em"></p>
      <div class="row"><button type="button" class="ghost" id="rcX">Close</button></div>`);
    let m=1;o.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{m=+b.dataset.rm;o.querySelectorAll('[data-rm]').forEach(x=>x.setAttribute('aria-pressed',x===b));});
    const nm=()=>(o.querySelector('#rcName').value||'').replace(/[<>&"'`$\\]/g,'').trim().slice(0,18)||'Wayfarer',msg=t=>{o.querySelector('#rcMsg').textContent=t;};
    o.querySelector('#rcX').onclick=close;
    o.querySelector('#rcHost').onclick=()=>{msg('Opening a room…');host(nm(),m).catch(e=>msg(e.message));};
    o.querySelector('#rcJoin').onclick=()=>{const c=(o.querySelector('#rcCode').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==5)return msg('Room codes have five letters and digits.');msg('Connecting…');join(c,nm()).catch(e=>msg(e.message));};}
  function lobby(note){if(cfg.started&&!over)return;const list=role==='host'?players.map(p=>({name:p.name,host:p.host})):board.length?board:[];
    const o=overlay(`<p class="kicker">Race room</p><h3 class="mono" style="letter-spacing:.2em">${code}</h3>
      <p class="dim">${role==='host'?'Share this code. Start when everyone is in.':'Waiting for the host to start.'} Mission ${cfg.mission}.</p>
      <ul class="plain racelist">${list.map(p=>`<li>${esc(p.name)}${p.host?' <span class="pill info">host</span>':''}</li>`).join('')||'<li class="dim">Connecting…</li>'}</ul>
      ${note?`<p class="dim" style="font-size:.84rem">${note}</p>`:''}
      <div class="row">${role==='host'?`<button type="button" class="btn" id="rcGo" ${players.length<2?'disabled':''}>Start race</button>`:''}<button type="button" class="ghost" id="rcLeave">Leave</button></div>
      ${role==='host'&&players.length<2?'<p class="dim" style="font-size:.8rem">At least one other player has to join.</p>':''}`);
    const g=o.querySelector('#rcGo');if(g)g.onclick=start;o.querySelector('#rcLeave').onclick=()=>{leave();close();};}

  /* ---------- host ---------- */
  async function host(name,mission){await lib();myName=name;cfg={mission,started:false,seed:0,site:'delta'};over=false;finished=null;
    for(let tries=0;tries<4;tries++){code=newCode();const ok=await new Promise(res=>{peer=new window.Peer(PREFIX+code,opts());
        peer.on('open',()=>res(true));peer.on('error',e=>{if(e.type==='unavailable-id'){peer.destroy();res(false);}else if(!role)res(e);else lostLink(e);});});
      if(ok===true)break;if(ok&&ok.type)throw new Error('Could not open a room: '+(ok.message||ok.type));}
    role='host';players=[{id:'host',name,host:true,prog:{}}];save();
    peer.on('connection',conn=>{conn.on('data',m=>onHost(conn,m));conn.on('close',()=>{const p=players.find(x=>x.conn===conn);if(p){p.conn=null;p.gone=true;publish();if(!cfg.started)players=players.filter(x=>x!==p);lobbyIfWaiting();}});});
    lobby();}
  function onHost(conn,m){if(!m||typeof m!=='object')return;
    if(m.t==='hello'){let p=players.find(x=>x.name===m.name&&x.gone);
      if(cfg.started&&!p){send(conn,{t:'refused',why:'This race has already started.'});setTimeout(()=>conn.close(),300);return;}
      if(!p&&players.length>=MAX){send(conn,{t:'refused',why:'The room is full.'});setTimeout(()=>conn.close(),300);return;}
      if(p){p.conn=conn;p.gone=false;}else{let n=esc(m.name).slice(0,18)||'Player';while(players.some(x=>x.name===n))n=n.slice(0,15)+' '+(players.length+1);p={id:conn.peer,name:n,conn,prog:{}};players.push(p);}
      send(conn,{t:'welcome',name:p.name,code,cfg,started:cfg.started,elapsed:cfg.started?(Date.now()-t0)/1000:0});publish();lobbyIfWaiting();return;}
    const p=players.find(x=>x.conn===conn);if(!p)return;
    if(m.t==='prog'){p.prog=m.p||{};publish();}}
  function lobbyIfWaiting(){if(role==='host'&&!cfg.started)lobby();everyone({t:'lobby',players:players.map(p=>({name:p.name,host:!!p.host})),cfg});}
  function start(){if(role!=='host'||players.length<2)return;cfg.started=true;cfg.seed=(Math.random()*2**31)|0;cfg.site=SITES[cfg.seed%3];save();
    everyone({t:'start',cfg});begin();}
  /* the host builds the leaderboard from everyone's latest progress and sends it out */
  function publish(){if(role!=='host')return;players[0].prog=local();
    board=players.map(p=>({name:p.name,host:!!p.host,gone:!!p.gone,...p.prog}));
    over=cfg.started&&board.every(r=>r.done||r.gone)&&board.some(r=>r.done);
    everyone({t:'board',rows:board,over});drawBoard();if(over)results();}

  /* ---------- guest ---------- */
  async function join(c,name){await lib();myName=name;code=c;over=false;finished=null;
    await new Promise((res,rej)=>{peer=new window.Peer(opts());const to=setTimeout(()=>rej(new Error('No answer from that room. Check the code.')),15000);
      peer.on('error',e=>{clearTimeout(to);if(!role)rej(new Error(e.type==='peer-unavailable'?'No room with that code.':'Connection problem: '+(e.message||e.type)));else lostLink(e);});
      peer.on('open',()=>{hostConn=peer.connect(PREFIX+c,{reliable:true});
        hostConn.on('open',()=>{send(hostConn,{t:'hello',name});});
        hostConn.on('data',m=>{if(m&&m.t==='refused'&&!role){clearTimeout(to);try{peer.destroy();}catch(e){}rej(new Error(m.why));return;}if(m&&m.t==='welcome'){clearTimeout(to);role='guest';myName=m.name;cfg=m.cfg;save();if(m.started){t0=Date.now()-m.elapsed*1000;startTick();drawBoard();close();}else lobby();res();}else onGuest(m);});
        hostConn.on('close',()=>{if(role)lostLink({type:'host-left'});});});});}
  function onGuest(m){if(!m||typeof m!=='object')return;
    if(m.t==='refused'){role=null;try{peer.destroy();}catch(e){}const o=ov&&ov.querySelector('#rcMsg');if(o)o.textContent=m.why;return;}
    if(m.t==='lobby'){cfg=m.cfg;board=m.players;if(!cfg.started)lobby();}
    if(m.t==='start'){cfg=m.cfg;save();begin();}
    if(m.t==='board'){board=m.rows||[];over=!!m.over;drawBoard();if(over)results();}}

  /* ---------- the race itself ---------- */
  function begin(){close();let n=3;const o=document.createElement('div');o.className='racecount';document.body.appendChild(o);
    const step=()=>{o.textContent=n>0?n:'GO';if(n<0){o.remove();t0=Date.now();save();startTick();if(window.__raceStart)window.__raceStart(cfg.mission,cfg.seed,cfg.site,myName);return;}n--;setTimeout(step,800);};step();}
  function local(){const p=window.__raceProgress?window.__raceProgress():{};return Object.assign({},p,{t:t0?(Date.now()-t0)/1000:0},finished||{});}
  function startTick(){clearInterval(tick);tick=setInterval(report,4000);report();}
  function report(){if(!role||!cfg.started)return;if(role==='host')publish();else send(hostConn,{t:'prog',p:local()});drawBoard();}
  function stage(){const p=window.__raceProgress?window.__raceProgress():{};if(p.stage!==lastStage){lastStage=p.stage;report();}}
  function finish(r){if(!role||!cfg.started||finished)return;finished={done:true,final:r.score,cls:r.cls,failed:!!r.failed,t:(Date.now()-t0)/1000};report();}
  function lostLink(e){const el=document.getElementById('raceBoard');if(el)el.classList.add('lost');
    const why=e&&e.type==='host-left'?'The host left. The race is over; your mission carries on.':'Connection to the race was lost.';
    if(typeof toast==='function')toast(why);board=board.map(r=>r);drawBoard(why);}
  function rows(){const R=(board.length?board:[{name:myName,...local()}]).slice();
    R.sort((a,b)=>(b.done?b.final:b.score||0)-(a.done?a.final:a.score||0)||(a.t||0)-(b.t||0));return R;}
  function drawBoard(note){let el=document.getElementById('raceBoard');if(!role||!cfg.started){if(el)el.remove();return;}
    if(!el){el=document.createElement('aside');el.id='raceBoard';el.className='raceboard min';document.body.appendChild(el);document.body.classList.add('racing');el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.a==='min'){el.classList.toggle('min');drawBoard();}if(b.dataset.a==='res')results(true);if(b.dataset.a==='leave'){leave();}});}
    const me=myName,R=rows(),mine=R.findIndex(r=>r.name===me)+1;
    el.innerHTML=`<div class="row between"><p class="kicker">Race ${code} · ${mine?`you ${mine} of ${R.length}`:''} · ${fmtT(t0?(Date.now()-t0)/1000:0)}</p><span class="row"><button type="button" class="ghost sm" data-a="min" aria-label="Show or hide the leaderboard">${el.classList.contains('min')?'▴':'▾'}</button></span></div>
      <ol class="rb">${R.map((r,i)=>`<li class="${r.name===me?'me':''} ${r.gone?'gone':''}"><b class="num">${i+1}</b><span class="nm">${esc(r.name)}</span><span class="st">${r.done?(r.failed?'Failed':'Finished'):r.gone?'Left':esc(r.stage||'Starting')}${r.done||r.gone?'':` · ${r.step||0}/${r.of||'?'}`}</span><b class="num sc">${Math.round(r.done?r.final:r.score||0)}</b></li>`).join('')}</ol>
      ${note?`<p class="dim" style="font-size:.74rem">${note}</p>`:''}<div class="row">${over?'<button type="button" class="btn sm" data-a="res">Results</button>':''}<button type="button" class="ghost sm" data-a="leave">Leave race</button></div>`;}
  function results(force){if(ov&&!force)return;const R=rows();
    const o=overlay(`<p class="kicker">Race ${code} · mission ${cfg.mission}</p><h3>Results</h3>
      <div class="tw"><table><tr><th>#</th><th>Call sign</th><th>Score</th><th>Time</th><th></th></tr>${R.map((r,i)=>`<tr class="${r.name===myName?'me':''}"><td class="num">${i+1}</td><td>${esc(r.name)}</td><td class="num">${Math.round(r.done?r.final:r.score||0)}</td><td class="num">${r.done?fmtT(r.t||0):'—'}</td><td>${r.done?(r.failed?'mission failed':esc(r.cls||'')):r.gone?'left':'did not finish'}</td></tr>`).join('')}</table></div>
      <p class="dim" style="font-size:.84rem">Ranking: final score, then time. A failed mission keeps the score it earned.</p>
      <div class="row"><button type="button" class="ghost" id="rcX">Close</button><button type="button" class="btn" id="rcL">Leave race</button></div>`);
    o.querySelector('#rcX').onclick=close;o.querySelector('#rcL').onclick=()=>{leave();close();};}
  function leave(){clearInterval(tick);try{if(hostConn)hostConn.close();players.forEach(p=>{if(p.conn)p.conn.close();});if(peer)peer.destroy();}catch(e){}
    peer=null;role=null;hostConn=null;players=[];board=[];cfg={mission:1,started:false,seed:0,site:'delta'};finished=null;over=false;
    try{sessionStorage.removeItem('mcb-race');}catch(e){}const el=document.getElementById('raceBoard');if(el)el.remove();document.body.classList.remove('racing');}
  /* after a page refresh a guest can rejoin the same race (the host keeps its place on the board) */
  function pending(){try{return JSON.parse(sessionStorage.getItem('mcb-race'));}catch(e){return null;}}
  async function rejoin(){const p=pending();if(!p||p.role!=='guest')return false;await join(p.code,p.name);return true;}
  addEventListener('beforeunload',()=>{if(role==='host'&&cfg.started)everyone({t:'board',rows:board,over:false});});
  return {open,host,join,leave,finish,stage,results,rejoin,pending,active:()=>!!role&&cfg.started,inRoom:()=>!!role,get code(){return code;},get board(){return board;},get role(){return role;},get cfg(){return cfg;}};
})();
window.Race=Race;
