"use strict";
/* Rover expedition: a top-down drive across a piece of Jezero's western delta front.
   Self-contained: Rover.start(options) draws into a host element and resolves with the expedition results.
   The terrain is SIMULATED. It is generated from noise and laid out after published descriptions of the area
   (a delta scarp of layered sedimentary rock in the west, an igneous crater floor, carbonate-bearing rock toward
   the rim). It is not HiRISE, CTX or MOLA data, and the chemistry numbers are game values.

   Structure: world (terrain, rocks, formations) -> simulation step (physics, energy) -> drawing -> panels. */
const Rover=(()=>{
  const W=2600,H=1900,TS=.5;                         /* world size in metres, terrain texture scale */
  const VIEW_W=880;                                   /* metres of ground across the view */
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),sm=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);},mix=(a,b,t)=>a+(b-a)*t;
  const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  /* 2D value noise */
  const P=new Uint8Array(512),V=new Float32Array(256);{const r=rng(4242),p=[...Array(256).keys()];for(let i=255;i>0;i--){const j=r()*(i+1)|0;[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)P[i]=p[i&255];for(let i=0;i<256;i++)V[i]=r();}
  function n2(x,y){const xi=Math.floor(x),yi=Math.floor(y);let u=x-xi,v=y-yi;u=u*u*(3-2*u);v=v*v*(3-2*v);const X=xi&255,Y=yi&255,a=V[P[P[X]+Y]],b=V[P[P[X+1]+Y]],c=V[P[P[X]+Y+1]],d=V[P[P[X+1]+Y+1]];return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
  const fbm=(x,y,o=4)=>{let s=0,a=.5,t=0;for(let i=0;i<o;i++){s+=a*n2(x,y);t+=a;x=x*2.03+11.3;y=y*2.03+5.7;a*=.5;}return s/t;};

  /* ---------- the ground ---------- */
  const CRATERS=[[1500,620,150,15],[1950,1450,115,11],[1250,1520,92,8]];
  const scarpX=y=>760+140*Math.sin(y/260)+60*Math.sin(y/90+1);
  const plateau=(x,y)=>sm(scarpX(y)+75,scarpX(y)-75,x);          /* 1 on top of the delta, 0 on the crater floor */
  function height(x,y){let h=20*fbm(x/420,y/420)+4*fbm(x/90+7,y/90,2)+plateau(x,y)*30+sm(2200,2600,x)*42;
    for(const [cx,cy,r,d] of CRATERS){const q=Math.hypot(x-cx,y-cy)/r;if(q<1.35)h+=q<1?-d*(1-q*q)+3*sm(.8,1,q):3*(1-sm(1,1.35,q));}return h;}
  const sandAt=(x,y)=>sm(.56,.66,fbm(x/260+31,y/200+8,3))*(1-plateau(x,y)*.7);
  const TERRAIN={firm:'Firm regolith',sand:'Loose sand',bed:'Layered bedrock',slope:'Steep slope'};

  /* rock classes. comp = simulated element abundances (weight %, as oxides) */
  const CLS={
    mud:{n:'Fine-grained layered rock',sed:true,label:'Sedimentary mudstone',col:'#b58d6c',comp:{Si:46,Fe:12,Mg:6,Al:14,Ca:4,S:2},
      obs:['Paper-thin horizontal layers.','Grains too fine to see.','Breaks into flat plates.']},
    sand:{n:'Coarse layered rock',sed:true,label:'Sedimentary sandstone',col:'#c39a72',comp:{Si:55,Fe:9,Mg:5,Al:11,Ca:5,S:1},
      obs:['Layers that tilt and cut across each other.','Sand-sized grains, a few rounded pebbles.','Stands out as a ledge.']},
    bas:{n:'Dark massive rock',sed:false,label:'Igneous basalt, rich in olivine',col:'#5b4a44',comp:{Si:42,Fe:20,Mg:18,Al:7,Ca:6,S:1},
      obs:['No layering at all.','Dark, with small green-grey crystals.','Pitted by small holes.']},
    carb:{n:'Pale banded rock',sed:false,label:'Carbonate-bearing rock',col:'#cdb9a0',comp:{Si:22,Fe:10,Mg:22,Al:3,Ca:14,S:1},
      obs:['Pale tan bands along the slope.','Rough, etched surface.','Sits high, near the old shoreline level.']},
    sulf:{n:'White vein in fractured rock',sed:false,label:'Sulfate vein',col:'#e8e2d6',comp:{Si:18,Fe:6,Mg:5,Al:3,Ca:26,S:30},
      obs:['Bright white material filling cracks.','Softer than the rock around it.','Cuts across the host rock.']}};
  const ELS=['Si','Fe','Mg','Al','Ca','S'],ELN={Si:'Silicon',Fe:'Iron',Mg:'Magnesium',Al:'Aluminium',Ca:'Calcium',S:'Sulfur'};
  const FORM=[['mud',690,900,'Scarp ledge'],['mud',725,430,'North terrace'],['sand',815,1250,'Fan toe slab'],['sand',650,1570,'South bench'],
    ['bas',1300,1010,'Floor block'],['bas',1720,830,'Dark ridge'],['bas',2010,1240,'East knob'],['carb',2385,610,'Upper pale band'],['carb',2455,1160,'Rim shelf'],
    ['sulf',1585,705,'Crater wall crack'],['sulf',1228,1548,'Pit fracture']];
  const SITES={delta:{n:'Delta front',base:[1010,1060],rocks:1.5,d:'Close to the layered scarp. Boulder-strewn.'},
    floor:{n:'Crater floor',base:[1760,1130],rocks:.75,d:'Flat and open. A long drive to the scarp.'},
    rim:{n:'East bench',base:[2240,860],rocks:1.1,d:'High ground by the pale rocks. Steep approaches.'}};

  let world=null;
  function build(siteKey){
    const site=SITES[siteKey]||SITES.delta,r=rng(siteKey.length*977+13),B=site.base;
    /* boulders: scattered, denser under the scarp and on crater rims */
    const rocks=[];let tries=0;
    while(rocks.length<170*site.rocks&&tries++<6000){const x=40+r()*(W-80),y=40+r()*(H-80),p=plateau(x,y);
      let w=.25+.9*sm(.1,.5,p)*(1-sm(.5,.95,p))+.3*fbm(x/300+5,y/300,2);for(const [cx,cy,cr] of CRATERS){const q=Math.hypot(x-cx,y-cy)/cr;if(q>.85&&q<1.25)w+=.7;}
      if(r()>w)continue;if(Math.hypot(x-B[0],y-B[1])<130)continue;if(FORM.some(f=>Math.hypot(x-f[1],y-f[2])<55))continue;
      rocks.push({x,y,r:5+r()*r()*16,s:r()});}
    const forms=FORM.map((f,i)=>({id:i,cls:f[0],x:f[1],y:f[2],name:f[3],r:17,seen:false,photo:false,scan:null,guess:null,sampled:false,seed:i*7+3}));
    /* terrain picture, hill-shaded from the height function */
    const tw=W*TS|0,th=H*TS|0,c=document.createElement('canvas');c.width=tw;c.height=th;const x=c.getContext('2d'),im=x.createImageData(tw,th),d=im.data;
    const hrow=new Float32Array(tw+1),hprev=new Float32Array(tw+1);
    for(let j=0;j<th;j++){const wy=j/TS;for(let i=0;i<=tw;i++)hrow[i]=height(i/TS,wy);
      for(let i=0;i<tw;i++){const wx=i/TS,h=hrow[i],dx=hrow[i+1]-h,dy=j?h-hprev[i]:0,p=plateau(wx,wy),sd=sandAt(wx,wy);
        let R=176,G=110,Bc=74;const tex=fbm(wx/22,wy/22,3);
        R=mix(R,160,p*.7);G=mix(G,112,p*.7);Bc=mix(Bc,86,p*.7);                         /* delta top: greyer */
        if(p>.04&&p<.96){const band=.5+.5*Math.sin(h*1.9+fbm(wx/60,wy/60,2)*3);R=mix(R,band>.5?196:128,.55);G=mix(G,band>.5?150:92,.55);Bc=mix(Bc,band>.5?112:70,.55);}   /* layered scarp */
        const rim=sm(2250,2500,wx);R=mix(R,202,rim*.5);G=mix(G,170,rim*.5);Bc=mix(Bc,138,rim*.5);  /* pale rim rock */
        if(sd>.02){const rip=.5+.5*Math.sin((wx*.55+wy*.9)/3.2+fbm(wx/70,wy/70,2)*8);R=mix(R,206+rip*14,sd*.85);G=mix(G,158+rip*10,sd*.85);Bc=mix(Bc,112+rip*8,sd*.85);}
        for(const [cx,cy,cr] of CRATERS){const q=Math.hypot(wx-cx,wy-cy)/cr;if(q<1){R*=.86+.1*q;G*=.86+.1*q;Bc*=.88+.1*q;}}
        const sh=clamp(.86+(dx*-.62+dy*-.5)*.5,.42,1.32)*(.9+.2*tex);
        const k=(j*tw+i)*4;d[k]=clamp(R*sh,0,255);d[k+1]=clamp(G*sh,0,255);d[k+2]=clamp(Bc*sh,0,255);d[k+3]=255;}
      hprev.set(hrow);}
    x.putImageData(im,0,0);
    /* boulders with a shadow and a lit edge */
    for(const b of rocks){const px=b.x*TS,py=b.y*TS,rr=b.r*TS;x.fillStyle='rgba(30,16,10,.45)';x.beginPath();x.ellipse(px+rr*.5,py+rr*.45,rr*1.05,rr*.8,0,0,7);x.fill();
      const g=x.createRadialGradient(px-rr*.35,py-rr*.4,rr*.1,px,py,rr);g.addColorStop(0,b.s>.5?'#b08a6e':'#8f6f5c');g.addColorStop(1,b.s>.5?'#5c4336':'#4a362d');x.fillStyle=g;
      x.beginPath();for(let a=0;a<7;a++){const an=a/7*6.283,q=rr*(.82+.3*Math.sin(b.s*40+a*2.1));x.lineTo(px+Math.cos(an)*q,py+Math.sin(an)*q);}x.closePath();x.fill();}
    /* the base: landing pad, habitat, solar field, antenna */
    {const bx=B[0]*TS,by=B[1]*TS;x.fillStyle='rgba(60,52,48,.55)';x.beginPath();x.arc(bx,by,46,0,7);x.fill();x.strokeStyle='rgba(242,184,79,.8)';x.lineWidth=1.5;x.setLineDash([6,5]);x.beginPath();x.arc(bx,by,46,0,7);x.stroke();x.setLineDash([]);
      x.fillStyle='rgba(20,12,8,.4)';x.beginPath();x.ellipse(bx-14,by-8,22,17,0,0,7);x.fill();
      const g=x.createRadialGradient(bx-24,by-18,2,bx-18,by-12,20);g.addColorStop(0,'#f4f1ea');g.addColorStop(1,'#9c9892');x.fillStyle=g;x.beginPath();x.arc(bx-18,by-12,18,0,7);x.fill();x.strokeStyle='#5d5a55';x.lineWidth=1;x.stroke();
      x.fillStyle='#c9c5bd';x.fillRect(bx-3,by-16,14,8);                                             /* airlock tunnel */
      for(let i=0;i<3;i++){x.fillStyle='#1b2a52';x.fillRect(bx+8+i*11,by+10,9,22);x.strokeStyle='#8fa6d8';x.lineWidth=.6;x.strokeRect(bx+8+i*11,by+10,9,22);x.beginPath();x.moveTo(bx+8+i*11,by+21);x.lineTo(bx+17+i*11,by+21);x.stroke();}
      x.strokeStyle='#d8d8d8';x.lineWidth=1.4;x.beginPath();x.moveTo(bx-30,by+22);x.lineTo(bx-30,by+8);x.stroke();x.fillStyle='#eee';x.beginPath();x.arc(bx-30,by+7,5,Math.PI,0);x.fill();
      x.fillStyle='#d9a441';x.fillRect(bx+20,by-26,12,10);x.fillStyle='#6b6964';x.fillRect(bx+22,by-30,3,4);x.fillRect(bx+27,by-30,3,4);}
    const fog=document.createElement('canvas');fog.width=tw;fog.height=th;const fx=fog.getContext('2d');fx.fillStyle='rgba(8,5,4,.88)';fx.fillRect(0,0,tw,th);
    return {site,siteKey,base:{x:B[0],y:B[1]},rocks,forms,tex:c,fog,fx,cells:new Uint8Array(26*19),seenCells:0};}

  /* a close-up picture of a rock, for the camera and the scanner */
  function rockArt(c,cls,seed){const x=c.getContext('2d'),w=c.width,h=c.height,r=rng(seed*31+7),K=CLS[cls];
    const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'#c7885e');g.addColorStop(1,'#8a5536');x.fillStyle=g;x.fillRect(0,0,w,h);
    for(let i=0;i<900;i++){x.fillStyle=`rgba(${60+r()*120|0},${40+r()*70|0},${30+r()*40|0},.25)`;x.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}
    x.save();x.translate(w/2,h*.56);x.fillStyle='rgba(20,10,6,.45)';x.beginPath();x.ellipse(14,h*.2,w*.36,h*.1,0,0,7);x.fill();
    x.beginPath();const pts=[];for(let a=0;a<14;a++){const an=a/14*6.283,q=(.78+.25*r());pts.push([Math.cos(an)*w*.34*q,Math.sin(an)*h*.3*q]);}pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();x.fillStyle=K.col;x.fill();x.save();x.clip();
    if(cls==='mud')for(let y=-h;y<h;y+=5){x.strokeStyle=`rgba(70,45,30,${.25+r()*.3})`;x.lineWidth=.8;x.beginPath();x.moveTo(-w,y+r()*1.5);x.lineTo(w,y+r()*1.5);x.stroke();}
    if(cls==='sand'){for(let k=0;k<5;k++){const y0=-h*.3+k*h*.14,tilt=(k%2?1:-1)*(.12+r()*.2);for(let j=0;j<6;j++){x.strokeStyle='rgba(80,50,30,.4)';x.lineWidth=1;x.beginPath();x.moveTo(-w,y0+j*4-w*tilt);x.lineTo(w,y0+j*4+w*tilt);x.stroke();}x.strokeStyle='rgba(50,30,20,.6)';x.lineWidth=1.6;x.beginPath();x.moveTo(-w,y0);x.lineTo(w,y0);x.stroke();}
      for(let i=0;i<26;i++){x.fillStyle='rgba(230,205,170,.7)';x.beginPath();x.arc((r()-.5)*w*.6,(r()-.5)*h*.5,1.5+r()*2.5,0,7);x.fill();}}
    if(cls==='bas'){for(let i=0;i<130;i++){x.fillStyle=r()<.55?'rgba(150,170,120,.75)':'rgba(20,14,12,.7)';x.beginPath();x.arc((r()-.5)*w*.66,(r()-.5)*h*.56,.8+r()*2.2,0,7);x.fill();}}
    if(cls==='carb'){for(let y=-h;y<h;y+=11){x.fillStyle=`rgba(${225+r()*20|0},${205+r()*20|0},${170+r()*20|0},.45)`;x.fillRect(-w,y+Math.sin(y)*2,w*2,5);}for(let i=0;i<160;i++){x.fillStyle='rgba(90,70,55,.35)';x.fillRect((r()-.5)*w*.66,(r()-.5)*h*.56,2,1);}}
    if(cls==='sulf'){x.fillStyle='#7a5d4c';x.fillRect(-w,-h,w*2,h*2);x.strokeStyle='#f3efe6';x.lineCap='round';for(let k=0;k<4;k++){x.lineWidth=3+r()*5;x.beginPath();let px=-w*.4,py=(r()-.5)*h*.5;x.moveTo(px,py);for(let j=0;j<7;j++){px+=w*.12;py+=(r()-.5)*h*.16;x.lineTo(px,py);}x.stroke();}}
    x.restore();const sh=x.createLinearGradient(-w*.3,-h*.3,w*.3,h*.3);sh.addColorStop(0,'rgba(255,240,220,.22)');sh.addColorStop(1,'rgba(0,0,0,.35)');x.fillStyle=sh;x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();x.fill();x.restore();}

  /* ---------- one expedition ---------- */
  function start(opt){return new Promise(resolve=>{
    const host=opt.root,load=opt.loadout||{},bigBat=load.battery==='large',wide=load.wheels==='wide',sol=opt.sol||1;
    world=build(opt.site||'delta');const w=world,B=w.base;
    const S={x:B.x+34,y:B.y+10,a:-.3,v:0,e:100,cond:100,dist:0,t:0,path:[[B.x+34,B.y+10]],log:[],samples:[],photos:0,emergency:false,left:false,done:false,stranded:false,
      alert:0,drill:null,panel:null,map:false,keys:{},msg:'',msgT:0};
    const CAP=bigBat?1.4:1,VMAX=(bigBat?40:46),COST=.0085/CAP*(wide?1.08:1);
    const lmst=()=>{const m=9*60+S.t*1.2;return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.floor(m%60)).padStart(2,'0')}`;};
    const say=(t)=>{S.log.unshift(`${lmst()} ${t}`);S.msg=t;S.msgT=3.5;logEl.innerHTML=S.log.slice(0,30).map(l=>`<div><b>›</b> ${l}</div>`).join('');};
    const distBase=()=>Math.hypot(S.x-B.x,S.y-B.y),returnCost=()=>distBase()*COST*1.4*(S.emergency?.75:1)+1.5;
    const near=(range=75)=>{let best=null,bd=1e9;for(const f of w.forms){const d=Math.hypot(S.x-f.x,S.y-f.y)-f.r;if(d<range&&d<bd){bd=d;best=f;}}return best;};
    const explored=()=>w.seenCells/w.cells.length;
    const O=()=>{const scans=w.forms.filter(f=>f.scan).length,right=w.forms.filter(f=>f.scan&&f.guess===f.cls),kinds=new Set(right.map(f=>f.cls));
      return {main:[['Deploy the rover',S.left],['Explore the region',explored()>=.22,`${Math.round(explored()*100)}% mapped`],['Analyse 3 formations',scans>=3,`${scans} / 3`],['Collect 2 samples',S.samples.length>=2,`${S.samples.length} / 2`],['Return to base',S.done&&!S.stranded]],
        opt:[['Photograph a layered outcrop',w.forms.some(f=>f.photo&&CLS[f.cls].sed)],['Find 6 formations',w.forms.filter(f=>f.seen).length>=6,`${w.forms.filter(f=>f.seen).length} / 6`],['Tell two rock types apart',kinds.size>=2,`${kinds.size} / 2`],['Dock with 20% battery',S.done&&!S.stranded&&S.e>=20]]};};

    host.innerHTML=`<div class="rover"><div class="rvmain"><div class="rvwrap"><canvas id="rvc" tabindex="0" aria-label="Rover view. Drive with W A S D."></canvas>
        <div class="rvbanner" id="rvban"></div><div class="rvpanel" id="rvpanel" hidden></div><div class="rvmap" id="rvmap" hidden><canvas id="rvmc"></canvas><p class="mono">Regional map · simulated terrain · M to close</p></div>
        <div class="rvpad" aria-label="Touch controls"><button data-k="KeyA">◀</button><div><button data-k="KeyW">▲</button><button data-k="KeyS">▼</button></div><button data-k="KeyD">▶</button><button data-k="Space" class="wide">Brake</button></div></div>
      <div class="rvkeys mono"><span><b>W A S D</b> drive</span><span><b>Space</b> brake</span><span><b>E</b> interact</span><span><b>I</b> instruments</span><span><b>M</b> map</span></div></div>
      <div class="rvside"><div class="panel"><div class="row between"><p class="kicker">Rover</p><span class="pill info" id="rvclock"></span></div><div id="rvstat"></div>
          <div class="row"><button class="ghost" id="rvI">Instruments</button><button class="ghost" id="rvM">Map</button><button class="ghost" id="rvE">Interact</button></div>
          <button class="ghost" id="rvR" aria-pressed="false">Emergency return</button></div>
        <div class="panel"><p class="kicker">Objectives</p><div id="rvobj"></div></div>
        <div class="panel"><p class="kicker">Expedition log</p><div class="log" id="rvlog"></div></div></div></div>`;
    const cv=host.querySelector('#rvc'),ctx=cv.getContext('2d'),statEl=host.querySelector('#rvstat'),objEl=host.querySelector('#rvobj'),logEl=host.querySelector('#rvlog'),panelEl=host.querySelector('#rvpanel'),mapEl=host.querySelector('#rvmap'),banEl=host.querySelector('#rvban');
    let cam={x:S.x,y:S.y},raf=0,last=performance.now(),uiT=0,alive=true;

    /* ----- input ----- */
    const kd=e=>{if(!alive)return;if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const c=e.code;
      if(['KeyW','KeyA','KeyS','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(c)){S.keys[c]=true;e.preventDefault();}
      if(e.repeat)return;if(c==='KeyE'){interact();e.preventDefault();}if(c==='KeyI'){togglePanel();e.preventDefault();}if(c==='KeyM'){toggleMap();e.preventDefault();}if(c==='Escape'){closePanel();if(S.map)toggleMap();}};
    const ku=e=>{S.keys[e.code]=false;};
    addEventListener('keydown',kd);addEventListener('keyup',ku);
    host.querySelectorAll('.rvpad button').forEach(b=>{const on=e=>{S.keys[b.dataset.k]=true;e.preventDefault();},off=()=>{S.keys[b.dataset.k]=false;};
      b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',off);b.addEventListener('pointercancel',off);});
    host.querySelector('#rvI').onclick=()=>togglePanel();host.querySelector('#rvM').onclick=()=>toggleMap();host.querySelector('#rvE').onclick=()=>interact();
    host.querySelector('#rvR').onclick=()=>{S.emergency=!S.emergency;host.querySelector('#rvR').setAttribute('aria-pressed',S.emergency);if(S.emergency){closePanel();say('Emergency return: instruments off, speed limited, heading for base.');}else say('Emergency return cancelled.');};
    function cleanup(){alive=false;cancelAnimationFrame(raf);removeEventListener('keydown',kd);removeEventListener('keyup',ku);window.__rover=null;}

    /* ----- instruments ----- */
    function closePanel(){S.panel=null;panelEl.hidden=true;panelEl.innerHTML='';cv.focus();}
    function togglePanel(){if(S.panel){closePanel();return;}if(S.emergency){say('Instruments are off in emergency return.');return;}S.panel='main';drawPanel();}
    function drawPanel(){const f=near(),can=f&&Math.abs(S.v)<2;panelEl.hidden=false;
      panelEl.innerHTML=`<div class="row between"><p class="kicker">Instrument panel</p><button class="hx" id="rpx" aria-label="Close">×</button></div>
        <p>${f?`Target in range: <b>${f.name}</b>`:'No formation in range. Drive closer to a marked outcrop.'}${f&&!can?' <span class="dim">Stop the rover first.</span>':''}</p>
        <div class="row"><button class="ghost" id="rpC" ${can?'':'disabled'}>Camera · 0.6%</button><button class="ghost" id="rpS" ${can?'':'disabled'}>Laser scanner · 2.5% ${Help.q('libs')}</button></div>
        <p class="kicker" style="margin-top:8px">Sample tubes ${S.samples.length} / 6 ${Help.q('sample')}</p>
        <div class="tw"><table>${S.samples.map(s=>`<tr><td class="num">${s.id}</td><td>${s.site}<div class="dim" style="font-size:.76rem">${s.time} · ${s.grid} · ${s.cls}</div></td></tr>`).join('')||'<tr><td class="dim">Empty. Press E beside a formation to drill.</td></tr>'}</table></div>
        <p class="kicker" style="margin-top:8px">Analyses</p><div class="tw"><table>${w.forms.filter(x=>x.scan).map(x=>`<tr><td>${x.name}</td><td class="num">${ELS.map(e=>`${e} ${x.scan.v[e].toFixed(0)}`).join(' · ')}</td><td>${x.guess?CLS[x.guess].label:'<span class="dim">unclassified</span>'}</td></tr>`).join('')||'<tr><td class="dim">None yet.</td></tr>'}</table></div>`;
      panelEl.querySelector('#rpx').onclick=closePanel;if(can){panelEl.querySelector('#rpC').onclick=()=>photo(f);panelEl.querySelector('#rpS').onclick=()=>scanAim(f);}}
    function photo(f){S.e=Math.max(0,S.e-.6);const first=!f.photo;f.photo=true;f.seen=true;if(first){S.photos++;say(`Photographed ${f.name}.`);}
      panelEl.innerHTML=`<div class="row between"><p class="kicker">Camera · ${f.name}</p><button class="hx" id="rpx" aria-label="Close">×</button></div><canvas id="rpimg" width="420" height="250" class="rvimg"></canvas>
        <p class="kicker">Observations ${Help.q('geology')}</p><ul class="plain">${CLS[f.cls].obs.map(o=>`<li>${o}</li>`).join('')}</ul><div class="row"><button class="ghost" id="rpB">Back</button></div>`;
      rockArt(panelEl.querySelector('#rpimg'),f.cls,f.seed);panelEl.querySelector('#rpx').onclick=closePanel;panelEl.querySelector('#rpB').onclick=drawPanel;}
    /* aim: a spot drifts across the rock face; fire when the reticle is on it */
    function scanAim(f){if(S.e<3){say('Not enough charge to fire the laser.');return;}
      panelEl.innerHTML=`<div class="row between"><p class="kicker">Laser scanner · ${f.name}</p><button class="hx" id="rpx" aria-label="Close">×</button></div>
        <div class="aimwrap"><canvas id="rpimg" width="420" height="250" class="rvimg"></canvas><canvas id="rpaim" width="420" height="250" class="rvaim"></canvas></div>
        <p class="dim" style="font-size:.86rem">Move the reticle onto the clean spot of rock and fire. A hit on dust gives a noisy reading.</p><div class="row"><button class="btn" id="rpF">Fire laser</button><button class="ghost" id="rpB">Back</button></div>`;
      rockArt(panelEl.querySelector('#rpimg'),f.cls,f.seed);const ac=panelEl.querySelector('#rpaim'),ax=ac.getContext('2d');let mx=210,my=125,t0=performance.now(),live=true;
      const tgt=t=>[210+Math.sin(t*.9+f.seed)*70+Math.sin(t*2.3)*22,125+Math.cos(t*.7+f.seed*2)*42+Math.sin(t*1.9)*14];
      const mv=e=>{const r=ac.getBoundingClientRect();mx=(e.clientX-r.left)/r.width*420;my=(e.clientY-r.top)/r.height*250;};ac.addEventListener('pointermove',mv);ac.addEventListener('pointerdown',mv);
      const loop=()=>{if(!live||!ac.isConnected)return;const t=(performance.now()-t0)/1000,[tx,ty]=tgt(t);
        if(S.keys.KeyA||S.keys.ArrowLeft)mx-=3;if(S.keys.KeyD||S.keys.ArrowRight)mx+=3;if(S.keys.KeyW||S.keys.ArrowUp)my-=3;if(S.keys.KeyS||S.keys.ArrowDown)my+=3;mx=clamp(mx,0,420);my=clamp(my,0,250);
        ax.clearRect(0,0,420,250);ax.strokeStyle='rgba(134,201,148,.9)';ax.lineWidth=1.5;ax.beginPath();ax.arc(tx,ty,13,0,7);ax.stroke();ax.setLineDash([3,3]);ax.beginPath();ax.arc(tx,ty,26,0,7);ax.stroke();ax.setLineDash([]);
        ax.strokeStyle='#ea6f3c';ax.lineWidth=2;ax.beginPath();ax.moveTo(mx-16,my);ax.lineTo(mx-5,my);ax.moveTo(mx+5,my);ax.lineTo(mx+16,my);ax.moveTo(mx,my-16);ax.lineTo(mx,my-5);ax.moveTo(mx,my+5);ax.lineTo(mx,my+16);ax.stroke();
        ac._d=Math.hypot(mx-tx,my-ty);requestAnimationFrame(loop);};loop();
      const fire=()=>{live=false;const q=clamp(1-(ac._d||99)/60,0,1);scanResult(f,q);};
      panelEl.querySelector('#rpF').onclick=fire;ac.addEventListener('dblclick',fire);panelEl.querySelector('#rpx').onclick=()=>{live=false;closePanel();};panelEl.querySelector('#rpB').onclick=()=>{live=false;drawPanel();};
      S.fire=fire;}
    function scanResult(f,q){S.fire=null;S.e=Math.max(0,S.e-2.5);const r=rng(f.seed*91+(S.t*10|0)),true_=CLS[f.cls].comp,v={};
      for(const e of ELS)v[e]=Math.max(0,true_[e]+(r()-.5)*2*(2+(1-q)*14));
      const first=!f.scan;if(!f.scan||q>f.scan.q)f.scan={v,q};f.seen=true;if(first)say(`Laser analysis of ${f.name} recorded.`);
      const s=f.scan,mx=Math.max(...ELS.map(e=>s.v[e]),30);
      panelEl.innerHTML=`<div class="row between"><p class="kicker">Analysis · ${f.name}</p><button class="hx" id="rpx" aria-label="Close">×</button></div>
        <div class="row between"><span class="pill ${s.q>.66?'go':s.q>.33?'warn':'nogo'}">${s.q>.66?'Clean spectrum':s.q>.33?'Partly on dust':'Mostly dust: noisy'}</span><span class="mono dim" style="font-size:.6rem">SIMULATED MEASUREMENT · WEIGHT %</span></div>
        <div class="elbars">${ELS.map(e=>`<div><span>${ELN[e]}</span><i><b style="width:${s.v[e]/mx*100}%"></b></i><b class="num">${s.v[e].toFixed(1)}</b></div>`).join('')}</div>
        ${first?'':'<p class="dim" style="font-size:.82rem">This rock was already analysed. A repeat can sharpen the reading but adds no new science.</p>'}
        <p class="kicker">Field classification ${Help.q('libs')}</p><div class="choices">${Object.keys(CLS).map(k=>`<button class="choice" data-g="${k}" aria-pressed="${f.guess===k}"><b>${CLS[k].label}</b></button>`).join('')}</div>
        <div class="row"><button class="ghost" id="rpB">Back</button><button class="ghost" id="rpA">Scan again · 2.5%</button></div>`;
      panelEl.querySelector('#rpx').onclick=closePanel;panelEl.querySelector('#rpB').onclick=drawPanel;panelEl.querySelector('#rpA').onclick=()=>scanAim(f);
      panelEl.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{f.guess=b.dataset.g;panelEl.querySelectorAll('[data-g]').forEach(x=>x.setAttribute('aria-pressed',x===b));say(`${f.name} logged as: ${CLS[f.guess].label.toLowerCase()}.`);});}
    function interact(){if(S.panel==='aim'||S.fire){if(S.fire)S.fire();return;}
      if(distBase()<70&&S.left){dock();return;}
      const f=near(34);if(!f){say(distBase()<70?'Drive out to begin the expedition.':'Nothing to interact with here.');return;}
      if(S.emergency){say('Sampling is off in emergency return.');return;}
      if(f.sampled){say(`${f.name} has already been sampled.`);return;}if(S.samples.length>=6){say('All six sample tubes are full.');return;}
      if(Math.abs(S.v)>2){say('Stop the rover before drilling.');return;}if(S.e<4){say('Not enough charge to drill.');return;}
      S.drill={f,t:0};say(`Drilling ${f.name}. Hold still.`);}
    function finishDrill(f){S.e=Math.max(0,S.e-3);f.sampled=true;f.seen=true;const id=`JZ-${String(sol).padStart(2,'0')}-${String(S.samples.length+1).padStart(2,'0')}`;
      S.samples.push({id,form:f.id,site:f.name,grid:`E ${String(Math.round(f.x)).padStart(4,'0')} N ${String(Math.round(H-f.y)).padStart(4,'0')}`,time:`Sol ${sol} ${lmst()} LMST`,cls:f.guess?CLS[f.guess].label:'Unclassified',truth:f.cls,right:f.guess===f.cls,analysis:f.scan?Object.fromEntries(ELS.map(e=>[e,+f.scan.v[e].toFixed(1)])):null});
      say(`Sample ${id} sealed from ${f.name}.`);if(S.panel)drawPanel();}
    async function dock(){const o=O(),miss=o.main.slice(0,4).filter(x=>!x[1]).length;
      if(miss&&!S.confirm){S.confirm=true;say(`${miss} objective${miss>1?'s':''} still open. Press E again to dock anyway.`);setTimeout(()=>{S.confirm=false;},5000);return;}
      S.done=true;S.v=0;say('Docked. Expedition complete.');end();}
    function end(){const o=O();cleanup();draw();
      resolve({site:w.siteKey,dist:S.dist,battery:S.e,cond:S.cond,stranded:S.stranded,explored:explored(),photos:S.photos,found:w.forms.filter(f=>f.seen).length,
        scans:w.forms.filter(f=>f.scan).map(f=>({name:f.name,cls:f.cls,guess:f.guess,q:f.scan.q,v:Object.fromEntries(ELS.map(e=>[e,+f.scan.v[e].toFixed(1)]))})),
        samples:S.samples.slice(),log:S.log.slice(0,60),main:o.main.map(x=>[x[0],!!x[1]]),opt:o.opt.map(x=>[x[0],!!x[1]]),clock:lmst()});}
    function toggleMap(){S.map=!S.map;mapEl.hidden=!S.map;if(S.map)drawMap();}
    function drawMap(){const c=host.querySelector('#rvmc'),r=mapEl.getBoundingClientRect(),mw=Math.min(r.width-24,(r.height-50)*W/H);c.width=mw;c.height=mw*H/W;const x=c.getContext('2d'),k=mw/W;
      x.drawImage(w.tex,0,0,c.width,c.height);x.drawImage(w.fog,0,0,c.width,c.height);
      x.strokeStyle='rgba(143,200,218,.9)';x.lineWidth=1.5;x.beginPath();S.path.forEach((p,i)=>i?x.lineTo(p[0]*k,p[1]*k):x.moveTo(p[0]*k,p[1]*k));x.stroke();
      x.fillStyle='#f2b84f';x.strokeStyle='#f2b84f';x.beginPath();x.arc(B.x*k,B.y*k,5,0,7);x.fill();x.font='10px "Martian Mono",monospace';x.fillText('BASE',B.x*k+8,B.y*k+4);
      for(const f of w.forms)if(f.seen){x.fillStyle=f.sampled?'#86c994':f.scan?'#8fc8da':'#efe6d9';x.beginPath();x.moveTo(f.x*k,f.y*k-5);x.lineTo(f.x*k+5,f.y*k+4);x.lineTo(f.x*k-5,f.y*k+4);x.fill();x.fillText(f.name,f.x*k+8,f.y*k+3);}
      x.save();x.translate(S.x*k,S.y*k);x.rotate(S.a);x.fillStyle='#ea6f3c';x.beginPath();x.moveTo(9,0);x.lineTo(-6,-5);x.lineTo(-6,5);x.fill();x.restore();
      x.fillStyle='#a39686';x.fillText('white: seen   blue: analysed   green: sampled',8,c.height-8);}

    /* ----- simulation ----- */
    function step(dt){if(S.done||S.stranded)return;S.t+=dt;const K=S.keys,busy=!!S.panel||S.map;
      let fwd=!busy&&(K.KeyW||K.ArrowUp),rev=!busy&&(K.KeyS||K.ArrowDown),lt=!busy&&(K.KeyA||K.ArrowLeft),rt=!busy&&(K.KeyD||K.ArrowRight),brake=K.Space;
      /* emergency return drives itself toward base; any key takes control back for that moment */
      if(S.emergency&&!busy&&!fwd&&!rev&&!lt&&!rt&&!brake){const d=distBase();if(d>55){let da=Math.atan2(B.y-S.y,B.x-S.x)-S.a;da=Math.atan2(Math.sin(da),Math.cos(da));lt=da<-.06;rt=da>.06;fwd=Math.abs(da)<1.1||Math.abs(S.v)<6;}else brake=true;}
      const sd=sandAt(S.x,S.y),hx=height(S.x+4,S.y)-height(S.x-4,S.y),hy=height(S.x,S.y+4)-height(S.x,S.y-4),grade=(hx*Math.cos(S.a)+hy*Math.sin(S.a))/8,steep=Math.hypot(hx,hy)/8;
      const sandSlow=wide?.82:.6,sandCost=wide?1.45:2.3;
      let vmax=VMAX*mix(1,sandSlow,sd)*clamp(1-Math.max(0,grade)*1.6,.35,1)*(S.emergency?.6:1)*(.5+.5*S.cond/100);
      if(S.drill){S.v*=Math.exp(-dt*8);if(fwd||rev){S.drill=null;say('Drilling cancelled: the rover moved.');}else{S.drill.t+=dt;if(S.drill.t>=2.6){const f=S.drill.f;S.drill=null;finishDrill(f);}}}
      else{if(fwd)S.v+=26*dt;else if(rev)S.v-=20*dt;else S.v*=Math.exp(-dt*.9);if(brake)S.v*=Math.exp(-dt*7);S.v=clamp(S.v,-vmax*.45,vmax);
        const turn=(rt?1:0)-(lt?1:0);S.a+=turn*1.5*dt*(.4+.6*Math.min(1,Math.abs(S.v)/18))*(S.v<-1?-1:1);}
      let nx=S.x+Math.cos(S.a)*S.v*dt,ny=S.y+Math.sin(S.a)*S.v*dt;
      /* collisions: boulders, formations, the habitat, the map edge */
      const hit=(cx,cy,cr)=>{const d=Math.hypot(nx-cx,ny-cy),m=cr+11;if(d<m){const sp=Math.abs(S.v);if(sp>15){S.cond=Math.max(5,S.cond-(sp-15)*.6);say('Impact. Rover condition reduced.');}nx=cx+(nx-cx)/d*m;ny=cy+(ny-cy)/d*m;S.v*=.35;}};
      for(const b of w.rocks)if(Math.abs(b.x-nx)<40&&Math.abs(b.y-ny)<40)hit(b.x,b.y,b.r);for(const f of w.forms)hit(f.x,f.y,f.r);hit(B.x-36,B.y-24,34);
      if(nx<30||nx>W-30||ny<30||ny>H-30){nx=clamp(nx,30,W-30);ny=clamp(ny,30,H-30);S.v*=.3;if(!S.edge){S.edge=true;say('Edge of the mapped area. Turn back.');setTimeout(()=>S.edge=false,6000);}}
      const moved=Math.hypot(nx-S.x,ny-S.y);S.x=nx;S.y=ny;S.dist+=moved;
      S.e=Math.max(0,S.e-moved*COST*mix(1,sandCost,sd)*(1+Math.max(0,grade)*7)*(S.emergency?.72:1)-dt*.012);
      if(steep>.5&&moved>.2)S.cond=Math.max(5,S.cond-dt*.5);
      S.terr=steep>.5?'slope':sd>.5?'sand':plateau(S.x,S.y)>.05&&plateau(S.x,S.y)<.95?'bed':'firm';
      if(!S.left&&distBase()>85){S.left=true;say('Rover deployed. Driving on battery.');}
      const lp=S.path[S.path.length-1];if(Math.hypot(S.x-lp[0],S.y-lp[1])>14)S.path.push([S.x,S.y]);
      /* reveal the map */
      const fx=w.fx,g=fx.createRadialGradient(S.x*TS,S.y*TS,110*TS,S.x*TS,S.y*TS,330*TS);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');fx.globalCompositeOperation='destination-out';fx.fillStyle=g;fx.beginPath();fx.arc(S.x*TS,S.y*TS,330*TS,0,7);fx.fill();fx.globalCompositeOperation='source-over';
      const ci=clamp(S.x/W*26|0,0,25),cj=clamp(S.y/H*19|0,0,18);for(let j=cj-1;j<=cj+1;j++)for(let i=ci-1;i<=ci+1;i++)if(i>=0&&j>=0&&i<26&&j<19&&!w.cells[j*26+i]){w.cells[j*26+i]=1;w.seenCells++;}
      for(const f of w.forms)if(!f.seen&&Math.hypot(S.x-f.x,S.y-f.y)<150){f.seen=true;say(`Outcrop sighted: ${f.name}.`);}
      /* energy alerts, compared with the cost of driving home */
      const margin=S.e-returnCost(),lv=S.e<=0?3:margin<4?2:margin<14?1:0;
      if(lv>S.alert&&S.left){say(['','Battery margin is thin. Check the return estimate.','Battery is barely enough to reach base.',''][lv]||'');if(lv>=2&&typeof SFX!=='undefined')SFX.alarm();}S.alert=lv;
      if(S.e<=0){S.stranded=true;S.v=0;say('Battery exhausted. The rover is stranded.');setTimeout(end,1800);}
      S.msgT-=dt;}

    /* ----- drawing ----- */
    function draw(){const dpr=Math.min(1.5,devicePixelRatio||1),cw=cv.clientWidth||800,ch=Math.round(cw*.6);if(cv.width!==Math.round(cw*dpr)){cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);}
      const z=cv.width/VIEW_W,vw=VIEW_W,vh=cv.height/z;cam.x=clamp(cam.x,vw/2,W-vw/2);cam.y=clamp(cam.y,vh/2,H-vh/2);const ox=cam.x-vw/2,oy=cam.y-vh/2;
      ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(w.tex,ox*TS,oy*TS,vw*TS,vh*TS,0,0,cv.width,cv.height);
      ctx.setTransform(z,0,0,z,-ox*z,-oy*z);
      /* wheel tracks */
      ctx.strokeStyle='rgba(60,34,22,.42)';ctx.lineWidth=2;for(const off of[-7,7]){ctx.beginPath();for(let i=0;i<S.path.length;i++){const p=S.path[i],q=S.path[Math.min(i+1,S.path.length-1)],an=Math.atan2(q[1]-p[1],q[0]-p[0])+Math.PI/2;const px=p[0]+Math.cos(an)*off,py=p[1]+Math.sin(an)*off;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
      /* formations */
      const nf=near();
      for(const f of w.forms){if(Math.abs(f.x-cam.x)>vw/2+60||Math.abs(f.y-cam.y)>vh/2+60)continue;const K=CLS[f.cls],r=rng(f.seed);
        ctx.fillStyle='rgba(25,12,8,.4)';ctx.beginPath();ctx.ellipse(f.x+8,f.y+7,f.r*1.25,f.r*.9,0,0,7);ctx.fill();
        ctx.fillStyle=K.col;ctx.beginPath();for(let a=0;a<9;a++){const an=a/9*6.283,q=f.r*(.85+.3*r());ctx.lineTo(f.x+Math.cos(an)*q*1.2,f.y+Math.sin(an)*q*.85);}ctx.closePath();ctx.fill();ctx.save();ctx.clip();
        if(K.sed){ctx.strokeStyle='rgba(70,45,30,.55)';ctx.lineWidth=1;for(let y=-f.r;y<f.r;y+=4){ctx.beginPath();ctx.moveTo(f.x-30,f.y+y);ctx.lineTo(f.x+30,f.y+y+(f.cls==='sand'?4:0));ctx.stroke();}}
        if(f.cls==='bas'){ctx.fillStyle='rgba(15,10,8,.5)';for(let i=0;i<14;i++)ctx.fillRect(f.x+(r()-.5)*36,f.y+(r()-.5)*24,2,2);}
        if(f.cls==='sulf'){ctx.fillStyle='#7a5d4c';ctx.fillRect(f.x-40,f.y-40,80,80);ctx.strokeStyle='#f3efe6';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(f.x-20,f.y-6);ctx.lineTo(f.x-4,f.y+3);ctx.lineTo(f.x+8,f.y-4);ctx.lineTo(f.x+22,f.y+6);ctx.stroke();}
        if(f.cls==='carb'){ctx.fillStyle='rgba(240,225,195,.5)';for(let y=-f.r;y<f.r;y+=7)ctx.fillRect(f.x-30,f.y+y,60,3);}
        ctx.restore();ctx.fillStyle='rgba(255,240,220,.16)';ctx.beginPath();ctx.ellipse(f.x-5,f.y-5,f.r*.7,f.r*.4,0,0,7);ctx.fill();
        if(f.seen){ctx.strokeStyle=f.sampled?'#86c994':f.scan?'#8fc8da':'rgba(239,230,217,.8)';ctx.lineWidth=f===nf?2.5:1.3;ctx.setLineDash(f===nf?[]:[5,4]);ctx.beginPath();ctx.arc(f.x,f.y,f.r+12,0,7);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle='rgba(8,5,4,.7)';ctx.font='11px "Martian Mono",monospace';const tw=ctx.measureText(f.name).width;ctx.fillRect(f.x-tw/2-5,f.y-f.r-32,tw+10,16);ctx.fillStyle='#efe6d9';ctx.fillText(f.name,f.x-tw/2,f.y-f.r-20);}}
      /* base beacon */
      const pulse=(performance.now()/1000)%1.6/1.6;ctx.strokeStyle=`rgba(242,184,79,${.8*(1-pulse)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(B.x,B.y,92+pulse*40,0,7);ctx.stroke();
      if(S.emergency||S.alert>=1){ctx.strokeStyle='rgba(242,184,79,.75)';ctx.setLineDash([10,8]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(S.x,S.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.setLineDash([]);}
      /* the rover: six wheels, a camera mast at the front, a power unit at the back */
      ctx.save();ctx.translate(S.x,S.y);ctx.rotate(S.a);ctx.fillStyle='rgba(20,10,6,.45)';ctx.fillRect(-13,-8,30,22);
      const lg=ctx.createLinearGradient(14,0,120,0);lg.addColorStop(0,'rgba(255,244,214,.22)');lg.addColorStop(1,'rgba(255,244,214,0)');ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(120,-34);ctx.lineTo(120,34);ctx.fill();
      ctx.fillStyle='#1c1a19';for(const wx of[-11,0,11])for(const wy of[-11.5,8.5])ctx.fillRect(wx-3.5,wy,7,3.4);
      ctx.strokeStyle='#8d8a84';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-11,-10);ctx.lineTo(11,-10);ctx.moveTo(-11,10);ctx.lineTo(11,10);ctx.stroke();
      ctx.fillStyle='#e9e5dc';ctx.fillRect(-10,-7,20,14);ctx.strokeStyle='#6b6964';ctx.lineWidth=.8;ctx.strokeRect(-10,-7,20,14);ctx.fillStyle='#22345f';ctx.fillRect(-7,-5,9,10);
      ctx.fillStyle='#4a4744';ctx.fillRect(-17,-4,7,8);ctx.fillStyle='#d9a441';ctx.fillRect(-16,-3,2,6);                         /* power unit, rear */
      ctx.strokeStyle='#cfcbc3';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(14,0);ctx.stroke();ctx.fillStyle='#f4f1ea';ctx.fillRect(12,-4,6,8);ctx.fillStyle='#10141c';ctx.fillRect(16,-2.6,2.4,2);ctx.fillRect(16,.6,2.4,2);  /* mast head, front */
      if(S.drill){ctx.strokeStyle='#ea6f3c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,5);ctx.lineTo(22,9);ctx.stroke();}
      ctx.restore();
      if(S.drill){ctx.strokeStyle='#ea6f3c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(S.x,S.y,26,-Math.PI/2,-Math.PI/2+S.drill.t/2.6*6.283);ctx.stroke();}
      /* fog of war */
      ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(w.fog,ox*TS,oy*TS,vw*TS,vh*TS,0,0,cv.width,cv.height);
      /* prompts */
      const u=cv.width/880;ctx.font=`${12*u}px "Martian Mono",monospace`;
      let prompt='';const f34=near(34);if(S.drill)prompt='Drilling…';else if(distBase()<70&&S.left)prompt='E  dock and end the expedition';else if(f34&&!f34.sampled&&!S.emergency)prompt=`E  drill a sample     I  instruments`;else if(nf&&!S.emergency)prompt='I  instruments';
      if(prompt){const tw=ctx.measureText(prompt).width;ctx.fillStyle='rgba(8,5,4,.78)';ctx.fillRect(cv.width/2-tw/2-10*u,cv.height-40*u,tw+20*u,24*u);ctx.fillStyle='#f2b84f';ctx.fillText(prompt,cv.width/2-tw/2,cv.height-23*u);}
      ctx.fillStyle='rgba(239,230,217,.55)';ctx.font=`${9*u}px "Martian Mono",monospace`;ctx.fillText('SIMULATED TERRAIN · JEZERO WESTERN DELTA · '+w.site.n.toUpperCase(),10*u,16*u);
      /* compass rose and scale */
      ctx.strokeStyle='rgba(239,230,217,.7)';ctx.lineWidth=1.2*u;ctx.beginPath();ctx.moveTo(cv.width-130*u,cv.height-18*u);ctx.lineTo(cv.width-130*u+100*z,cv.height-18*u);ctx.stroke();ctx.fillText('100 m',cv.width-130*u,cv.height-24*u);}
    function ui(){const rc=returnCost(),hd=((S.a*180/Math.PI+90)%360+360)%360,o=O(),bar=(l,v,cls,txt)=>`<div class="meter ${cls}"><div class="t"><span>${l}</span><span class="num">${txt}</span></div><div class="b"><i style="width:${clamp(v,0,100)}%"></i></div></div>`;
      host.querySelector('#rvclock').textContent=`Sol ${sol} · ${lmst()} LMST`;
      statEl.innerHTML=bar(`Battery ${Help.q('rbattery')}`,S.e,S.e<rc+4?'over':S.e<rc+14?'warn':'ok',`${S.e.toFixed(0)}%`)+bar('Needed to drive home',rc,'warn',`${rc.toFixed(0)}%`)+bar('Rover condition',S.cond,S.cond<50?'over':'ok',`${S.cond.toFixed(0)}%`)+
        `<div class="rvnums"><div><span>Speed</span><b class="num">${(Math.abs(S.v)*.09).toFixed(1)} cm/s</b></div><div><span>Heading</span><b class="num">${String(Math.round(hd)).padStart(3,'0')}°</b></div><div><span>To base</span><b class="num">${Math.round(distBase())} m</b></div><div><span>Ground</span><b class="num">${TERRAIN[S.terr||'firm']}</b></div></div>`;
      const row=x=>`<div class="obj ${x[1]?'done':''}"><i></i><span>${x[0]}</span>${x[2]?`<b class="num">${x[2]}</b>`:''}</div>`;
      objEl.innerHTML=o.main.map(row).join('')+`<p class="kicker" style="margin:6px 0 2px;color:var(--dim)">Optional</p>`+o.opt.map(row).join('');
      banEl.textContent=S.stranded?'ROVER STRANDED':S.emergency?'EMERGENCY RETURN · INSTRUMENTS OFF':S.alert>=2?'BATTERY CRITICAL':S.alert===1?'BATTERY MARGIN LOW':'';banEl.className='rvbanner'+(S.stranded||S.alert>=2?' bad':S.emergency||S.alert===1?' warn':'');}
    function frame(now){if(!alive)return;if(!cv.isConnected){cleanup();return;}const el=Math.min(.25,(now-last)/1000),n=Math.max(1,Math.ceil(el/.034)),dt=el/n;last=now;
      /* slow devices take several small physics steps per drawn frame, so driving feels the same everywhere */
      for(let i=0;i<n;i++)step(dt);
      cam.x+=(S.x+Math.cos(S.a)*S.v*1.2-cam.x)*(1-Math.exp(-el*4));cam.y+=(S.y+Math.sin(S.a)*S.v*1.2-cam.y)*(1-Math.exp(-el*4));
      draw();uiT-=dt;if(uiT<=0){ui();uiT=.2;if(S.map)drawMap();}raf=requestAnimationFrame(frame);}
    say(`Sol ${sol}. Rover checked out at ${w.site.n}. ${w.site.d}`);ui();cv.focus();raf=requestAnimationFrame(frame);
    /* test hooks */
    window.__rover={S,world:w,O,near,key:(c,v)=>{S.keys[c]=v;},goto:(x,y)=>{S.x=x;S.y=y;S.v=0;cam.x=x;cam.y=y;},interact,photo,scanResult,dock,toggleMap,togglePanel,end};
  });}
  return {start,SITES,CLS};
})();
