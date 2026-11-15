"use strict";
/* Mission 2, The Red Frontier: a surface expedition in Jezero Crater.
   Stages: briefing -> rover preparation -> rover expedition (js/rover.js) -> outpost -> debrief.
   game.js calls installM2() once, just before it starts. Everything here uses the same state object (S),
   the same navigation (go) and the same helpers as Mission 1. */
function installM2(){
  const ROVER_LIMIT=960,PARTS={battery:{std:['Standard battery',0,'Lighter, a little faster'],large:['Extended battery',70,'+40% range']},wheels:{std:['Standard wheels',0,'Best on firm ground'],wide:['Wide wheels',50,'Less sinking in sand']}};
  const m2=()=>S.m2||(S.m2={site:'floor'});
  const roverMass=()=>880+PARTS.battery[m2().battery||'std'][1]+PARTS.wheels[m2().wheels||'std'][1];
  const TASK='Find rock that formed in water. Bring two samples home.';

  VIEW.m2brief=()=>{const M=m2(),surveyed=M.fromM1;
    main.innerHTML=head(1,'Mission briefing','ASEA Mission Control')+say('reyes',surveyed?`You chose ${LSITE[M.site][1]}. The crew is down and the rover is fuelled. Go and see if you were right.`:'No orbital survey on file, so the crew landed blind. Pick a site and make it work.')+`
    <section class="panel task"><p class="kicker">Your task</p><h3>${TASK} ${Help.q('geology')}</h3>
      <div class="steps">${['Outfit the rover','Explore Jezero','Analyse and sample','Run the outpost'].map((t,i)=>`<div><b>${i+1}</b><span>${t}</span></div>`).join('')}</div></section>
    <section class="grid g3"><div class="panel stat"><p class="kicker">Landing site ${Help.q('landing')}</p><b class="num">${LSITE[M.site][1]}</b>${surveyed?'':`<div class="choices three">${Object.keys(LSITE).map(s=>`<button class="opt" data-ls="${s}" aria-pressed="${M.site===s}"><b>${LSITE[s][0]}</b></button>`).join('')}</div>`}</div>
      <div class="panel stat"><p class="kicker">Sample tubes ${Help.q('sample')}</p><b class="num">6</b></div><div class="panel stat"><p class="kicker">Surface crew ${Help.q('lifesupport')}</p><b class="num">3</b></div></section>
    ${navRow(false,'m2prep','Accept mission')}`;
    main.querySelectorAll('[data-ls]').forEach(b=>b.onclick=()=>{M.site=b.dataset.ls;VIEW.m2brief();});
    bindNav(null,'m2prep');};

  VIEW.m2prep=()=>{const M=m2();M.battery=M.battery||'std';M.wheels=M.wheels||'std';const mass=roverMass(),over=mass>ROVER_LIMIT,sv=M.survey||[];
    main.innerHTML=head(2,'Rover preparation','Surface Systems Bay','One upgrade fits. Choose it.')+`
    <section class="split"><div class="panel"><div class="cvwrap"><canvas id="rvsch"></canvas></div>
      ${meter('Rover mass',mass,ROVER_LIMIT,'kg')}</div>
    <div class="grid">${Object.keys(PARTS).map(k=>`<div class="panel"><p class="kicker">${k==='battery'?'Battery '+Help.q('rbattery'):'Wheels'}</p><div class="choices two">${Object.keys(PARTS[k]).map(v=>`<button class="opt" data-part="${k}" data-v="${v}" aria-pressed="${M[k]===v}"><b>${PARTS[k][v][0]}</b><span class="s">${PARTS[k][v][1]?'+'+PARTS[k][v][1]+' kg · ':''}${PARTS[k][v][2]}</span></button>`).join('')}</div></div>`).join('')}
      <div class="panel"><p class="kicker">Site report · ${LSITE[M.site][1]}</p><div class="tw"><table>${IK.map(k=>`<tr><th>${LAYER[k][0]}</th><td>${sv.includes(k)?SURV[M.site][k]:'<span class="dim">no data</span>'}</td></tr>`).join('')}<tr><th>Drive to the scarp</th><td>${SURV[M.site].drive}</td></tr></table></div></div></div></section>
    ${navRow(true,'rover','Deploy the rover',over,over?'Over the lander limit':'')}`;
    const c=cv('rvsch',420,250),x=c.ctx,wide=M.wheels==='wide',big=M.battery==='large';x.fillStyle='#120d0b';x.fillRect(0,0,420,250);x.strokeStyle='rgba(143,200,218,.12)';for(let i=0;i<420;i+=20){x.beginPath();x.moveTo(i,0);x.lineTo(i,250);x.stroke();}for(let j=0;j<250;j+=20){x.beginPath();x.moveTo(0,j);x.lineTo(420,j);x.stroke();}
    x.save();x.translate(200,125);x.fillStyle='#1c1a19';for(const wx of[-90,0,90])for(const wy of[-78,78]){x.fillRect(wx-26,wy-(wide?17:11),52,wide?34:22);}
    x.strokeStyle='#8d8a84';x.lineWidth=5;x.beginPath();x.moveTo(-90,-64);x.lineTo(90,-64);x.moveTo(-90,64);x.lineTo(90,64);x.stroke();
    x.fillStyle='#e9e5dc';x.fillRect(-78,-52,156,104);x.strokeStyle='#6b6964';x.lineWidth=2;x.strokeRect(-78,-52,156,104);x.fillStyle='#22345f';x.fillRect(-58,-38,74,76);
    x.fillStyle='#4a4744';x.fillRect(-126,-28,48,56);x.fillStyle='#d9a441';x.fillRect(-120,-22,10,44);if(big){x.fillStyle='#3a3836';x.fillRect(-126,-56,48,24);x.fillRect(-126,32,48,24);x.fillStyle='#86c994';x.fillRect(-120,-50,8,12);x.fillRect(-120,38,8,12);}
    x.strokeStyle='#cfcbc3';x.lineWidth=6;x.beginPath();x.moveTo(40,0);x.lineTo(108,0);x.stroke();x.fillStyle='#f4f1ea';x.fillRect(98,-26,34,52);x.fillStyle='#10141c';x.fillRect(124,-18,10,12);x.fillRect(124,6,10,12);x.restore();
    x.fillStyle='#a39686';x.font='10px "Martian Mono",monospace';x.fillText('FRONT · camera mast',300,30);x.fillText('REAR · power unit',16,30);
    main.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>{M[b.dataset.part]=b.dataset.v;VIEW.m2prep();});
    bindNav('m2brief','rover');};

  VIEW.rover=()=>{const M=m2(),my=RUN;
    main.innerHTML=head(3,'Surface expedition','Jezero Crater, Mars')+`<section class="panel task slim"><p class="kicker">Task · ${TASK}</p></section><div id="rvhost"></div>`;
    Rover.start({root:$('rvhost'),site:M.site,loadout:{battery:M.battery,wheels:M.wheels},sol:1}).then(async res=>{if(my!==RUN)return;M.exp=res;
      if(res.stranded){await tell('Rover lost','Stranded','<p>The battery ran out before base. The samples stay with the rover.</p>','Continue');M.exp.returned=[];}else M.exp.returned=res.samples;
      saveGame();go('outpost');});};

  /* ----- the outpost: five sols of power, water and oxygen ----- */
  const MOD={life:['LIFE SUP',35,'lifesupport',true],heat:['HEATERS',15,'',false],water:['WATER ISRU',25,'isru',false],o2:['O2 PLANT',20,'isru',false],lab:['LAB',20,'libs',false]};
  const DUST=[1,1,.42,.6,1],SOLAR=100;
  function outNew(M){const hyd=(M.exp&&M.exp.returned||[]).some(s=>['mud','sulf','carb'].includes(s.truth));
    return {sol:1,N:5,water:60,o2:60,bat:40,lab:0,crew:100,equip:100,feed:hyd?1.3:.75,hyd,sw:{life:true,heat:true,water:false,o2:false,lab:false},w0:60,o0:60,out:0,log:[]};}
  VIEW.outpost=()=>{const M=m2(),o=M.out||(M.out=outNew(M)),eff=DUST[o.sol-1]??1,supply=SOLAR*eff,draw=Object.keys(MOD).reduce((s,k)=>s+(o.sw[k]?MOD[k][1]:0),0),short=draw-supply,ok=short<=o.bat,todo=(M.exp&&M.exp.returned||[]).length-o.lab;
    main.innerHTML=head(4,'Outpost','Jezero Base')+`
    <section class="panel task slim"><div class="row between"><p class="kicker">Task · end sol ${o.N} with more water and oxygen than you started with ${Help.q('isru')}</p><span class="pill info">Sol ${Math.min(o.sol,o.N)} of ${o.N}</span></div></section>
    ${eff<1?`<section class="alertbar">POWER OUTPUT REDUCED · Solar array efficiency ${Math.round(eff*100)}% ${Help.q('dust')}</section>`:''}
    <section class="split"><div class="grid"><div class="panel"><div class="cvwrap"><canvas id="opc"></canvas></div></div>
      <div class="panel"><p class="kicker">Log</p><div class="log">${o.log.slice().reverse().map(l=>`<div><b>›</b> ${l}</div>`).join('')||'<div>Sol 1. Outpost systems online.</div>'}</div></div></div>
    <div class="panel sticky"><p class="kicker">Power distribution</p>
      <div class="cpanel inst">${Object.keys(MOD).map(k=>`<button class="tsw ${o.sw[k]?'on':''}" data-m="${k}" aria-pressed="${o.sw[k]}" ${MOD[k][3]?'disabled':''}><span class="tled"></span><span class="tlab">${MOD[k][0]}</span><span class="tslot"><i></i></span><span class="tval num">${MOD[k][1]} kW</span><span class="trng">${MOD[k][3]?'locked on':k==='lab'?todo+' to do':''}</span></button>`).join('')}</div>
      ${meter('Power draw '+Help.q('power'),draw,supply,'kW')}${meter('Battery',o.bat,60,'kWh',o.bat<15?'over':'ok')}
      ${meter('Water '+Help.q('water'),o.water,100,'%',o.water<25?'over':o.water<o.w0?'warn':'ok')}${meter('Oxygen',o.o2,100,'%',o.o2<25?'over':o.o2<o.o0?'warn':'ok')}
      <div class="row between"><span class="pill ${ok?(short>0?'warn':'go'):'nogo'}">${ok?(short>0?`Battery −${f0(short)}`:'Ready'):'Not enough power'}</span><span class="dim num" style="font-size:.7rem">Feedstock ×${o.feed}</span></div>
      <button class="btn" id="runSol" ${ok?'':'disabled'}>Run sol ${o.sol}</button></div></section>`;
    /* base schematic */
    const c=cv('opc',520,300),x=c.ctx;x.fillStyle='#8a5536';x.fillRect(0,0,520,300);const r=rng(9);for(let i=0;i<700;i++){x.fillStyle=`rgba(${50+r()*70|0},${28+r()*30|0},${16+r()*20|0},.3)`;x.fillRect(r()*520,r()*300,3,2);}
    const mod=(k,px,py,w,h,label,draw)=>{const on=o.sw[k];x.fillStyle='rgba(20,10,6,.4)';x.fillRect(px+6,py+6,w,h);x.fillStyle=on?'#e9e5dc':'#8f8a82';x.fillRect(px,py,w,h);x.strokeStyle=on?'#86c994':'#5d5a55';x.lineWidth=2;x.strokeRect(px,py,w,h);if(draw)draw(on);
      x.fillStyle=on?'#86c994':'#ef5d52';x.beginPath();x.arc(px+w-8,py+8,4,0,7);x.fill();x.fillStyle='#16171b';x.font='9px "Martian Mono",monospace';x.fillText(label,px+6,py+h-6);};
    x.strokeStyle='#5d5a55';x.lineWidth=3;x.beginPath();x.moveTo(250,150);x.lineTo(120,80);x.moveTo(250,150);x.lineTo(120,220);x.moveTo(250,150);x.lineTo(390,80);x.moveTo(250,150);x.lineTo(390,220);x.stroke();
    x.fillStyle='rgba(20,10,6,.4)';x.beginPath();x.arc(256,156,52,0,7);x.fill();const g=x.createRadialGradient(236,132,6,250,150,52);g.addColorStop(0,'#f6f3ec');g.addColorStop(1,'#a5a199');x.fillStyle=g;x.beginPath();x.arc(250,150,52,0,7);x.fill();x.fillStyle='#16171b';x.font='9px "Martian Mono",monospace';x.fillText('HABITAT',226,154);
    mod('heat',220,196,60,22,'HEAT');mod('water',70,52,100,56,'WATER ISRU',on=>{x.fillStyle='#8fc8da';x.fillRect(80,62,24,24);x.fillStyle='#6b6964';x.fillRect(112,60,46,8);});
    mod('o2',70,192,100,56,'O2 PLANT',on=>{x.fillStyle='#d9a441';x.beginPath();x.arc(100,214,12,0,7);x.fill();x.beginPath();x.arc(130,214,12,0,7);x.fill();});
    mod('lab',350,192,100,56,'LAB',on=>{x.fillStyle='#22345f';x.fillRect(360,202,40,20);});
    for(let i=0;i<5;i++){x.fillStyle=eff<1?'#33405f':'#1b2a72';x.fillRect(340+i*26,44,22,58);x.strokeStyle='#8fa6d8';x.lineWidth=.8;x.strokeRect(340+i*26,44,22,58);}x.fillStyle='#efe6d9';x.fillText('SOLAR FIELD',340,116);
    if(eff<1){x.fillStyle=`rgba(190,130,80,${.55*(1-eff)+.15})`;x.fillRect(0,0,520,300);}
    x.fillStyle='rgba(239,230,217,.6)';x.fillText('JEZERO BASE · SCHEMATIC',10,16);
    main.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{o.sw[b.dataset.m]=!o.sw[b.dataset.m];VIEW.outpost();});
    $('runSol').onclick=async()=>{const notes=[];o.bat=clamp(o.bat-short,0,60);
      let w=-10,ox=-9;if(o.sw.water)w+=14*o.feed;if(o.sw.o2)ox+=12;o.water=clamp(o.water+w,0,100);o.o2=clamp(o.o2+ox,0,100);
      if(o.sw.lab&&todo>0){const n=Math.min(2,todo);o.lab+=n;notes.push(`lab analysed ${n} sample${n>1?'s':''}`);}
      if(!o.sw.heat){o.equip-=18;notes.push('equipment cold-soaked');}
      if(o.water<=0||o.o2<=0){o.crew-=40;notes.push('crew on emergency reserves');}
      if(eff<1)notes.push(`dust: solar at ${Math.round(eff*100)}%`);
      o.log.push(`Sol ${o.sol}: water ${w>=0?'+':''}${f0(w)}, oxygen ${ox>=0?'+':''}${f0(ox)}${notes.length?', '+notes.join(', '):''}.`);o.sol++;saveGame();
      if(o.sol===3)await ask({kicker:'Weather '+Help.q('dust'),cls:'alert',title:'Dust storm',body:'<div class="readouts"><div><span>Solar array efficiency</span><b class="num">42%</b></div><div><span>Forecast</span><b class="num">2 sols</b></div></div>',choices:[{label:'Acknowledge'}]});
      if(o.sol>o.N)return go('m2debrief');VIEW.outpost();};
  };

  function score2(){const M=m2(),e=M.exp||{samples:[],scans:[],main:[],opt:[],battery:0,cond:0,photos:0,found:0,dist:0,explored:0},o=M.out||outNew(M),ret=e.returned||[];
    const sci=clamp(ret.length*11+ret.filter(s=>s.right).length*6+new Set(ret.map(s=>s.truth)).size*5+e.scans.length*4+e.photos*2+o.lab*5,0,100);
    const main_=e.main.length?e.main.filter(x=>x[1]).length/e.main.length*100:0,opt=e.opt.length?e.opt.filter(x=>x[1]).length/e.opt.length*100:0;
    const obj=main_*.8+opt*.2,res=e.stranded?0:clamp(e.battery*1.6,0,60)+e.cond*.4,net=(o.water-o.w0)+(o.o2-o.o0);
    const outp=clamp(50+net*1.2,0,100)*(o.crew<100?.6:1)*(o.equip<100?.85:1),total=.4*sci+.25*obj+.15*res+.2*outp;
    const cls=total>=85?'Outstanding expedition':total>=70?'Expedition success':total>=50?'Partial success':'Expedition fell short';
    return {sci,obj,res,outp,total,cls,sustain:o.water>=o.w0&&o.o2>=o.o0,water:ret.some(s=>CLSOK(s))};}
  const CLSOK=s=>['mud','sand','carb','sulf'].includes(s.truth)&&s.right;

  VIEW.m2debrief=()=>{const M=m2(),e=M.exp||{samples:[],scans:[],main:[],opt:[],battery:0,cond:0,photos:0,found:0,dist:0,explored:0,log:[]},o=M.out||outNew(M),sc=score2(),ret=e.returned||[];
    if(!CAMP.m2||sc.total>=(CAMP.m2.score||0)){CAMP.m2={score:Math.round(sc.total),cls:sc.cls};saveCamp();}
    const obj=x=>`<div class="obj ${x[1]?'done':''}"><i></i><span>${x[0]}</span></div>`;
    main.innerHTML=head(5,'Debrief','ASEA Science Operations Center')+`
    <section class="panel"><div class="score"><div class="S num">${Math.round(sc.total)}</div><div class="grid" style="gap:8px"><h3>${sc.cls}</h3>
      <div class="row"><span class="pill ${sc.water?'go':'warn'}">${sc.water?'Water-formed rock returned and identified':'Task open: no identified water-formed sample'}</span><span class="pill ${sc.sustain?'go':'warn'}">${sc.sustain?'Outpost sustains itself':'Outpost runs a deficit'}</span></div>
      <p class="num" style="font-size:.72rem">S = 0.40×${f0(sc.sci)} science + 0.25×${f0(sc.obj)} objectives + 0.15×${f0(sc.res)} rover + 0.20×${f0(sc.outp)} outpost</p></div></div></section>
    <section class="grid g2"><div class="panel"><p class="kicker">Expedition</p><div class="readouts">
        <div><span>Distance</span><b class="num">${f0(e.dist)} m</b></div><div><span>Area mapped</span><b class="num">${f0(e.explored*100)}%</b></div><div><span>Formations found</span><b class="num">${e.found}</b></div><div><span>Photographs</span><b class="num">${e.photos}</b></div>
        <div><span>Battery at dock</span><b class="num">${e.stranded?'0':f0(e.battery)}%</b></div><div><span>Rover condition</span><b class="num">${f0(e.cond)}%</b></div></div>
        <p class="kicker" style="margin-top:8px">Objectives</p>${e.main.map(obj).join('')}<p class="kicker" style="margin:6px 0 2px;color:var(--dim)">Optional</p>${e.opt.map(obj).join('')}</div>
      <div class="panel"><p class="kicker">Samples returned · ${ret.length}</p><div class="tw"><table>${ret.map(s=>`<tr><td class="num">${s.id}</td><td>${s.site}<div class="dim" style="font-size:.76rem">${s.time} · ${s.grid}</div></td><td>${s.cls}<div style="font-size:.76rem;color:${s.right?'var(--good)':'var(--amber)'}">Lab: ${Rover.CLS[s.truth].label}</div></td></tr>`).join('')||'<tr><td class="dim">None.</td></tr>'}</table></div>
        <p class="kicker" style="margin-top:8px">Laser analyses · simulated values, weight %</p><div class="tw"><table>${e.scans.map(a=>`<tr><td>${a.name}</td><td class="num">${Object.keys(a.v).map(k=>`${k} ${f0(a.v[k])}`).join(' · ')}</td></tr>`).join('')||'<tr><td class="dim">None.</td></tr>'}</table></div>
        <p class="kicker" style="margin-top:8px">Outpost after ${o.N} sols</p><div class="readouts"><div><span>Water</span><b class="num">${f0(o.water)}% (${o.water>=o.w0?'+':''}${f0(o.water-o.w0)})</b></div><div><span>Oxygen</span><b class="num">${f0(o.o2)}% (${o.o2>=o.o0?'+':''}${f0(o.o2-o.o0)})</b></div><div><span>Lab analyses</span><b class="num">${o.lab}</b></div></div></div></section>
    <section class="panel"><div class="two"><div class="sim"><p class="kicker" style="color:var(--rust)">In this game</p><p style="font-size:.9rem">The terrain, rock positions and chemistry values are simulated. Rock types and where they sit follow published descriptions of Jezero.</p></div>
      <div class="ref"><p class="kicker" style="color:var(--ice)">What NASA’s Perseverance found</p><p style="font-size:.9rem">The crater floor is igneous rock, some of it rich in olivine and later altered by water. The delta front is sedimentary sandstone and mudstone, with sulfate minerals. Rock near the rim is rich in carbonate. Its MOXIE experiment made about 122 g of oxygen from Martian air.</p></div></div></section>
    <div class="nav"><button class="ghost" id="again">Main menu</button><button class="btn" id="redo">Fly it again</button></div>`;
    $('again').onclick=()=>{S=fresh();go('title');};
    $('redo').onclick=()=>{const nm=S.name,gd=S.guided,site=M.site,fm=M.fromM1,sv=M.survey;S=fresh();S.mission=2;S.name=nm;S.guided=gd;S.m2={site,fromM1:fm,survey:sv};go('m2brief');};
  };
  window.__m2={score2};
}
