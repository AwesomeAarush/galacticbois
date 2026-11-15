"use strict";
/* ============ constants and physics ============ */
const AU=1.495978707e8, MU=1.32712440018e11, G0=9.80665, RM=1.5237;
const VE=Math.sqrt(MU/AU), VM=Math.sqrt(MU/(RM*AU)), NE=0.9856474, NM=0.5240208;
const MU_M=42828.4, R_MARS=3389.5, C_KMS=299792.458;
const BASE=Date.UTC(2028,5,1), DAY=864e5;
const MASS_CAP=1200, BUDGET=180;
const rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
const wrap=a=>((a+180)%360+360)%360-180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const jd=d=>(BASE+d*DAY-Date.UTC(2000,0,1,12))/DAY;
const Le=d=>100.464+NE*jd(d), Lm=d=>355.453+NM*jd(d);
const dateStr=d=>new Date(BASE+d*DAY).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const f0=x=>Math.round(x).toLocaleString('en-US'), f1=x=>x.toFixed(1), f2=x=>x.toFixed(2);

function transfer(Q){
  const a=(1+Q)/2,e=(Q-1)/(Q+1),p=a*(1-e*e);
  const nu=Math.acos(clamp((p/RM-1)/e,-1,1));
  const E=2*Math.atan(Math.sqrt((1-e)/(1+e))*Math.tan(nu/2));
  const P=365.25636*Math.pow(a,1.5), T=(E-e*Math.sin(E))/(2*Math.PI)*P;
  const h=Math.sqrt(MU*p*AU), vt=h/(RM*AU), v2=MU*(2/(RM*AU)-1/(a*AU)), vr=Math.sqrt(Math.max(0,v2-vt*vt));
  return {a,e,p,nu,T,P,vinf:Math.hypot(vt-VM,vr),vinfDep:Math.sqrt(MU*(2/AU-1/(a*AU)))-VE};
}
function posAt(tr,t){
  const M=2*Math.PI*t/tr.P; let E=M;
  for(let i=0;i<8;i++)E-=(E-tr.e*Math.sin(E)-M)/(1-tr.e*Math.cos(E));
  const nu=2*Math.atan2(Math.sqrt(1+tr.e)*Math.sin(E/2),Math.sqrt(1-tr.e)*Math.cos(E/2));
  const r=tr.a*(1-tr.e*Math.cos(E));
  return {nu,r,v:Math.sqrt(MU*(2/(r*AU)-1/(tr.a*AU)))};
}

/* ============ game data ============ */
const INST={
  cam:{name:'High-resolution camera',tag:'HiRISE-type',mass:65,cost:28,power:60,data:8,rel:.96,out:'Surface images',
    desc:'A telescope pointed down. Captures terrain, layered rock, craters and channels in fine detail.',teach:'Image resolution, planetary geology, remote sensing'},
  spec:{name:'Imaging spectrometer',tag:'CRISM-type',mass:33,cost:22,power:45,data:6,rel:.94,out:'Mineral spectra',
    desc:'Splits reflected sunlight into hundreds of colours. Each mineral absorbs its own set of wavelengths.',teach:'Electromagnetic spectrum, absorption spectra, mineral identification'},
  mcs:{name:'Atmospheric profiler',tag:'MCS-type',mass:9,cost:10,power:11,data:1,rel:.98,out:'Temperature, dust and water-vapour profiles',
    desc:'Looks sideways through the atmosphere at the horizon and measures it layer by layer.',teach:'Atmospheric pressure, temperature profiles, planetary climate'},
  radar:{name:'Shallow subsurface radar',tag:'SHARAD-type',mass:15,cost:14,power:20,data:3,rel:.95,out:'Subsurface reflections',
    desc:'Sends radio pulses into the ground. Echoes from buried layers reveal ice and rock boundaries.',teach:'Radar reflection, wave propagation, subsurface exploration'}
};
const IK=Object.keys(INST);
const SYS={
  structure:{label:'Structure',why:'Carries every other part. Lighter frames save mass but shake loose more easily.',tiers:[
    {n:'Lightweight composite',mass:150,cost:16,rel:.95,bolt:1.6,s:'bolt risk ×1.6'},
    {n:'Aluminium honeycomb',mass:220,cost:10,rel:.97,bolt:1,s:'baseline'},
    {n:'Reinforced frame',mass:300,cost:10,rel:.99,bolt:.5,s:'bolt risk ×0.5'}]},
  power:{label:'Solar arrays',why:'Sunlight at Mars is 43% as strong as at Earth, so arrays deliver far less there.',tiers:[
    {n:'Compact arrays',mass:60,cost:9,w:650},{n:'Standard arrays',mass:100,cost:16,w:1000},{n:'Large arrays',mass:150,cost:25,w:1500}]},
  battery:{label:'Battery',why:'Keeps the spacecraft alive in Mars’s shadow and covers short bursts above array output.',tiers:[
    {n:'Small pack',mass:30,cost:4,wh:200},{n:'Medium pack',mass:50,cost:8,wh:700},{n:'Large pack',mass:80,cost:13,wh:1300}]},
  comms:{label:'Communications',why:'A bigger dish focuses the signal, so more data reaches Earth on each pass.',tiers:[
    {n:'1 m dish',mass:25,cost:6,power:20,down:6},{n:'2 m high-gain dish',mass:45,cost:12,power:40,down:14},{n:'3 m high-gain dish',mass:80,cost:20,power:70,down:30}]},
  engine:{label:'Propulsion',why:'Higher specific impulse (Isp) gets more velocity change from each kilogram of propellant.',tiers:[
    {n:'Monopropellant',mass:50,cost:8,isp:230,rel:.99,s:'Isp 230 s, simple'},{n:'Bipropellant',mass:80,cost:17,isp:320,rel:.97,s:'Isp 320 s, complex'},{n:'High-energy bipropellant',mass:95,cost:27,isp:345,rel:.96,s:'Isp 345 s, for big burns'}]},
  computer:{label:'Computing and data',why:'More autonomy means the spacecraft can protect itself while Earth is minutes away.',tiers:[
    {n:'Basic computer',mass:10,cost:5,power:10,store:16,auto:0,rel:.95},{n:'Standard computer',mass:18,cost:10,power:20,store:40,auto:1,rel:.97},
    {n:'Autonomous computer',mass:30,cost:18,power:35,store:90,auto:2,rel:.985}]},
  thermal:{label:'Thermal control',why:'Instruments drift out of calibration when they run too hot or too cold.',tiers:[
    {n:'Passive blankets',mass:15,cost:3,power:0,rel:.93,s:'calibration −8%'},{n:'Heaters and louvres',mass:30,cost:6,power:25,rel:.97},{n:'Active fluid loop',mass:45,cost:11,power:40,rel:.99}]}
};
const TR={hohmann:{n:'Hohmann transfer',Q:RM,cost:0,d:'Minimum energy. Leaves Earth’s orbit on a tangent and arrives half an orbit later.'},
          fast:{n:'Fast transfer',Q:1.56,cost:8,d:'A bigger launch vehicle (+8M) throws you harder. Shorter cruise, but you arrive faster and must brake more.'}};
const ORB={aero:{n:'Low orbit by aerobraking',d:'Capture into a long ellipse, then skim the upper atmosphere for months to shrink it. Cheap on propellant, costs one observation pass.',passes:9,q:1},
           ellip:{n:'Stay in the capture ellipse',d:'Same small burn, no aerobraking. You are far from the surface most of the time, so data quality drops 40%.',passes:10,q:.6},
           direct:{n:'Direct to 300 km circular',d:'One large burn straight into the science orbit. Full quality from day one, very propellant-hungry. Needs a light spacecraft and the high-energy engine.',passes:10,q:1}};
const REG={
  jezero:{n:'Jezero Crater',lon:77.5,lat:18.4,d:'A 45 km crater that once held a lake. A river delta is still visible on its western edge.',
    look:'Mineral composition and evidence of past water.',aff:{cam:.9,spec:1,mcs:.5,radar:.4}},
  valles:{n:'Valles Marineris',lon:-70,lat:-10,d:'A canyon system over 4,000 km long and up to 7 km deep. Its walls expose kilometres of layered rock.',
    look:'Geological layers, erosion and surface structure.',aff:{cam:1,spec:.7,mcs:.6,radar:.6}},
  polar:{n:'North polar cap',lon:0,lat:80,d:'Stacked layers of water ice and dust, topped by a seasonal coat of carbon-dioxide frost.',
    look:'Water ice, atmospheric interactions and climate history.',aff:{cam:.6,spec:.6,mcs:1,radar:1}}
};
const DIM=[1,.6,.35,.2,.1,.05];
const STAGES=['title','briefing','science','planning','design','review','cruise','moi','ops','debrief'];
const TRACK=[['briefing','Briefing'],['science','Science'],['planning','Trajectory'],['design','Build'],['review','Review'],['cruise','Cruise'],['moi','Mars'],['debrief','Debrief']];
const NB=[
 ['briefing','Mars','Radius 3,390 km, about half of Earth. Gravity is 38% of Earth’s. The air is mostly carbon dioxide at under 1% of Earth’s surface pressure.'],
 ['briefing','Water history','Dry river valleys, deltas and water-altered minerals show that liquid water flowed on Mars more than 3 billion years ago.'],
 ['briefing','Past vs present habitability','A place that could once have supported life is not the same as a place that can today. Orbiters look for evidence of the first.'],
 ['briefing','Mission segments','NASA splits a science mission into four segments: launch (the rocket), space (the spacecraft and its instruments), ground (control centres and antennas) and user (the scientists and public who use the data).'],
 ['briefing','Concept of operations','A time-ordered story of how the whole system will be used, written before the design. It drives the requirements and is what the finished mission is checked against.'],
 ['briefing','The design process','Identify the need and goals, define the concept, define requirements, design, build and verify, then implement. This game follows the same six steps.'],
 ['science','Begin with the end in mind','Start from the data the scientists need at the end, then work backwards to the instruments, power, storage and downlink needed to get it.'],
 ['science','Remote sensing','Measuring something without touching it, by recording light or radio waves that it reflects or emits.'],
 ['science','Absorption spectrum','Minerals absorb specific wavelengths. The pattern of dips in reflected light works like a fingerprint.'],
 ['science','Radar sounding','Radio pulses bounce off boundaries between materials. The echo delay gives the depth of each layer.'],
 ['planning','Heliocentric orbit','A path around the Sun. Earth laps Mars about every 780 days, which sets how often launch windows open.'],
 ['planning','Hohmann transfer','The lowest-energy route between two circular orbits: half an ellipse that touches both.'],
 ['planning','Launch window','You aim at where Mars will be on arrival day, so you can only leave when the planets are lined up correctly.'],
 ['planning','Delta-v','The total change in velocity a spacecraft can make. Every manoeuvre spends some of it.'],
 ['design','Rocket equation','Δv = Isp × g₀ × ln(wet mass ÷ dry mass). Each extra kilogram of hardware needs more propellant to move it.'],
 ['design','Power budget','Total generation must cover every system that is switched on, with margin for degradation.'],
 ['design','Redundancy','Carrying a spare of a critical part. It costs mass and money and halves the chance that one failure ends the mission.'],
 ['planning','GMAT','NASA’s open-source General Mission Analysis Tool. Mission designers use it to compute and optimise real trajectories. You can export this game’s flight plan as a GMAT script from the review board.'],
 ['review','Requirements and verification','Every requirement is written together with the way it will be checked: by test, analysis, inspection or demonstration. A requirement you cannot verify is only a wish.'],
 ['cruise','Light-time delay','Radio travels at 299,792 km/s. Earth to Mars takes 3 to 22 minutes one way, so joystick control is impossible.'],
 ['cruise','Inverse-square law','Sunlight intensity falls with the square of distance. At 1.52 AU you get 1 ÷ 1.52² = 43% of the power.'],
 ['cruise','Trajectory correction','Small burns during cruise remove aiming errors. The earlier you correct, the less propellant it costs.'],
 ['moi','Orbit insertion','Arriving spacecraft move faster than Mars’s escape velocity. An engine burn at closest approach slows them enough to be captured.'],
 ['moi','Aerobraking','Dipping into the upper atmosphere on each orbit uses drag instead of propellant to lower the orbit.'],
 ['ops','Data rate','Instruments can record far more than the radio can send. What gets transmitted is a science decision.'],
 ['ops','Fault management','When hardware misbehaves, operators trade the chance of recovery against the risk of making it worse.'],
 ['debrief','Evidence and uncertainty','One observation suggests. Repeated observations with different instruments make a case.']
];

/* ============ state ============ */
function fresh(){return {stage:'title',max:0,inst:{cam:false,spec:false,mcs:false,radar:false},
  sel:{structure:1,power:1,battery:1,comms:1,engine:1,computer:1,thermal:1},red:false,prop:250,
  dep:0,transfer:'hohmann',orbit:'aero',P:[],log:[],aura:0,health:0,retries:0,loose:0,fail:[],degr:1,calib:1,name:'Wayfarer',guided:true,quiz:{},bolts:0};}
let S=fresh(), RUN=0, DEMO={k:1};
const sleep=ms=>new Promise(r=>setTimeout(r,ms*DEMO.k));
const $=id=>document.getElementById(id);
const main=$('main');

function plan(){
  const tr=transfer(TR[S.transfer].Q), d=S.dep;
  const miss=wrap(Lm(d)+NM*tr.T-(Le(d)+deg(tr.nu)));
  const pen=10*miss*miss;
  const rp=R_MARS+300, vh=Math.sqrt(tr.vinf**2+2*MU_M/rp), ae=(rp+R_MARS+45000)/2;
  const vell=Math.sqrt(MU_M*(2/rp-1/ae)), vc=Math.sqrt(MU_M/rp), vesc=Math.sqrt(2*MU_M/rp);
  const vt=S.orbit==='direct'?vc:vell, moi=(vh-vt)*1000;
  const ea=rad(Le(d+tr.T)), ma=rad(Lm(d+tr.T));
  const dist=Math.hypot(RM*Math.cos(ma)-Math.cos(ea),RM*Math.sin(ma)-Math.sin(ea))*AU;
  return {tr,miss,pen,feasible:Math.abs(miss)<=10,vh,vt,vc,vesc,moi,need:40+pen+moi+60,dist,light:dist/C_KMS/60};
}
function bestDep(){let b=0,bm=1e9;for(let d=0;d<=700;d++){const o=S.dep;S.dep=d;const m=Math.abs(plan().miss);S.dep=o;if(m<bm){bm=m;b=d}}return b;}
const tier=k=>SYS[k].tiers[S.sel[k]];
function design(){
  const on=IK.filter(k=>S.inst[k]);
  let dry=0,cost=TR[S.transfer].cost+S.prop*.02;
  for(const k in SYS){dry+=tier(k).mass;cost+=tier(k).cost;}
  for(const k of on){dry+=INST[k].mass;cost+=INST[k].cost;}
  if(S.red){dry+=45;cost+=12;}
  const wet=dry+S.prop, genE=tier('power').w, genM=genE/(RM*RM);
  const bus=150+tier('comms').power+tier('computer').power+tier('thermal').power;
  const instP=on.reduce((s,k)=>s+INST[k].power,0), maxInst=on.reduce((m,k)=>Math.max(m,INST[k].power),0);
  let rel=tier('structure').rel*tier('engine').rel*tier('computer').rel*tier('thermal').rel;
  if(S.red)rel=1-(1-rel)*.5;
  return {on,dry,wet,cost,genE,genM,bus,instP,maxInst,rel,dv:tier('engine').isp*G0*Math.log(wet/dry),
    store:tier('computer').store,down:tier('comms').down,dataPass:on.reduce((s,k)=>s+INST[k].data,0),wh:tier('battery').wh};
}
function checks(){
  const d=design(),p=plan(),c=[];
  const add=(name,ok,detail,crit=true)=>c.push({name,ok,detail,crit});
  add('Mass below 1,200 kg',d.wet<=MASS_CAP,`${f0(d.wet)} kg launch mass`);
  add('Cost within 180M credits',d.cost<=BUDGET,`${f1(d.cost)}M committed`);
  add('Trajectory reaches Mars',p.feasible,p.feasible?`Arrival error ${f1(Math.abs(p.miss))}° costs ${f0(p.pen)} m/s to correct`:`Mars is ${f1(Math.abs(p.miss))}° away from your arrival point. Change the departure date.`);
  add('Sufficient power generation',d.genM>=d.bus+d.maxInst,`${f0(d.genM)} W at Mars against ${f0(d.bus)} W for the spacecraft plus ${f0(d.maxInst)} W for the largest instrument`);
  add('Adequate battery capacity',d.wh*.8>=d.bus*.7,`${f0(d.wh*.8)} Wh usable against ${f0(d.bus*.7)} Wh needed for a 42-minute eclipse`);
  add('Sufficient propellant',d.dv>=p.need,`${f0(d.dv)} m/s available against ${f0(p.need)} m/s required`);
  add('Functional communications',true,`${tier('comms').n}, ${tier('comms').down} Gb per pass`);
  add('Adequate data storage',d.store>=d.dataPass,`${d.store} Gb storage against ${d.dataPass} Gb from one pass with every instrument on`);
  add('Operational scientific instruments',d.on.length>0,`${d.on.length} of 4 installed`);
  add('Power for all instruments at once',d.genM>=d.bus+d.instP,`${f0(d.bus+d.instP)} W with everything on. You will need to stagger observations.`,false);
  add('Propellant margin of 10%',d.dv>=p.need*1.1,`Margin is ${f0((d.dv/p.need-1)*100)}%. Corrections during cruise may use it up.`,false);
  add('Downlink keeps up with data',d.down>=d.dataPass,`${d.dataPass} Gb generated per full pass, ${d.down} Gb transmitted`,false);
  const FIX=['Remove an instrument, pick lighter parts or load less propellant.','Pick cheaper parts or leave an instrument behind.','Go back to the trajectory and move the departure date.',
    'Fit larger solar arrays, or choose systems that draw less power.','Fit a larger battery.','Add propellant, cut mass, or pick a flight plan that needs less speed change.','','Fit a computer with more storage.','Install at least one instrument.'];
  const VER=['test: weigh the assembled spacecraft','inspection: audit of committed costs','analysis: trajectory simulation','analysis: power budget at Mars distance','analysis: eclipse energy budget','analysis: rocket equation against the flight plan','test: end-to-end radio link','analysis: data volume per pass','inspection: instrument fit check','analysis: power budget','analysis: propellant budget','analysis: data budget'];
  c.forEach((x,i)=>{x.fix=FIX[i]||'';x.ver=VER[i]||'';});
  return c;
}
/* propellant the current design needs for the current flight plan (with a 10% margin), and whether it fits */
function propNeeded(){const d=design(),p=plan(),ve=tier('engine').isp*G0,exact=d.dry*(Math.exp(p.need/ve)-1),want=d.dry*(Math.exp(p.need*1.1/ve)-1);
  const room=Math.min(800,MASS_CAP-d.dry),pick=want<=room?Math.ceil(want/10)*10:exact<=room?Math.floor(room/10)*10:Math.floor(room/10)*10;
  return {exact,want,room,load:clamp(pick,100,800),fits:Math.ceil(exact/10)*10<=room,dryMax:MASS_CAP/Math.exp(p.need/ve),need:p.need};}
