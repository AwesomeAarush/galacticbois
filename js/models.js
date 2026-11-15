"use strict";
/* Shared 3D assets (three.js r128): planets, the spacecraft, instruments and the launch vehicle.
   Used by the cutscenes (js/cutscenes.js) and by the small live 3D views inside the game screens.
   Planets, instruments and the rocket are generated in code. The spacecraft is assets/spacecraft_3d.glb
   (with a generated stand-in while it loads).
   Optional: drop real NASA maps at assets/mars.jpg and assets/earth.jpg (equirectangular, 2:1,
   longitude 0 in the center) and they replace the generated planet surfaces automatically. */
const Models=(()=>{
  let T3,ok=null,R,env,cache={},views=[],looping=false,rw=0,rh=0;
  const TAU=Math.PI*2,INSTCOL={cam:0xea6f3c,ctx:0xd98a5c,spec:0xf2b84f,tes:0xe0b070,mcs:0x86c994,radar:0x8fc8da,grs:0xb8a0d8,alt:0xd8d0c0,mag:0x9aa6b0,rad:0xef5d52};
  const prng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const mix=(a,b,t)=>a+(b-a)*t;

  /* ---------- value noise on a sphere (no seams, no pinching at the poles) ---------- */
  const PT=new Uint8Array(512),VT=new Float32Array(256);
  (()=>{const r=prng(1234);const p=[...Array(256).keys()];for(let i=255;i>0;i--){const j=r()*(i+1)|0;[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)PT[i]=p[i&255];for(let i=0;i<256;i++)VT[i]=r();})();
  function n3(x,y,z){
    const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);let u=x-xi,v=y-yi,w=z-zi;u=u*u*(3-2*u);v=v*v*(3-2*v);w=w*w*(3-2*w);
    const X=xi&255,Y=yi&255,Z=zi&255,A=PT[X]+Y,B=PT[X+1]+Y,AA=PT[A]+Z,AB=PT[A+1]+Z,BA=PT[B]+Z,BB=PT[B+1]+Z;
    const a=VT[PT[AA]],b=VT[PT[BA]],c=VT[PT[AB]],d=VT[PT[BB]],e=VT[PT[AA+1]],f=VT[PT[BA+1]],g=VT[PT[AB+1]],h=VT[PT[BB+1]];
    const l1=a+(b-a)*u,l2=c+(d-c)*u,l3=e+(f-e)*u,l4=g+(h-g)*u,m1=l1+(l2-l1)*v,m2=l3+(l4-l3)*v;return m1+(m2-m1)*w;}
  function fbm(x,y,z,o){let s=0,a=.5,t=0;for(let i=0;i<o;i++){s+=a*n3(x,y,z);t+=a;x=x*2.03+17.1;y=y*2.03+9.2;z=z*2.03+4.7;a*=.5;}return s/t;}
  const cvs=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const ang=(lon,lat)=>{const a=lon*Math.PI/180,b=lat*Math.PI/180;return [Math.cos(b)*Math.cos(a),Math.sin(b),Math.cos(b)*Math.sin(a)];};

  /* ---------- Mars: color map and height map ---------- */
  function marsMaps(){
    if(cache.mars)return cache.mars;
    const W=1024,H=512,col=cvs(W,H),hgt=cvs(W,H),cx=col.getContext('2d'),hx=hgt.getContext('2d'),ci=cx.createImageData(W,H),hi=hx.createImageData(W,H);
    const DARK=[[68,10,15,.75],[-30,45,22,.5],[-38,-26,18,.4],[140,-24,24,.45],[-150,-36,20,.35],[100,-8,14,.3],[-5,-8,12,.3]].map(f=>[ang(f[0],f[1]),Math.cos(f[2]*Math.PI/180),f[3]]);
    const BRIGHT=[[70,-42,13,.55],[-112,4,30,.3],[22,22,20,.28],[148,25,12,.25],[-160,45,22,.2]].map(f=>[ang(f[0],f[1]),Math.cos(f[2]*Math.PI/180),f[3]]);
    for(let j=0;j<H;j++){const lat=90-(j+.5)/H*180,cl=Math.cos(lat*Math.PI/180),y=Math.sin(lat*Math.PI/180);
      for(let i=0;i<W;i++){const lon=(i+.5)/W*TAU-Math.PI,x=cl*Math.cos(lon),z=cl*Math.sin(lon);
        const big=fbm(x*1.7+3,y*1.7,z*1.7,4),det=fbm(x*6.5,y*6.5+5,z*6.5,4),fine=fbm(x*24,y*24,z*24+8,2);
        let t=sm(.36,.66,big*.7+det*.3);
        for(const f of DARK){const d=x*f[0][0]+y*f[0][1]+z*f[0][2];if(d>f[1])t-=f[2]*sm(f[1],1,d)*(.55+det*.9)*1.6;}
        for(const f of BRIGHT){const d=x*f[0][0]+y*f[0][1]+z*f[0][2];if(d>f[1])t+=f[2]*sm(f[1],1,d)*1.5;}
        t=Math.max(0,Math.min(1,t));
        const sh=.86+.28*fine;let r=mix(84,206,t)*sh,g=mix(46,118,t)*sh,b=mix(34,70,t)*sh;g+=det*8;
        const n=sm(77.5,80.5,lat+(det-.5)*9),s=sm(83,86,-lat+(det-.5)*7),ice=Math.max(n,s);
        r=mix(r,244,ice);g=mix(g,240,ice);b=mix(b,234,ice);
        const k=(j*W+i)*4;ci.data[k]=r;ci.data[k+1]=g;ci.data[k+2]=b;ci.data[k+3]=255;
        const h=(big*.45+det*.35+fine*.2)*200+ice*30;hi.data[k]=hi.data[k+1]=hi.data[k+2]=h;hi.data[k+3]=255;}}
    cx.putImageData(ci,0,0);hx.putImageData(hi,0,0);
    const C=cvs(2048,1024),B=cvs(1024,512),c=C.getContext('2d'),b=B.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(col,0,0,2048,1024);b.drawImage(hgt,0,0);
    const both=(fn)=>{fn(c,2048/360,1);fn(b,1024/360,0);};
    const r=prng(41);
    /* craters: dark floor, bright rim, stretched toward the poles like any cylindrical map */
    for(let i=0;i<900;i++){const lon=r()*360-180,lat=Math.asin(r()*1.7-.85)*180/Math.PI,rad=.18+Math.pow(r(),5)*2.6,st=1/Math.max(.3,Math.cos(lat*Math.PI/180)),al=.07+r()*.13;
      both((x,s,isC)=>{const px=(lon+180)*s,py=(90-lat)*s,rr=rad*s;
        x.fillStyle=isC?`rgba(48,24,16,${al})`:'rgba(70,70,70,.35)';x.beginPath();x.ellipse(px,py,rr*st,rr,0,0,7);x.fill();
        x.strokeStyle=isC?`rgba(238,180,132,${al*1.2})`:'rgba(215,215,215,.4)';x.lineWidth=Math.max(.7,rr*.2);x.beginPath();x.ellipse(px,py,rr*st,rr,0,-2.6,.6);x.stroke();});}
    /* Valles Marineris */
    both((x,s,isC)=>{x.lineCap='round';for(const [w,a] of [[4.2,.18],[2.8,.3],[1.5,.5],[.6,.7]]){x.strokeStyle=isC?`rgba(40,18,12,${a})`:`rgba(10,10,10,${a})`;x.lineWidth=w*s;
      x.beginPath();x.moveTo(85*s,96*s);x.bezierCurveTo(100*s,99*s,115*s,97*s,135*s,104*s);x.stroke();}
      x.strokeStyle=isC?'rgba(40,18,12,.35)':'rgba(10,10,10,.4)';x.lineWidth=.8*s;for(let i=0;i<9;i++){const px=(88+i*5)*s,py=(97+Math.sin(i)*1.2)*s;x.beginPath();x.moveTo(px,py);x.lineTo(px+(r()-.5)*6*s,py+(r()-.3)*6*s);x.stroke();}});
    /* Tharsis volcanoes and Olympus Mons */
    for(const [lo,la,rad] of [[-134,18,3.4],[-120,-9,2.1],[-113,1,1.9],[-104,11,2],[147,25,1.8]])both((x,s,isC)=>{const px=(lo+180)*s,py=(90-la)*s,rr=rad*s,g=x.createRadialGradient(px,py,0,px,py,rr);
      if(isC){g.addColorStop(0,'rgba(232,170,122,.75)');g.addColorStop(.75,'rgba(190,120,80,.35)');g.addColorStop(1,'rgba(120,70,46,0)');}else{g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(1,'rgba(128,128,128,0)');}
      x.fillStyle=g;x.beginPath();x.arc(px,py,rr,0,7);x.fill();x.fillStyle=isC?'rgba(70,36,24,.8)':'rgba(60,60,60,.9)';x.beginPath();x.arc(px,py,rr*.17,0,7);x.fill();});
    /* Jezero crater, so the game's target is really on the globe */
    both((x,s,isC)=>{const px=(77.5+180)*s,py=(90-18.4)*s;x.fillStyle=isC?'rgba(60,30,20,.55)':'rgba(30,30,30,.7)';x.beginPath();x.arc(px,py,.55*s,0,7);x.fill();x.strokeStyle=isC?'rgba(240,190,140,.6)':'rgba(240,240,240,.7)';x.lineWidth=.14*s;x.stroke();});
    cache.mars={col:C,hgt:B};tryReal('mars');return cache.mars;}

  /* ---------- Earth: color, roughness (shiny oceans) and a separate cloud layer ---------- */
  function earthMaps(){
    if(cache.earth)return cache.earth;
    const W=1024,H=512,col=cvs(W,H),rgh=cvs(W,H),cld=cvs(W,H),cx=col.getContext('2d'),rx=rgh.getContext('2d'),dx=cld.getContext('2d'),ci=cx.createImageData(W,H),ri=rx.createImageData(W,H),di=dx.createImageData(W,H);
    for(let j=0;j<H;j++){const lat=90-(j+.5)/H*180,al=Math.abs(lat),cl=Math.cos(lat*Math.PI/180),y=Math.sin(lat*Math.PI/180);
      for(let i=0;i<W;i++){const lon=(i+.5)/W*TAU-Math.PI,x=cl*Math.cos(lon),z=cl*Math.sin(lon);
        const e=fbm(x*1.8+7,y*1.8+2,z*1.8,5)*.85+fbm(x*7,y*7,z*7+3,2)*.15,m=fbm(x*3.2,y*3.2+11,z*3.2,3),land=sm(.535,.55,e);
        const dp=sm(.3,.535,e);let r=mix(6,22,dp),g=mix(26,78,dp),b=mix(66,128,dp);
        if(land>0){const dry=sm(12,24,al)*(1-sm(30,42,al))*sm(.42,.6,1-m),cold=sm(52,66,al),hi=sm(.62,.72,e);
          let lr=mix(46,188,dry),lg=mix(92,160,dry),lb=mix(44,108,dry);lr=mix(lr,128,cold);lg=mix(lg,124,cold);lb=mix(lb,100,cold);lr=mix(lr,120,hi);lg=mix(lg,104,hi);lb=mix(lb,88,hi);
          const sh=.85+.3*m;r=mix(r,lr*sh,land);g=mix(g,lg*sh,land);b=mix(b,lb*sh,land);}
        const ice=Math.max(sm(70,76,al+(m-.5)*14)*land,sm(74,80,lat+(m-.5)*8),sm(66,72,-lat+(m-.5)*6));
        r=mix(r,240,ice);g=mix(g,244,ice);b=mix(b,248,ice);
        const k=(j*W+i)*4;ci.data[k]=r;ci.data[k+1]=g;ci.data[k+2]=b;ci.data[k+3]=255;
        const ro=mix(70,235,Math.max(land,ice));ri.data[k]=ri.data[k+1]=ri.data[k+2]=ro;ri.data[k+3]=255;
        const wp=fbm(x*2.1,y*2.1,z*2.1+20,3)*1.6,cw=fbm(x*3.4+wp,y*5.2+wp,z*3.4-wp,5),band=.06*Math.cos(lat*Math.PI/180*6);
        di.data[k]=di.data[k+1]=di.data[k+2]=255;di.data[k+3]=255*sm(.5,.72,cw+band);}}
    cx.putImageData(ci,0,0);rx.putImageData(ri,0,0);dx.putImageData(di,0,0);
    cache.earth={col,rgh,cld};tryReal('earth');return cache.earth;}

  /* Real maps: assets/mars.jpg (JPL/Caltech/USGS) and assets/earth.jpg (NASA Blue Marble), both taken from the
     data folder of NASA's GMAT. They replace the generated surfaces as soon as they load. */
  function tryReal(name){try{const im=new Image();im.onload=()=>{const m=cache[name];if(!m||im.width<512)return;const x=m.col.getContext('2d'),W=m.col.width,H=m.col.height;x.drawImage(im,0,0,W,H);m.real=true;
      if(name==='mars'){x.globalCompositeOperation='multiply';x.fillStyle='rgb(255,214,190)';x.fillRect(0,0,W,H);x.globalCompositeOperation='source-over';}
      if(name==='earth'&&m.rgh){const d=x.getImageData(0,0,W,H).data,rx=m.rgh.getContext('2d'),rw=m.rgh.width,rh=m.rgh.height,ri=rx.createImageData(rw,rh);
        for(let j=0;j<rh;j++)for(let i=0;i<rw;i++){const k=((j*H/rh|0)*W+(i*W/rw|0))*4,sea=d[k+2]>d[k]*1.25&&d[k+2]>d[k+1]*.95&&d[k]<110,q=(j*rw+i)*4;ri.data[q]=ri.data[q+1]=ri.data[q+2]=sea?70:235;ri.data[q+3]=255;}
        rx.putImageData(ri,0,0);if(cache.earthRgh)cache.earthRgh.forEach(t=>t.needsUpdate=true);}
      (cache[name+'Texs']||[]).forEach(t=>t.needsUpdate=true);(cache[name+'Mats']||[]).forEach(t=>{if(name==='mars')t.bumpScale=.004;t.needsUpdate=true;});};im.onerror=()=>{};im.src='assets/'+name+'.jpg';}catch(e){}}

  /* ---------- small material textures ---------- */
  const tex=(c,srgb=true,rep)=>{const t=new T3.CanvasTexture(c);if(srgb)t.encoding=T3.sRGBEncoding;t.anisotropy=4;if(rep){t.wrapS=t.wrapT=T3.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}return t;};
  function foilCanvas(){const c=cvs(256,256),x=c.getContext('2d'),r=prng(7);x.fillStyle='#808080';x.fillRect(0,0,256,256);
    for(let i=0;i<520;i++){const px=r()*256,py=r()*256,s=10+r()*34,v=90+r()*110|0;x.fillStyle=`rgba(${v},${v},${v},.55)`;x.beginPath();x.moveTo(px,py);x.lineTo(px+(r()-.5)*s,py+(r()-.5)*s);x.lineTo(px+(r()-.5)*s,py+(r()-.5)*s);x.fill();}
    x.strokeStyle='rgba(40,40,40,.5)';x.lineWidth=1;for(let i=0;i<=256;i+=64){x.beginPath();x.moveTo(i,0);x.lineTo(i,256);x.moveTo(0,i);x.lineTo(256,i);x.stroke();}return c;}
  function cellCanvas(){const c=cvs(256,256),x=c.getContext('2d'),r=prng(3);x.fillStyle='#b9c0c8';x.fillRect(0,0,256,256);
    for(let j=0;j<8;j++)for(let i=0;i<4;i++){const v=r();x.fillStyle=`rgb(${10+v*12|0},${18+v*20|0},${52+v*46|0})`;x.fillRect(i*64+2,j*32+1.5,60,29);
      x.fillStyle='rgba(170,190,215,.5)';x.fillRect(i*64+2,j*32+10,60,.8);x.fillRect(i*64+2,j*32+21,60,.8);}
    return c;}
  function slatCanvas(){const c=cvs(64,64),x=c.getContext('2d');x.fillStyle='#e9e6df';x.fillRect(0,0,64,64);x.fillStyle='#8d8a84';for(let j=0;j<64;j+=8)x.fillRect(0,j,64,2);return c;}
  function glowCanvas(){const c=cvs(128,128),x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return c;}
  /* a tiny "sky" for reflections: black space, one bright sun patch, a warm glow from below */
  function envMap(){if(env)return env;const face=(fn)=>{const c=cvs(64,64),x=c.getContext('2d');x.fillStyle='#23262e';x.fillRect(0,0,64,64);fn&&fn(x);return c;};
    const blob=(x,cx,cy,r,col)=>{const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64);};
    const f=[face(x=>blob(x,40,22,34,'rgba(255,214,170,.55)')),face(x=>blob(x,32,32,40,'rgba(150,175,215,1)')),face(x=>blob(x,26,34,40,'rgba(255,246,228,1)')),face(x=>blob(x,32,32,46,'rgba(236,128,76,.9)')),
      face(x=>blob(x,22,18,44,'rgba(255,242,222,1)')),face(x=>blob(x,32,32,36,'rgba(120,130,160,.6)'))];
    env=new T3.CubeTexture(f);env.encoding=T3.sRGBEncoding;env.needsUpdate=true;return env;}

  const MAT={};
  function mat(name){
    if(MAT[name])return MAT[name];const S=(o)=>new T3.MeshStandardMaterial(o);let m;
    if(name==='foil'){const c=foilCanvas();m=S({color:0xf2b23e,metalness:.62,roughness:.4,bumpMap:tex(c,false,[2,2]),bumpScale:.02,roughnessMap:tex(c,false,[2,2]),envMapIntensity:1.5});}
    else if(name==='silverfoil'){const c=foilCanvas();m=S({color:0xe4e7ea,metalness:.6,roughness:.42,bumpMap:tex(c,false,[2,2]),bumpScale:.02,envMapIntensity:1.4});}
    else if(name==='cell')m=S({map:tex(cellCanvas(),true,[1,1]),metalness:.55,roughness:.22,envMapIntensity:1.6});
    else if(name==='kapton')m=S({color:0x9a6a2c,metalness:.5,roughness:.5});
    else if(name==='white')m=S({color:0xf1eee8,metalness:.05,roughness:.55,side:T3.DoubleSide});
    else if(name==='alu')m=S({color:0xc6cad0,metalness:.7,roughness:.34,envMapIntensity:1.3});
    else if(name==='dark')m=S({color:0x16171b,metalness:.5,roughness:.55,side:T3.DoubleSide});
    else if(name==='carbon')m=S({color:0x202329,metalness:.35,roughness:.42,envMapIntensity:1.4});
    else if(name==='nozzle')m=S({color:0x5a4a40,metalness:.85,roughness:.4,side:T3.DoubleSide,envMapIntensity:1.2});
    else if(name==='tank')m=S({color:0xd6d9dd,metalness:.7,roughness:.28,envMapIntensity:1.5});
    else if(name==='radiator')m=S({map:tex(slatCanvas(),true,[1,2]),metalness:.2,roughness:.5});
    else if(name==='copper')m=S({color:0xb5673a,metalness:.55,roughness:.5});
    else if(name==='lens')m=S({color:0x10141c,metalness:.9,roughness:.08,envMapIntensity:2.2});
    else if(name.startsWith('band:')){const c=INSTCOL[name.slice(5)];m=S({color:c,emissive:c,emissiveIntensity:.12,metalness:0,roughness:.6,envMapIntensity:.3});}
    return MAT[name]=m;}
  const M=(geo,m,x=0,y=0,z=0)=>{const o=new T3.Mesh(geo,typeof m==='string'?mat(m):m);o.position.set(x,y,z);return o;};
  const RX=(o,a=Math.PI/2)=>{o.rotation.x=a;return o;};
  const cyl=(r1,r2,h,seg=20,open=false)=>new T3.CylinderGeometry(r1,r2,h,seg,1,open);
  const box=(a,b,c)=>new T3.BoxGeometry(a,b,c);
  function bell(throat,exit,len){const p=[];for(let i=0;i<=10;i++){const t=i/10;p.push(new T3.Vector2(mix(throat,exit,Math.sqrt(t)),-t*len));}return new T3.LatheGeometry(p,28);}
  function sprite(color,blend=true){if(!cache.glow)cache.glow=new T3.CanvasTexture(glowCanvas());return new T3.Sprite(new T3.SpriteMaterial({map:cache.glow,color,transparent:true,depthWrite:false,blending:blend?T3.AdditiveBlending:T3.NormalBlending}));}

  /* an engine plume: a soft glow at the nozzle plus a cone that widens and fades, pointing along -y */
  function plume(color,len,r){const g=new T3.Group(),sp=sprite(color);sp.scale.set(r*3.4,r*3.4,1);g.add(sp);
    if(!cache.plume){const c=cvs(8,128),x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.2,'rgba(255,255,255,.6)');gr.addColorStop(.6,'rgba(255,255,255,.18)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,8,128);cache.plume=new T3.CanvasTexture(c);}
    for(const [k,o] of [[1,.7],[.45,.9]]){const cone=new T3.Mesh(new T3.ConeGeometry(r*k,len*(k<1?.7:1),24,1,true),new T3.MeshBasicMaterial({map:cache.plume,color,transparent:true,opacity:o,blending:T3.AdditiveBlending,side:T3.DoubleSide,depthWrite:false}));
      cone.position.y=-len*(k<1?.7:1)/2;g.add(cone);}
    return g;}

  /* ---------- instruments (each points along -y, "down" at the planet) ---------- */
  function instPart(k){
    const g=new T3.Group(),band=(r,y)=>{const b=M(new T3.TorusGeometry(r,.014,8,28),'band:'+k,0,y,0);b.rotation.x=Math.PI/2;return b;};
    if(k==='cam'){ /* telescope: long foil-wrapped tube, dark baffle, mirror glint */
      g.add(M(cyl(.165,.165,.6,28,true),'foil',0,-.3,0));g.add(RX(M(new T3.TorusGeometry(.165,.014,8,28),'alu',0,-.6,0)));g.add(RX(M(new T3.RingGeometry(.15,.165,28),'alu',0,-.6,0)));g.add(M(cyl(.15,.15,.56,28,true),'dark',0,-.33,0));
      g.add(RX(M(new T3.CircleGeometry(.15,28),'lens',0,-.2,0)));g.add(M(box(.2,.12,.12),'silverfoil',.2,-.1,0));g.add(band(.172,-.06));g.add(band(.172,-.5));}
    else if(k==='spec'){ /* spectrometer: gimballed optics box with a radiator plate */
      g.add(M(box(.24,.2,.26),'silverfoil',0,-.12,0));g.add(M(cyl(.07,.085,.14,20),'dark',0,-.28,.02));g.add(RX(M(new T3.CircleGeometry(.062,20),'lens',0,-.351,.02)));
      const rad=M(box(.3,.02,.24),'radiator',.17,-.2,0);rad.rotation.z=-1.1;g.add(rad);g.add(M(cyl(.03,.03,.08,10),'alu',0,-.01,0));const b=band(.09,-.215);b.position.z=.02;g.add(b);}
    else if(k==='mcs'){ /* limb sounder: twin small telescopes on a yoke, looking sideways at the horizon */
      g.add(M(cyl(.035,.035,.14,12),'alu',0,-.07,0));g.add(M(box(.2,.05,.07),'alu',0,-.15,0));
      for(const d of[-1,1]){const t=M(cyl(.045,.045,.2,18),'white',d*.055,-.21,.03);t.rotation.x=Math.PI/2;g.add(t);const l=M(new T3.CircleGeometry(.036,18),'lens',d*.055,-.21,.131);g.add(l);}
      g.add(M(box(.2,.09,.12),'silverfoil',0,-.21,-.06));const b=band(.1,-.165);g.add(b);}
    else if(k==='ctx'){ /* context camera: short tube on a small electronics box */
      g.add(M(box(.14,.08,.14),'silverfoil',0,-.04,0));g.add(M(cyl(.06,.06,.18,20),'dark',0,-.17,0));g.add(RX(M(new T3.CircleGeometry(.05,20),'lens',0,-.261,0)));g.add(band(.064,-.1));}
    else if(k==='tes'){ /* thermal imager: telescope barrel, gold sunshade and a radiator for the cooled detector */
      g.add(M(box(.2,.12,.18),'foil',0,-.06,0));g.add(M(cyl(.07,.08,.16,20),'dark',.04,-.2,0));g.add(RX(M(new T3.CircleGeometry(.06,20),'lens',.04,-.281,0)));
      const rd=M(box(.18,.015,.16),'radiator',-.13,-.06,0);rd.rotation.z=.9;g.add(rd);g.add(band(.085,-.14));}
    else if(k==='grs'){ /* gamma-ray detector on a folding boom, with its electronics box at the root */
      g.add(M(box(.16,.1,.14),'silverfoil',0,-.05,0));const bm=M(cyl(.012,.012,.7,8),'alu',.36,-.12,0);bm.rotation.z=Math.PI/2;g.add(bm);
      g.add(M(cyl(.06,.06,.16,20),'foil',.72,-.12,0));g.add(M(cyl(.065,.065,.02,20),'band:grs',.72,-.03,0));}
    else if(k==='alt'){ /* laser altimeter: receiver telescope with the laser beside it */
      g.add(M(box(.18,.1,.16),'silverfoil',0,-.05,0));g.add(M(cyl(.08,.08,.12,24),'white',-.03,-.16,0));g.add(RX(M(new T3.CircleGeometry(.07,24),'lens',-.03,-.221,0)));
      g.add(M(cyl(.02,.02,.1,10),'copper',.08,-.15,0));g.add(band(.084,-.12));}
    else if(k==='mag'){ /* magnetometer: sensor cubes far out on a long boom */
      const bm=M(cyl(.008,.008,1.2,6),'alu',0,-.08,.6);bm.rotation.x=Math.PI/2;g.add(bm);g.add(M(box(.05,.05,.05),'white',0,-.08,1.2));g.add(M(box(.04,.04,.04),'white',0,-.08,.8));g.add(M(box(.08,.05,.08),'silverfoil',0,-.03,0));}
    else if(k==='rad'){ /* radiation monitor: a small box with a detector window */
      g.add(M(box(.12,.08,.1),'silverfoil',0,-.04,0));g.add(M(cyl(.03,.03,.02,16),'band:rad',0,-.09,0));}
    else{ /* radar: electronics box and a long, thin two-part antenna */
      g.add(M(box(.2,.1,.16),'silverfoil',0,-.05,0));g.add(M(cyl(.03,.03,.1,10),'alu',0,-.13,0));
      for(const d of[-1,1]){const a=M(cyl(.012,.012,1.55,8),'alu',d*.8,-.17,0);a.rotation.z=Math.PI/2;g.add(a);g.add(M(new T3.SphereGeometry(.022,8,8),'band:radar',d*1.575,-.17,0));}
      g.add(M(new T3.SphereGeometry(.04,12,10),'alu',0,-.17,0));g.add(band(.06,-.11));}
    return g;}
  function instrument(k){const g=new T3.Group(),p=instPart(k);p.rotation.x=Math.PI;const s=k==='radar'?.95:k==='cam'?2.3:3.1;p.scale.setScalar(s);
    g.add(M(cyl(k==='radar'?.5:.62,k==='radar'?.5:.62,.05,6),'foil',0,-.03,0));g.add(p);return g;}

  /* ---------- the spacecraft model file (assets/spacecraft_3d.glb) ----------
     Loaded once, merged to one mesh per material (615 parts -> 14 draw calls), turned so its nose
     points along +z and its aft end along -z like the built-in craft, and scaled to the same size.
     Until it arrives (or if it cannot be loaded) the built-in craft is shown instead. */
  const GLB={state:0,proto:null,wait:[],aft:-3.1,rad:3.25};
  /* which build choice controls each named part of the model */
  const cnt={};
  /* GLTFLoader turns the spaces in node names into underscores ("Solar_panel_1_upper_edge_01"), so names are
     normalised before matching. Without this no part group is found and the model never reacts to the build. */
  function partKey(raw,cx){const name=String(raw).replace(/_/g,' '),n=c=>{cnt[c]=(cnt[c]||0)+1;return cnt[c]-1;};
    let mt;
    if((mt=/^Solar panel (\d)/.exec(name)))return mt[1]==='1'?'sol_a':'sol_f';
    if(/Cross array spine|Copper radiator tile|Cross arm guide/.test(name))return 'rad_'+(cx<-1?'a':'f');
    if((mt=/^(Aft|Forward) gold cluster gold tank/.exec(name))){const s=mt[1]==='Aft'?'a':'f';return 'tk_'+s+(n('t'+s)%6);}
    if((mt=/^(Aft|Forward) gold cluster mount/.exec(name))){const s=mt[1]==='Aft'?'a':'f';return 'tk_'+s+(n('m'+s)%6);}
    if(/rivet|longitudinal edge line|service plate|pale seam|access seam/.test(name))return 'detail';
    if(/Neck rib/.test(name))return 'ribs';
    if(/Bridge sensor/.test(name))return 'sens'+(n('s')%3);
    if(/antenna/i.test(name))return 'ant';
    return 'body';}
  function mergeGLB(root){
    const by=new Map(),bb=new T3.Box3();root.updateMatrixWorld(true);
    root.traverse(m=>{if(!m.isMesh)return;bb.setFromObject(m);const nm=m.name&&!/^mesh/i.test(m.name)?m.name:(m.parent&&m.parent.name)||m.name||'',key=partKey(nm,(bb.min.x+bb.max.x)/2),k=key+'|'+m.material.uuid;
      if(!by.has(k))by.set(k,{key,mat:m.material,list:[]});by.get(k).list.push(m);});
    const out=new T3.Group(),groups={};
    for(const {key,mat,list} of by.values()){let nv=0,ni=0,uv=false;
      for(const m of list){const g=m.geometry;nv+=g.attributes.position.count;ni+=g.index?g.index.count:g.attributes.position.count;uv=uv||!!g.attributes.uv;}
      const P=new Float32Array(nv*3),N=new Float32Array(nv*3),U=uv?new Float32Array(nv*2):null,I=new Uint32Array(ni);let vo=0,io=0,hasN=true;
      for(const m of list){const g=m.geometry.clone();g.applyMatrix4(m.matrixWorld);const a=g.attributes,c=a.position.count;
        P.set(a.position.array.subarray(0,c*3),vo*3);if(a.normal)N.set(a.normal.array.subarray(0,c*3),vo*3);else hasN=false;
        if(U&&a.uv)for(let i=0;i<c;i++){U[(vo+i)*2]=a.uv.getX(i);U[(vo+i)*2+1]=a.uv.getY(i);}
        if(g.index)for(let i=0;i<g.index.count;i++)I[io++]=g.index.getX(i)+vo;else for(let i=0;i<c;i++)I[io++]=vo+i;
        vo+=c;g.dispose();}
      const G=new T3.BufferGeometry();G.setAttribute('position',new T3.BufferAttribute(P,3));G.setAttribute('normal',new T3.BufferAttribute(N,3));if(U)G.setAttribute('uv',new T3.BufferAttribute(U,2));
      G.setIndex(new T3.BufferAttribute(I,1));if(!hasN)G.computeVertexNormals();G.userData.shared=true;
      mat.envMapIntensity=1.25;if(!groups[key]){groups[key]=new T3.Group();groups[key].name=key;out.add(groups[key]);}groups[key].add(new T3.Mesh(G,mat));}
    return out;}
  function loadGLB(cb){
    T3=T3||window.THREE;
    if(GLB.state===2)return cb&&cb(true);if(GLB.state===3)return cb&&cb(false);
    if(cb)GLB.wait.push(cb);if(GLB.state===1)return;GLB.state=1;
    const done=okk=>{GLB.state=okk?2:3;GLB.wait.splice(0).forEach(f=>{try{f(okk);}catch(e){console.warn(e);}});};
    try{if(!T3||!T3.GLTFLoader)throw new Error('GLTFLoader missing');
      const L=new T3.GLTFLoader(),use=gl=>{try{
        const m=mergeGLB(gl.scene),b=new T3.Box3().setFromObject(m),c=b.getCenter(new T3.Vector3()),sz=b.getSize(new T3.Vector3());
        const k=5.4/sz.x,h=new T3.Group();m.position.set(-c.x,0,0);h.add(m);h.scale.setScalar(k);h.rotation.y=-Math.PI/2;
        GLB.proto=new T3.Group();GLB.proto.add(h);GLB.k=k;GLB.cx=c.x;GLB.x0=b.min.x;GLB.x1=b.max.x;GLB.aft=-sz.x*k/2;GLB.rad=Math.hypot(sz.x,sz.y,sz.z)*k/2*.62;
        done(true);}catch(e){console.warn('Spacecraft model could not be prepared:',e&&e.message);done(false);}};
      const fail=()=>{console.warn('Spacecraft model not loaded; using the built-in craft.');done(false);};
      /* hosts that cannot serve .glb files can ship the same model as js/spacecraft_glb.js (base64) instead */
      const embedded=()=>{const sc=document.createElement('script');sc.src='js/spacecraft_glb.js';sc.onerror=fail;
        sc.onload=()=>{try{const bin=atob(window.SPACECRAFT_GLB_B64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);L.parse(u.buffer,'',use,fail);}catch(e){fail();}};document.head.appendChild(sc);};
      L.load('assets/spacecraft_3d.glb',use,undefined,embedded);
    }catch(e){console.warn('Spacecraft model unavailable:',e&&e.message);done(false);}}
  const dullMat=x=>{const c=x.clone();const l=c.color.getHSL({h:0,s:0,l:0});c.color.setHSL(l.h,l.s*.25,l.l*.55);if(c.emissive)c.emissive.setScalar(0);c.envMapIntensity=.5;return c;};
  /* Build the player's spacecraft from the model. Every build choice shows:
     solar arrays (power), copper radiator arms (thermal), gold tanks (propellant load), antenna and dish (comms),
     hull detail and hoops (structure), engine bells (propulsion), bridge sensors (computer), battery boxes, spares (redundancy). */
  function glbCraft(g,o){
    const body=GLB.proto.clone(true),inner=body.children[0].children[0],grp={};inner.children.forEach(c=>grp[c.name]=c);g.add(body);
    const show=(k,v)=>{if(grp[k])grp[k].visible=v;},wing=o.wing??1,th=o.thermal??1,st=o.structure??1,eng=o.engine??1,dish=o.dish??1,comp=o.computer??1,stow=!!o.stowed;
    show('sol_a',!stow);show('sol_f',!stow&&wing>=1);for(const k of['sol_a','sol_f'])if(grp[k])grp[k].scale.set(1,wing===2?1.22:1,1);
    show('rad_a',!stow&&th>=1);show('rad_f',!stow&&th>=2);
    const nt=Math.max(1,Math.round(12*Math.min(1,(o.prop??350)/800)));['a0','f0','a1','f1','a2','f2','a3','f3','a4','f4','a5','f5'].forEach((k,i)=>show('tk_'+k,i<nt));
    show('detail',st>=1);show('ribs',st>=1);show('sens0',true);show('sens1',comp>=1);show('sens2',comp>=2);
    const add=(m)=>{inner.add(m);return m;},X0=GLB.x0;
    if(grp.ant){const s=[.75,1,1.3][dish];grp.ant.scale.set(1,s,1);grp.ant.position.y=.4*(1-s);}
    if(!stow||dish===0){const dr=[.34,.55,.82][dish],f=dr*.6,pts=[];for(let i=0;i<=12;i++){const r=dr*i/12;pts.push(new T3.Vector2(r,r*r/(4*f)));}
      const d=new T3.Group();d.add(M(new T3.LatheGeometry(pts,36),'white'));d.add(M(cyl(.03,.02,f*.9,10),'alu',0,f*.5,0));d.position.set(-.88,.4+1.12*[.75,1,1.3][dish],.12);d.rotation.set(.5,0,-.35);add(d);}
    if(st===2)for(const x of[-6.2,-5.6,-5,-2.9,-1.7,4.7,5.4,6.1]){const r=x<-4.4?.61:x<-1?.83:.74,t=M(new T3.TorusGeometry(r,.035,8,40),'alu',x,0,0);t.rotation.y=Math.PI/2;add(t);}
    const noz=(r,len,y,z)=>{const b=M(bell(r*.25,r,len),'nozzle',X0+.02,y,z);b.rotation.z=-Math.PI/2;add(b);};
    if(eng===0)for(const a of[0,1,2,3])noz(.13,.3,Math.cos(a*Math.PI/2+.78)*.32,Math.sin(a*Math.PI/2+.78)*.32);
    else if(eng===1)noz(.42,.75,0,0);else{noz(.52,1,0,0);for(const a of[0,1,2])noz(.11,.26,Math.cos(a*2.094)*.5,Math.sin(a*2.094)*.5);}
    /* battery packs: dark boxes on top of the mid-section, one per tier */
    for(let i=0;i<=(o.battery??1);i++){add(M(box(.62,.34,.7),'carbon',-3.3+i*.72,.98,0));add(M(box(.66,.05,.74),'alu',-3.3+i*.72,1.17,0));add(M(box(.5,.02,.5),'copper',-3.3+i*.72,1.2,0));}
    /* flight computer: avionics boxes along the forward module, with a star tracker (tier 1) and a navigation dome (tier 2) */
    for(let i=0;i<=comp;i++){add(M(box(.7,.3,.6),'silverfoil',2.6+i*.85,.9,0));add(M(box(.5,.04,.4),'radiator',2.6+i*.85,1.07,0));}
    if(comp>=1){const t=M(cyl(.14,.11,.36,16),'dark',2.2,1.05,.35);t.rotation.x=.5;add(t);}
    if(comp>=2){add(M(new T3.SphereGeometry(.26,20,14,0,TAU,0,Math.PI/2),'lens',5.1,.74,0));add(M(cyl(.28,.28,.05,20),'alu',5.1,.74,0));}
    if(o.red&&grp.ant){const a2=grp.ant.clone(true);a2.position.z=-.3;a2.scale.copy(grp.ant.scale);add(a2);add(M(box(.3,.18,.26),'silverfoil',-.2,.78,0));}
    if(o.grey)body.traverse(m=>{if(m.isMesh)m.material=dullMat(m.material);});
    /* the chosen instruments ride under the main bridge */
    const parts={},list=o.inst||['cam','spec','mcs','radar'],slot={};list.forEach((k,i)=>{slot[k]=list.length>1?-.8+i*1.5/(list.length-1):-.1;});
    if(list.length){g.add(M(box(.2,.025,1.72),'alu',0,-.268,-.08));for(const k of list)for(const sx of[-.07,.07])g.add(M(cyl(.012,.012,.3,6),'alu',sx,-.13,slot[k]));}
    list.forEach(k=>{const p=instPart(k);p.scale.setScalar(.75);p.position.set(0,-.28,slot[k]);if(stow&&(k==='radar'||k==='grs'||k==='mag'))p.scale.set(.2,.75,.2);if(o.grey)p.traverse(m=>{if(m.isMesh)m.material=dullMat(m.material);});g.add(p);parts[k]=p;});
    const nl=[.3,.75,1][eng]*GLB.k,fl=plume(0xbcd6ff,3.2,.55);fl.rotation.x=Math.PI/2;fl.position.z=GLB.aft-nl-.1;fl.visible=false;g.add(fl);
    const lamp=new T3.Mesh(new T3.SphereGeometry(.09,10,8),new T3.MeshBasicMaterial({color:0xff4030}));lamp.position.set(0,.75,-.55);lamp.visible=!!o.grey;g.add(lamp);
    /* deploy(t): 0 = arrays and radiator arms folded against the hull, 1 = fully open */
    const fold=['sol_a','sol_f','rad_a','rad_f'].filter(k=>grp[k]&&grp[k].visible),base=fold.map(k=>grp[k].scale.y);
    const deploy=t=>fold.forEach((k,i)=>{const q=Math.max(.05,t);grp[k].scale.set(1,base[i]*q,q);});
    Object.assign(g.userData,{flame:fl,lamp,parts,deploy,rad:stow?2.75:GLB.rad,glb:true,len:5.4});}
  function craft(o={}){
    const g=new T3.Group();
    if(GLB.state===2){glbCraft(g,o);return g;}
    const p=procCraft(o);g.add(p);Object.assign(g.userData,p.userData);
    if(GLB.state!==3)loadGLB(okk=>{if(!okk)return;const f=g.userData.flame,l=g.userData.lamp,fv=f.visible,lv=l.visible;
      g.remove(p);p.traverse(m=>{if(m.geometry&&!m.geometry.userData.shared)m.geometry.dispose();});glbCraft(g,o);g.userData.flame.visible=fv;g.userData.lamp.visible=lv;
      if(g.userData.onSwap)g.userData.onSwap();});
    return g;}

  /* ---------- the spacecraft. o: {wing,dish,inst[],structure,engine,thermal,battery,red,prop,grey} ---------- */
  function procCraft(o={}){
    const g=new T3.Group(),st=o.structure??1,eng=o.engine??1,th=o.thermal??1;
    g.add(M(box(1,1.25,1),'foil'));
    /* structure: what the frame looks like */
    const rail=st===2?.07:.045,rm=st===0?'carbon':'alu';
    for(const sx of[-1,1])for(const sz of[-1,1])g.add(M(box(rail,1.27,rail),rm,sx*.5,0,sz*.5));
    for(const sy of[-1,1]){for(const sz of[-1,1])g.add(M(box(1.02,rail,rail),rm,0,sy*.625,sz*.5));for(const sx of[-1,1])g.add(M(box(rail,rail,1.02),rm,sx*.5,sy*.625,0));}
    if(st===0)g.add(M(box(.82,1.02,.02),'carbon',0,0,.505));
    if(st===2){for(const d of[-1,1]){const b=M(box(.04,1.55,.04),'alu',0,0,.52);b.rotation.z=d*.675;g.add(b);const t=M(box(.04,.04,1.36),'alu',0,.645,0);t.rotation.y=d*.785;g.add(t);}}
    /* thermal control on the +z face */
    if(th>=1){g.add(M(box(.56,.46,.03),'radiator',0,-.2,.52));g.add(M(box(.6,.5,.012),'alu',0,-.2,.508));}
    if(th===2){for(const y of[-.2,.22]){const t=M(new T3.TorusGeometry(.2,.014,8,28,Math.PI),'copper',0,y+.26,.53);g.add(t);}g.add(M(box(.14,.1,.08),'alu',-.3,.38,.54));g.add(M(cyl(.014,.014,.6,8),'copper',.3,.2,.53));}
    /* solar arrays: 2, 3 or 4 panels per wing, tilted so the cells catch the light */
    const np=[2,3,4][o.wing??1],pl=.72,gap=.035;
    for(const d of[-1,1]){const w=new T3.Group();w.position.x=d*.5;w.rotation.x=.5;
      const yoke=M(cyl(.024,.024,.3,10),'alu',d*.15,0,0);yoke.rotation.z=Math.PI/2;w.add(yoke);
      for(const zz of[-1,1]){const a=M(cyl(.012,.012,.34,6),'alu',d*.2,0,zz*.16);a.rotation.z=Math.PI/2;a.rotation.y=zz*d*.7;w.add(a);}
      for(let i=0;i<np;i++){const p=new T3.Mesh(box(pl,.022,.95),[mat('alu'),mat('alu'),mat('cell'),mat('kapton'),mat('alu'),mat('alu')]);p.position.x=d*(.3+pl/2+i*(pl+gap));w.add(p);
        if(i)w.add(M(box(gap+.02,.012,.06),'alu',d*(.3+i*(pl+gap)-gap/2),0,.3)),w.add(M(box(gap+.02,.012,.06),'alu',d*(.3+i*(pl+gap)-gap/2),0,-.3));}
      g.add(w);}
    /* high-gain dish on a gimbal, plus low-gain antennas and star trackers */
    const dr=[.42,.62,.85][o.dish??1],f=dr*.62,dp=dr*dr/(4*f),pts=[];for(let i=0;i<=14;i++){const r=dr*i/14;pts.push(new T3.Vector2(r,r*r/(4*f)));}
    const hga=new T3.Group();hga.add(M(new T3.LatheGeometry(pts,40),'white'));hga.add(RX(M(new T3.TorusGeometry(dr,.012,8,40),'alu',0,dp,0)));
    const fy=Math.min(f,dp+dr*.55);hga.add(M(cyl(.05,.035,.07,14),'alu',0,fy,0));
    for(let i=0;i<3;i++){const a=i*TAU/3,x=Math.cos(a)*dr*.9,z=Math.sin(a)*dr*.9,y0=(dr*.9)**2/(4*f),len=Math.hypot(x,z,fy-y0),s=M(cyl(.008,.008,len,6),'alu',x/2,(fy+y0)/2,z/2);
      s.quaternion.setFromUnitVectors(new T3.Vector3(0,1,0),new T3.Vector3(-x,fy-y0,-z).normalize());hga.add(s);}
    hga.position.set(0,.625+.2,0);hga.rotation.x=.3;g.add(hga);g.add(M(cyl(.035,.045,.2,12),'alu',0,.725,0));g.add(M(new T3.SphereGeometry(.06,14,10),'alu',0,.825,0));
    const lga=(x,z)=>{g.add(M(cyl(.012,.012,.16,6),'alu',x,.705,z));g.add(M(new T3.ConeGeometry(.04,.07,12),'white',x,.8,z));};lga(.4,-.4);if(o.red)lga(-.4,-.4);
    const trk=x=>{const t=M(cyl(.045,.035,.12,14),'dark',x,.7,.4);t.rotation.x=.5;g.add(t);};trk(-.36);if(o.red)trk(.36);
    for(let i=0;i<=(o.battery??1);i++)g.add(M(box(.15,.1,.2),'carbon',-.18+i*.18,.675,-.22)),g.add(M(box(.155,.02,.205),'alu',-.18+i*.18,.7,-.22));
    /* propulsion on the -z face */
    const pr=.15+.15*Math.min(1,(o.prop??350)/700);for(const d of[-1,1])g.add(M(new T3.SphereGeometry(pr,22,16),'tank',d*.27,.33,-.5)),g.add(M(new T3.TorusGeometry(pr*.98,.012,6,24),'alu',d*.27,.33,-.5));
    if(eng===1){const b=M(bell(.055,.25,.42),'nozzle',0,0,-.56);b.rotation.x=Math.PI/2;g.add(b);g.add(RX(M(cyl(.09,.07,.1,16),'alu',0,0,-.53)));}
    else{for(const sx of[-1,1])for(const sy of[-1,1]){const b=M(bell(.025,.085,.16),'nozzle',sx*.14,sy*.14,-.52);b.rotation.x=Math.PI/2;g.add(b);}g.add(M(box(.42,.42,.03),'alu',0,0,-.51));}
    for(const sx of[-1,1])for(const sy of[-1,1]){const b=M(bell(.012,.035,.07),'nozzle',sx*.46,sy*.56,-.52);b.rotation.x=Math.PI/2;g.add(b);}
    /* instruments on the planet-facing deck */
    const parts={},LST=o.inst||['cam','spec','mcs','radar'],POS={};LST.forEach((k,i)=>{const c=Math.ceil(Math.sqrt(LST.length)),r=Math.ceil(LST.length/c);POS[k]=[-.27+(i%c)*.54/Math.max(1,c-1),-.25+Math.floor(i/c)*.5/Math.max(1,r-1)];});
    (o.inst||['cam','spec','mcs','radar']).forEach(k=>{const p=instPart(k);p.position.set(POS[k][0],-.625,POS[k][1]);g.add(p);parts[k]=p;});
    const fl=sprite(0xffb060);fl.position.z=-1.25;fl.scale.set(1.1,1.1,1);fl.visible=false;g.add(fl);
    const lamp=new T3.Mesh(new T3.SphereGeometry(.07,10,8),new T3.MeshBasicMaterial({color:0xff4030}));lamp.position.set(.35,.72,.45);lamp.visible=!!o.grey;g.add(lamp);
    if(o.grey)g.traverse(m=>{if(m.isMesh&&m!==lamp){const dull=x=>{const c=x.clone();const l=c.color.getHSL({h:0,s:0,l:0});c.color.setHSL(l.h,l.s*.25,l.l*.55);if(c.emissive)c.emissive.setScalar(0);c.envMapIntensity=.5;return c;};m.material=Array.isArray(m.material)?m.material.map(dull):dull(m.material);}});
    g.userData={flame:fl,lamp,parts};return g;}

  /* ---------- launch vehicle: core stage, two solid boosters, upper stage and a long payload fairing.
     o.payload (craft options) puts the spacecraft inside with arrays and radiators folded; o.cutaway makes one
     fairing half see-through so you can check that it fits. Height 5.1 units stands for about 62 m. ---------- */
  function rocket(o={}){const g=new T3.Group(),FY=2.72,FR=.3;
    const core=new T3.Group();core.add(M(cyl(.22,.22,2.1,40),'copper',0,1.13,0));core.add(M(cyl(.224,.224,.07,40),'white',0,.5,0));core.add(M(cyl(.224,.224,.07,40),'white',0,1.7,0));
    core.add(M(cyl(.21,.23,.12,40),'dark',0,.06,0));for(const d of[-1,1])core.add(M(bell(.04,.11,.2),'nozzle',d*.09,.04,0));g.add(core);
    const up=new T3.Group();up.add(M(cyl(.222,.222,.1,40),'dark',0,2.23,0));up.add(M(cyl(.22,.22,.36,40),'white',0,2.46,0));up.add(M(bell(.03,.1,.16),'nozzle',0,2.3,0));
    const ad=M(cyl(.14,.22,.12,32),'alu',0,2.7,0);up.add(ad);g.add(up);
    const fp=[new T3.Vector2(.22,-.08),new T3.Vector2(FR,.06)];for(let i=0;i<=18;i++){const t=i/18;fp.push(new T3.Vector2(t<.62?FR:Math.max(.002,FR*Math.pow(Math.cos((t-.62)/.38*Math.PI/2),.62)),.06+t*2.24));}
    const glass=new T3.MeshStandardMaterial({color:0xf1eee8,transparent:true,opacity:.13,roughness:.3,metalness:0,side:T3.DoubleSide,depthWrite:false});
    const half=(st,m)=>{const h=new T3.Group();h.add(M(new T3.LatheGeometry(fp,28,st,Math.PI),m,0,0,0));h.position.y=FY;g.add(h);return h;};
    const fa=half(Math.PI/2,'white'),fb=half(-Math.PI/2,o.cutaway?glass:'white');
    g.add(M(cyl(FR+.004,FR+.004,.03,40),'dark',0,FY+.5,0));
    const srb=[];for(const d of[-1,1]){const b=new T3.Group();b.add(M(cyl(.095,.095,1.55,24),'white',0,.83,0));b.add(M(new T3.ConeGeometry(.095,.26,24),'white',0,1.735,0));b.add(M(cyl(.097,.097,.05,24),'dark',0,1.25,0));b.add(M(cyl(.097,.097,.05,24),'dark',0,.6,0));
      b.add(M(bell(.035,.085,.14),'nozzle',0,.06,0));b.position.x=d*.325;g.add(b);srb.push(b);}
    let pay=null;if(o.payload){pay=craft(Object.assign({},o.payload,{stowed:true}));const fit=()=>{const L=pay.userData.len||3.4;pay.scale.setScalar(1.95/L*(pay.userData.glb?1:.5));};fit();pay.userData.onSwap=fit;
      pay.rotation.x=-Math.PI/2;pay.position.y=FY+1.08;g.add(pay);}
    /* livery and hardware: roll-pattern bands, interstage, raceway, booster struts */
    for(const y of[.9,1.3])core.add(M(cyl(.2215,.2215,.16,40),'dark',0,y,0));core.add(M(cyl(.226,.226,.05,40),'alu',0,2.16,0));
    core.add(M(box(.03,1.9,.03),'white',.222,1.1,0));core.add(M(box(.03,1.9,.03),'white',-.11,1.1,.193));
    for(const d of[-1,1])for(const y of[.35,1.45])core.add(M(box(.14,.025,.025),'alu',d*.26,y,0));
    up.add(M(cyl(.2225,.2225,.05,40),'copper',0,2.56,0));up.add(M(cyl(.2225,.2225,.02,40),'dark',0,2.36,0));
    for(const b of srb){b.add(M(cyl(.0965,.0965,.3,24),'copper',0,.95,0));b.add(M(new T3.ConeGeometry(.05,.1,16),'dark',0,1.84,0));}
    for(const h of[fa,fb]){h.add(M(cyl(FR+.003,FR+.003,.05,40,1,true),'copper',0,1.25,0));}
    const fl=plume(0xffb878,1.5,.26);fl.position.y=-.02;g.add(fl);
    const sf=srb.map(b=>{const p=plume(0xffd9a0,1.3,.14);p.position.y=0;p.visible=false;b.add(p);return p;});
    g.userData={flame:fl,sf,srb,fair:[fa,fb],core,up,pay,h:FY+2.3};return g;}

  /* ---------- planets, with a thin atmosphere that glows on the sunlit edge ---------- */
  function planet(name){
    const g=new T3.Group(),mars=name==='mars',m=mars?marsMaps():earthMaps(),sunDir=new T3.Vector3(-.7,.35,.6).normalize();
    const map=tex(m.col),rg=mars?null:tex(m.rgh,false),pm=new T3.MeshStandardMaterial(mars?{map,bumpMap:tex(m.hgt,false),bumpScale:m.real?.004:.012,roughness:.95,metalness:0,envMapIntensity:0}:{map,roughnessMap:rg,roughness:1,metalness:.05,envMapIntensity:0});
    (cache[name+'Texs']=cache[name+'Texs']||[]).push(map);(cache[name+'Mats']=cache[name+'Mats']||[]).push(pm);if(rg)(cache.earthRgh=cache.earthRgh||[]).push(rg);
    g.add(new T3.Mesh(new T3.SphereGeometry(1,96,64),pm));
    if(!mars){const c=new T3.Mesh(new T3.SphereGeometry(1.012,64,48),new T3.MeshStandardMaterial({color:0xd4d8dc,alphaMap:tex(m.cld,false),transparent:true,opacity:.7,depthWrite:false,roughness:1,envMapIntensity:0}));g.add(c);g.userData.clouds=c;}
    const atm=new T3.Mesh(new T3.SphereGeometry(mars?1.02:1.035,64,48),new T3.ShaderMaterial({transparent:true,depthWrite:false,blending:T3.AdditiveBlending,
      uniforms:{col:{value:new T3.Color(mars?0xf0a070:0x6fb2ff)},sunDir:{value:sunDir},pw:{value:mars?3.2:2.4},k:{value:mars?.75:1.25}},
      vertexShader:'#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vN;varying vec3 vP;varying vec3 vW;void main(){vN=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);vP=p.xyz;vW=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*p;\n#include <logdepthbuf_vertex>\n}',
      fragmentShader:'#include <logdepthbuf_pars_fragment>\nuniform vec3 col;uniform vec3 sunDir;uniform float pw;uniform float k;varying vec3 vN;varying vec3 vP;varying vec3 vW;void main(){\n#include <logdepthbuf_fragment>\nfloat rim=pow(1.0-max(dot(normalize(vN),normalize(-vP)),0.0),pw);float lit=smoothstep(-0.2,0.45,dot(normalize(vW),sunDir));gl_FragColor=vec4(col,rim*lit*k);}'}));
    g.add(atm);g.userData.sun=sunDir;return g;}

  /* ---------- live 3D views inside the page: one shared renderer, drawn into ordinary canvases ---------- */
  function init(){
    if(ok!==null)return ok;
    try{T3=window.THREE;if(!T3)throw new Error('three.js not loaded');
      R=new T3.WebGLRenderer({antialias:true,alpha:true});R.setPixelRatio(1);R.setClearColor(0x000000,0);grade(R);ok=true;
    }catch(e){console.warn('3D views unavailable, using 2D drawings:',e&&e.message);ok=false;}
    return ok;}
  function grade(r){r.outputEncoding=T3.sRGBEncoding;r.toneMapping=T3.ACESFilmicToneMapping;r.toneMappingExposure=1.15;}
  function lights(scene,sunPos=[-6,4,5]){const sun=new T3.DirectionalLight(0xfff3e2,2.6);sun.position.set(...sunPos);scene.add(sun);scene.add(new T3.HemisphereLight(0x8fa6c8,0x6a3a24,.35));scene.environment=envMap();return sun;}
  /* ---------- the surface rover ----------
     Built from the Mars Exploration Rover model the player supplied (js/rover_mesh.js, made by
     tools/obj2rover.py). The model arrives split into named parts: six wheels, rocker-bogie suspension,
     body, solar deck, two solar wings, camera mast and head, high-gain and low-gain antennas, robot arm.
     rover(o) puts those parts together for one configuration and adds the hardware the player chose
     (wheels, power unit, instruments, drill, sample rack, antennas, covers, markings). Every added piece
     is a child of the part it bolts to, so moving or scaling a part carries its hardware with it.
     o is the rover configuration from js/roverkit.js (RK.defaults() lists every field). */
  const RVM={geo:null,box:null,meta:null};
  function rvGeo(){
    if(RVM.geo)return RVM.geo;const src=window.ROVER_MESH;if(!src)return null;
    const dec=(s,T)=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new T(u.buffer);};
    const lin=v=>Math.pow(v/255,2.2),out={},bb={},a=new T3.Vector3(),b=new T3.Vector3(),c=new T3.Vector3();
    for(const part in src.parts){out[part]={};const bx=new T3.Box3();
      for(const m in src.parts[part]){const d=src.parts[part][m],p=dec(d.p,Int16Array),col=dec(d.c,Uint8Array),idx=dec(d.i,Uint16Array),n=idx.length;
        const pos=new Float32Array(n*3),cl=new Float32Array(n*3),uv=new Float32Array(n*2);
        for(let k=0;k<n;k++){const v=idx[k];for(let j=0;j<3;j++){pos[k*3+j]=p[v*3+j]*1e-4;cl[k*3+j]=lin(col[v*3+j]);}}
        /* box projection: each triangle takes its texture coordinates from the plane it faces most */
        for(let t=0;t<n;t+=3){a.fromArray(pos,t*3);b.fromArray(pos,t*3+3);c.fromArray(pos,t*3+6);const nx=new T3.Vector3().subVectors(b,a).cross(new T3.Vector3().subVectors(c,a));
          const ax=Math.abs(nx.x),ay=Math.abs(nx.y),az=Math.abs(nx.z);
          for(let j=0;j<3;j++){const q=t+j,X=pos[q*3],Y=pos[q*3+1],Z=pos[q*3+2];const [u,v]=ax>=ay&&ax>=az?[Z,Y]:ay>=az?[X,Z]:[X,Y];uv[q*2]=u*1.6;uv[q*2+1]=v*1.6;}}
        const g=new T3.BufferGeometry();g.setAttribute('position',new T3.BufferAttribute(pos,3));g.setAttribute('color',new T3.BufferAttribute(cl,3));g.setAttribute('uv',new T3.BufferAttribute(uv,2));
        g.computeVertexNormals();g.computeBoundingBox();g.userData.shared=true;out[part][m]=g;bx.union(g.boundingBox);}
      bb[part]=bx;}
    RVM.geo=out;RVM.box=bb;RVM.meta=src.meta;return out;}
  /* weathering: light grime, a little Mars dust in the corners, faint handling marks. Used as a color map
     (multiplied with the model's own colors) and as a roughness map, so dusty patches look duller. */
  function rvTex(){
    if(cache.rv)return cache.rv;const r=prng(77),N=256;
    const g=cvs(N,N),x=g.getContext('2d');x.fillStyle='#f4f1ec';x.fillRect(0,0,N,N);
    for(let i=0;i<1400;i++){const px=r()*N,py=r()*N,s=1+r()*3;x.fillStyle=`rgba(${150+r()*60|0},${96+r()*40|0},${64+r()*30|0},${.05+r()*.1})`;x.fillRect(px,py,s,s);}
    for(let i=0;i<40;i++){const px=r()*N,py=r()*N,gr=x.createRadialGradient(px,py,0,px,py,10+r()*30);gr.addColorStop(0,'rgba(170,110,70,.16)');gr.addColorStop(1,'rgba(170,110,70,0)');x.fillStyle=gr;x.fillRect(0,0,N,N);}
    for(let i=0;i<30;i++){const px=r()*N;x.fillStyle='rgba(120,80,55,.06)';x.fillRect(px,0,1+r()*2,N);}
    const ro=cvs(N,N),y=ro.getContext('2d');y.drawImage(g,0,0);const im=y.getImageData(0,0,N,N),d=im.data;
    for(let i=0;i<d.length;i+=4){const l=(d[i]+d[i+1]+d[i+2])/3,v=Math.max(0,Math.min(255,255-(l-150)*1.6+r()*14));d[i]=d[i+1]=d[i+2]=v;}y.putImageData(im,0,0);
    const cell=cvs(128,128),z=cell.getContext('2d');z.fillStyle='#9aa3ad';z.fillRect(0,0,128,128);
    for(let j=0;j<8;j++)for(let i=0;i<8;i++){const v=r();z.fillStyle=`rgb(${14+v*10|0},${22+v*16|0},${54+v*30|0})`;z.fillRect(i*16+1,j*16+1,14,14);z.fillStyle='rgba(160,180,210,.35)';z.fillRect(i*16+1,j*16+5,14,.6);z.fillRect(i*16+1,j*16+10,14,.6);}
    const T=(cn,srgb)=>{const t=new T3.CanvasTexture(cn);t.wrapS=t.wrapT=T3.RepeatWrapping;if(srgb)t.encoding=T3.sRGBEncoding;return t;};
    return cache.rv={map:T(g,true),rough:T(ro,false),cell:T(cell,true)};}
  function rvMats(o){
    const t=rvTex(),S=p=>new T3.MeshStandardMaterial(Object.assign({map:t.map,roughnessMap:t.rough,envMapIntensity:1.05},p));
    const paint=o.paint||'flight',th=o.therm||'std',solar=['solar','solarL','hybrid'].includes(o.power||'solar');
    const m={alu:S({vertexColors:true,color:0xe0e2e6,metalness:.78,roughness:.44}),palu:S({color:0xa9adb3,metalness:.82,roughness:.4}),pdark:S({color:0x2a2c30,metalness:.45,roughness:.55}),gold:S({vertexColors:true,metalness:.66,roughness:.46}),
      dark:S({vertexColors:true,metalness:.35,roughness:.62}),lens:new T3.MeshStandardMaterial({color:0x0c1016,metalness:.9,roughness:.08,envMapIntensity:2})};
    /* body panels: flight colors, white thermal paint or bare aluminum; insulation changes the sheen; composite chassis is darker */
    if(paint==='white')m.foil=S({color:0xe9e6df,metalness:.05,roughness:.7});
    else if(paint==='grey')m.foil=S({color:0x9ea2a7,metalness:.7,roughness:.46});
    else if(o.chassis==='comp')m.foil=S({color:0x2c2e33,metalness:.25,roughness:.5});
    else m.foil=S({vertexColors:true,metalness:th==='aero'?.82:th==='min'?.3:.58,roughness:th==='aero'?.34:th==='min'?.72:.5});
    /* solar cells, or a plain radiator panel when the rover carries no solar array */
    m.cell=solar?new T3.MeshStandardMaterial({map:t.cell,color:0xb8c4d8,metalness:.45,roughness:.24,envMapIntensity:1.5})
               :S({color:0xd9d5cd,metalness:.1,roughness:.66});
    m.rubber=S({color:0x2a2a2c,metalness:.1,roughness:.9});m.ti=S({color:0xb7b1a6,metalness:.75,roughness:.4});
    m.white=S({color:0xe6e2da,metalness:.08,roughness:.62});m.black=S({color:0x17181b,metalness:.3,roughness:.6});
    m.goldfoil=S({color:0xd7a64a,metalness:.8,roughness:.36});m.rtg=S({color:0x3b3d42,metalness:.55,roughness:.55});
    return m;}
  /* one wheel, axle along z, centered on its hub. r = radius, w = width (model units) */
  function rvWheel(type,r,w,side,mt,geo,W0){
    const g=new T3.Group(),R0=W0.r,Wd=W0.w;
    if(type==='std'&&geo.wheel0){ /* the model's own wheel, resized */
      for(const k in geo.wheel0){const m=new T3.Mesh(geo.wheel0[k],mt[k]||mt.alu);g.add(m);}g.scale.set(r/R0,r/R0,w/Wd);if(side<0)g.rotation.y=Math.PI;return g;}
    const drumR=type==='mesh'?r*.93:r*.9,ww=type==='sand'?w*1.35:w;
    /* rim drum and inner disk */
    const drumMat=type==='mesh'?new T3.MeshStandardMaterial({color:0xa9a49a,metalness:.8,roughness:.45,wireframe:true}):mt.palu;
    const drum=new T3.Mesh(new T3.CylinderGeometry(drumR,drumR,ww,48,type==='mesh'?6:1,true),drumMat);if(type!=='mesh')drumMat.side=T3.DoubleSide;drum.rotation.x=Math.PI/2;g.add(drum);
    if(type==='mesh'){const inner=new T3.Mesh(new T3.CylinderGeometry(drumR*.97,drumR*.97,ww*.96,32,1,true),mt.pdark);inner.rotation.x=Math.PI/2;g.add(inner);}
    const disk=new T3.Mesh(new T3.CircleGeometry(drumR*.98,40),mt.palu);disk.position.z=-side*ww*.32;disk.rotation.y=side>0?Math.PI:0;g.add(disk);
    /* hub and flexible spokes */
    const hub=new T3.Mesh(new T3.CylinderGeometry(r*.24,r*.24,ww*.9,24),mt.pdark);hub.rotation.x=Math.PI/2;g.add(hub);
    const cap=new T3.Mesh(new T3.CylinderGeometry(r*.14,r*.16,ww*.2,20),mt.ti);cap.rotation.x=Math.PI/2;cap.position.z=side*ww*.5;g.add(cap);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,sp=new T3.Mesh(new T3.BoxGeometry(drumR*.75,r*.05,r*.035),mt.ti);sp.position.set(Math.cos(a)*drumR*.55,Math.sin(a)*drumR*.55,side*ww*.36);sp.rotation.z=a+.35;g.add(sp);}
    /* treads (one instanced mesh per wheel) */
    const n=type==='sand'?22:type==='mesh'?30:type==='curved'?48:26,gh=type==='sand'?r*.14:type==='mesh'?r*.05:r*.06;
    const tg=new T3.BoxGeometry(r*(type==='sand'?.06:.035),gh,ww*(type==='curved'?.5:.98)),inst=new T3.InstancedMesh(tg,type==='mesh'?mt.ti:mt.palu,type==='curved'?n*2:n),q=new T3.Object3D();
    let k=0;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;
      if(type==='curved'){for(const s of[-1,1]){q.position.set(Math.cos(a)*(drumR+gh/2),Math.sin(a)*(drumR+gh/2),s*ww*.24);q.rotation.set(0,s*.38,a+Math.PI/2);q.updateMatrix();inst.setMatrixAt(k++,q.matrix);}}
      else{q.position.set(Math.cos(a)*(drumR+gh/2),Math.sin(a)*(drumR+gh/2),0);q.rotation.set(0,0,a+Math.PI/2);q.updateMatrix();inst.setMatrixAt(k++,q.matrix);}}
    g.add(inst);return g;}
  /* small flat decals (markings and insignia) drawn on a canvas */
  function rvDecal(kind){const key='rvd:'+kind;if(cache[key])return cache[key];const c=cvs(256,128),x=c.getContext('2d');
    if(kind==='stripe'){x.fillStyle='#c4502b';x.fillRect(0,40,256,22);x.fillStyle='#e7e2d8';x.fillRect(0,66,256,8);}
    else if(kind==='flag'){x.fillStyle='#e7e2d8';x.fillRect(16,24,96,64);x.fillStyle='#1e3a6e';x.fillRect(16,24,40,34);x.fillStyle='#c4502b';for(let i=0;i<4;i++)x.fillRect(56,24+i*16,56,8);x.fillStyle='#e7e2d8';x.font='bold 22px sans-serif';x.fillText('ASEA',130,66);}
    else{x.translate(64,64);x.fillStyle='#1b2236';x.beginPath();x.arc(0,0,54,0,7);x.fill();x.strokeStyle='#d9a441';x.lineWidth=4;x.stroke();x.fillStyle='#e7e2d8';
      if(kind==='delta'){x.beginPath();x.moveTo(0,-34);x.lineTo(30,24);x.lineTo(-30,24);x.closePath();x.fill();x.fillStyle='#c4502b';x.beginPath();x.arc(0,8,9,0,7);x.fill();}
      else if(kind==='orbit'){x.fillStyle='#c4502b';x.beginPath();x.arc(0,0,16,0,7);x.fill();x.strokeStyle='#e7e2d8';x.lineWidth=3;x.beginPath();x.ellipse(0,0,42,16,-.4,0,7);x.stroke();}
      else{x.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr=i%2?14:34;x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}x.closePath();x.fill();}
      x.setTransform(1,0,0,1,0,0);x.fillStyle='#e7e2d8';x.font='bold 20px sans-serif';x.fillText('JEZERO',134,58);x.font='14px sans-serif';x.fillText('SURFACE TEAM',134,82);}
    const t=new T3.CanvasTexture(c);t.encoding=T3.sRGBEncoding;return cache[key]=t;}
  /* the full rover. Returns a Group whose origin is on the ground under the rover's middle. */
  function rover(o={}){
    const geo=rvGeo();if(!geo)return roverProc(o);
    const BX=RVM.box,W0=RVM.meta.wheels,mt=rvMats(o),root=new T3.Group(),veh=new T3.Group();root.add(veh);
    const tag=(obj,tab,key,label)=>{obj.userData.pick={tab,key,label};return obj;};
    const part=(name,par)=>{const g=new T3.Group();for(const k in geo[name]||{}){const m=new T3.Mesh(geo[name][k],mt[k]||mt.alu);m.castShadow=true;m.receiveShadow=true;g.add(m);}par.add(g);return g;};
    const B=(w,h,d,m,x,y,z,par)=>{const s=new T3.Mesh(new T3.BoxGeometry(w,h,d),typeof m==='string'?mt[m]:m);s.position.set(x,y,z);s.castShadow=true;par.add(s);return s;};
    const C=(r1,r2,h,m,x,y,z,par,rx=0,rz=0,seg=18)=>{const s=new T3.Mesh(new T3.CylinderGeometry(r1,r2,h,seg),typeof m==='string'?mt[m]:m);s.position.set(x,y,z);s.rotation.set(rx,0,rz);s.castShadow=true;par.add(s);return s;};
    const ctr=n=>BX[n].getCenter(new T3.Vector3());
    /* dimensions: length factor (chassis), wheel size, clearance */
    const kx={compact:.86,std:1,long:1.16}[o.dims||'std'],wr={s:.86,m:1,l:1.15}[o.wsize||'m'],R=W0[0].r*wr,dr=R-W0[0].r;
    const dc={low:-.07,std:0,high:.12}[o.clear||'std']+(o.susp==='active'?.04:0),HUB=.36,ATT=.9;
    veh.position.y=dr;
    const up=new T3.Group();up.position.y=dc;veh.add(up);
    /* chassis: body, deck and wings stretch with the length; the parts on top move with it */
    const chU=new T3.Group();chU.scale.x=kx;up.add(chU);
    const body=tag(part('body',chU),'chassis','body','Chassis and body');
    const deck=tag(part('deck',chU),'power','deck','Solar deck');
    const items=part('deckitem',up);items.position.x=(kx-1)*ctr('deckitem').x;
    /* suspension: stretched to the new clearance about the hub line */
    const chL=new T3.Group();chL.scale.x=kx;veh.add(chL);
    const susp=tag(new T3.Group(),'mobility','susp','Suspension');chL.add(susp);
    if(o.susp!=='rigid'){const sp=part('susp',susp),s=(ATT-HUB+dc)/(ATT-HUB);sp.scale.y=s;sp.position.y=HUB*(1-s);
      if(o.susp==='active')for(const z of[-.7,.7])for(const x of[-.5,.45]){const cy=C(.035,.035,.42,'ti',x,.66+dc*.5,z,susp,0,x<0?.6:-.6);C(.05,.05,.18,'black',x+(x<0?.1:-.1),.8+dc*.6,z,susp,0,x<0?.6:-.6);}}
    else{for(const w of W0){C(.035,.035,ATT+dc-w.y,'ti',w.x,(ATT+dc+w.y)/2,w.z*.82,susp);}for(const z of[-1,1])B(2.15,.06,.06,'ti',0,ATT+dc-.02,z*.71,susp);}
    /* wheels */
    const wt=o.wheel||'std',ww=W0[0].w*(o.wheel==='sand'?1.05:1)*(o.wsize==='l'?1.08:1);const wheels=tag(new T3.Group(),'mobility','wheel','Wheels');veh.add(wheels);
    W0.forEach((w,i)=>{const wg=rvWheel(wt,R,ww,w.z>0?1:-1,mt,geo,W0[0]);wg.position.set(w.x*kx,w.y,w.z*(o.wheel==='sand'?1.04:1));wg.traverse(m=>{if(m.isMesh){m.castShadow=true;}});wheels.add(wg);});
    /* solar wings: normal, longer, shorter (hybrid) or removed (RTG and battery-only) */
    const pw=o.power||'solar';
    for(const side of['wingL','wingR']){const hinge=side==='wingL'?-.78:.78,wg=new T3.Group();wg.position.z=hinge;chU.add(wg);const p=part(side,wg);p.position.z=-hinge;
      const s={solar:1,solarL:1.38,hybrid:.62}[pw];if(!s)wg.visible=false;else wg.scale.z=s;tag(wg,'power',side,'Solar wing');}
    const power=tag(new T3.Group(),'power','power','Power unit');up.add(power);
    const rear=BX.body.min.x*kx;
    if(pw==='rtg'||pw==='hybrid'){ /* radioisotope generator: finned cylinder on struts behind the body */
      const big=pw==='rtg',L=big?.62:.42,rad=big?.15:.11,g=new T3.Group();g.position.set(rear-.32,1.05,0);g.rotation.z=-.5;power.add(g);
      C(rad,rad,L,'rtg',0,0,0,g,0,Math.PI/2,24);for(let i=0;i<8;i++){const a=i*Math.PI/4,f=B(L*.92,rad*1.25,.012,'rtg',0,Math.cos(a)*rad*1.3,Math.sin(a)*rad*1.3,g);f.rotation.x=a;}
      C(rad*.6,rad*.6,.05,'goldfoil',L/2+.02,0,0,g,0,Math.PI/2);for(const z of[-.12,.12])C(.018,.018,.42,'ti',rear-.13,.92,z,power,0,1.1);}
    const nb={s:1,m:2,l:3}[o.battery||'m']+(pw==='battery'?1:0);for(let i=0;i<nb;i++){B(.16,.2,.34,'black',rear-.08,.78,-.36+i*.24*(nb>3?.8:1),power);B(.17,.02,.35,'goldfoil',rear-.08,.89,-.36+i*.24*(nb>3?.8:1),power);}
    /* mast and the instruments on it */
    const I=new Set(o.inst||[]),MAST=['pancam','navcam','chem','thermal','env'].some(k=>I.has(k));
    const mast=tag(new T3.Group(),'inst','mast','Remote sensing mast');mast.position.x=(kx-1)*ctr('mast').x;up.add(mast);mast.visible=MAST;
    part('mast',mast);const hb=BX.head,top=BX.mast.max.y,mx=ctr('mast').x,mz=ctr('mast').z;
    const head=tag(part('head',mast),'inst','pancam','Panoramic stereo camera');head.visible=I.has('pancam');
    if(!I.has('pancam')){const cap=B(.22,.12,.3,'white',mx+.04,top+.08,mz,mast);B(.04,.05,.05,'lens',mx+.16,top+.08,mz-.06,mast);B(.04,.05,.05,'lens',mx+.16,top+.08,mz+.06,mast);}
    if(I.has('navcam')){const g=tag(new T3.Group(),'inst','navcam','Navigation cameras');mast.add(g);B(.06,.05,.42,'pdark',hb.max.x-.08,hb.min.y-.04,mz,g);for(const z of[-.17,.17])B(.03,.035,.035,'lens',hb.max.x-.04,hb.min.y-.04,mz+z,g);}
    if(I.has('chem')){const g=tag(new T3.Group(),'inst','chem','Laser spectrometer');mast.add(g);const y0=(I.has('pancam')?hb.max.y:top+.14)+.09;
      B(.42,.17,.2,'white',mx+.03,y0,mz,g);C(.075,.075,.06,'black',mx+.26,y0,mz,g,0,Math.PI/2,24);C(.055,.055,.02,'lens',mx+.29,y0,mz,g,0,Math.PI/2,24);B(.3,.02,.18,'goldfoil',mx-.02,y0+.095,mz,g);}
    if(I.has('thermal')){const g=tag(new T3.Group(),'inst','thermal','Thermal infrared imager');mast.add(g);B(.12,.1,.1,'goldfoil',mx+.1,top-.32,mz+.12,g);C(.03,.03,.03,'lens',mx+.17,top-.32,mz+.12,g,0,Math.PI/2);}
    if(I.has('env')){const g=tag(new T3.Group(),'inst','env','Environmental sensors');mast.add(g);for(const s of[-1,1]){const bm=C(.012,.012,.36,'ti',mx,top-.55,mz+s*.2,g,Math.PI/2*s*.9);bm.rotation.z=.2;B(.06,.04,.04,'white',mx+.02,top-.53,mz+s*.38,g);}}
    if((o.dust==='covers'||o.dust==='eds')&&I.has('pancam')){const g=tag(new T3.Group(),'protect','dust','Dust covers');mast.add(g);for(const z of[-.15,.15]){const f=B(.015,.11,.1,'white',hb.max.x+.02,hb.max.y+.02,mz+z*1.05,g);f.rotation.z=.7;}}
    /* deck instruments */
    const dk=new T3.Group();up.add(dk);const DY=BX.deck.max.y,dx=x=>x*kx;
    const deckI={rad:[-.62,.36,'Radiation detector'],atmo:[-.15,.38,'Atmospheric analyzer'],seis:[.25,-.2,'Seismometer'],lab:[.15,.32,'Sample analysis lab'],mag:[-1.05,.1,'Magnetometer']};
    for(const k in deckI){if(!I.has(k))continue;const [x,z,l]=deckI[k],g=tag(new T3.Group(),'inst',k,l);dk.add(g);const X=dx(x);
      if(k==='rad'){B(.18,.12,.16,'white',X,DY+.06,z,g);C(.05,.05,.03,'black',X,DY+.135,z,g);}
      if(k==='atmo'){B(.22,.14,.16,'white',X,DY+.07,z,g);C(.016,.016,.16,'ti',X+.08,DY+.2,z,g);C(.03,.02,.04,'black',X+.08,DY+.29,z,g);}
      if(k==='seis'){const d=new T3.Mesh(new T3.SphereGeometry(.15,20,12,0,Math.PI*2,0,Math.PI/2),mt.goldfoil);d.position.set(X,DY,z);g.add(d);C(.17,.17,.03,'black',X,DY+.01,z,g,0,0,6);}
      if(k==='lab'){B(.3,.08,.22,'white',X,DY+.04,z,g);for(const s of[-.07,.07]){C(.035,.035,.05,'ti',X+s,DY+.1,z,g);B(.08,.012,.08,'black',X+s+.02,DY+.135,z,g).rotation.z=.6;}}
      if(k==='mag'){const bm=C(.014,.014,.95,'ti',X-.2,DY+.42,z,g,0,.5);B(.06,.06,.06,'white',X-.42,DY+.85,z,g);}}
    if(I.has('gpr')){const g=tag(new T3.Group(),'inst','gpr','Ground-penetrating radar');up.add(g);B(.34,.06,.3,'black',rear+.2,BX.body.min.y-.05,.3,g);B(.36,.012,.32,'goldfoil',rear+.2,BX.body.min.y-.085,.3,g);}
    /* robot arm, its turret tools and the sample rack */
    const armG=tag(new T3.Group(),'arm','arm','Robot arm');up.add(armG);const ac=ctr('arm'),sh=new T3.Vector3(BX.arm.min.x,ac.y+.15,ac.z);
    armG.position.set(sh.x*kx,sh.y,sh.z);const armP=part('arm',armG);armP.position.set(-sh.x,-sh.y,-sh.z);armG.visible=o.arm!=='none';
    armG.scale.setScalar(o.arm==='light'?.8:1);
    if(o.arm!=='none'){const tur=new T3.Group();tur.position.set(BX.arm.max.x-sh.x,BX.arm.min.y+.08-sh.y,ac.z-sh.z);armG.add(tur);
      const dr=o.drill||'core';const dg=tag(new T3.Group(),'arm','drill','Drill');tur.add(dg);
      if(dr==='core'){C(.06,.06,.16,'ti',0,-.12,.04,dg);C(.02,.02,.14,'palu',0,-.26,.04,dg);}
      else if(dr==='powder'){C(.04,.04,.12,'ti',0,-.1,.04,dg);C(.01,.01,.14,'palu',0,-.22,.04,dg);}
      else{const sc=B(.12,.04,.1,'ti',.02,-.14,.04,dg);sc.rotation.z=-.5;}
      if(I.has('apxs'))tag(C(.035,.035,.08,'goldfoil',.02,-.08,-.09,tur),'inst','apxs','Contact X-ray spectrometer');
      if(I.has('mi')){const g=tag(new T3.Group(),'inst','mi','Microscopic imager');tur.add(g);B(.06,.06,.08,'black',-.04,-.04,-.11,g);C(.02,.02,.02,'lens',-.04,-.08,-.11,g);}}
    const nT=o.store||8,rack=tag(new T3.Group(),'arm','store','Sample tube rack');up.add(rack);const rw=.06*Math.ceil(nT/2);
    B(rw+.04,.18,.12,'white',BX.body.max.x*kx-.05-rw/2,BX.body.min.y+.12,BX.body.max.z+.065,rack);
    for(let i=0;i<nT;i++){C(.016,.016,.15,'ti',BX.body.max.x*kx-.08-(i>>1)*.06,BX.body.min.y+.12+(i%2?.04:-.04),BX.body.max.z+.13,rack,Math.PI/2);}
    /* communications */
    const com=o.comms||'hga';const hga=tag(part('hga',up),'comms','hga','High-gain antenna');hga.position.x=(kx-1)*ctr('hga').x;hga.visible=com==='hga';
    const lga=tag(part('lga',up),'comms','lga','Low-gain antenna');lga.position.x=(kx-1)*ctr('lga').x;
    if(com!=='lga'){const g=tag(new T3.Group(),'comms','uhf','UHF relay antenna');up.add(g);const X=dx(-.95);C(.03,.03,.32,'white',X,DY+.16,-.5,g);for(let i=0;i<4;i++){const h=C(.01,.01,.1,'ti',X,DY+.3,-.5,g,0,0,6);h.rotation.set(0,i*Math.PI/4,Math.PI/2);}}
    if(o.backup===true||o.backup==='yes'){const g=tag(new T3.Group(),'comms','backup','Backup radio antenna');up.add(g);C(.01,.01,.36,'ti',dx(.62),DY+.18,.45,g,0,0,8);C(.03,.03,.04,'white',dx(.62),DY+.38,.45,g);}
    /* protection: armor plates over electronics, a reinforced frame */
    if(o.shield==='hard'){const g=tag(new T3.Group(),'protect','shield','Electronics shielding');chU.add(g);for(const z of[-1,1])B(.9,.24,.012,'black',-.05,.9,z*(BX.body.max.z+.007),g);}
    if(o.chassis==='reinf'){const g=tag(new T3.Group(),'chassis','frame','Reinforced frame');chU.add(g);for(const z of[-1,1])for(const y of[BX.body.min.y+.03,BX.body.max.y-.05])B(BX.body.max.x-BX.body.min.x+.02,.035,.035,'ti',ctr('body').x,y,z*(BX.body.max.z+.018),g);}
    /* markings and insignia (cosmetic) */
    const look=tag(new T3.Group(),'look','look','Markings');chU.add(look);const bz=BX.body.max.z+.004;
    if(o.mark&&o.mark!=='none')for(const z of[-1,1]){const pl=new T3.Mesh(new T3.PlaneGeometry(.7,.35),new T3.MeshStandardMaterial({map:rvDecal(o.mark),transparent:true,roughness:.6,metalness:.1}));pl.position.set(ctr('body').x-.1,.98,z*bz);if(z<0)pl.rotation.y=Math.PI;look.add(pl);}
    if(o.insig&&o.insig!=='none'){const pl=new T3.Mesh(new T3.PlaneGeometry(.36,.18),new T3.MeshStandardMaterial({map:rvDecal(o.insig),transparent:true,roughness:.6}));pl.position.set(BX.body.max.x+.004,.88,0);pl.rotation.y=Math.PI/2;look.add(pl);}
    root.userData.rad=2.15;root.userData.cy=.95;root.userData.rover=true;
    return root;}
  function roverProc(o={}){ /* hand-built stand-in, used only if js/rover_mesh.js is missing */
    const g=new T3.Group(),fb=new T3.Group();g.add(fb);const wide=o.wheels==='wide',big=o.battery==='large';
    const M=(c,r=.6,m=.2,extra)=>new T3.MeshStandardMaterial(Object.assign({color:c,roughness:r,metalness:m,envMapIntensity:.8},extra||{}));
    const white=M(0xe9e5dc,.55,.15),gold=M(0xd6a94a,.45,.75),dark=M(0x23262b,.7,.2),steel=M(0x8d9299,.35,.85),
      panel=M(0x1b2a72,.35,.55),rubber=M(0x1a1a1c,.95,0);
    const B=(w,h,d,mt,x,y,z,par)=>{const m=new T3.Mesh(new T3.BoxGeometry(w,h,d),mt);m.position.set(x,y,z);(par||fb).add(m);return m;};
    const C=(r1,r2,h,mt,x,y,z,rot,par)=>{const m=new T3.Mesh(new T3.CylinderGeometry(r1,r2,h,20),mt);m.position.set(x,y,z);if(rot)m.rotation.set(rot[0],rot[1],rot[2]);(par||fb).add(m);return m;};
    /* body, belly pan and solar deck */
    B(2.5,.5,1.4,white,0,.62,0);B(2.7,.1,1.5,gold,0,.9,0);B(2.5,.08,1.4,steel,0,.36,0);
    B(1.9,.06,1.1,panel,-.15,1.02,0);for(let i=-3;i<=3;i++)B(.03,.02,1.06,steel,-.15+i*.28,1.06,0);
    B(.5,.34,.4,dark,.85,.62,.62);B(.4,.05,.3,steel,.85,.8,.62);
    if(big)B(.5,.32,.9,gold,1.05,.62,0);
    /* mast with a stereo camera pair, plus a low-gain whip */
    C(.05,.05,.95,steel,-.75,1.3,.35);B(.32,.22,.22,white,-.75,1.82,.35);
    for(const dx of[-.07,.07])C(.05,.05,.06,dark,-.75+dx,1.82,.47,[Math.PI/2,0,0]);
    C(.015,.015,.5,steel,-.75,1.55,-.2,[0,0,.5]);
    /* high-gain antenna */
    const dish=new T3.Mesh(new T3.SphereGeometry(.32,22,12,0,Math.PI*2,0,.9),M(0xf2efe8,.4,.3,{side:T3.DoubleSide}));
    dish.position.set(.95,1.25,-.35);dish.rotation.set(1.2,0,.3);fb.add(dish);
    /* robot arm at the front: two booms and a turret */
    const arm=new T3.Group();arm.position.set(-1.25,.72,.2);fb.add(arm);
    B(.7,.09,.09,steel,-.35,0,0,arm);const b2=B(.55,.08,.08,steel,-.35,-.22,.1,arm);b2.rotation.z=.9;
    B(.16,.12,.12,dark,-.62,-.34,.2,arm);
    /* rocker-bogie suspension, three wheels a side */
    const wz=wide?.44:.3,wr=.38;
    for(const z of[.78,-.78]){
      B(1.7,.07,.07,steel,.15,.55,z);const a1=B(.6,.06,.06,steel,-.62,.42,z);a1.rotation.z=-.35;
      const a2=B(.7,.06,.06,steel,.7,.45,z);a2.rotation.z=.3;
      for(const [wx,wy] of[[-.95,.38],[.05,.34],[1.02,.38]]){
        const w=new T3.Mesh(new T3.CylinderGeometry(wr,wr,wz,18),rubber);w.position.set(wx,wy,z);w.rotation.x=Math.PI/2;fb.add(w);
        const hub=new T3.Mesh(new T3.CylinderGeometry(.12,.12,wz+.02,12),steel);hub.position.set(wx,wy,z);hub.rotation.x=Math.PI/2;fb.add(hub);
      }
    }
    /* sample rack and two headlamps */
    for(let i=0;i<4;i++)B(.1,.22,.1,steel,1.35,.5,-.5+i*.32);
    for(const dz of[-.45,.45])B(.12,.1,.12,gold,-1.3,.85,dz);
    g.userData.rad=2.05;
    return g;
  }
  function build(kind,o){return kind==='craft'?craft(o):kind==='inst'?instrument(o.k):kind==='rocket'?rocket(o):kind==='rover'?rover(o):planet(kind);}
  /* view(canvas, kind, options, {w,h,spin,drag,pitch}) -> {set(options)} or null when 3D is unavailable */
  function view(canvas,kind,o={},cfg={}){
    if(!init())return null;
    try{
      const scene=new T3.Scene(),cam=new T3.PerspectiveCamera(32,1,.1,200),pivot=new T3.Group(),sun=lights(scene,kind==='mars'?[-7,2.5,3.2]:kind==='rover'?[-3.5,6.5,4.5]:[-4,6,6]);if(kind==='mars')sun.intensity=1.9;scene.add(pivot);
      const v={canvas,scene,cam,pivot,kind,cfg,yaw:cfg.yaw??.6,pitch:cfg.pitch??.32,spin:cfg.spin??.25,hold:0,model:null,zoom:1,ctx:canvas.getContext('2d')};
      if(kind==='rover'){ /* soft shadows on a patch of ground, so the rover stands on something */
        R.shadowMap.enabled=true;R.shadowMap.type=T3.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);const sc=sun.shadow.camera;sc.left=-3;sc.right=3;sc.top=3;sc.bottom=-3;sc.near=.5;sc.far=20;sun.shadow.bias=-.0015;sun.shadow.radius=3;
        sun.color.set(0xffe9d2);sun.intensity=2.3;
        const gc=cvs(256,256),gx=gc.getContext('2d'),gr=gx.createRadialGradient(128,128,10,128,128,128);gr.addColorStop(0,'rgba(120,70,44,.95)');gr.addColorStop(.6,'rgba(110,62,40,.55)');gr.addColorStop(1,'rgba(90,50,32,0)');gx.fillStyle=gr;gx.fillRect(0,0,256,256);
        const gt=new T3.CanvasTexture(gc);gt.encoding=T3.sRGBEncoding;const ground=new T3.Mesh(new T3.CircleGeometry(3.4,48),new T3.MeshStandardMaterial({map:gt,transparent:true,roughness:1,metalness:0,depthWrite:false}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;pivot.add(ground);
        const sh=new T3.Mesh(new T3.CircleGeometry(3.2,48),new T3.ShadowMaterial({opacity:.45}));sh.rotation.x=-Math.PI/2;sh.position.y=.002;sh.receiveShadow=true;pivot.add(sh);}
      canvas.style.aspectRatio=(cfg.w||4)+'/'+(cfg.h||3);canvas.style.width='100%';canvas.style.display='block';
      const fit=()=>{if(kind==='mars'){v.rad=1.12;return;}
        if(v.model.userData.rad){v.rad=v.model.userData.rad;v.cy=v.model.userData.cy||0;return;}
        const b=new T3.Box3().setFromObject(v.model),s=b.getBoundingSphere(new T3.Sphere());v.rad=s.radius*(kind==='craft'?.68:.95);v.cy=kind==='craft'?0:s.center.y;};
      v.set=(no)=>{const key=JSON.stringify(no||{});if(key===v.key)return;v.key=key;if(v.model){pivot.remove(v.model);v.model.traverse(m=>{if(m.geometry&&!m.geometry.userData.shared)m.geometry.dispose();});}v.model=build(kind,no||{});pivot.add(v.model);
        if(kind==='mars'){v.model.rotation.z=.2;v.model.userData.sun.copy(sun.position).normalize();}
        if(kind==='craft')v.model.userData.onSwap=fit;
        fit();if(v.hl)v.highlight(v.hl);};
      /* highlight(key): makes one component glow (matched by its pick key or tab); null clears it */
      v.highlight=(key)=>{v.hl=key;(v.lit||[]).forEach(([m,mat])=>{m.material=mat;});v.lit=[];if(!key||!v.model)return;
        v.model.traverse(n=>{const pk=n.userData.pick;if(!pk||(pk.key!==key&&pk.tab!==key))return;n.traverse(m=>{if(!m.isMesh||v.lit.some(x=>x[0]===m))return;const c=m.material.clone();c.emissive=new T3.Color(0xf2b84f);c.emissiveIntensity=.35;v.lit.push([m,m.material]);m.material=c;});});};
      v.zoomBy=f=>{v.zoom=Math.max(.55,Math.min(2.6,v.zoom*f));v.hold=Math.max(v.hold,2.5);};
      v.set(o);
      if(cfg.drag!==false){canvas.style.cursor='grab';canvas.style.touchAction=cfg.zoom?'none':'pan-y';let px=0,py=0,on=false,moved=0;const pts=new Map();let pinch=0;
        canvas.addEventListener('pointerdown',e=>{pts.set(e.pointerId,[e.clientX,e.clientY]);on=true;moved=0;px=e.clientX;py=e.clientY;v.hold=1e9;try{canvas.setPointerCapture(e.pointerId);}catch(_){}
          if(pts.size===2){const [a,b]=[...pts.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
        canvas.addEventListener('pointermove',e=>{if(!on)return;if(pts.has(e.pointerId))pts.set(e.pointerId,[e.clientX,e.clientY]);
          if(cfg.zoom&&pts.size===2){const [a,b]=[...pts.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)v.zoomBy(d/pinch);pinch=d;moved=99;return;}
          moved+=Math.abs(e.clientX-px)+Math.abs(e.clientY-py);v.yaw+=(e.clientX-px)*.01;v.pitch=Math.max(-1.2,Math.min(1.2,v.pitch+(e.clientY-py)*.01));px=e.clientX;py=e.clientY;});
        const up=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=0;if(pts.size)return;on=false;v.hold=2.5;
          if(cfg.pick&&moved<6&&e.type==='pointerup'){const r=canvas.getBoundingClientRect(),ray=new T3.Raycaster();ray.setFromCamera(new T3.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),v.cam);
            const hit=ray.intersectObject(v.model,true).find(h=>h.object.visible);let n=hit&&hit.object;while(n&&!n.userData.pick)n=n.parent;if(n)cfg.pick(n.userData.pick);}};
        canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
        if(cfg.zoom)canvas.addEventListener('wheel',e=>{e.preventDefault();v.zoomBy(e.deltaY>0?.9:1.11);},{passive:false});}
      views.push(v);if(!looping){looping=true;requestAnimationFrame(loop);}
      return v;
    }catch(e){console.warn('3D view failed:',e&&e.message);return null;}}
  /* snapshot(kind, options, {w,h,top}) -> a canvas holding one rendered picture (top:true looks straight down,
     front of the model to the right). The rover expedition uses it to draw the player's own rover. */
  function snapshot(kind,o={},cfg={}){
    if(!init())return null;
    try{const w=cfg.w||256,h=cfg.h||256,scene=new T3.Scene();const sun=lights(scene,[-2,8,3]);sun.intensity=2.4;const m=build(kind,o);scene.add(m);
      const b=new T3.Box3().setFromObject(m),c=b.getCenter(new T3.Vector3()),sz=b.getSize(new T3.Vector3()),half=Math.max(sz.x,sz.z)/2*1.04;
      const cam=cfg.top?new T3.OrthographicCamera(-half,half,half*h/w,-half*h/w,.1,50):new T3.PerspectiveCamera(30,w/h,.1,50);
      if(cfg.top){cam.position.set(c.x,20,c.z);cam.up.set(0,0,-1);cam.lookAt(c.x,0,c.z);}else{cam.position.set(c.x+4,c.y+2.5,c.z+5);cam.lookAt(c);}
      const sm=R.shadowMap.enabled;R.shadowMap.enabled=false;R.setSize(w,h,false);rw=rh=0;R.render(scene,cam);R.shadowMap.enabled=sm;
      const out=cvs(w,h);out.getContext('2d').drawImage(R.domElement,0,0,w,h);
      m.traverse(n=>{if(n.geometry&&!n.geometry.userData.shared)n.geometry.dispose();});
      return {canvas:out,span:half*2,center:[c.x,c.z]};
    }catch(e){console.warn('snapshot failed:',e&&e.message);return null;}}
  let last=0;
  function loop(now){
    views=views.filter(v=>v.canvas.isConnected);if(!views.length){looping=false;return;}
    const dt=Math.min(.05,(now-last)/1000||0);last=now;
    if(!document.querySelector('.cine:not(.out)')){const still=matchMedia('(prefers-reduced-motion: reduce)').matches,dpr=Math.min(2,window.devicePixelRatio||1);
      for(const v of views){const cw=v.canvas.clientWidth;if(!cw)continue;const w=Math.round(cw*dpr),h=Math.round(cw*dpr*(v.cfg.h||3)/(v.cfg.w||4));
        if(v.canvas.width!==w||v.canvas.height!==h){v.canvas.width=w;v.canvas.height=h;}
        if(v.hold>0)v.hold-=dt;else if(!still)v.yaw+=v.spin*dt;
        v.pivot.rotation.set(v.pitch,v.yaw,0);if(v.model.userData.clouds)v.model.userData.clouds.rotation.y+=dt*.01;
        const asp=w/h,half=v.cam.fov*Math.PI/360,d=v.rad/Math.sin(Math.min(half,Math.atan(Math.tan(half)*asp)))*1.04/(v.zoom||1);
        v.cam.aspect=asp;v.cam.position.set(0,v.cy||0,d);v.cam.lookAt(0,v.cy||0,0);v.cam.updateProjectionMatrix();
        if(rw!==w||rh!==h){R.setSize(w,h,false);rw=w;rh=h;}
        R.render(v.scene,v.cam);v.ctx.clearRect(0,0,w,h);v.ctx.drawImage(R.domElement,0,0);}}
    requestAnimationFrame(loop);}

  /* ---------- the view out of the window: a full-page scene behind the console ----------
     Each game stage has a "pose" (where Mars and Earth sit); changing stage glides from one to the next,
     so moving through the mission feels like traveling rather than loading a new page. */
  const POSE={title:{m:[3.3,-.2,-9,3],e:[-70,6,-90,1.5]},briefing:{m:[5.4,1.6,-15,2.4],e:[-70,6,-90,1.5]},science:{m:[-6.2,-3.2,-12,3.2],e:[-70,6,-90,1.5]},
    planning:{m:[9,4,-70,1.1],e:[-6.5,-4.6,-12,4]},design:{m:[30,14,-160,1],e:[0,-13.5,-14,12]},review:{m:[30,14,-160,1],e:[1.5,-13.2,-14,12]},
    cruise:{m:[8,3.2,-90,1.1],e:[-10,-4.5,-80,1.2]},moi:{m:[5.2,-2,-10,4.2],e:[-60,20,-200,1]},ops:{m:[0,-14.3,-14,12.6],e:[-60,20,-200,1]},debrief:{m:[4.6,-1,-17,3],e:[-14,7,-120,1]}};
  Object.assign(POSE,{site:POSE.ops,m2brief:POSE.debrief,m2prep:POSE.design,rover:POSE.ops,outpost:POSE.ops,m2debrief:POSE.debrief});
  const LABS=['design','review','m2prep'];
  /* a spacecraft assembly hall: epoxy floor, wall displays, an overhead crane, workstations, parts on racks */
  function buildLab(){const g=new T3.Group(),S_=o=>new T3.MeshStandardMaterial(Object.assign({roughness:.6,metalness:.1,envMapIntensity:.4},o)),E=c=>new T3.MeshBasicMaterial({color:c});
    const B=(w,h,d,mt,x,y,z)=>{const o=new T3.Mesh(new T3.BoxGeometry(w,h,d),mt);o.position.set(x,y,z);g.add(o);return o;};
    const fc=cvs(512,512),fx=fc.getContext('2d');fx.fillStyle='#7f888c';fx.fillRect(0,0,512,512);fx.strokeStyle='rgba(255,255,255,.14)';fx.lineWidth=2;for(let i=0;i<=512;i+=64){fx.beginPath();fx.moveTo(i,0);fx.lineTo(i,512);fx.moveTo(0,i);fx.lineTo(512,i);fx.stroke();}
    fx.strokeStyle='#e0b020';fx.lineWidth=10;fx.strokeRect(150,150,212,212);const ft=new T3.CanvasTexture(fc);ft.wrapS=ft.wrapT=T3.RepeatWrapping;ft.repeat.set(5,4);ft.encoding=T3.sRGBEncoding;
    const fl=new T3.Mesh(new T3.PlaneGeometry(60,44),S_({map:ft,roughness:.28,metalness:.2,envMapIntensity:.9}));fl.rotation.x=-Math.PI/2;fl.position.set(0,-4,-16);g.add(fl);
    const wall=S_({color:0xcfd5d8}),steel=S_({color:0x6d747a,metalness:.6,roughness:.4}),yel=S_({color:0xe0a820,roughness:.5}),dark=S_({color:0x23272b}),gold=S_({color:0xd6a94a,metalness:.9,roughness:.35});
    B(60,16,.5,wall,0,4,-30);B(.5,16,44,wall,-22,4,-12);B(.5,16,44,wall,22,4,-12);B(60,.5,44,S_({color:0x9aa2a6}),0,11.5,-12);
    for(let i=-2;i<=2;i++)for(const z of[-8,-16,-24])B(5.5,.12,.9,E(0xf4f7ff),i*8,11.2,z);                     /* strip lights */
    B(46,.8,1,yel,0,9.2,-18);B(1.4,.9,1.6,yel,6,8.5,-18);B(.08,3.2,.08,steel,6,6.5,-18);B(.5,.3,.5,steel,6,4.8,-18);   /* bridge crane and hook */
    for(const x of[-21,21]){B(.6,13,.6,steel,x,2.5,-18);}
    const scr=(x,y,z,w,h,col,ry)=>{const o=B(w,h,.12,dark,x,y,z);o.rotation.y=ry||0;const s=new T3.Mesh(new T3.PlaneGeometry(w*.92,h*.86),E(col));s.position.set(0,0,.07);o.add(s);return o;};
    scr(-10,4.5,-29.6,9,4.6,0x16324a);scr(2,4.5,-29.6,9,4.6,0x10283c);scr(13,4.5,-29.6,7,4.6,0x3a2a12);                /* wall displays */
    for(let i=0;i<7;i++){B(.9,.06+i%3*.5,.02,E(0x4fb3d8),-13.4+i*1.1,3.2+(i%3)*.25,-29.5);}B(6,.05,.02,E(0xf2b84f),13,4.9,-29.5);B(4,.05,.02,E(0xf2b84f),12.2,4.1,-29.5);
    for(const [x,ry] of[[-15,.5],[-17.5,.9],[15,-.5],[17.5,-.9]]){const d=B(3.2,.14,1.5,S_({color:0xe6e8ea}),x,-2.3,-11);d.rotation.y=ry;B(.12,1.7,.12,steel,x-.9,-3.15,-11);B(.12,1.7,.12,steel,x+.9,-3.15,-11);scr(x,-1.5,-11.3,1.5,.95,0x1c5270,ry);}
    for(const x of[-9,9]){B(.2,5,.2,steel,x-2,-1.5,-24);B(.2,5,.2,steel,x+2,-1.5,-24);for(const y of[-3,-1.4,.2])B(4.4,.12,1.4,steel,x,y,-24);            /* parts racks */
      B(1,1,1,gold,x-1,-2.4,-24);B(.9,.7,.9,S_({color:0xe9e5dc}),x+.9,-2.55,-24);B(1.2,.9,1,gold,x+.6,-.9,-24);B(.8,.8,.8,dark,x-1.1,-.95,-24);
      const tk=new T3.Mesh(new T3.SphereGeometry(.55,20,14),gold);tk.position.set(x-.2,.8,-24);g.add(tk);}
    const sp=B(3.2,5,.08,S_({color:0x1b2a72,metalness:.6,roughness:.25}),-3.5,-1.4,-25);sp.rotation.set(-.12,.3,0);B(3.3,.1,.1,steel,-3.5,1.1,-25.2);
    const dish=new T3.Mesh(new T3.SphereGeometry(1.5,28,14,0,TAU,0,.75),S_({color:0xf2efe8,side:T3.DoubleSide,roughness:.4}));dish.position.set(3.4,-1.4,-25);dish.rotation.set(1.9,0,.2);g.add(dish);B(.12,2.6,.12,steel,3.4,-2.7,-25.4);
    const st=new T3.Mesh(new T3.CylinderGeometry(2.6,2.8,.35,36),steel);st.position.set(0,-3.8,-17);g.add(st);const st2=new T3.Mesh(new T3.CylinderGeometry(2.2,2.2,.1,36),yel);st2.position.set(0,-3.58,-17);g.add(st2);   /* integration stand */
    for(const a of[.5,2.1,3.7,5.3]){B(.1,3.4,.1,yel,Math.cos(a)*3.3,-2.3,-17+Math.sin(a)*3.3);}
    const l1=new T3.PointLight(0xf2f6ff,.9,60);l1.position.set(0,9,-12);g.add(l1);const l2=new T3.PointLight(0xfff0d8,.5,50);l2.position.set(-12,5,-20);g.add(l2);
    return g;}
  function backdrop(canvas){
    try{T3=T3||window.THREE;if(!T3||!canvas)return null;
      const r=new T3.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});r.setPixelRatio(1);r.setClearColor(0x050403);grade(r);
      const scene=new T3.Scene(),cam=new T3.PerspectiveCamera(40,1,.1,4000),sunPos=[-7,3,4];lights(scene,sunPos);
      const sg=new T3.BufferGeometry(),N=2200,sp=new Float32Array(N*3),rr=prng(21);
      for(let i=0;i<N;i++){const a=rr()*TAU,z=rr()*2-1,q=Math.sqrt(1-z*z);sp[i*3]=q*Math.cos(a)*1500;sp[i*3+1]=z*1500;sp[i*3+2]=q*Math.sin(a)*1500;}
      sg.setAttribute('position',new T3.BufferAttribute(sp,3));const stars=new T3.Points(sg,new T3.PointsMaterial({color:0xefe6d9,size:1.5,sizeAttenuation:false}));scene.add(stars);
      const mars=planet('mars'),earth=planet('earth');scene.add(mars,earth);
      for(const p of[mars,earth])p.userData.sun.set(...sunPos).normalize();
      let cur=null,tgt=POSE.title,last=0,slow=0,w=0,h=0,dead=false,lab=null,inLab=false;
      const put=(o,a)=>{o.position.set(a[0],a[1],a[2]);o.scale.setScalar(a[3]);};
      const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();dead=true;});
      function frame(now){if(dead)return;requestAnimationFrame(frame);
        if(document.hidden||document.querySelector('.cine:not(.out)'))return;
        if(now-last<(slow>6?110:32))return;const dt=Math.min(.2,(now-last)/1000||0);last=now;
        const cw=canvas.clientWidth,ch=canvas.clientHeight;if(!cw||!ch)return;
        if(cw!==w||ch!==h){w=cw;h=ch;r.setSize(w,h,false);cam.aspect=w/h;cam.fov=w<h?58:40;cam.updateProjectionMatrix();}
        if(!cur){cur={m:tgt.m.slice(),e:tgt.e.slice()};}
        const k=still()?1:1-Math.exp(-dt*1.4);for(const key of['m','e'])for(let i=0;i<4;i++)cur[key][i]+=(tgt[key][i]-cur[key][i])*k;
        put(mars,cur.m);put(earth,cur.e);
        if(!still()){mars.rotation.y+=dt*.012;earth.rotation.y+=dt*.016;earth.userData.clouds.rotation.y+=dt*.004;stars.rotation.y+=dt*.0015;}
        if(inLab&&!lab){lab=buildLab();scene.add(lab);}if(lab)lab.visible=inLab;mars.visible=earth.visible=stars.visible=!inLab;r.setClearColor(inLab?0x1a1d20:0x050403);
        const t0=performance.now();r.render(scene,cam);slow=performance.now()-t0>28?slow+1:Math.max(0,slow-1);}
      requestAnimationFrame(frame);
      return {stage:n=>{if(POSE[n])tgt=POSE[n];inLab=LABS.includes(n);}};
    }catch(e){console.warn('Backdrop unavailable:',e&&e.message);return null;}}

  const use=fn=>(...a)=>{T3=T3||window.THREE;return fn(...a);};
  return {view,snapshot,backdrop,craft:use(craft),rocket:use(rocket),rover:use(rover),planet:use(planet),instrument:use(instrument),sprite:use(sprite),envMap:use(envMap),grade:use(grade),lights:use(lights),marsCanvas:()=>marsMaps().col,ready:()=>!!window.THREE,get three(){return T3||(T3=window.THREE);},preload:()=>loadGLB(),get craftSource(){return ['none','loading','model file','built-in'][GLB.state]},get mode(){return ok===null?'not started':ok?'3d':'2d'}};
})();
