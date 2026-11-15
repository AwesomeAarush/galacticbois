"use strict";
/* 3D cutscene engine (three.js r128, loaded from a CDN in index.html). The models come from js/models.js.
   Cine.play(sceneId, options) returns a Promise that resolves when the scene ends or is skipped.
   If three.js or WebGL is unavailable, a simple 2D version plays instead, so the game never blocks. */
const Cine=(()=>{
  let current=null,ok=null,T3,R,scene,cam,stars,sun,mars,earth,craft,kestrel,rocket,rk,pad,glow,flash,rings=[],parts,pv=[],beam,sunSpr,dot,gtex,bg,fog,all=[];
  const NP=420;
  /* ---- real proportions ----
     Every scene is built at real size and real distance (the renderer uses a logarithmic depth buffer so that a
     24 m spacecraft and a 6,779 km planet can share one scene). The spacecraft is 24 m long (5.4 scene units),
     Mars has a radius of 3,389.5 km and Earth 6,371 km, and planetAt() places them the stated number of
     kilometres away. So from a 300 km orbit the horizon sits 23 degrees below level, exactly as it does for a
     real orbiter, and the spacecraft can no longer sink into the surface: it is 300 km above it.
     The launch vehicle is 62 m tall and is drawn to the spacecraft's scale whenever both are in shot. */
  const MARS=3389.5,EARTH=6371,M_PER_UNIT=24/5.4,ROCKET_SCALE=62/5.1/M_PER_UNIT,FY=2.72;
  const sprite=(c,b)=>Models.sprite(c,b);
  const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),sm=(a,b,x)=>{const t=cl((x-a)/(b-a));return t*t*(3-2*t);},mix=(a,b,t)=>a+(b-a)*t;
  const nrm=(x,y,z)=>{const l=Math.hypot(x,y,z);return [x/l,y/l,z/l];};
  /* true size and true distance: one scene unit is mpu metres (4.4 m in spacecraft shots, 12.2 m in rocket shots) */
  function planetAt(p,Rkm,distKm,dir,mpu=M_PER_UNIT){const rad=Rkm*1000/mpu,Dr=distKm*1000/mpu;p.scale.setScalar(rad);p.position.set(dir[0]*Dr,dir[1]*Dr,dir[2]*Dr);}
  const setSun=(x,y,z)=>sun.position.set(x,y,z);

  function buildPad(){const g=new T3.Group(),S=o=>new T3.MeshStandardMaterial(Object.assign({roughness:1,metalness:0,envMapIntensity:0},o));
    const c=document.createElement('canvas');c.width=c.height=1024;const x=c.getContext('2d'),r=rng(5);x.fillStyle='#66704c';x.fillRect(0,0,1024,1024);
    for(let i=0;i<1400;i++){const v=r();x.fillStyle=`rgba(${70+v*70|0},${82+v*50|0},${48+v*30|0},.35)`;x.beginPath();x.ellipse(r()*1024,r()*1024,6+r()*40,4+r()*22,r()*3,0,7);x.fill();}
    x.fillStyle='#24557c';x.beginPath();x.moveTo(1024,0);for(let j=0;j<=1024;j+=32)x.lineTo(700+Math.sin(j*.011)*60+r()*24,j);x.lineTo(1024,1024);x.fill();
    x.strokeStyle='rgba(232,222,196,.8)';x.lineWidth=5;x.beginPath();for(let j=0;j<=1024;j+=32)x.lineTo(698+Math.sin(j*.011)*60,j);x.stroke();
    x.strokeStyle='#8f8a80';x.lineWidth=3;x.beginPath();x.moveTo(512,512);x.lineTo(60,640);x.moveTo(512,512);x.lineTo(380,40);x.stroke();
    const t=new T3.CanvasTexture(c);t.encoding=T3.sRGBEncoding;t.anisotropy=8;
    const gr=new T3.Mesh(new T3.CircleGeometry(1300,72),S({map:t,color:0x5a5a5a}));gr.rotation.x=-Math.PI/2;g.add(gr);
    const apron=new T3.Mesh(new T3.CircleGeometry(7,48),S({color:0x4e4c48}));apron.rotation.x=-Math.PI/2;apron.position.y=.02;g.add(apron);
    const B=(w,h,d,m,px,py,pz)=>{const o=new T3.Mesh(new T3.BoxGeometry(w,h,d),m);o.position.set(px,py,pz);g.add(o);return o;};
    const conc=S({color:0x77736b}),steel=S({color:0x7d2f22,roughness:.7,metalness:.3}),dark=S({color:0x1c1b1a});
    B(2.6,.16,2.6,conc,0,.08,0);B(.9,.05,7,dark,0,.03,4.4);B(5,.03,160,S({color:0x8d887d}),-6,.025,-78);
    for(const sx of[-1,1])for(const sz of[-1,1])B(.07,5.7,.07,steel,-1.45+sx*.3,2.85,sz*.3);
    for(let y=.5;y<5.7;y+=.65){B(.67,.045,.045,steel,-1.45,y,.3);B(.67,.045,.045,steel,-1.45,y,-.3);B(.045,.045,.67,steel,-1.15,y,0);B(.045,.045,.67,steel,-1.75,y,0);
      const d=B(.9,.035,.035,steel,-1.45,y+.32,.3);d.rotation.z=.75*(Math.round(y/.65)%2?1:-1);}
    B(.05,1.5,.05,S({color:0xd8d8d8,metalness:.6,roughness:.4}),-1.45,6.4,0);
    const arm=new T3.Group();for(const y of[1.6,3.1,4.3]){const a=new T3.Mesh(new T3.BoxGeometry(.9,.07,.12),steel);a.position.set(-.72,y,0);arm.add(a);}g.add(arm);
    for(const [px,pz,h] of[[-24,-10,1.6],[-30,6,1.1],[18,-30,2.2]]){B(4,h,6,conc,px,h/2,pz);}
    for(const a of[.6,2.7,4.8]){B(.06,7.5,.06,S({color:0xd0d0d0,metalness:.5,roughness:.5}),Math.cos(a)*5.5,3.75,Math.sin(a)*5.5);}
    g.userData.arm=arm;return g;}

  function init(){
    if(ok!==null)return ok;
    try{
      T3=window.THREE;if(!T3)throw new Error('three.js not loaded');
      R=new T3.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true});R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));R.setClearColor(0x000000);Models.grade(R);
      scene=new T3.Scene();cam=new T3.PerspectiveCamera(42,1,.3,4e9);bg=new T3.Color();fog=new T3.Fog(0x7fb2e6,120,1250);
      gtex=Models.sprite(0xffffff).material.map;
      const sg=new T3.BufferGeometry(),sp=new Float32Array(2600*3),r=rng(77);
      for(let i=0;i<2600;i++){const a=r()*Math.PI*2,z=r()*2-1,q=Math.sqrt(1-z*z);sp[i*3]=q*Math.cos(a)*3200;sp[i*3+1]=z*3200;sp[i*3+2]=q*Math.sin(a)*3200;}
      sg.setAttribute('position',new T3.BufferAttribute(sp,3));
      stars=new T3.Points(sg,new T3.PointsMaterial({color:0xefe6d9,size:1.7,sizeAttenuation:false,fog:false,depthTest:false,depthWrite:false}));stars.renderOrder=-10;stars.frustumCulled=false;scene.add(stars);
      sun=new T3.DirectionalLight(0xfff3e2,2.8);scene.add(sun);scene.add(new T3.AmbientLight(0x6a5a52,.22));scene.environment=Models.envMap();
      mars=Models.planet('mars');earth=Models.planet('earth');kestrel=Models.craft({grey:true,wing:1,dish:1});rk=new T3.Group();rocket=Models.rocket();rocket.rotation.y=.8;rk.add(rocket);pad=buildPad();
      glow=sprite(0xea6f3c);flash=sprite(0xffffff);sunSpr=sprite(0xfff0c8);dot=sprite(0x9fd0ff);flash.material.fog=false;
      for(let i=0;i<4;i++){const m=new T3.Mesh(new T3.RingGeometry(.965,1,72),new T3.MeshBasicMaterial({color:0xf2b84f,transparent:true,side:T3.DoubleSide,blending:T3.AdditiveBlending,depthWrite:false}));rings.push(m);}
      const pg=new T3.BufferGeometry();pg.setAttribute('position',new T3.BufferAttribute(new Float32Array(NP*3),3));
      parts=new T3.Points(pg,new T3.PointsMaterial({size:.35,map:gtex,color:0xf2b84f,transparent:true,blending:T3.AdditiveBlending,depthWrite:false}));parts.frustumCulled=false;
      beam=new T3.Mesh(new T3.ConeGeometry(1,1,40,1,true),new T3.MeshBasicMaterial({color:0x8fc8da,transparent:true,opacity:.2,side:T3.DoubleSide,blending:T3.AdditiveBlending,depthWrite:false}));
      all=[mars,earth,kestrel,rk,pad,glow,flash,sunSpr,dot,parts,beam,...rings];all.forEach(x=>scene.add(x));
      ok=true;
    }catch(e){console.warn('3D cutscenes unavailable, using 2D fallback:',e&&e.message);ok=false;}
    return ok;}
  function show(...on){all.forEach(x=>{x.visible=on.includes(x);});if(craft)craft.visible=on.includes(craft);}
  const flame=(g,on,k=1)=>{const f=g.userData.flame;f.visible=on;if(on)f.scale.setScalar((1.6+Math.random()*.7)*k);};
  function resetRocket(){const d=rocket.userData;d.srb.forEach((b,i)=>{b.position.set((i?1:-1)*.325,0,0);b.rotation.set(0,0,0);b.visible=true;});d.core.position.set(0,0,0);d.core.visible=true;d.up.visible=true;
    d.fair.forEach(f=>{f.position.set(0,FY,0);f.rotation.set(0,0,0);f.visible=true;});if(d.pay)d.pay.visible=true;d.flame.visible=false;rk.scale.setScalar(1);rk.position.set(0,0,0);rk.rotation.set(0,0,0);}
  /* particles: 'burst' (debris), 'stream' (hot gas flowing back along +x to -x), 'smoke' (launch pad and exhaust trail) */
  function seedParts(mode,x0=2.9){const p=parts.geometry.attributes.position.array;pv=[];
    for(let i=0;i<NP;i++){if(mode==='burst'){const a=Math.random()*6.283,z=Math.random()*2-1,q=Math.sqrt(1-z*z),v=2+Math.random()*16;pv.push([q*Math.cos(a)*v,z*v,q*Math.sin(a)*v]);p[i*3]=p[i*3+1]=p[i*3+2]=0;}
      else if(mode==='smoke'){pv.push([0,0,0,9]);p[i*3]=0;p[i*3+1]=-50;p[i*3+2]=0;}
      else{pv.push([-(9+Math.random()*14),0,0]);p[i*3]=x0-Math.random()*16;p[i*3+1]=(Math.random()-.5)*2.2;p[i*3+2]=(Math.random()-.5)*2.6;}}
    parts.userData.mode=mode;parts.userData.x0=x0;parts.geometry.attributes.position.needsUpdate=true;}
  function stepParts(mode,dt,h=0,rate=1){const p=parts.geometry.attributes.position.array,x0=parts.userData.x0||2.9;
    for(let i=0;i<NP;i++){const v=pv[i];p[i*3]+=v[0]*dt;p[i*3+1]+=v[1]*dt;p[i*3+2]+=v[2]*dt;
      if(mode==='stream'&&p[i*3]<x0-16){p[i*3]=x0;p[i*3+1]=(Math.random()-.5)*2.2;p[i*3+2]=(Math.random()-.5)*2.6;}
      if(mode==='burst'){v[0]*=.992;v[1]*=.992;v[2]*=.992;}
      if(mode==='smoke'){v[3]+=dt;v[0]*=.97;v[2]*=.97;if(p[i*3+1]<.15&&v[1]<0){p[i*3+1]=.15;v[1]=.6+Math.random()*1.6;const a=Math.random()*6.283,sp=5+Math.random()*13;v[0]=Math.cos(a)*sp;v[2]=Math.sin(a)*sp;}
        if(v[3]>2.6+Math.random()*2&&Math.random()<rate){v[3]=0;const a=Math.random()*6.283;p[i*3]=Math.cos(a)*.25;p[i*3+2]=Math.sin(a)*.25;p[i*3+1]=h-.2;v[0]=Math.cos(a)*1.2;v[2]=Math.sin(a)*1.2;v[1]=-(9+Math.random()*7);}}}
    parts.geometry.attributes.position.needsUpdate=true;}

  /* Each scene positions objects and the camera for progress u (0..1) and time s (seconds). */
  const SC={
    /* Kestrel in its 300 km science orbit: the horizon sits 23 degrees below level, as it really does from that height */
    prologue(u,s){show(mars,kestrel);setSun(-5,3,3);planetAt(mars,MARS,MARS+300,nrm(.12,-1,-.2));mars.rotation.set(s*.006,1.1,.3);
      const dead=u>.62,t=dead?u-.62:0;kestrel.position.set(-1.5+u*3,0,0);kestrel.rotation.set(.2+t*1.5,.9+s*.02,t*1.1);
      kestrel.userData.lamp.visible=u<.5?true:u<.62?Math.sin(s*38)>0:false;
      cam.position.set(6-u*2,2.6,12.5-u*2);cam.lookAt(kestrel.position.x*.5,-1.6,0);},
    /* Launch in two shots. On the pad: a 62 m rocket, a tower and a horizon five kilometres away.
       Then from 90 to 240 km up: booster separation, stage separation, fairing jettison. */
    launch(u,s,o,dt){const T0=.27,CUT=.56,D=rocket.userData,f=D.flame;
      if(u<CUT){show(pad,rk,parts,flash);resetRocket();const l=cl((u-T0)/(CUT-T0)),h=l*l*85,sky=l*l*.8;
        setSun(5,6,4);bg.setRGB(mix(.16,.004,sky),mix(.33,.012,sky),mix(.62,.05,sky));sun.intensity=2;scene.background=bg;fog.color.copy(bg);scene.fog=fog;stars.visible=false;
        rk.position.set(0,h+.16,0);rk.rotation.set(0,0,-l*l*.1);pad.userData.arm.visible=u<T0-.05;
        const lit=u>T0-.045;f.visible=lit;f.position.y=-1;f.scale.set(1.1+Math.random()*.3,(u<T0?1:2.6)+Math.random()*.6,1);
        if(parts.userData.mode!=='smoke')seedParts('smoke');parts.material.color.set(0xcfc6ba);parts.material.size=3;parts.material.opacity=.05;if(lit)stepParts('smoke',dt,h,u<T0?.5:1);
        const sh=lit?.07*(1-l):0,j=()=>(Math.random()-.5)*sh;cam.position.set(8+j(),.9+h*.62+j(),11.5+l*3);cam.lookAt(-.3,h+2.7-l*.6,0);
        const w=sm(CUT-.04,CUT,u);flash.position.copy(cam.position).add(new T3.Vector3(-.5,.2,-1).normalize().multiplyScalar(3));flash.scale.setScalar(40);flash.material.opacity=w;flash.visible=w>0;}
      else{const m=(u-CUT)/(1-CUT);show(earth,rk,flash);resetRocket();scene.background=null;scene.fog=null;stars.visible=true;setSun(-3,4,5);sun.intensity=2;
        planetAt(earth,EARTH,EARTH+90+m*150,nrm(0,-1,0),62/5.1);earth.userData.clouds.material.opacity=.3;earth.rotation.set(.75,2.2,.2+s*.0004);
        const pitch=-1.08,ax=Math.sin(-pitch),ay=Math.cos(pitch);rk.rotation.set(0,0,pitch);
        const q=cl((m-.1)/.26);D.srb.forEach((b,i)=>{const d=i?1:-1;b.position.set(d*(.325+q*2.4),-q*q*8,0);b.rotation.z=d*q*1.5;b.visible=q<1;});
        const r=cl((m-.48)/.26);D.core.position.y=-r*r*10;D.core.visible=r<1;
        const q2=cl((m-.66)/.26);D.fair.forEach((h,i)=>{const d=i?1:-1;h.position.set(0,FY-q2*q2*5,d*q2*2.6);h.rotation.x=d*q2*1.25;h.visible=q2<1;});
        const first=m<.46,second=m>.54;f.visible=first||second;f.position.y=first?-1:1.95;{const k=(first?1.7:.8)*(1+Math.random()*.25);f.scale.set(k,k,1);}
        const y=2.2+m*1.6;cam.position.set(-7+m*11,-.6+m*1.6,13.5-m*5.5);cam.lookAt(ax*y,ay*y-1.6,0);
        const w=1-sm(0,.07,m);flash.position.copy(cam.position).add(new T3.Vector3(.3,0,-1).normalize().multiplyScalar(3));flash.scale.setScalar(40);flash.material.opacity=w;flash.visible=w>0;}},
    /* The upper stage finishes the departure burn, lets go, and the spacecraft unfolds. Earth falls away behind. */
    depart(u,s){show(earth,craft,rk);resetRocket();const D=rocket.userData;setSun(-5,3,4);
      sun.intensity=2;earth.userData.clouds.material.opacity=.7;planetAt(earth,EARTH,EARTH+2500+u*u*32000,nrm(-.2,-.5,-.85));earth.rotation.set(.4,2.6+s*.01,.1);
      D.srb.forEach(b=>b.visible=false);D.core.visible=false;D.fair.forEach(h=>h.visible=false);if(D.pay)D.pay.visible=false;
      const sep=sm(.26,.9,u)*14,aft=craft.userData.glb?-2.7:-.8;rk.scale.setScalar(ROCKET_SCALE);rk.rotation.set(Math.PI/2,0,0);rk.position.set(0,-sep*.08,aft-(FY+.04)*ROCKET_SCALE-sep);
      D.flame.visible=u<.2;D.flame.position.y=1.95;D.flame.scale.set(.55+Math.random()*.15,1.5+Math.random()*.5,1);
      craft.position.set(0,0,0);craft.rotation.set(0,0,sm(.3,1,u)*.5);if(craft.userData.deploy)craft.userData.deploy(sm(.4,.78,u));
      const a=.95-u*.5;cam.position.set(Math.sin(a)*14,3.2+u,Math.cos(a)*14-3+u*3);cam.lookAt(0,0,-3+u*3);},
    /* Deep space. Mars is 400,000 km ahead: a disc one degree across. */
    aura(u,s,o){show(mars,craft,glow,...rings);setSun(-6,3,5);planetAt(mars,MARS,400000-u*120000,nrm(.55,-.12,-1));mars.rotation.set(0,2+s*.012,0);
      craft.position.set(0,0,0);craft.rotation.set(.25,s*.22,-.15);
      const a=-.9+u*1.5,r=13-u*2.5;cam.position.set(Math.sin(a)*r,1.6-u*.6,Math.cos(a)*r);cam.lookAt(0,-.3,0);
      stars.rotation.y-=.03*Math.pow(1-u,3);
      const q=o.q??2;glow.position.copy(craft.position);glow.material.color.set(0xea6f3c);glow.material.opacity=.7;glow.scale.setScalar((10+Math.sin(s*5))*(.55+q*.28));
      rings.forEach((g,i)=>{const p=(s*.32+i/4)%1;g.rotation.set(0,0,0);g.position.copy(craft.position);g.material.color.set(0xf2b84f);g.scale.setScalar(1.5+p*11*(.4+q*.35));g.material.opacity=.65*(1-p);g.lookAt(cam.position);});},
    /* Approach: from 150,000 km (a disc under three degrees wide) to 9,000 km (over forty) */
    arrival(u,s){show(mars,craft);setSun(-6,2,4);const e=u*u*(3-2*u);planetAt(mars,MARS,150000*Math.pow(9000/150000,e),nrm(.22,-.1,-1));mars.rotation.set(.2,.5+s*.02,0);
      craft.position.set(-2.6,-.9,0);craft.rotation.set(.08,Math.PI+.35+s*.015,.05);cam.position.set(3.4,1.6,12.5-u*1.5);cam.lookAt(.6,-.4,-10);},
    /* Orbit insertion at 300 km. Engine first, braking against the direction of travel, through Mars's shadow and out again. */
    capture(u,s){show(mars,craft);const night=sm(.3,.48,u)*(1-sm(.7,.88,u));setSun(-5,3.2-night*10,4);
      planetAt(mars,MARS,MARS+300,nrm(.1,-1,-.25));mars.rotation.set(.4,1.2,s*.012);
      craft.position.set(0,0,0);craft.rotation.set(.06,-Math.PI/2,0);flame(craft,u<.52,1+.2*Math.sin(s*40));
      cam.position.set(5-u*9,2.4+u*.8,13.5-u*1.5);cam.lookAt(-.5,-1.8,0);},
    /* The burn ends early. Nothing dramatic happens to the spacecraft: Mars simply gets smaller. */
    flyby(u,s){show(mars,craft);setSun(-5,3.2,4);const e=u*u,v=sm(0,.45,u);planetAt(mars,MARS,MARS+300+e*52000,nrm(.1-v*.25,-1+v*.86,-.25-v*1.5));mars.rotation.set(.4,1.2,s*.012);
      craft.position.set(0,0,0);craft.rotation.set(.06,-Math.PI/2+u*.5,u*.3);flame(craft,u<.1||(u<.2&&Math.sin(s*31)>.2),.8);
      cam.position.set(5-u*3,2.4+u*1.5,13.5+u*2);cam.lookAt(-.5,-1.2+u,0);},
    /* The burn ran long: the low point of the orbit falls to 70 km and the air does the rest */
    toodeep(u,s,o,dt){const hit=u>.7,b=cl((u-.7)/.3);show(mars,...(hit?[flash]:[craft,glow]),parts);setSun(-5,3,4);
      planetAt(mars,MARS,MARS+115-cl(u/.7)*50,nrm(.05,-1,-.18));mars.rotation.set(.4,1.2,s*.02);
      const heat=cl(u/.7),j=()=>(Math.random()-.5)*heat*.22;craft.position.set(j(),j(),0);craft.rotation.set(heat*.5*Math.sin(s*3),Math.PI/2,.12+heat*.6*Math.sin(s*2.3));
      glow.position.set(2.6,-.2,0);glow.material.color.set(0xff6a2c);glow.material.opacity=.3+.6*heat;glow.scale.setScalar(6+heat*9+Math.sin(s*30));
      if(hit&&parts.userData.mode!=='burst'){seedParts('burst');}
      parts.material.color.set(hit?0xf2b84f:0xff9a50);parts.material.size=hit?.6:.45;parts.material.opacity=1;stepParts(hit?'burst':'stream',dt);
      flash.position.set(0,0,0);flash.scale.setScalar(8+b*90);flash.material.opacity=Math.max(0,1-b*2.2);
      cam.position.set(7.5+j()*2,2.6+j()*2,13);cam.lookAt(0,-1.2,0);},
    /* Aerobraking at 125 km: the horizon is only 15 degrees below level and the air is thick enough to glow */
    aerobrake(u,s,o,dt){show(mars,craft,glow,parts);setSun(-5,3,4);planetAt(mars,MARS,MARS+125,nrm(.05,-1,-.18));mars.rotation.set(.4,1.2,s*.02);
      craft.position.set(0,Math.sin(s*9)*.05,0);craft.rotation.set(0,Math.PI/2,.12);
      glow.position.set(2.7,-.2,0);glow.material.color.set(0xff7a3c);glow.material.opacity=.45+.35*Math.sin(u*Math.PI);glow.scale.setScalar(7.5+Math.sin(s*30));
      parts.material.color.set(0xff9a50);parts.material.size=.45;parts.material.opacity=1;stepParts('stream',dt);
      cam.position.set(8-u*2.8,2.8,13);cam.lookAt(0,-1,0);},
    /* An instrument looks straight down 300 km */
    discovery(u,s,o){show(mars,craft,beam,...rings);setSun(-5,3.5,3);planetAt(mars,MARS,MARS+300,nrm(0,-1,0));mars.rotation.set((o.tilt||0)+s*.006,1.4,0);
      craft.position.set(0,0,0);craft.rotation.set(0,.5+s*.05,0);const L=300000/M_PER_UNIT;
      beam.position.set(0,-L/2-.3,0);beam.scale.set(L*.035,L,L*.035);beam.material.color.set(o.col||0x8fc8da);beam.material.opacity=.045+.02*Math.sin(s*6);
      rings.forEach((g,i)=>{const p=(s*.4+i/4)%1;g.rotation.set(Math.PI/2,0,0);g.position.set(0,-.3-p*L,0);g.scale.setScalar(.1+p*L*.034);g.material.color.set(o.col||0x8fc8da);g.material.opacity=.8*(1-p*.6);});
      const a=.5+u*1.1;cam.position.set(Math.sin(a)*12,5.2-u,Math.cos(a)*12);cam.lookAt(0,-2.2,0);},
    /* End of mission, 400 km up. Earth is a blue point above the horizon. */
    finale(u,s){show(mars,craft,dot);setSun(-5,3,4);planetAt(mars,MARS,MARS+400,nrm(.1,-1,-.3));mars.rotation.set(s*.004,2,.2);
      dot.position.set(330+u*20,215,-1300);dot.scale.setScalar(15);dot.material.opacity=.95;
      craft.position.set(-1.5,0,0);craft.rotation.set(.1,2.4+s*.03,.08);cam.position.set(4.5-u*1.5,1.8,14-u*2.5);cam.lookAt(1,-1.7,-6);},
    explosion(u,s,o,dt){show(craft,flash,parts);craft.visible=u<.1;craft.position.set(0,0,0);craft.rotation.set(s*3,s*2,0);setSun(-6,3,5);
      flash.position.set(0,0,0);flash.scale.setScalar(8+u*90);flash.material.opacity=Math.max(0,1-u*2.4);
      parts.material.color.set(0xf2b84f);parts.material.size=.6;parts.material.opacity=1;if(u>.08)stepParts('burst',dt);
      cam.position.set((Math.random()-.5)*.4*(1-u),1.5+(Math.random()-.5)*.4*(1-u),16+u*6);cam.lookAt(0,0,0);}
  };

  function draw2(ctx,W,H,u,s){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);const r=rng(9);ctx.fillStyle='rgba(239,230,217,.7)';for(let i=0;i<160;i++)ctx.fillRect((r()*W+W-s*14*(.3+r()))%W,r()*H,1.6,1.6);
    const mr=H*.9,mx=W*.86,my=H*1.45-u*H*.2,g=ctx.createRadialGradient(mx-mr*.3,my-mr*.5,mr*.2,mx,my,mr);g.addColorStop(0,'#d77a48');g.addColorStop(.8,'#8a3f22');g.addColorStop(1,'#2a100a');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(mx,my,mr,0,7);ctx.fill();
    drawCraft(ctx,W*(.2+.25*u),H*.5,1.7,{wing:S.sel.power,dish:S.sel.comms,inst:S.fl?S.fl.on:undefined,rot:-.3+u*.25});}

  function play(id,o={}){return new Promise(res=>{
    const lines=o.lines||[],dl=lines.map(l=>2+l.text.length*.055),total=Math.max(o.min||5,dl.reduce((a,b)=>a+b,0)+.9);
    const el=document.createElement('div');el.className='cine';
    el.innerHTML=`<div class="big" id="cBig">${o.big||''}</div><div class="capwrap"><div class="aura" id="cAura"></div><div class="cap" id="cCap" aria-live="polite"></div></div><button class="ghost skip" id="cSkip">Skip</button><div class="cfade" id="cFade"></div>`;
    document.body.appendChild(el);
    const use3=init()&&!!SC[id];let c2,ctx2;
    const size=()=>{if(use3){R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.fov=innerWidth<innerHeight?62:42;cam.updateProjectionMatrix();}else{c2.width=innerWidth;c2.height=innerHeight;}};
    if(use3){el.prepend(R.domElement);
      if(craft){scene.remove(craft);}
      craft=Models.craft(Object.assign({},craftOpts(),{computer:S.sel.computer}));scene.add(craft);
      if(id==='launch'||id==='depart'){rk.remove(rocket);rocket=Models.rocket({payload:craftOpts()});rocket.rotation.y=.8;rk.add(rocket);}
      setSun(-6,3,5);sun.intensity=2.8;stars.rotation.set(0,0,0);stars.visible=true;scene.background=null;scene.fog=null;craft.scale.setScalar(1);parts.userData.mode='';
      if(id==='explosion')seedParts('burst');if(id==='aerobrake'||id==='toodeep')seedParts('stream');
    }else{c2=document.createElement('canvas');el.prepend(c2);ctx2=c2.getContext('2d');}
    size();addEventListener('resize',size);
    const still=matchMedia('(prefers-reduced-motion: reduce)').matches,k=Math.max(DEMO.k,.02),t0=performance.now();
    let alive=true,last=t0,shown=-2;
    const cap=el.querySelector('#cCap'),big=el.querySelector('#cBig'),au=el.querySelector('#cAura');
    /* Transitions: every scene fades up from black and back down to black. The black cover stays for a
       moment after the scene ends, so a following scene or the next game screen is revealed by a fade
       instead of a hard cut. */
    const fadeEl=el.querySelector('#cFade'),FT=still?0:Math.round(520*Math.min(1,k));let closing=false;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!closing){fadeEl.style.transitionDuration=FT+'ms';fadeEl.classList.add('clear');el.classList.add('on');}}));
    const finish=()=>{if(!alive)return;alive=false;current=null;removeEventListener('resize',size);
      if(use3&&R.domElement.parentNode===el)el.removeChild(R.domElement);el.querySelectorAll('.big,.capwrap,.skip,canvas').forEach(x=>x.remove());
      el.classList.add('out');el.style.transitionDuration=FT+'ms';
      if(o.aura){S.aura+=o.aura;}if(typeof chrome==='function')chrome();res();
      requestAnimationFrame(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),FT+60);});};
    const end=(fast)=>{if(!alive||closing)return;closing=true;
      if(fast===true||!FT)return finish();
      fadeEl.style.transitionDuration=FT+'ms';fadeEl.classList.remove('clear');el.classList.remove('on');setTimeout(finish,FT+30);};
    current=()=>{closing=false;end(true);};
    el.querySelector('#cSkip').onclick=()=>end();
    (function fr(now){if(!alive)return;
      let s=(now-t0)/1000/k,u=Math.min(1,s/total);const dt=Math.min(.05,(now-last)/1000);last=now;
      if(o.at!=null){u=o.at;s=u*total+(now-t0)/1000*.0;} /* o.at freezes the scene at one moment (used to check every shot) */
      let acc=0,cur=-1;for(let i=0;i<lines.length;i++){if(s>=acc+.25&&s<acc+dl[i])cur=i;acc+=dl[i];}
      if(cur!==shown){shown=cur;const l=lines[cur];cap.innerHTML=l?`${l.who?`<span class="who">${WHO[l.who][0]}</span>`:''}${l.text}`:'';}
      if(o.count){const n=Math.ceil((.27-u)/.27*5);big.textContent=n>0?n:'Lift-off';big.classList.toggle('in',u<.5);}
      else if(o.big&&u>(o.bigAt??.12))big.classList.add('in');
      if(o.aura&&u>.5){au.classList.add('in');au.textContent='AURA +'+Math.round(o.aura*Math.min(1,(u-.5)/.3)).toLocaleString('en-US');}
      if(use3){SC[id](still?.5:u,still?3:s,o,dt);mars.userData.sun.copy(sun.position).normalize();earth.userData.sun.copy(sun.position).normalize();earth.userData.clouds.rotation.y+=dt*.004;R.render(scene,cam);}else draw2(ctx2,c2.width,c2.height,u,s);
      if(s>=total&&!closing&&o.at==null)end();
      requestAnimationFrame(fr);})(t0);
  });}
  return {play,skip:()=>{if(current)current();},get playing(){return !!current},scenes:()=>Object.keys(SC),get mode(){return ok===null?'not started':ok?'3d':'2d'}};
})();