/* step-by-step help for a failed check: what the numbers mean, and exactly what to press */
function howTo(i){const d=design(),p=plan(),n=propNeeded(),L=[];let to='design',sec='';
  const light=k=>{const t=SYS[k].tiers,c=S.sel[k],b=t.reduce((a,x,j)=>x.mass<t[a].mass?j:a,0);return b!==c?`${SYS[k].label}: “${t[b].n}” saves ${t[c].mass-t[b].mass} kg`:'';};
  const lighter=()=>['structure','power','battery','comms','computer','thermal'].map(light).filter(Boolean);
  if(i===0){const over=d.wet-MASS_CAP;sec='structure';L.push(`You are ${f0(over)} kg over the 1,200 kg limit. Launch mass is ${f0(d.dry)} kg of hardware plus ${f0(S.prop)} kg of propellant.`);
    const sv=lighter();if(sv.length)L.push('In Build, switch to lighter parts. '+sv.slice(0,3).join('. ')+'.');
    if(d.on.length)L.push('Or remove an instrument: '+d.on.map(k=>`${INST[k].name} ${INST[k].mass} kg`).join(', ')+'.');L.push('Do not just drain the propellant. Check that “Speed change needed / available” still passes afterwards.');}
  else if(i===1){sec='structure';L.push(`You have committed ${f1(d.cost)}M of 180M, so you must save ${f1(d.cost-BUDGET)}M.`);
    const big=Object.keys(SYS).map(k=>[k,tier(k).cost-Math.min(...SYS[k].tiers.map(t=>t.cost))]).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>0).slice(0,3);
    if(big.length)L.push('Biggest savings in Build: '+big.map(x=>`${SYS[x[0]].label} up to ${x[1]}M`).join(', ')+'.');if(S.red)L.push('Redundancy costs 12M. Dropping it saves money but doubles the failure risk.');if(S.transfer==='fast')L.push('The fast transfer adds 8M for the bigger launch vehicle.');}
  else if(i===2){to='planning';L.push('Open the Trajectory stage.','Press “Show me the launch window”, or drag the departure date until the flight plan says “Window open”.',`Right now Mars would be ${f1(Math.abs(p.miss))}° ${p.miss>0?'ahead of':'behind'} your arrival point, so leave ${p.miss>0?'later':'earlier'}.`);}
  else if(i===3){sec='power';L.push(`At Mars your arrays make ${f0(d.genM)} W. The spacecraft needs ${f0(d.bus)} W plus ${f0(d.maxInst)} W for its hungriest instrument: ${f0(d.bus+d.maxInst)} W.`);
    const t=SYS.power.tiers.find(t=>t.w/(RM*RM)>=d.bus+d.maxInst);L.push(t?`In Build, under Solar arrays, pick “${t.n}” (${f0(t.w/(RM*RM))} W at Mars).`:'Even the largest arrays are not enough. Choose a smaller dish, a simpler computer or lighter thermal control to cut the load.');}
  else if(i===4){sec='battery';const t=SYS.battery.tiers.find(t=>t.wh*.8>=d.bus*.7);L.push(`In Mars’s shadow the spacecraft runs on the battery for about 42 minutes and needs ${f0(d.bus*.7)} Wh. Yours gives ${f0(d.wh*.8)} Wh usable.`,t?`In Build, under Battery, pick “${t.n}”.`:'Pick the large pack and reduce the systems’ power draw.');}
  else if(i===5){sec='prop';L.push(`Your flight plan needs ${f0(n.need)} m/s of speed change. This design can make ${f0(d.dv)} m/s.`);
    if(n.fits)L.push(`In Build, press “Load what the flight plan needs”, or drag Propellant to at least ${f0(Math.ceil(n.exact/10)*10)} kg.`);
    else{L.push(`With ${f0(d.dry)} kg of hardware there is no room for enough propellant under the mass limit. Hardware must come down to about ${f0(n.dryMax)} kg.`);
      const sv=lighter();if(sv.length)L.push('Lighter parts: '+sv.slice(0,3).join('. ')+'.');
      const T3=SYS.engine.tiers;if(tier('engine').isp<T3[T3.length-1].isp)L.push(`A better engine gets more from each kilogram: “${T3[T3.length-1].n}”.`);
      if(S.orbit==='direct')L.push('Or go back to Trajectory and choose aerobraking. It cuts the arrival burn by more than half.');if(S.transfer==='fast')L.push('Or choose the Hohmann transfer: you arrive slower and brake less.');}
    L.push('Rule of thumb: every kilogram of hardware you remove also removes the propellant needed to stop it at Mars.');}
  else if(i===7){sec='computer';const t=SYS.computer.tiers.find(t=>t.store>=d.dataPass);L.push(`One pass with every instrument on makes ${d.dataPass} Gb. Your computer stores ${d.store} Gb.`,t?`In Build, under Computing and data, pick “${t.n}”.`:'Carry fewer data-heavy instruments.');}
  else if(i===8){to='science';L.push('Go back to stage 2 and install at least one instrument, or switch one on under Scientific instruments in Build.');}
  return {steps:L,to,sec};}
function howHtml(x,i){if(x.ok||!x.crit)return '';const h=howTo(i);if(!h.steps.length)return '';
  return `<details class="how"><summary>Show me how to fix this</summary><ol>${h.steps.map(t=>`<li>${t}</li>`).join('')}</ol><button class="ghost" data-goto="${h.to}" data-sec="${h.sec}">Take me there</button></details>`;}
function bindHow(root){root.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{const sec=b.dataset.sec,to=b.dataset.goto,same=S.stage===to;
  const jump=()=>{const el=sec&&main.querySelector(`.sys[data-sec="${sec}"]`);if(el){el.scrollIntoView({block:'center',behavior:calm()?'auto':'smooth'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),2600);}};
  if(same)jump();else{go(to);setTimeout(jump,2100*DEMO.k+80);}});}
const pt=(name,got,max,note)=>S.P.push({name,got,max,note});
const lg=text=>S.log.push(text);

/* ============ ui helpers ============ */
function head(n,title,loc,lede){return `<div class="stagehead"><p class="loc"><i class="led"></i>${loc} · stage ${String(n).padStart(2,'0')} / 08</p><h2>${title}</h2></div><p class="lede">${lede}</p>`;}
function meter(label,val,max,unit,mode){
  const cls=mode||(val>max?'over':val>max*.9?'warn':'');
  return `<div class="meter ${cls}"><div class="t"><span>${label}</span><span class="num">${val%1?f1(val):f0(val)} / ${f0(max)} ${unit}</span></div><div class="b"><i style="width:${clamp(val/max*100,0,100)}%"></i></div></div>`;
}
function cv(el,w,h){const c=typeof el==='string'?$(el):el,r=Math.min(2,window.devicePixelRatio||1);c.width=w*r;c.height=h*r;c.style.aspectRatio=w+'/'+h;c.style.width='100%';const ctx=c.getContext('2d');ctx.setTransform(r,0,0,r,0,0);return {ctx,w,h};}
function ask({kicker='',title,body='',choices,cls=''}){return new Promise(res=>{
  const o=document.createElement('div');o.className='overlay';
  o.innerHTML=`<div class="modal ${cls}" role="dialog" aria-modal="true"><p class="kicker">${kicker}</p><h3>${title}</h3><div class="mbody">${body}</div><div class="choices">${choices.map((c,i)=>`<button class="choice" data-i="${i}" ${c.disabled?'disabled':''}><b>${c.label}</b>${c.sub?`<span>${c.sub}</span>`:''}</button>`).join('')}</div></div>`;
  document.body.appendChild(o);if(cls.includes('alert'))SFX.alarm();const f=o.querySelector('.choice:not([disabled])');if(f)f.focus();
  o.addEventListener('click',e=>{const b=e.target.closest('.choice');if(!b||b.disabled)return;o.remove();const c=choices[+b.dataset.i];res(c.value===undefined?+b.dataset.i:c.value);});
});}
const tell=(kicker,title,body,label='Continue')=>ask({kicker,title,body,choices:[{label}]});
function toast(t){const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),3200);}
function teach(t){return `<p class="teach"><b>Concepts:</b> ${t}</p>`;}

function chrome(){
  const i=TRACK.findIndex(t=>t[0]===S.stage||(t[0]==='moi'&&S.stage==='ops'));
  $('track').innerHTML=S.stage==='title'?'':TRACK.map((t,j)=>`<li class="${j<i?'done':j===i?'now':''}"${j===i?' aria-current="step"':''}>${j+1} ${t[1]}</li>`).join('');
  let h='';
  if(['science','planning','design','review'].includes(S.stage)){const d=design();
    h=`<span class="chip ${d.wet>MASS_CAP?'over':''}">${f0(d.wet)} / 1,200 kg</span><span class="chip ${d.cost>BUDGET?'over':''}">${f1(d.cost)} / 180M</span>`;}
  else if(['cruise','moi','ops'].includes(S.stage))h=`<span class="chip">Health ${f0(S.health)}%</span><span class="chip">Propellant ${f0(S.prop)} kg</span><span class="chip">Aura ${f0(S.aura)}</span>`;
  $('hstats').innerHTML=h;
}
const LOC={briefing:['Mission briefing','ASEA Mission Control'],science:['Scientific preparation','Science Operations Center'],planning:['Interplanetary planning','Mission Planning Center'],design:['Spacecraft construction','Spacecraft Design Facility'],
  review:['Technical review','Launch Readiness Board'],cruise:['Interplanetary cruise','Spacecraft Operations Center'],moi:['Mars orbit insertion','Spacecraft Operations Center'],ops:['Science operations','Mars orbit'],debrief:['Mission debrief','ASEA Science Operations Center']};
let BG=null,cardT=[];
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function setScene(stage){document.body.dataset.stage=stage;if(BG)BG.stage(stage);}
function locCard(stage){const c=$('card'),L=LOC[stage];cardT.forEach(clearTimeout);cardT=[];if(!c)return;
  if(calm()||DEMO.k<.2){c.className='loccard';return;}
  const i=TRACK.findIndex(t=>t[0]===stage||(t[0]==='moi'&&stage==='ops'));
  c.innerHTML=L?`<p class="mono">Stage ${String(i+1).padStart(2,'0')} of 08</p><h2>${L[1]}</h2><p class="sub">${L[0]}</p>`:'';
  /* the card fades in over the old screen, holds, and fades out over the new one. Coming out of a cutscene the
     screen is already black, so the card starts fully shown and only fades out. */
  const cut=!!document.querySelector('.cine'),dur=(L?1900:700)*DEMO.k;c.className='loccard';void c.offsetWidth;c.style.animationDuration=dur+'ms';c.className='loccard show'+(cut?' cut':'')+(L?'':' bare');
  cardT.push(setTimeout(()=>{c.className='loccard';},dur+40));}
/* cross-fade between steps: a frozen copy of the old screen sits on top of the new one and fades away */
function ghost(){if(calm()||DEMO.k<.2||document.querySelector('.cine')||!main.children.length)return;
  try{const r=main.getBoundingClientRect(),g=main.cloneNode(true);g.removeAttribute('id');g.className='xfade';g.setAttribute('aria-hidden','true');g.inert=true;
    g.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));const A=main.querySelectorAll('canvas'),B=g.querySelectorAll('canvas');
    A.forEach((c,i)=>{try{B[i].width=c.width;B[i].height=c.height;B[i].getContext('2d').drawImage(c,0,0);}catch(e){}});
    g.style.left=r.left+'px';g.style.top=r.top+'px';g.style.width=r.width+'px';document.body.appendChild(g);
    requestAnimationFrame(()=>requestAnimationFrame(()=>g.classList.add('gone')));setTimeout(()=>g.remove(),800);}catch(e){}}
/* radio messages type themselves out; the hidden remainder keeps the layout from jumping */
function typeIn(){if(calm()||DEMO.k<.2)return;main.querySelectorAll('.say p:not(.kicker)').forEach(el=>{if(el.children.length)return;const full=el.textContent,my=RUN;
  const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;'),dur=Math.min(1500,300+full.length*9);el.setAttribute('aria-label',full);let t0=0;
  const tick=now=>{if(my!==RUN||!el.isConnected)return;if(!t0)t0=now;const n=Math.min(full.length,Math.ceil((now-t0)/dur*full.length));
    if(n>=full.length){el.textContent=full;return;}el.innerHTML=esc(full.slice(0,n))+`<span style="visibility:hidden">${esc(full.slice(n))}</span>`;requestAnimationFrame(tick);};
  el.innerHTML=`<span style="visibility:hidden">${esc(full)}</span>`;setTimeout(()=>requestAnimationFrame(tick),(LOC[S.stage]?1150:200)*DEMO.k);});}
function go(stage){const changed=S.stage!==stage;if(changed)ghost();RUN++;S.stage=stage;S.max=Math.max(S.max,STAGES.indexOf(stage));chrome();window.scrollTo(0,0);setScene(stage);
  if(changed)locCard(stage);VIEW[stage]();
  if(changed){main.classList.remove('enter');void main.offsetWidth;main.classList.add('enter');typeIn();}}
function navRow(back,next,label,disabled,note){return `<div class="nav"><button class="ghost" id="back">${back?'Back':'Main menu'}</button><div class="row">${note?`<span class="dim">${note}</span>`:''}<button class="btn" id="next" ${disabled?'disabled':''}>${label}</button></div></div>`;}
function bindNav(back,next){$('back').onclick=()=>go(back||'title');$('next').onclick=()=>go(next);}

/* ============ drawing ============ */
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function drawSys(c,d0,tr,t){
  const {ctx,w,h}=c,cx=w/2,cy=h/2,k=(Math.min(w,h)/2-22)/1.62;
  const P=(r,a)=>[cx+k*r*Math.cos(a),cy-k*r*Math.sin(a)];
  ctx.clearRect(0,0,w,h);
  const R=rng(7);ctx.fillStyle='rgba(239,230,217,.35)';for(let i=0;i<70;i++)ctx.fillRect(R()*w,R()*h,1,1);
  ctx.lineWidth=1;ctx.strokeStyle='#3b2e27';
  for(const r of [1,RM]){ctx.beginPath();ctx.arc(cx,cy,k*r,0,7);ctx.stroke();}
  ctx.fillStyle='#f2b84f';ctx.beginPath();ctx.arc(cx,cy,7,0,7);ctx.fill();
  const le=rad(Le(d0));
  ctx.setLineDash([5,4]);ctx.strokeStyle='#ea6f3c';ctx.lineWidth=1.6;ctx.beginPath();
  for(let i=0;i<=60;i++){const nu=tr.nu*i/60,[x,y]=P(tr.p/(1+tr.e*Math.cos(nu)),le+nu);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.stroke();ctx.setLineDash([]);
  const dot=(r,a,col,rad_,label,hollow)=>{const [x,y]=P(r,a);ctx.beginPath();ctx.arc(x,y,rad_,0,7);if(hollow){ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.stroke();}else{ctx.fillStyle=col;ctx.fill();}
    if(label){ctx.fillStyle='#efe6d9';ctx.font='10px "Martian Mono",monospace';ctx.textAlign=x>cx?'left':'right';ctx.fillText(label,x+(x>cx?10:-10),y+(y>cy?14:-8));}};
  if(t==null){
    dot(1,le,'#8fc8da',5,'Earth at launch');
    dot(RM,rad(Lm(d0)),'#ea6f3c',5,'Mars at launch',true);
    dot(RM,rad(Lm(d0+tr.T)),'#ea6f3c',6,'Mars on arrival day');
    const [x,y]=P(RM,le+tr.nu);ctx.strokeStyle='#efe6d9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y-6);ctx.lineTo(x+6,y+6);ctx.moveTo(x+6,y-6);ctx.lineTo(x-6,y+6);ctx.stroke();
    ctx.fillStyle='#efe6d9';ctx.textAlign=x>cx?'left':'right';ctx.fillText('You arrive here',x+(x>cx?10:-10),y+(y>cy?26:-20));
  }else{
    dot(1,rad(Le(d0+t)),'#8fc8da',5,'Earth');dot(RM,rad(Lm(d0+t)),'#ea6f3c',6,'Mars');
    const s=posAt(tr,Math.min(t,tr.T)),[x,y]=P(s.r,le+s.nu);
    ctx.fillStyle='#efe6d9';ctx.beginPath();ctx.arc(x,y,3.5,0,7);ctx.fill();
    ctx.strokeStyle='rgba(239,230,217,.4)';ctx.beginPath();ctx.arc(x,y,9,0,7);ctx.stroke();
  }
}
/* Everything the 3D spacecraft model needs to match the player's design. */
function craftOpts(){const on=S.fl?S.fl.on:IK.filter(k=>S.inst[k]);return {wing:S.sel.power,dish:S.sel.comms,structure:S.sel.structure,engine:S.sel.engine,thermal:S.sel.thermal,battery:S.sel.battery,computer:S.sel.computer,red:S.red,prop:S.prop,inst:on};}
/* Put a live 3D view in a canvas. Falls back to the 2D drawing when WebGL or three.js is unavailable. */
function view3(id,kind,o,cfg,fallback){const c=$(id);if(!c)return null;const v=Models.view(c,kind,o,cfg);if(!v&&fallback)fallback(c);return v;}
function drawCraft(ctx,x,y,s,o={}){
  const wing=[34,50,68][o.wing??1]*s, dish=[9,14,20][o.dish??1]*s, inst=o.inst||IK;
  ctx.save();ctx.translate(x,y);ctx.rotate(o.rot||0);
  for(const dir of [-1,1]){ctx.fillStyle='#22455a';ctx.strokeStyle='#8fc8da';ctx.lineWidth=1;
    ctx.fillRect(dir*14*s,-9*s,dir*wing,18*s);ctx.strokeRect(dir*14*s,-9*s,dir*wing,18*s);
    ctx.beginPath();for(let i=1;i<5;i++){const xx=dir*(14*s+wing*i/5);ctx.moveTo(xx,-9*s);ctx.lineTo(xx,9*s);}ctx.stroke();}
  ctx.fillStyle='#c9a36a';ctx.fillRect(-14*s,-16*s,28*s,32*s);ctx.strokeStyle='#efe6d9';ctx.strokeRect(-14*s,-16*s,28*s,32*s);
  ctx.fillStyle='#efe6d9';ctx.beginPath();ctx.ellipse(0,-16*s-dish*.45,dish,dish*.45,0,Math.PI,0);ctx.fill();
  ctx.strokeStyle='#efe6d9';ctx.beginPath();ctx.moveTo(0,-16*s);ctx.lineTo(0,-16*s-dish*.9);ctx.stroke();
  const cols={cam:'#ea6f3c',spec:'#f2b84f',mcs:'#86c994',radar:'#8fc8da'};
  inst.forEach((k,i)=>{ctx.fillStyle=cols[k];ctx.fillRect((-11+i*6)*s,16*s,4.5*s,(k==='cam'?9:5)*s);});
  ctx.fillStyle='#5a4a3e';ctx.beginPath();ctx.moveTo(-5*s,16*s);ctx.lineTo(5*s,16*s);ctx.lineTo(7*s,21*s);ctx.lineTo(-7*s,21*s);ctx.fill();
  ctx.restore();
}
function drawMarsMap(c,grid=true){
  const {ctx,w,h}=c,R=rng(41),X=lon=>(lon+180)/360*w,Y=lat=>(90-lat)/180*h;
  if(grid){try{ctx.drawImage(Models.marsCanvas(),0,0,w,h);ctx.strokeStyle='rgba(17,13,11,.3)';ctx.lineWidth=1;ctx.beginPath();for(let lo=-120;lo<180;lo+=60){ctx.moveTo(X(lo),0);ctx.lineTo(X(lo),h);}for(let la=-60;la<90;la+=30){ctx.moveTo(0,Y(la));ctx.lineTo(w,Y(la));}ctx.stroke();return;}catch(e){}}
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#b0613a');g.addColorStop(.5,'#c2703f');g.addColorStop(1,'#99502f');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){ctx.fillStyle=`rgba(${R()<.5?'70,32,18':'226,150,96'},${.04+R()*.08})`;ctx.beginPath();ctx.ellipse(R()*w,R()*h,8+R()*46,5+R()*22,R()*3,0,7);ctx.fill();}
  const dark=(lon,lat,rx,ry,a)=>{ctx.fillStyle=`rgba(52,26,18,${a})`;ctx.beginPath();ctx.ellipse(X(lon),Y(lat),rx,ry,.3,0,7);ctx.fill();};
  dark(68,10,22,34,.55);dark(-30,45,40,22,.4);dark(-150,-30,50,16,.3);dark(120,-20,60,14,.3);dark(20,-25,46,13,.3);
  ctx.fillStyle='rgba(226,170,120,.5)';ctx.beginPath();ctx.ellipse(X(70),Y(-42),38,24,0,0,7);ctx.fill();
  ctx.strokeStyle='rgba(40,18,12,.85)';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(X(-95),Y(-6));ctx.bezierCurveTo(X(-80),Y(-9),X(-65),Y(-8),X(-45),Y(-14));ctx.stroke();
  ctx.fillStyle='rgba(90,44,26,.8)';for(const [lo,la] of [[-134,18],[-121,1],[-113,-9],[-104,12]]){ctx.beginPath();ctx.arc(X(lo),Y(la),6,0,7);ctx.fill();}
  ctx.fillStyle='#f3efe9';ctx.beginPath();ctx.moveTo(0,0);for(let x=0;x<=w;x+=12)ctx.lineTo(x,Y(80)+Math.sin(x/23)*4+R()*4);ctx.lineTo(w,0);ctx.fill();
  ctx.fillStyle='rgba(243,239,233,.85)';ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w;x+=12)ctx.lineTo(x,Y(-85)+Math.sin(x/17)*3);ctx.lineTo(w,h);ctx.fill();
  if(!grid)return;ctx.strokeStyle='rgba(17,13,11,.25)';ctx.lineWidth=1;ctx.beginPath();for(let lo=-120;lo<180;lo+=60){ctx.moveTo(X(lo),0);ctx.lineTo(X(lo),h);}for(let la=-60;la<90;la+=30){ctx.moveTo(0,Y(la));ctx.lineTo(w,Y(la));}ctx.stroke();
}
function drawGlobe(c){
  const {ctx,w,h}=c,cx=w/2,cy=h/2,r=Math.min(w,h)/2-10,R=rng(5);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.clip();
  const g=ctx.createRadialGradient(cx-r*.4,cy-r*.4,r*.1,cx,cy,r*1.1);g.addColorStop(0,'#e08a52');g.addColorStop(.6,'#b55a34');g.addColorStop(1,'#5a2616');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  for(let i=0;i<90;i++){ctx.fillStyle=`rgba(60,26,16,${.05+R()*.12})`;ctx.beginPath();ctx.ellipse(cx+(R()-.5)*2*r,cy+(R()-.5)*2*r,10+R()*40,4+R()*14,R()*.6-.3,0,7);ctx.fill();}
  ctx.strokeStyle='rgba(40,16,10,.8)';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-r*.5,cy+r*.1);ctx.quadraticCurveTo(cx-r*.1,cy+r*.02,cx+r*.25,cy+r*.18);ctx.stroke();
  ctx.fillStyle='#f3efe9';ctx.beginPath();ctx.ellipse(cx,cy-r*.97,r*.42,r*.11,0,0,7);ctx.fill();
  const s=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);s.addColorStop(.45,'rgba(0,0,0,0)');s.addColorStop(.95,'rgba(8,4,3,.92)');ctx.fillStyle=s;ctx.fillRect(0,0,w,h);
  ctx.restore();ctx.strokeStyle='rgba(234,111,60,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r+2,0,7);ctx.stroke();
}

