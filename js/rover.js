"use strict";
/* Rover expedition: a top-down drive across a piece of Jezero's western delta front.
   Self-contained: Rover.start(options) draws into a host element and resolves with the expedition results.
   The terrain is SIMULATED. It is generated from noise and laid out after published descriptions of the area
   (a delta scarp of layered sedimentary rock in the west, an igneous crater floor, carbonate-bearing rock toward
   the rim). It is not HiRISE, CTX or MOLA data, and the chemistry numbers are game values.

   Structure: world (terrain, rocks, formations) -> simulation step (physics, energy) -> drawing -> panels. */
const Rover=(()=>{
  const W=2600,H=1900,TS=.5;                         /* world size in meters, terrain texture scale */
  const VIEW_W=880;                                   /* meters of ground across the view */
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
      obs:['Paper-thin horizontal layers.','Breaks into flat plates.'],micro:'Grains finer than silt, packed in flat sheets: settled out of still water.'},
    sand:{n:'Coarse layered rock',sed:true,label:'Sedimentary sandstone',col:'#c39a72',comp:{Si:55,Fe:9,Mg:5,Al:11,Ca:5,S:1},
      obs:['Layers that tilt and cut across each other.','Stands out as a ledge.'],micro:'Sand grains and pebbles, worn round: rolled along by flowing water.'},
    bas:{n:'Dark massive rock',sed:false,label:'Igneous basalt, rich in olivine',col:'#5b4a44',comp:{Si:42,Fe:20,Mg:18,Al:7,Ca:6,S:1},
      obs:['No layering at all.','Pitted by small holes.'],micro:'Interlocking green-grey crystals: cooled from molten rock.'},
    carb:{n:'Pale banded rock',sed:false,label:'Carbonate-bearing rock',col:'#cdb9a0',comp:{Si:22,Fe:10,Mg:22,Al:3,Ca:14,S:1},
      obs:['Pale tan bands along the slope.','Sits high, near the old shoreline level.'],micro:'Fine crystals with a rough, etched surface: a mineral that grows in water.'},
    sulf:{n:'White vein in fractured rock',sed:false,label:'Sulfate vein',col:'#e8e2d6',comp:{Si:18,Fe:6,Mg:5,Al:3,Ca:26,S:30},
      obs:['Bright white material filling cracks.','Cuts across the host rock.'],micro:'Soft white crystals grown into the crack: left by water seeping through.'}};
  const LABID={mud:'Clay minerals and a little sulfate',sand:'Quartz-poor sand with clay cement',bas:'Olivine and pyroxene, no clay',carb:'Magnesium carbonate',sulf:'Calcium sulfate (gypsum-like)'};
  const ELS=['Si','Fe','Mg','Al','Ca','S'],ELN={Si:'Silicon',Fe:'Iron',Mg:'Magnesium',Al:'Aluminum',Ca:'Calcium',S:'Sulfur'};
  /* ---------- the ten rock formations ----------
     Generated once per rover mission from a seed stored with the game, so a refresh or a resumed game keeps the
     same ten. Each formation's rock type follows where it sits: layered sedimentary rock on and under the delta
     scarp, igneous rock on the crater floor, a sulfate vein in fractured floor rock, carbonate toward the rim. */
  const NAMES={mud:['Scarp ledge','Thin-bed cliff','Mudstone step','Laminated knob','North terrace'],sand:['Fan toe slab','Cross-bed ridge','Pebble lens','Channel fill','South bench'],
    bas:['Floor block','Dark ridge','Pitted boulder','Olivine slab','East knob'],carb:['Upper pale band','Rim shelf','Pale terrace','Margin bench'],sulf:['White vein','Bright seam','Pit fracture']};
  const steepAt=(x,y)=>Math.hypot(height(x+4,y)-height(x-4,y),height(x,y+4)-height(x,y-4))/8;
  function genForms(siteKey,seed){const site=SITES[siteKey]||SITES.delta,B=site.base,r=rng((seed|0)^0x5bd1e995),out=[],used={};
    const zone={sed:()=>{const y=160+r()*(H-320),x=scarpX(y)-170+r()*300;return [x,y,y>1200?'sand':(r()<.5?'mud':'sand')];},
      floor:()=>{const x=1050+r()*1100,y=150+r()*(H-300);return [x,y,'bas'];},vein:()=>{const x=1100+r()*1000,y=150+r()*(H-300);return [x,y,'sulf'];},
      rim:()=>{const x=2240+r()*240,y=200+r()*(H-400);return [x,y,'carb'];}};
    const plan=['sed','sed','sed','floor','floor','floor','vein','rim','rim',r()<.5?'sed':'floor'];
    for(const z of plan){let best=null;
      for(let t=0;t<400&&!best;t++){const [x,y,cls]=zone[z](),spacing=t<250?230:t<350?170:120;
        if(x<120||x>W-120||y<120||y>H-120)continue;if(Math.hypot(x-B[0],y-B[1])<240)continue;if(steepAt(x,y)>.42)continue;
        if(CRATERS.some(([cx,cy,cr])=>{const q=Math.hypot(x-cx,y-cy)/cr;return q>.7&&q<1.2;}))continue;
        if(out.some(f=>Math.hypot(f.x-x,f.y-y)<spacing))continue;best={x,y,cls};}
      if(!best){const ang=r()*6.283;best={x:clamp(B[0]+Math.cos(ang)*600,140,W-140),y:clamp(B[1]+Math.sin(ang)*600,140,H-140),cls:z==='rim'?'carb':z==='sed'?'mud':'bas'};}
      const pool=NAMES[best.cls];used[best.cls]=(used[best.cls]||0);const name=pool[(used[best.cls]+(seed>>>3))%pool.length];used[best.cls]++;
      out.push({x:Math.round(best.x),y:Math.round(best.y),cls:best.cls,name});}
    for(let i=out.length-1;i>0;i--){const j=r()*(i+1)|0;[out[i],out[j]]=[out[j],out[i]];}
    return out.map((f,i)=>Object.assign(f,{id:i,code:'F-'+String(i+1).padStart(2,'0')}));}
  const SITES={delta:{n:'Delta front',base:[1010,1060],rocks:1.5,d:'Close to the layered scarp. Boulder-strewn.'},
    floor:{n:'Crater floor',base:[1760,1130],rocks:.75,d:'Flat and open. A long drive to the scarp.'},
    rim:{n:'East bench',base:[2240,860],rocks:1.1,d:'High ground by the pale rocks. Steep approaches.'}};

  let world=null;
  function build(siteKey,FS,blind){
    const site=SITES[siteKey]||SITES.delta,r=rng(siteKey.length*977+13),B=site.base;
    /* boulders: scattered, denser under the scarp and on crater rims */
    const rocks=[];let tries=0;
    while(rocks.length<170*site.rocks&&tries++<6000){const x=40+r()*(W-80),y=40+r()*(H-80),p=plateau(x,y);
      let w=.25+.9*sm(.1,.5,p)*(1-sm(.5,.95,p))+.3*fbm(x/300+5,y/300,2);for(const [cx,cy,cr] of CRATERS){const q=Math.hypot(x-cx,y-cy)/cr;if(q>.85&&q<1.25)w+=.7;}
      if(r()>w)continue;if(Math.hypot(x-B[0],y-B[1])<(blind?70:130))continue;if(FS.some(f=>Math.hypot(x-f.x,y-f.y)<55))continue;
      rocks.push({x,y,r:5+r()*r()*16,s:r()});}
    const forms=FS.map((f,i)=>({id:i,code:f.code,cls:f.cls,x:f.x,y:f.y,name:f.name,r:17,seen:false,photo:false,scan:null,guess:null,sampled:false,micro:false,lab:false,seed:(f.x*31+f.y*17+i*7)|0}));
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

  /* ---------- one expedition ----------
     opt: root (host element), site, seed (formation seed), spec (RK.spec of the player's rover), sol, sprite (top-down
     picture of the rover from Models.snapshot), blind (landed without hazard images), relayM1 (the player's Mission 1
     orbiter adds a relay pass), resume (a saved state to continue), save(state) (called every few seconds).
     Energy is tracked in watt-hours. Mars time runs 12 seconds for every real second, starting at 13:00 local time. */
  const HPS=.2/60,T0=13*60;                           /* hours of Mars time per real second; start time in minutes */
  const RELAY=[[13*60+40,13*60+52],[15*60+5,15*60+17],[16*60+30,16*60+42]],M1PASS=[14*60+20,14*60+32],EARTH=[13*60,15*60+40];
  function start(opt){return new Promise(resolve=>{
    const host=opt.root,sp=opt.spec||(typeof RK!=='undefined'?RK.spec(RK.defaults()):null),can=sp.can,sol=opt.sol||1,R0=opt.resume;
    const FS=genForms(opt.site||'delta',opt.seed||1);
    world=build(opt.site||'delta',FS,opt.blind);const w=world,B=w.base;
    const S={x:B.x+34,y:B.y+10,a:-.3,v:0,wh:sp.batWh,cond:opt.blind?88:100,dist:0,t:0,path:[[B.x+34,B.y+10]],log:[],samples:[],photos:0,emergency:false,left:false,done:false,stranded:false,
      alert:0,drill:null,busy:null,panel:null,map:false,keys:{},msg:'',msgT:0,mb:0,sent:0,dust:1,gprM:0,wxT:0,doseT:0,faults:[],wheelK:1,instOff:{},radioOff:0,stall:0,way:null,atmo:null,mag:null,seis:null,labs:0};
    if(R0){Object.assign(S,R0.S);S.keys={};S.panel=null;S.map=false;S.drill=null;S.busy=null;
      (R0.forms||[]).forEach((st,i)=>{if(w.forms[i])Object.assign(w.forms[i],st);});}
    const e=()=>S.wh/sp.batWh*100;Object.defineProperty(S,'e',{get:e,set:v=>{S.wh=v/100*sp.batWh;},enumerable:false,configurable:true});
    const lm=()=>T0+S.t*12/60;                       /* local mean solar time in minutes */
    const lmst=()=>{const m=lm();return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.floor(m%60)).padStart(2,'0')}`;};
    const sunF=()=>{const h=lm()/60;return Math.max(0,Math.sin(Math.PI*(h-6)/12));};
    const say=(t)=>{S.log.unshift(`${lmst()} ${t}`);S.msg=t;S.msgT=3.5;logEl.innerHTML=S.log.slice(0,30).map(l=>`<div><b>›</b> ${l}</div>`).join('');};
    const distBase=()=>Math.hypot(S.x-B.x,S.y-B.y),returnCost=()=>(distBase()*sp.drive/100*1.35*(S.emergency?.9:1))/sp.batWh*100+1.5;
    const near=(range=75)=>{let best=null,bd=1e9;for(const f of w.forms){const d=Math.hypot(S.x-f.x,S.y-f.y)-f.r;if(d<range&&d<bd){bd=d;best=f;}}return best;};
    const explored=()=>w.seenCells/w.cells.length;
    const use=(wh)=>{S.wh=Math.max(0,S.wh-wh);};
    const room=mb=>S.mb+mb<=sp.storeMB+1e-6;
    const instOn=k=>!(S.instOff[k]>S.t);
    const O=()=>{const scans=w.forms.filter(f=>f.scan).length,right=w.forms.filter(f=>f.scan&&f.guess===f.cls),kinds=new Set(right.map(f=>f.cls)),rock=S.samples.filter(s=>s.kind!=='soil').length;
      return {main:[['Deploy the rover',S.left],['Explore the region',explored()>=.22,`${Math.round(explored()*100)}% mapped`],['Analyze 3 formations',scans>=3,`${scans} / 3`],['Collect 2 rock samples',rock>=2,`${rock} / 2`],['Return to base',S.done&&!S.stranded]],
        opt:[['Photograph a layered outcrop',w.forms.some(f=>f.photo&&CLS[f.cls].sed)],['Find 6 formations',w.forms.filter(f=>f.seen).length>=6,`${w.forms.filter(f=>f.seen).length} / 6`],['Tell two rock types apart',kinds.size>=2,`${kinds.size} / 2`],
          ['Profile the buried delta layers',S.gprM>=400,can.gpr?`${Math.round(S.gprM)} / 400 m`:'no radar'],['Keep a weather record',S.wxT>=120,can.wx?`${Math.round(Math.min(120,S.wxT)/1.2)}%`:'no sensors'],
          ['Measure the surface radiation dose',S.doseT>=120,can.dose?`${Math.round(Math.min(120,S.doseT)/1.2)}%`:'no detector'],['Confirm a mineral on the spot',S.labs>0,can.lab?`${S.labs}`:'no lab'],['Dock with 20% battery',S.done&&!S.stranded&&S.e>=20]]};};

    host.innerHTML=`<div class="rover"><div class="rvmain"><div class="rvwrap"><canvas id="rvc" tabindex="0" aria-label="Rover view. Drive with W A S D."></canvas>
        <div class="rvbanner" id="rvban"></div><canvas class="rvmini" id="rvmini" width="190" height="139" aria-label="Minimap. Click to open the regional map."></canvas>
        <div class="rvpanel" id="rvpanel" hidden></div><div class="rvmap" id="rvmap" hidden><canvas id="rvmc"></canvas><div class="rvminfo" id="rvminfo"></div><p class="mono">Regional map · simulated terrain · formations located from orbit · click a marker · M to close</p></div>
        <div class="rvpad" aria-label="Touch controls"><button type="button" data-k="KeyA">◀</button><div><button type="button" data-k="KeyW">▲</button><button type="button" data-k="KeyS">▼</button></div><button type="button" data-k="KeyD">▶</button><button type="button" data-k="Space" class="wide">Brake</button></div></div>
      <div class="rvkeys mono"><span><b>W A S D</b> drive</span><span><b>Space</b> brake</span><span><b>E</b> interact</span><span><b>I</b> instruments</span><span><b>M</b> map</span></div></div>
      <div class="rvside"><div class="panel"><div class="row between"><p class="kicker">Rover</p><span class="pill info" id="rvclock"></span></div><div id="rvstat"></div>
          <div class="row"><button type="button" class="ghost" id="rvI">Instruments</button><button type="button" class="ghost" id="rvM">Map</button><button type="button" class="ghost" id="rvE">Interact</button></div>
          <button type="button" class="ghost" id="rvR" aria-pressed="false">Emergency return</button></div>
        <div class="panel"><p class="kicker">Objectives</p><div id="rvobj"></div></div>
        <div class="panel"><p class="kicker">Expedition log</p><div class="log" id="rvlog"></div></div></div></div>`;
    const cv=host.querySelector('#rvc'),ctx=cv.getContext('2d'),statEl=host.querySelector('#rvstat'),objEl=host.querySelector('#rvobj'),logEl=host.querySelector('#rvlog'),panelEl=host.querySelector('#rvpanel'),mapEl=host.querySelector('#rvmap'),banEl=host.querySelector('#rvban'),mini=host.querySelector('#rvmini'),mctx=mini.getContext('2d');
    let cam={x:S.x,y:S.y},raf=0,last=performance.now(),uiT=0,saveAt=performance.now()+3000,alive=true;
    /* reveal the fog along a path (used when a saved expedition resumes) */
    const reveal=(x,y)=>{const fx=w.fx,rr=330*can.sight,g=fx.createRadialGradient(x*TS,y*TS,110*can.sight*TS,x*TS,y*TS,rr*TS);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');fx.globalCompositeOperation='destination-out';fx.fillStyle=g;fx.beginPath();fx.arc(x*TS,y*TS,rr*TS,0,7);fx.fill();fx.globalCompositeOperation='source-over';
      const ci=clamp(x/W*26|0,0,25),cj=clamp(y/H*19|0,0,18);for(let j=cj-1;j<=cj+1;j++)for(let i=ci-1;i<=ci+1;i++)if(i>=0&&j>=0&&i<26&&j<19&&!w.cells[j*26+i]){w.cells[j*26+i]=1;w.seenCells++;}};
    if(R0)S.path.forEach(p=>reveal(p[0],p[1]));
    /* the rover picture: the player's own 3D rover seen from above, or a drawn one when 3D is unavailable */
    const spr=opt.sprite&&opt.sprite.canvas?opt.sprite:null,sprK=11;                                  /* world meters per model unit */

    /* ----- input ----- */
    const kd=ev=>{if(!alive)return;if(ev.target&&/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName))return;const c=ev.code;
      if(['KeyW','KeyA','KeyS','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(c)){S.keys[c]=true;ev.preventDefault();}
      if(ev.repeat)return;if(c==='KeyE'){interact();ev.preventDefault();}if(c==='KeyI'){togglePanel();ev.preventDefault();}if(c==='KeyM'){toggleMap();ev.preventDefault();}if(c==='Escape'){closePanel();if(S.map)toggleMap();}};
    const ku=ev=>{S.keys[ev.code]=false;};
    addEventListener('keydown',kd);addEventListener('keyup',ku);
    host.querySelectorAll('.rvpad button').forEach(b=>{const on=ev=>{S.keys[b.dataset.k]=true;ev.preventDefault();},off=()=>{S.keys[b.dataset.k]=false;};
      b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',off);b.addEventListener('pointercancel',off);});
    host.querySelector('#rvI').onclick=()=>togglePanel();host.querySelector('#rvM').onclick=()=>toggleMap();host.querySelector('#rvE').onclick=()=>interact();mini.onclick=()=>{if(!S.map)toggleMap();};
    host.querySelector('#rvR').onclick=()=>{S.emergency=!S.emergency;host.querySelector('#rvR').setAttribute('aria-pressed',S.emergency);if(S.emergency){closePanel();say('Emergency return: instruments off, speed limited, heading for base.');}else say('Emergency return cancelled.');};
    const onHide=()=>{if(alive&&opt.save&&!S.done&&!S.stranded)opt.save(snapshotState());};addEventListener('pagehide',onHide);document.addEventListener('visibilitychange',onHide);
    function cleanup(){alive=false;cancelAnimationFrame(raf);removeEventListener('keydown',kd);removeEventListener('keyup',ku);removeEventListener('pagehide',onHide);document.removeEventListener('visibilitychange',onHide);window.__rover=null;}

    /* ----- instruments ----- */
    const H_=(k)=>typeof Help!=='undefined'?Help.q(k):'';
    function closePanel(){S.panel=null;panelEl.hidden=true;panelEl.innerHTML='';cv.focus();}
    function togglePanel(){if(S.panel){closePanel();return;}if(S.emergency){say('Instruments are off in emergency return.');return;}S.panel='main';drawPanel();}
    const offTxt=k=>instOn(k)?'':' · fault';
    function drawPanel(){const f=near(),fc=near(34),still=Math.abs(S.v)<2,canR=f&&still,canC=fc&&still&&sp.cfg.arm!=='none';panelEl.hidden=false;
      const btn=(id,lab,ok,help)=>`<button type="button" class="ghost" id="${id}" ${ok?'':'disabled'}>${lab}</button>${help?H_(help):''}`;
      const remote=[can.photo&&btn('rpC',`Camera · ${INS('pancam').use.wh} Wh${offTxt('pancam')}`,canR&&instOn('pancam'),'r:pancam'),can.chem&&btn('rpS',`Laser spectrometer · ${INS('chem').use.wh} Wh${offTxt('chem')}`,canR&&instOn('chem'),'r:chem'),
        can.sand&&btn('rpT',`Thermal image · 2 Wh${offTxt('thermal')}`,still&&instOn('thermal'),'r:thermal')].filter(Boolean);
      const contact=[can.contact&&btn('rpX',`Contact spectrometer · 10 Wh${offTxt('apxs')}`,canC&&instOn('apxs'),'r:apxs'),can.micro&&btn('rpU',`Microscope · 3 Wh${offTxt('mi')}`,canC&&instOn('mi'),'r:mi')].filter(Boolean);
      const other=[can.atmo&&btn('rpG','Sniff the air · 12 Wh',still,'r:atmo'),can.mag&&btn('rpN','Read magnetometer',still,'r:mag'),can.seis&&btn('rpQ','Listen with seismometer',still,'r:seis')].filter(Boolean);
      const powders=S.samples.filter(s=>s.kind==='powder'&&!s.lab);
      panelEl.innerHTML=`<div class="row between"><p class="kicker">Instrument panel</p><button type="button" class="hx" id="rpx" aria-label="Close">×</button></div>
        <p>${f?`Target in range: <b>${f.name}</b> <span class="mono dim">${f.code}</span>`:'No formation in range. Drive closer to a marked outcrop.'}${f&&!still?' <span class="dim">Stop the rover first.</span>':''}</p>
        ${remote.length?`<p class="kicker" style="color:var(--dim)">Remote</p><div class="row">${remote.join('')}</div>`:''}
        ${contact.length?`<p class="kicker" style="color:var(--dim)">On the arm · park beside the rock</p><div class="row">${contact.join('')}</div>`:''}
        ${!remote.length&&!contact.length?'<p class="dim">No imaging or analysis instrument is fitted. This rover can drive and sample, nothing more.</p>':''}
        ${other.length?`<p class="kicker" style="color:var(--dim)">Other instruments</p><div class="row">${other.join('')}</div>`:''}
        <p class="kicker" style="margin-top:8px">Sample tubes ${S.samples.length} / ${can.tubes} ${H_('sample')}</p>
        <div class="tw"><table>${S.samples.map(s=>`<tr><td class="num">${s.id}</td><td>${s.site}<div class="dim" style="font-size:.76rem">${s.time} · ${s.kind} · ${s.cls}${s.lab?' · lab: '+s.labText:''}</div></td></tr>`).join('')||`<tr><td class="dim">${can.sample?'Empty. Press E beside a formation to take a sample.':'No arm fitted, so no samples.'}</td></tr>`}</table></div>
        ${can.lab&&powders.length?`<div class="row"><button type="button" class="btn" id="rpL">Run lab analysis on ${powders[0].id} · 70 Wh</button>${H_('r:lab')}</div>`:''}
        <p class="kicker" style="margin-top:8px">Analyses</p><div class="tw"><table>${w.forms.filter(x=>x.scan).map(x=>`<tr><td>${x.name}</td><td class="num">${ELS.map(el=>`${el} ${x.scan.v[el].toFixed(0)}`).join(' · ')}</td><td>${x.guess?CLS[x.guess].label:'<span class="dim">unclassified</span>'}</td></tr>`).join('')||'<tr><td class="dim">None yet.</td></tr>'}</table></div>
        ${S.atmo||S.mag||S.seis?`<p class="dim" style="font-size:.82rem">${[S.atmo,S.mag,S.seis].filter(Boolean).join(' · ')}</p>`:''}`;
      const on=(id,fn)=>{const b=panelEl.querySelector('#'+id);if(b)b.onclick=fn;};
      on('rpx',closePanel);on('rpC',()=>photo(f));on('rpS',()=>scanAim(f));on('rpX',()=>contactScan(fc));on('rpU',()=>microscope(fc));on('rpT',thermalImage);on('rpL',()=>labRun(powders[0]));
      on('rpG',()=>{use(12);if(!room(2))return say('Storage full.');S.mb+=2;S.atmo='Methane 0.4 ppb, the usual faint background';say('Gas analyzer: '+S.atmo+'.');drawPanel();});
      on('rpN',()=>{S.mag='Magnetometer: 9 ± 25 nT, swamped by the rover’s own currents';say(S.mag+'.');drawPanel();});
      on('rpQ',()=>{S.seis='Seismometer: motor and wind noise drown every signal; it needs to sit still on the ground';say(S.seis+'.');drawPanel();});}
    const INS=k=>(typeof RK!=='undefined'&&RK.INS[k])||{use:{wh:0,mb:0}};
    const panelHead=(t)=>`<div class="row between"><p class="kicker">${t}</p><button type="button" class="hx" id="rpx" aria-label="Close">×</button></div>`;
    function photo(f){const u=INS('pancam').use;if(!room(u.mb)){say('Storage full. Wait for a downlink before taking more pictures.');return;}use(u.wh);S.mb+=u.mb;const first=!f.photo;f.photo=true;f.seen=true;if(first){S.photos++;say(`Photographed ${f.name}.`);}
      const dusty=!can.covers&&S.dust<.9;
      panelEl.innerHTML=panelHead(`Camera · ${f.name}`)+`<canvas id="rpimg" width="420" height="250" class="rvimg" style="${dusty?'filter:blur(1.2px) sepia(.25)':''}"></canvas>
        <p class="kicker">Observations ${H_('geology')}</p><ul class="plain">${CLS[f.cls].obs.map(o=>`<li>${o}</li>`).join('')}${f.micro?`<li>${CLS[f.cls].micro}</li>`:`<li class="dim">Grain detail needs a closer look.</li>`}</ul>${dusty?'<p class="dim" style="font-size:.82rem">Dust on the lens softens the picture.</p>':''}<div class="row"><button type="button" class="ghost" id="rpB">Back</button></div>`;
      rockArt(panelEl.querySelector('#rpimg'),f.cls,f.seed);panelEl.querySelector('#rpx').onclick=closePanel;panelEl.querySelector('#rpB').onclick=drawPanel;}
    function microscope(f){const u=INS('mi').use;if(!room(u.mb)){say('Storage full.');return;}use(u.wh);S.mb+=u.mb;f.micro=true;f.seen=true;say(`Microscope image of ${f.name}.`);
      panelEl.innerHTML=panelHead(`Microscope · ${f.name}`)+`<canvas id="rpimg" width="420" height="250" class="rvimg"></canvas><p class="kicker">Close-up</p><p>${CLS[f.cls].micro}</p><div class="row"><button type="button" class="ghost" id="rpB">Back</button></div>`;
      microArt(panelEl.querySelector('#rpimg'),f.cls,f.seed);panelEl.querySelector('#rpx').onclick=closePanel;panelEl.querySelector('#rpB').onclick=drawPanel;}
    function thermalImage(){const u=INS('thermal').use;if(!room(u.mb)){say('Storage full.');return;}use(u.wh);S.mb+=u.mb;S.thermalT=S.t+40;say('Thermal image taken: soft sand ahead is marked in blue for a while.');closePanel();}
    function contactScan(f){if(S.e<3){say('Not enough charge.');return;}const u=INS('apxs').use;if(!room(u.mb)){say('Storage full.');return;}
      S.busy={t:0,dur:3,label:'Contact spectrometer integrating…',done:()=>{use(u.wh);S.mb+=u.mb;scanResult(f,.95,'contact');}};closePanel();say(`Arm placing the contact spectrometer on ${f.name}. Hold still.`);}
    function labRun(s){if(!s)return;if(!room(20)){say('Storage full.');return;}S.busy={t:0,dur:4,label:'Lab analysis running…',done:()=>{use(70);S.mb+=20;s.lab=true;s.labText=LABID[s.truth];S.labs++;const f=w.forms[s.form];if(f)f.lab=true;say(`Lab result for ${s.id}: ${s.labText}.`);if(S.panel)drawPanel();}};say(`Feeding ${s.id} into the lab.`);if(S.panel)drawPanel();}
    /* aim: a spot drifts across the rock face; fire when the reticle is on it */
    function scanAim(f){if(S.e<3){say('Not enough charge to fire the laser.');return;}if(!room(INS('chem').use.mb)){say('Storage full. Wait for a downlink.');return;}
      panelEl.innerHTML=panelHead(`Laser spectrometer · ${f.name}`)+`
        <div class="aimwrap"><canvas id="rpimg" width="420" height="250" class="rvimg"></canvas><canvas id="rpaim" width="420" height="250" class="rvaim"></canvas></div>
        <p class="dim" style="font-size:.86rem">Move the reticle onto the clean spot of rock and fire. A hit on dust gives a noisy reading.</p><div class="row"><button type="button" class="btn" id="rpF">Fire laser</button><button type="button" class="ghost" id="rpB">Back</button></div>`;
      rockArt(panelEl.querySelector('#rpimg'),f.cls,f.seed);const ac=panelEl.querySelector('#rpaim'),ax=ac.getContext('2d');let mx=210,my=125,t0=performance.now(),live=true;
      const tgt=t=>[210+Math.sin(t*.9+f.seed)*70+Math.sin(t*2.3)*22,125+Math.cos(t*.7+f.seed*2)*42+Math.sin(t*1.9)*14];
      const mv=ev=>{const r=ac.getBoundingClientRect();mx=(ev.clientX-r.left)/r.width*420;my=(ev.clientY-r.top)/r.height*250;};ac.addEventListener('pointermove',mv);ac.addEventListener('pointerdown',mv);
      const loop=()=>{if(!live||!ac.isConnected)return;const t=(performance.now()-t0)/1000,[tx,ty]=tgt(t);
        if(S.keys.KeyA||S.keys.ArrowLeft)mx-=3;if(S.keys.KeyD||S.keys.ArrowRight)mx+=3;if(S.keys.KeyW||S.keys.ArrowUp)my-=3;if(S.keys.KeyS||S.keys.ArrowDown)my+=3;mx=clamp(mx,0,420);my=clamp(my,0,250);
        ax.clearRect(0,0,420,250);ax.strokeStyle='rgba(134,201,148,.9)';ax.lineWidth=1.5;ax.beginPath();ax.arc(tx,ty,13,0,7);ax.stroke();ax.setLineDash([3,3]);ax.beginPath();ax.arc(tx,ty,26,0,7);ax.stroke();ax.setLineDash([]);
        ax.strokeStyle='#ea6f3c';ax.lineWidth=2;ax.beginPath();ax.moveTo(mx-16,my);ax.lineTo(mx-5,my);ax.moveTo(mx+5,my);ax.lineTo(mx+16,my);ax.moveTo(mx,my-16);ax.lineTo(mx,my-5);ax.moveTo(mx,my+5);ax.lineTo(mx,my+16);ax.stroke();
        ac._d=Math.hypot(mx-tx,my-ty);requestAnimationFrame(loop);};loop();
      const fire=()=>{live=false;const q=clamp(1-(ac._d||99)/60+(can.covers?.15:0),0,1);use(INS('chem').use.wh);S.mb+=INS('chem').use.mb;scanResult(f,q,'laser');};
      panelEl.querySelector('#rpF').onclick=fire;ac.addEventListener('dblclick',fire);panelEl.querySelector('#rpx').onclick=()=>{live=false;closePanel();};panelEl.querySelector('#rpB').onclick=()=>{live=false;drawPanel();};
      S.fire=fire;}
    function scanResult(f,q,how){S.fire=null;const r=rng(f.seed*91+(S.t*10|0)),true_=CLS[f.cls].comp,v={};
      for(const el of ELS)v[el]=Math.max(0,true_[el]+(r()-.5)*2*(2+(1-q)*14));
      const first=!f.scan;if(!f.scan||q>f.scan.q)f.scan={v,q,how};f.seen=true;if(first)say(`${how==='contact'?'Contact':'Laser'} analysis of ${f.name} recorded.`);
      const s=f.scan,mx=Math.max(...ELS.map(el=>s.v[el]),30);S.panel='scan';panelEl.hidden=false;
      panelEl.innerHTML=panelHead(`Analysis · ${f.name}`)+`
        <div class="row between"><span class="pill ${s.q>.66?'go':s.q>.33?'warn':'nogo'}">${s.how==='contact'?'Contact reading':s.q>.66?'Clean spectrum':s.q>.33?'Partly on dust':'Mostly dust: noisy'}</span><span class="mono dim" style="font-size:.6rem">SIMULATED MEASUREMENT · WEIGHT %</span></div>
        <div class="elbars">${ELS.map(el=>`<div><span>${ELN[el]}</span><i><b style="width:${s.v[el]/mx*100}%"></b></i><b class="num">${s.v[el].toFixed(1)}</b></div>`).join('')}</div>
        ${first?'':'<p class="dim" style="font-size:.82rem">This rock was already analyzed. A repeat can sharpen the reading but adds no new science.</p>'}
        <p class="kicker">Field classification ${H_('libs')}</p><div class="choices">${Object.keys(CLS).map(k=>`<button type="button" class="choice" data-g="${k}" aria-pressed="${f.guess===k}"><b>${CLS[k].label}</b></button>`).join('')}</div>
        <div class="row"><button type="button" class="ghost" id="rpB">Back</button></div>`;
      panelEl.querySelector('#rpx').onclick=closePanel;panelEl.querySelector('#rpB').onclick=drawPanel;
      panelEl.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{f.guess=b.dataset.g;panelEl.querySelectorAll('[data-g]').forEach(x=>x.setAttribute('aria-pressed',x===b));say(`${f.name} logged as: ${CLS[f.guess].label.toLowerCase()}.`);});}
    function interact(){if(S.panel==='aim'||S.fire){if(S.fire)S.fire();return;}
      if(distBase()<70&&S.left){dock();return;}
      const f=near(34);if(!f){say(distBase()<70?'Drive out to begin the expedition.':'Nothing to interact with here.');return;}
      if(S.emergency){say('Sampling is off in emergency return.');return;}
      if(!can.sample){say('No arm fitted. This rover cannot take samples.');return;}
      if(f.sampled){say(`${f.name} has already been sampled.`);return;}if(S.samples.length>=can.tubes){say(`All ${can.tubes} sample tubes are full.`);return;}
      if(Math.abs(S.v)>2){say('Stop the rover before sampling.');return;}if(S.wh<sp.drillWh+10){say('Not enough charge to drill.');return;}
      S.drill={f,t:0,dur:sp.drillSecs};say(sp.drill==='scoop'?`Scooping soil beside ${f.name}.`:`Drilling ${f.name}. Hold still.`);}
    function finishDrill(f){use(sp.drillWh);f.sampled=true;f.seen=true;const id=`JZ-${String(sol).padStart(2,'0')}-${String(S.samples.length+1).padStart(2,'0')}`,kind={core:'core',powder:'powder',scoop:'soil'}[sp.drill];
      S.samples.push({id,form:f.id,site:f.name,code:f.code,kind,grid:`E ${String(Math.round(f.x)).padStart(4,'0')} N ${String(Math.round(H-f.y)).padStart(4,'0')}`,time:`Sol ${sol} ${lmst()} LMST`,cls:kind==='soil'?'Loose soil':f.guess?CLS[f.guess].label:'Unclassified',truth:f.cls,right:kind!=='soil'&&f.guess===f.cls,analysis:f.scan?Object.fromEntries(ELS.map(el=>[el,+f.scan.v[el].toFixed(1)])):null});
      say(kind==='soil'?`Soil sample ${id} scooped beside ${f.name}. The scoop cannot cut bedrock.`:`Sample ${id} sealed from ${f.name}${kind==='powder'?' as powder':''}.`);if(S.panel)drawPanel();}
    async function dock(){const o=O(),miss=o.main.slice(0,4).filter(x=>!x[1]).length;
      if(miss&&!S.confirm){S.confirm=true;say(`${miss} objective${miss>1?'s':''} still open. Press E again to dock anyway.`);setTimeout(()=>{S.confirm=false;},5000);return;}
      S.done=true;S.v=0;say('Docked. Expedition complete.');end();}
    function end(){const o=O();cleanup();draw();
      resolve({site:w.siteKey,dist:S.dist,battery:S.e,cond:S.cond,stranded:S.stranded,explored:explored(),photos:S.photos,found:w.forms.filter(f=>f.seen).length,
        scans:w.forms.filter(f=>f.scan).map(f=>({name:f.name,cls:f.cls,guess:f.guess,q:f.scan.q,how:f.scan.how,v:Object.fromEntries(ELS.map(el=>[el,+f.scan.v[el].toFixed(1)]))})),
        samples:S.samples.slice(),log:S.log.slice(0,60),main:o.main.map(x=>[x[0],!!x[1]]),opt:o.opt.map(x=>[x[0],!!x[1]]),clock:lmst(),
        extras:{gpr:S.gprM>=400,wx:S.wxT>=120,dose:S.doseT>=120,lab:S.labs,atmo:!!S.atmo,micro:w.forms.filter(f=>f.micro).length},faults:S.faults.slice(),sent:S.sent,data:S.mb});}
    /* ----- maps ----- */
    function toggleMap(){S.map=!S.map;mapEl.hidden=!S.map;if(S.map){drawMap();host.querySelector('#rvminfo').innerHTML=S.sel!=null?markerInfo(w.forms[S.sel]):'<span class="dim">Click a formation marker for its details.</span>';}}
    const status=f=>f.sampled?'sampled':f.scan?'analyzed':f.photo?'photographed':f.seen?'sighted':'located';
    const STC={located:'rgba(239,230,217,.75)',sighted:'#efe6d9',photographed:'#f2b84f',analyzed:'#8fc8da',sampled:'#86c994'};
    function marker(x,X,Y,f,sz){const st=status(f);x.save();x.translate(X,Y);x.rotate(Math.PI/4);x.lineWidth=1.5;x.strokeStyle=STC[st];x.fillStyle=STC[st];
      if(st==='located'){x.setLineDash([2,2]);x.strokeRect(-sz/2,-sz/2,sz,sz);x.setLineDash([]);}else{x.fillRect(-sz/2,-sz/2,sz,sz);x.strokeStyle='rgba(8,5,4,.8)';x.strokeRect(-sz/2,-sz/2,sz,sz);}
      x.restore();if(st==='sampled'){x.fillStyle='#0b0908';x.beginPath();x.arc(X,Y,sz*.18,0,7);x.fill();}if(S.sel===f.id){x.strokeStyle='#ea6f3c';x.lineWidth=2;x.beginPath();x.arc(X,Y,sz*1.05,0,7);x.stroke();}}
    function markerInfo(f){if(!f)return '';const d=Math.hypot(f.x-S.x,f.y-S.y),b=((Math.atan2(f.y-S.y,f.x-S.x)*180/Math.PI+90)%360+360)%360;
      return `<div class="row between"><b>${f.code} · ${f.seen?f.name:'Unidentified outcrop'}</b><span class="pill info">${status(f)}</span></div>
        <div class="readouts"><div><span>Distance</span><b class="num">${Math.round(d)} m</b></div><div><span>Bearing</span><b class="num">${String(Math.round(b)).padStart(3,'0')}°</b></div><div><span>Rock type</span><b class="num">${f.scan&&f.guess?CLS[f.guess].label:f.scan?'analyzed, unclassified':'not yet known'}</b></div></div>
        <div class="row"><button type="button" class="btn sm" id="mWay">${S.way===f.id?'Clear waypoint':'Set as waypoint'}</button></div>`;}
    function drawMap(){const c=host.querySelector('#rvmc'),r=mapEl.getBoundingClientRect(),mw=Math.min(r.width-24,(r.height-120)*W/H);c.width=mw;c.height=mw*H/W;const x=c.getContext('2d'),k=mw/W;
      x.drawImage(w.tex,0,0,c.width,c.height);x.drawImage(w.fog,0,0,c.width,c.height);
      if(S.way!=null){const f=w.forms[S.way];x.strokeStyle='rgba(234,111,60,.8)';x.setLineDash([6,5]);x.lineWidth=1.5;x.beginPath();x.moveTo(S.x*k,S.y*k);x.lineTo(f.x*k,f.y*k);x.stroke();x.setLineDash([]);}
      x.strokeStyle='rgba(143,200,218,.9)';x.lineWidth=1.5;x.beginPath();S.path.forEach((p,i)=>i?x.lineTo(p[0]*k,p[1]*k):x.moveTo(p[0]*k,p[1]*k));x.stroke();
      x.fillStyle='#f2b84f';x.fillRect(B.x*k-5,B.y*k-5,10,10);x.font='10px "Martian Mono",monospace';x.fillText('BASE',B.x*k+8,B.y*k+4);
      for(const f of w.forms){marker(x,f.x*k,f.y*k,f,9);x.fillStyle='rgba(239,230,217,.85)';x.fillText(f.code,f.x*k+9,f.y*k+3);}
      x.save();x.translate(S.x*k,S.y*k);x.rotate(S.a);x.fillStyle='#ea6f3c';x.beginPath();x.moveTo(9,0);x.lineTo(-6,-5);x.lineTo(-6,5);x.fill();x.restore();
      const L=[['located','located from orbit'],['sighted','sighted'],['photographed','photographed'],['analyzed','analyzed'],['sampled','sampled']];let lx=8;x.font='9px "Martian Mono",monospace';
      for(const [st,l] of L){const f={id:-1,sampled:st==='sampled',scan:st==='analyzed'||st==='sampled'?1:null,photo:st!=='located'&&st!=='sighted',seen:st!=='located'};marker(x,lx+5,c.height-10,f,7);x.fillStyle='#efe6d9';x.fillText(l,lx+13,c.height-7);lx+=x.measureText(l).width+30;}
      c.onclick=ev=>{const rr=c.getBoundingClientRect(),px=(ev.clientX-rr.left)/rr.width*c.width/k,py=(ev.clientY-rr.top)/rr.height*c.height/k;let best=null,bd=60;for(const f of w.forms){const d=Math.hypot(f.x-px,f.y-py);if(d<bd){bd=d;best=f;}}
        S.sel=best?best.id:null;drawMap();const inf=host.querySelector('#rvminfo');inf.innerHTML=best?markerInfo(best):'<span class="dim">Click a formation marker for its details.</span>';
        const b=inf.querySelector('#mWay');if(b)b.onclick=()=>{S.way=S.way===best.id?null:best.id;say(S.way!=null?`Waypoint set: ${best.code}.`:'Waypoint cleared.');drawMap();inf.innerHTML=markerInfo(best);toggleMap();};};}
    function drawMini(){const c=mini,x=mctx,k=c.width/W;x.clearRect(0,0,c.width,c.height);x.drawImage(w.tex,0,0,c.width,c.height);x.globalAlpha=.85;x.drawImage(w.fog,0,0,c.width,c.height);x.globalAlpha=1;
      if(S.way!=null){const f=w.forms[S.way];x.strokeStyle='rgba(234,111,60,.9)';x.setLineDash([3,3]);x.beginPath();x.moveTo(S.x*k,S.y*k);x.lineTo(f.x*k,f.y*k);x.stroke();x.setLineDash([]);}
      x.fillStyle='#f2b84f';x.fillRect(B.x*k-3,B.y*k-3,6,6);for(const f of w.forms)marker(x,f.x*k,f.y*k,f,6);
      x.save();x.translate(S.x*k,S.y*k);x.rotate(S.a);x.fillStyle='#ea6f3c';x.beginPath();x.moveTo(6,0);x.lineTo(-4,-3.5);x.lineTo(-4,3.5);x.fill();x.restore();
      const vw=VIEW_W*k,vh=vw*.6;x.strokeStyle='rgba(239,230,217,.5)';x.lineWidth=1;x.strokeRect(cam.x*k-vw/2,cam.y*k-vh/2,vw,vh);}

    /* ----- faults: the less reliable the rover, the more often something goes wrong ----- */
    function fault(){const pool=['wheel','inst','radio','reset','reset'];if(sp.cfg.shield==='hard')pool.splice(pool.indexOf('reset'),1);const k=pool[Math.random()*pool.length|0];
      if(k==='wheel'&&S.wheelK>.8){S.wheelK=.78;S.faults.push('wheel');say('Fault: a wheel motor is dragging. Top speed reduced.');}
      else if(k==='inst'){const list=sp.cfg.inst.filter(i=>instOn(i));if(!list.length)return;const i=list[Math.random()*list.length|0];S.instOff[i]=S.t+45;S.faults.push('inst:'+i);say(`Fault: ${INS(i).n||i} offline while it resets.`);}
      else if(k==='radio'){if(sp.backup){say('Radio fault. The backup radio took over.');}else{S.radioOff=S.t+90;S.faults.push('radio');say('Radio fault. No downlink until it recovers.');}}
      else if(k==='reset'){S.stall=S.t+5;S.faults.push('reset');say('Computer reset: the rover stops while it reboots.');}}

    /* ----- simulation ----- */
    function step(dt){if(S.done||S.stranded)return;S.t+=dt;const K=S.keys,busy=!!S.panel||S.map||S.stall>S.t||!!S.busy;
      let fwd=!busy&&(K.KeyW||K.ArrowUp),rev=!busy&&(K.KeyS||K.ArrowDown),lt=!busy&&(K.KeyA||K.ArrowLeft),rt=!busy&&(K.KeyD||K.ArrowRight),brake=K.Space||S.stall>S.t||!!S.busy;
      /* emergency return drives itself toward base; any key takes control back for that moment */
      if(S.emergency&&!S.panel&&!S.map&&!fwd&&!rev&&!lt&&!rt&&!K.Space&&!(S.stall>S.t)){const d=distBase();if(d>55){let da=Math.atan2(B.y-S.y,B.x-S.x)-S.a;da=Math.atan2(Math.sin(da),Math.cos(da));lt=da<-.06;rt=da>.06;fwd=Math.abs(da)<1.1||Math.abs(S.v)<6;}else brake=true;}
      const sd=sandAt(S.x,S.y),hx=height(S.x+4,S.y)-height(S.x-4,S.y),hy=height(S.x,S.y+4)-height(S.x,S.y-4),grade=(hx*Math.cos(S.a)+hy*Math.sin(S.a))/8,steep=Math.hypot(hx,hy)/8;
      let vmax=sp.vmax*S.wheelK*mix(1,sp.sandK,sd)*clamp(1-Math.max(0,grade)*1.6/sp.climb,.3,1)*(S.emergency?.6:1)*(.5+.5*S.cond/100);
      if(S.drill){S.v*=Math.exp(-dt*8);if(fwd||rev){S.drill=null;say('Sampling cancelled: the rover moved.');}else{S.drill.t+=dt;if(S.drill.t>=S.drill.dur){const f=S.drill.f;S.drill=null;finishDrill(f);}}}
      else{if(fwd)S.v+=26*dt;else if(rev)S.v-=20*dt;else S.v*=Math.exp(-dt*.9);if(brake)S.v*=Math.exp(-dt*7);S.v=clamp(S.v,-vmax*.45,vmax);
        const turn=(rt?1:0)-(lt?1:0);S.a+=turn*1.5*sp.turn*dt*(.4+.6*Math.min(1,Math.abs(S.v)/18))*(S.v<-1?-1:1);}
      if(S.busy){S.busy.t+=dt;if(S.busy.t>=S.busy.dur){const b=S.busy;S.busy=null;b.done();}}
      let nx=S.x+Math.cos(S.a)*S.v*dt,ny=S.y+Math.sin(S.a)*S.v*dt;
      /* collisions: boulders (small ones can be driven over), formations, the habitat, the map edge */
      const R_=sp.rad,hit=(cx,cy,cr,over)=>{const d=Math.hypot(nx-cx,ny-cy),m=cr+R_;if(d>=m)return;
        if(over&&cr<sp.passR){S.v*=Math.exp(-dt*3);if(Math.abs(S.v)>20&&Math.random()<dt*.6*sp.tough){S.cond=Math.max(5,S.cond-1.5*sp.tough);say('Bumped over a rock.');}return;}
        const spd=Math.abs(S.v);if(spd>15){S.cond=Math.max(5,S.cond-(spd-15)*.6*sp.tough);say('Impact. Rover condition reduced.');}nx=cx+(nx-cx)/d*m;ny=cy+(ny-cy)/d*m;S.v*=.35;};
      for(const b of w.rocks)if(Math.abs(b.x-nx)<40&&Math.abs(b.y-ny)<40)hit(b.x,b.y,b.r,true);for(const f of w.forms)hit(f.x,f.y,f.r,false);hit(B.x-36,B.y-24,34,false);
      if(nx<30||nx>W-30||ny<30||ny>H-30){nx=clamp(nx,30,W-30);ny=clamp(ny,30,H-30);S.v*=.3;if(!S.edge){S.edge=true;say('Edge of the mapped area. Turn back.');setTimeout(()=>S.edge=false,6000);}}
      const moved=Math.hypot(nx-S.x,ny-S.y);S.x=nx;S.y=ny;S.dist+=moved;
      /* energy: generation minus standing load minus driving, in watt-hours */
      const h=lm()/60,gen=sp.peak*sunF()*S.dust+sp.rtg,load=sp.run+(h>=17?sp.heat:0)+(can.gpr&&moved>.05?15:0)+(can.sand?3:0)+(S.busy?20:0);
      S.wh=clamp(S.wh+(gen-load)*HPS*dt-moved*sp.drive/100*mix(1,sp.sandE,sd)*(1+Math.max(0,grade)*7)*(S.emergency?.9:1),0,sp.batWh);
      S.dust=Math.max(.55,S.dust-dt*(.00012+(moved>.05&&sd>.4?.0006:0))*sp.dustK);
      if(steep>.5&&moved>.2){S.cond=Math.max(5,S.cond-dt*.9*(1-sp.stab)*sp.tough);if(steep>.85&&sp.stab<.62&&Math.random()<dt*.15){S.cond=Math.max(5,S.cond-8);say('The rover lurched on the slope. Condition reduced.');}}
      S.terr=steep>.5?'slope':sd>.5?'sand':plateau(S.x,S.y)>.05&&plateau(S.x,S.y)<.95?'bed':'firm';
      if(can.gpr&&moved>.05&&instOn('gpr'))S.gprM+=moved;if(can.wx&&instOn('env'))S.wxT+=dt;if(can.dose&&instOn('rad'))S.doseT+=dt;
      /* data: direct to Earth while Earth is up, bursts during relay passes */
      const m=lm(),inW=a=>m>=a[0]&&m<a[1],relay=sp.relay&&(RELAY.some(inW)||(opt.relayM1&&inW(M1PASS)));S.relayNow=relay;
      if(S.radioOff<S.t&&S.mb>0){const rate=(relay?sp.relay:0)+(inW(EARTH)?sp.dte:0),q=Math.min(S.mb,rate*dt);S.mb-=q;S.sent+=q;}
      if(!S.left&&distBase()>85){S.left=true;say('Rover deployed. Driving on battery.');}
      const lp=S.path[S.path.length-1];if(Math.hypot(S.x-lp[0],S.y-lp[1])>14)S.path.push([S.x,S.y]);
      reveal(S.x,S.y);
      for(const f of w.forms)if(!f.seen&&Math.hypot(S.x-f.x,S.y-f.y)<150*can.sight){f.seen=true;say(`Outcrop sighted: ${f.name} (${f.code}).`);}
      if(S.left&&Math.random()<dt*(1-sp.rel)*.006)fault();
      /* energy alerts, compared with the cost of driving home */
      const margin=S.e-returnCost(),lv=S.wh<=0?3:margin<4?2:margin<14?1:0;
      if(lv>S.alert&&S.left){say(['','Battery margin is thin. Check the return estimate.','Battery is barely enough to reach base.',''][lv]||'');if(lv>=2&&typeof SFX!=='undefined')SFX.alarm();}S.alert=lv;
      if(S.wh<=0){S.stranded=true;S.v=0;say('Battery exhausted. The rover is stranded.');setTimeout(end,1800);}
      S.msgT-=dt;}

    /* ----- drawing ----- */
    function draw(){const dpr=Math.min(1.5,devicePixelRatio||1),cw=cv.clientWidth||800,ch=Math.round(cw*.6);if(cv.width!==Math.round(cw*dpr)){cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);}
      const z=cv.width/VIEW_W,vw=VIEW_W,vh=cv.height/z;cam.x=clamp(cam.x,vw/2,W-vw/2);cam.y=clamp(cam.y,vh/2,H-vh/2);const ox=cam.x-vw/2,oy=cam.y-vh/2;
      ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(w.tex,ox*TS,oy*TS,vw*TS,vh*TS,0,0,cv.width,cv.height);
      ctx.setTransform(z,0,0,z,-ox*z,-oy*z);
      /* thermal image: soft sand near the rover, marked for a while after each picture */
      if(S.thermalT>S.t){ctx.fillStyle='rgba(110,170,230,.28)';for(let gx=Math.floor((S.x-260)/20)*20;gx<S.x+260;gx+=20)for(let gy=Math.floor((S.y-260)/20)*20;gy<S.y+260;gy+=20){if(Math.hypot(gx-S.x,gy-S.y)<260&&sandAt(gx,gy)>.45)ctx.fillRect(gx,gy,20,20);}}
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
        if(f.seen){const st=status(f);ctx.strokeStyle=STC[st];ctx.lineWidth=f===nf?2.5:1.3;ctx.setLineDash(f===nf?[]:[5,4]);ctx.beginPath();ctx.arc(f.x,f.y,f.r+12,0,7);ctx.stroke();ctx.setLineDash([]);
          const lab=`${f.code} · ${f.name}`;ctx.fillStyle='rgba(8,5,4,.7)';ctx.font='11px "Martian Mono",monospace';const tw=ctx.measureText(lab).width;ctx.fillRect(f.x-tw/2-5,f.y-f.r-32,tw+10,16);ctx.fillStyle='#efe6d9';ctx.fillText(lab,f.x-tw/2,f.y-f.r-20);}}
      /* base beacon */
      const pulse=(performance.now()/1000)%1.6/1.6;ctx.strokeStyle=`rgba(242,184,79,${.8*(1-pulse)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(B.x,B.y,92+pulse*40,0,7);ctx.stroke();
      if(S.emergency||S.alert>=1){ctx.strokeStyle='rgba(242,184,79,.75)';ctx.setLineDash([10,8]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(S.x,S.y);ctx.lineTo(B.x,B.y);ctx.stroke();ctx.setLineDash([]);}
      if(S.way!=null){const f=w.forms[S.way];ctx.strokeStyle='rgba(234,111,60,.6)';ctx.setLineDash([4,8]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(S.x,S.y);ctx.lineTo(f.x,f.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#ea6f3c';ctx.beginPath();ctx.arc(f.x,f.y,f.r+20,0,7);ctx.stroke();}
      /* the rover: the player's own build seen from above */
      ctx.save();ctx.translate(S.x,S.y);ctx.rotate(S.a);
      const lg=ctx.createLinearGradient(14,0,120,0);lg.addColorStop(0,'rgba(255,244,214,.22)');lg.addColorStop(1,'rgba(255,244,214,0)');ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(120,-34);ctx.lineTo(120,34);ctx.fill();
      if(spr){const sz=spr.canvas.width*sprK*spr.span/spr.canvas.width;ctx.globalAlpha=.4;ctx.filter='blur(2px) brightness(0)';ctx.drawImage(spr.canvas,spr.center[0]*sprK-sz/2+3,spr.center[1]*sprK-sz/2+3,sz,sz);ctx.filter='none';ctx.globalAlpha=1;
        ctx.drawImage(spr.canvas,spr.center[0]*sprK-sz/2,spr.center[1]*sprK-sz/2,sz,sz);}
      else{ctx.fillStyle='rgba(20,10,6,.45)';ctx.fillRect(-13,-8,30,22);ctx.fillStyle='#1c1a19';for(const wx of[-11,0,11])for(const wy of[-11.5,8.5])ctx.fillRect(wx-3.5,wy,7,3.4);
        ctx.fillStyle='#e9e5dc';ctx.fillRect(-10,-7,20,14);ctx.fillStyle='#22345f';ctx.fillRect(-7,-5,9,10);ctx.fillStyle='#f4f1ea';ctx.fillRect(12,-4,6,8);}
      if(S.drill){ctx.strokeStyle='#ea6f3c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,5);ctx.lineTo(22,9);ctx.stroke();}
      ctx.restore();
      const prog=S.drill?S.drill.t/S.drill.dur:S.busy?S.busy.t/S.busy.dur:0;if(prog){ctx.strokeStyle='#ea6f3c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(S.x,S.y,26,-Math.PI/2,-Math.PI/2+prog*6.283);ctx.stroke();}
      /* fog of war */
      ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(w.fog,ox*TS,oy*TS,vw*TS,vh*TS,0,0,cv.width,cv.height);
      /* waypoint arrow at the edge of the view when the target is off screen */
      if(S.way!=null){const f=w.forms[S.way],sx=(f.x-ox)*z,sy=(f.y-oy)*z;if(sx<0||sy<0||sx>cv.width||sy>cv.height){const a=Math.atan2(sy-cv.height/2,sx-cv.width/2),ex=cv.width/2+Math.cos(a)*(cv.width/2-26),ey=cv.height/2+Math.sin(a)*(cv.height/2-26);
        ctx.save();ctx.translate(clamp(ex,20,cv.width-20),clamp(ey,20,cv.height-20));ctx.rotate(a);ctx.fillStyle='#ea6f3c';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-8,-8);ctx.lineTo(-8,8);ctx.fill();ctx.restore();}}
      /* prompts */
      const u=cv.width/880;ctx.font=`${12*u}px "Martian Mono",monospace`;
      let prompt='';const f34=near(34);if(S.drill)prompt=sp.drill==='scoop'?'Scooping…':'Drilling…';else if(S.busy)prompt=S.busy.label;else if(S.stall>S.t)prompt='Rebooting…';else if(distBase()<70&&S.left)prompt='E  dock and end the expedition';else if(f34&&!f34.sampled&&!S.emergency&&can.sample)prompt=`E  take a sample     I  instruments`;else if(nf&&!S.emergency)prompt='I  instruments';
      if(prompt){const tw=ctx.measureText(prompt).width;ctx.fillStyle='rgba(8,5,4,.78)';ctx.fillRect(cv.width/2-tw/2-10*u,cv.height-40*u,tw+20*u,24*u);ctx.fillStyle='#f2b84f';ctx.fillText(prompt,cv.width/2-tw/2,cv.height-23*u);}
      ctx.fillStyle='rgba(239,230,217,.55)';ctx.font=`${9*u}px "Martian Mono",monospace`;ctx.fillText('SIMULATED TERRAIN · JEZERO WESTERN DELTA · '+w.site.n.toUpperCase(),10*u,16*u);
      ctx.strokeStyle='rgba(239,230,217,.7)';ctx.lineWidth=1.2*u;ctx.beginPath();ctx.moveTo(cv.width-130*u,cv.height-18*u);ctx.lineTo(cv.width-130*u+100*z,cv.height-18*u);ctx.stroke();ctx.fillText('100 m',cv.width-130*u,cv.height-24*u);}
    function ui(){const rc=returnCost(),hd=((S.a*180/Math.PI+90)%360+360)%360,o=O(),bar=(l,v,cls,txt)=>`<div class="meter ${cls}"><div class="t"><span>${l}</span><span class="num">${txt}</span></div><div class="b"><i style="width:${clamp(v,0,100)}%"></i></div></div>`;
      const m=lm(),next=RELAY.concat(opt.relayM1?[M1PASS]:[]).map(a=>a[0]).filter(t=>t>m).sort((a,b)=>a-b)[0],hm=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
      const gen=sp.peak*sunF()*S.dust+sp.rtg;
      host.querySelector('#rvclock').textContent=`Sol ${sol} · ${lmst()} LMST`;
      statEl.innerHTML=bar(`Battery ${H_('rbattery')}`,S.e,S.e<rc+4?'over':S.e<rc+14?'warn':'ok',`${S.e.toFixed(0)}% · ${Math.round(S.wh)} Wh`)+bar('Needed to drive home',rc,'warn',`${rc.toFixed(0)}%`)+bar('Rover condition',S.cond,S.cond<50?'over':'ok',`${S.cond.toFixed(0)}%`)+
        bar(`Data storage ${H_('rcomms')}`,S.mb/sp.storeMB*100,S.mb>sp.storeMB*.85?'over':'ok',`${(S.mb/1000).toFixed(2)} / ${(sp.storeMB/1000).toFixed(0)} GB`)+
        `<div class="rvnums"><div><span>Speed</span><b class="num">${(Math.abs(S.v)*.09).toFixed(1)} cm/s</b></div><div><span>Heading</span><b class="num">${String(Math.round(hd)).padStart(3,'0')}°</b></div><div><span>To base</span><b class="num">${Math.round(distBase())} m</b></div><div><span>Ground</span><b class="num">${TERRAIN[S.terr||'firm']}</b></div>
          <div><span>Power in</span><b class="num">${Math.round(gen)} W</b></div><div><span>${S.relayNow?'Relay pass':'Next relay'}</span><b class="num">${S.relayNow?'now':sp.relay&&next?hm(next):'none'}</b></div>${can.wx?`<div><span>Wind · pressure</span><b class="num">${(5+3*Math.sin(S.t/40)).toFixed(0)} m/s · ${Math.round(720+8*Math.sin(S.t/90))} Pa</b></div>`:''}${can.dose?`<div><span>Dose rate</span><b class="num">0.67 mSv/day</b></div>`:''}${can.gpr?`<div><span>Radar profile</span><b class="num">${Math.round(S.gprM)} m</b></div>`:''}</div>`;
      const row=x=>`<div class="obj ${x[1]?'done':''}"><i></i><span>${x[0]}</span>${x[2]?`<b class="num">${x[2]}</b>`:''}</div>`;
      objEl.innerHTML=o.main.map(row).join('')+`<p class="kicker" style="margin:6px 0 2px;color:var(--dim)">Optional</p>`+o.opt.map(row).join('');
      banEl.textContent=S.stranded?'ROVER STRANDED':S.emergency?'EMERGENCY RETURN · INSTRUMENTS OFF':S.alert>=2?'BATTERY CRITICAL':S.alert===1?'BATTERY MARGIN LOW':S.mb>=sp.storeMB*.98?'DATA STORAGE FULL':m>=17*60+30?'SUNSET APPROACHING':'';banEl.className='rvbanner'+(S.stranded||S.alert>=2?' bad':S.emergency||S.alert===1||S.mb>=sp.storeMB*.98?' warn':'');}
    /* a saved snapshot of the expedition, so a refresh or a later visit continues where it stopped */
    const snapshotState=()=>({S:{x:S.x,y:S.y,a:S.a,wh:S.wh,cond:S.cond,dist:S.dist,t:S.t,path:S.path.slice(-400),log:S.log.slice(0,30),samples:S.samples,photos:S.photos,left:S.left,mb:S.mb,sent:S.sent,dust:S.dust,gprM:S.gprM,wxT:S.wxT,doseT:S.doseT,
      faults:S.faults,wheelK:S.wheelK,way:S.way,atmo:S.atmo,mag:S.mag,seis:S.seis,labs:S.labs,emergency:S.emergency},forms:w.forms.map(f=>({seen:f.seen,photo:f.photo,scan:f.scan,guess:f.guess,sampled:f.sampled,micro:f.micro,lab:f.lab}))});
    function frame(now){if(!alive)return;if(!cv.isConnected){cleanup();return;}const el=Math.max(0,Math.min(.25,(now-last)/1000)),n=Math.max(1,Math.ceil(el/.034)),dt=el/n;last=now;
      /* slow devices take several small physics steps per drawn frame, so driving feels the same everywhere */
      for(let i=0;i<n;i++)step(dt);
      cam.x+=(S.x+Math.cos(S.a)*S.v*1.2-cam.x)*(1-Math.exp(-el*4));cam.y+=(S.y+Math.sin(S.a)*S.v*1.2-cam.y)*(1-Math.exp(-el*4));
      draw();uiT-=el;if(uiT<=0){ui();drawMini();uiT=.2;if(S.map)drawMap();}if(now>=saveAt&&opt.save&&!S.done&&!S.stranded){saveAt=now+3000;opt.save(snapshotState());}raf=requestAnimationFrame(frame);}
    if(R0)say(`Expedition resumed at ${lmst()}.`);else{say(`Sol ${sol}. Rover checked out at ${w.site.n}. ${w.site.d}`);say('Ten rock formations are marked on the map from orbital images.');if(opt.blind)say('Touchdown was off target among unseen rocks. A wheel took a knock: condition 88%.');}
    ui();drawMini();cv.focus();raf=requestAnimationFrame(frame);
    /* test hooks */
    window.__rover={S,world:w,O,near,sp,key:(c,v)=>{S.keys[c]=v;},goto:(x,y)=>{S.x=x;S.y=y;S.v=0;cam.x=x;cam.y=y;},interact,photo,scanResult,microscope,contactScan,dock,toggleMap,togglePanel,end,snapshot:snapshotState,fault};
  });}
  /* a microscope view: grains for sediments, crystals for igneous rock, crystal mats for veins */
  function microArt(c,cls,seed){const x=c.getContext('2d'),w=c.width,h=c.height,r=rng(seed*13+5);x.fillStyle=CLS[cls].col;x.fillRect(0,0,w,h);
    if(cls==='mud'){for(let y=0;y<h;y+=3){x.fillStyle=`rgba(70,45,30,${.1+r()*.2})`;x.fillRect(0,y,w,1.4);}}
    else if(cls==='sand'){for(let i=0;i<180;i++){const gx=r()*w,gy=r()*h,gr=6+r()*10;x.fillStyle=`rgb(${170+r()*60|0},${130+r()*50|0},${90+r()*40|0})`;x.beginPath();x.ellipse(gx,gy,gr,gr*.8,r()*3,0,7);x.fill();x.strokeStyle='rgba(60,40,25,.5)';x.stroke();}}
    else if(cls==='bas'){for(let i=0;i<220;i++){const gx=r()*w,gy=r()*h,s=4+r()*14;x.fillStyle=r()<.5?'#6f8a5a':'#2a2220';x.beginPath();x.moveTo(gx,gy-s);x.lineTo(gx+s*.8,gy);x.lineTo(gx,gy+s*.6);x.lineTo(gx-s*.7,gy);x.closePath();x.fill();}}
    else if(cls==='carb'){for(let i=0;i<300;i++){x.fillStyle=`rgba(${220+r()*30|0},${200+r()*30|0},${160+r()*30|0},.7)`;x.fillRect(r()*w,r()*h,3+r()*6,2+r()*4);}}
    else{x.fillStyle='#7a5d4c';x.fillRect(0,0,w,h);for(let i=0;i<120;i++){const gx=w*.3+r()*w*.4,gy=r()*h;x.fillStyle='rgba(245,240,230,.85)';x.save();x.translate(gx,gy);x.rotate(r()*3);x.fillRect(-12,-2,24,4);x.restore();}}
    x.fillStyle='rgba(239,230,217,.8)';x.font='10px "Martian Mono",monospace';x.fillText('1 mm',w-50,h-10);x.fillRect(w-50,h-24,36,2);}
  return {start,SITES,CLS,genForms};

})();
