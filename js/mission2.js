"use strict";
/* Mission 2, The Red Frontier: a surface expedition in Jezero Crater.
   Stages: briefing -> rover preparation -> rover expedition (js/rover.js) -> outpost -> debrief.
   game.js calls installM2() once, just before it starts. Everything here uses the same state object (S),
   the same navigation (go) and the same helpers as Mission 1. */
function installM2(){
  const m2=()=>S.m2||(S.m2={site:'floor'});
  const TASK='Find rock that formed in water. Bring two samples home.';
  /* the rover configuration lives in S.m2.rover and is saved with the game on every change */
  const cfgOf=M=>{if(!M.rover)M.rover=RK.defaults();if(!Array.isArray(M.rover.inst))M.rover.inst=[];return M.rover;};
  const modelOpts=c=>Object.assign({},c,{backup:c.backup==='yes'});
  /* Mission 1 found the hazards at the 1 m scale only with the high-resolution camera. Without it the lander
     comes down off target among rocks it could not see. */
  const blindLanding=M=>M.fromM1&&!(M.survey||[]).includes('cam');
  /* a new rover mission: a fresh seed for the ten rock formations, kept until the mission is restarted */
  const seedOf=M=>{if(!M.seed)M.seed=(Math.random()*2**31)|0;return M.seed;};
  /* what Mission 1's survey gives this expedition (reconOf in game.js); only data that reached Earth counts */
  const reconM=M=>reconOf(M.fromM1?M.survey:null);

  VIEW.m2brief=()=>{const M=m2(),surveyed=M.fromM1;seedOf(M);
    main.innerHTML=head(1,'Mission briefing','ASEA Mission Control')+say('reyes',surveyed?`You chose ${LSITE[M.site][1]}. The crew is down and the rover is fueled. Go and see if you were right.`:'No orbital survey on file, so the crew landed blind. Pick a site and make it work.')+`
    <section class="panel task"><p class="kicker">Your task</p><h3>${TASK} ${Help.q('geology')}</h3>
      <div class="steps">${['Build the rover','Explore Jezero','Analyze and sample','Run the outpost'].map((t,i)=>`<div><b>${i+1}</b><span>${t}</span></div>`).join('')}</div></section>
    <section class="grid g3"><div class="panel stat"><p class="kicker">Landing site ${Help.q('landing')}</p><b class="num">${LSITE[M.site][1]}</b>${surveyed?'':`<div class="choices three">${Object.keys(LSITE).map(s=>`<button type="button" class="opt" data-ls="${s}" aria-pressed="${M.site===s}"><b>${LSITE[s][0]}</b></button>`).join('')}</div>`}</div>
      <div class="panel stat"><p class="kicker">Terrain ${Help.q('mobility')}</p><b class="num">${{delta:'Boulders under a layered scarp',floor:'Flat and open, long drives',rim:'Steep pale slopes'}[M.site]}</b></div>
      <div class="panel stat"><p class="kicker">Rock formations ${Help.q('geology')}</p><b class="num">${reconM(M).formsText}</b></div></section>
    <section class="panel"><p class="kicker">Orbital data from Mission 1 ${Help.q('recon')}</p><div class="tw"><table>
      ${[['High-resolution images','cam','Formations located to a few metres · hazards and terrain in detail'],['Context images','ctx','Formations located to about 60 m · terrain coarsely'],['Mineral spectra','spec','Likely rock type of each located formation'],['Altimeter','alt','Terrain relief'],['Sounding radar','radar','Buried delta layers']].map(r=>{const on=reconM(M).sv.includes(r[1]);return `<tr><th>${r[0]}</th><td>${on?`<span class="pill go">On file</span> ${r[2]}`:'<span class="dim">Not on file</span>'}</td></tr>`;}).join('')}
      <tr><th>Terrain</th><td>${reconM(M).terrainText}</td></tr></table></div>
      ${M.fromM1?'':'<p class="dim" style="font-size:.84rem">No Mission 1 survey on file. Fly Mission 1 and downlink Jezero data to land with a map.</p>'}</section>
    ${blindLanding(M)?`<section class="alertbar">LANDING HAZARDS UNKNOWN AT 1 M SCALE · No high-resolution images of the site were taken</section>`:''}
    <section class="panel"><p class="kicker">What the mission has to measure</p><div class="objm">${RK.OBJ.map(o=>`<div class="objrow"><div class="row between"><b>${o.q}</b><span class="pill ${o.main?'info':'off'}">${o.main?'Primary':'Extra science'}</span></div><p class="need">${o.need}</p></div>`).join('')}</div></section>
    ${navRow(false,'m2prep','Accept mission')}`;
    main.querySelectorAll('[data-ls]').forEach(b=>b.onclick=()=>{M.site=b.dataset.ls;saveGame();VIEW.m2brief();});
    bindNav(null,'m2prep');};

  /* ----- the Surface Systems Bay: build the rover ----- */
  const TABS=['mobility','power','inst','arm','comms','protect','look'],TABL={inst:'Instruments'};
  const PICK={wheel:'wheel',wsize:'wheel',susp:'susp',clear:'susp',dims:'body',chassis:'body',power:'power',battery:'power',arm:'arm',drill:'drill',store:'store',comms:'comms',dstore:'comms',backup:'backup',therm:'body',dust:'dust',shield:'shield',paint:'body',mark:'look',insig:'look'};
  VIEW.m2prep=()=>{const M=m2(),c=cfgOf(M);M.tab=M.tab||'mobility';M.cmp=M.cmp||[];const sv=M.survey||[];
    main.innerHTML=head(2,'Rover preparation','Surface Systems Bay','Build a rover for your landing site. Drag the model to turn it; click a part to open it.')+`
    <section class="panel rvbudget" id="rvBudget" aria-live="polite"></section>
    <section class="bay"><div class="panel baysee"><div class="row between"><p class="kicker">Rover · ${S.name}</p><div class="row"><button type="button" class="ghost sm" id="zOut" aria-label="Zoom out">−</button><button type="button" class="ghost sm" id="zIn" aria-label="Zoom in">+</button><button type="button" class="ghost sm" id="zRe">Reset view</button></div></div>
        <div class="cvwrap"><canvas id="rvsch"></canvas></div><p class="mono dim" id="rvPick" style="font-size:.6rem">Drag to turn · scroll or pinch to zoom · click a part</p><div id="rvSpec"></div></div>
      <div class="baycfg"><div class="tabs" role="tablist">${TABS.map(t=>`<button type="button" role="tab" class="tab" data-tab="${t}" aria-selected="${M.tab===t}">${TABL[t]||RK.CAT[t].label}</button>`).join('')}</div>
        <div class="panel" id="tabBody"></div>
        <div class="panel"><p class="kicker">Mission needs and what this rover carries</p><div class="objm" id="capList"></div></div>
        <div class="panel"><p class="kicker">Site report · ${LSITE[M.site][1]}</p><div class="tw"><table>${(sv.length?sv:['cam','spec','mcs','radar']).map(k=>`<tr><th>${LAYER[k]?LAYER[k][0]:k}</th><td>${sv.includes(k)?SURV[M.site][k]:'<span class="dim">no data</span>'}</td></tr>`).join('')}<tr><th>Drive to the scarp</th><td>${SURV[M.site].drive}</td></tr></table></div></div></div></section>
    ${navRow(true,'rover','Deploy the rover')}`;
    const view=view3('rvsch','rover',modelOpts(c),{w:4,h:3,spin:.18,yaw:.9,pitch:.32,zoom:true,pick:pk=>{const t=pk.tab==='chassis'?'mobility':pk.tab;if(TABS.includes(t)){M.tab=t;drawTab();}$('rvPick').textContent='Selected: '+pk.label;view&&view.highlight(pk.key);
      const el=main.querySelector(`[data-pk="${pk.key}"]`);if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});}});
    if(view){$('zIn').onclick=()=>view.zoomBy(1.2);$('zOut').onclick=()=>view.zoomBy(1/1.2);$('zRe').onclick=()=>{view.zoom=1;view.yaw=.9;view.pitch=.32;view.highlight(null);};}
    else{['zIn','zOut','zRe'].forEach(id=>$(id).hidden=true);const cc=cv('rvsch',420,250);cc.ctx.fillStyle='#a39686';cc.ctx.font='12px "Martian Mono",monospace';cc.ctx.fillText('3D view unavailable on this device',90,125);}
    /* worked formula: driving range on one battery charge, from the live configuration */
    const rangeFx=()=>({id:'range',title:'How far can one battery charge drive?',
      ask:'The battery is the rover’s fuel tank. Work out how far a full charge goes, then compare it with the drive at your landing site.',
      formula:'d = E ÷ e × 100',
      vars:[{k:'E',sym:'E',name:'Battery energy',unit:'Wh',meaning:'Energy stored in the battery you picked (watt-hours).',effect:'Range rises in proportion.'},
        {k:'e',sym:'e',name:'Driving energy',unit:'Wh per 100 m',dec:1,meaning:'Energy to drive 100 m on firm, level ground. Shown as “Drive energy” under the rover. Mass, wheels and suspension set it.',effect:'Range falls. Sand and slopes raise it.'}],
      out:{sym:'d',name:'Range on one charge',unit:'m'},
      tpl:['d =','E','÷','e','× 100'],
      get:()=>{const s=RK.spec(c);return {v:{E:Math.round(s.batWh),e:+s.drive.toFixed(1)},ctx:{run:s.run,sandE:s.sandE,drive:SURV[M.site]?SURV[M.site].drive:'?'}};},
      calc:v=>v.E/v.e*100,
      steps:v=>[`${f0(v.E)} ÷ ${v.e} = ${(v.E/v.e).toFixed(1)} stretches of 100 m`,`${(v.E/v.e).toFixed(1)} × 100 = ${f0(v.E/v.e*100)} m`],
      meaning:(r,v,x)=>`Driving and nothing else, a full charge covers about <b>${f0(r)} m</b> (${(r/1000).toFixed(1)} km) on firm, level ground. From your base to the layered scarp is ${x.drive} each way. Sand raises the energy per metre about ×${x.sandE.toFixed(1)} on this rover, climbing adds more, and the rover’s standing load of ${f0(x.run)} W (computer, heaters, radio) drains the battery even while parked. Sunlight recharges it during the day.`,
      hints:['E is the battery capacity on this tab. e is “Drive energy” in the numbers under the rover picture.','Divide E by e: that is how many 100 m stretches you can drive. Multiply by 100 for metres.'],
      ansWhy:(u,r,v)=>nearV(u,v.E/v.e,.03)?'That is the number of 100 m stretches. Multiply by 100 for metres.':nearV(u,v.E*v.e,.05)?'Divide the energy you have by the energy each 100 m costs; do not multiply.':''});
    const fmt=(v,d=0)=>v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
    /* the spec panel; with a proposed change it shows the difference next to each number */
    const spec=(alt)=>{const s=RK.spec(c),p=alt?RK.spec(alt):null,dl=(k,dec=0,unit='',better=1)=>{if(!p)return '';const d=p[k]-s[k];if(Math.abs(d)<Math.pow(10,-dec)/2)return '';const good=d*better>0;return ` <i class="dlt ${good?'up':'down'}">${d>0?'+':''}${fmt(d,dec)}${unit}</i>`;};
      const ck=RK.checks(p||s),bad=ck.filter(x=>!x.ok&&x.hard);const S2=p||s;
      $('rvSpec').innerHTML=`${p?'<p class="kicker" style="color:var(--amber)">Proposed change</p>':''}
        ${meter('Mass'+dl('mass',0,' kg',-1),S2.mass,S2.limit,'kg')}${meter('Cost'+dl('cost',1,'M',-1),S2.cost,S2.budget,'','',v=>'$'+v.toFixed(1)+'M')}
        <div class="readouts">
          <div><span>Daylight power ${Help.q('rpower')}</span><b class="num">${fmt(S2.genDay)} W${dl('genDay',0,' W')}</b></div>
          <div><span>Standing load</span><b class="num">${fmt(S2.run)} W${dl('run',0,' W',-1)}</b></div>
          <div><span>Battery</span><b class="num">${fmt(S2.batWh)} Wh${dl('batWh',0,' Wh')}</b></div>
          <div><span>Drive energy</span><b class="num">${fmt(S2.drive,1)} Wh/100 m${dl('drive',1,'',-1)}</b></div>
          <div><span>Top speed</span><b class="num">${fmt(S2.speedCm,1)} cm/s${dl('speedCm',1,'')}</b></div>
          <div><span>Speed in sand</span><b class="num">${fmt(S2.sandK*100)}%${dl('sandK',2,'')}</b></div>
          <div><span>Rock clearance</span><b class="num">${fmt(S2.clearM,2)} m${dl('clearM',2,' m')}</b></div>
          <div><span>Stability</span><b class="num">${fmt(S2.stab*100)}%${dl('stab',2,'')}</b></div>
          <div><span>Reliability</span><b class="num">${fmt(S2.rel*100,1)}%${dl('rel',3,'')}</b></div>
          <div><span>Data storage</span><b class="num">${fmt(S2.storeMB/1000,0)} GB</b></div></div>
        <div class="mounts">${Object.keys(S2.capM).map(m=>`<span class="pill ${S2.used[m]>S2.capM[m]?'nogo':S2.used[m]===S2.capM[m]?'warn':'info'}">${RK.MOUNT[m].label} ${S2.used[m]}/${S2.capM[m]}</span>`).join('')}</div>
        <details class="how"><summary>More numbers</summary><div class="readouts"><div><span>Heaters</span><b class="num">${fmt(S2.heat)} W</b></div><div><span>Solar at noon</span><b class="num">${fmt(S2.peak)} W</b></div><div><span>Generator</span><b class="num">${fmt(S2.rtg)} W</b></div>
          <div><span>Climbing factor</span><b class="num">×${fmt(S2.climb,2)}</b></div><div><span>Damage taken</span><b class="num">×${fmt(S2.tough,2)}</b></div><div><span>Turning</span><b class="num">×${fmt(S2.turn,2)}</b></div>
          <div><span>Direct-to-Earth</span><b class="num">${fmt(S2.dte,1)} MB/s</b></div><div><span>Relay passes</span><b class="num">${S2.relay?fmt(S2.relay)+' MB/s':'none'}</b></div></div></details>
        ${bad.length?`<div class="issues"><p class="kicker" style="color:var(--bad)">Cannot deploy · ${bad.length}</p><ul class="plain">${bad.map(x=>`<li><b>${x.n}</b> <span class="dim">${x.d}</span></li>`).join('')}</ul></div>`:''}
        ${ck.filter(x=>!x.ok&&!x.hard).map(x=>`<p class="dim" style="font-size:.82rem"><span class="pill warn">Caution</span> ${x.n}: ${x.d}</p>`).join('')}`;
      if(!alt){const nb=$('next');if(nb){nb.disabled=bad.length>0;const nt=main.querySelector('.nav .note');}}};
    const caps=()=>{const s=RK.spec(c);$('capList').innerHTML=RK.OBJ.map(o=>{const L=RK.capLines(s,o.id);return `<div class="objrow"><div class="row between"><b>${o.q}</b><span class="pill ${o.main?'info':'off'}">${o.main?'Primary':'Extra'}</span></div><p class="need">${o.need}</p><ul class="cov plain">${L.length?L.map(t=>`<li>${t}</li>`).join(''):'<li class="dim">Nothing fitted does this.</li>'}</ul></div>`;}).join('');};
    /* mass and budget at a glance: stacked bars by subsystem, from the same calculator (RK.spec) as everything else */
    const SUBS=[['body','Chassis and body','#7d7268'],['mobility','Wheels and suspension','#c98a5a'],['power','Power','#f2b84f'],['arm','Arm and sampling','#86c994'],['comms','Radio and data','#8fc8da'],['protect','Protection','#b49ad6'],['inst','Instruments','#ea6f3c']];
    const budget=()=>{const s=RK.spec(c),blk=(title,key,tot,lim,fv,help)=>{const over=tot>lim,scale=Math.max(tot,lim),left=lim-tot;
        return `<div class="bgt ${over?'over':''}"><div class="row between"><p class="kicker">${title} ${Help.q(help)}</p><b class="num">${fv(tot)} <span class="dim">of ${fv(lim)}</span></b></div>
          <div class="bgtbar" role="img" aria-label="${title}: ${fv(tot)} of ${fv(lim)}">${SUBS.map(([k,l,col])=>{const v=s.by[k][key];return v>0?`<i style="width:${v/scale*100}%;background:${col}" title="${l}: ${fv(v)}"></i>`:'';}).join('')}${over?'':`<i class="free" style="width:${left/scale*100}%"></i>`}<b class="lim" style="left:${lim/scale*100}%"></b></div>
          <div class="row between bgtsum"><span class="${over?'bad':left<lim*.08?'warn':'ok'}">${over?`Over by ${fv(-left)}`:`${fv(left)} left`}</span><span class="dim num">${Math.round(tot/lim*100)}% used</span></div></div>`;};
      $('rvBudget').innerHTML=`<div class="bgtwrap">${blk('Mass','mass',s.mass,s.limit,v=>`${f0(v)} kg`,'rmass')}${blk('Budget','cost',s.cost,s.budget,v=>`$${v.toFixed(1)}M`,'rbudget')}</div>
        <div class="bgtleg">${SUBS.map(([k,l,col])=>`<span><i style="background:${col}"></i>${l} <b class="num">${f0(s.by[k].mass)} kg · $${s.by[k].cost.toFixed(1)}M</b></span>`).join('')}</div>`;
      chrome();};
    const apply=()=>{CAMP.rover=c;saveCamp();saveGame();if(view)view.set(modelOpts(c));spec();caps();drawTab();budget();};
    function drawTab(){main.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===M.tab));const T=M.tab,el=$('tabBody');
      if(T==='inst'){const s=RK.spec(c);
        el.innerHTML=`<div class="row between"><p class="kicker">Instruments ${Help.q('rpayload')}</p><span class="dim" style="font-size:.84rem">${c.inst.length} fitted</span></div>`+
          Object.keys(RK.MOUNT).map(m=>`<div class="mgroup"><p class="kicker" style="color:var(--dim)">${RK.MOUNT[m].label} · ${s.used[m]}/${s.capM[m]} ${m==='arm'?'(the drill uses one)':''}</p><div class="icat">${RK.IKEYS.filter(k=>RK.INS[k].mount===m).map(k=>{const i=RK.INS[k],on=c.inst.includes(k),why=RK.blocked(c,k);
            return `<div class="icard ${on?'on':''} ${why?'blocked':''}" data-pk="${k}" data-hov="${k}"><div class="row between"><b>${i.n} ${Help.q('r:'+k)}</b><span class="mono dim">${i.tag}</span></div>
              <div class="ispec num"><span>${i.mass} kg</span><span>${i.run?i.run+' W on':i.use.wh?i.use.wh+' Wh/use':'—'}</span><span>${i.use.mb?i.use.mb+' MB/use':'—'}</span><span>$${i.cost}M</span>${i.units>1?`<span>${i.units} units</span>`:''}</div>
              <div class="row between"><button type="button" class="opt sm" data-ins="${k}" aria-pressed="${on}" ${why?'disabled':''}>${on?'Fitted · remove':why||'Fit'}</button><label class="cmpbox"><input type="checkbox" data-rcmp="${k}" ${M.cmp.includes(k)?'checked':''}> Compare</label></div></div>`;}).join('')}</div></div>`).join('')+`<div id="rcmpTray"></div>`;
        const C=M.cmp.filter(k=>RK.INS[k]);$('rcmpTray').innerHTML=C.length>=2?`<div class="cmptray"><div class="row between"><p class="kicker">Side by side</p><button type="button" class="ghost sm" id="rcmpX">Clear</button></div><div class="tw"><table class="cmpt"><tr><th></th>${C.map(k=>`<th>${RK.INS[k].n}</th>`).join('')}</tr>
          ${[['Mount',k=>RK.MOUNT[RK.INS[k].mount].label],['Mass',k=>RK.INS[k].mass+' kg'],['Power',k=>RK.INS[k].run?RK.INS[k].run+' W while on':RK.INS[k].use.wh+' Wh per use'],['Data',k=>RK.INS[k].use.mb?RK.INS[k].use.mb+' MB per use':'small'],['Cost',k=>'$'+RK.INS[k].cost+'M'],['Reliability',k=>Math.round(RK.INS[k].rel*100)+'%'],['Resolution',k=>RK.INS[k].res],['Measures',k=>RK.INS[k].g.meas],['Limits',k=>RK.INS[k].g.lim]].map(r=>`<tr><th>${r[0]}</th>${C.map(k=>`<td>${r[1](k)}</td>`).join('')}</tr>`).join('')}</table></div></div>`:C.length===1?'<p class="dim" style="font-size:.84rem">Tick one more to compare.</p>':'';
        el.querySelectorAll('[data-ins]').forEach(b=>b.onclick=()=>{const k=b.dataset.ins;c.inst=c.inst.includes(k)?c.inst.filter(x=>x!==k):c.inst.concat(k);SFX.toggle(c.inst.includes(k));if(view)view.highlight(k);apply();});
        el.querySelectorAll('[data-rcmp]').forEach(b=>b.onchange=()=>{const k=b.dataset.rcmp;M.cmp=M.cmp.filter(x=>x!==k);if(b.checked){M.cmp.push(k);if(M.cmp.length>3)M.cmp.shift();}drawTab();});
        if($('rcmpX'))$('rcmpX').onclick=()=>{M.cmp=[];drawTab();};
        el.querySelectorAll('[data-hov]').forEach(d=>{const k=d.dataset.hov;d.onmouseenter=()=>{if(view)view.highlight(k);const on=c.inst.includes(k);if(!RK.blocked(c,k))spec(Object.assign({},c,{inst:on?c.inst.filter(x=>x!==k):c.inst.concat(k)}));};d.onmouseleave=()=>spec();});}
      else{const cat=RK.CAT[T];
        el.innerHTML=`<div class="row between"><p class="kicker">${cat.label} ${Help.q(cat.help)}</p></div>`+Object.keys(cat.groups).map(g=>{const G=cat.groups[g],f=RK.fieldOf(T,g);
          return `<div class="cgroup" data-pk="${PICK[f]||''}"><p class="kicker" style="color:var(--dim)">${G.label}</p><div class="opts">${Object.keys(G.opts).map(v=>{const o=G.opts[v],on=String(c[f])===String(v);
            return `<button type="button" class="opt" data-f="${f}" data-v="${v}" aria-pressed="${on}"><b>${o.n}</b>${o.s?`<span class="s">${o.s}</span>`:''}<span class="s num">${o.mass?`${o.mass>0?'+':''}${Math.round(o.mass*(g==='wheel'?({s:.85,m:1,l:1.18}[c.wsize]):1))} kg`:''}${o.cost?` · $${o.cost}M`:''}</span></button>`;}).join('')}</div></div>`;}).join('');
        el.querySelectorAll('[data-f]').forEach(b=>{const f=b.dataset.f,v=b.dataset.v,val=f==='store'?+v:v;
          b.onclick=()=>{c[f]=val;SFX.toggle(true);if(view)view.highlight(PICK[f]);apply();};
          b.onmouseenter=()=>{if(view)view.highlight(PICK[f]);if(String(c[f])!==String(v))spec(Object.assign({},c,{[f]:val}));};b.onmouseleave=()=>spec();
          b.onfocus=b.onmouseenter;b.onblur=b.onmouseleave;});
        if(T==='power'){el.insertAdjacentHTML('beforeend',FX.card(rangeFx()));FX.bind(el);}}}
    main.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{M.tab=b.dataset.tab;drawTab();});
    spec();caps();drawTab();budget();
    bindNav('m2brief','rover');};

  VIEW.rover=()=>{const M=m2(),my=RUN,c=cfgOf(M),sp=RK.spec(c),bl=blindLanding(M);
    main.innerHTML=head(3,'Surface expedition','Jezero Crater, Mars')+`<section class="panel task slim"><p class="kicker">Task · ${TASK}</p></section><div id="rvhost"></div>`;
    const snap=Models.snapshot&&Models.snapshot('rover',modelOpts(c),{w:256,h:256,top:true});
    Rover.start({root:$('rvhost'),site:M.site,seed:seedOf(M),spec:sp,sol:1,sprite:snap,blind:bl,relayM1:!!M.fromM1,recon:reconM(M),resume:M.rv||null,
      save:st=>{M.rv=st;saveGame();}}).then(async res=>{if(my!==RUN)return;M.exp=res;M.rv=null;
      /* a catastrophic failure ends surface operations: the samples stay in the rover and the mission is over */
      if(res.broken){M.exp.returned=[];M.failed=true;saveGame();
        await ask({kicker:'Surface operations',cls:'alert',title:'Rover lost',body:`<p>${res.broken.why}</p><div class="readouts"><div><span>Time</span><b class="num">${res.broken.at} LMST</b></div><div><span>Condition</span><b class="num">${res.broken.cond}%</b></div><div><span>Distance from base</span><b class="num">${f0(Math.hypot(res.broken.x-(Rover.SITES[M.site]||Rover.SITES.delta).base[0],res.broken.y-(Rover.SITES[M.site]||Rover.SITES.delta).base[1]))} m</b></div><div><span>Samples aboard</span><b class="num">${res.samples.length}</b></div></div><p class="dim">The rover cannot be recovered. Without it the expedition ends here.</p>`,choices:[{label:'Go to the debrief'}]});
        if(my!==RUN)return;return go('m2debrief');}
      if(res.stranded){await tell('Rover lost','Stranded','<p>The battery ran out before base. The samples stay with the rover.</p>','Continue');M.exp.returned=[];}else M.exp.returned=res.samples;
      saveGame();go('outpost');});};

  /* ----- the outpost: five sols of power, water and oxygen ----- */
  const MOD={life:['LIFE SUP',35,'lifesupport',true],heat:['HEATERS',15,'',false],water:['WATER ISRU',25,'isru',false],o2:['O2 PLANT',20,'isru',false],lab:['LAB',20,'libs',false]};
  const DUST=[1,1,.42,.6,1],SOLAR=100;
  function outNew(M){const hyd=(M.exp&&M.exp.returned||[]).some(s=>s.kind!=='soil'&&['mud','sulf','carb'].includes(s.truth));
    return {sol:1,N:5,water:60,o2:60,bat:40,lab:0,crew:100,equip:100,feed:hyd?1.3:.75,hyd,sw:{life:true,heat:true,water:false,o2:false,lab:false},w0:60,o0:60,out:0,log:[]};}
  VIEW.outpost=()=>{const M=m2(),o=M.out||(M.out=outNew(M)),eff=DUST[o.sol-1]??1,supply=SOLAR*eff,draw=Object.keys(MOD).reduce((s,k)=>s+(o.sw[k]?MOD[k][1]:0),0),short=draw-supply,ok=short<=o.bat,todo=(M.exp&&M.exp.returned||[]).length-o.lab;
    main.innerHTML=head(4,'Outpost','Jezero Base')+`
    <section class="panel task slim"><div class="row between"><p class="kicker">Task · end sol ${o.N} with more water and oxygen than you started with ${Help.q('isru')}</p><span class="pill info">Sol ${Math.min(o.sol,o.N)} of ${o.N}</span></div></section>
    ${eff<1?`<section class="alertbar">POWER OUTPUT REDUCED · Solar array efficiency ${Math.round(eff*100)}% ${Help.q('dust')}</section>`:''}
    ${o.sol===2&&M.rover&&(M.rover.inst||[]).includes('env')?`<section class="alertbar">FORECAST FROM THE ROVER’S WEATHER STATION · Dust storm expected tomorrow, solar output near 42% ${Help.q('dust')}</section>`:''}
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
      if(o.sw.lab&&todo>0){const n=Math.min(2,todo);o.lab+=n;notes.push(`lab analyzed ${n} sample${n>1?'s':''}`);}
      if(!o.sw.heat){o.equip-=18;notes.push('equipment cold-soaked');}
      if(o.water<=0||o.o2<=0){o.crew-=40;notes.push('crew on emergency reserves');}
      if(eff<1)notes.push(`dust: solar at ${Math.round(eff*100)}%`);
      o.log.push(`Sol ${o.sol}: water ${w>=0?'+':''}${f0(w)}, oxygen ${ox>=0?'+':''}${f0(ox)}${notes.length?', '+notes.join(', '):''}.`);o.sol++;saveGame();
      if(o.sol===3)await ask({kicker:'Weather '+Help.q('dust'),cls:'alert',title:'Dust storm',body:'<div class="readouts"><div><span>Solar array efficiency</span><b class="num">42%</b></div><div><span>Forecast</span><b class="num">2 sols</b></div></div>',choices:[{label:'Acknowledge'}]});
      if(o.sol>o.N)return go('m2debrief');VIEW.outpost();};
  };

  function score2(){const M=m2(),e=M.exp||{samples:[],scans:[],main:[],opt:[],battery:0,cond:0,photos:0,found:0,dist:0,explored:0},o=M.out||outNew(M),ret=e.returned||[];
    const X=e.extras||{},rock=ret.filter(s=>s.kind!=='soil'),sci=clamp(rock.length*11*(1)+ret.filter(s=>s.kind==='soil').length*3-rock.filter(s=>s.kind==='powder').length*2+rock.filter(s=>s.right).length*6+new Set(rock.map(s=>s.truth)).size*5+e.scans.length*4+e.photos*2+o.lab*5+(X.gpr?6:0)+(X.wx?4:0)+(X.dose?4:0)+(X.lab?6:0)+(X.micro?Math.min(6,X.micro*2):0)+(X.atmo?1:0),0,100);
    const main_=e.main.length?e.main.filter(x=>x[1]).length/e.main.length*100:0,opt=e.opt.length?e.opt.filter(x=>x[1]).length/e.opt.length*100:0;
    const lost=!!e.broken,obj=main_*.8+opt*.2,res=e.stranded||lost?0:clamp(e.battery*1.6,0,60)+e.cond*.4,net=(o.water-o.w0)+(o.o2-o.o0);
    /* a lost rover ends the mission before the outpost runs, so the outpost earns nothing */
    const outp=lost?0:clamp(50+net*1.2,0,100)*(o.crew<100?.6:1)*(o.equip<100?.85:1),total=.4*sci+.25*obj+.15*res+.2*outp;
    const cls=lost?'Mission failed: rover lost':total>=85?'Outstanding expedition':total>=70?'Expedition success':total>=50?'Partial success':'Expedition fell short';
    return {sci,obj,res,outp,total,cls,lost,sustain:!lost&&o.water>=o.w0&&o.o2>=o.o0,water:ret.some(s=>CLSOK(s))};}
  const CLSOK=s=>s.kind!=='soil'&&['mud','sand','carb','sulf'].includes(s.truth)&&s.right;

  /* how the rover design showed up in the field: facts, not grades */
  function roverNote(M){const c=M.rover;if(!c)return '';const s=RK.spec(c),e=M.exp||{},L=[];
    if(!s.can.photo)L.push('No panoramic camera: outcrops were never photographed.');if(!s.can.chem&&!s.can.contact)L.push('No spectrometer: no rock chemistry was possible.');
    if(c.arm==='none')L.push('No arm: no samples could be taken.');else if(c.drill==='scoop')L.push('The soil scoop cannot cut bedrock, so samples were loose soil.');
    if(s.can.lab&&!(e.extras||{}).lab)L.push('The onboard lab flew but analyzed nothing.');if((c.inst||[]).includes('lab')&&c.drill!=='powder')L.push('The onboard lab needs rock powder; the drill fitted made cores.');
    if((c.inst||[]).includes('seis'))L.push('The seismometer recorded only rover noise: it needs to sit still for weeks.');if((c.inst||[]).includes('mag'))L.push('The magnetometer read mostly the rover’s own currents.');
    if((e.faults||[]).length)L.push(`${e.faults.length} fault${e.faults.length>1?'s':''} on the drive (rover reliability ${f1(s.rel*100)}%).`);
    return L.length?`<p class="kicker" style="margin-top:8px">Rover design in the field</p><ul class="plain">${L.map(t=>`<li>${t}</li>`).join('')}</ul>`:'';}
  VIEW.m2debrief=()=>{const M=m2(),e=M.exp||{samples:[],scans:[],main:[],opt:[],battery:0,cond:0,photos:0,found:0,dist:0,explored:0,log:[]},o=M.out||outNew(M),sc=score2(),ret=e.returned||[];
    if(S.race&&window.Race)Race.finish({score:Math.round(sc.total),cls:sc.cls,failed:sc.lost});
    if(!CAMP.m2||sc.total>=(CAMP.m2.score||0)){CAMP.m2={score:Math.round(sc.total),cls:sc.cls};saveCamp();}
    const obj=x=>`<div class="obj ${x[1]?'done':''}"><i></i><span>${x[0]}</span></div>`;
    main.innerHTML=head(5,'Debrief','ASEA Science Operations Center')+`
    <section class="panel"><div class="score"><div class="S num">${Math.round(sc.total)}</div><div class="grid" style="gap:8px"><h3>${sc.cls}</h3>
      ${sc.lost?`<div class="alertbar" style="border-color:var(--bad);color:var(--bad)">MISSION FAILED · ROVER LOST AT ${e.broken.at} LMST · ${e.broken.why}</div>`:''}
      <div class="row"><span class="pill ${sc.water?'go':'warn'}">${sc.water?'Water-formed rock returned and identified':'Task open: no identified water-formed sample'}</span><span class="pill ${sc.sustain?'go':'warn'}">${sc.lost?'Outpost never ran':sc.sustain?'Outpost sustains itself':'Outpost runs a deficit'}</span></div>
      <p class="num" style="font-size:.72rem">S = 0.40×${f0(sc.sci)} science + 0.25×${f0(sc.obj)} objectives + 0.15×${f0(sc.res)} rover + 0.20×${f0(sc.outp)} outpost</p></div></div></section>
    <section class="grid g2"><div class="panel"><p class="kicker">Expedition</p><div class="readouts">
        <div><span>Distance</span><b class="num">${f0(e.dist)} m</b></div><div><span>Area mapped</span><b class="num">${f0(e.explored*100)}%</b></div><div><span>Formations found</span><b class="num">${e.found}</b></div><div><span>Photographs</span><b class="num">${e.photos}</b></div>
        <div><span>Battery at dock</span><b class="num">${e.broken?'never docked':e.stranded?'0%':f0(e.battery)+'%'}</b></div><div><span>Rover condition</span><b class="num">${e.broken?`lost · was ${e.broken.cond}%`:f0(e.cond)+'%'}</b></div><div><span>Data sent home</span><b class="num">${f1((e.sent||0)/1000)} GB</b></div><div><span>Faults</span><b class="num">${(e.faults||[]).length}</b></div></div>
        ${roverNote(M)}
        <p class="kicker" style="margin-top:8px">Objectives</p>${e.main.map(obj).join('')}<p class="kicker" style="margin:6px 0 2px;color:var(--dim)">Optional</p>${e.opt.map(obj).join('')}</div>
      <div class="panel"><p class="kicker">Samples returned · ${ret.length}</p><div class="tw"><table>${ret.map(s=>`<tr><td class="num">${s.id}</td><td>${s.site}<div class="dim" style="font-size:.76rem">${s.time} · ${s.grid} · ${s.kind||'core'}${s.labText?' · onboard lab: '+s.labText:''}</div></td><td>${s.cls}<div style="font-size:.76rem;color:${s.right?'var(--good)':'var(--amber)'}">Lab: ${Rover.CLS[s.truth].label}</div></td></tr>`).join('')||'<tr><td class="dim">None.</td></tr>'}</table></div>
        <p class="kicker" style="margin-top:8px">Laser analyses · simulated values, weight %</p><div class="tw"><table>${e.scans.map(a=>`<tr><td>${a.name}</td><td class="num">${Object.keys(a.v).map(k=>`${k} ${f0(a.v[k])}`).join(' · ')}</td></tr>`).join('')||'<tr><td class="dim">None.</td></tr>'}</table></div>
        <p class="kicker" style="margin-top:8px">${sc.lost?'Outpost · not run (rover lost)':`Outpost after ${o.N} sols`}</p><div class="readouts"><div><span>Water</span><b class="num">${f0(o.water)}% (${o.water>=o.w0?'+':''}${f0(o.water-o.w0)})</b></div><div><span>Oxygen</span><b class="num">${f0(o.o2)}% (${o.o2>=o.o0?'+':''}${f0(o.o2-o.o0)})</b></div><div><span>Lab analyses</span><b class="num">${o.lab}</b></div></div></div></section>
    <section class="panel"><div class="two"><div class="sim"><p class="kicker" style="color:var(--rust)">In this game</p><p style="font-size:.9rem">The terrain, rock positions and chemistry values are simulated. Rock types and where they sit follow published descriptions of Jezero.</p></div>
      <div class="ref"><p class="kicker" style="color:var(--ice)">What NASA’s Perseverance found</p><p style="font-size:.9rem">The crater floor is igneous rock, some of it rich in olivine and later altered by water. The delta front is sedimentary sandstone and mudstone, with sulfate minerals. Rock near the rim is rich in carbonate. Its MOXIE experiment made about 122 g of oxygen from Martian air.</p></div></div></section>
    <div class="nav"><button class="ghost" id="again">Main menu</button><button class="btn" id="redo">Fly it again</button></div>`;
    $('again').onclick=()=>{S=fresh();go('title');};
    $('redo').onclick=()=>{const nm=S.name,gd=S.guided,site=M.site,fm=M.fromM1,sv=M.survey;const rv=M.rover;S=fresh();S.mission=2;S.name=nm;S.guided=gd;S.m2={site,fromM1:fm,survey:sv,rover:rv};go('m2brief');};
  };
  window.__m2={score2};
}