/* ============ story, coaching and glossary ============ */
const WHO={reyes:['Flight Director Imani Reyes','IR'],lind:['Dr. Tomas Lindqvist, science lead','TL'],park:['Jun “Bolt” Park, systems engineer','JP']};
function say(w,text){return `<div class="say"><span class="av" aria-hidden="true">${WHO[w][1]}</span><div><p class="kicker">${WHO[w][0]}</p><p>${text}</p></div></div>`;}
let coachOpen=true;
function coach(steps){return `<details class="coach" ${coachOpen?'open':''} ontoggle="window.__coach&&window.__coach(this.open)"><summary class="kicker">What to do here</summary><ol>${steps.map(x=>`<li>${x}</li>`).join('')}</ol></details>`;}
window.__coach=v=>{coachOpen=v;};
const TERMS={
  deltav:['Delta-v','The total change in speed a spacecraft can make with its engine. Think of it as the fuel gauge of a mission, measured in metres per second. Every manoeuvre spends some.'],
  isp:['Specific impulse (Isp)','How efficiently an engine uses propellant, like kilometres per litre for a car. Higher is better.'],
  hohmann:['Hohmann transfer','The cheapest path between two planets’ orbits: half an oval around the Sun that just touches Earth’s orbit at one end and Mars’s at the other.'],
  window:['Launch window','The short period when Earth and Mars are lined up so that a spacecraft leaving now will meet Mars on arrival day. For Mars it opens about every 26 months.'],
  escape:['Escape speed','The speed at which gravity can no longer hold you. Arrive at Mars faster than this without braking and you fly straight past.'],
  aerobrake:['Aerobraking','Using drag from the thin upper atmosphere, instead of propellant, to slow down a little on every orbit.'],
  eclipse:['Eclipse','The part of each orbit spent in the planet’s shadow. Solar arrays produce nothing there, so the battery takes over.'],
  downlink:['Downlink','Sending data from the spacecraft to Earth by radio. It is much slower than the instruments can record.'],
  drymass:['Dry mass','The spacecraft’s mass with empty tanks. Launch mass is dry mass plus propellant.'],
  au:['Astronomical unit (AU)','The average distance from Earth to the Sun, about 150 million km. Mars orbits at 1.52 AU.']
};
const T=(k,label)=>`<button class="term" data-term="${k}">${label||TERMS[k][0].toLowerCase()}</button>`;
document.addEventListener('click',e=>{const b=e.target.closest('.term');if(!b)return;e.preventDefault();const t=TERMS[b.dataset.term];tell('Plain-language glossary',t[0],`<p>${t[1]}</p>`,'Got it');});
async function quiz(id,q,opts,correct,why){
  const r=await ask({kicker:'Quick check · a wrong answer costs nothing',title:q,choices:opts.map(o=>({label:o}))});
  S.quiz[id]=r===correct;await tell(r===correct?'Correct':'Not quite',r===correct?'That’s right':'Here’s the idea',`<p>${why}</p>`);
}
const PRE={
  lean:{n:'Lean scout',d:'Cheap, light systems. Leaves room for propellant.',sel:{structure:1,power:1,battery:1,comms:1,engine:1,computer:1,thermal:0},inst:{cam:true,spec:false,mcs:true,radar:true},prop:300,red:false},
  bal:{n:'Balanced orbiter',d:'Mid-range systems throughout.',sel:{structure:1,power:1,battery:1,comms:1,engine:1,computer:1,thermal:1},inst:{cam:true,spec:true,mcs:true,radar:true},prop:340,red:false},
  tough:{n:'Tough survivor',d:'Reinforced, redundant and autonomous.',sel:{structure:2,power:1,battery:1,comms:1,engine:1,computer:2,thermal:1},inst:{cam:false,spec:true,mcs:true,radar:true},prop:380,red:true}
};
function answered(){const o=S.ops,d=(r,k)=>(o.sci[r+k]||0)>0,R3=['jezero','valles','polar'];return {q1:R3.some(r=>d(r,'spec')),q2:R3.some(r=>d(r,'mcs')),q3:d('polar','radar')};}
function qTrack(){const a=answered(),row=(ok,q,need)=>`<li><span class="pill ${ok?'go':'warn'}">${ok?'Answered':'Open'}</span> <b>${q}</b> <span class="dim">${need}</span></li>`;
  return `<section class="coach"><p class="kicker">Your three science questions</p><ul class="plain">${row(a.q1,'What do surface minerals reveal?','Needs the spectrometer. Strongest at Jezero Crater.')}${row(a.q2,'How does the atmosphere vary?','Needs the atmospheric profiler. Strongest at the polar cap.')}${row(a.q3,'Is there ice beneath the surface?','Needs the radar over the north polar cap.')}</ul>
  <p class="dim" style="font-size:.9rem"><b>How a pass works:</b> 1. Tap a region on the map. 2. Switch instruments on or off. 3. Press “Fly this pass”. A question is answered once its data reaches Earth.</p></section>`;}
async function story(b,a){const o=S.ops;
  if(a.q3&&!b.q3){o.ev.echo=1;lg('Kestrel’s echo explained: it is the base of two kilometres of layered polar ice.');
    return Cine.play('discovery',{big:'Kestrel’s echo',bigAt:.55,col:0x8fc8da,lines:[{text:'Radar pulses sink through the polar cap and bounce back from layer after layer.'},{who:'lind',text:'There. The same bright echo Kestrel saw. And this time we have the whole scan.'},{who:'lind',text:'It is the floor of the ice. Two kilometres of frozen water, stacked like pages. Kestrel had found a climate record.'}]});}
  if(o.ev.disc)return;
  if(a.q1&&!b.q1){o.ev.disc=1;return Cine.play('discovery',{big:'Written in the rock',bigAt:.55,col:0xf2b84f,tilt:1.2,lines:[{text:'The spectrometer splits reflected sunlight into hundreds of colours.'},{who:'lind',text:'Dips at 1.9 and 2.3 microns. Those are clays. Clays need water, and they need time.'},{text:'Question 1 has its first evidence: this ground stayed wet for a long while.'}]});}
  if(a.q2&&!b.q2){o.ev.disc=1;return Cine.play('discovery',{big:'Reading the air',bigAt:.55,col:0x86c994,tilt:1.2,lines:[{text:'The profiler looks sideways through the atmosphere, one layer at a time.'},{who:'lind',text:'Temperature, dust and water vapour, from the ground up to 80 kilometres. That is a climate you can plot.'},{text:'Question 2 has its first evidence.'}]});}
}
function finale(){const echo=(S.ops.sci.polarradar||0)>0;
  return Cine.play('finale',{big:'Mission complete',bigAt:.6,lines:[{text:`${S.name} turns its dish toward a pale blue dot and starts sending everything home.`},
    {who:'lind',text:echo?'Six years. Kestrel’s scan is finally finished.':'We got real answers. Not the one Kestrel was chasing, though. That echo is still down there.'},
    {who:'reyes',text:'Good flying. Don’t get comfortable. The board is already asking about Europa.'}]});}
function auraScene(r){const q=r.q,pts=[50,400,1000][q];
  return Cine.play('aura',{q,aura:pts,min:7,big:['Technically Mars-bound','On course. Ish.','On course.'][q],lines:[
    {text:[`You missed the ring by ${f0(r.km)} km. Navigation will spend weeks cleaning this up.`,`Residual miss ${f0(r.km)} km. Close enough that nobody says anything.`,`Residual miss ${f0(r.km)} km, across 200 million. Mission Control exhales.`][q]},
    {who:'reyes',text:['They will bring this up at every meeting.','Far enough that everybody thinks it.','You never inhaled.'][q]}]});}

/* ============ views ============ */
const VIEW={};
VIEW.title=()=>{
  let best=null;try{best=JSON.parse(localStorage.getItem('mcb-rf-best'));}catch(e){}
  main.innerHTML=`<section class="titlescreen"><div class="tmain">
    <p class="kicker">ASEA flight operations · single-player story mode</p>
    <h1>Mission Control<span>Beyond</span></h1>
    <p class="lede">Six years ago ASEA lost its Kestrel orbiter at Mars, halfway through a radar scan that nobody has been able to explain. You are the flight director sending the next spacecraft. Design it, fly it, and decide what it studies.</p>
    ${BG?'':'<div class="cvwrap" style="border:0;background:none;max-width:300px"><canvas id="globe"></canvas></div>'}
  </div>
  <div class="panel menu">
    <p class="kicker">Mission 1 · Mars · intermediate</p><h3>The Red Frontier</h3>
    <p class="dim">Investigate Martian atmospheric changes and map the planet’s surface from orbit.</p>
    <label class="kicker" for="scName">Spacecraft call sign</label><input id="scName" class="txt" maxlength="18" value="Wayfarer" autocomplete="off">
    <label class="row" for="guided" style="gap:8px"><input type="checkbox" id="guided" checked> <span><b>Guided mode.</b> Extra hints and more time. Best for a first flight.</span></label>
    <button class="btn" id="m1">Begin mission</button>
    ${best?`<p class="mono dim">Best score on this console: ${best.s} (${best.c})</p>`:''}
  </div></section>
  <section class="slots">
    ${[['Mission 2 · Europa','Beneath the Ice','Complete The Red Frontier to unlock'],['Mission 3 · Titan','The Outer Worlds','Locked'],['Mission 4 · Deep space','Beyond the Horizon','Locked']]
      .map(m=>`<div class="mission locked" aria-disabled="true"><p class="kicker">${m[0]}</p><h3>${m[1]}</h3><span class="pill warn" style="align-self:flex-start">${m[2]}</span></div>`).join('')}
  </section>
  <details class="coach"><summary class="kicker">How a mission works</summary><ol class="how">
    <li><b>Plan.</b> Choose instruments and a launch date.</li><li><b>Build.</b> Fit everything inside a mass and money limit.</li><li><b>Fly.</b> Handle problems during the trip and brake into orbit.</li><li><b>Explore.</b> Point instruments at Mars and send the data home.</li><li><b>Debrief.</b> See your score and compare with real NASA findings.</li></ol></details>`;
  view3('globe','mars',{},{w:1,h:1,spin:.12,yaw:1.2,pitch:.25},c=>drawGlobe(cv(c,340,340)));
  $('m1').onclick=async()=>{
    const nm=($('scName').value||'').replace(/[<>&"'`$\\]/g,'').trim().slice(0,18)||'Wayfarer',gd=$('guided').checked;
    S=fresh();S.name=nm;S.guided=gd;S.dep=bestDep()+12;
    await Cine.play('prologue',{big:'The Red Frontier',bigAt:.8,lines:[{text:'Six years ago, ASEA’s Kestrel orbiter reached Mars.'},{text:'Nineteen days into its survey, its radar caught a bright echo from beneath the northern ice.'},
      {text:'Halfway through the scan, Kestrel’s power failed. It never called home again.'},{who:'reyes',text:'Nobody knows what that echo was. Tonight the board voted to go back and find out.'}]});
    go('briefing');};
};

VIEW.briefing=()=>{
  main.innerHTML=head(1,'Mission briefing','ASEA Mission Control',`Kestrel left three questions unanswered. ${S.name} gets one chance at them, with less mass and less money than Kestrel had.`)+say('reyes','You get 1,200 kilograms and 180 million credits. Kestrel had more of both and still went dark. Spend yours better. I will be on the loop the whole way.')+coach(['Read the three science questions. They decide what is worth carrying.','Check the limits and the six objectives.','Tap any <b>dotted word</b> in the game for a plain-language explanation.'])+`
  <section class="grid g3">
    ${[['Question 1','What can surface minerals reveal?','Clays and carbonates only form in water. Finding them tells you where water once sat, and for how long.'],
       ['Question 2','How does the atmosphere vary?','Temperature, dust and water vapour change with altitude, season and storm. Profiles show the climate at work.'],
       ['Question 3','Is there ice beneath the surface?','Radar can see through dust and rock to buried ice, the most accessible water left on Mars.']]
      .map(q=>`<div class="panel"><p class="kicker">${q[0]}</p><h3>${q[1]}</h3><p class="dim">${q[2]}</p></div>`).join('')}
  </section>
  <section class="panel"><p class="kicker">Concept of operations · the four segments of a science mission</p>
    <div class="segs">${[['Launch segment','The launch vehicle that puts '+S.name+' on its path to Mars. You pick the date and the transfer.'],['Space segment',S.name+' itself: the orbiter and up to four instruments that collect the data.'],
      ['Ground segment','ASEA Mission Control and its deep-space antennas. That is you, Reyes and Park.'],['User segment','Dr. Lindqvist’s science team and everyone who will use the data. The mission exists for them.']]
      .map((x,i)=>`<div class="seg"><span class="num">${i+1}</span><b>${x[0]}</b><p class="dim">${x[1]}</p></div>`).join('')}</div>
    <p class="kicker" style="margin-top:4px">How NASA designs a mission, and where you do each step</p>
    <ol class="proc">${[['Identify need and goals','Briefing'],['Define the concept','Briefing'],['Define requirements','Science and trajectory'],['Design','Build'],['Build and verify','Review'],['Implement','Launch to debrief']].map(x=>`<li><b>${x[0]}</b><span>${x[1]}</span></li>`).join('')}</ol>
    ${teach('Mission segments, concept of operations and the design process, after NASA’s “Design and Develop Science Missions” systems-engineering webinar (2025).')}</section>
  <section class="split"><div class="panel"><p class="kicker">Mission parameters</p><div class="tw"><table>
    <tr><th>Maximum spacecraft mass</th><td class="num">1,200 kg</td></tr><tr><th>Available budget</th><td class="num">180M credits</td></tr>
    <tr><th>Target operational lifetime</th><td class="num">2 years</td></tr><tr><th>Destination</th><td class="num">Mars orbit</td></tr></table></div>
    <p class="kicker" style="margin-top:6px">Need</p><p class="dim" style="font-size:.92rem">Explain Kestrel’s echo and learn where Mars kept its water, with a spacecraft that survives the trip.</p><p class="kicker" style="margin-top:6px">Goals · primary objectives</p><ul class="plain">
    ${['Reach Mars','Enter a stable orbit','Collect atmospheric measurements','Map selected surface regions','Investigate evidence of past water','Transmit your data to Earth'].map((o,i)=>`<li><span class="num dim">${i+1}</span> ${o}</li>`).join('')}</ul></div>
  <div class="panel"><p class="kicker">How you are scored</p><p class="num" style="font-size:.8rem">S = 0.35R + 0.25O + 0.20E + 0.10P + 0.10L</p><ul class="plain dim" style="font-size:.9rem">
    <li><b style="color:var(--text)">R</b> Scientific return, 35%</li><li><b style="color:var(--text)">O</b> Objective completion, 25%</li><li><b style="color:var(--text)">E</b> Resource efficiency, 20%</li><li><b style="color:var(--text)">P</b> Operational performance, 10%</li><li><b style="color:var(--text)">L</b> Reliability, 10%</li></ul>
    ${teach('Mars’s physical characteristics, the history of water on Mars, planetary geology, past versus present habitability. Open the Notebook at any time.')}</div></section>
  ${navRow(false,'science','Accept mission')}`;
  bindNav(null,'science');
};

VIEW.science=()=>{
  const d=design();
  main.innerHTML=head(2,'Scientific preparation','Science Operations Center','Four instruments are on offer. Each one answers a different question, and each takes a share of your mass, money, power and data.')+say('lind','I have waited six years to finish Kestrel’s scan, and only the radar can see under ice. But choose for the questions, not for me. A spacecraft that carries everything may not get there at all.')+coach(['Tap a card to install or remove an instrument.','Match instruments to questions: spectrometer for minerals, profiler for the atmosphere, radar for buried ice, camera for mapping.','You can still change your mind in the build stage.'])+`<p class="teach"><b>Begin with the end in mind.</b> Decide what data the science team needs at the end, then work backwards: that data fixes the instruments, and the instruments fix the power, storage and downlink you must build.</p>`+`
  <section class="grid g2">${IK.map(k=>{const i=INST[k];return `<button class="opt" data-k="${k}" aria-pressed="${S.inst[k]}">
    <canvas class="i3" id="i3${k}" aria-hidden="true"></canvas><span class="kicker">${i.tag} · ${S.inst[k]?'installed':'left on the ground'}</span><b style="font-family:var(--display);font-size:1.6rem;text-transform:uppercase">${i.name}</b>
    <span>${i.desc}</span><span class="s">${i.mass} kg · ${i.cost}M · ${i.power} W · ${i.data} Gb per observation · reliability ${f0(i.rel*100)}%</span>
    <span class="s" style="color:var(--ice)">Returns: ${i.out}</span><span class="s">Teaches: ${i.teach}</span></button>`;}).join('')}</section>
  <section class="panel"><p class="kicker">Payload totals</p><div class="grid g3">
    ${meter('Payload mass',d.on.reduce((s,k)=>s+INST[k].mass,0),122,'kg','ok')}${meter('Payload cost',d.on.reduce((s,k)=>s+INST[k].cost,0),74,'M','ok')}${meter('Payload power',d.instP,136,'W','ok')}</div>
    <p class="dim">These instruments are modelled on real ones aboard NASA’s Mars Reconnaissance Orbiter. The numbers here are tuned for the game.</p></section>
  ${navRow(true,'planning','Plan the journey',!d.on.length,d.on.length?'':'Install at least one instrument')}`;
  IK.forEach((k,i)=>{const v=view3('i3'+k,'inst',{k},{w:16,h:7,spin:.35,yaw:i*1.3,pitch:.3,drag:false});if(!v)$('i3'+k).remove();});
  main.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{S.inst[b.dataset.k]=!S.inst[b.dataset.k];chrome();VIEW.science();});
  bindNav('briefing','planning');
};

VIEW.planning=()=>{
  main.innerHTML=head(3,'Interplanetary planning','Mission Planning Center','Earth and Mars both keep moving while you travel. You have to aim at where Mars will be on arrival day, and that only works on certain dates.')+say('reyes','Mars is a moving target. Slide the date until the white cross lands on Mars. Miss by a few degrees and you pay for it in propellant.')+coach(['Drag the <b>departure date</b> until the flight plan says “Window open”.','Pick a transfer. A '+T('hohmann','Hohmann transfer')+' is the cheapest route.','Pick your orbit at Mars, and watch how each choice changes the '+T('deltav')+' you need.'])+`
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="sys"></canvas></div>
    <label for="dep" class="kicker">Departure date</label><input type="range" id="dep" min="0" max="700" step="1" value="${S.dep}">
    <div class="row between"><button class="ghost" id="d-">−1 day</button><b class="num" id="depLab"></b><button class="ghost" id="d+">+1 day</button></div>
    ${S.guided?'<button class="ghost" id="findWin">Show me the launch window</button>':''}
    ${teach('Heliocentric orbits, orbital velocity, Hohmann transfers, launch windows, delta-v. Orbits here are circular and flat, which is close enough to show the idea.')}</div>
  <div class="grid"><div class="panel"><p class="kicker">Transfer trajectory</p><div class="choices">${Object.keys(TR).map(k=>`<button class="opt" data-tr="${k}" aria-pressed="${S.transfer===k}"><b>${TR[k].n}</b><span class="s">${TR[k].d}</span></button>`).join('')}</div></div>
    <div class="panel"><p class="kicker">Intended Mars orbit</p><div class="choices">${Object.keys(ORB).map(k=>`<button class="opt" data-orb="${k}" aria-pressed="${S.orbit===k}"><b>${ORB[k].n}</b><span class="s">${ORB[k].d}</span></button>`).join('')}</div></div>
    <div class="panel" id="planOut"></div></div></section>
  <p class="teach"><b>Check it like the professionals.</b> This screen uses the patched-conic method that real designers start from. NASA’s open-source <a href="https://sourceforge.net/projects/gmat/" target="_blank" rel="noopener">General Mission Analysis Tool (GMAT)</a> does the full calculation. You can export this flight plan as a GMAT script from the review board.</p>
  ${navRow(true,'design','Build the spacecraft')}`;
  const c=cv('sys',460,460);
  const upd=()=>{const p=plan();drawSys(c,S.dep,p.tr,null);$('depLab').textContent=dateStr(S.dep);
    const a=Math.abs(p.miss),st=a<1?['go','Window open']:a<=10?['warn','Costly']:['nogo','No route'];
    $('planOut').innerHTML=`<div class="row between"><p class="kicker">Flight plan</p><span class="pill ${st[0]}">${st[1]}</span></div>
      <p>${a<1?'Mars will be where you arrive.':`Mars will be ${f1(a)}° ${p.miss>0?'ahead of':'behind'} your arrival point. Leave ${p.miss>0?'later':'earlier'}.`}</p>
      <div class="tw"><table><tr><th>Arrival</th><td class="num">${dateStr(S.dep+p.tr.T)}</td></tr><tr><th>Travel time</th><td class="num">${f0(p.tr.T)} days</td></tr>
      <tr><th>Approach speed at Mars</th><td class="num">${f2(p.tr.vinf)} km/s</td></tr><tr><th>Correction for timing error</th><td class="num">${f0(p.pen)} m/s</td></tr>
      <tr><th>Orbit insertion burn</th><td class="num">${f0(p.moi)} m/s</td></tr><tr><th>Cruise and orbit trims</th><td class="num">100 m/s</td></tr>
      <tr><th><b style="color:var(--text)">Total speed change needed</b> (${T('deltav')})</th><td class="num"><b>${f0(p.need)} m/s</b></td></tr>
      <tr><th>Signal delay on arrival</th><td class="num">${f1(p.light)} min one way</td></tr></table></div>`;chrome();};
  $('dep').oninput=e=>{S.dep=+e.target.value;upd();};
  $('d-').onclick=()=>{S.dep=Math.max(0,S.dep-1);$('dep').value=S.dep;upd();};
  $('d+').onclick=()=>{S.dep=Math.min(700,S.dep+1);$('dep').value=S.dep;upd();};
  main.querySelectorAll('[data-tr]').forEach(b=>b.onclick=()=>{S.transfer=b.dataset.tr;VIEW.planning();});
  main.querySelectorAll('[data-orb]').forEach(b=>b.onclick=()=>{S.orbit=b.dataset.orb;VIEW.planning();});
  if($('findWin'))$('findWin').onclick=()=>{S.dep=bestDep();$('dep').value=S.dep;upd();};
  upd();bindNav('science','design');
  $('next').onclick=async()=>{if(S.quiz.window===undefined)await quiz('window','Why can’t a Mars mission launch on any day of the year?',['Rockets only work in good weather','Earth and Mars must be lined up so that Mars is at the arrival point when you get there','Mars is only visible at night'],1,'The two planets circle the Sun at different speeds. The right line-up, called a launch window, comes around about every 26 months.');go('design');};
};

function tierStat(k,t){
  const extra={power:`${t.w} W at Earth, ${f0((t.w||0)/(RM*RM))} W at Mars`,battery:`${t.wh} Wh`,comms:`${t.down} Gb per pass, ${t.power} W`,
    computer:`${t.store} Gb storage, autonomy ${['low','medium','high'][t.auto]}, ${t.power} W`,thermal:`${t.power} W${t.s?', '+t.s:''}`,structure:t.s,engine:t.s}[k];
  return `${t.mass} kg · ${t.cost}M · ${extra}`;
}
VIEW.design=()=>{
  if(!S.propSet){S.propSet=true;S.prop=propNeeded().load;}
  main.innerHTML=head(4,'Spacecraft construction','Spacecraft Design Facility','Every part you add makes the spacecraft heavier, and a heavier spacecraft needs more propellant to brake at Mars. Good design is choosing what to leave out.')+say('park','First draft is on your desk, with the instruments you picked. Check the propellant against your flight plan before review. Also, I counted 4,212 bolts on this thing. I intend to arrive with 4,212.')+coach(['Start from a template, or change one system at a time.','Watch <b>Live budgets</b>. Red means over the limit.','Fix everything in the “Not ready” list, then send it to review.'])+`
  <section class="split"><div class="panel">
    <div class="sys"><div class="lab"><b>Start from a template</b><span class="dim" style="font-size:.85rem;max-width:52ch">Templates set the systems and load propellant for your flight plan. They keep the instruments you chose in stage 2.</span></div>
      <div class="opts">${Object.keys(PRE).map(k=>`<button class="opt" data-pre="${k}"><b>${PRE[k].n}</b><span class="s">${PRE[k].d}</span></button>`).join('')}</div></div>
    ${Object.keys(SYS).map(k=>`<div class="sys" data-sec="${k}"><div class="lab"><b>${SYS[k].label}</b><span class="dim" style="font-size:.85rem;max-width:52ch">${SYS[k].why}</span></div>
      <div class="opts">${SYS[k].tiers.map((t,i)=>`<button class="opt" data-sys="${k}" data-i="${i}" aria-pressed="${S.sel[k]===i}"><b>${t.n}</b><span class="s">${tierStat(k,t)}</span></button>`).join('')}</div></div>`).join('')}
    <div class="sys" data-sec="prop"><div class="lab"><b>Propellant</b><span class="num" id="propLab"></span></div><input type="range" id="prop" min="100" max="800" step="10" value="${S.prop}" aria-label="Propellant load"><div class="row"><button class="ghost" id="autoProp">Load what the flight plan needs</button><span class="dim" id="propHint" style="font-size:.84rem"></span></div></div>
    <div class="sys"><div class="lab"><b>Redundancy</b><span class="dim" style="font-size:.85rem">Spare computer, valves and heaters</span></div>
      <div class="opts"><button class="opt" id="red" aria-pressed="${S.red}"><b>Redundant critical components</b><span class="s">+45 kg · +12M · halves failure risk</span></button></div></div>
    <div class="sys" data-sec="inst"><div class="lab"><b>Scientific instruments</b><span class="dim" style="font-size:.85rem">As chosen in stage 2. Change them here if the budgets force you to.</span></div><div class="opts">${IK.map(k=>`<button class="opt" data-inst="${k}" aria-pressed="${S.inst[k]}"><b>${INST[k].name}</b><span class="s">${INST[k].mass} kg · ${INST[k].cost}M · ${INST[k].power} W · ${INST[k].data} Gb</span></button>`).join('')}</div></div>
  </div><div class="panel sticky" id="readout"></div></section>
  ${teach('Spacecraft subsystems, power budgets, mass budgets, propellant management, redundancy, engineering trade-offs.')}
  ${navRow(true,'review','Send to review')}`;
  $('readout').innerHTML=`<p class="kicker">Your spacecraft · live 3D model</p><div class="cvwrap"><canvas id="craft"></canvas><span class="hint3">Drag to turn it</span></div>
    <p class="dim" style="font-size:.82rem">Drag to look around. The instruments you fit appear under the main bridge, each with its coloured ring.</p><div id="rbody" class="grid" style="gap:12px"></div>`;
  const cview=view3('craft','craft',craftOpts(),{w:3,h:2,spin:.3,yaw:.7,pitch:.38});
  const upd=()=>{const d=design(),p=plan(),ck=checks(),bad=ck.filter(x=>x.crit&&!x.ok);{const n=propNeeded();$('propHint').textContent=n.fits?`Needs about ${f0(Math.ceil(n.exact/10)*10)} kg. Room for ${f0(n.room)} kg.`:`Needs ${f0(n.exact)} kg but there is only room for ${f0(Math.max(0,n.room))} kg. Lighten the hardware.`;}$('propLab').textContent=`${S.prop} kg · ${f1(S.prop*.02)}M`;
    $('rbody').innerHTML=`
      ${bad.length?`<div class="issues"><p class="kicker" style="color:var(--bad)">Not ready for review</p><ul class="plain">${bad.map(x=>`<li><b>${x.name}.</b> ${x.fix}${howHtml(x,ck.indexOf(x))}</li>`).join('')}</ul></div>`:'<div class="issues ok"><p class="kicker" style="color:var(--good)">Ready for review</p><p>Every critical check passes.</p></div>'}
      ${meter('Launch mass',d.wet,MASS_CAP,'kg')}${meter('Cost',d.cost,BUDGET,'M')}
      ${meter('Power, all instruments on',d.bus+d.instP,d.genM,'W')}
      ${meter('Speed change needed / available',p.need,d.dv,'m/s',p.need>d.dv?'over':p.need*1.1>d.dv?'warn':'ok')}
      ${meter('Data per full pass',d.dataPass,d.store,'Gb storage')}
      <div class="tw"><table><tr><th>Dry mass</th><td class="num">${f0(d.dry)} kg</td></tr><tr><th>Power at Earth / Mars</th><td class="num">${f0(d.genE)} / ${f0(d.genM)} W</td></tr>
      <tr><th>Spacecraft systems draw</th><td class="num">${f0(d.bus)} W</td></tr><tr><th>Battery</th><td class="num">${d.wh} Wh</td></tr>
      <tr><th>Downlink</th><td class="num">${d.down} Gb per pass</td></tr><tr><th>Estimated reliability</th><td class="num">${f1(d.rel*100)}%</td></tr></table></div>`;
    bindHow($('rbody'));
    if(cview)cview.set(craftOpts());else{const c=cv('craft',300,200);c.ctx.clearRect(0,0,300,200);drawCraft(c.ctx,150,105,1.5,{wing:S.sel.power,dish:S.sel.comms,inst:d.on});}chrome();};
  main.querySelectorAll('[data-sys]').forEach(b=>b.onclick=()=>{S.sel[b.dataset.sys]=+b.dataset.i;main.querySelectorAll(`[data-sys="${b.dataset.sys}"]`).forEach(x=>x.setAttribute('aria-pressed',x===b));upd();});
  main.querySelectorAll('[data-inst]').forEach(b=>b.onclick=()=>{const k=b.dataset.inst;S.inst[k]=!S.inst[k];b.setAttribute('aria-pressed',S.inst[k]);upd();});
  main.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>{const p=PRE[b.dataset.pre];S.sel={...p.sel};S.red=p.red;S.prop=p.prop;S.prop=propNeeded().load;VIEW.design();});
  $('red').onclick=()=>{S.red=!S.red;$('red').setAttribute('aria-pressed',S.red);upd();};
  $('prop').oninput=e=>{S.prop=+e.target.value;upd();};
  $('autoProp').onclick=()=>{const n=propNeeded();S.prop=n.load;$('prop').value=S.prop;upd();toast(n.fits?`Loaded ${S.prop} kg of propellant.`:'Loaded all the propellant that fits. It is still not enough: open “Show me how to fix this”.');};
  upd();bindNav('planning','review');
};

