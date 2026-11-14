"use strict";
/* 3D cutscene engine (three.js r128, loaded from a CDN in index.html). The models come from js/models.js.
   Cine.play(sceneId, options) returns a Promise that resolves when the scene ends or is skipped.
   If three.js or WebGL is unavailable, a simple 2D version plays instead, so the game never blocks. */
const Cine=(()=>{
  let ok=null,T3,R,scene,cam,stars,sun,mars,earth,craft,kestrel,rocket,glow,flash,rings=[],parts,pv=[],beam,sunSpr,dot,gtex;
  const NP=420;

  const sprite=(c,b)=>Models.sprite(c,b);

  function init(){
    if(ok!==null)return ok;
    try{
      T3=window.THREE;if(!T3)throw new Error('three.js not loaded');
      R=new T3.WebGLRenderer({antialias:true});R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));R.setClearColor(0x000000);Models.grade(R);
      scene=new T3.Scene();cam=new T3.PerspectiveCamera(42,1,.1,5000);
      gtex=Models.sprite(0xffffff).material.map;
      const sg=new T3.BufferGeometry(),sp=new Float32Array(2600*3),r=rng(77);
      for(let i=0;i<2600;i++){const a=r()*Math.PI*2,z=r()*2-1,q=Math.sqrt(1-z*z);sp[i*3]=q*Math.cos(a)*1800;sp[i*3+1]=z*1800;sp[i*3+2]=q*Math.sin(a)*1800;}
      sg.setAttribute('position',new T3.BufferAttribute(sp,3));
      stars=new T3.Points(sg,new T3.PointsMaterial({color:0xefe6d9,size:1.7,sizeAttenuation:false}));scene.add(stars);
      sun=new T3.DirectionalLight(0xfff3e2,2.8);scene.add(sun);scene.add(new T3.AmbientLight(0x6a5a52,.22));scene.environment=Models.envMap();
      mars=Models.planet('mars');earth=Models.planet('earth');kestrel=Models.craft({grey:true,wing:1,dish:1});rocket=Models.rocket();
      glow=sprite(0xea6f3c);flash=sprite(0xffffff);sunSpr=sprite(0xfff0c8);dot=sprite(0x9fd0ff);
      for(let i=0;i<4;i++){const m=new T3.Mesh(new T3.RingGeometry(.965,1,72),new T3.MeshBasicMaterial({color:0xf2b84f,transparent:true,side:T3.DoubleSide,blending:T3.AdditiveBlending,depthWrite:false}));rings.push(m);}
      const pg=new T3.BufferGeometry();pg.setAttribute('position',new T3.BufferAttribute(new Float32Array(NP*3),3));
      parts=new T3.Points(pg,new T3.PointsMaterial({size:.35,map:gtex,color:0xf2b84f,transparent:true,blending:T3.AdditiveBlending,depthWrite:false}));
      beam=new T3.Mesh(new T3.ConeGeometry(1,1,40,1,true),new T3.MeshBasicMaterial({color:0x8fc8da,transparent:true,opacity:.2,side:T3.DoubleSide,blending:T3.AdditiveBlending,depthWrite:false}));
      [mars,earth,kestrel,rocket,glow,flash,sunSpr,dot,parts,beam,...rings].forEach(x=>scene.add(x));
      ok=true;
    }catch(e){console.warn('3D cutscenes unavailable, using 2D fallback:',e&&e.message);ok=false;}
    return ok;}
  function show(...on){[mars,earth,craft,kestrel,rocket,glow,flash,sunSpr,dot,parts,beam,...rings].forEach(x=>{if(x)x.visible=on.includes(x);});}
  const flame=(g,on)=>{const f=g.userData.flame;f.visible=on;if(on)f.scale.setScalar(1+Math.random()*.5);};
  function seedParts(mode){const p=parts.geometry.attributes.position.array;pv=[];
    for(let i=0;i<NP;i++){if(mode==='burst'){const a=Math.random()*6.283,z=Math.random()*2-1,q=Math.sqrt(1-z*z),v=1+Math.random()*9;pv.push([q*Math.cos(a)*v,z*v,q*Math.sin(a)*v]);p[i*3]=p[i*3+1]=p[i*3+2]=0;}
      else{pv.push([-(5+Math.random()*9),0,0]);p[i*3]=1.4-Math.random()*10;p[i*3+1]=(Math.random()-.5)*1.3;p[i*3+2]=(Math.random()-.5)*1.6;}}
    parts.geometry.attributes.position.needsUpdate=true;}
  function stepParts(mode,dt){const p=parts.geometry.attributes.position.array;
    for(let i=0;i<NP;i++){p[i*3]+=pv[i][0]*dt;p[i*3+1]+=pv[i][1]*dt;p[i*3+2]+=pv[i][2]*dt;
      if(mode==='stream'&&p[i*3]<-9){p[i*3]=1.4;p[i*3+1]=(Math.random()-.5)*1.3;p[i*3+2]=(Math.random()-.5)*1.6;}
      if(mode==='burst'){pv[i][0]*=.99;pv[i][1]*=.99;pv[i][2]*=.99;}}
    parts.geometry.attributes.position.needsUpdate=true;}

  /* Each scene positions objects and the camera for progress u (0..1) and time s (seconds). */
  const SC={
    prologue(u,s){show(mars,kestrel);mars.scale.setScalar(10);mars.position.set(0,0,0);mars.rotation.set(0,1+s*.012,0);
      const dead=u>.62;kestrel.position.set(-2+u*3,3.2,12.5);kestrel.rotation.set(.3+(dead?(u-.62)*4:0),s*.1,.2+(dead?(u-.62)*2.5:0));
      kestrel.userData.lamp.visible=u<.5?true:u<.62?Math.sin(s*38)>0:false;
      cam.position.set(3.6-u*1.4,4.6,19.5-u*2.5);cam.lookAt(kestrel.position.x*.6,2.7,8);},
    launch(u,s){show(earth,rocket);earth.scale.setScalar(40);earth.position.set(0,-40,0);earth.rotation.set(.5,2.2,0);
      const l=Math.max(0,u-.3)/.7,y=l*l*17;rocket.position.set(l*l*3,y,0);rocket.rotation.set(0,0,-l*.4);
      const f=rocket.userData.flame;f.visible=u>.26;f.scale.set(1+Math.random()*.4,2+Math.random()*.8+l*3,1);
      const sh=u>.26?.05*(1-l):0;cam.position.set(6+(Math.random()-.5)*sh,2.6+y*.75+(Math.random()-.5)*sh,12+l*9);cam.lookAt(rocket.position.x,.6+y*.62,0);},
    depart(u,s){show(earth,craft);earth.scale.setScalar(8);earth.position.set(0,0,0);earth.rotation.set(.3,s*.03,0);
      const d=11+u*u*40;craft.position.set(d*.55,2+u*3,d*.83);craft.rotation.set(.2,.55+s*.04,.1);flame(craft,u<.4);
      cam.position.set(craft.position.x+2.4,craft.position.y+1.2,craft.position.z+6);cam.lookAt(craft.position.x*.78,craft.position.y*.8,craft.position.z*.78);},
    aura(u,s,o){show(mars,craft,glow,...rings);mars.scale.setScalar(16);mars.position.set(21,-15,-36+u*7);mars.rotation.set(0,2+s*.012,0);
      craft.position.set(0,0,0);craft.rotation.set(.25,s*.22,-.15);
      const a=-.9+u*1.5,r=8.4-u*2;cam.position.set(Math.sin(a)*r,1-u*.5,Math.cos(a)*r);cam.lookAt(0,-.3,0);
      stars.rotation.y-=.03*Math.pow(1-u,3);
      const q=o.q??2;glow.position.copy(craft.position);glow.material.color.set(0xea6f3c);glow.material.opacity=.7;glow.scale.setScalar((6+Math.sin(s*5)*.6)*(.55+q*.28));
      rings.forEach((g,i)=>{const p=(s*.32+i/4)%1;g.position.copy(craft.position);g.material.color.set(0xf2b84f);g.scale.setScalar(1+p*7*(.4+q*.35));g.material.opacity=.65*(1-p);g.lookAt(cam.position);});},
    arrival(u,s){show(mars,craft);mars.scale.setScalar(12);mars.position.set(3.5,-1,-48+u*25);mars.rotation.set(.2,.5+s*.02,0);
      craft.position.set(-1.5,-.5,0);craft.rotation.set(.1,2.7+s*.03,.05);cam.position.set(1.3,.9,6.6-u);cam.lookAt(.8,-.3,-10);},
    capture(u,s){show(mars,craft);mars.scale.setScalar(10);mars.position.set(0,0,0);mars.rotation.set(.15,s*.015,0);
      const p=-1.15-u*3.75;craft.scale.setScalar(1.5);craft.position.set(13*Math.sin(p),.9,13*Math.cos(p));craft.rotation.set(.15,p-Math.PI/2,0);flame(craft,u<.4);
      cam.position.set(0,6,28);cam.lookAt(0,0,0);},
    flyby(u,s){show(mars,craft);mars.scale.setScalar(10);mars.position.set(0,0,0);mars.rotation.set(.15,s*.015,0);
      craft.scale.setScalar(1.5-u*1.15);craft.position.set(-12+u*30,.9+u*9,8+u*5);craft.rotation.set(s*.25,s*.18,0);flame(craft,u<.12);
      cam.position.set(0,6,28);cam.lookAt(craft.position.x*.35,craft.position.y*.5,0);},
    aerobrake(u,s,o,dt){show(mars,craft,glow,parts);mars.scale.setScalar(30);mars.position.set(0,-31.3,0);mars.rotation.set(0,0,s*.025);
      craft.position.set(0,Math.sin(s*9)*.03,0);craft.rotation.set(0,Math.PI/2,.12);
      glow.position.set(1.3,-.15,0);glow.material.color.set(0xff7a3c);glow.material.opacity=.45+.35*Math.sin(u*Math.PI);glow.scale.setScalar(4.5+Math.sin(s*30)*.6);
      parts.material.color.set(0xff9a50);parts.material.size=.3;stepParts('stream',dt);
      cam.position.set(4.5-u*1.6,1.7,7.5);cam.lookAt(0,-.4,0);},
    discovery(u,s,o){show(mars,craft,beam,...rings);mars.scale.setScalar(30);mars.position.set(0,-31.5,0);mars.rotation.set(o.tilt||0,s*.02,0);
      craft.position.set(0,1.7,0);craft.rotation.set(0,s*.1,0);
      beam.position.set(0,.1,0);beam.scale.set(1,3.2,1);beam.material.color.set(o.col||0x8fc8da);beam.material.opacity=.16+.07*Math.sin(s*6);
      rings.forEach((g,i)=>{const p=(s*.55+i/4)%1;g.rotation.set(Math.PI/2,0,0);g.position.set(0,1.7-p*3.2,0);g.scale.setScalar(.05+p*.95);g.material.color.set(o.col||0x8fc8da);g.material.opacity=.8*(1-p*.7);});
      const a=.4+u*1.3;cam.position.set(Math.sin(a)*8.5,3.3,Math.cos(a)*8.5);cam.lookAt(0,.2,0);},
    finale(u,s){show(mars,craft,sunSpr,dot);sun.position.set(-5,5,2);mars.scale.setScalar(18);mars.position.set(8,-17,-22);mars.rotation.set(0,s*.012,0);
      sunSpr.position.set(10,3+u*4,-70);sunSpr.material.opacity=1;sunSpr.scale.setScalar(34+u*16);
      dot.position.set(-12,4,-50);dot.scale.setScalar(1);dot.material.opacity=.9;
      craft.position.set(-.4,-.3,0);craft.rotation.set(.2,.8+s*.04,.1);cam.position.set(2.6-u,1,7.8-u*1.6);cam.lookAt(0,.3,-4);},
    explosion(u,s,o,dt){show(craft,flash,parts);craft.visible=u<.1;craft.position.set(0,0,0);craft.rotation.set(s*3,s*2,0);
      flash.position.set(0,0,0);flash.scale.setScalar(5+u*60);flash.material.opacity=Math.max(0,1-u*2.4);
      parts.material.color.set(0xf2b84f);parts.material.size=.4;if(u>.08)stepParts('burst',dt);
      cam.position.set((Math.random()-.5)*.3*(1-u),1+(Math.random()-.5)*.3*(1-u),10+u*4);cam.lookAt(0,0,0);}
  };

  function draw2(ctx,W,H,u,s){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);const r=rng(9);ctx.fillStyle='rgba(239,230,217,.7)';for(let i=0;i<160;i++)ctx.fillRect((r()*W+W-s*14*(.3+r()))%W,r()*H,1.6,1.6);
    const mr=H*.9,mx=W*.86,my=H*1.45-u*H*.2,g=ctx.createRadialGradient(mx-mr*.3,my-mr*.5,mr*.2,mx,my,mr);g.addColorStop(0,'#d77a48');g.addColorStop(.8,'#8a3f22');g.addColorStop(1,'#2a100a');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(mx,my,mr,0,7);ctx.fill();
    drawCraft(ctx,W*(.2+.25*u),H*.5,1.7,{wing:S.sel.power,dish:S.sel.comms,inst:S.fl?S.fl.on:undefined,rot:-.3+u*.25});}

  function play(id,o={}){return new Promise(res=>{
    const lines=o.lines||[],dl=lines.map(l=>2+l.text.length*.055),total=Math.max(o.min||5,dl.reduce((a,b)=>a+b,0)+.9);
    const el=document.createElement('div');el.className='cine';
    el.innerHTML=`<div class="big" id="cBig">${o.big||''}</div><div class="capwrap"><div class="aura" id="cAura"></div><div class="cap" id="cCap" aria-live="polite"></div></div><button class="ghost skip" id="cSkip">Skip</button>`;
    document.body.appendChild(el);
    const use3=init()&&!!SC[id];let c2,ctx2;
    const size=()=>{if(use3){R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.fov=innerWidth<innerHeight?62:42;cam.updateProjectionMatrix();}else{c2.width=innerWidth;c2.height=innerHeight;}};
    if(use3){el.prepend(R.domElement);
      if(craft){scene.remove(craft);}
      craft=Models.craft(craftOpts());scene.add(craft);
      sun.position.set(-6,3,5);stars.rotation.set(0,0,0);craft.scale.setScalar(1);
      if(id==='explosion')seedParts('burst');if(id==='aerobrake')seedParts('stream');
    }else{c2=document.createElement('canvas');el.prepend(c2);ctx2=c2.getContext('2d');}
    size();addEventListener('resize',size);
    const still=matchMedia('(prefers-reduced-motion: reduce)').matches,k=Math.max(DEMO.k,.02),t0=performance.now();
    let alive=true,last=t0,shown=-2;
    const cap=el.querySelector('#cCap'),big=el.querySelector('#cBig'),au=el.querySelector('#cAura');
    const end=()=>{if(!alive)return;alive=false;removeEventListener('resize',size);el.remove();if(o.aura){S.aura+=o.aura;}if(typeof chrome==='function')chrome();res();};
    el.querySelector('#cSkip').onclick=end;
    (function fr(now){if(!alive)return;
      const s=(now-t0)/1000/k,u=Math.min(1,s/total),dt=Math.min(.05,(now-last)/1000);last=now;
      let acc=0,cur=-1;for(let i=0;i<lines.length;i++){if(s>=acc+.25&&s<acc+dl[i])cur=i;acc+=dl[i];}
      if(cur!==shown){shown=cur;const l=lines[cur];cap.innerHTML=l?`${l.who?`<span class="who">${WHO[l.who][0]}</span>`:''}${l.text}`:'';}
      if(o.count){const n=Math.ceil((.27-u)/.27*5);big.textContent=n>0?n:'Lift-off';big.classList.toggle('in',u<.5);}
      else if(o.big&&u>(o.bigAt??.12))big.classList.add('in');
      if(o.aura&&u>.5){au.classList.add('in');au.textContent='AURA +'+Math.round(o.aura*Math.min(1,(u-.5)/.3)).toLocaleString('en-US');}
      if(use3){SC[id](still?.5:u,still?3:s,o,dt);mars.userData.sun.copy(sun.position).normalize();earth.userData.sun.copy(sun.position).normalize();earth.userData.clouds.rotation.y+=dt*.004;R.render(scene,cam);}else draw2(ctx2,c2.width,c2.height,u,s);
      if(s>=total)return end();
      requestAnimationFrame(fr);})(t0);
  });}
  return {play,scenes:()=>Object.keys(SC),get mode(){return ok===null?'not started':ok?'3d':'2d'}};
})();