VIEW.review=()=>{
  const c=checks(),crit=c.filter(x=>x.crit),fails=crit.filter(x=>!x.ok).length;
  const row=x=>`<div class="chk"><span class="pill ${x.ok?'go':x.crit?'nogo':'warn'}">${x.ok?'Go':x.crit?'No go':'Caution'}</span><div><b>${x.name}</b><div class="dim" style="font-size:.88rem">${x.detail}${!x.ok&&x.fix?` <b style="color:var(--text)">Fix:</b> ${x.fix}`:''}</div>${x.ver?`<div class="ver">Verified by ${x.ver}</div>`:''}${howHtml(x,c.indexOf(x))}</div></div>`;
  main.innerHTML=head(5,'Technical review','Launch Readiness Board',fails?`The board found ${fails} critical problem${fails>1?'s':''}. Each one comes with a suggested fix.`:'Every critical check passes. Cautions will not stop the launch, but they show where the mission is likely to hurt.')+say('reyes',fails?'No-go items are not opinions. Fix them and come back.':`The board has no objections, and neither do I. Take ${S.name} to the pad.`)+`
  <section class="grid g2"><div class="panel"><p class="kicker">Critical checks</p>${crit.map(row).join('')}</div>
  <div class="panel"><p class="kicker">Cautions</p>${c.filter(x=>!x.crit).map(row).join('')}
    <div class="pair" id="pad3"><div><p class="kicker">${S.name}</p><div class="cvwrap"><canvas id="rvCraft"></canvas></div></div><div><p class="kicker">Folded inside the fairing</p><div class="cvwrap"><canvas id="rvRocket"></canvas></div></div></div>
    ${teach('Requirements, verification, margins and redundancy. Each requirement is listed with how it is checked, the way real review boards work.')}
    <div class="row"><button class="ghost" id="toPlan">Change trajectory</button><button class="ghost" id="toDesign">Change spacecraft</button><button class="ghost" id="gmat">Export flight plan for GMAT</button></div></div></section>
  ${navRow(true,'cruise','Launch',fails>0,fails?'Launch is blocked':'')}`;
  if(!view3('rvCraft','craft',craftOpts(),{w:1,h:1,spin:.3,pitch:.38})|!view3('rvRocket','rocket',{payload:craftOpts(),cutaway:true},{w:1,h:1,spin:.4,pitch:.12}))$('pad3').remove();
  bindHow(main);$('gmat').onclick=exportGmat;$('toPlan').onclick=()=>go('planning');$('toDesign').onclick=()=>go('design');
  $('back').onclick=()=>go('design');$('next').onclick=launch;
};

let launching=false;
async function launch(){
  if(launching)return;launching=true;setTimeout(()=>{launching=false;},4000);
  const d=design(),p=plan();
  S.fl={dep:S.dep,tr:p.tr,vh:p.vh,vt:p.vt,vc:p.vc,vesc:p.vesc,pen:p.pen,need:p.need,light:p.light,orbit:S.orbit,prop0:S.prop,wet0:d.wet,cost:d.cost,
    isp:tier('engine').isp,auto:tier('computer').auto,genM:d.genM,bus:d.bus,store:d.store,down:d.down,wh:d.wh,rel:d.rel,on:d.on};
  S.mass=d.wet;S.health=d.rel*100;S.calib=S.sel.thermal===0?.92:1;
  S.cr={tick:0,N:Math.round(p.tr.T/7),ev:{}};
  lg(`Launched ${dateStr(S.dep)} on a ${TR[S.transfer].n}, ${f0(d.wet)} kg, ${f1(d.cost)}M.`);
  const my=++RUN;
  await Cine.play('launch',{count:true,min:11,lines:[{who:'reyes',text:`${S.name}, you are go for launch.`},{who:'park',text:'Four thousand two hundred and twelve bolts. I counted twice.'},{text:'The rocket has one job: throw the spacecraft onto its path to Mars.'}]});
  if(my!==RUN)return;
  await Cine.play('depart',{lines:[{text:`${S.name} separates from the upper stage and unfolds its solar arrays.`},{who:'lind',text:`${f0(p.tr.T)} days to Mars. Kestrel made this trip too. Getting there was never the hard part.`},{text:'From here on, every change of speed comes out of your own propellant.'}]});
  if(my!==RUN)return;
  burn(p.pen);go('cruise');
}
function massFor(dv){return S.mass*(1-Math.exp(-dv/(S.fl.isp*G0)));}
function burn(dv){const m=Math.min(S.prop,massFor(dv));S.prop-=m;S.mass-=m;return m;}

/* ---------- cruise ---------- */
VIEW.cruise=()=>{
  const f=S.fl;
  main.innerHTML=head(6,'Interplanetary cruise','Spacecraft Operations Center',`${S.name} flies itself most of the way. Each tick of the clock is one week. You watch its health and step in when something goes wrong.`)+coach(['Watch the map and the telemetry. There is nothing to press until an alert appears.','When an alert appears, read it and choose. There is no timer unless it says so.','Three major problems strike during cruise: a solar storm, a course error and a rock on a collision path. <b>Fail one and the mission is lost.</b>'])+`
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="sys"></canvas></div><div id="prog"></div></div>
  <div class="grid"><div class="panel" id="livep"><p class="kicker">${S.name} · live view</p><div class="cvwrap"><canvas id="live"></canvas></div></div><div class="panel" id="tele"></div><div class="panel"><p class="kicker">Flight log</p><div class="log" id="clog"></div></div></div></section>`;
  if(!view3('live','craft',craftOpts(),{w:16,h:9,spin:.18,yaw:2.4,pitch:.3}))$('livep').remove();
  const c=cv('sys',460,460);
  const upd=()=>{const t=S.cr.tick*7,s=posAt(f.tr,Math.min(t,f.tr.T));
    drawSys(c,f.dep,f.tr,t);
    const ea=rad(Le(f.dep+t)),sa=rad(Le(f.dep))+s.nu,dist=Math.hypot(s.r*Math.cos(sa)-Math.cos(ea),s.r*Math.sin(sa)-Math.sin(ea))*AU;
    S.cr.v=s.v*1000;
    $('prog').innerHTML=meter(`Day ${Math.min(t,Math.round(f.tr.T))} of ${f0(f.tr.T)}`,Math.min(t,f.tr.T),f.tr.T,'days','ok');
    $('tele').innerHTML=`<p class="kicker">Telemetry</p><div class="tw"><table>
      <tr><th>Speed around the Sun</th><td class="num">${f1(s.v)} km/s</td></tr><tr><th>Distance from the Sun</th><td class="num">${f2(s.r)} AU</td></tr>
      <tr><th>Sunlight on the arrays</th><td class="num">${f0(100/(s.r*s.r))}%</td></tr><tr><th>Array output</th><td class="num">${f0(f.genM*RM*RM/(s.r*s.r)*S.degr)} W</td></tr>
      <tr><th>Signal delay to Earth</th><td class="num">${f1(dist/C_KMS/60)} min</td></tr><tr><th>Propellant</th><td class="num">${f0(S.prop)} kg</td></tr>
      <tr><th>Spacecraft health</th><td class="num">${f1(S.health)}%</td></tr></table></div>`;
    $('clog').innerHTML=S.log.slice().reverse().map(l=>`<div><b>›</b> ${l}</div>`).join('');chrome();};
  upd();
  (async()=>{const my=RUN,N=S.cr.N;
    while(S.cr.tick<N){
      await sleep(850);if(my!==RUN)return;
      S.cr.tick++;S.health-=.12;upd();
      const fr=S.cr.tick/N,ev=S.cr.ev;
      if(!ev.comm&&fr>=.18){ev.comm=1;await evComm();}
      else if(!ev.storm&&fr>=.34){ev.storm=1;await lethal('Solar storm',evStorm,'The proton storm burned through the flight computer’s memory. The spacecraft stopped answering.');}
      else if(!ev.main&&fr>=.5){ev.main=1;let q;const ok=await lethal('Off course',async()=>{q=await evOffCourse();return q.km<90000;},'The correction left the spacecraft more than 90,000 km wide of Mars, with no propellant plan that could bring it back.');if(my!==RUN)return;if(ok)await auraScene(q);}
      else if(!ev.rock&&fr>=.66){ev.rock=1;await lethal('Rock strike',evRock,'The rock went through the spacecraft at 12 kilometres per second.');}
      else if(!ev.power&&fr>=.82){ev.power=1;await evPower();}
      else await rollRandom(S.cr.v);
      if(my!==RUN)return;upd();
      if(S.dead)return go('debrief');
    }
    await Cine.play('arrival',{lines:[{text:`Day ${f0(f.tr.T)}. Mars is no longer a dot.`},{who:'reyes',text:'The braking burn happens behind the planet, out of contact. Whatever you programme is what flies.'},{text:`${S.name} is falling toward Mars at ${f2(f.vh)} km/s. That is too fast to be captured without the engine.`}]});
    if(my!==RUN)return;lg('Reached Mars approach.');S.reached=true;go('moi');
  })();
};

async function evComm(){
  const f=S.fl,delay=f1(f.light*.45);
  await ask({kicker:'Event · communication delay',title:'The spacecraft is not answering',body:`<p>A star-tracker calibration is due. You send the command and wait for the acknowledgement.</p>`,choices:[{label:'Send command'}]});
  await tell('Event · communication delay','Still nothing',`<p>The command is still on its way. Radio travels at the speed of light, and the spacecraft is now about ${delay} light-minutes from Earth. The reply needs the same time to come back.</p><p>Tomorrow a thruster test must start within 2 minutes of a navigation fix. A round trip takes ${f1(+delay*2)} minutes.</p>`,'Decide how to run it');
  const a=f.auto;
  const r=await ask({kicker:'Event · communication delay',title:'How do you run the thruster test?',choices:[
    {label:'Upload a time-tagged command sequence today',sub:'The spacecraft executes each step from its own clock.',value:'seq'},
    {label:'Let onboard autonomy trigger it',sub:`Your computer’s autonomy is ${['low','medium','high'][a]}.`,value:'auto'},
    {label:'Wait for the fix and command it live',sub:'Stay hands-on.',value:'live'}]});
  let got,msg;
  if(r==='seq'){got=10;msg='The sequence ran on time. This is how real deep-space missions operate: plan first, then let the spacecraft act.';}
  else if(r==='auto'){got=[4,8,10][a];msg=a?'The onboard software started the test at the right moment.':'A basic computer cannot judge the navigation fix. It started late and the test had to be repeated.';if(!a)burn(4);}
  else{got=1;msg='Your command arrived minutes too late. The test was scrubbed and repeated the next week, using extra propellant.';burn(8);S.health-=1.5;}
  pt('Communication delay',got,10);lg('Communication delay: '+msg);
  await tell('Outcome',got>=8?'Test complete':'Lesson learned',`<p>${msg}</p>${teach('Speed of light, radio communications, signal propagation, autonomous spacecraft systems.')}`);
}

function evOffCourse(){return new Promise(res=>{
  const f=S.fl,need={a:(Math.random()*2-1)*Math.PI,m:18+Math.random()*27};
  const nx=need.m*Math.cos(need.a),ny=need.m*Math.sin(need.a);
  const LIM=S.guided?75:40;let ang=0,mag=0,left=LIM,done=false;
  const o=document.createElement('div');o.className='overlay';
  o.innerHTML=`<div class="modal alert" role="dialog" aria-modal="true" style="max-width:760px"><p class="kicker">Main event · trajectory</p><h3>Off course</h3>
    ${say('reyes','Small errors grow over millions of kilometres. Fix it now, while it is cheap.')}<p>Tracking shows the spacecraft drifting away from its aim point. Left alone it will miss Mars by ${f0(need.m*9000)} km. Plan a correction burn before the window closes.</p>
    <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="cvwrap"><canvas id="bp"></canvas></div>
    <div class="grid" style="gap:10px"><label class="kicker" for="tang">Burn direction <span class="num" id="tangL"></span></label><input type="range" id="tang" min="-180" max="180" step="2" value="0">
      <label class="kicker" for="tmag">Burn size <span class="num" id="tmagL"></span></label><input type="range" id="tmag" min="0" max="80" step="1" value="0">
      <div id="tcmOut"></div>${f.auto===2?`<p class="teach"><b>Autonomous navigation suggests:</b> about ${Math.round(deg(need.a)/10)*10}° and ${Math.round(need.m/5)*5} m/s.</p>`:S.guided?`<p class="teach"><b>Navigation team hint:</b> set the direction near ${Math.round(deg(need.a)/20)*20}°, then grow the burn until the cross reaches the ring.</p>`:''}
      <button class="btn" id="tcmGo">Execute burn</button></div></div>
    <p class="dim" style="font-size:.85rem">Move the cross into the ring. A larger burn uses more propellant, so use only what you need.</p></div>`;
  document.body.appendChild(o);const c=cv('bp',300,300);
  const draw=()=>{const {ctx,w,h}=c,rx=nx-mag*Math.cos(rad(ang)),ry=ny-mag*Math.sin(rad(ang)),res_=Math.hypot(rx,ry),k=2.4;
    ctx.clearRect(0,0,w,h);ctx.strokeStyle='#3b2e27';ctx.lineWidth=1;for(let r=30;r<160;r+=30){ctx.beginPath();ctx.arc(150,150,r,0,7);ctx.stroke();}
    ctx.fillStyle='#b55a34';ctx.beginPath();ctx.arc(150,150,9,0,7);ctx.fill();
    ctx.strokeStyle='#86c994';ctx.lineWidth=2;ctx.beginPath();ctx.arc(150,150,16,0,7);ctx.stroke();
    const x=clamp(150+rx*k,8,292),y=clamp(150-ry*k,8,292);ctx.strokeStyle='#efe6d9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x+8,y);ctx.moveTo(x,y-8);ctx.lineTo(x,y+8);ctx.stroke();
    ctx.fillStyle='#a39686';ctx.font='10px "Martian Mono",monospace';ctx.fillText('Mars and capture ring',164,144);ctx.fillText('predicted arrival',Math.min(x+10,190),y-10);
    $('tangL').textContent=ang+'°';$('tmagL').textContent=mag+' m/s';
    $('tcmOut').innerHTML=meter('Window closes in',left,LIM,'s',left<10?'over':'warn')+`<p class="num" style="font-size:.8rem;margin-top:6px">Predicted miss ${f0(res_*9000)} km · propellant ${f1(massFor(mag))} kg</p>`;return res_;};
  $('tang').oninput=e=>{ang=+e.target.value;draw();};$('tmag').oninput=e=>{mag=+e.target.value;draw();};
  const fin=()=>{if(done)return;done=true;clearInterval(iv);const r=draw();o.remove();
    burn(mag);const km=r*9000;let q,got;
    if(km<8000){q=2;got=20;}else if(km<30000){q=1;got=13;}else if(km<90000){q=0;got=6;}else{q=0;got=0;}
    if(r>1)burn(r*1.5);
    pt('Off course',got,20);S.tcm={km,mag,clean:r>1?r*1.5:0};
    lg(`Off course: ${mag} m/s correction burn left a ${f0(km)} km miss${r>1?`, cleaned up later for another ${f0(r*1.5)} m/s`:''}.`);res({q,km});};
  const iv=setInterval(()=>{left-=1;if(left<=0)fin();else draw();},1000*DEMO.k);
  $('tcmGo').onclick=fin;draw();window.__tcm={need,set:(a,m)=>{ang=a;mag=m;draw();},fin};
});}

async function evPower(){
  const f=S.fl;S.degr=.82;
  const cruiseLoad=f.bus+30,gen=f.genM*S.degr,ok=gen>=cruiseLoad*1.15;
  const r=await ask({kicker:'Event · power degradation',cls:'alert',title:'A solar array string has failed',body:`<p>This is the same fault that ended Kestrel. Array output dropped 18% and will not recover. You are ${f2(posAt(f.tr,S.cr.tick*7).r)} AU from the Sun, where sunlight is already weaker than at Earth. Output is ${f0(gen)} W at Mars distance against a ${f0(cruiseLoad)} W cruise load.</p>`,choices:[
    {label:'Reduce instrument activity',sub:'Skip the remaining in-flight calibrations.',value:'inst'},
    {label:'Shut down nonessential systems',sub:'Turn off survival heaters you can spare and the backup radio.',value:'shut'},
    {label:'Enter power-conservation mode',sub:'Safest for the hardware. You lose a week of tracking data.',value:'safe'},
    {label:'Continue normal operations',sub:'Accept the risk and keep to the plan.',value:'go'}]});
  let got,msg;
  if(r==='inst'){got=7;S.calib-=.05;msg='Power held. The instruments arrive at Mars less well calibrated, which costs a little data quality.';}
  else if(r==='shut'){got=10;msg='Power held with margin, and nothing the mission needs was lost.';}
  else if(r==='safe'){got=ok?5:8;burn(15);msg='The spacecraft stayed safe. With a week of tracking missing, navigation needed an extra 15 m/s to tighten the approach.';}
  else if(ok){got=9;msg='Your arrays had enough margin to absorb the loss. Good design made this an easy call.';}
  else{got=0;S.health-=10;S.calib-=.05;msg='The battery drained during a manoeuvre and the spacecraft browned out. It recovered, with damage.';}
  pt('Power degradation',got,10);lg('Power degradation: '+msg);
  await tell('Outcome',got>=7?'Power stable':'Brownout',`<p>${msg}</p>${teach('Solar irradiance, the inverse-square law, power management, energy storage.')}`);
  if(S.quiz.sun===undefined)await quiz('sun','A spacecraft moves twice as far from the Sun. How much sunlight now reaches its solar arrays?',['Half as much','A quarter as much','The same amount'],1,'Light spreads over an area that grows with the square of the distance: 2 × 2 = 4 times the area, so a quarter of the power. This is the inverse-square law.');
}

/* ---------- random events ---------- */
const boltP=v=>SYS.structure.tiers[S.sel.structure].bolt*(1+S.loose*.25)/(6*Math.log(Math.max(v,12))/Math.log(11));
async function rollRandom(v){
  if(Math.random()<1e-6)return explode(false);
  if(Math.random()<boltP(v))return evBolt(v);
  if(Math.random()<1/20)return evLights();
  if(!S.toilet&&Math.random()<1/10){S.toilet=1;return lethal('Flood in Mission Control',evToilet,'Water reached the server room. The link to the spacecraft went dark and never came back.',false);}
}
async function evBolt(v){
  const a=S.fl?S.fl.auto:1,p=boltP(v);
  const r=await ask({kicker:`Random event · chance this tick ${f1(p*100)}%`,title:'A bolt fell out',body:`${say('park',`That leaves ${f0(4212-(++S.bolts))}. I am updating the spreadsheet.`)}<p>Vibration sensors report a fastener on the solar-array hinge has worked loose. The odds are 1 ÷ (6 × log₁₁ of your speed), adjusted for your structure, so slow spacecraft with light frames shed more bolts.</p>`,choices:[
    {label:'Re-seat it with the hinge motor',sub:`Free. ${[70,85,95][a]}% chance it works.`,value:'motor'},
    {label:'Fire thrusters to settle the array',sub:'Always works. Uses 3 kg of propellant.',value:'thr'},
    {label:'Ignore it',sub:'It is one bolt.',value:'no'}]});
  let got=4,msg;
  if(r==='motor'){if(Math.random()<[.7,.85,.95][a])msg='The hinge motor pulled the joint tight.';else{S.health-=2;got=3;msg='The motor stalled. The joint is stable but weakened.';}}
  else if(r==='thr'){const m=Math.min(3,S.prop);S.prop-=m;S.mass-=m;msg='A short thruster pulse settled the array.';}
  else{S.health-=4;S.loose++;got=0;msg='The array now rattles on every manoeuvre. More bolts are likely to follow.';}
  pt('A bolt fell out',got,4);lg('A bolt fell out. '+msg);toast(msg);
}
function evLights(){return new Promise(res=>{
  const t0=performance.now(),o=document.createElement('div');o.className='blackout';
  o.innerHTML=`<p>Lights shut off in Mission Control. Find the breaker.</p><button class="breaker" id="breaker" style="left:${8+Math.random()*70}%;top:${18+Math.random()*60}%">BREAKER</button>`;
  document.body.appendChild(o);
  o.onpointermove=e=>{o.style.setProperty('--mx',e.clientX+'px');o.style.setProperty('--my',e.clientY+'px');};
  $('breaker').focus();
  $('breaker').onclick=()=>{const s=(performance.now()-t0)/1000;o.remove();const got=s<6?3:s<14?2:1;pt('Lights shut off',got,3);
    lg(`Lights shut off. Breaker reset in ${f1(s)} s.`);toast(`Lights restored in ${f1(s)} seconds.`);res();};
});}
async function explode(demo){
  document.body.classList.add('shake');
  await Cine.play('explosion',{big:'Everything exploded',bigAt:.2,min:7,lines:[{text:'The odds of this were 1 in 1,000,000 per tick. Take a screenshot. Nobody will believe you.'},{who:'park',text:'…I counted those bolts.'}]});
  document.body.classList.remove('shake');
  await ask({kicker:'1 in 1,000,000',cls:'alert',title:'Everything exploded',body:'<p>There is no lesson here. Sometimes space just does this.</p>',choices:[{label:demo?'End the drill':'Go to debrief'}]});
  if(!demo){S.dead=true;S.health=0;S.fail.push('Spacecraft destroyed: everything exploded');lg('Everything exploded.');}
}

/* ---------- Mars orbit insertion ---------- */
VIEW.moi=()=>{
  const f=S.fl,my=RUN;
  if(!S.ckpt){const s=JSON.stringify(S);S.ckpt=s;}
  main.innerHTML=head(7,'Mars orbit insertion','Spacecraft Operations Center',`${S.name} is moving too fast for Mars to hold. Fire the engine near closest approach to drop below ${T('escape','escape speed')}. Burn too little and you fly straight past. Mars is ${f1(f.light)} light-minutes away, so this is really the sequence the spacecraft will fly alone.`)+coach(['Press <b>Start the approach</b> when you are ready.','Wait until the spacecraft enters the green zone.','<b>Hold</b> the engine button until the white speed marker sits inside the green band, then let go.'])+`
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="moiC"></canvas></div></div>
  <div class="panel"><p class="kicker">Burn control</p><div id="moiOut"></div>
    <button class="btn" id="fire" style="touch-action:none;user-select:none">Start the approach</button><p class="dim" style="font-size:.85rem">Mouse, touch or the space bar. Burning far from closest approach wastes almost half the thrust.</p>
    ${teach('Gravitational capture, orbital insertion, velocity changes, propulsion and delta-v.')}</div></section>`;
  const c=cv('moiC',520,340);
  let p=0,v=f.vh,firing=false,last=performance.now(),started=false;
  const DUR=S.guided?18:14,rate=(f.vh-f.vt)/4.5,drop=f.vh-f.vt,tol=(S.guided?.09:.04)*drop,cx=300,cy=185,rp=74,e=1.6;
  const pos=th=>{const r=rp*(1+e)/(1+e*Math.cos(th));return [cx+r*Math.sin(th),cy-r*Math.cos(th)];};
  const fb=$('fire');const begin=()=>{started=true;last=performance.now();fb.textContent='Hold to fire engine';};
  const on=b=>{if(!started){if(b)begin();return;}firing=b;};
  fb.onpointerdown=ev=>{ev.preventDefault();on(true);};fb.onpointerup=fb.onpointerleave=fb.onpointercancel=()=>on(false);
  const kd=ev=>{if(ev.code==='Space'){ev.preventDefault();on(true);}},ku=ev=>{if(ev.code==='Space')on(false);};
  addEventListener('keydown',kd);addEventListener('keyup',ku);
  const stop=()=>{removeEventListener('keydown',kd);removeEventListener('keyup',ku);};
  window.__moi={on,begin,get p(){return p},get v(){return v},vt:f.vt};
  const draw=()=>{const {ctx,w,h}=c;ctx.clearRect(0,0,w,h);
    const R=rng(3);ctx.fillStyle='rgba(239,230,217,.35)';for(let i=0;i<60;i++)ctx.fillRect(R()*w,R()*h,1,1);
    ctx.fillStyle='rgba(134,201,148,.16)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,150,-Math.PI/2-rad(44),-Math.PI/2+rad(44));ctx.fill();
    ctx.strokeStyle='#3b2e27';ctx.setLineDash([4,4]);ctx.beginPath();for(let i=0;i<=80;i++){const [x,y]=pos(rad(-100+200*i/80));i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.setLineDash([]);
    const g=ctx.createRadialGradient(cx-18,cy-18,6,cx,cy,60);g.addColorStop(0,'#e08a52');g.addColorStop(1,'#6a2c18');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,58,0,7);ctx.fill();
    const [x,y]=pos(rad(-100+200*clamp(p,0,1)));
    if(firing&&S.prop>0){ctx.fillStyle='#f2b84f';ctx.beginPath();ctx.arc(x,y,11,0,7);ctx.fill();}
    ctx.fillStyle='#efe6d9';ctx.beginPath();ctx.arc(x,y,5,0,7);ctx.fill();
    ctx.fillStyle='#a39686';ctx.font='10px "Martian Mono",monospace';ctx.fillText('efficient burn zone',cx-56,22);ctx.fillText('approach',18,cy+70);
    // speed gauge
    const lo=f.vt-drop*.25,hi=f.vh+drop*.05,gx=v_=>20+(v_-lo)/(hi-lo)*(w-40),gy=h-34;
    ctx.fillStyle='#0c0908';ctx.fillRect(20,gy,w-40,12);ctx.fillStyle='rgba(134,201,148,.8)';ctx.fillRect(gx(f.vt-tol),gy,gx(f.vt+tol)-gx(f.vt-tol),12);
    ctx.fillStyle='#ef5d52';ctx.fillRect(gx(f.vesc),gy-4,2,20);ctx.fillStyle='#efe6d9';ctx.fillRect(gx(v)-2,gy-7,4,26);
    ctx.fillStyle='#a39686';ctx.fillText('target',gx(f.vt)-18,gy+26);ctx.fillText('escape speed',gx(f.vesc)-34,gy-9);
  };
  const out=()=>{const win=Math.abs(p-.5)<.22;const msg=!started?'Read the steps, then start':p<.28?'Wait for the green zone':win?(v>f.vt+tol?'Hold the engine on':v>=f.vt-tol?'Let go now':'Too slow. Let go'):(v>f.vesc?'Keep burning. Still above escape speed':v>f.vt+tol?'Captured, but high. Burning now wastes thrust':'Coast');
    $('moiOut').innerHTML=`<p class="prompt ${msg.startsWith('Hold')||msg.startsWith('Keep')?'hot':msg.startsWith('Let')?'go':''}">${msg}</p><div class="row between"><span class="num" style="font-size:1.6rem">${f2(v)} km/s</span><span class="pill ${win?'go':'warn'}">${win?'Burn zone':p<.5?'Approaching':'Past closest approach'}</span></div>
    <p class="dim num" style="font-size:.72rem">Target ${f2(f.vt)} km/s · escape ${f2(f.vesc)} km/s</p>${meter('Propellant',S.prop,f.prop0,'kg',S.prop<20?'over':'ok')}${meter('Flyby progress',clamp(p,0,1)*100,100,'%','warn')}`;};
  (function fr(now){if(my!==RUN)return stop();
    const dt=Math.min(.1,(now-last)/1000)/Math.max(DEMO.k,.05);last=now;
    if(started){p+=dt/DUR;
      if(firing&&S.prop>0&&p<1){const eff=Math.abs(p-.5)<.22?1:.55,dvc=rate*dt,m=massFor(dvc*1000);
        if(m>=S.prop){v-=dvc*eff*S.prop/m;S.mass-=S.prop;S.prop=0;}else{S.prop-=m;S.mass-=m;v-=dvc*eff;}}}
    draw();out();chrome();
    if(p>=1){stop();return finishMoi(v,drop,tol);}
    requestAnimationFrame(fr);})(last);
};
async function finishMoi(v,drop,tol){
  const f=S.fl;let kind,title,msg;
  if(v>f.vesc){kind='fail';title='Flyby';msg=`At ${f2(v)} km/s the spacecraft was still above escape speed. Mars bent its path and let it go. It is now in orbit around the Sun.`;}
  else if(f.orbit==='direct'&&v<f.vc-.12){kind='fail';title='Atmospheric entry';msg='The burn ran long. The orbit’s low point dropped into the atmosphere and the spacecraft broke up.';}
  else if(v>f.vt+tol){kind='loose';title='Captured, but high';msg=`You are in orbit, though the burn fell short of the target. ${f.orbit==='aero'?'Aerobraking will take longer and cost another observation pass.':'The orbit is wider than planned, which lowers data quality.'}`;}
  else{kind='ok';title='Orbit achieved';msg=v<f.vt-tol?'Captured. The burn ran longer than needed, which spent propellant you did not have to use.':'A clean capture, right on the target speed.';}
  if(kind==='fail'&&title==='Flyby')await Cine.play('flyby',{big:'Flyby',bigAt:.6,lines:[{text:'The burn ends too early.'},{who:'reyes',text:'It is not slowing down. It is not going to stop.'},{text:`Mars bends ${S.name}’s path, and lets it go.`}]});
  else if(kind==='fail')await Cine.play('toodeep',{big:'Too deep',bigAt:.72,min:8,lines:[{text:'The burn ran long. The orbit’s low point dropped into the atmosphere.'}]});
  else await Cine.play('capture',{big:'Captured',bigAt:.78,lines:[{text:'Engine on. The spacecraft slips behind Mars.'},{who:'park',text:'Loss of signal, right on time. I hate this part.'},{text:'Nothing to do but wait.'},{who:'reyes',text:'Signal reacquired. We have an orbit.'}]});
  if(kind==='fail'){
    const r=await ask({kicker:'Hard failure',cls:'alert',title,body:`<p>${msg}</p>`,choices:[{label:'Retry the insertion',sub:'Costs 10 operational-performance points.',value:'retry'},{label:'Accept the result',sub:'Go to the debrief with a failed mission.',value:'acc'}]});
    if(r==='retry'){const n=S.retries+1,ck=S.ckpt;S=JSON.parse(ck);S.ckpt=ck;S.retries=n;return go('moi');}
    S.fail.push(title==='Flyby'?'Failed to enter Mars orbit':'Spacecraft lost during orbit insertion');lg('Orbit insertion failed: '+title.toLowerCase()+'.');return go('debrief');
  }
  S.orbitOK=true;pt('Orbit insertion',kind==='ok'?10:5,10);
  let passes=ORB[f.orbit].passes,q=ORB[f.orbit].q;
  if(kind==='loose'){if(f.orbit==='aero')passes--;else q*=.85;}
  const need=massFor(60);let trim='';
  if(S.prop<need){passes-=3;trim=' There is not enough propellant left to maintain the orbit, so the science phase ends three passes early.';S.prop=0;}else burn(60);
  if(f.orbit==='aero')msg+=' Over the next four months the spacecraft dips through the upper atmosphere hundreds of times, trading speed for heat until the orbit is low and circular.';
  lg(`Orbit insertion: ${title.toLowerCase()} at ${f2(v)} km/s.`+trim);
  S.ops={pass:1,N:Math.max(3,passes),q,region:'jezero',on:Object.fromEntries(f.on.map(k=>[k,true])),st:Object.fromEntries(f.on.map(k=>[k,'ok'])),
    bat:f.wh,store:[],sci:{},cnt:{},collected:0,delivered:0,lost:0,mode:'fifo',ev:{},lines:[],bonus:0};
  if(f.orbit==='aero')await Cine.play('aerobrake',{lines:[{text:'For four months the spacecraft skims the top of the atmosphere on every orbit.'},{who:'park',text:'Free braking. The air does the work, and the arrays take the heat.'},{text:'Each pass shaves the orbit lower, until it is close enough for science.'}]});
  await tell('Orbit insertion',title,`<p>${msg}${trim}</p>`,'Continue');
  if(S.quiz.capture===undefined)await quiz('capture','Why did the spacecraft have to fire its engine when it reached Mars?',['To speed up and catch Mars','To slow below escape speed, so that Mars’s gravity could hold it','To steer toward a landing site'],1,'It arrived faster than Mars’s escape speed. Without braking, gravity would only bend its path and let it leave again.');
  go('ops');
}

/* ---------- science operations ---------- */
const used=()=>S.ops.store.reduce((s,i)=>s+i.left,0);
function obsValue(r,k){const o=S.ops,n=(o.cnt[r+k]||0);return 10*REG[r].aff[k]*DIM[Math.min(n,DIM.length-1)]*o.q*S.calib*(o.st[k]==='deg'?.5:1);}
function downlink(cap){const o=S.ops;if(o.mode==='value')o.store.sort((a,b)=>b.val/b.size-a.val/a.size);let sent=0;
  while(cap>1e-9&&o.store.length){const it=o.store[0],t=Math.min(cap,it.left);it.left-=t;cap-=t;sent+=t;
    if(it.left<=1e-9){o.store.shift();o.delivered+=it.val;const key=it.r+it.k;o.sci[key]=(o.sci[key]||0)+it.val;}}return sent;}
VIEW.ops=()=>{
  const f=S.fl,o=S.ops,avail=f.genM*S.degr,act=f.on.filter(k=>o.on[k]&&o.st[k]!=='off');
  const load=f.bus+act.reduce((s,k)=>s+INST[k].power,0),deficit=load-avail,canPower=deficit<=0||o.bat>=deficit;
  const dataNow=act.reduce((s,k)=>s+INST[k].data,0),u=used(),R=REG[o.region];
  main.innerHTML=head(7,'Science operations','Mars orbit',`You have ${o.N} passes over Mars. On each one, choose a region and switch instruments on. Repeat looks at the same target are worth less each time.`)+(o.pass===1?say('lind','Three questions and a handful of passes. Kestrel’s echo came from under the north polar cap. I am not telling you where to point. I am only mentioning it.'):'')+qTrack()+`
  <section class="split"><div class="grid"><div class="panel"><div class="cvwrap"><canvas id="map"></canvas>
      ${Object.keys(REG).map(k=>`<button class="hot" data-r="${k}" aria-pressed="${o.region===k}" style="left:${(REG[k].lon+180)/3.6}%;top:${(90-REG[k].lat)/1.8+(k==='polar'?5:0)}%">${REG[k].n}</button>`).join('')}</div>
      <h3>${R.n}</h3><p>${R.d} <span class="dim">Look for: ${R.look}</span></p>
      <div class="tw"><table><tr><th>Instrument</th><th>Science fit here</th><th class="num">Passes so far</th><th class="num">Next is worth</th></tr>
      ${f.on.map(k=>`<tr><td>${INST[k].name}${o.st[k]!=='ok'?` <span class="pill ${o.st[k]==='off'?'nogo':'warn'}">${o.st[k]==='off'?'off':'degraded'}</span>`:''}</td><td><span class="pips">${[1,2,3,4,5].map(i=>`<i class="${R.aff[k]*5>=i-.01?'on':''}"></i>`).join('')}</span></td><td class="num">${o.cnt[o.region+k]||0}</td><td class="num">${o.st[k]==='off'?'0.0':f1(obsValue(o.region,k))}</td></tr>`).join('')}</table></div></div>
    <div class="panel"><p class="kicker">Operations log</p><div class="log">${o.lines.slice().reverse().map(l=>`<div><b>›</b> ${l}</div>`).join('')||'<div>No passes flown yet.</div>'}</div></div></div>
  <div class="panel sticky"><div class="row between"><p class="kicker">Pass ${o.pass} of ${o.N}</p><span class="pill info">Science delivered ${f1(o.delivered)}</span></div>
    <div class="choices">${f.on.map(k=>`<button class="opt" data-k="${k}" aria-pressed="${!!o.on[k]&&o.st[k]!=='off'}" ${o.st[k]==='off'?'disabled':''}><b>${INST[k].name}</b><span class="s">${INST[k].power} W · ${INST[k].data} Gb · ${INST[k].out}</span></button>`).join('')}</div>
    ${meter('Power draw',load,avail,'W')}${meter('Battery',o.bat,f.wh,'Wh',o.bat<f.wh*.25?'over':'ok')}
    ${meter('Storage after this pass',u+dataNow,f.store,'Gb')}
    <p class="dim num" style="font-size:.72rem">Downlink ${f.down} Gb per pass · order: ${o.mode==='value'?'most valuable first':'oldest first'}</p>
    <p class="dim" style="font-size:.86rem">${!canPower?'Not enough power or battery for this selection. Turn an instrument off.':deficit>0?`Draws ${f0(deficit)} Wh from the battery.`:u+dataNow>f.store?'Storage will overflow. Observations that do not fit are lost.':'Ready.'}</p>
    <button class="btn" id="exec" ${canPower?'':'disabled'}>${act.length?'Fly this pass':'Downlink only'}</button></div></section>`;
  drawMarsMap(cv('map',640,320));
  main.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{o.region=b.dataset.r;VIEW.ops();});
  main.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{o.on[b.dataset.k]=!o.on[b.dataset.k];VIEW.ops();});
  $('exec').onclick=async()=>{const my=RUN;
    if(deficit>0)o.bat-=deficit;else o.bat=Math.min(f.wh,o.bat-deficit*.6);
    let got=0,lost=0,space=f.store-used();
    for(const k of act){const val=obsValue(o.region,k),size=INST[k].data;
      if(size<=space+1e-9){o.store.push({r:o.region,k,size,left:size,val});space-=size;o.collected+=val;got+=val;o.cnt[o.region+k]=(o.cnt[o.region+k]||0)+1;}
      else{lost+=val;o.lost+=val;}}
    const b4=answered(),sent=downlink(f.down),af=answered();
    o.lines.push(`Pass ${o.pass}, ${R.n}: recorded ${f1(got)} science${lost?`, lost ${f1(lost)} to full storage`:''}, sent ${f1(sent)} Gb.`);
    o.pass++;S.health-=.3;
    await story(b4,af);if(my!==RUN)return;
    if(o.pass===4&&!o.ev.data){o.ev.data=1;await evData();}
    else if(o.pass===6&&!o.ev.opp){o.ev.opp=1;await evOpp();}
    else if(o.pass===8&&!o.ev.mal){o.ev.mal=1;await evMal();}
    else if(o.pass<=o.N)await rollRandom(3400);
    if(my!==RUN)return;
    if(S.dead)return go('debrief');
    if(o.pass>o.N){const b=used(),s=downlink(f.down*3),left=used();
      lg(`Science phase complete after ${o.N} passes.`);
      await tell('Stage 8 · final transmission','Sending it all home',`<p>The spacecraft turns its dish to Earth for an extended downlink. ${b<.01?'Storage was already empty.':`${f1(s)} Gb of the ${f1(b)} Gb backlog was transmitted.`}${left>.01?` ${f1(left)} Gb never left the spacecraft.`:''}</p>`,'Continue');
      await finale();if(my!==RUN)return;return go('debrief');}
    chrome();VIEW.ops();};
};
async function evData(){
  const f=S.fl,o=S.ops,u=used(),pct=u/f.store;
  const r=await ask({kicker:'Event · data overload',title:pct>.3?'More data than the radio can send':'A ground station outage',body:`<p>${pct>.3?`The instruments are filling storage faster than each pass can empty it. ${f1(u)} Gb is waiting, ${f0(pct*100)}% of capacity.`:'A Deep Space Network antenna is down for repairs, and mission planners want a policy for the backlog that will build.'}</p>`,choices:[
    {label:'Prioritise by science value',sub:'Send the most valuable data first and delete the least valuable quarter.',value:'pri'},
    {label:'Compress everything',sub:'Halves the size of stored data. Lossy: each product loses 15% of its value.',value:'zip'},
    {label:'Store it for later',sub:'Keep everything as it is and hope the downlink catches up.',value:'keep'}]});
  let got,msg;
  if(r==='pri'){o.mode='value';const s=o.store.slice().sort((a,b)=>a.val/a.size-b.val/b.size),n=Math.floor(s.length/4);s.slice(0,n).forEach(x=>{o.store.splice(o.store.indexOf(x),1);o.lost+=x.val;});got=pct>.3?10:7;msg=`Downlink now sends the best data first. ${n} low-value product${n===1?' was':'s were'} deleted.`;}
  else if(r==='zip'){o.store.forEach(x=>{x.left*=.5;x.val*=.85;});got=pct>.6?10:pct>.3?8:5;msg='Stored data was compressed. It will transmit twice as fast, at some cost in detail.';}
  else{got=pct<.35?10:pct<.7?5:2;msg=pct<.35?'There was room to spare, so keeping everything was the right call.':'Storage is still nearly full. New observations may not fit.';}
  pt('Data overload',got,10);lg('Data overload: '+msg);o.lines.push(msg);
  await tell('Outcome','Data policy set',`<p>${msg}</p>${teach('Data rates and bandwidth, scientific prioritisation.')}`);
}
async function evOpp(){
  const f=S.fl,o=S.ops,space=f.store-used(),up=k=>!!o.st[k]&&o.st[k]!=='off',img=up('cam')||up('spec'),big=o.bat>=150&&space>=6&&img,small=o.bat>=20&&space>=1&&up('mcs');
  const r=await ask({kicker:'Event · observation opportunity',title:'A dust storm is rising over Valles Marineris',body:`<p>The next orbit passes directly over a regional dust storm as it forms. Nobody planned for this. An extra observation needs power and storage you may want later. Battery ${f0(o.bat)} Wh, free storage ${f1(space)} Gb.</p>`,choices:[
    {label:'Image it with camera or spectrometer',sub:'150 Wh and 6 Gb.'+(img?'':' Neither instrument is available.'),value:'big',disabled:!img},
    {label:'Profile it with the atmospheric sounder',sub:'20 Wh and 1 Gb.'+(up('mcs')?'':' The sounder is not available.'),value:'small',disabled:!up('mcs')},
    {label:'Stay on the planned timeline',sub:'Protect your resources.',value:'skip'}]});
  let got,msg;
  if(r==='big'){if(big){o.bat-=150;const val=14*o.q*S.calib;o.store.push({r:'valles',k:up('cam')?'cam':'spec',size:6,left:6,val});o.collected+=val;got=10;msg='You caught the storm front crossing the canyon rim. A rare data set.';}
    else{S.health-=6;o.bat=Math.max(0,o.bat-150);got=2;msg='There was not enough battery or storage. The spacecraft dropped into safe mode and the images were lost.';}}
  else if(r==='small'){if(small){o.bat-=20;const val=7*o.q*S.calib;o.store.push({r:'valles',k:'mcs',size:1,left:1,val});o.collected+=val;got=big?8:10;msg='Temperature and dust profiles through a growing storm, for very little cost.';}
    else{got=3;msg='The sounder could not run. Nothing gained, nothing lost.';}}
  else{got=big||small?4:9;msg=big||small?'The storm passed unobserved. You had the resources to take it.':'You did not have the margin for it. Holding back protected the mission.';}
  pt('Observation opportunity',got,10);lg('Observation opportunity: '+msg);o.lines.push(msg);
  await tell('Outcome',got>=8?'Opportunity taken':'Opportunity passed',`<p>${msg}</p>${teach('Orbital coverage. A spacecraft only sees what is under its track, so chances like this do not repeat.')}`);
}
async function evMal(){
  const f=S.fl,o=S.ops,live=f.on.filter(k=>o.st[k]==='ok');if(!live.length)return;
  const k=live[Math.random()*live.length|0];
  const ok=await lethal('Instrument malfunction',()=>evPanel(INST[k].name),`A short in the ${INST[k].name.toLowerCase()} spread to the main power bus before it could be isolated.`);
  if(!ok)return;const msg=`The ${INST[k].name.toLowerCase()} was isolated, reset and brought back to full performance.`;
  lg('Instrument malfunction: '+msg);o.lines.push(msg);
  await tell('Outcome','Fault cleared',`<p>${msg}</p>${teach('Fault isolation, safing procedures, instrument calibration and limitations.')}`);
}

/* ============ major events: fail one and the mission is over ============
   Each minigame resolves true (survived) or false. Guided mode forgives one failure per mission. */
async function lethal(name,run,death,boom=true){
  for(;;){const n=S.P.length,ok=await run();if(ok)return true;
    if(S.guided&&!S.second){S.second=true;S.P.length=n;await tell('Guided mode · second chance',name,`<p>${death}</p><p>That would have ended the mission. Guided mode forgives one fatal mistake per flight, and this was it. Try again.</p>`,'Try again');continue;}
    S.dead=true;S.health=0;S.fail.push(name+'. '+death);lg(name+': '+death);
    if(boom)await Cine.play('explosion',{big:'Mission lost',bigAt:.25,min:6,lines:[{text:death},{who:'reyes',text:'Flight, we have lost the spacecraft. Lock the doors. Save the data.'}]});
    else await tell('Mission lost',name,`<p>${death}</p>`,'Go to debrief');
    return false;}}
function mgOpen(kicker,title,body,wide){const o=document.createElement('div');o.className='overlay';
  o.innerHTML=`<div class="modal alert mg" role="dialog" aria-modal="true" style="max-width:${wide||760}px"><p class="kicker">${kicker}</p><h3>${title}</h3>${body}</div>`;
  document.body.appendChild(o);SFX.alarm();return o;}
function mgTimer(el,secs,onEnd,label='Time left'){let left=secs;const draw=()=>{el.innerHTML=meter(label,Math.max(0,left),secs,'s',left<secs*.3?'over':'warn');};draw();
  const iv=setInterval(()=>{left-=1;draw();if(left<=0){clearInterval(iv);onEnd();}},1000*Math.max(DEMO.k,.02));return ()=>clearInterval(iv);}

/* 2. Solar storm: find the shelter. Every 5 g/cm² of material between the Sun and the computer halves the dose. */
function evStorm(){return new Promise(res=>{
  const h=3+(Math.random()*3|0),D0=25*2**h,need=5*h,flip=Math.random()<.5,A='Put the propellant tanks between the Sun and the computer',B='Turn the equipment-bay wall to the Sun';
  const opts=[{n:'Point the high-gain dish at the Sun',s:3,d:'A thin carbon-fibre reflector.'},{n:'Point the instrument deck at the Sun',s:8,d:'Optics and detectors take the hit first.'},
    {n:flip?A:B,s:need-3,d:flip?'Liquid propellant is a good proton absorber.':'Aluminium honeycomb and electronics boxes.'},{n:flip?B:A,s:need+1,d:flip?'Aluminium honeycomb and electronics boxes.':'Liquid propellant is a good proton absorber.'},
    {n:'Point the engine at the Sun and hide behind the thrust structure',s:need+12,d:'The thickest metal on board, but the solar arrays end up in shadow.',cost:1}].sort(()=>Math.random()-.5);
  const o=mgOpen('Major event · solar storm','Find the shelter',`${say('lind','That flare was aimed straight at us. The proton front reaches the spacecraft in under a minute.')}
    <p>Unshielded, the flight computer would absorb <b class="num">${D0} rad</b>. Its memory fails above <b class="num">25 rad</b>. Every <b class="num">5 g/cm²</b> of material between the Sun and the computer <b>halves</b> the dose:</p>
    <p class="formula">dose = ${D0} × 0.5<sup>(shielding ÷ 5)</sup></p>
    ${S.guided?`<p class="teach"><b>Hint:</b> halve ${D0} until you reach 25 and count the halvings. Each halving needs 5 g/cm².</p>`:''}
    <div id="mgT"></div><p class="kicker">Choose which way to turn the spacecraft</p>
    <div class="choices">${opts.map((x,i)=>`<button class="choice" data-i="${i}"><b>${x.n}</b><span>${x.d} Shielding in the way: <b class="num" style="color:var(--amber)">${x.s} g/cm²</b></span></button>`).join('')}</div>`);
  let done=false;const fin=async i=>{if(done)return;done=true;stop();o.remove();const x=opts[i],dose=x?D0*Math.pow(.5,x.s/5):D0,ok=dose<=25.001;
    if(ok){if(x.cost){S.health-=5;pt('Solar storm',9,15);}else pt('Solar storm',x.s<=need+2?15:12,15);}
    const msg=!x?'You ran out of time. The storm hit an unshielded spacecraft.':ok?(x.cost?`Dose ${f1(dose)} rad. The computer is safe, but the arrays sat in shadow and the battery ran deep. More shelter than you needed.`:`Dose ${f1(dose)} rad, just under the limit, with the arrays still in sunlight. The right shelter.`):`Dose ${f0(dose)} rad. That shelter needed ${need} g/cm² and had ${x.s}.`;
    lg('Solar storm: '+msg);await tell('Outcome',ok?'Storm weathered':'Not enough shielding',`<p>${msg}</p>${teach('Space radiation, shielding and half-value thickness, exponential decay.')}`);res(ok);};
  const stop=mgTimer(o.querySelector('#mgT'),S.guided?80:50,()=>fin(-1),'Proton front arrives in');
  o.querySelectorAll('.choice').forEach(b=>b.onclick=()=>fin(+b.dataset.i));
  window.__mini={solve:()=>fin(opts.findIndex(x=>x.s===need+1)),fail:()=>fin(opts.findIndex(x=>x.s===3))};
});}

/* 5. A rock on a collision path: F = 2·m·d ÷ t² for each thruster pair. */
function evRock(){return new Promise(res=>{
  const m=Math.round((S.mass||950)/10)*10,t=[20,25,30,40][Math.random()*4|0],R=[120,150,180][Math.random()*3|0],th=(.35+Math.random()*.85)*(Math.random()<.5?1:-1)+(Math.random()<.5?0:Math.PI);
  let dx=Math.round(-Math.sin(th)*R/10)*10,dy=Math.round(Math.cos(th)*R/10)*10;if(!dx)dx=30;if(!dy)dy=30;
  const D=Math.hypot(dx,dy),fx=2*m*Math.abs(dx)/(t*t),fy=2*m*Math.abs(dy)/(t*t),sg=v=>v>0?'+':'−';
  const o=mgOpen('Major event · collision warning','A rock is coming straight at you',`${say('reyes','Tracking has a boulder the size of a bus on a collision path. We cannot shoot it. We can only move.')}
    <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="cvwrap"><canvas id="rk"></canvas></div>
    <div class="grid" style="gap:8px"><p>To clear the rock’s path, navigation says: move <b class="num">${Math.abs(dx)} m</b> toward <b>${sg(dx)}X</b> and <b class="num">${Math.abs(dy)} m</b> toward <b>${sg(dy)}Y</b>. The thrusters fire for the whole <b class="num">t = ${t} s</b> before the rock arrives. Spacecraft mass <b class="num">m = ${f0(m)} kg</b>.</p>
      <p class="formula">d = ½ × (F ÷ m) × t² &nbsp; so &nbsp; F = 2 × m × d ÷ t²</p>
      ${S.guided?`<p class="teach"><b>Worked example for X:</b> 2 × ${f0(m)} × ${Math.abs(dx)} ÷ ${t}² = ${f0(fx)} N. Now do Y yourself.</p>`:''}
      ${['X','Y'].map(a=>`<div class="row thr"><span class="kicker">${a} thrusters</span><button class="ghost" data-dir="${a}" data-v="-1" aria-pressed="false">−${a}</button><button class="ghost" data-dir="${a}" data-v="1" aria-pressed="true">+${a}</button><input class="txt num" id="f${a}" type="number" min="0" max="5000" step="1" value="0" inputmode="numeric" aria-label="${a} thrust in newtons" style="width:7em"><span class="dim">N</span></div>`).join('')}
      <div id="mgT"></div><button class="btn" id="rkGo">Fire thrusters</button></div></div>
    <p class="dim" style="font-size:.85rem">Too little thrust and the rock hits. Extra thrust is safe but burns propellant you will want at Mars.</p>`,820);
  const dir={X:1,Y:1};o.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{dir[b.dataset.dir]=+b.dataset.v;o.querySelectorAll(`[data-dir="${b.dataset.dir}"]`).forEach(x=>x.setAttribute('aria-pressed',x===b));});
  const c=cv(o.querySelector('#rk'),300,300),k=300/(D*5.2),ux=Math.cos(th),uy=Math.sin(th);let anim=null,t0=performance.now(),done=false;
  const draw=now=>{if(!o.isConnected)return;const {ctx}=c,P=(x,y)=>[150+x*k,150-y*k];ctx.clearRect(0,0,300,300);
    ctx.strokeStyle='#3b2e27';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(150,10);ctx.lineTo(150,290);ctx.moveTo(10,150);ctx.lineTo(290,150);ctx.stroke();
    ctx.fillStyle='#a39686';ctx.font='10px "Martian Mono",monospace';ctx.fillText('+X',274,144);ctx.fillText('+Y',156,18);
    ctx.save();ctx.translate(150,150);ctx.rotate(-th);ctx.fillStyle='rgba(239,93,82,.16)';ctx.fillRect(-400,-D*.9*k,800,D*1.8*k);ctx.strokeStyle='rgba(239,93,82,.7)';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(-400,0);ctx.lineTo(400,0);ctx.stroke();ctx.restore();ctx.setLineDash([]);
    const [sx,sy]=P(dx,dy);ctx.strokeStyle='#86c994';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx,sy,9,0,7);ctx.stroke();ctx.fillStyle='#86c994';ctx.fillText('safe point',Math.min(sx+12,220),sy+4);
    const u=anim?Math.min(1,(now-anim.t0)/1600):0,far=anim?(1-u*1.35):.75+.2*Math.sin((now-t0)/500),rd=far*D*2.4,[rx,ry]=P(-ux*rd,-uy*rd);
    ctx.fillStyle='#b9a089';ctx.beginPath();ctx.arc(rx,ry,7,0,7);ctx.fill();ctx.fillStyle='#a39686';if(!anim)ctx.fillText('rock',rx+10,ry-8);
    const [px,py]=anim?P(anim.x*u*u,anim.y*u*u):[150,150];ctx.fillStyle='#efe6d9';ctx.fillRect(px-5,py-5,10,10);ctx.fillStyle='#8fc8da';ctx.fillRect(px-13,py-2,7,4);ctx.fillRect(px+6,py-2,7,4);
    if(anim&&u>=1){anim.end();return;}requestAnimationFrame(draw);};
  requestAnimationFrame(draw);
  const fin=(Fx,Fy)=>{if(done)return;done=true;stop();const ax=dir.X*Math.max(0,Fx)*t*t/(2*m),ay=dir.Y*Math.max(0,Fy)*t*t/(2*m),along=(ax*dx+ay*dy)/D,frac=along/D,ok=frac>=.9;
    o.querySelectorAll('button,input').forEach(x=>x.disabled=true);
    anim={t0:performance.now(),x:ax,y:ay,end:async()=>{o.remove();const dv=(Math.abs(Fx)+Math.abs(Fy))*t/m;if(S.fl)burn(dv);
      if(ok)pt('Rock on a collision path',frac<=1.3?15:10,15);
      const msg=ok?(frac<=1.3?`You moved ${f0(Math.hypot(ax,ay))} m and the rock passed ${f0(Math.abs(along))} m away. Clean, and cheap: ${f1(dv)} m/s.`:`You cleared it with room to spare, but ${f1(dv)} m/s of propellant is more than the dodge needed.`):`The thrusters moved the spacecraft ${f0(Math.max(0,along))} m out of the rock’s path. It needed ${f0(D)} m: X ${f0(fx)} N toward ${sg(dx)}X and Y ${f0(fy)} N toward ${sg(dy)}Y.`;
      lg('Collision warning: '+msg);await tell('Outcome',ok?'Rock avoided':'Impact',`<p>${msg}</p>${teach('Newton’s second law, constant acceleration (d = ½at²), thrust and impulse.')}`);res(ok);}};};
  const read=()=>fin(+o.querySelector('#fX').value||0,+o.querySelector('#fY').value||0);
  const stop=mgTimer(o.querySelector('#mgT'),S.guided?150:90,read,'Commit the burn within');
  o.querySelector('#rkGo').onclick=read;
  window.__mini={solve:()=>{dir.X=Math.sign(dx);dir.Y=Math.sign(dy);fin(Math.ceil(fx),Math.ceil(fy));},fail:()=>fin(0,0)};
});}

/* 3. The toilet in Mission Control exploded: P = ρ·g·h, and each full turn of the bolt holds 15 kPa. */
function evToilet(){return new Promise(res=>{
  const h=8+(Math.random()*13|0),P=9.81*h,per=15,need=Math.ceil(P/per),FILL=S.guided?75:45;
  const o=mgOpen('Major event · 1 in 10 · Mission Control','The toilet exploded',`${say('park','Second-floor toilet. The supply pipe let go and the water is heading for the server room. Here, take the wrench. I will get towels.')}
    <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)"><div class="cvwrap"><canvas id="wr"></canvas></div>
    <div class="grid" style="gap:8px"><p>The roof tank sits <b class="num">h = ${h} m</b> above the shut-off valve. Water pressure at the valve:</p>
      <p class="formula">P = ρ × g × h = 1,000 × 9.81 × h Pa${S.guided?` = ${f1(P)} kPa`:''}</p>
      <p>Each <b>full turn</b> of the bolt holds back <b class="num">${per} kPa</b>. Turn it until it holds the full pressure, then step back. More than <b>2 full turns</b> too many and the thread strips.</p>
      <p class="num" style="font-size:1.5rem" id="wrN">0 turns</p><div id="wrW"></div>
      <div class="row"><button class="btn" id="wrGo">Turn wrench ½</button><button class="ghost" id="wrDone">Step back: it should hold</button></div></div></div>`,780);
  const c=cv(o.querySelector('#wr'),260,220);let turns=0,water=0,done=false,last=performance.now(),shown=0;
  const fin=async(ok,why)=>{if(done)return;done=true;o.remove();if(ok)pt('The toilet exploded',turns<=need+.5?10:7,10);
    const msg=ok?`${turns} turns held ${f0(turns*per)} kPa against ${f1(P)} kPa. The leak stopped ${f0(100-water)}% short of the server room.`:why;
    lg('The toilet exploded. '+msg);await tell('Outcome',ok?'Leak contained':'Flooded',`<p>${msg}</p>${teach('Hydrostatic pressure (P = ρgh), units, torque and thread limits.')}`);res(ok);};
  const frame=now=>{if(done||!o.isConnected)return;const dt=Math.min(.1,(now-last)/1000)/Math.max(DEMO.k,.02);last=now;
    water+=dt/FILL*100*Math.max(.12,1-turns/need);shown+=(turns-shown)*.25;
    const {ctx}=c;ctx.clearRect(0,0,260,220);ctx.fillStyle='rgba(143,200,218,.25)';ctx.fillRect(0,220-water*2.2,260,water*2.2);
    ctx.save();ctx.translate(120,105);ctx.fillStyle='#5a4a40';ctx.beginPath();ctx.arc(0,0,46,0,7);ctx.fill();ctx.rotate(shown*Math.PI*2);
    ctx.fillStyle='#c6cad0';ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*30,Math.sin(a)*30);}ctx.fill();ctx.fillStyle='#16171b';ctx.fillRect(-3,-22,6,14);
    ctx.fillStyle='#ea6f3c';ctx.fillRect(22,-9,120,18);ctx.beginPath();ctx.arc(0,0,38,-.55,.55);ctx.lineTo(22,9);ctx.lineTo(22,-9);ctx.fill();ctx.restore();
    if(turns<need){ctx.fillStyle='rgba(143,200,218,.8)';for(let i=0;i<8;i++)ctx.fillRect(110+Math.sin(now/90+i)*26,150+((now/6+i*23)%70),3,7);}
    o.querySelector('#wrN').textContent=`${turns} turn${turns===1?'':'s'}`;o.querySelector('#wrW').innerHTML=meter('Water toward the server room',water,100,'%',water>70?'over':'warn');
    if(water>=100)return fin(false,`The water reached the servers. You had ${turns} turns on a bolt that needed ${need}.`);requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
  const turn=()=>{if(done)return;turns+=.5;SFX.blip(300+turns*20,.05,.04,'square');if(turns>need+2)fin(false,`${turns} turns. The thread stripped, the bolt sheared off and the pipe opened fully. It needed ${need}.`);};
  o.querySelector('#wrGo').onclick=turn;
  o.querySelector('#wrDone').onclick=()=>turns>=need?fin(true):fin(false,`${turns} turns hold ${f0(turns*per)} kPa. The pipe is at ${f1(P)} kPa, so it blew the valve back open. It needed ${need} turns.`);
  window.__mini={solve:()=>{turns=need;fin(true);},fail:()=>{turns=0;fin(false,'Drill failure.');}};
});}

/* 4. Instrument malfunction: flip every control that is lit green, and nothing else. */
function evPanel(name){return new Promise(res=>{
  const LAB=['BUS A','BUS B','HTR 1','HTR 2','DET PWR','FPA COOL','CAL LAMP','SHUTTER','DATA LNK','SAFE MODE','WDOG RST','RELOAD'],N=LAB.length,pick=new Set();while(pick.size<5)pick.add(Math.random()*N|0);
  const o=mgOpen('Major event · instrument malfunction',`${name} fault`,`<p>The ${name.toLowerCase()} is drawing too much current and dragging the power bus down with it. Run the isolation procedure before the bus trips.</p>
    <p><b>Switch every control that is lit green.</b> Touch nothing else: three wrong switches and the short spreads.</p>
    <div class="row between"><div id="mgT" style="flex:1;min-width:200px"></div><span class="pill warn" id="pnS">Wrong switches 0 / 3</span></div>
    <div class="cpanel">${LAB.map((l,i)=>`<button class="ctl ${i%2?'btnk':'lever'} ${pick.has(i)?'need':''}" data-i="${i}" aria-pressed="false"><i></i><span>${l}</span></button>`).join('')}</div>`,720);
  let strikes=0,done=false;const fin=ok=>{if(done)return;done=true;stop();setTimeout(()=>{o.remove();if(ok)pt('Instrument malfunction',strikes?10-strikes*2:10,10);res(ok);},ok?500:300);};
  const hit=i=>{if(done)return;const b=o.querySelector(`.ctl[data-i="${i}"]`);if(pick.has(i)){pick.delete(i);b.classList.remove('need');b.classList.add('ok');b.setAttribute('aria-pressed','true');SFX.blip(1100,.06);if(!pick.size)fin(true);}
    else if(!b.classList.contains('ok')){strikes++;b.classList.add('bad');SFX.blip(160,.2,.06,'square');o.querySelector('#pnS').textContent=`Wrong switches ${strikes} / 3`;if(strikes>=3)fin(false);}};
  o.querySelectorAll('.ctl').forEach(b=>b.onclick=()=>hit(+b.dataset.i));
  const stop=mgTimer(o.querySelector('#mgT'),S.guided?40:22,()=>fin(false),'Bus trips in');
  window.__mini={solve:()=>[...pick].forEach(hit),fail:()=>fin(false)};
});}

/* ---------- debrief ---------- */
function score(){
  const f=S.fl||{},o=S.ops||{delivered:0,collected:0,lost:0,sci:{},store:[]};
  const sci=(r,k)=>o.sci[r+k]||0,any=k=>Object.keys(REG).some(r=>sci(r,k)>0);
  const total=o.collected+o.lost;
  const obj=[['Reach Mars',!!S.reached,15],['Enter a stable orbit',!!S.orbitOK,25],['Collect atmospheric measurements',any('mcs'),15],
    ['Map selected surface regions',Object.keys(REG).filter(r=>sci(r,'cam')>0).length>=2,15],
    ['Investigate evidence of past water',sci('jezero','spec')>0||sci('valles','spec')>0||sci('polar','radar')>0||sci('jezero','radar')>0,15],
    ['Transmit data to Earth',total>0&&o.delivered/total>=.8,15]];
  const R=clamp(o.delivered/185*100,0,100),O=obj.reduce((s,x)=>s+(x[1]?x[2]:0),0);
  const lf=f.prop0?S.prop/f.prop0:1;
  const eff={Data:total?o.delivered/total:0,Propellant:S.orbitOK?(lf<=.2?1:1-(lf-.2)):.2,Budget:clamp(1-Math.max(0,(f.cost||BUDGET)-130)/50*.5,.5,1),Mass:clamp(1-Math.max(0,(f.wet0||MASS_CAP)-950)/250*.4,.6,1)};
  const E=Object.values(eff).reduce((s,x)=>s+x,0)/4*100;
  const pg=S.P.reduce((s,x)=>s+x.got,0),pm=S.P.reduce((s,x)=>s+x.max,0);
  const P=clamp((pm?pg/pm*100:0)-S.retries*10,0,100),L=clamp(S.health,0,100);
  const total_=.35*R+.25*O+.2*E+.1*P+.1*L;
  if(S.orbitOK&&o.delivered<=0&&!S.fail.includes('No science data reached Earth'))S.fail.push('No science data reached Earth');
  const cls=S.fail.length?['fail','Mission failed']:total_>=85?['good','Outstanding mission']:total_>=70?['good','Mission success']:total_>=50?['mid','Partial success']:['mid','Marginal mission'];
  return {R,O,E,P,L,S:total_,obj,eff,cls,sci,any};
}
VIEW.debrief=()=>{
  const sc=score(),f=S.fl,o=S.ops;
  try{const b=JSON.parse(localStorage.getItem('mcb-rf-best'));if(!b||sc.S>b.s)localStorage.setItem('mcb-rf-best',JSON.stringify({s:Math.round(sc.S),c:sc.cls[1]}));}catch(e){}
  const echo=o&&(o.sci.polarradar||0)>0;
  const epi=S.fail.length?say('reyes','We lost it. Read the flight log, find the decision that did it, and fly again. Every real mission team learns this way.'):echo?say('lind',`Kestrel’s echo was the floor of the polar ice: two kilometres of frozen water, layer on layer. It is going in the textbooks, with ${S.name}’s name on it.`):say('lind','Good data, and real answers. But Kestrel’s echo is still down there under the pole, unexplained. Next time, take the radar north.');
  const cats=[['R','Scientific return',35,sc.R,'Science value that reached Earth, against a strong mission’s 185'],['O','Objective completion',25,sc.O,'Six primary objectives'],
    ['E','Resource efficiency',20,sc.E,Object.entries(sc.eff).map(([k,v])=>`${k} ${f0(v*100)}`).join(' · ')],['P','Operational performance',10,sc.P,`${S.P.length} decisions${S.retries?`, ${S.retries} insertion retr${S.retries>1?'ies':'y'}`:''}`],['L','Reliability',10,sc.L,'Spacecraft health at end of mission']];
  const cmp=(title,k,region,sim,ref,cvId,quiz)=>`<div class="panel"><p class="kicker">${title}</p><div class="cvwrap"><canvas id="${cvId}"></canvas></div>
    <div class="two"><div class="sim"><p class="kicker" style="color:var(--rust)">Your simulated result</p><p style="font-size:.9rem">${sc.any(k)?sim:`No ${INST[k].name.toLowerCase()} data reached Earth, so this question stays open for your mission.`}</p></div>
    <div class="ref"><p class="kicker" style="color:var(--ice)">What NASA observed</p><p style="font-size:.9rem">${ref}</p></div></div>${quiz||''}</div>`;
  main.innerHTML=head(8,'Mission debrief','ASEA Science Operations Center',S.fail.length?'The mission did not end the way it was planned. Here is what happened, and what the data would have been compared against.':'The data is home. Here is how the mission scored, and how your simulated results line up with what real orbiters found.')+`
  <section class="panel"><div class="score"><div class="S num">${f0(sc.S)}</div><div class="grid" style="gap:8px">
    <span class="banner ${sc.cls[0]}">${sc.cls[1]}</span>
    <p class="num" style="font-size:.78rem">S = 0.35×${f0(sc.R)} + 0.25×${f0(sc.O)} + 0.20×${f0(sc.E)} + 0.10×${f0(sc.P)} + 0.10×${f0(sc.L)} = ${f1(sc.S)}</p>
    ${S.fail.length?`<div><p class="kicker" style="color:var(--bad)">Hard failures, reported separately from the score</p><ul class="plain">${S.fail.map(x=>`<li><span class="pill nogo">Failure</span> ${x}</li>`).join('')}</ul></div>`:'<p class="dim">No hard failures.</p>'}
    <p class="mono" style="color:var(--amber)">AURA ${f0(S.aura)}</p></div></div></section>
  ${epi}
  <section class="grid g2"><div class="panel"><p class="kicker">Score breakdown</p>${cats.map(c=>`<div class="cat"><span><b>${c[0]}</b> ${c[1]} <span class="dim">· ${c[2]}%</span></span><span class="num">${f0(c[3])}</span><div class="b"><i style="width:${c[3]}%"></i></div><span class="dim" style="font-size:.8rem;grid-column:1/-1">${c[4]}</span></div>`).join('')}</div>
    <div class="panel"><p class="kicker">Primary objectives</p>${sc.obj.map(x=>`<div class="chk"><span class="pill ${x[1]?'go':'nogo'}">${x[1]?'Done':'Missed'}</span><div>${x[0]} <span class="dim num">· ${x[2]} pts</span></div></div>`).join('')}
      <p class="kicker" style="margin-top:8px">Decisions under pressure</p><div class="tw"><table>${S.P.map(p=>`<tr><td>${p.name}</td><td class="num">${p.got} / ${p.max}</td></tr>`).join('')||'<tr><td class="dim">None recorded</td></tr>'}</table></div><p class="dim">Quick checks answered correctly: ${Object.values(S.quiz).filter(Boolean).length} of ${Object.keys(S.quiz).length}</p></div></section>
  <div><p class="kicker">Science results against NASA reference data</p><p class="dim" style="max-width:66ch">Curves marked as yours are generated by the game from what you observed. Reference curves and facts describe real findings from Mars Reconnaissance Orbiter and Mars Odyssey.</p></div>
  <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))">
    ${cmp('Question 1 · surface minerals','spec','jezero',`Your spectrometer returned ${f1(sc.sci('jezero','spec')+sc.sci('valles','spec')+sc.sci('polar','spec'))} science units. Dips near 1.9, 2.3 and 2.5 µm stand out over Jezero’s delta.`,
      'CRISM found clay minerals and carbonates in Jezero’s delta and along its rim. Both form in water, which is a large part of why the Perseverance rover was sent there.','cSpec',
      `<div class="row" id="quiz"><span class="dim" style="font-size:.88rem">Dips at 1.9 and 2.3 µm point to which mineral family?</span><button class="ghost" data-q="0">Basalt lava</button><button class="ghost" data-q="1">Water-formed clays</button><button class="ghost" data-q="0">Iron metal</button></div>`)}
    ${cmp('Question 2 · the atmosphere','mcs','valles',`Your profiler returned ${f1(sc.sci('jezero','mcs')+sc.sci('valles','mcs')+sc.sci('polar','mcs'))} science units of temperature, dust and water-vapour profiles.`,
      'Mars Climate Sounder profiles the atmosphere from the surface to about 80 km. During dust storms the middle atmosphere warms by tens of degrees as dust absorbs sunlight.','cMcs')}
    ${cmp('Question 3 · subsurface ice','radar','polar',`Your radar returned ${f1(sc.sci('jezero','radar')+sc.sci('valles','radar')+sc.sci('polar','radar'))} science units. Stacked reflectors under the polar cap mark layers of ice and dust.`,
      'SHARAD showed the north polar layered deposits are about 2 km thick and almost entirely water ice, and found buried glaciers at mid-latitudes under a blanket of rock debris.','cRad')}
    <div class="panel"><p class="kicker">Surface imaging</p><p style="font-size:.92rem" class="sim">${sc.any('cam')?`Your camera imaged ${Object.keys(REG).filter(r=>sc.sci(r,'cam')>0).map(r=>REG[r].n).join(', ')}.`:'No camera data reached Earth.'}</p>
      <p style="font-size:.92rem" class="ref">HiRISE resolves objects about a metre across from 300 km up. Mars Odyssey’s THEMIS maps surface temperature by day and night, which separates bare rock from dust.</p>
      <p class="kicker">Real archives to compare against</p><ul class="plain" style="font-size:.9rem"><li><a href="https://www.uahirise.org/">HiRISE image archive</a></li><li><a href="https://pds-geosciences.wustl.edu/missions/mro/">NASA PDS Geosciences Node: CRISM and SHARAD</a></li><li><a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons planetary positions</a></li><li><a href="https://www.nasa.gov/smallsat-institute">NASA Small Spacecraft Systems Virtual Institute: “Design and Develop Science Missions”</a></li><li><a href="https://www.nasa.gov/reference/systems-engineering-handbook/">NASA Systems Engineering Handbook</a></li><li><a href="https://sourceforge.net/projects/gmat/">GMAT, NASA’s open-source mission analysis tool</a></li><li>Planet maps in the 3D scenes: Mars by JPL/Caltech/USGS and Earth from NASA’s Blue Marble, as distributed with GMAT R2026a</li></ul>
      ${teach('Scientific interpretation, evidence, uncertainty.')}</div></section>
  <section class="grid g2"><div class="panel"><p class="kicker">Mission archive</p><div class="tw"><table>
    ${f?`<tr><th>Departure</th><td>${dateStr(f.dep)}, ${TR[S.transfer].n}, ${f0(f.tr.T)} days</td></tr><tr><th>Orbit plan</th><td>${ORB[f.orbit].n}</td></tr>
    <tr><th>Spacecraft</th><td>${S.name}, ${f0(f.wet0)} kg, ${f1(f.cost)}M, design reliability ${f1(f.rel*100)}%</td></tr><tr><th>Systems</th><td>${Object.keys(SYS).map(k=>tier(k).n).join(', ')}${S.red?', redundant critical components':''}</td></tr>
    <tr><th>Instruments</th><td>${f.on.map(k=>INST[k].name).join(', ')}</td></tr><tr><th>Propellant left</th><td>${f0(S.prop)} of ${f0(f.prop0)} kg</td></tr>`:''}
    ${o?`<tr><th>Science</th><td>${f1(o.delivered)} delivered, ${f1(o.lost)} lost on board</td></tr>`:''}</table></div>
    <div class="row"><button class="ghost" id="copy">Copy mission report</button><button class="ghost" id="gmat">Export flight plan for GMAT</button></div></div>
    <div class="panel"><p class="kicker">Flight log</p><div class="log" style="max-height:260px">${S.log.map(l=>`<div><b>›</b> ${l}</div>`).join('')}</div></div></section>
  <section class="panel" style="border-color:${S.fail.length?'var(--line)':'var(--rust)'}"><p class="kicker">${S.fail.length?'Locked':'Unlocked'}</p><h3>${S.fail.length?'Europa stays out of reach':'Mission 2: Beneath the Ice'}</h3>
    <p class="dim">${S.fail.length?'Complete The Red Frontier without a hard failure to open the Europa mission.':'Europa mission access, advanced propulsion and orbital-planning components, improved autonomy and new notebook entries. The Europa mission itself is not built yet.'}</p></section>
  <div class="nav"><span class="dim">Change one decision and see how the score moves.</span><button class="btn" id="again">Fly again</button></div>`;
  // charts
  const axes=(c,xl,yl)=>{const {ctx,w,h}=c;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#3b2e27';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(40,10);ctx.lineTo(40,h-28);ctx.lineTo(w-10,h-28);ctx.stroke();
    ctx.fillStyle='#a39686';ctx.font='10px "Martian Mono",monospace';ctx.textAlign='center';ctx.fillText(xl,w/2+15,h-6);ctx.save();ctx.translate(12,h/2-10);ctx.rotate(-Math.PI/2);ctx.fillText(yl,0,0);ctx.restore();ctx.textAlign='left';};
  const legend=(ctx,x,y,a,b)=>{ctx.font='10px "Martian Mono",monospace';ctx.fillStyle='#8fc8da';ctx.fillRect(x,y-4,14,2);ctx.fillText(a,x+20,y);ctx.fillStyle='#ea6f3c';ctx.beginPath();ctx.arc(x+7,y+13,2.5,0,7);ctx.fill();ctx.fillText(b,x+20,y+16);};
  const R=rng(99);
  {const c=cv('cSpec',420,210),{ctx,w,h}=c;axes(c,'wavelength, 1.0 to 2.6 µm','reflectance');
    const refl=x=>.62+.06*(x-1)-.1*Math.exp(-((((x-1.41)/.03))**2))-.2*Math.exp(-((((x-1.92)/.04))**2))-.17*Math.exp(-((((x-2.3)/.035))**2))-.13*Math.exp(-((((x-2.5)/.04))**2));
    const X=x=>40+(x-1)/1.6*(w-55),Y=v=>h-28-(v-.3)/.5*(h-45);
    ctx.strokeStyle='#8fc8da';ctx.lineWidth=1.6;ctx.beginPath();for(let x=1;x<=2.6;x+=.01){x===1?ctx.moveTo(X(x),Y(refl(x))):ctx.lineTo(X(x),Y(refl(x)));}ctx.stroke();
    const n=sc.sci('jezero','spec');if(n>0){const noise=.07/Math.sqrt(1+n/6);ctx.fillStyle='#ea6f3c';for(let x=1.02;x<2.6;x+=.035){ctx.beginPath();ctx.arc(X(x),Y(refl(x)+(R()-.5)*2*noise),2.2,0,7);ctx.fill();}}
    legend(ctx,52,22,'CRISM-style reference, Jezero delta',n>0?'your simulated spectrum':'no spectrum returned from Jezero');}
  {const c=cv('cMcs',420,210),{ctx,w,h}=c;axes(c,'temperature, 130 to 250 K','altitude, 0 to 80 km');
    const T=(z,d)=>215-1.15*z+(z>45?(z-45)*.35:0)+d*28*Math.exp(-((((z-28)/16))**2));
    const X=t=>40+(t-130)/120*(w-55),Y=z=>h-28-z/80*(h-45);
    ctx.lineWidth=1.6;ctx.strokeStyle='#8fc8da';ctx.beginPath();for(let z=0;z<=80;z+=2){z?ctx.lineTo(X(T(z,0)),Y(z)):ctx.moveTo(X(T(z,0)),Y(z));}ctx.stroke();
    ctx.setLineDash([4,3]);ctx.beginPath();for(let z=0;z<=80;z+=2){z?ctx.lineTo(X(T(z,1)),Y(z)):ctx.moveTo(X(T(z,1)),Y(z));}ctx.stroke();ctx.setLineDash([]);
    if(sc.any('mcs')){ctx.fillStyle='#ea6f3c';const d=sc.sci('valles','mcs')>0?.7:.1;for(let z=4;z<=78;z+=6){ctx.beginPath();ctx.arc(X(T(z,d)+(R()-.5)*7),Y(z),2.4,0,7);ctx.fill();}}
    legend(ctx,w-205,22,'reference: clear, dashed: dusty',sc.any('mcs')?'your simulated profile':'no profile returned');}
  {const c=cv('cRad',420,210),{ctx,w,h}=c;ctx.fillStyle='#0b0807';ctx.fillRect(0,0,w,h);
    const has=sc.sci('polar','radar')>0,surf=x=>38+Math.sin(x/60)*6+Math.sin(x/17)*2,base=x=>168+Math.sin(x/90)*8;
    for(let x=0;x<w;x+=2)for(let y=30;y<h-10;y+=2){const s=surf(x),b=base(x);let v=R()*.12;
      if(Math.abs(y-s)<2)v+=.9;else if(y>s&&y<b){const l=Math.sin((y-s)/((b-s)/11)*Math.PI);v+=Math.max(0,l)**6*(has?.6:.25);}if(Math.abs(y-b)<2)v+=has?.7:.3;
      ctx.fillStyle=`rgba(143,200,218,${Math.min(1,v)})`;ctx.fillRect(x,y,2,2);}
    ctx.fillStyle='#efe6d9';ctx.font='10px "Martian Mono",monospace';ctx.fillText('surface',8,24);ctx.fillText('ice and dust layers',8,104);ctx.fillText('base of the ice, about 2 km down',8,h-14);
    ctx.fillStyle='#a39686';ctx.textAlign='right';ctx.fillText(has?'simulated radargram, north polar cap':'reference only: no polar radar returned',w-8,24);ctx.textAlign='left';}
  const qz=$('quiz');if(qz)qz.querySelectorAll('button').forEach(b=>b.onclick=()=>{const ok=b.dataset.q==='1';qz.innerHTML=`<span class="pill ${ok?'go':'warn'}">${ok?'Correct':'Not quite'}</span><span style="font-size:.88rem">Clays hold water in their structure, and that water absorbs light near 1.9 µm. The 2.3 µm dip comes from iron and magnesium bonded to hydroxyl.</span>`;});
  $('gmat').onclick=exportGmat;
  $('again').onclick=()=>{S=fresh();go('title');};
  $('copy').onclick=async()=>{const t=`THE RED FRONTIER — mission report\nScore ${f1(sc.S)} (${sc.cls[1]})\nR ${f0(sc.R)}  O ${f0(sc.O)}  E ${f0(sc.E)}  P ${f0(sc.P)}  L ${f0(sc.L)}  Aura ${f0(S.aura)}\n${S.fail.length?'Hard failures: '+S.fail.join('; ')+'\n':''}\n${S.log.join('\n')}`;
    try{await navigator.clipboard.writeText(t);toast('Mission report copied.');}catch(e){toast('Copy was blocked by the browser.');}};
};

/* ============ notebook and demo controls ============ */
$('nbBtn').onclick=()=>{const seen=NB.filter(n=>STAGES.indexOf(n[0])<=S.max);
  ask({kicker:`Engineering notebook · ${seen.length} of ${NB.length} entries`,title:'Notebook',body:seen.length?`<div class="tw"><table>${seen.map(n=>`<tr><th style="white-space:nowrap">${n[1]}</th><td>${n[2]}</td></tr>`).join('')}</table></div>`:'<p class="dim">Entries appear as you reach each stage of a mission.</p>',choices:[{label:'Close'}]});};
$('demoBtn').onclick=async()=>{
  const r=await ask({kicker:'For demos and testing',title:'Demo controls',body:'<p class="dim">Trigger a random event or replay a cutscene. Drills do not count toward the mission. The bolt and lights events do.</p>',choices:[
    {label:'Solar storm (drill)',value:'storm'},{label:'Rock on a collision path (drill)',value:'rock'},{label:'The toilet exploded (drill)',value:'toilet'},{label:'Instrument malfunction (drill)',value:'panel'},{label:'A bolt fell out',value:'bolt'},{label:'Lights shut off',value:'lights'},{label:'Everything explodes (drill)',value:'boom'},{label:'Replay a cutscene',value:'cine'},{label:'Close',value:'x'}]});
  {const dr={storm:evStorm,rock:evRock,toilet:evToilet,panel:()=>evPanel('High-resolution camera')}[r];if(dr){const n=S.P.length,ok=await dr();S.P.length=n;toast(ok?'Drill passed.':'Drill failed. In a real mission that ends the flight.');}}
  if(r==='bolt')evBolt(S.cr&&S.cr.v||24000);if(r==='lights')evLights();if(r==='boom')explode(true);
  if(r==='cine'){const id=await ask({kicker:'Cutscenes',title:'Replay a cutscene',choices:Cine.scenes().map(x=>({label:x[0].toUpperCase()+x.slice(1),value:x}))});
    if(id==='aura')auraScene({q:2,km:1234});else Cine.play(id,{big:id,bigAt:.5,min:8,col:0x8fc8da,lines:[{text:'Cutscene preview.'}]});}
};

/* ============ GMAT export ============
   Writes the current flight plan as a script for NASA's General Mission Analysis Tool
   (https://sourceforge.net/projects/gmat/). It is a starting point: the departure burn is the game's
   patched-conic estimate and is not yet targeted, so in GMAT the spacecraft will pass near Mars's orbit
   rather than hit the planet until a Target sequence is added. */
function gmatScript(){
  const d=design(),f=S.fl||{dep:S.dep,tr:plan().tr,prop0:S.prop,wet0:d.wet},tr=f.tr,MU_E=398600.4415,r0=6378.14+185;
  const dv=Math.sqrt(tr.vinfDep**2+2*MU_E/r0)-Math.sqrt(MU_E/r0),dt=new Date(BASE+f.dep*DAY);
  const ep=`${String(dt.getUTCDate()).padStart(2,'0')} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()]} ${dt.getUTCFullYear()} 00:00:00.000`;
  let sc=S.name.replace(/[^A-Za-z0-9_]/g,'');if(!/^[A-Za-z]/.test(sc))sc='SC'+sc;
  return `%  Mission Control: Beyond - The Red Frontier
%  Flight plan for ${S.name}, exported from the game for GMAT (General Mission Analysis Tool).
%  ${TR[S.transfer].n}, departing ${dateStr(f.dep)}, planned flight time ${f1(tr.T)} days.
%
%  This is a starting point, not a finished design. The departure burn below is the game's
%  patched-conic estimate (${f2(dv)} km/s from a 185 km parking orbit, for a hyperbolic excess
%  speed of ${f2(tr.vinfDep)} km/s). The parking-orbit plane and the burn are not targeted, so add a
%  Target sequence (see the GMAT tutorial "Mars B-Plane Targeting") to make it reach Mars.

Create Spacecraft ${sc};
${sc}.DateFormat = UTCGregorian;
${sc}.Epoch = '${ep}';
${sc}.CoordinateSystem = EarthMJ2000Eq;
${sc}.DisplayStateType = Keplerian;
${sc}.SMA = ${f2(r0)};
${sc}.ECC = 0.0001;
${sc}.INC = 28.5;
${sc}.RAAN = 0;
${sc}.AOP = 0;
${sc}.TA = 0;
${sc}.DryMass = ${f0(f.wet0-f.prop0).replace(/,/g,'')};
${sc}.Tanks = {MainTank};

Create ChemicalTank MainTank;
MainTank.FuelMass = ${f0(f.prop0).replace(/,/g,'')};
MainTank.Volume = 1.0;

Create ForceModel NearEarth_FM;
NearEarth_FM.CentralBody = Earth;
NearEarth_FM.PrimaryBodies = {Earth};
NearEarth_FM.PointMasses = {Luna, Sun};
NearEarth_FM.Drag = None;
NearEarth_FM.SRP = Off;

Create ForceModel DeepSpace_FM;
DeepSpace_FM.CentralBody = Sun;
DeepSpace_FM.PointMasses = {Sun, Earth, Luna, Mars, Jupiter};
DeepSpace_FM.Drag = None;
DeepSpace_FM.SRP = Off;

Create Propagator NearEarth;
NearEarth.FM = NearEarth_FM;
NearEarth.Type = RungeKutta89;
NearEarth.InitialStepSize = 60;
NearEarth.Accuracy = 1e-11;
NearEarth.MaxStep = 600;

Create Propagator DeepSpace;
DeepSpace.FM = DeepSpace_FM;
DeepSpace.Type = PrinceDormand78;
DeepSpace.InitialStepSize = 600;
DeepSpace.Accuracy = 1e-11;
DeepSpace.MaxStep = 86400;

Create ImpulsiveBurn TOI;
TOI.CoordinateSystem = Local;
TOI.Origin = Earth;
TOI.Axes = VNB;
TOI.Element1 = ${dv.toFixed(4)};
TOI.Element2 = 0;
TOI.Element3 = 0;

Create CoordinateSystem SunEcliptic;
SunEcliptic.Origin = Sun;
SunEcliptic.Axes = MJ2000Ec;

Create OrbitView SolarSystemView;
SolarSystemView.Add = {${sc}, Earth, Mars, Sun};
SolarSystemView.CoordinateSystem = SunEcliptic;
SolarSystemView.ViewPointReference = Sun;
SolarSystemView.ViewPointVector = [0 0 500000000];
SolarSystemView.ViewDirection = Sun;
SolarSystemView.ViewUpCoordinateSystem = SunEcliptic;

Create ReportFile CruiseReport;
CruiseReport.Filename = '${sc}_cruise.txt';
CruiseReport.Add = {${sc}.UTCGregorian, ${sc}.Sun.RMAG, ${sc}.Mars.RMAG};

BeginMissionSequence;

Maneuver TOI(${sc});
Propagate NearEarth(${sc}) {${sc}.Earth.RMAG = 925000};
Propagate DeepSpace(${sc}) {${sc}.ElapsedDays = ${f1(tr.T)}};
`;}
async function exportGmat(){const t=gmatScript(),name=(S.name.replace(/[^A-Za-z0-9_]/g,'')||'mission')+'_red_frontier.script';
  try{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([t],{type:'text/plain'}));a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
    try{await navigator.clipboard.writeText(t);}catch(e){}toast(`Saved ${name}. Open it in GMAT with File, Open.`);}
  catch(e){try{await navigator.clipboard.writeText(t);toast('GMAT script copied. Paste it into a new GMAT script.');}catch(_){toast('The browser blocked the export.');}}}

/* ============ console sound (off until the player turns it on) ============ */
const SFX=(()=>{let ac=null,on=false,hum=null;try{on=localStorage.getItem('mcb-sfx')==='1';}catch(e){}
  const ctx=()=>{if(!ac){const C=window.AudioContext||window.webkitAudioContext;if(C)ac=new C();}return ac;};
  function blip(f=920,d=.05,v=.035,type='sine'){if(!on)return;try{const a=ctx();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+d);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+d+.03);}catch(e){}}
  function ambient(){try{const a=ctx();if(!a)return;if(a.state==='suspended')a.resume();if(hum){hum.gain.setTargetAtTime(on?.022:0,a.currentTime,.4);return;}if(!on)return;
    hum=a.createGain();hum.gain.value=0;const lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.value=220;lp.connect(hum);hum.connect(a.destination);
    for(const f of[55,82.7,110.4]){const o=a.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(lp);o.start();}hum.gain.setTargetAtTime(.022,a.currentTime,.8);}catch(e){}}
  return {blip,ambient,get on(){return on},set(v){on=v;try{localStorage.setItem('mcb-sfx',v?'1':'0');}catch(e){}ambient();},
    alarm(){blip(440,.22,.05,'square');setTimeout(()=>blip(330,.3,.05,'square'),240);}};})();
{const b=$('sfxBtn');if(b){const paint=()=>{b.textContent=SFX.on?'Sound on':'Sound off';b.setAttribute('aria-pressed',SFX.on);};paint();b.onclick=()=>{SFX.set(!SFX.on);paint();SFX.blip(1200,.08);};}
  addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('button');if(!t||t.id==='sfxBtn')return;SFX.ambient();SFX.blip(t.classList.contains('btn')?660:t.classList.contains('choice')?780:980,t.classList.contains('btn')?.09:.045);},true);
  const ck=$('clock');if(ck){const tk=()=>{ck.textContent='UTC '+new Date().toISOString().slice(11,19);};tk();setInterval(tk,1000);}}

/* ============ boot ============ */
BG=Models.backdrop($('bg'));if(!BG){const c=$('bg');if(c)c.remove();document.body.classList.add('nobg');}
function start(data){
  if(data&&data.stage){S=data;RUN++;chrome();setScene(S.stage);VIEW[S.stage]();}
  else go('title');
}
/* back-to-top button: appears once the page has been scrolled a screen down */
{const tb=$('topBtn');if(tb){const sh=()=>tb.classList.toggle('show',scrollY>innerHeight*.6);addEventListener('scroll',sh,{passive:true});sh();
  tb.onclick=()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}
window.__game={get S(){return S},DEMO,go,plan,design,checks,bestDep,gmatScript};
window.claude?.hot?.snapshot?.(()=>S);
if(window.claude?.hot?.ready)window.claude.hot.ready(()=>start(window.claude.hot.data??{}));else start({});
