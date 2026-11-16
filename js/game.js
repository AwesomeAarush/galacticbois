"use strict";
/* ============ constants and physics ============ */
const AU=1.495978707e8, MU=1.32712440018e11, G0=9.80665, RM=1.5237;
const VE=Math.sqrt(MU/AU), VM=Math.sqrt(MU/(RM*AU)), NE=0.9856474, NM=0.5240208;
const MU_M=42828.4, R_MARS=3389.5, C_KMS=299792.458;
const BASE=Date.UTC(2028,5,1), DAY=864e5, HORIZON=1560; /* about two Mars launch windows */
const MASS_CAP=1200, BUDGET=180;
/* Every price in the game is in millions of dollars, so 180 is shown as $180M. */
const money=m=>'$'+(Number.isInteger(m)?m.toLocaleString('en-US'):m.toFixed(1))+'M';
/* Launch sites. Earth spins fastest at the equator (465.1 m/s x cos latitude), and a rocket launched east keeps that
   speed for free, so a site nearer the equator lifts more. Baikonur's rockets also cannot fly due east (populated
   areas and drop zones lie along that track), so they launch at 51.6° or more and lose part of even that boost.
   The latitudes, spin speeds and lowest practical orbit tilts (inc, used in the GMAT export) are real; the masses
   and costs are tuned for the game. The site no longer changes the spacecraft's own speed change: Earth's spin
   helps the rocket, which shows up as how much it lifts. */
const SITES={kourou:{n:'Kourou',where:'French Guiana',lat:5.2,inc:6,cap:1250,cost:9,dv:0,tint:0x4f6a4a,d:'Almost on the equator.'},
  canaveral:{n:'Cape Canaveral',where:'Florida, USA',lat:28.5,inc:28.5,cap:1200,cost:0,dv:0,tint:0x5a5a5a,d:'The standard choice.'},
  baikonur:{n:'Baikonur',where:'Kazakhstan',lat:45.6,inc:51.6,cap:1120,cost:-7,dv:0,tint:0x8a7a5a,d:'Cheap, but far north.'}};
const site=()=>SITES[S.site]||SITES.canaveral, cap=()=>site().cap, spin=s=>465.1*Math.cos(rad(s.lat));
const rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
const wrap=a=>((a+180)%360+360)%360-180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const jd=d=>(BASE+d*DAY-Date.UTC(2000,0,1,12))/DAY;
/* ---------- NASA GMAT data (js/gmat_data.js, made by tools/gmat_pipeline.py) ----------
   Earth and Mars positions for every day of the calendar, and for every launch day inside a window an
   Earth-to-Mars transfer that GMAT targeted to reach Mars and propagated in 2-day steps. Without the file
   the game falls back to its own circular-orbit model. Positions are in AU, Sun-centred ecliptic of J2000. */
const GM=(()=>{const D=window.GMAT_DATA;if(!D)return null;
  const dec=t=>{const b=atob(t),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Int16Array(u.buffer);};
  const E=dec(D.eph),s0=D.meta.ephStart,n=D.meta.ephDays,T={};
  for(const k in D.trans){T[k]={};for(const c of D.trans[k])T[k][c.d]=c;}
  const pos=(d,b)=>{const x=Math.max(0,Math.min(n-1.001,d-s0)),i=Math.floor(x),f=x-i,o=b*3,a=i*6+o,c=a+6;return [0,1,2].map(j=>(E[a+j]+(E[c+j]-E[a+j])*f)*1e-4);};
  const path=c=>{if(!c._p){const v=dec(c.p),pts=[];for(let i=0;i<v.length;i+=4)pts.push([v[i]*1e-4,v[i+1]*1e-4,v[i+2]*1e-4,v[i+3]/100]);c._p=pts;}return c._p;};
  /* spacecraft state t days after departure, interpolated between GMAT's 2-day points */
  const at=(c,t)=>{const P=path(c),x=Math.max(0,Math.min(P.length-1.001,t/D.meta.step)),i=Math.floor(x),f=x-i,a=P[i],b=P[i+1];return a.map((v,j)=>v+(b[j]-v)*f);};
  return {meta:D.meta,pos,lon:(d,b)=>{const p=pos(d,b);return Math.atan2(p[1],p[0])*180/Math.PI;},get:(k,d)=>(T[k]||{})[Math.round(d)]||null,path,at};})();
const Le=d=>GM?GM.lon(d,0):100.464+NE*jd(d), Lm=d=>GM?GM.lon(d,1):355.453+NM*jd(d);
const dateStr=d=>new Date(BASE+d*DAY).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
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
/* Orbiter instruments. More are offered than the mission needs, and the bridge under the spacecraft has six
   mounting positions, so the player has to choose. Each entry carries its own guide (what it does, how it
   works, what it measures, why it matters, limits) and the capabilities the objective panel reads (cap).
   Masses, powers and resolutions are close to the real instruments named in "tag" (HiRISE 65 kg and 60 W,
   CRISM 33 kg, THEMIS 11 kg, MOLA 26 kg, Odyssey GRS 30 kg, MARIE 3 kg); costs, data volumes and reliabilities
   are game values. */
const INST={
  cam:{name:'High-resolution camera',tag:'HiRISE-type',mass:65,cost:28,power:60,data:8,rel:.96,res:'0.3 m per pixel, 6 km swath',out:'Surface images',
    cap:{img:.3},teach:'Image resolution, planetary geology, remote sensing',
    g:{what:'A large telescope camera that photographs the ground in fine detail.',how:'A 0.5 m mirror focuses light onto a long strip of detectors. As the orbiter moves, the strip sweeps out a picture line by line.',
      meas:'Pictures of the surface at 0.3 m per pixel, in stereo when two passes overlap, so slopes can be measured.',why:'Boulders and slopes a lander would hit are only a meter or two across. You need this scale to judge a landing site.',
      lim:'Narrow: one image covers a strip 6 km wide, so mapping a whole region takes many passes. Produces the most data of any instrument here. Sees only the surface, not what it is made of.'}},
  ctx:{name:'Context camera',tag:'CTX-type',mass:4,cost:6,power:7,data:3,rel:.98,res:'6 m per pixel, 30 km swath',out:'Wide surface images',
    cap:{img:6},teach:'Mapping, image scale',
    g:{what:'A small wide-angle camera for regional maps.',how:'A short telescope and a single line of detectors, swept along by the orbit like a push-broom.',
      meas:'Black-and-white pictures 30 km wide at 6 m per pixel.',why:'Shows the layout of a region: channels, craters, the delta fan, sand fields. Cheap, light and easy on the radio.',
      lim:'At 6 m per pixel a 2 m boulder is smaller than one pixel, so it cannot tell a safe landing spot from a boulder field.'}},
  spec:{name:'Imaging spectrometer',tag:'CRISM-type',mass:33,cost:22,power:45,data:6,rel:.94,res:'18 m per pixel, 0.36 to 3.9 µm',out:'Mineral spectra',
    cap:{min:18,nir:true},teach:'Electromagnetic spectrum, absorption spectra, mineral identification',
    g:{what:'A camera that splits reflected sunlight into hundreds of narrow colors.',how:'A grating spreads the light out like a prism. Each mineral absorbs some colors more than others, leaving dips in the spectrum.',
      meas:'A spectrum for every 18 m pixel in 544 colors, from visible light (0.36 µm) to 3.9 µm in the near infrared.',why:'Clays and other minerals that form in water have dips near 1.9 and 2.3 µm. This is how orbiters find where water once was.',
      lim:'Needs sunlight, so it works only on the day side. Dust coatings hide the rock underneath. Cooled detectors limit how long it can run.',draw:'spectrum'}},
  tes:{name:'Thermal emission imager',tag:'THEMIS-type',mass:11,cost:9,power:14,data:2,rel:.97,res:'100 m per pixel, 6.8 to 14.9 µm',out:'Surface temperature and thermal minerals',
    cap:{min:100,therm:true,atmNadir:true},teach:'Thermal inertia, infrared emission',
    g:{what:'An infrared camera that measures how warm the ground is, day and night.',how:'Rock holds heat longer than sand or dust, so it stays warmer after sunset. That property is called thermal inertia. Some minerals also glow more weakly at certain infrared colors.',
      meas:'Surface temperature at 100 m per pixel, a rough estimate of how rocky the ground is, and broad mineral groups such as olivine-rich basalt, quartz-rich rock and chloride salts.',why:'Tells bedrock from loose sand across a whole region, and adds a second, independent look at minerals.',
      lim:'Coarse: one 100 m pixel blurs together the layers in the delta. Cannot see the 1.9 and 2.3 µm water bands, which lie in the near infrared. Atmospheric temperatures come out only in broad layers.'}},
  mcs:{name:'Atmospheric profiler',tag:'MCS-type',mass:9,cost:10,power:11,data:1,rel:.98,res:'5 km vertical layers, 0 to 80 km',out:'Temperature, dust and water-vapor profiles',
    cap:{atm:true},teach:'Atmospheric pressure, temperature profiles, planetary climate',
    g:{what:'An instrument that looks sideways through the atmosphere at the horizon.',how:'Looking at the edge of the planet, its telescopes see the air in thin layers. Infrared channels read temperature, dust and water vapor in each layer.',
      meas:'Profiles of temperature, dust and water vapor from the ground to about 80 km, in 5 km layers.',why:'Weather and climate: how dust storms grow, how seasons move water between the poles. Also the forecast a landing team watches.',
      lim:'Says nothing about the surface or what lies under it. Coarse sideways resolution, about 100 km.'}},
  radar:{name:'Shallow subsurface radar',tag:'SHARAD-type',mass:15,cost:14,power:20,data:3,rel:.95,res:'15 m vertical, to about 1 km deep',out:'Subsurface reflections',
    cap:{sub:true},teach:'Radar reflection, wave propagation, subsurface exploration',
    g:{what:'A radar that listens for echoes from layers buried under the surface.',how:'A 10 m antenna sends radio pulses down. Each boundary between materials, ice over rock for example, reflects a little energy back. Later echoes come from deeper layers.',
      meas:'Echo strength against delay, which becomes depth: layers down to about 1 km, 15 m apart.',why:'The only way here to find buried ice and to see how deep it goes.',
      lim:'Cannot tell what a layer is made of, only that a boundary exists. Rough surfaces scatter the signal. Needs a long, clear antenna on the spacecraft.'}},
  grs:{name:'Gamma-ray and neutron spectrometer',tag:'GRS-type',mass:30,cost:16,power:32,data:.5,rel:.96,res:'about 300 km footprint, top 1 m',out:'Hydrogen and element abundances',
    cap:{hyd:true},teach:'Cosmic rays, neutron spectroscopy',
    g:{what:'A detector that counts gamma rays and neutrons coming up from the ground.',how:'Cosmic rays hit the surface and knock out neutrons. Hydrogen, mostly in water ice, slows those neutrons, so fewer fast neutrons escape where there is ice.',
      meas:'How much hydrogen sits in the top meter of the ground, plus elements such as iron, potassium and chlorine.',why:'Mapped buried ice across whole latitudes on Mars Odyssey.',
      lim:'Each reading averages an area about 300 km across, larger than Jezero Crater. Sees only the top meter. Heavy, and needs a boom to keep the spacecraft’s own signal out.'}},
  alt:{name:'Laser altimeter',tag:'MOLA-type',mass:26,cost:12,power:34,data:.5,rel:.95,res:'spots every 300 m, 1 m vertical',out:'Topography and regional slopes',
    cap:{topo:true},teach:'Laser ranging, topography',
    g:{what:'A laser that measures the height of the ground under the spacecraft.',how:'It fires short laser pulses and times their return. Half the round trip times the speed of light is the distance.',
      meas:'Ground height every 300 m along track, accurate to about 1 m. Regional slopes over kilometers.',why:'Elevation maps, crater depths, the height of the delta scarp, and the slope a lander faces over long distances.',
      lim:'Misses everything between its 300 m spots, so it cannot see boulders or short steep slopes. Lasers wear out with use.'}},
  mag:{name:'Magnetometer',tag:'MAG/ER-type',mass:5,cost:5,power:4,data:.2,rel:.98,res:'about 1 nT',out:'Crustal magnetic fields',
    cap:{magf:true},teach:'Planetary magnetism',
    g:{what:'A sensor that measures magnetic fields.',how:'Coils on a boom respond to the strength and direction of the local field. The boom keeps it away from the spacecraft’s own currents.',
      meas:'The magnetic field along the orbit, to about one nanotesla.',why:'Mars lost its global field billions of years ago, but parts of the old crust are still magnetized. That history matters for how Mars lost its atmosphere.',
      lim:'Says nothing about minerals, ice, weather or landing hazards. Readings are noisy unless the boom is long.'}},
  rad:{name:'Radiation monitor',tag:'MARIE-type',mass:3,cost:3,power:7,data:.1,rel:.97,res:'particle counts every 30 s',out:'Radiation dose and solar particle alerts',
    cap:{radm:true},teach:'Space radiation',
    g:{what:'A particle detector that measures the radiation hitting the spacecraft.',how:'Charged particles leave a trail of charge as they pass through stacked silicon detectors. Counting and sizing those trails gives the dose.',
      meas:'Dose rate from cosmic rays and from solar particle events, in cruise and in orbit.',why:'Crew safety. It also sees a solar proton storm build before the worst of it arrives, which buys time to turn the spacecraft.',
      lim:'Measures where the spacecraft is, not on the surface. Adds nothing to the science questions.'}}
};
const IK=Object.keys(INST),SLOTS=6,PAYLOAD_KG=150; /* six positions on the instrument bridge, 150 kg payload allocation */
const IDRAW={cam:'pixels',ctx:'pixels',spec:'spectrum',radar:'echo',tes:'thermal',alt:'laser'};
IK.forEach(k=>{const i=INST[k],g=i.g;Help.add('i:'+k,{t:i.name,sub:i.tag+' · orbiter instrument',rows:[['What it does',g.what],['How it works',g.how],['What it measures',g.meas],['Why it matters',g.why],['Limitations',g.lim]],
  spec:[['Mass',i.mass+' kg'],['Power',i.power+' W'],['Data',i.data+' Gb per pass'],['Resolution',i.res],['Cost',money(i.cost)],['Reliability',Math.round(i.rel*100)+'%']],drawNow:IDRAW[k]});});
/* Mission 1 objectives, stated as measurements. The payload panel lists what each chosen instrument contributes;
   it never says whether that is enough. */
const OBJM1=[{id:'surf',q:'What is the surface made of?',where:'Jezero Crater',need:'Mineral maps sharp enough to separate layers in a 2 km wide delta, at wavelengths where water-bearing minerals show (near 1.9 and 2.3 µm).'},
  {id:'atm',q:'How does the atmosphere vary?',where:'North polar cap',need:'Temperature, dust and water vapor from the ground up to about 80 km, layer by layer.'},
  {id:'ice',q:'Is there ice under the surface?',where:'North polar cap',need:'A measurement that reaches hundreds of meters below the surface and shows how deep the layers go.'},
  {id:'site',q:'Where should the surface crew land?',where:'Jezero Crater',need:'Boulders and slopes at the scale of a meter or two, near each candidate site.'}];
function coverage(id){const on=IK.filter(k=>S.inst[k]),L=[];const n=k=>INST[k].name;
  for(const k of on){const c=INST[k].cap;
    if(id==='surf'&&c.min)L.push(`${n(k)}: minerals at ${c.min} m per pixel${c.nir?', near infrared':', thermal infrared only'}`);
    if(id==='atm'&&c.atm)L.push(`${n(k)}: 5 km layers, 0 to 80 km`);if(id==='atm'&&c.atmNadir)L.push(`${n(k)}: temperature in broad layers, looking straight down`);
    if(id==='ice'&&c.sub)L.push(`${n(k)}: echoes to about 1 km deep`);if(id==='ice'&&c.hyd)L.push(`${n(k)}: hydrogen in the top 1 m, 300 km footprint`);
    if(id==='site'&&c.img)L.push(`${n(k)}: ${c.img} m per pixel`);if(id==='site'&&c.topo)L.push(`${n(k)}: heights every 300 m`);if(id==='site'&&c.therm)L.push(`${n(k)}: rockiness at 100 m per pixel`);}
  return L;}
const SYS={
  structure:{label:'Structure',why:'Carries every other part. Lighter frames save mass but shake loose more easily.',tiers:[
    {n:'Lightweight composite',mass:150,cost:16,rel:.95,bolt:1.6,s:'bolt risk ×1.6'},
    {n:'Aluminum honeycomb',mass:220,cost:10,rel:.97,bolt:1,s:'baseline'},
    {n:'Reinforced frame',mass:300,cost:10,rel:.99,bolt:.5,s:'bolt risk ×0.5'}]},
  power:{label:'Solar arrays',why:'Sunlight at Mars is 43% as strong as at Earth, so arrays deliver far less there.',tiers:[
    {n:'Compact arrays',mass:60,cost:9,w:650},{n:'Standard arrays',mass:100,cost:16,w:1000},{n:'Large arrays',mass:150,cost:25,w:1500}]},
  battery:{label:'Battery',why:'Keeps the spacecraft alive in Mars’s shadow and covers short bursts above array output.',tiers:[
    {n:'Small pack',mass:30,cost:4,wh:200},{n:'Medium pack',mass:50,cost:8,wh:700},{n:'Large pack',mass:80,cost:13,wh:1300}]},
  comms:{label:'Communications',why:'A bigger dish focuses the signal, so more data reaches Earth on each pass.',tiers:[
    {n:'1 m dish',mass:25,cost:6,power:20,down:6},{n:'2 m high-gain dish',mass:45,cost:12,power:40,down:14},{n:'3 m high-gain dish',mass:80,cost:20,power:70,down:30}]},
  engine:{label:'Propulsion',why:'Higher specific impulse (Isp) gets more velocity change from each kilogram of propellant.',tiers:[
    {n:'Monopropellant',mass:50,cost:8,isp:230,rel:.99,s:'Isp 230 s, simple'},{n:'Bipropellant',mass:80,cost:17,isp:320,rel:.97,s:'Isp 320 s, complex'},{n:'High-performance bipropellant',mass:95,cost:27,isp:329,rel:.96,s:'Isp 329 s, the best flown'}]},
  computer:{label:'Computing and data',why:'More autonomy means the spacecraft can protect itself while Earth is minutes away.',tiers:[
    {n:'Basic computer',mass:10,cost:5,power:10,store:16,auto:0,rel:.95},{n:'Standard computer',mass:18,cost:10,power:20,store:40,auto:1,rel:.97},
    {n:'Autonomous computer',mass:30,cost:18,power:35,store:90,auto:2,rel:.985}]},
  thermal:{label:'Thermal control',why:'Instruments drift out of calibration when they run too hot or too cold.',tiers:[
    {n:'Passive blankets',mass:15,cost:3,power:0,rel:.93,s:'calibration −8%'},{n:'Heaters and louvres',mass:30,cost:6,power:25,rel:.97},{n:'Active fluid loop',mass:45,cost:11,power:40,rel:.99}]}
};
/* Oxygen systems, picked while building. Each one trades mass, power, cost and water against how long
   the crew can breathe. Oxygen is a percentage of the system's supply (1 point = 1 percent) and drain is
   the percent used each week. The rates and masses are tuned for the game, not for real life-support hardware:
   a real person uses about 0.84 kg of oxygen a day (NASA), so stored oxygen alone for three people on a
   250-day cruise would be about 630 kg before tanks. */
const OXY={
  tanks:{n:'Stored oxygen tanks',mass:45,cost:4,power:4,drain:2.6,water:0,backup:8,
    d:'Tanks of gas. Simple and light, but the supply is fixed and every day eats into it.',s:'light · cheap · fixed supply'},
  regen:{n:'Regenerative life support',mass:95,cost:14,power:120,drain:.9,water:-.5,backup:5,
    d:'Breathed-out carbon dioxide is turned back into water (a Sabatier reactor) and electrolysis splits that water into oxygen, as on the Space Station. Draws power, recycles water and makes the supply last.',s:'lasts long · draws power'},
  elec:{n:'Water electrolysis',mass:70,cost:9,power:190,drain:1.5,water:1.4,backup:6,
    d:'Electricity splits water into oxygen and hydrogen. Light on mass, heavy on power and water.',s:'needs water · needs power'},
  hybrid:{n:'Hybrid with backup',mass:125,cost:20,power:110,drain:1.1,water:-.1,backup:18,
    d:'A small regenerator plus stored tanks as an emergency reserve. Forgiving, heavy and costly.',s:'backup reserve · heavy · costly'}
};
const oxyOf=k=>OXY[k]||OXY.regen;
const TR={hohmann:{n:'Hohmann transfer',Q:RM,cost:0,d:'Minimum energy. Leaves Earth’s orbit on a tangent and arrives half an orbit later.'},
          fast:{n:'Fast transfer',Q:1.56,cost:8,d:'A bigger launch vehicle (costs $8M more) throws you harder. Shorter cruise, but you arrive faster and must brake more.'}};
const ORB={aero:{n:'Low orbit by aerobraking',d:'Capture into a long ellipse, then skim the upper atmosphere for months to shrink it. Cheap on propellant, costs one observation pass.',passes:9,q:1},
           ellip:{n:'Stay in the capture ellipse',d:'Same small burn, no aerobraking. You are far from the surface most of the time, so data quality drops 40%.',passes:10,q:.6},
           direct:{n:'Direct to 300 km circular',d:'One large burn straight into the science orbit. Full quality from day one, very propellant-hungry. Needs a light spacecraft and the high-performance engine.',passes:10,q:1}};
const REG={
  jezero:{n:'Jezero Crater',lon:77.5,lat:18.4,d:'A 45 km crater that once held a lake. A river delta is still visible on its western edge.',
    look:'Mineral composition and evidence of past water.',aff:{cam:.9,spec:1,mcs:.5,radar:.4,ctx:.55,tes:.6,grs:.15,alt:.35,mag:.1,rad:.05}},
  valles:{n:'Valles Marineris',lon:-59.2,lat:-13.9,d:'A canyon system over 4,000 km long and up to 7 km deep. Its walls expose kilometers of layered rock.',
    look:'Geological layers, erosion and surface structure.',aff:{cam:1,spec:.7,mcs:.6,radar:.6,ctx:.65,tes:.5,grs:.2,alt:.6,mag:.2,rad:.05}},
  polar:{n:'North polar cap',lon:0,lat:80,d:'Stacked layers of water ice and dust, topped by a seasonal coat of carbon-dioxide frost.',
    look:'Water ice, atmospheric interactions and climate history.',aff:{cam:.6,spec:.6,mcs:1,radar:1,ctx:.4,tes:.55,grs:.7,alt:.45,mag:.15,rad:.05}}
};
const DIM=[1,.6,.35,.2,.1,.05];
const STAGES=['title','briefing','planning','design','review','cruise','moi','ops','site','debrief','m2brief','m2prep','rover','outpost','m2debrief'];
/* Science and build are one stage: what you want to learn drives the hardware you build. */
const TRACKS={1:[['briefing','Briefing'],['planning','Trajectory'],['design','Design'],['review','Review'],['cruise','Cruise'],['moi','Mars'],['site','Site'],['debrief','Debrief']],
  2:[['m2brief','Briefing'],['m2prep','Rover'],['rover','Expedition'],['outpost','Outpost'],['m2debrief','Debrief']]};
const track=()=>TRACKS[S.mission||1],stageIdx=st=>track().findIndex(t=>t[0]===st||(t[0]==='moi'&&st==='ops'));
/* campaign progress and the saved game, both kept in this browser */
const store={get(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},del(k){try{localStorage.removeItem(k);}catch(e){}}};
let CAMP=store.get('mcb-campaign')||{};
const saveCamp=()=>store.set('mcb-campaign',CAMP);
const saveGame=()=>{if(S.stage==='title')return;if(/debrief$/.test(S.stage))return store.del('mcb-save');store.set('mcb-save',S);};
const NB=[
 ['briefing','Mars','Radius 3,390 km, about half of Earth. Gravity is 38% of Earth’s. The air is mostly carbon dioxide at under 1% of Earth’s surface pressure.'],
 ['briefing','Water history','Dry river valleys, deltas and water-altered minerals show that liquid water flowed on Mars more than 3 billion years ago.'],
 ['briefing','Past vs present habitability','A place that could once have supported life is not the same as a place that can today. Orbiters look for evidence of the first.'],
 ['briefing','Mission segments','NASA splits a science mission into four parts: launch (the rocket), space (the spacecraft and instruments), ground (control rooms and antennas) and user (the scientists who use the data).'],
 ['briefing','Concept of operations','A time-ordered story of how the whole system will be used, written before the design. It drives the requirements and is what the finished mission is checked against.'],
 ['briefing','The design process','Identify the need and goals, define the concept, define requirements, design, build and verify, then implement. This game follows the same six steps.'],
 ['design','Begin with the end in mind','Start from the data the scientists need at the end, then work backwards to the instruments, power, storage and downlink that get it there.'],
 ['design','Remote sensing','Measuring something without touching it, by recording light or radio waves that it reflects or emits.'],
 ['design','Absorption spectrum','Minerals absorb specific wavelengths. The pattern of dips in reflected light works like a fingerprint.'],
 ['design','Radar sounding','Radio pulses bounce off boundaries between materials. The echo delay gives the depth of each layer.'],
 ['planning','Heliocentric orbit','A path around the Sun. Earth laps Mars about every 780 days, which sets how often launch windows open.'],
 ['planning','Hohmann transfer','The lowest-energy route between two circular orbits: half an ellipse that touches both.'],
 ['planning','Launch window','You aim at where Mars will be on arrival day, so you can only leave when the planets are lined up correctly.'],
 ['planning','Delta-v','The total change in velocity a spacecraft can make. Every maneuver spends some of it.'],
 ['design','Rocket equation','Δv = Isp × g₀ × ln(wet mass ÷ dry mass). Each extra kilogram of hardware needs more propellant to move it.'],
 ['design','Power budget','Total generation must cover every system that is switched on, with margin for degradation.'],
 ['design','Redundancy','Carrying a spare of a critical part. It costs mass and money, but one failure of that part no longer ends the mission.'],
 ['planning','GMAT','NASA’s open-source General Mission Analysis Tool. Mission designers use it to compute and optimize real trajectories. The planet positions and transfer paths in this game were computed with it, and you can export your flight plan as a GMAT script from the review board.'],
 ['review','Requirements and verification','Every requirement is written together with the way it will be checked: by test, analysis, inspection or demonstration. A requirement you cannot verify is only a wish.'],
 ['planning','Launch site','Earth spins fastest at the equator: 465 m/s. A rocket launched east keeps that speed for free, so sites near the equator lift more.'],
 ['planning','Spacecraft and launch vehicle','The launch vehicle is the rocket. It lifts the spacecraft off Earth and is then thrown away. The spacecraft is what travels on to Mars.'],
 ['cruise','Life support','Each person uses about 0.84 kg of oxygen, 2.4 kg of drinking and food-preparation water and 0.6 kg of dry food a day (NASA figures). Recycling water and air is what makes a long trip possible.'],
 ['cruise','Light-time delay','Radio travels at 299,792 km/s. Earth to Mars takes 3 to 22 minutes one way, depending on where the planets are, so joystick control is impossible.'],
 ['cruise','Inverse-square law','Sunlight intensity falls with the square of distance. At 1.52 AU you get 1 ÷ 1.52² = 43% of the power.'],
 ['cruise','Trajectory correction','Small burns during cruise remove aiming errors. The earlier you correct, the less propellant it costs.'],
 ['moi','Orbit insertion','Arriving spacecraft move faster than Mars’s escape velocity. An engine burn at closest approach slows them enough to be captured.'],
 ['moi','Aerobraking','Dipping into the upper atmosphere on each orbit uses drag instead of propellant to lower the orbit.'],
 ['ops','Data rate','Instruments can record far more than the radio can send. What gets transmitted is a science decision.'],
 ['ops','Fault management','When hardware misbehaves, operators trade the chance of recovery against the risk of making it worse.'],
 ['debrief','Evidence and uncertainty','One observation suggests. Repeated observations with different instruments make a case.']
];

/* ============ state ============ */
function fresh(){return {stage:'title',max:0,mission:1,site:'canaveral',inst:Object.fromEntries(IK.map(k=>[k,false])),
  sel:{structure:1,power:1,battery:1,comms:1,engine:1,computer:1,thermal:1},oxy:'regen',red:false,prop:250,
  dep:0,transfer:'hohmann',orbit:'aero',P:[],log:[],aura:0,health:0,retries:0,loose:0,fail:[],degr:1,calib:1,name:'Wayfarer',guided:true,quiz:{},bolts:0};}
let S=fresh(), RUN=0, DEMO={k:1};
const sleep=ms=>new Promise(r=>setTimeout(r,ms*DEMO.k));
const $=id=>document.getElementById(id);
const main=$('main');

function plan(){
  const tr0=transfer(TR[S.transfer].Q), d=S.dep;
  const miss=wrap(Lm(d+tr0.T)-(Le(d)+deg(tr0.nu)));
  const g=GM&&GM.get(S.transfer,d),tr=g?Object.assign({},tr0,{T:g.tof,gm:{k:S.transfer,d,c3:g.c3,vinf:g.vinf,dth:g.dth}}):tr0;
  const pen=10*miss*miss;
  const rp=R_MARS+300, vh=Math.sqrt(tr.vinf**2+2*MU_M/rp), ae=(rp+R_MARS+45000)/2;
  const vell=Math.sqrt(MU_M*(2/rp-1/ae)), vc=Math.sqrt(MU_M/rp), vesc=Math.sqrt(2*MU_M/rp);
  const vt=S.orbit==='direct'?vc:vell, moi=(vh-vt)*1000;
  const ea=rad(Le(d+tr.T)), ma=rad(Lm(d+tr.T));
  const dist=GM?Math.hypot(...[0,1,2].map(j=>GM.pos(d+tr.T,1)[j]-GM.pos(d+tr.T,0)[j]))*AU:Math.hypot(RM*Math.cos(ma)-Math.cos(ea),RM*Math.sin(ma)-Math.sin(ea))*AU;
  return {tr,miss,pen,feasible:Math.abs(miss)<=10,vh,vt,vc,vesc,moi,trim:100+site().dv,need:40+pen+moi+60+site().dv,dist,light:dist/C_KMS/60};
}
function bestDep(){let b=0,bm=1e9;for(let d=0;d<=HORIZON;d++){const o=S.dep;S.dep=d;const m=Math.abs(plan().miss);S.dep=o;if(m<bm){bm=m;b=d}}return b;}
/* A launch window is the set of days when Mars will be in the right place on arrival day. scanWindows()
   walks the calendar once with the same plan() the screen uses, so the windows always match the numbers
   shown to the player. */
function scanWindows(){const o=S.dep,out=[];let st=null;
  for(let d=0;d<=HORIZON;d++){S.dep=d;const open=Math.abs(plan().miss)<=10;if(open&&st===null)st=d;if(!open&&st!==null){out.push([st,d-1]);st=null;}}
  if(st!==null)out.push([st,HORIZON]);S.dep=o;return out;}
/* Pick one window and one day in it. Called once when a new mission starts, then saved with the rest of
   the state, so refreshing the page never rerolls the date. */
/* In a race every player must get the same launch day and the same cruise events, so those rolls come from the
   race seed (keyed by what they decide). Outside a race they are ordinary random numbers. */
function srnd(key){if(!S.race)return Math.random;let h=S.race.seed|0;for(const ch of key)h=Math.imul(h^ch.charCodeAt(0),16777619);return rng(h);}
function pickWindow(){const rs=scanWindows(),R=srnd('window');
  if(!rs.length){S.dep=bestDep();return;}
  const r=rs[Math.floor(R()*rs.length)],span=r[1]-r[0];
  S.dep=r[0]+Math.floor(R()*(span+1));}
function windowOf(d){const open=x=>{const o=S.dep;S.dep=x;const m=Math.abs(plan().miss);S.dep=o;return m<=10;};
  if(open(d)){let a=d,b=d;while(a>0&&open(a-1))a--;while(b<HORIZON&&open(b+1))b++;return [a,b,`${b-a+1} days long. Any date inside it works.`];}
  for(let x=d+1;x<=HORIZON;x++)if(open(x)){let e=x;while(e<HORIZON&&open(e+1))e++;return [x,e,`This date is outside a window. The next one opens on ${dateStr(x)}.`];}
  for(let x=d-1;x>=0;x--)if(open(x)){let a=x;while(a>0&&open(a-1))a--;return [a,x,`This date is outside a window. The last one closed on ${dateStr(x)}.`];}
  return [0,0,'No window is open for this route in the next two years.'];}

/* The three science questions the payload exists to answer, and the instrument that answers each one. */
const tier=k=>SYS[k].tiers[S.sel[k]];
function design(){
  const on=IK.filter(k=>S.inst[k]);
  let dry=0,cost=TR[S.transfer].cost+S.prop*.02+site().cost;
  for(const k in SYS){dry+=tier(k).mass;cost+=tier(k).cost;}
  for(const k of on){dry+=INST[k].mass;cost+=INST[k].cost;}
  const ox=oxyOf(S.oxy);dry+=ox.mass;cost+=ox.cost;
  if(S.red){dry+=45;cost+=12;}
  const wet=dry+S.prop, genE=tier('power').w, genM=genE/(RM*RM);
  const bus=150+ox.power+tier('comms').power+tier('computer').power+tier('thermal').power;
  const instP=on.reduce((s,k)=>s+INST[k].power,0), maxInst=on.reduce((m,k)=>Math.max(m,INST[k].power),0);
  let rel=tier('structure').rel*tier('engine').rel*tier('computer').rel*tier('thermal').rel;
  if(S.red)rel=1-(1-rel)*.5;
  const payload=on.reduce((s,k)=>s+INST[k].mass,0),payCost=on.reduce((s,k)=>s+INST[k].cost,0);
  return {on,payload,payCost,dry,wet,cost,genE,genM,bus,instP,maxInst,rel,dv:tier('engine').isp*G0*Math.log(wet/dry),oxy:ox,o2weeks:100/ox.drain,
    store:tier('computer').store,down:tier('comms').down,dataPass:on.reduce((s,k)=>s+INST[k].data,0),wh:tier('battery').wh};
}
function checks(){
  const d=design(),p=plan(),c=[];
  const add=(name,ok,detail,crit=true)=>c.push({name,ok,detail,crit});
  add(`Mass below ${f0(cap())} kg`,d.wet<=cap(),`${f0(d.wet)} kg launch mass`);
  add(`Cost within ${money(BUDGET)}`,d.cost<=BUDGET,`${money(d.cost)} committed`);
  add('Trajectory reaches Mars',p.feasible,p.feasible?`Arrival error ${f1(Math.abs(p.miss))}° costs ${f0(p.pen)} m/s to correct`:`Mars is ${f1(Math.abs(p.miss))}° away from your arrival point. Change the departure date.`);
  add('Sufficient power generation',d.genM>=d.bus+d.maxInst,`${f0(d.genM)} W at Mars against ${f0(d.bus)} W for the spacecraft plus ${f0(d.maxInst)} W for the largest instrument`);
  add('Adequate battery capacity',d.wh*.8>=d.bus*.7,`${f0(d.wh*.8)} Wh usable against ${f0(d.bus*.7)} Wh needed for a 42-minute eclipse`);
  add('Sufficient propellant',d.dv>=p.need,`${f0(d.dv)} m/s available against ${f0(p.need)} m/s required`);
  add('Functional communications',true,`${tier('comms').n}, ${tier('comms').down} Gb per pass`);
  add('Adequate data storage',d.store>=d.dataPass,`${d.store} Gb storage against ${d.dataPass} Gb from one pass with every instrument on`);
  add('Operational scientific instruments',d.on.length>0&&d.on.length<=SLOTS&&d.payload<=PAYLOAD_KG,d.on.length>SLOTS?`${d.on.length} instruments for ${SLOTS} mounting positions`:d.payload>PAYLOAD_KG?`Payload ${f0(d.payload)} kg against a ${PAYLOAD_KG} kg allocation`:`${d.on.length} of ${SLOTS} positions used, ${f0(d.payload)} of ${PAYLOAD_KG} kg`);
  add('Power for all instruments at once',d.genM>=d.bus+d.instP,`${f0(d.bus+d.instP)} W with everything on. You will need to stagger observations.`,false);
  add('Propellant margin of 10%',d.dv>=p.need*1.1,`Margin is ${f0((d.dv/p.need-1)*100)}%. Corrections during cruise may use it up.`,false);
  add('Downlink keeps up with data',d.down>=d.dataPass,`${d.dataPass} Gb generated per full pass, ${d.down} Gb transmitted`,false);
  const wk=p.tr.T/7;
  add('Oxygen covers the whole trip',d.o2weeks>=wk*1.15,`${f1(d.o2weeks)} weeks of oxygen against ${f0(wk)} weeks of flight. Your system is ${d.oxy.n.toLowerCase()}.`);
  const FIX=['Remove an instrument, pick lighter parts or load less propellant.','Pick cheaper parts or leave an instrument behind.','Go back to the trajectory and move the departure date.',
    'Fit larger solar arrays, or choose systems that draw less power.','Fit a larger battery.','Add propellant, cut mass, or pick a flight plan that needs less speed change.','','Fit a computer with more storage.','Fit between one and six instruments, within the payload allocation.'];
  const VER=['test: weigh the assembled spacecraft','inspection: audit of committed costs','analysis: trajectory simulation','analysis: power budget at Mars distance','analysis: eclipse energy budget','analysis: rocket equation against the flight plan','test: end-to-end radio link','analysis: data volume per pass','inspection: instrument fit check','analysis: power budget','analysis: propellant budget','analysis: data budget','analysis: life-support budget'];
  c.forEach((x,i)=>{x.fix=FIX[i]||'';x.ver=VER[i]||'';});
  return c;
}
/* propellant the current design needs for the current flight plan (with a 10% margin), and whether it fits */
function propNeeded(){const d=design(),p=plan(),ve=tier('engine').isp*G0,exact=d.dry*(Math.exp(p.need/ve)-1),want=d.dry*(Math.exp(p.need*1.1/ve)-1);
  const room=Math.min(800,cap()-d.dry),pick=want<=room?Math.ceil(want/10)*10:exact<=room?Math.floor(room/10)*10:Math.floor(room/10)*10;
  return {exact,want,room,load:clamp(pick,100,800),fits:Math.ceil(exact/10)*10<=room,dryMax:cap()/Math.exp(p.need/ve),need:p.need};}
/* step-by-step help for a failed check: what the numbers mean, and exactly what to press */
function howTo(i){const d=design(),p=plan(),n=propNeeded(),L=[];let to='design',sec='';
  const light=k=>{const t=SYS[k].tiers,c=S.sel[k],b=t.reduce((a,x,j)=>x.mass<t[a].mass?j:a,0);return b!==c?`${SYS[k].label}: “${t[b].n}” saves ${t[c].mass-t[b].mass} kg`:'';};
  const lighter=()=>['structure','power','battery','comms','computer','thermal'].map(light).filter(Boolean);
  if(i===0){const over=d.wet-cap();sec='structure';L.push(`You are ${f0(over)} kg over the ${f0(cap())} kg limit for ${site().n}. Launch mass is ${f0(d.dry)} kg of hardware plus ${f0(S.prop)} kg of propellant.`);
    const sv=lighter();if(sv.length)L.push('In Build, switch to lighter parts. '+sv.slice(0,3).join('. ')+'.');
    if(d.on.length)L.push('Or remove an instrument: '+d.on.map(k=>`${INST[k].name} ${INST[k].mass} kg`).join(', ')+'.');L.push('Do not just drain the propellant. Check that “Speed change needed / available” still passes afterwards.');}
  else if(i===1){sec='structure';L.push(`You have committed ${money(d.cost)} of ${money(BUDGET)}, so you must save ${money(d.cost-BUDGET)}.`);
    const big=Object.keys(SYS).map(k=>[k,tier(k).cost-Math.min(...SYS[k].tiers.map(t=>t.cost))]).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>0).slice(0,3);
    if(big.length)L.push('Biggest savings: '+big.map(x=>`${SYS[x[0]].label} up to ${money(x[1])}`).join(', ')+'.');if(S.red)L.push(`Redundancy costs ${money(12)}. Dropping it saves money but doubles the failure risk.`);if(S.transfer==='fast')L.push(`The fast transfer adds ${money(8)} for the bigger launch vehicle.`);}
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
  else if(i===8){to='design';sec='inst';L.push('Switch on at least one instrument under Instruments on this screen. Pick one that answers a science question you care about.');}
  else if(i===12){sec='oxy';const need=Math.ceil(p.tr.T/7),ok=Object.keys(OXY).filter(k=>100/OXY[k].drain>=need*1.15);
    L.push(`The trip takes ${f0(need)} weeks. ${d.oxy.n} holds ${f1(d.o2weeks)} weeks of oxygen.`);
    L.push(ok.length?`Under Oxygen, pick ${ok.map(k=>'“'+OXY[k].n+'”').join(' or ')}.`:'No system covers this trip with margin. Take the fast transfer so the crew is aboard for fewer weeks.');
    L.push('Regenerative systems need power, and electrolysis needs water. Check those meters after you switch.');}
  return {steps:L,to,sec};}
function howHtml(x,i){if(x.ok||!x.crit)return '';const h=howTo(i);if(!h.steps.length)return '';
  return `${Help.q(Help.temp({t:x.name,what:x.detail||x.fix,why:'A critical check. The launch is blocked until it passes.',act:h.steps}))}<button class="ghost mini" data-goto="${h.to}" data-sec="${h.sec}">Go there</button>`;}
function bindHow(root){root.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{const sec=b.dataset.sec,to=b.dataset.goto,same=S.stage===to;
  const jump=()=>{if(sec&&window.designTab&&S.stage==='design')designTab(sec);const el=sec&&main.querySelector(`.sys[data-sec="${sec}"]`);if(el){el.scrollIntoView({block:'center',behavior:calm()?'auto':'smooth'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),2600);}};
  if(same)jump();else{go(to);setTimeout(jump,2100*DEMO.k+80);}});}
const pt=(name,got,max,note)=>S.P.push({name,got,max,note});
const lg=text=>S.log.push(text);

/* ============ ui helpers ============ */
function head(n,title,loc,lede){return `<div class="stagehead"><p class="loc"><i class="led"></i>${loc} · ${stageIdx(S.stage)+1} / ${track().length}</p><h2>${title}</h2></div>${lede?`<p class="lede">${lede}</p>`:''}`;}
function meter(label,val,max,unit,mode,fmt){
  const cls=mode||(val>max?'over':val>max*.9?'warn':''),show=fmt||(x=>x%1?f1(x):f0(x));
  return `<div class="meter ${cls}"><div class="t"><span>${label}</span><span class="num">${show(val)} / ${show(max)} ${unit}</span></div><div class="b"><i style="width:${clamp(val/max*100,0,100)}%"></i></div></div>`;
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
function teach(t){return '';} /* concept lists now live only in the Notebook, to keep screens short */

function chrome(){
  const i=stageIdx(S.stage);
  $('track').innerHTML=S.stage==='title'?'':track().map((t,j)=>`<li class="${j<i?'done':j===i?'now':''}"${j===i?' aria-current="step"':''}>${j+1} ${t[1]}</li>`).join('');
  let h='';
  if(['science','planning','design','review'].includes(S.stage)){const d=design();
    h=`<span class="chip ${d.wet>cap()?'over':''}">${f0(d.wet)} / ${f0(cap())} kg</span><span class="chip ${d.cost>BUDGET?'over':''}">${money(d.cost)} / ${money(BUDGET)}</span>`;}
  else if(['cruise','moi','ops','site'].includes(S.stage))h=`<span class="chip met">MET ${f0((S.cr?S.cr.tick*7:0)+(S.ops?S.ops.pass*2:0))} d</span><span class="chip">Health ${f0(S.health)}%</span><span class="chip">Propellant ${f0(S.prop)} kg</span>${S.crew?`<span class="chip ${crewLevel()>1?'over':''}">Crew ${CLV[crewLevel()][1]}</span>`:''}`;
  $('hstats').innerHTML=h;
  const rb=$('restartBtn');if(rb)rb.hidden=S.stage==='title'||/debrief$/.test(S.stage);
}
/* Restart the current mission from its first screen. Mission 2 keeps the landing site, the orbital survey and the
   rover design, and rolls a new set of rock formations. Mission 1 starts over with a new launch window. */
function restartMission(){const n=S.mission||1,nm=S.name,gd=S.guided,M=S.m2||{},rc=S.race;Voice.stop();if(window.Cine&&Cine.skip)try{Cine.skip();}catch(e){}
  S=fresh();S.mission=n;S.name=nm;S.guided=gd;S.race=rc;store.del('mcb-save');
  if(n===2){S.m2={site:M.site||'floor',fromM1:M.fromM1,survey:M.survey,rover:M.rover,seed:rc?rc.seed:undefined};go('m2brief');}
  else{pickWindow();go('briefing');}}
$('restartBtn').onclick=async()=>{if(document.querySelector('.overlay'))return;
  const r=await ask({kicker:'Restart',title:`Restart mission ${S.mission||1}?`,body:`<p>${(S.mission||1)===2?'You go back to the briefing. Your landing site and rover design are kept; the rock formations are placed anew.':'You go back to the briefing with a fresh spacecraft and a new launch window.'} Progress in this attempt is lost.</p>`,
    choices:[{label:'Restart',value:'yes'},{label:'Keep playing',value:'no'}]});
  if(r==='yes')restartMission();};
const LOC={briefing:['Mission briefing','ASEA Mission Control'],science:['Scientific preparation','Science Operations Center'],planning:['Interplanetary planning','Mission Planning Center'],design:['Spacecraft construction','Spacecraft Design Facility'],
  review:['Technical review','Launch Readiness Board'],site:['Landing site selection','Mission Planning Center'],m2brief:['Mission briefing','ASEA Mission Control'],m2prep:['Rover preparation','Surface Systems Bay'],rover:['Surface expedition','Jezero Crater, Mars'],outpost:['Outpost operations','Jezero Base'],m2debrief:['Mission debrief','ASEA Science Operations Center'],cruise:['Interplanetary cruise','Spacecraft Operations Center'],moi:['Mars orbit insertion','Spacecraft Operations Center'],ops:['Science operations','Mars orbit'],debrief:['Mission debrief','ASEA Science Operations Center']};
let BG=null,cardT=[];
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function setScene(stage){document.body.dataset.stage=stage;if(BG)BG.stage(stage);}
function locCard(stage){const c=$('card'),L=LOC[stage];cardT.forEach(clearTimeout);cardT=[];if(!c)return;
  if(calm()||DEMO.k<.2){c.className='loccard';return;}
  const i=stageIdx(stage);
  c.innerHTML=L?`<p class="mono">Mission ${S.mission||1} · stage ${i+1} of ${track().length}</p><h2>${L[1]}</h2><p class="sub">${L[0]}</p>`:'';
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
function go(stage){setTimeout(()=>{if(window.Race&&Race.active())Race.stage();},0);const changed=S.stage!==stage;Voice.stop();if(changed)ghost();RUN++;S.stage=stage;S.max=Math.max(S.max,STAGES.indexOf(stage));chrome();window.scrollTo(0,0);setScene(stage);
  if(changed)locCard(stage);VIEW[stage]();main.querySelectorAll('button').forEach(b=>{b.type='button';});saveGame();
  if(changed){main.classList.remove('enter');void main.offsetWidth;main.classList.add('enter');typeIn();
    const sy=main.querySelector('.say');if(sy&&Voice.on){const tx=sy.querySelector('p:not(.kicker)');setTimeout(()=>{if(S.stage===stage&&!Cine.playing)Voice.say(tx.getAttribute('aria-label')||tx.textContent,sy.dataset.who);},(LOC[stage]?1700:300)*DEMO.k);}}}
/* Redraw a screen in place without moving the page. Instrument toggles use this, so a click never looks
   like a reload and the selected equipment stays where the player left it. */
function redraw(fn){const y=scrollY;fn();scrollTo(0,y);}
function navRow(back,next,label,disabled,note){return `<div class="nav"><button class="ghost" id="back">${back?'Back':'Main menu'}</button><div class="row">${note?`<span class="dim">${note}</span>`:''}<button class="btn" id="next" ${disabled?'disabled':''}>${label}</button></div></div>`;}
function bindNav(back,next){$('back').onclick=()=>go(back||'title');$('next').onclick=()=>go(next);}

/* ============ drawing ============ */
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/* Where the spacecraft is t days after launch: from GMAT's propagated transfer when there is one, otherwise from
   the game's own transfer ellipse. Returns AU and km/s. */
function craftAt(fl,t){const tr=fl.tr,c=tr.gm&&GM?GM.get(tr.gm.k,tr.gm.d):null;
  if(c){const p=GM.at(c,Math.min(t,tr.T));return {x:p[0],y:p[1],z:p[2],r:Math.hypot(p[0],p[1],p[2]),v:p[3],gmat:true};}
  const s=posAt(tr,Math.min(t,tr.T)),a=rad(Le(fl.dep))+s.nu;return {x:s.r*Math.cos(a),y:s.r*Math.sin(a),z:0,r:s.r,v:s.v,gmat:false};}
const planetAt=(d,b)=>GM?GM.pos(d,b):(r=>[r*Math.cos(rad(b?Lm(d):Le(d))),r*Math.sin(rad(b?Lm(d):Le(d))),0])(b?RM:1);
function drawSys(c,d0,tr,t){
  const {ctx,w,h}=c,cx=w/2,cy=h/2,k=(Math.min(w,h)/2-22)/(GM?1.7:1.62);
  const P=(x,y)=>[cx+k*x,cy-k*y],PR=(r,a)=>P(r*Math.cos(a),r*Math.sin(a));
  ctx.clearRect(0,0,w,h);
  const R=rng(7);ctx.fillStyle='rgba(239,230,217,.35)';for(let i=0;i<70;i++)ctx.fillRect(R()*w,R()*h,1,1);
  ctx.lineWidth=1;ctx.strokeStyle='#3b2e27';
  /* orbits: the real ellipses from GMAT's ephemeris, or circles in the fallback model */
  if(GM){for(const [b,days] of [[0,366],[1,687]]){ctx.beginPath();for(let i=0;i<=days;i+=3){const q=GM.pos(d0+i,b),[x,y]=P(q[0],q[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}}
  else for(const r of [1,RM]){ctx.beginPath();ctx.arc(cx,cy,k*r,0,7);ctx.stroke();}
  ctx.fillStyle='#f2b84f';ctx.beginPath();ctx.arc(cx,cy,7,0,7);ctx.fill();
  const g=tr.gm&&GM?GM.get(tr.gm.k,tr.gm.d):null,le=rad(Le(d0));
  if(g){ /* GMAT's targeted transfer: flown part solid, the rest dashed */
    const pts=GM.path(g),done=t==null?0:Math.min(pts.length-1,Math.floor(t/GM.meta.step));
    ctx.strokeStyle='#ea6f3c';ctx.lineWidth=1.8;ctx.setLineDash([]);ctx.beginPath();for(let i=0;i<=done;i++){const [x,y]=P(pts[i][0],pts[i][1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}if(done)ctx.stroke();
    ctx.setLineDash([5,4]);ctx.beginPath();for(let i=done;i<pts.length;i++){const [x,y]=P(pts[i][0],pts[i][1]);i>done?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(239,230,217,.6)';ctx.font='9px "Martian Mono",monospace';ctx.textAlign='left';ctx.fillText('TRAJECTORY: NASA GMAT · DE421',8,h-8);}
  else{ctx.setLineDash([5,4]);ctx.strokeStyle='#ea6f3c';ctx.lineWidth=1.6;ctx.beginPath();
    for(let i=0;i<=60;i++){const nu=tr.nu*i/60,[x,y]=PR(tr.p/(1+tr.e*Math.cos(nu)),le+nu);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.setLineDash([]);}
  const dot=(q,col,rad_,label,hollow)=>{const [x,y]=P(q[0],q[1]);ctx.beginPath();ctx.arc(x,y,rad_,0,7);if(hollow){ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.stroke();}else{ctx.fillStyle=col;ctx.fill();}
    if(label){ctx.fillStyle='#efe6d9';ctx.font='10px "Martian Mono",monospace';ctx.textAlign=x>cx?'left':'right';ctx.fillText(label,x+(x>cx?10:-10),y+(y>cy?14:-8));}};
  if(t==null){
    dot(planetAt(d0,0),'#8fc8da',5,'Earth at launch');
    dot(planetAt(d0,1),'#ea6f3c',5,'Mars at launch',true);
    dot(planetAt(d0+tr.T,1),'#ea6f3c',6,'Mars on arrival day');
    if(!g){const [x,y]=PR(RM,le+tr.nu);ctx.strokeStyle='#efe6d9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y-6);ctx.lineTo(x+6,y+6);ctx.moveTo(x+6,y-6);ctx.lineTo(x-6,y+6);ctx.stroke();
      ctx.fillStyle='#efe6d9';ctx.textAlign=x>cx?'left':'right';ctx.fillText('You arrive here',x+(x>cx?10:-10),y+(y>cy?26:-20));}
  }else{
    dot(planetAt(d0+t,0),'#8fc8da',5,'Earth');dot(planetAt(d0+t,1),'#ea6f3c',6,'Mars');
    const s=craftAt({dep:d0,tr},t),[x,y]=P(s.x,s.y);
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
  const cols={cam:'#ea6f3c',ctx:'#d98a5c',spec:'#f2b84f',tes:'#e0b070',mcs:'#86c994',radar:'#8fc8da',grs:'#b8a0d8',alt:'#d8d0c0',mag:'#9aa6b0',rad:'#ef5d52'};
  inst.forEach((k,i)=>{ctx.fillStyle=cols[k]||'#ccc';ctx.fillRect((-13+i*28/Math.max(1,inst.length))*s,16*s,Math.min(4.5,22/Math.max(1,inst.length))*s,(k==='cam'?9:5)*s);});
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
function say(w,text){return `<div class="say" data-who="${w}"><span class="av" aria-hidden="true">${WHO[w][1]}</span><div><p class="kicker">${WHO[w][0]}</p><p>${text}</p></div></div>`;}
/* the old step-by-step guides are gone: unfamiliar ideas are explained by the question-mark buttons (js/help.js) */
function coach(){return '';}
const TERMS={
  deltav:['Delta-v','The total change in speed a spacecraft can make with its engine. Think of it as the fuel gauge of a mission, measured in meters per second. Every maneuver spends some.'],
  isp:['Specific impulse (Isp)','How efficiently an engine uses propellant, like kilometers per liter for a car. Higher is better.'],
  hohmann:['Hohmann transfer','The cheapest path between two planets’ orbits: half an oval around the Sun that just touches Earth’s orbit at one end and Mars’s at the other.'],
  window:['Launch window','The short period when Earth and Mars are lined up so that a spacecraft leaving now will meet Mars on arrival day. For Mars it opens about every 26 months.'],
  escape:['Escape speed','The speed at which gravity can no longer hold you. Arrive at Mars faster than this without braking and you fly straight past.'],
  aerobrake:['Aerobraking','Using drag from the thin upper atmosphere, instead of propellant, to slow down a little on every orbit.'],
  eclipse:['Eclipse','The part of each orbit spent in the planet’s shadow. Solar arrays produce nothing there, so the battery takes over.'],
  downlink:['Downlink','Sending data from the spacecraft to Earth by radio. It is much slower than the instruments can record.'],
  drymass:['Dry mass','The spacecraft’s mass with empty tanks. Launch mass is dry mass plus propellant.'],
  au:['Astronomical unit (AU)','The average distance from Earth to the Sun, about 150 million km. Mars orbits at 1.52 AU.']
};
const T=(k,label)=>`${label||TERMS[k][0].toLowerCase()}${Help.q(k)}`;
const PRE={
  lean:{n:'Lean scout',d:'Cheap, light systems. Leaves room for propellant.',sel:{structure:1,power:1,battery:1,comms:1,engine:1,computer:1,thermal:0},inst:{ctx:true,spec:true,mcs:true,radar:true},prop:300,red:false,oxy:'tanks'},
  bal:{n:'Balanced orbiter',d:'Mid-range systems throughout.',sel:{structure:1,power:1,battery:1,comms:1,engine:1,computer:1,thermal:1},inst:{cam:true,spec:true,mcs:true,radar:true},prop:340,red:false,oxy:'regen'},
  tough:{n:'Tough survivor',d:'Reinforced, redundant and autonomous.',sel:{structure:2,power:1,battery:1,comms:1,engine:1,computer:2,thermal:1},inst:{ctx:true,spec:true,mcs:true,radar:true,rad:true},prop:380,red:true,oxy:'hybrid'}
};
function answered(){const o=S.ops,d=(r,k)=>(o.sci[r+k]||0)>0,R3=['jezero','valles','polar'];return {q1:R3.some(r=>d(r,'spec')),q2:R3.some(r=>d(r,'mcs')),q3:d('polar','radar'),
  p1:R3.some(r=>d(r,'tes')),p2:R3.some(r=>d(r,'tes')),p3:d('polar','grs')};}
function qTrack(){const a=answered(),row=(ok,q,need)=>`<li><span class="pill ${ok?'go':'warn'}">${ok?'Answered':'Open'}</span> <b>${q}</b> <span class="dim">${need}</span></li>`;
  return `<section class="coach"><p class="kicker">Your three science questions</p><ul class="plain">${row(a.q1,'What do surface minerals reveal?','Needs the spectrometer. Strongest at Jezero Crater.')}${row(a.q2,'How does the atmosphere vary?','Needs the atmospheric profiler. Strongest at the polar cap.')}${row(a.q3,'Is there ice beneath the surface?','Needs the radar over the north polar cap.')}</ul>
  <p class="dim" style="font-size:.9rem"><b>How a pass works:</b> 1. Tap a region on the map. 2. Switch instruments on or off. 3. Press “Fly this pass”. A question is answered once its data reaches Earth.</p></section>`;}
async function story(b,a){const o=S.ops;
  if(a.q3&&!b.q3){o.ev.echo=1;lg('Kestrel’s echo explained: it is the base of two kilometers of layered polar ice.');
    return Cine.play('discovery',{big:'Kestrel’s echo',bigAt:.55,col:0x8fc8da,inst:'radar',lines:[{text:'Radar pulses sink through the polar cap and bounce back from layer after layer.'},{who:'lind',text:'There. The same bright echo Kestrel saw. And this time we have the whole scan.'},{who:'lind',text:'Echo after echo, each a little later than the last. Stacked layers, two kilometers deep.'}]});}
  if(o.ev.disc)return;
  if(a.q1&&!b.q1){o.ev.disc=1;return Cine.play('discovery',{big:'Written in the rock',bigAt:.55,col:0xf2b84f,inst:'spec',tilt:1.2,lines:[{text:'The spectrometer splits reflected sunlight into hundreds of colors.'},{who:'lind',text:'Two dips, at 1.9 and 2.3 microns. Check the reference chart.'}]});}
  if(a.q2&&!b.q2){o.ev.disc=1;return Cine.play('discovery',{big:'Reading the air',bigAt:.55,col:0x86c994,inst:'mcs',tilt:1.2,lines:[{text:'The profiler looks sideways through the atmosphere, one layer at a time.'},{who:'lind',text:'Temperature and dust, from the ground up to 80 kilometers.'}]});}
}
function finale(){const echo=(S.ops.sci.polarradar||0)>0;
  return Cine.play('finale',{big:'Mission complete',bigAt:.6,lines:[{text:`${S.name} turns toward a pale blue dot and sends the site report home.`},
    {who:'lind',text:echo?'Six years. Kestrel’s scan is finally finished.':'We got real answers. Not the one Kestrel was chasing, though. That echo is still down there.'},
    {who:'reyes',text:'Good flying. Don’t get comfortable. The board is already asking about Europa.'}]});}
function auraScene(r){const q=r.q,pts=[50,400,1000][q];
  return Cine.play('aura',{q,aura:pts,min:7,big:['Technically Mars-bound','On course. Ish.','On course.'][q],lines:[
    {text:[`You missed the ring by ${f0(r.km)} km. Navigation will spend weeks cleaning this up.`,`Residual miss ${f0(r.km)} km. Close enough that nobody says anything.`,`Residual miss ${f0(r.km)} km, across 200 million. Mission Control exhales.`][q]},
    {who:'reyes',text:['They will bring this up at every meeting.','Far enough that everybody thinks it.','You never inhaled.'][q]}]});}

/* ============ views ============ */
const VIEW={};
function startMission(n){const nm=($('scName').value||'').replace(/[<>&"'`$\\]/g,'').trim().slice(0,18)||'Wayfarer',gd=$('guided').checked;
  S=fresh();S.mission=n;S.name=nm;S.guided=gd;store.del('mcb-save');return nm;}
VIEW.title=()=>{
  const sv=store.get('mcb-save'),m1=CAMP.m1,m2=CAMP.m2;
  main.innerHTML=`<section class="titlescreen"><div class="tmain">
    <p class="kicker">ASEA flight operations</p>
    <h1>Mission Control<span>Beyond</span></h1>
    <p class="lede">Scout Mars from orbit. Then land and explore.</p>
    <p class="dim firsttime">New here? Start with Mission 1 and keep Guided mode on. Every <span class="q" aria-hidden="true" style="display:inline-grid">?</span> explains the thing next to it.</p>
    ${BG?'':'<div class="cvwrap" style="border:0;background:none;max-width:300px"><canvas id="globe"></canvas></div>'}
  </div>
  <div class="panel menu">
    <p class="kicker">Mars campaign</p>
    <button class="mcard" id="m1"><span class="mnum">1</span><span class="mt"><b>Orbital Reconnaissance</b><i>Build an orbiter. Choose a landing site.</i></span><span class="pill ${m1?'go':'info'}">${m1?'Done · '+m1.score:'Start'}</span></button>
    <button class="mcard" id="m2"><span class="mnum">2</span><span class="mt"><b>The Red Frontier</b><i>Drive a rover in Jezero Crater. Run an outpost.</i></span><span class="pill ${m2?'go':'info'}">${m2?'Done · '+m2.score:'Start'}</span></button>
    <button type="button" class="ghost racebtn" id="raceBtn">${window.Race&&Race.inRoom()?'Race room '+Race.code:window.Race&&Race.pending()&&Race.pending().role==='guest'?'Rejoin race '+Race.pending().code:'Race other players'}</button>
    ${sv&&sv.stage&&VIEW[sv.stage]?`<button class="ghost" id="cont">Continue saved mission ${sv.mission||1}</button>`:''}
    <label class="kicker" for="scName">Call sign</label><input id="scName" class="txt" maxlength="18" value="Wayfarer" autocomplete="off">
    <label class="row" for="guided" style="gap:8px"><input type="checkbox" id="guided" checked> <span><b>Guided mode</b></span></label>
  </div></section>
  <section class="slots">${[['Europa','Beneath the Ice'],['Titan','The Outer Worlds'],['Deep space','Beyond the Horizon']].map(m=>`<div class="mission locked" aria-disabled="true"><p class="kicker">${m[0]}</p><h3>${m[1]}</h3><span class="pill warn" style="align-self:flex-start">Locked</span></div>`).join('')}</section>`;
  view3('globe','mars',{},{w:1,h:1,spin:.12,yaw:1.2,pitch:.25},c=>drawGlobe(cv(c,340,340)));
  if($('cont'))$('cont').onclick=()=>{S=sv;RUN++;chrome();setScene(S.stage);VIEW[S.stage]();};
  $('raceBtn').onclick=()=>{if(!window.Race)return toast('Race mode did not load.');const rp=!Race.inRoom()&&Race.pending();
    if(rp&&rp.role==='guest'){toast('Rejoining race '+rp.code+'…');Race.rejoin().then(()=>{toast('Back in race '+rp.code+'. Continue your saved mission.');VIEW.title();}).catch(e=>{toast(e.message);try{sessionStorage.removeItem('mcb-race');}catch(_){}VIEW.title();});return;}
    Race.open(($('scName').value||'').trim());};
  $('m1').onclick=async()=>{startMission(1);pickWindow();
    await Cine.play('prologue',{big:'Orbital Reconnaissance',bigAt:.8,lines:[{text:'Six years ago, ASEA’s Kestrel orbiter reached Mars.'},{text:'Nineteen days into its survey, its power failed. It never called home again.'},
      {who:'reyes',text:'Before anyone lands on Mars, someone has to finish Kestrel’s job. That is you.'}]});
    go('briefing');};
  $('m2').onclick=()=>{startMission(2);S.m2={site:(CAMP.m1&&CAMP.m1.site)||'floor',fromM1:!!(CAMP.m1&&CAMP.m1.site),survey:(CAMP.m1&&CAMP.m1.survey)||null,rover:CAMP.rover?JSON.parse(JSON.stringify(CAMP.rover)):undefined};go('m2brief');};
};

VIEW.briefing=()=>{
  main.innerHTML=head(1,'Mission briefing','ASEA Mission Control')+say('reyes','One job. Scout Jezero Crater from orbit and tell us where the surface crew should land.')+`
  <section class="panel task"><p class="kicker">Your task</p><h3>Choose the landing site ${Help.q('landing')}</h3>
    <div class="steps">${['Plan the trip','Build the orbiter','Fly it to Mars','Survey Jezero Crater','Pick where to land'].map((t,i)=>`<div><b>${i+1}</b><span>${t}</span></div>`).join('')}</div></section>
  <section class="grid g3">${[['Launch mass','1,200 kg','vehicle'],['Budget',money(180),''],['Crew aboard','3','crew']].map(x=>`<div class="panel stat"><p class="kicker">${x[0]} ${x[2]?Help.q(x[2]):''}</p><b class="num">${x[1]}</b></div>`).join('')}</section>
  ${navRow(false,'planning','Plan the trip')}`;
  bindNav(null,'planning');
};

const LAYER={cam:['Fine imaging','i:cam','CAMERA'],ctx:['Wide imaging','i:ctx','CONTEXT'],spec:['Minerals','i:spec','SPECTRO'],tes:['Thermal','i:tes','THERMAL'],mcs:['Weather','i:mcs','PROFILER'],radar:['Subsurface','i:radar','RADAR'],grs:['Hydrogen','i:grs','GAMMA-N'],alt:['Topography','i:alt','LASER ALT'],mag:['Magnetism','i:mag','MAGNETO'],rad:['Radiation','i:rad','RAD MON']};
VIEW.planning=()=>{
  main.innerHTML=head(3,'Trajectory','Mission Planning Center','Choose where and when to launch.')+`
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="sys"></canvas></div>
    <label for="dep" class="kicker">Departure date</label><input type="range" id="dep" min="0" max="${HORIZON}" step="1" value="${S.dep}">
    <div class="row between"><button class="ghost" id="d-">−1 day</button><b class="num" id="depLab"></b><button class="ghost" id="d+">+1 day</button></div>
    ${S.guided?'<button class="ghost" id="findWin">Find the window</button>':''}</div>
  <div class="grid"><div class="panel"><p class="kicker">Launch site ${Help.q('site')}</p><div class="sites">${Object.keys(SITES).map(k=>{const s=SITES[k];return `<button class="opt" data-site="${k}" aria-pressed="${S.site===k}"><b>${s.n}</b><span class="s">${f1(s.lat)}° N</span>
      <span class="sitestat"><i>Lifts</i><b>${f0(s.cap)} kg</b><i>Cost</i><b>${s.cost>0?'+':s.cost<0?'−':''}${money(Math.abs(s.cost))}</b><i>Earth’s spin</i><b>${f0(spin(s))} m/s</b></span></button>`;}).join('')}</div></div>
    <div class="panel"><p class="kicker">Route ${Help.q('hohmann')}</p><div class="choices two">${Object.keys(TR).map(k=>`<button class="opt" data-tr="${k}" aria-pressed="${S.transfer===k}"><b>${TR[k].n}</b><span class="s">${{hohmann:'Slow · least propellant',fast:'Quick · harder braking'}[k]||''}</span></button>`).join('')}</div></div>
    <div class="panel"><p class="kicker">Orbit at Mars ${Help.q('aerobrake')}</p><div class="choices">${Object.keys(ORB).map(k=>`<button class="opt" data-orb="${k}" aria-pressed="${S.orbit===k}"><b>${ORB[k].n}</b><span class="s">${{aero:'Least propellant · slow to settle',ellipse:'Medium propellant',direct:'Most propellant · ready at once'}[k]||''}</span></button>`).join('')}</div></div>
    <div class="panel" id="planOut"></div></div></section>
  ${navRow(true,'design','Build the spacecraft')}`;
  const c=cv('sys',460,460);
  const upd=()=>{const p=plan(),w=windowOf(S.dep);drawSys(c,S.dep,p.tr,null);$('depLab').textContent=dateStr(S.dep);
    const a=Math.abs(p.miss),st=a<1?['go','Window open']:a<=10?['warn','Costly']:['nogo','No route'];
    const phase=Math.abs(wrap(Lm(S.dep)-Le(S.dep))),want=Math.abs(wrap(180-NM*p.tr.T));
    $('planOut').innerHTML=`<div class="row between"><p class="kicker">Flight plan</p><span class="pill ${st[0]}">${st[1]}</span></div>
      <div class="winbox"><p class="kicker">Launch window ${Help.q('window')}</p><b class="num">${dateStr(w[0])} to ${dateStr(w[1])}</b><p class="dim">${w[2]}</p></div>
      <p>${a<1?'On target.':`Mars will be ${f1(a)}° ${p.miss>0?'ahead of':'behind'} your arrival point.`}${p.tr.gm?` The path drawn is GMAT’s, aimed exactly at Mars; closing your ${f1(a)}° gap is part of the speed change below.`:''}</p>
      <div class="tw"><table><tr><th>Your launch date</th><td class="num">${dateStr(S.dep)}</td></tr>
      <tr><th>Arrival</th><td class="num">${dateStr(S.dep+p.tr.T)}</td></tr><tr><th>Travel time</th><td class="num">${f0(p.tr.T)} days</td></tr>
      <tr><th>Trajectory ${Help.q('gmat')}</th><td class="num">${p.tr.gm?`NASA GMAT · launch energy C3 ${f1(p.tr.gm.c3)} km²/s² · arrives at ${f2(p.tr.gm.vinf)} km/s · ${p.tr.gm.dth<180?'Type I':'Type II'} (${f0(p.tr.gm.dth)}°)`:GM?'No GMAT transfer for this date (outside the windows). Simple model shown.':'Simple model (GMAT data not loaded)'}</td></tr>
      <tr><th>Earth to Mars angle at launch</th><td class="num">${f1(phase)}°</td></tr>
      <tr><th><b style="color:var(--text)">Speed change needed</b> ${Help.q('deltav')}</th><td class="num"><b>${f0(p.need)} m/s</b></td></tr></table></div>
      <p class="dim" style="font-size:.86rem">This route wants Mars about ${f0(want)}° ahead when you leave. Windows repeat about every 780 days because Earth laps Mars.</p>
      <details class="how"><summary>Breakdown</summary><div class="tw"><table>
      <tr><th>Braking into Mars orbit</th><td class="num">${f0(p.moi)} m/s</td></tr><tr><th>Fixing the timing error</th><td class="num">${f0(p.pen)} m/s</td></tr>
      <tr><th>Trims, and tilt from ${site().n}</th><td class="num">${f0(p.trim)} m/s</td></tr><tr><th>Approach speed at Mars</th><td class="num">${f2(p.tr.vinf)} km/s</td></tr>
      <tr><th>Signal delay on arrival</th><td class="num">${f1(p.light)} min</td></tr></table></div></details>`;chrome();};
  $('dep').oninput=e=>{S.dep=+e.target.value;upd();};
  $('d-').onclick=()=>{S.dep=Math.max(0,S.dep-1);$('dep').value=S.dep;upd();};
  $('d+').onclick=()=>{S.dep=Math.min(HORIZON,S.dep+1);$('dep').value=S.dep;upd();};
  main.querySelectorAll('[data-site]').forEach(b=>b.onclick=()=>{S.site=b.dataset.site;S.propSet=false;VIEW.planning();});
  main.querySelectorAll('[data-tr]').forEach(b=>b.onclick=()=>{S.transfer=b.dataset.tr;VIEW.planning();});
  main.querySelectorAll('[data-orb]').forEach(b=>b.onclick=()=>{S.orbit=b.dataset.orb;VIEW.planning();});
  if($('findWin'))$('findWin').onclick=()=>{const w=windowOf(S.dep);S.dep=w[0]===0&&w[1]===0?bestDep():w[0];$('dep').value=S.dep;upd();toast('Moved to the start of the window.');};
  upd();bindNav('briefing','design');
};

function tierStat(k,t){
  const extra={power:`${t.w} W at Earth, ${f0((t.w||0)/(RM*RM))} W at Mars`,battery:`${t.wh} Wh`,comms:`${t.down} Gb per pass, ${t.power} W`,
    computer:`${t.store} Gb storage, autonomy ${['low','medium','high'][t.auto]}, ${t.power} W`,thermal:`${t.power} W${t.s?', '+t.s:''}`,structure:t.s,engine:t.s}[k];
  return `${t.mass} kg · ${money(t.cost)} · ${extra}`;
}
VIEW.design=()=>{
  if(!S.propSet){S.propSet=true;S.prop=propNeeded().load;}
  const d0=design();
  const sysBlock=k=>`<div class="sys" data-sec="${k}"><div class="lab"><b>${SYS[k].label} ${Help.q(Help.temp({t:SYS[k].label,what:SYS[k].why,act:'Heavier tiers do more, but every kilogram needs propellant to stop it at Mars.'}))}</b></div>
      <p class="why">${SYS[k].why}</p><div class="opts">${SYS[k].tiers.map((t,i)=>`<button type="button" class="opt" data-sys="${k}" data-i="${i}" aria-pressed="${S.sel[k]===i}"><b>${t.n}</b><span class="s">${tierStat(k,t)}</span></button>`).join('')}</div></div>`;
  const G={
    payload:`<div class="sys" data-sec="inst"><div class="lab"><b>Payload ${Help.q('payload')}</b><span class="dim">${SLOTS} mounting positions · ${PAYLOAD_KG} kg allocation</span></div>
      <details class="objd" ${S.objOpen===false?'':'open'}><summary>What the mission has to measure</summary><div class="objm">${OBJM1.map(o=>`<div class="objrow"><div class="row between"><b>${o.q}</b><span class="dim mono">${o.where}</span></div><p class="need">${o.need}</p><ul class="cov plain" data-cov="${o.id}"></ul></div>`).join('')}</div></details>
      <div class="icat" id="icat"></div><div id="cmpTray"></div></div>`,
    power:sysBlock('power')+sysBlock('battery'),
    prop:sysBlock('engine')+`<div class="sys" data-sec="prop"><div class="lab"><b>Propellant ${Help.q('deltav')}</b><span class="num" id="propLab"></span></div><p class="why">More propellant means more speed change, but it is mass the engine has to push too.</p><input type="range" id="prop" min="100" max="800" step="10" value="${S.prop}" aria-label="Propellant load"><div class="row"><button type="button" class="ghost" id="autoProp">Load what the flight plan needs</button><span class="dim" id="propHint" style="font-size:.84rem"></span></div></div>`,
    frame:sysBlock('structure')+sysBlock('thermal')+`<div class="sys"><div class="lab"><b>Redundancy ${Help.q('redundancy')}</b></div><p class="why">Spares for the parts most likely to fail. Heavy and costly, but a failure is far less likely to end the mission.</p>
      <div class="opts"><button type="button" class="opt" id="red" aria-pressed="${S.red}"><b>Spare critical parts</b><span class="s">+45 kg · ${money(12)}</span></button></div></div>`,
    data:sysBlock('computer')+sysBlock('comms'),
    crew:`<div class="sys" data-sec="oxy"><div class="lab"><b>Oxygen for the crew ${Help.q('oxygen')}</b><span class="dim" id="oxyLab">This trip needs ${Math.ceil(plan().tr.T/7)} weeks · this setting holds ${f1(d0.o2weeks)}</span></div><p class="why">Three people breathe every day of the flight. Each system trades mass, power and water against how long the air lasts.</p>
      <div class="opts">${Object.keys(OXY).map(k=>{const o=OXY[k];return `<button type="button" class="opt" data-oxy="${k}" aria-pressed="${S.oxy===k}"><b>${o.n}</b><span class="s">${o.mass} kg · ${money(o.cost)} · ${o.power} W · ${f1(100/o.drain)} weeks</span><span class="dim" style="font-size:.84rem">${o.d}</span></button>`;}).join('')}</div></div>`};
  const TABS=[['payload','1 Instruments'],['power','2 Power'],['prop','3 Engine and fuel'],['frame','4 Frame and heat'],['data','5 Computer and radio'],['crew','6 Crew air']];
  S.dtab=TABS.some(t=>t[0]===S.dtab)?S.dtab:'payload';
  main.innerHTML=head(3,'Science and build','Spacecraft Assembly Laboratory')+`
  <section class="buildbar"><ol class="flow"><li><b>1</b> Choose instruments</li><li><b>2</b> Work through the tabs</li><li><b>3</b> Clear anything red on the right</li><li><b>4</b> Send to review</li></ol>
    <div class="row"><span class="dim mono" style="font-size:.6rem">QUICK START</span>${Object.keys(PRE).map(k=>`<button type="button" class="ghost sm" data-pre="${k}" title="${PRE[k].d}">${PRE[k].n}</button>`).join('')}</div></section>
  <section class="split build"><div class="panel dpanel">
    <div class="tabs" role="tablist">${TABS.map(t=>`<button type="button" role="tab" class="tab" data-dt="${t[0]}" aria-selected="${S.dtab===t[0]}">${t[1]}<i class="tdot" hidden></i></button>`).join('')}</div>
    <div class="dscroll" id="dscroll">${TABS.map(t=>`<div class="dtab" data-dtab="${t[0]}" ${S.dtab===t[0]?'':'hidden'}>${G[t[0]]}</div>`).join('')}</div>
    <div class="row between dfoot"><button type="button" class="ghost sm" id="dPrev">‹ Previous</button><span class="dim mono" id="dPos" style="font-size:.6rem"></span><button type="button" class="ghost sm" id="dNext">Next ›</button></div>
  </div><div class="panel sticky" id="readout"></div></section>
  ${navRow(true,'review','Send to review')}`;
  $('readout').innerHTML=`<div class="row between"><p class="kicker">${S.name}</p><span class="pill info" id="modelCap">Drag to turn</span></div><div class="cvwrap"><canvas id="craft"></canvas></div><div id="rbody" class="grid" style="gap:12px"></div>`;
  const cview=view3('craft','craft',craftOpts(),{w:3,h:2,spin:.3,yaw:.7,pitch:.38});
  S.cmp=S.cmp||[];
  const cards=()=>{const d=design();$('icat').innerHTML=IK.map(k=>{const i=INST[k],on=!!S.inst[k],full=!on&&d.on.length>=SLOTS,heavy=!on&&d.payload+i.mass>PAYLOAD_KG,blocked=full||heavy;
      return `<div class="icard ${on?'on':''} ${blocked?'blocked':''}"><div class="row between"><b>${i.name} ${Help.q('i:'+k)}</b><span class="mono dim">${i.tag}</span></div>
        <p class="dim">${i.out} · ${i.res}</p><div class="ispec num"><span>${i.mass} kg</span><span>${i.power} W</span><span>${i.data} Gb/pass</span><span>${money(i.cost)}</span></div>
        <div class="row between"><button type="button" class="opt sm" data-inst="${k}" aria-pressed="${on}" ${blocked?'disabled':''}>${on?'Installed · remove':blocked?(full?'No free position':`${f0(d.payload+i.mass-PAYLOAD_KG)} kg over allocation`):'Install'}</button>
        <label class="cmpbox"><input type="checkbox" data-cmp="${k}" ${S.cmp.includes(k)?'checked':''}> Compare</label></div></div>`;}).join('');
    OBJM1.forEach(o=>{const el=main.querySelector(`[data-cov="${o.id}"]`),L=coverage(o.id);el.innerHTML=L.length?L.map(t=>`<li>${t}</li>`).join(''):'<li class="dim">Nothing on board measures this.</li>';});
    const C=S.cmp.filter(k=>INST[k]);$('cmpTray').innerHTML=C.length>=2?`<div class="cmptray"><div class="row between"><p class="kicker">Side by side</p><button type="button" class="ghost sm" id="cmpX">Clear</button></div><div class="tw"><table class="cmpt"><tr><th></th>${C.map(k=>`<th>${INST[k].name}</th>`).join('')}</tr>
      ${[['Mass',k=>INST[k].mass+' kg'],['Power',k=>INST[k].power+' W'],['Data per pass',k=>INST[k].data+' Gb'],['Cost',k=>money(INST[k].cost)],['Reliability',k=>Math.round(INST[k].rel*100)+'%'],['Resolution',k=>INST[k].res],['Measures',k=>INST[k].g.meas],['Limits',k=>INST[k].g.lim]].map(r=>`<tr><th>${r[0]}</th>${C.map(k=>`<td>${r[1](k)}</td>`).join('')}</tr>`).join('')}</table></div></div>`:C.length===1?'<p class="dim" style="font-size:.84rem">Tick one more to compare side by side.</p>':'';
    main.querySelectorAll('[data-inst]').forEach(b=>b.onclick=()=>{const k=b.dataset.inst;S.inst[k]=!S.inst[k];SFX.toggle(S.inst[k]);{const c=$('modelCap');c.textContent=(S.inst[k]?'Installed: ':'Removed: ')+INST[k].name;c.classList.remove('pop');void c.offsetWidth;c.classList.add('pop');}saveGame();upd();});
    main.querySelectorAll('[data-cmp]').forEach(b=>b.onchange=()=>{const k=b.dataset.cmp;S.cmp=S.cmp.filter(x=>x!==k);if(b.checked){S.cmp.push(k);if(S.cmp.length>3)S.cmp.shift();}cards();});
    if($('cmpX'))$('cmpX').onclick=()=>{S.cmp=[];cards();};};
  const TAB_OF={inst:'payload',power:'power',battery:'power',engine:'prop',prop:'prop',structure:'frame',thermal:'frame',computer:'data',comms:'data',oxy:'crew'};
  const showTab=t=>{S.dtab=t;main.querySelectorAll('[data-dt]').forEach(b=>b.setAttribute('aria-selected',b.dataset.dt===t));main.querySelectorAll('[data-dtab]').forEach(x=>x.hidden=x.dataset.dtab!==t);
    const i=TABS.findIndex(x=>x[0]===t);$('dPos').textContent=`${i+1} of ${TABS.length}`;$('dPrev').disabled=i===0;$('dNext').textContent=i===TABS.length-1?'Done: check the right panel':'Next ›';$('dscroll').scrollTop=0;};
  window.designTab=sec=>{const t=TAB_OF[sec];if(t&&t!==S.dtab)showTab(t);};
  main.querySelectorAll('[data-dt]').forEach(b=>b.onclick=()=>showTab(b.dataset.dt));
  $('dPrev').onclick=()=>{const i=TABS.findIndex(x=>x[0]===S.dtab);if(i>0)showTab(TABS[i-1][0]);};
  $('dNext').onclick=()=>{const i=TABS.findIndex(x=>x[0]===S.dtab);if(i<TABS.length-1)showTab(TABS[i+1][0]);else $('readout').scrollIntoView({block:'start',behavior:'smooth'});};
  const objd=main.querySelector('.objd');if(objd)objd.ontoggle=()=>{S.objOpen=objd.open;};
  const dots=ck=>{const bad=new Set();ck.forEach((x,i)=>{if(!x.ok&&x.crit){const h=howTo(i);const t=TAB_OF[h&&h.sec];if(t)bad.add(t);}});
    main.querySelectorAll('[data-dt]').forEach(b=>{b.querySelector('.tdot').hidden=!bad.has(b.dataset.dt);});};
  const upd=()=>{cards();const d=design(),p=plan(),ck=checks(),bad=ck.filter(x=>x.crit&&!x.ok);{const n=propNeeded();$('propHint').textContent=n.fits?`Needs ${f0(Math.ceil(n.exact/10)*10)} kg`:`Needs ${f0(n.exact)} kg · room for ${f0(Math.max(0,n.room))} kg`;}$('propLab').textContent=`${S.prop} kg · ${money(S.prop*.02)}`;
    $('rbody').innerHTML=`
      ${bad.length?`<div class="issues"><p class="kicker" style="color:var(--bad)">Not ready · ${bad.length}</p><ul class="plain">${bad.map(x=>`<li class="row between"><b>${x.name}</b><span class="row">${howHtml(x,ck.indexOf(x))}</span></li>`).join('')}</ul></div>`:'<div class="issues ok"><p class="kicker" style="color:var(--good)">Ready for review</p></div>'}
      <div class="paysum"><p class="kicker">Payload ${Help.q('payload')}</p><div class="readouts"><div><span>Positions</span><b class="num">${d.on.length} / ${SLOTS}</b></div><div><span>Instrument mass</span><b class="num" style="color:${d.payload>PAYLOAD_KG?'var(--bad)':'inherit'}">${f0(d.payload)} / ${PAYLOAD_KG} kg</b></div><div><span>Instrument power, all on</span><b class="num">${f0(d.instP)} W</b></div><div><span>Power margin, largest on</span><b class="num" style="color:${d.genM-d.bus-d.maxInst<0?'var(--bad)':'inherit'}">${f0(d.genM-d.bus-d.maxInst)} W</b></div><div><span>Data per pass, all on</span><b class="num">${f1(d.dataPass)} Gb</b></div><div><span>Instrument cost</span><b class="num">${money(d.payCost)}</b></div></div></div>
      ${meter('Launch mass',d.wet,cap(),'kg')}${meter('Cost',d.cost,BUDGET,'','',money)}
      ${meter('Power '+Help.q('power'),d.bus+d.instP,d.genM,'W')}
      ${meter('Speed change: need / have '+Help.q('deltav'),p.need,d.dv,'m/s',p.need>d.dv?'over':p.need*1.1>d.dv?'warn':'ok')}
      ${meter('Data per pass '+Help.q('downlink'),d.dataPass,d.store,'Gb')}
      ${meter('Oxygen for the trip '+Help.q('oxygen'),Math.round(p.tr.T/7),Math.round(d.o2weeks),'weeks',d.o2weeks>=p.tr.T/7*1.15?'ok':'over')}
      <details class="how"><summary>See the math</summary><div id="eqHost"></div></details>`;
    bindHow($('rbody'));dots(ck);
    if($('eqHost')&&typeof Eq!=='undefined')Eq.attach($('eqHost'),{dry:d.dry,isp:tier('engine').isp,need:p.need,prop:S.prop,propMax:Math.max(100,cap()-d.dry),genE:d.genE,bus:d.bus,inst:d.maxInst,weeks:Math.round(p.tr.T/7)});
    if(cview)cview.set(craftOpts());else{const c=cv('craft',300,200);c.ctx.clearRect(0,0,300,200);drawCraft(c.ctx,150,105,1.5,{wing:S.sel.power,dish:S.sel.comms,inst:d.on});}chrome();};
  main.querySelectorAll('[data-sys]').forEach(b=>b.onclick=()=>{S.sel[b.dataset.sys]=+b.dataset.i;{const c=$('modelCap');c.textContent=SYS[b.dataset.sys].label+': '+SYS[b.dataset.sys].tiers[+b.dataset.i].n;c.classList.remove('pop');void c.offsetWidth;c.classList.add('pop');}main.querySelectorAll(`[data-sys="${b.dataset.sys}"]`).forEach(x=>x.setAttribute('aria-pressed',x===b));SFX.toggle(true);upd();});
  main.querySelectorAll('[data-oxy]').forEach(b=>b.onclick=()=>{S.oxy=b.dataset.oxy;main.querySelectorAll('[data-oxy]').forEach(x=>x.setAttribute('aria-pressed',x===b));S.prop=propNeeded().load;$('prop').value=S.prop;const lab=$('oxyLab');if(lab)lab.textContent=`This trip needs ${Math.ceil(plan().tr.T/7)} weeks · this setting holds ${f1(design().o2weeks)}`;SFX.toggle(true);upd();});
  main.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>{const p=PRE[b.dataset.pre];S.sel={...p.sel};S.inst=Object.fromEntries(IK.map(k=>[k,!!p.inst[k]]));S.red=p.red;if(p.oxy)S.oxy=p.oxy;S.prop=propNeeded().load;VIEW.design();});
  $('red').onclick=()=>{S.red=!S.red;$('red').setAttribute('aria-pressed',S.red);upd();};
  $('prop').oninput=e=>{S.prop=+e.target.value;upd();};
  $('autoProp').onclick=()=>{const n=propNeeded();S.prop=n.load;$('prop').value=S.prop;upd();toast(n.fits?`Loaded ${S.prop} kg.`:'Tank full. Still not enough.');};
  showTab(S.dtab);upd();bindNav('planning','review');
};

VIEW.review=()=>{
  const c=checks(),crit=c.filter(x=>x.crit),fails=crit.filter(x=>!x.ok).length;
  const row=x=>`<div class="chk"><span class="pill ${x.ok?'go':x.crit?'nogo':'warn'}">${x.ok?'Go':x.crit?'No go':'Caution'}</span><div><div class="row between"><b>${x.name}</b><span class="row">${howHtml(x,c.indexOf(x))}</span></div>${x.ok?'':`<div class="dim" style="font-size:.86rem">${x.detail}</div>`}${x.ver?`<div class="ver">Verified by ${x.ver}</div>`:''}</div></div>`;
  main.innerHTML=head(5,'Review','Launch Readiness Board',fails?`${fails} problem${fails>1?'s':''} to fix.`:'Go for launch.')+`
  <section class="grid g2"><div class="panel"><p class="kicker">Critical checks</p>${crit.map(row).join('')}</div>
  <div class="panel"><p class="kicker">Cautions</p>${c.filter(x=>!x.crit).map(row).join('')}
    <div class="pair" id="pad3"><div><p class="kicker">${S.name} ${Help.q('vehicle')}</p><div class="cvwrap"><canvas id="rvCraft"></canvas></div></div><div><p class="kicker">In the launch vehicle</p><div class="cvwrap"><canvas id="rvRocket"></canvas></div></div></div>
    <div class="row"><button class="ghost" id="toPlan">Trajectory</button><button class="ghost" id="toDesign">Science and build</button><button class="ghost" id="verT">Verification</button><button class="ghost" id="gmat">Export for GMAT</button></div></div></section>
  ${navRow(true,'cruise','Launch',fails>0,fails?'Launch is blocked':'')}`;
  if(!view3('rvCraft','craft',craftOpts(),{w:1,h:1,spin:.3,pitch:.38})|!view3('rvRocket','rocket',{payload:craftOpts(),cutaway:true},{w:1,h:1,spin:.4,pitch:.12}))$('pad3').remove();
  bindHow(main);$('verT').onclick=()=>main.classList.toggle('showver');$('gmat').onclick=exportGmat;$('toPlan').onclick=()=>go('planning');$('toDesign').onclick=()=>go('design');
  $('back').onclick=()=>go('design');$('next').onclick=launch;
};

let launching=false;
async function launch(){
  if(launching)return;launching=true;setTimeout(()=>{launching=false;},4000);
  const d=design(),p=plan();
  S.fl={dep:S.dep,tr:p.tr,vh:p.vh,vt:p.vt,vc:p.vc,vesc:p.vesc,pen:p.pen,need:p.need,light:p.light,orbit:S.orbit,prop0:S.prop,wet0:d.wet,cost:d.cost,
    isp:tier('engine').isp,auto:tier('computer').auto,genM:d.genM,bus:d.bus,store:d.store,down:d.down,wh:d.wh,rel:d.rel,on:d.on,oxy:S.oxy};
  S.mass=d.wet;S.health=d.rel*100;S.calib=S.sel.thermal===0?.92:1;
  /* Two rare events are rolled once, when the mission starts, and saved with the state: a rock on a
     collision path (about 1 flight in 40) and a burst water line (about 1 flight in 8). */
  const RC=srnd('cruise');S.cr={tick:0,N:Math.round(p.tr.T/7),ev:{},rock:RC()<.025,toilet:RC()<.13};
  S.cr.sched=makeSchedule(S.cr.N,S.cr.rock,S.cr.toilet);S.crew=crewNew();
  lg(`Launched ${dateStr(S.dep)} on a ${TR[S.transfer].n}, ${f0(d.wet)} kg, ${money(d.cost)}.`);
  const my=++RUN;SFX.thruster(1.6);
  await Cine.play('launch',{count:true,min:11,lines:[{who:'reyes',text:`${S.name}, you are go for launch.`},{who:'park',text:'Four thousand two hundred and twelve bolts. I counted twice.'},{text:`From ${site().n}, Earth’s spin gives the rocket ${f0(spin(site()))} m/s for free.`}]});
  if(my!==RUN)return;
  await Cine.play('depart',{lines:[{text:`${S.name} separates from the upper stage and unfolds its solar arrays.`},{who:'lind',text:`${f0(p.tr.T)} days to Mars. Kestrel made this trip too. Getting there was never the hard part.`},{text:'From here on, every change of speed comes out of your own propellant.'}]});
  if(my!==RUN)return;
  burn(p.pen);go('cruise');
}
function massFor(dv){const isp=(S.fl?S.fl.isp:tier('engine').isp)*G0;return (S.mass||900)*(1-Math.exp(-dv/(isp||1)));}
function burn(dv){const m=Math.min(S.prop,massFor(dv));S.prop-=m;S.mass-=m;S.vib=Math.min(4,(S.vib||0)+Math.min(2,dv/40));return m;}

/* ============ crew ============
   Three people ride in the spacecraft. Food, water and oxygen are used automatically every week; the player
   never feeds anyone by hand. The player sets two things (meals and work schedule) and answers crew events.
   Needs move through four levels: normal, warning, critical, emergency. Neglect one for long enough and the
   mission is lost. Rates are tuned for the game, not real consumption figures. */
const CREW0=[['Aiyana Brooks','Commander','AB'],['Kenji Mori','Flight surgeon','KM'],['Lucía Ferrer','Engineer','LF']];
const CLV=[['go','Normal'],['warn','Warning'],['nogo','Critical'],['nogo','Emergency']];
function crewNew(){const ox=oxyOf(S.oxy);return {food:100,water:100,o2:100,oxy:S.oxy||'regen',reserve:ox.backup,med:2,rations:1,sched:1,recycler:true,lvl:0,a:CREW0.map(c=>({n:c[0],role:c[1],i:c[2],health:100,energy:85,stress:15,rad:0}))};}
const crewAvg=k=>S.crew?S.crew.a.reduce((s,x)=>s+x[k],0)/S.crew.a.length:100;
function crewLevel(){const c=S.crew;if(!c)return 0;const low=Math.min(c.food,c.water,c.o2),h=Math.min(...c.a.map(x=>x.health)),e=Math.min(...c.a.map(x=>x.energy)),st=Math.max(...c.a.map(x=>x.stress));
  return low<10||h<30?3:low<25||h<50||e<20||st>85?2:low<40||h<70||e<40||st>65?1:0;}
/* how much science and upkeep the crew gets done */
const crewWork=()=>S.crew?[.85,1,1.15][S.crew.sched]*(crewAvg('energy')<30?.8:1)*(crewAvg('health')<50?.8:1):1;
function crewTick(w=1){const c=S.crew;if(!c||S.dead)return;
  /* Oxygen comes from the system the player built. Regenerative units recycle water but need power;
     electrolysis turns water into oxygen; stored tanks just run down. A dead bus makes any unit fall behind. */
  const ox=oxyOf(c.oxy),powered=!(S.fl&&S.fl.genM*S.degr<S.fl.bus),wd=Math.max(.5,1.3*(c.recycler?1:2.4)+ox.water);
  c.food=Math.max(0,c.food-1.55*w*(c.rations?1:.7));c.water=Math.max(0,c.water-wd*w);
  c.o2=Math.max(0,c.o2-ox.drain*(powered?1:1.9)*w);
  if(c.reserve>0&&c.o2<6){c.o2=Math.min(100,c.o2+c.reserve);c.reserve=0;toast('Emergency oxygen reserve opened.');lg('Emergency oxygen reserve opened.');}
  for(const a of c.a){
    a.energy=clamp(a.energy+([5,0,-5][c.sched]+(80-a.energy)*.08)*w,0,100);
    a.stress=clamp(a.stress+([-1.5,.4,2.5][c.sched]+(c.rations?0:1))*w,0,100);a.rad=clamp(a.rad+.5*w,0,100);
    let d=0;if(c.food<=0)d+=9;else if(c.food<20)d+=2;if(c.water<=0)d+=14;else if(c.water<20)d+=3;if(c.o2<=0)d+=40;else if(c.o2<20)d+=5;
    if(!c.rations)d+=.5;if(a.energy<25)d+=2;if(a.stress>80)d+=1.5;if(a.rad>60)d+=1.5;
    a.health=clamp(a.health+(d?-d:.8)*w,0,100);}
  const lv=crewLevel();if(lv>c.lvl){toast(['','Crew warning: a need is running low.','Crew critical: health is suffering.','Crew emergency: act now.'][lv]);if(lv>=2)SFX.alarm();}c.lvl=lv;
  if(c.a.some(a=>a.health<=0)){S.dead=true;S.health=Math.min(S.health,20);S.fail.push('Crew lost. Their needs were neglected for too long.');lg('Crew lost.');}}
function crewPanel(){const c=S.crew;if(!c)return '';const ox=oxyOf(c.oxy);const lv=CLV[crewLevel()],bar=(v,inv)=>`<i class="cb${(inv?v>85:v<25)?' b':(inv?v>65:v<40)?' w':''}"><b style="width:${clamp(v,0,100)}%"></b></i>`;
  const seg=(key,names)=>names.map((n,i)=>`<button class="ghost" data-crew="${key}" data-v="${i}" aria-pressed="${c[key]===i}">${n}</button>`).join('');
  return `<div class="panel crew" id="crew"><div class="row between"><p class="kicker">Crew</p><span class="pill ${lv[0]}">${lv[1]}</span></div>
    <div class="sup">${[['Food',c.food],['Water',c.water],['Oxygen',c.o2]].map(x=>`<div><span>${x[0]}</span>${bar(x[1])}<b class="num">${f0(x[1])}%</b></div>`).join('')}</div>
    <p class="dim" style="font-size:.78rem;margin:0 0 6px">Oxygen system: <b>${ox.n}</b> · ${f1(100/ox.drain)} weeks${c.reserve?` · reserve ${c.reserve}%`:''}${c.oxy==='elec'?' · draws water':''}${c.oxy==='regen'?' · draws power':''}</p>
    <div class="astros">${c.a.map(a=>`<div class="astro"><span class="av" aria-hidden="true">${a.i}</span><div class="who2"><b>${a.n}</b><span>${a.role}</span></div>
      <div class="mini"><label>Health ${bar(a.health)}</label><label>Energy ${bar(a.energy)}</label><label>Stress ${bar(a.stress,1)}</label><label>Radiation ${bar(a.rad,1)}</label></div></div>`).join('')}</div>
    <div class="seg2"><span class="kicker">Meals</span>${seg('rations',['Reduced','Full'])}</div>
    <div class="seg2"><span class="kicker">Work</span>${seg('sched',['Rest','Balanced','Push'])}</div>
    <p class="dim" style="font-size:.8rem">${['Rest: the crew recovers, but less gets done.','Balanced: steady.','Push: more science and upkeep, but the crew tires fast.'][c.sched]}${c.rations?'':' Reduced meals stretch the food and wear people down.'}${c.recycler?'':' <b style="color:var(--bad)">Water recycler is down.</b>'}</p></div>`;}
function drawCrew(){const el=$('crew');if(!el||!S.crew)return;el.outerHTML=crewPanel();bindCrew();chrome();}
function bindCrew(){const el=$('crew');if(el)el.querySelectorAll('[data-crew]').forEach(b=>b.onclick=()=>{S.crew[b.dataset.crew]=+b.dataset.v;drawCrew();});}
async function evWater(){const c=S.crew,N='Water recycler failure';c.recycler=false;drawCrew();
  const r=await ask({kicker:'Crew event · life support',cls:'alert',title:N,body:'<p>The unit that turns waste water back into drinking water has stopped. Without it, water runs out more than twice as fast.</p>',choices:[
    {label:'Repair it now',sub:'A very long shift. The crew is tired afterwards, but the recycler works.',value:'fix'},
    {label:'Fit the spare',sub:S.red?'You carried redundancy. A quick swap.':'Needs the redundancy option, which you did not carry.',value:'spare',disabled:!S.red},
    {label:'Ration water instead',sub:'No repair. Water keeps draining fast and stress rises.',value:'ration'}]});
  let msg;if(r==='fix'){c.recycler=true;c.a.forEach(a=>{a.energy=clamp(a.energy-22,0,100);a.stress=clamp(a.stress+6,0,100);});msg='Fixed after a 19-hour shift. The crew is exhausted. Give them rest.';pt(N,8,10);}
  else if(r==='spare'){c.recycler=true;msg='The spare went in within the hour.';pt(N,10,10);}
  else{c.a.forEach(a=>a.stress=clamp(a.stress+12,0,100));msg='Water is rationed. Watch the gauge: at this rate it will not last the mission.';pt(N,3,10);}
  lg(N+': '+msg);await tell('Outcome','Life support',`<p>${msg}</p>`);drawCrew();}
async function evMed(){const c=S.crew,a=c.a[Math.random()*c.a.length|0],N='Medical emergency';
  const r=await ask({kicker:'Crew event · medical',cls:'alert',title:N,body:`<p>${a.n} has a high fever and cannot work.</p>`,choices:[
    {label:'Use a medical kit',sub:`${c.med} left on board. A fast recovery.`,value:'kit',disabled:c.med<1},
    {label:'Bed rest only',sub:'Saves the kit. A slow, rough recovery.',value:'rest'}]});
  let msg;if(r==='kit'){c.med--;a.health=clamp(a.health-6,0,100);msg=`${a.n} is back on shift in two days.`;pt(N,10,10);}
  else{a.health=clamp(a.health-30,0,100);a.energy=clamp(a.energy-25,0,100);c.a.forEach(x=>x.stress=clamp(x.stress+8,0,100));msg=`${a.n} recovers slowly. The others cover the work and worry.`;pt(N,5,10);}
  lg(N+': '+msg);await tell('Outcome','Medical',`<p>${msg}</p>`);drawCrew();}

/* Cruise events are dealt in a random order every flight: one per slot, at a random week inside the slot,
   so the pacing stays even but no two flights teach the same lesson in the same order. */
function makeSchedule(N,rock,toilet){
  const list=['comm','storm','water','main','med','power'];
  if(rock)list.push('rock');
  if(toilet)list.push('toilet');
  const R=srnd('schedule');for(let i=list.length-1;i>0;i--){const j=R()*(i+1)|0;[list[i],list[j]]=[list[j],list[i]];}
  return list.map((k,i)=>({k,at:clamp(Math.round((i+1)/(list.length+1)*N+(R()-.5)*N*.08),2,Math.max(2,N-2))})).sort((a,b)=>a.at-b.at);
}
async function fireEvent(k){
  if(k==='comm')return evComm();
  if(k==='storm')return evStorm();
  if(k==='water')return evWater();
  if(k==='med')return evMed();
  if(k==='power')return evPower();
  if(k==='toilet')return evToilet();
  if(k==='rock'){if(S.fl&&(S.fl.on.includes('cam')||S.fl.on.includes('ctx')))lg('Navigation camera: a faint object is moving against the stars. Tracking.');
    return lethal('Rock strike',evRock,'The rock went through the spacecraft at 12 kilometers per second.');}
  if(k==='main'){let q;const ok=await lethal('Off course',async()=>{q=await evOffCourse();return q.km<90000;},'The correction left the spacecraft more than 90,000 km wide of Mars, with no propellant plan that could bring it back.');if(ok&&q)await auraScene(q);return;}
}

/* ---------- cruise ---------- */
VIEW.cruise=()=>{
  const f=S.fl;
  main.innerHTML=head(6,'Cruise','Spacecraft Operations Center')+`
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="sys"></canvas></div><div id="prog"></div></div>
  <div class="grid">${crewPanel()}<div class="panel" id="livep"><p class="kicker">${S.name} · live view</p><div class="cvwrap"><canvas id="live"></canvas></div></div><div class="panel" id="tele"></div><div class="panel"><p class="kicker">Flight log</p><div class="log" id="clog"></div></div></div></section>`;
  if(!view3('live','craft',craftOpts(),{w:16,h:9,spin:.18,yaw:2.4,pitch:.3}))$('livep').remove();
  if(!S.cr.sched)S.cr.sched=makeSchedule(S.cr.N,!!S.cr.rock,!!S.cr.toilet);
  const c=cv('sys',460,460);
  const upd=()=>{const t=Math.min(S.cr.tick*7,f.tr.T),s=craftAt(f,t);
    drawSys(c,f.dep,f.tr,t);
    const E_=planetAt(f.dep+t,0),M_=planetAt(f.dep+t,1),dist=Math.hypot(s.x-E_[0],s.y-E_[1],s.z-E_[2])*AU,dm=Math.hypot(s.x-M_[0],s.y-M_[1],s.z-M_[2])*AU;
    S.cr.v=s.v*1000;
    $('prog').innerHTML=meter(`Day ${Math.min(t,Math.round(f.tr.T))} of ${f0(f.tr.T)}`,Math.min(t,f.tr.T),f.tr.T,'days','ok');
    $('tele').innerHTML=`<p class="kicker">Telemetry</p><div class="tw"><table>
      <tr><th>Distance from the Sun</th><td class="num">${f2(s.r)} AU</td></tr><tr><th>Speed around the Sun</th><td class="num">${f2(s.v)} km/s</td></tr>
      <tr><th>Distance from Earth</th><td class="num">${f0(dist/1e6)} million km</td></tr><tr><th>Distance to Mars</th><td class="num">${f0(dm/1e6)} million km</td></tr><tr><th>Signal delay to Earth</th><td class="num">${f1(dist/C_KMS/60)} min</td></tr>
      <tr><th>Propellant</th><td class="num">${f0(S.prop)} kg</td></tr><tr><th>Spacecraft health</th><td class="num">${f1(S.health)}%</td></tr></table></div>${s.gmat?`<p class="mono dim" style="font-size:.58rem">Position and speed from NASA GMAT ${Help.q('gmat')}</p>`:''}`;
    $('clog').innerHTML=S.log.slice().reverse().map(l=>`<div><b>›</b> ${l}</div>`).join('');chrome();};
  upd();bindCrew();
  (async()=>{const my=RUN,N=S.cr.N;
    while(S.cr.tick<N){
      await sleep(850);if(my!==RUN)return;
      S.cr.tick++;if(S.cr.tick%4===0)saveGame();S.health-=S.crew?[.2,.12,.05][S.crew.sched]:.12;crewTick(1);drawCrew();upd();
      if(S.dead)return go('debrief');
      while(S.cr.sched&&S.cr.sched.length&&S.cr.sched[0].at<=S.cr.tick){
        const e=S.cr.sched.shift();S.cr.ev[e.k]=1;await fireEvent(e.k);
        if(my!==RUN)return;upd();if(S.dead)return go('debrief');}
      await rollRandom();
      if(my!==RUN)return;upd();
      if(S.dead)return go('debrief');
    }
    await Cine.play('arrival',{lines:[{text:`Day ${f0(f.tr.T)}. Mars is no longer a dot.`},{text:`${S.name} is falling toward Mars at ${f2(f.vh)} km/s.`}]});
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
    ${say('reyes','Small errors grow over millions of kilometers. Fix it now, while it is cheap.')}<p>Tracking shows the spacecraft drifting away from its aim point. Left alone it will miss Mars by ${f0(need.m*9000)} km. Plan a correction burn before the window closes.</p>
    <div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="cvwrap"><canvas id="bp"></canvas></div>
    <div class="grid" style="gap:10px"><label class="kicker" for="tang">Burn direction <span class="num" id="tangL"></span></label><input type="range" id="tang" min="-180" max="180" step="2" value="0">
      <label class="kicker" for="tmag">Burn size <span class="num" id="tmagL"></span></label><input type="range" id="tmag" min="0" max="80" step="1" value="0">
      <div id="tcmOut"></div>${f.auto===2?`<p class="teach"><b>Autonomous navigation suggests:</b> about ${Math.round(deg(need.a)/10)*10}° and ${Math.round(need.m/5)*5} m/s.</p>`:''}
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
  const r=await ask({kicker:'Event · power degradation',cls:'alert',title:'A solar array string has failed',body:`<p>This is the same fault that ended Kestrel. Array output dropped 18% and will not recover. You are ${f2(craftAt(f,S.cr.tick*7).r)} AU from the Sun, where sunlight is already weaker than at Earth. Output is ${f0(gen)} W at Mars distance against a ${f0(cruiseLoad)} W cruise load.</p>`,choices:[
    {label:'Reduce instrument activity',sub:'Skip the remaining in-flight calibrations.',value:'inst'},
    {label:'Shut down nonessential systems',sub:'Turn off survival heaters you can spare and the backup radio.',value:'shut'},
    {label:'Enter power-conservation mode',sub:'Safest for the hardware. You lose a week of tracking data.',value:'safe'},
    {label:'Continue normal operations',sub:'Accept the risk and keep to the plan.',value:'go'}]});
  let got,msg;
  if(r==='inst'){got=7;S.calib-=.05;msg='Power held. The instruments arrive at Mars less well calibrated, which costs a little data quality.';}
  else if(r==='shut'){got=10;msg='Power held with margin, and nothing the mission needs was lost.';}
  else if(r==='safe'){got=ok?5:8;burn(15);msg='The spacecraft stayed safe. With a week of tracking missing, navigation needed an extra 15 m/s to tighten the approach.';}
  else if(ok){got=9;msg='Your arrays had enough margin to absorb the loss. Good design made this an easy call.';}
  else{got=0;S.health-=10;S.calib-=.05;msg='The battery drained during a maneuver and the spacecraft browned out. It recovered, with damage.';}
  pt('Power degradation',got,10);lg('Power degradation: '+msg);
  await tell('Outcome',got>=7?'Power stable':'Brownout',`<p>${msg}</p>${teach('Solar irradiance, the inverse-square law, power management, energy storage.')}`);
  
}

/* ---------- random events ---------- */
/* Bolts work loose from vibration, not from speed. Three things raise the odds: a light structure, joints
   that are already loose, and the shaking after a recent burn. The result is a weekly chance, capped at 1%,
   so a normal mission sees this about once in twenty flights and it never becomes routine. */
const boltP=()=>clamp(.0015*SYS.structure.tiers[S.sel.structure].bolt*(1+.35*(S.loose||0))*(1+.15*Math.min(4,S.vib||0)),.0002,.01);
async function rollRandom(){
  if(Math.random()<1e-6)return explode(false);
  if(Math.random()<boltP())return evBolt();
  if(Math.random()<.006)return evLights();
}
async function evBolt(){
  const a=S.fl?S.fl.auto:1,p=boltP();
  const r=await ask({kicker:`Random event · ${f1(p*100)}% each week`,title:'A bolt fell out',body:`${say('park',`That leaves ${f0(4212-(++S.bolts))}. I am updating the spreadsheet.`)}<p>Vibration has worked a fastener loose on the solar-array hinge. Light frames shake more, loose joints shake more, and a burn shakes everything. This week the odds were ${f1(p*100)}%.</p>`,choices:[
    {label:'Re-seat it with the hinge motor',sub:`Free. ${[70,85,95][a]}% chance it works.`,value:'motor'},
    {label:'Fire thrusters to settle the array',sub:'Always works. Uses 3 kg of propellant.',value:'thr'},
    {label:'Ignore it',sub:'It is one bolt.',value:'no'}]});
  let got=4,msg;
  if(r==='motor'){if(Math.random()<[.7,.85,.95][a])msg='The hinge motor pulled the joint tight.';else{S.health-=2;got=3;msg='The motor stalled. The joint is stable but weakened.';}}
  else if(r==='thr'){const m=Math.min(3,S.prop);S.prop-=m;S.mass-=m;msg='A short thruster pulse settled the array.';}
  else{S.health-=4;S.loose++;got=0;msg='The array now rattles on every maneuver. More bolts are likely to follow.';}
  pt('A bolt fell out',got,4);lg('A bolt fell out. '+msg);toast(msg);
}
function evLights(){return new Promise(res=>{
  const t0=performance.now(),o=document.createElement('div');o.className='blackout';
  o.innerHTML=`<p>POWER LOSS · FIND THE MAIN BREAKER</p><button class="brk" id="breaker" aria-label="Main breaker, tripped" style="left:${8+Math.random()*66}%;top:${18+Math.random()*52}%"><span class="brklab">MAIN</span><span class="brkslot"><i></i></span><span class="brkled"></span><span class="brkst">TRIPPED</span></button>`;
  document.body.appendChild(o);
  o.onpointermove=e=>{o.style.setProperty('--mx',e.clientX+'px');o.style.setProperty('--my',e.clientY+'px');};
  const b=$('breaker');b.focus();
  b.onclick=()=>{if(b.classList.contains('on'))return;const s=(performance.now()-t0)/1000;b.classList.add('on');b.setAttribute('aria-label','Main breaker, closed');b.querySelector('.brkst').textContent='CLOSED';SFX.blip(180,.12,.08,'square');
    setTimeout(()=>{o.remove();const got=s<6?3:s<14?2:1;pt('Power loss',got,3);lg(`Power loss. Breaker closed in ${f1(s)} s.`);toast(`Power restored in ${f1(s)} s.`);res();},650*Math.max(DEMO.k,.05));};
});}
async function explode(demo){
  document.body.classList.add('shake');SFX.boom();
  await Cine.play('explosion',{big:'Everything exploded',bigAt:.2,min:7,lines:[{text:'The odds of this were 1 in 1,000,000 per tick. Take a screenshot. Nobody will believe you.'},{who:'park',text:'…I counted those bolts.'}]});
  document.body.classList.remove('shake');
  await ask({kicker:'1 in 1,000,000',cls:'alert',title:'Everything exploded',body:'<p>There is no lesson here. Sometimes space just does this.</p>',choices:[{label:demo?'End the drill':'Go to debrief'}]});
  if(!demo){S.dead=true;S.health=0;S.fail.push('Spacecraft destroyed: everything exploded');lg('Everything exploded.');}
}

/* ---------- Mars orbit insertion ---------- */
VIEW.moi=()=>{
  const f=S.fl,my=RUN;
  if(!S.ckpt){const s=JSON.stringify(S);S.ckpt=s;}
  main.innerHTML=head(7,'Orbit insertion','Spacecraft Operations Center')+`
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="moiC"></canvas></div></div>
  <div class="panel"><p class="kicker">Burn control ${Help.q('escape')}</p><div id="moiOut"></div>
    <button class="btn" id="fire" style="touch-action:none;user-select:none">Start the approach</button><p class="dim" style="font-size:.85rem">Hold in the green zone. Release at the target speed. ${Help.q('moi')}</p>
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
  S.ops={pass:1,N:Math.max(3,passes),q,region:'jezero',on:Object.fromEntries(f.on.map(k=>[k,true])),st:Object.fromEntries(f.on.map(k=>[k,(S.radDeg||[]).includes(k)?'deg':'ok'])),
    bat:f.wh,store:[],sci:{},cnt:{},collected:0,delivered:0,lost:0,mode:'fifo',ev:{},lines:[],bonus:0};
  if(f.orbit==='aero')await Cine.play('aerobrake',{lines:[{text:'For four months the spacecraft skims the top of the atmosphere on every orbit.'},{who:'park',text:'Free braking. The air does the work, and the arrays take the heat.'},{text:'Each pass shaves the orbit lower, until it is close enough for science.'}]});
  await tell('Orbit insertion',title,`<p>${msg}${trim}</p>`,'Continue');
  
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
  const st=!canPower?['nogo','Power short']:u+dataNow>f.store?['warn','Storage will overflow']:deficit>0?['warn',`Battery −${f0(deficit)} Wh`]:['go','Ready'];
  main.innerHTML=head(7,'Orbit operations','Mars orbit')+`
  <section class="panel task slim"><div class="row between"><p class="kicker">Task · survey Jezero Crater ${Help.q('landing')}</p><div class="row">${f.on.map(k=>{const has=(o.cnt['jezero'+k]||0)>0;return `<span class="pill ${has?'go':'warn'}">${LAYER[k][0]}${has?' ✓':''}</span>`;}).join('')}</div></div></section>
  <section class="split"><div class="grid"><div class="panel"><div class="cvwrap"><canvas id="map"></canvas>
      ${Object.keys(REG).map(k=>`<button class="hot" data-r="${k}" aria-pressed="${o.region===k}" style="left:${(REG[k].lon+180)/3.6}%;top:${(90-REG[k].lat)/1.8+(k==='polar'?5:0)}%">${REG[k].n}</button>`).join('')}</div>
      <h3>${R.n}</h3>
      <div class="tw"><table><tr><th>Instrument</th><th>Fit here</th><th class="num">Next pass worth</th></tr>
      ${f.on.map(k=>`<tr><td>${INST[k].name} ${Help.q('i:'+k)}${o.st[k]!=='ok'?` <span class="pill ${o.st[k]==='off'?'nogo':'warn'}">${o.st[k]==='off'?'off':'degraded'}</span>`:''}</td><td><span class="pips">${[1,2,3,4,5].map(i=>`<i class="${R.aff[k]*5>=i-.01?'on':''}"></i>`).join('')}</span></td><td class="num">${o.st[k]==='off'?'0.0':f1(obsValue(o.region,k))}</td></tr>`).join('')}</table></div></div>
    ${crewPanel()}
    <div class="panel"><p class="kicker">Log</p><div class="log">${o.lines.slice().reverse().map(l=>`<div><b>›</b> ${l}</div>`).join('')||'<div>No passes flown yet.</div>'}</div></div></div>
  <div class="panel sticky"><div class="row between"><p class="kicker">Pass ${o.pass} of ${o.N}</p><span class="pill info">Science ${f1(o.delivered)}</span></div>
    <div class="cpanel inst">${f.on.map(k=>{const on=!!o.on[k]&&o.st[k]!=='off';return `<button class="tsw ${on?'on':''} ${o.st[k]==='deg'?'deg':o.st[k]==='off'?'dead':''}" data-k="${k}" aria-pressed="${on}" ${o.st[k]==='off'?'disabled':''}><span class="tled"></span><span class="tlab">${LAYER[k][2]}</span><span class="tslot"><i></i></span><span class="tval num">${INST[k].power} W</span><span class="trng">${INST[k].data} Gb</span></button>`;}).join('')}</div>
    ${meter('Power '+Help.q('power'),load,avail,'W')}${meter('Battery '+Help.q('eclipse'),o.bat,f.wh,'Wh',o.bat<f.wh*.25?'over':'ok')}
    ${meter('Storage '+Help.q('downlink'),u+dataNow,f.store,'Gb')}
    <div class="row between"><span class="pill ${st[0]}">${st[1]}</span><span class="dim num" style="font-size:.7rem">Downlink ${f.down} Gb / pass</span></div>
    <button class="btn" id="exec" ${canPower?'':'disabled'}>${act.length?'Fly this pass':'Downlink only'}</button></div></section>`;
  drawMarsMap(cv('map',640,320));bindCrew();
  main.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{o.region=b.dataset.r;SFX.toggle(true);redraw(VIEW.ops);});
  main.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{o.on[b.dataset.k]=!o.on[b.dataset.k];SFX.toggle(o.on[b.dataset.k]);redraw(VIEW.ops);});
  $('exec').onclick=async()=>{const my=RUN;
    if(deficit>0)o.bat-=deficit;else o.bat=Math.min(f.wh,o.bat-deficit*.6);
    let got=0,lost=0,space=f.store-used();
    for(const k of act){const val=obsValue(o.region,k)*crewWork(),size=INST[k].data;
      if(size<=space+1e-9){o.store.push({r:o.region,k,size,left:size,val});space-=size;o.collected+=val;got+=val;o.cnt[o.region+k]=(o.cnt[o.region+k]||0)+1;}
      else{lost+=val;o.lost+=val;}}
    const b4=answered(),sent=downlink(f.down),af=answered();
    o.lines.push(`Pass ${o.pass}, ${R.n}: recorded ${f1(got)} science${lost?`, lost ${f1(lost)} to full storage`:''}, sent ${f1(sent)} Gb.`);
    o.pass++;S.health-=.3;crewTick(1.5);saveGame();
    await story(b4,af);if(my!==RUN)return;
    if(o.pass===4&&!o.ev.data){o.ev.data=1;await evData();}
    else if(o.pass===6&&!o.ev.opp){o.ev.opp=1;await evOpp();}
    else if(o.pass===8&&!o.ev.mal){o.ev.mal=1;await evMal();}
    else if(o.pass<=o.N)await rollRandom(3400);
    if(my!==RUN)return;
    if(S.dead)return go('debrief');
    if(o.pass>o.N){const b=used(),s=downlink(f.down*3),left=used();
      lg(`Science phase complete after ${o.N} passes.`);
      await tell('Final downlink','Survey complete',`<div class="readouts"><div><span>Sent</span><b class="num">${f1(s)} Gb</b></div><div><span>Never sent</span><b class="num">${f1(left)} Gb</b></div></div>`,'Choose the landing site');
      if(my!==RUN)return;return go('site');}
    chrome();VIEW.ops();};
};
/* Landing site selection: the one decision Mission 1 exists to make. The table shows measurements, never verdicts.
   A column is filled only if that instrument observed Jezero. The values are simulated survey data. */
const LSITE={delta:['A','Delta front'],floor:['B','Crater floor'],rim:['C','East bench']};
const SURV={delta:{cam:'Rocks 18% · slopes to 12°',ctx:'Bright layered scarp, dark sand patches',spec:'Dips at 1.9 and 2.3 µm, deep',tes:'Thermal inertia 420: rocky, crusted ground',radar:'Stacked echoes to about 80 m',mcs:'Dust opacity 0.6 · air 2 km up −58 °C',grs:'Water-equivalent hydrogen 3% (footprint covers all sites)',alt:'Regional slope 4° · scarp about 40 m',mag:'Field under 10 nT',rad:'Orbit dose about 0.22 mGy/day',drive:'0.3 km'},
  floor:{cam:'Rocks 5% · slopes to 3°',ctx:'Smooth, even plain',spec:'One broad dip near 1.0 µm',tes:'Thermal inertia 260: sand and rock',radar:'One flat echo at about 35 m',mcs:'Dust opacity 0.6 · air 2 km up −58 °C',grs:'Water-equivalent hydrogen 3% (footprint covers all sites)',alt:'Regional slope 1°',mag:'Field under 10 nT',rad:'Orbit dose about 0.22 mGy/day',drive:'1.0 km'},
  rim:{cam:'Rocks 11% · slopes to 19°',ctx:'Pale banded slopes',spec:'Dips at 2.3 and 2.5 µm',tes:'Thermal inertia 700: rock, patches of bedrock',radar:'No clear echo',mcs:'Dust opacity 0.5 · air 2 km up −60 °C',grs:'Water-equivalent hydrogen 3% (footprint covers all sites)',alt:'Regional slope 7°',mag:'Field under 10 nT',rad:'Orbit dose about 0.22 mGy/day',drive:'1.5 km'}};
VIEW.site=()=>{const o=S.ops,has=k=>!!o&&(o.cnt['jezero'+k]||0)>0,K=Object.keys(LSITE);
  main.innerHTML=head(8,'Landing site','Mission Planning Center')+`
  <section class="panel task slim"><p class="kicker">Task · choose where the surface crew lands ${Help.q('landing')}</p></section>
  <section class="split"><div class="panel"><div class="cvwrap"><canvas id="jz"></canvas></div><p class="mono dim" style="font-size:.6rem">SIMULATED SURVEY · JEZERO CRATER · 18.4° N 77.5° E</p></div>
  <div class="panel"><div class="tw"><table class="survey"><tr><th></th>${K.map(s=>`<th>${LSITE[s][0]} · ${LSITE[s][1]}</th>`).join('')}</tr>
    ${(S.fl?S.fl.on:IK).map(k=>`<tr><th>${LAYER[k][0]} ${Help.q(LAYER[k][1])}</th>${K.map(s=>`<td>${has(k)?SURV[s][k]:'<span class="dim">no data</span>'}</td>`).join('')}</tr>`).join('')}
    ${IK.filter(k=>!(S.fl?S.fl.on:IK).includes(k)).length?`<tr><th class="dim">Not carried</th><td colspan="3" class="dim">${IK.filter(k=>!(S.fl?S.fl.on:IK).includes(k)).map(k=>LAYER[k][0]).join(' · ')}</td></tr>`:''}
    <tr><th>Drive to the layered scarp</th>${K.map(s=>`<td>${SURV[s].drive}</td>`).join('')}</tr></table></div>
    <div class="choices three">${K.map(s=>`<button class="opt" data-ls="${s}" aria-pressed="${S.landing===s}"><b>${LSITE[s][0]}</b><span class="s">${LSITE[s][1]}</span></button>`).join('')}</div>
    <div class="nav" style="border:0;padding:0"><span></span><button class="btn" id="next" ${S.landing?'':'disabled'}>Confirm site</button></div></div></section>`;
  const c=cv('jz',460,400),x=c.ctx;x.fillStyle='#7c4a32';x.fillRect(0,0,460,400);
  for(let i=0;i<500;i++){x.fillStyle=`rgba(${40+Math.random()*60|0},${20+Math.random()*30|0},${10+Math.random()*20|0},.25)`;x.fillRect(Math.random()*460,Math.random()*400,3,2);}
  x.fillStyle='#8f5a3c';x.beginPath();x.arc(245,205,176,0,7);x.fill();x.strokeStyle='#c99a78';x.lineWidth=7;x.stroke();x.strokeStyle='rgba(40,20,12,.5)';x.lineWidth=3;x.beginPath();x.arc(248,209,172,0,7);x.stroke();
  x.fillStyle='#b98a66';x.beginPath();x.moveTo(74,170);x.quadraticCurveTo(150,120,186,170);x.quadraticCurveTo(200,215,168,262);x.quadraticCurveTo(120,250,74,214);x.fill();   /* the delta fan */
  x.strokeStyle='#5d3a28';x.lineWidth=5;x.beginPath();x.moveTo(0,186);x.quadraticCurveTo(40,200,78,192);x.stroke();                                                         /* inlet channel */
  x.strokeStyle='rgba(60,35,22,.5)';x.lineWidth=1;for(let i=0;i<7;i++){x.beginPath();x.moveTo(80,192);x.quadraticCurveTo(130,150+i*14,176+((i%3)*6),160+i*15);x.stroke();}
  x.fillStyle='#c9ad92';x.beginPath();x.ellipse(372,150,34,60,.3,0,7);x.fill();
  const E={delta:[214,214],floor:[292,262],rim:[368,150]};x.font='600 13px "Martian Mono",monospace';
  K.forEach(s=>{const [ex,ey]=E[s],on=S.landing===s;x.strokeStyle=on?'#ea6f3c':'#efe6d9';x.lineWidth=on?3:1.5;x.setLineDash(on?[]:[5,4]);x.beginPath();x.ellipse(ex,ey,30,20,-.2,0,7);x.stroke();x.setLineDash([]);x.fillStyle=on?'#ea6f3c':'#efe6d9';x.fillText(LSITE[s][0],ex-4,ey+5);});
  x.fillStyle='#efe6d9';x.font='10px "Martian Mono",monospace';x.fillText('delta fan',86,286);x.fillText('inlet valley',4,172);x.fillText('10 km',392,384);x.strokeStyle='#efe6d9';x.lineWidth=1.5;x.beginPath();x.moveTo(350,388);x.lineTo(386,388);x.stroke();
  main.querySelectorAll('[data-ls]').forEach(b=>b.onclick=()=>{S.landing=b.dataset.ls;SFX.toggle(true);redraw(VIEW.site);});
  $('next').onclick=async()=>{const my=RUN;S.survey=IK.filter(has);lg(`Landing site chosen: ${LSITE[S.landing][1]}.`);await finale();if(my!==RUN)return;go('debrief');};
};
async function evData(){
  const f=S.fl,o=S.ops,u=used(),pct=u/f.store;
  const r=await ask({kicker:'Event · data overload',title:pct>.3?'More data than the radio can send':'A ground station outage',body:`<p>${pct>.3?`The instruments are filling storage faster than each pass can empty it. ${f1(u)} Gb is waiting, ${f0(pct*100)}% of capacity.`:'A Deep Space Network antenna is down for repairs, and mission planners want a policy for the backlog that will build.'}</p>`,choices:[
    {label:'Prioritize by science value',sub:'Send the most valuable data first and delete the least valuable quarter.',value:'pri'},
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
  const ok=await lethal('Instrument fault',()=>evPanel(INST[k].name),`A short in the ${INST[k].name.toLowerCase()} spread to the main power bus before it could be isolated.`,false);
  if(!ok)return;const msg=`The ${INST[k].name.toLowerCase()} was isolated, reset and brought back to full performance.`;
  lg('Instrument malfunction: '+msg);o.lines.push(msg);
  await tell('Outcome','Fault cleared',`<p>${msg}</p>${teach('Fault isolation, safing procedures, instrument calibration and limitations.')}`);
}

/* ============ major events: fail one and the mission is over ============
   Each minigame resolves true (survived) or false. Guided mode forgives one failure per mission. */
/* What the player did wrong, in plain words. Shown after a lost mission: the cause, what it cost, and the
   fix to try next time. One entry per way the flight can end. */
const ADVICE={
  'Rock strike':[['You stayed on the object\u2019s path.','The rock crossed your track and the spacecraft was destroyed.','Push away from the rock and check the gap bar before you fire.']],
  'Off course':[['The correction burn did not close the gap.','A miss wider than 90,000 km leaves no propellant plan that can reach Mars.','Move the cross into the ring, then burn only what you need.']],
  'Instrument fault':[['A healthy channel was switched off.','Each wrong switch cost margin, and the fault spread to the main bus.','Compare every reading with its range. Cut only the ones outside it.']],
  'Solar storm':[['Too little mass faced the Sun.','So many protons got through that one latched up the computer and burned it out, and the crew went far past their 30-day dose limit.','Turn a tank or the engine toward the Sun. Shielding matters more than speed.']]
};
const adviceFor=(name,death)=>ADVICE[name]||[[name+'.',death,'Read the flight log and change the decision that caused it.']];
async function guide(title,rows){
  return tell('What went wrong',title,`<div class="gl"><ol>${rows.map(r=>`<li><b>${r[0]}</b><span>${r[1]}</span><em>${r[2]}</em></li>`).join('')}</ol></div>`,'Go to debrief');
}
async function lethal(name,run,death,boom=true){
  for(;;){const n=S.P.length,ok=await run();if(ok)return true;
    if(S.guided&&!S.second){S.second=true;S.P.length=n;await tell('Guided mode',name,`<p>${death}</p><p>One retry.</p>`,'Try again');continue;}
    S.dead=true;S.health=0;S.fail.push(name+'. '+death);lg(name+': '+death);
    if(boom){SFX.boom();await Cine.play('explosion',{big:'Mission lost',bigAt:.25,min:6,lines:[{text:death},{who:'reyes',text:'Flight, we have lost the spacecraft. Lock the doors. Save the data.'}]});}
    await guide(name,adviceFor(name,death));
    return false;}}
function mgOpen(kicker,title,body,wide){const o=document.createElement('div');o.className='overlay';
  o.innerHTML=`<div class="modal alert mg" role="dialog" aria-modal="true" style="max-width:${wide||760}px"><p class="kicker">${kicker}</p><h3>${title}</h3>${body}</div>`;
  document.body.appendChild(o);SFX.alarm();return o;}
function mgTimer(el,secs,onEnd,label='Time left'){let left=secs;const draw=()=>{el.innerHTML=meter(label,Math.max(0,left),secs,'s',left<secs*.3?'over':'warn');};draw();
  const iv=setInterval(()=>{left-=1;draw();if(left<=0){clearInterval(iv);onEnd();}},1000*Math.max(DEMO.k,.02));return ()=>clearInterval(iv);}

/* Solar storm. Every 5 g/cm² of material between the Sun and the crew and computer roughly halves the dose (a fair
   rule of thumb for solar protons behind moderate shielding). 25 rad is NASA's 30-day limit for an astronaut's
   blood-forming organs (25 cGy-Eq, NASA-STD-3001). Electronics are hurt by single particle hits rather than by the
   total dose: more protons getting through means more memory upsets, and in the worst case a latch-up that burns
   out the computer.
   Radiation never destroys the spacecraft. Too much of it upsets the computer, degrades detectors and raises the
   crew's dose, and those consequences carry through the rest of the mission. */
function evStorm(){return new Promise(res=>{
  const h=3+(Math.random()*3|0),D0=25*2**h,need=5*h,flip=Math.random()<.5,A='Tanks toward the Sun',B='Equipment bay toward the Sun';
  const opts=[{n:'Dish toward the Sun',s:3},{n:'Instrument deck toward the Sun',s:8,inst:1},{n:flip?A:B,s:need-3},{n:flip?B:A,s:need+1},{n:'Engine toward the Sun',s:need+12,cost:1}].sort(()=>Math.random()-.5);
  const o=mgOpen('Solar storm '+Help.q('storm'),'Turn the spacecraft',`<div class="readouts"><div><span>Unshielded dose</span><b class="num">${D0} rad</b></div><div><span>Crew 30-day limit</span><b class="num">25 rad</b></div><div><span>Dose halves every</span><b class="num">5 g/cm² ${Help.q('radiation')}</b></div></div>
    <div id="mgT"></div>${S.fl&&S.fl.on.includes('rad')?'<p class="dim" style="font-size:.86rem">Radiation monitor: proton flux rising for 25 s before the alarm. You have extra time.</p>':''}
    <div class="choices">${opts.map((x,i)=>`<button class="choice" data-i="${i}"><b>${x.n}</b><span>Shielding <b class="num" style="color:var(--amber)">${x.s} g/cm²</b>${x.cost?' · arrays in shadow':''}${x.inst?' · detectors exposed':''}</span></button>`).join('')}</div>`);
  let done=false;const fin=async i=>{if(done)return;done=true;stop();o.remove();const x=opts[i],dose=x?D0*Math.pow(.5,x.s/5):D0,lv=dose<=25.001?0:dose<=200?1:2,out=[];
    if(S.crew){const add=lv===0?(x&&x.cost?2:7):lv===1?20:35;S.crew.a.forEach(a=>a.rad=clamp(a.rad+add,0,100));if(lv)out.push(`Crew dose +${add}`);}
    if(x&&x.cost){S.health-=5;out.push('Battery ran deep in shadow');}
    if(lv){S.health-=lv===1?12:26;out.push(lv===1?'Computer memory upsets: one week in safe mode':'Computer rebooted twice: radio link lost for two weeks');
      const pool=(S.fl?S.fl.on:[]).filter(k=>!(S.radDeg||[]).includes(k)),hit=[];for(let n=0;n<lv&&pool.length;n++)hit.push(pool.splice(Math.random()*pool.length|0,1)[0]);
      if(x&&x.inst&&pool.length)hit.push(pool.splice(Math.random()*pool.length|0,1)[0]);S.radDeg=(S.radDeg||[]).concat(hit);hit.forEach(k=>out.push(`${INST[k].name}: detector degraded`));
      if(S.cr)S.cr.tick=Math.min(S.cr.N-1,S.cr.tick+lv);}
    pt('Solar storm',lv===0?(x.cost?9:15):lv===1?5:0,15);
    lg(`Solar storm: dose ${f0(dose)} rad.${out.length?' '+out.join('. ')+'.':''}`);
    await tell('Outcome',lv===0?'Storm weathered':lv===1?'Over the crew limit, computer upsets':'Heavy radiation damage',`<div class="readouts"><div><span>Dose received</span><b class="num">${f1(dose)} rad</b></div></div>${out.length?`<ul class="plain">${out.map(t=>`<li>${t}</li>`).join('')}</ul>`:''}`);
    if(lv===2){
      /* A dose this large takes the computer with it. Without a computer there is no braking burn, so the
         spacecraft sails past Mars. This is not a spacecraft explosion: it is a mission that misses. */
      S.dead=true;S.health=0;S.fail.push('Proton storm. The computer did not survive the dose, so the braking burn never ran.');
      lg('Proton storm: electronics lost. The spacecraft passed Mars without braking.');
      await Cine.play('missmars',{big:'Mars, and past it',bigAt:.5,min:10,lines:[
        {text:'The proton front arrives before the spacecraft can turn.'},
        {who:'reyes',text:'Telemetry is garbled. The computer is gone.'},
        {text:`${S.name} crosses Mars orbit with no way to slow down.`},
        {who:'park',text:'It is going past. There is nothing to send.'}]});
      await guide('Mars, and past it',[
        ['The spacecraft stayed side-on to the Sun.','Thin walls faced the storm. So many protons got through that one latched up the computer and burned it out.','Turn so a tank or the engine sits between the Sun and the bay. Read the shielding number, not the clock.'],
        ['No braking burn was possible.','With no computer the spacecraft could not turn or fire, so Mars went by.','Shielding is a choice you make in half a minute. Check the grams per square centimetre before you pick.']]);
      return res(false);}
    res(true);};
  const stop=mgTimer(o.querySelector('#mgT'),(S.guided?80:50)+(S.fl&&S.fl.on.includes('rad')?25:0),()=>fin(-1),'Proton front arrives in');
  o.querySelectorAll('.choice').forEach(b=>b.onclick=()=>fin(+b.dataset.i));
  window.__mini={solve:()=>fin(opts.findIndex(x=>x.s===need+1)),fail:()=>fin(opts.findIndex(x=>x.s===3))};
});}

/* A rock on a collision path. Rare (about one flight in twelve). The tracking plot shows the rock's path; the player
   decides which way to move and how hard to push. Engine tier sets the thrust available, a camera gives earlier
   warning, and a reinforced structure survives a graze. */
/* A rock passes close. The plot and the gap bar do the arithmetic, so the player reasons from the picture:
   push away from the rock's side, and push for long enough. The physics is the one shown on screen:
   sideways distance opened up = half x (thrust / mass) x burn time squared. */
function evRock(){return new Promise(res=>{
  const m=Math.round((S.mass||950)/10)*10,D=90+Math.round(Math.random()*6)*10,t=20+Math.round(Math.random()*8),
    FMAX=[450,800,1200][S.fl?S.sel.engine:1],need=220,tough=S.sel.structure>=2;
  const a=FMAX/m;
  let dir=1,tb=0,done=false;
  const o=mgOpen('Close pass '+Help.q('debris'),'Rock on a collision path',`<div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)"><div class="cvwrap"><canvas id="rk"></canvas></div>
    <div class="grid" style="gap:10px"><div class="readouts"><div><span>Closest pass if you do nothing</span><b class="num">${D} m</b></div><div><span>Safe separation</span><b class="num">${need} m</b></div><div><span>Time to closest approach</span><b class="num">${t} s</b></div><div><span>Mass / thrust</span><b class="num">${f0(m)} kg / ${FMAX} N</b></div></div>
      <div class="row"><span class="kicker">Push</span><button type="button" class="ghost" data-dir="1" aria-pressed="true">Away from the rock</button><button type="button" class="ghost" data-dir="-1" aria-pressed="false">Toward the rock</button></div>
      <label class="kicker" for="rkb">Burn time <span class="num" id="rkbL"></span></label><input type="range" id="rkb" min="0" max="${t}" step="1" value="0">
      <div id="rkOut"></div>
      <p class="dim" style="font-size:.82rem">Sideways distance = \u00bd \u00d7 (${FMAX} N \u00f7 ${f0(m)} kg) \u00d7 time\u00b2. The dashed line is the rock\u2019s path. Move away from it until the gap bar clears.</p>
      <div id="mgT"></div><button type="button" class="btn" id="rkGo">Fire thrusters</button></div></div>`,820);
  const c=cv(o.querySelector('#rk'),300,300),k=300/(D*4.4),cx=150,cy=150;
  const disp=()=>.5*a*tb*tb;
  const draw=()=>{const {ctx,w,h}=c;ctx.clearRect(0,0,w,h);
    ctx.strokeStyle='#3b2e27';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,8);ctx.lineTo(cx,h-8);ctx.moveTo(8,cy);ctx.lineTo(w-8,cy);ctx.stroke();
    const ry=cy+need*k>h-10?h-10:cy+D*k;   /* the rock's track, below the spacecraft */
    ctx.strokeStyle='rgba(239,93,82,.85)';ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(8,ry);ctx.lineTo(w-8,ry);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#b9a089';ctx.beginPath();ctx.arc(w-46,ry,6,0,7);ctx.fill();ctx.fillStyle='#a39686';ctx.font='10px "Martian Mono",monospace';ctx.fillText('rock path',12,ry-8);
    const y=cy-dir*disp()*k;ctx.fillStyle='#efe6d9';ctx.fillRect(cx-5,y-5,10,10);ctx.fillStyle='#8fc8da';ctx.fillRect(cx-13,y-2,7,4);ctx.fillRect(cx+6,y-2,7,4);
    ctx.strokeStyle='rgba(134,201,148,.7)';ctx.beginPath();ctx.moveTo(cx,y-8);ctx.lineTo(cx,y-8-need*k);ctx.stroke();
    ctx.fillStyle='#a39686';ctx.fillText('you',cx+10,y-8);ctx.fillText('100 m',14,cy-8);
    $('rkbL').textContent=tb+' s of '+t+' s';$('rkOut').innerHTML=meter('Gap when it passes',Math.max(0,D+dir*disp()),need,'m',(D+dir*disp())>=need?'ok':'over')+`<p class="num" style="font-size:.78rem;margin-top:4px">Propellant ${f1(massFor(a*tb))} kg</p>`;};
  o.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{dir=+b.dataset.dir;o.querySelectorAll('[data-dir]').forEach(x=>x.setAttribute('aria-pressed',x===b));SFX.toggle(dir>0);draw();});
  o.querySelector('#rkb').oninput=e=>{tb=+e.target.value;draw();};
  const fin=()=>{if(done)return;done=true;stop();SFX.thruster(.7);const gap=D+dir*disp(),graze=gap>=need*.75&&gap<need&&tough,clear=gap>=need||graze;
    o.querySelectorAll('button,input').forEach(x=>x.disabled=true);o.remove();
    const dv=a*tb;if(S.fl)burn(dv);
    if(graze)S.health-=30;if(clear)pt('Collision avoidance',graze?6:gap>=need*1.5?15:10,15);
    lg(`Close pass: opened ${f0(gap)} m of separation in ${tb} s of thrust, using ${f1(dv)} m/s.`);
    tell('Outcome',graze?'Grazed':clear?'Clear':'Impact',`<div class="readouts"><div><span>Separation at closest pass</span><b class="num">${f0(gap)} m</b></div><div><span>Safe separation</span><b class="num">${need} m</b></div><div><span>Propellant spent</span><b class="num">${f1(dv)} m/s</b></div></div>${graze?'<p>The reinforced structure held. Heavy damage.</p>':clear?'<p>The rock passes behind you. Everyone exhales.</p>':`<p>The gap closed instead of opening. A ${f0(Math.abs(gap))} m miss is not enough at 12 km/s.</p>`}`).then(()=>res(clear));};
  const stop=mgTimer(o.querySelector('#mgT'),S.guided?90:60,()=>{if(!done){done=true;stop();o.remove();lg('Close pass: no burn was made.');tell('Outcome','Impact','<p>No burn. The rock went through the spacecraft.</p>').then(()=>res(false));}},'Closest approach in');
  o.querySelector('#rkGo').onclick=fin;draw();
  window.__mini={solve:()=>{dir=1;tb=t;fin();},fail:()=>{dir=1;tb=0;fin();}};
});}

/* The toilet's water line bursts. Pressure P = F / A, and each full turn of the valve holds 20 kPa.
   The numbers are small enough to do in your head: the line carries 30 to 50 kPa, so two or three turns
   will hold it. A failure floods the avionics but does not end the mission. */
function evToilet(){return new Promise(async res=>{
  await Cine.play('toilet',{big:'Hygiene bay',bigAt:.5,min:7,lines:[{text:'The water line behind the toilet has burst.'},{text:'In free fall the water does not drain. It drifts toward the avionics rack.'}]});
  const F=24+2*(Math.random()*8|0),A=8,P=F/A*10,per=20,need=Math.ceil(P/per),FILL=S.guided?110:80;
  const o=mgOpen('Water line burst','Close the valve',`<div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)"><div class="cvwrap"><canvas id="wr"></canvas></div>
    <div class="grid" style="gap:8px"><div class="readouts"><div><span>Pump force F</span><b class="num">${F} N</b></div><div><span>Pipe area A</span><b class="num">${A} cm²</b></div><div><span>One full turn holds</span><b class="num">${per} kPa</b></div><div><span>Line pressure</span><b class="num">${f0(P)} kPa</b></div></div>
      <p class="row between"><span class="num" style="font-size:1.5rem" id="wrN">0 turns</span>${Help.q(Help.temp({t:'Line pressure',what:'Pressure is force spread over an area: P = F ÷ A.',why:'The valve must hold at least the pressure in the line, or it is pushed back open.',act:'Divide the force by the area, then add half-turns until you pass it. One N/cm² is 10 kPa.'}))}</p><div id="wrW"></div>
      <div class="row"><button type="button" class="btn" id="wrGo">Turn ½</button><button type="button" class="ghost" id="wrDone">Let go</button></div></div></div>`,780);
  const c=cv(o.querySelector('#wr'),260,220);let turns=0,water=0,done=false,last=performance.now(),shown=0;
  const blobs=[...Array(14)].map((_,i)=>({x:70+Math.random()*30,y:60+Math.random()*100,r:3+Math.random()*6,v:8+Math.random()*14,p:i}));
  const fin=async(ok,why)=>{if(done)return;done=true;o.remove();
    if(ok)pt('Water line burst',turns<=need+.5?10:7,10);
    else{S.health=Math.max(5,S.health-18);S.calib=Math.max(.6,S.calib-.12);if(S.crew)S.crew.a.forEach(a=>a.stress=clamp(a.stress+14,0,100));}
    lg('Water line burst. '+(ok?`Held with ${turns} turns.`:why));
    await tell('Outcome',ok?'Leak contained':'Avionics flooded',`<div class="readouts"><div><span>Line pressure</span><b class="num">${f0(P)} kPa</b></div><div><span>Your valve held</span><b class="num">${f0(turns*per)} kPa</b></div></div>${ok?'<p>Dry bay, intact computer, and one very relieved crew.</p>':`<p>${why}</p><p>The computer shorted but restarted. Data quality and crew stress took the hit, not the mission.</p>`}`);res(true);};
  const frame=now=>{if(done||!o.isConnected)return;const dt=Math.min(.1,(now-last)/1000)/Math.max(DEMO.k,.02);last=now;const open=Math.max(.12,1-turns/need);
    water+=dt/FILL*100*open;shown+=(turns-shown)*.25;
    const {ctx}=c;ctx.clearRect(0,0,260,220);
    ctx.fillStyle='#2b2623';ctx.fillRect(0,0,260,220);ctx.strokeStyle='#3d3632';for(let x=0;x<260;x+=52){ctx.strokeRect(x+2,2,48,216);}ctx.fillStyle='#e9e5dc';ctx.fillRect(0,196,260,6);
    ctx.fillStyle='#16191f';ctx.fillRect(206,24,48,150);for(let i=0;i<6;i++){ctx.fillStyle=water>70&&i%2?'#ef5d52':'#86c994';ctx.fillRect(212,34+i*22,6,6);ctx.fillStyle='#3a4250';ctx.fillRect(224,32+i*22,24,10);}
    ctx.strokeStyle='#8d8a84';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(0,105);ctx.lineTo(54,105);ctx.stroke();
    for(const b of blobs){b.x+=b.v*dt*open*4;b.y+=Math.sin(now/600+b.p)*.3;if(b.x>205){b.x=74;b.y=60+Math.random()*100;}if(turns<need||b.x>90){ctx.fillStyle='rgba(143,200,218,.55)';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill();ctx.fillStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.arc(b.x-b.r*.3,b.y-b.r*.3,b.r*.25,0,7);ctx.fill();}}
    ctx.save();ctx.translate(72,105);ctx.fillStyle='#5a4a40';ctx.beginPath();ctx.arc(0,0,30,0,7);ctx.fill();ctx.rotate(shown*Math.PI*2);
    ctx.fillStyle='#c6cad0';ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*19,Math.sin(a)*19);}ctx.fill();ctx.fillStyle='#16171b';ctx.fillRect(-2,-15,4,10);
    ctx.fillStyle='#ea6f3c';ctx.fillRect(14,-6,84,12);ctx.beginPath();ctx.arc(0,0,25,-.55,.55);ctx.lineTo(14,6);ctx.lineTo(14,-6);ctx.fill();
    ctx.fillStyle='#f4f1ea';ctx.beginPath();ctx.ellipse(104,0,17,12,0,0,7);ctx.fill();ctx.fillRect(104,-9,60,18);ctx.fillStyle='#d9a441';ctx.fillRect(140,-9,5,18);ctx.restore();
    o.querySelector('#wrN').textContent=`${turns} turn${turns===1?'':'s'}`;o.querySelector('#wrW').innerHTML=meter('Water reaching the avionics rack',water,100,'%',water>70?'over':'warn');
    if(water>=100)return fin(false,'The water reached the rack before the valve held.');
    requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
  const turn=()=>{if(done)return;turns+=.5;SFX.blip(300+turns*20,.05,.04,'square');if(turns>need+2)fin(false,'The thread stripped and the line opened fully.');};
  o.querySelector('#wrGo').onclick=turn;
  o.querySelector('#wrDone').onclick=()=>turns>=need?fin(true):fin(false,'The line pressure pushed the valve back open.');
  window.__mini={solve:()=>{turns=need;fin(true);},fail:()=>{turns=0;fin(false,'The line pressure pushed the valve back open.');}};
});}

/* Instrument fault. Nothing is highlighted: each channel shows a reading and its normal range, and the player
   switches off the ones that are out of range. Three healthy channels switched off and the fault spreads. */
function evPanel(name){return new Promise(res=>{
  const CH=[['BUS A','A',1,2,1],['BUS B','A',1,2,1],['HTR 1','°C',15,30,0],['HTR 2','°C',15,30,0],['DET PWR','V',27,29,1],['FPA COOL','K',70,90,0],['CAL LAMP','mA',40,60,0],['DATA LNK','err/s',0,5,0]],N=CH.length,bad=new Set();while(bad.size<3)bad.add(Math.random()*N|0);
  const val=(c,i)=>{const sp=c[3]-c[2];return bad.has(i)?(Math.random()<.5?c[3]+sp*(.5+Math.random()):Math.max(0,c[2]-sp*(.5+Math.random()*.8))):c[2]+sp*(.15+Math.random()*.7);},V=CH.map(val);
  CH.forEach((c,i)=>{if(bad.has(i)&&V[i]>=c[2]&&V[i]<=c[3])V[i]=c[3]+(c[3]-c[2])*.8;});
  const o=mgOpen(`${name} fault `+Help.q('fault'),'Isolate the fault',`<p>Switch off every channel reading outside its normal range.</p>
    <div class="row between"><div id="mgT" style="flex:1;min-width:200px"></div><span class="pill warn" id="pnS">Healthy channels cut 0 / 3</span></div>
    <div class="cpanel">${CH.map((c,i)=>`<button class="tsw on" data-i="${i}" aria-pressed="true"><span class="tled"></span><span class="tlab">${c[0]}</span><span class="tslot"><i></i></span><span class="tval num">${V[i].toFixed(c[4])} ${c[1]}</span><span class="trng">${c[2]}–${c[3]}</span></button>`).join('')}</div>`,720);
  let strikes=0,done=false;const fin=ok=>{if(done)return;done=true;stop();setTimeout(()=>{o.remove();if(ok)pt('Instrument fault',strikes?10-strikes*2:10,10);res(ok);},ok?500:300);};
  const hit=i=>{if(done)return;const b=o.querySelector(`.tsw[data-i="${i}"]`);if(!b.classList.contains('on'))return;b.classList.remove('on');b.setAttribute('aria-pressed','false');
    if(bad.has(i)){bad.delete(i);SFX.blip(1100,.06);if(!bad.size)fin(true);}
    else{strikes++;b.classList.add('wrong');SFX.blip(160,.2,.06,'square');o.querySelector('#pnS').textContent=`Healthy channels cut ${strikes} / 3`;if(strikes>=3)fin(false);}};
  o.querySelectorAll('.tsw').forEach(b=>b.onclick=()=>hit(+b.dataset.i));
  const stop=mgTimer(o.querySelector('#mgT'),S.guided?60:35,()=>fin(false),'Bus trips in');
  window.__mini={solve:()=>[...bad].forEach(hit),fail:()=>fin(false)};
});}

/* ---------- debrief ---------- */
function score(){
  const f=S.fl||{},o=S.ops||{delivered:0,collected:0,lost:0,sci:{},store:[]};
  const sci=(r,k)=>o.sci[r+k]||0,any=k=>Object.keys(REG).some(r=>sci(r,k)>0);
  const total=o.collected+o.lost;
  const obj=[['Reach Mars',!!S.reached,15],['Enter a stable orbit',!!S.orbitOK,25],['Collect atmospheric measurements',any('mcs')||any('tes'),15],
    ['Map selected surface regions',Object.keys(REG).filter(r=>sci(r,'cam')>0||sci(r,'ctx')>0).length>=2,15],
    ['Investigate evidence of past water',sci('jezero','spec')>0||sci('valles','spec')>0||sci('polar','radar')>0||sci('jezero','radar')>0||sci('polar','grs')>0||sci('jezero','tes')>0,15],
    ['Transmit data to Earth',total>0&&o.delivered/total>=.8,15]];
  const R=clamp(o.delivered/185*100,0,100),O=obj.reduce((s,x)=>s+(x[1]?x[2]:0),0);
  const lf=f.prop0?S.prop/f.prop0:1;
  const eff={Data:total?o.delivered/total:0,Propellant:S.orbitOK?(lf<=.2?1:1-(lf-.2)):.2,Budget:clamp(1-Math.max(0,(f.cost||BUDGET)-130)/50*.5,.5,1),Mass:clamp(1-Math.max(0,(f.wet0||MASS_CAP)-950)/250*.4,.6,1)};
  const E=Object.values(eff).reduce((s,x)=>s+x,0)/4*100;
  const pg=S.P.reduce((s,x)=>s+x.got,0),pm=S.P.reduce((s,x)=>s+x.max,0);
  const P=clamp((pm?pg/pm*100:0)-S.retries*10,0,100),L=clamp(S.health,0,100);
  const C=S.crew?(S.crew.a.some(a=>a.health<=0)?0:crewAvg('health')):100;
  const total_=.30*R+.20*O+.15*E+.15*C+.1*P+.1*L;
  if(S.orbitOK&&o.delivered<=0&&!S.fail.includes('No science data reached Earth'))S.fail.push('No science data reached Earth');
  const cls=S.fail.length?['fail','Mission failed']:total_>=85?['good','Outstanding mission']:total_>=70?['good','Mission success']:total_>=50?['mid','Partial success']:['mid','Marginal mission'];
  return {R,O,E,P,L,C,S:total_,obj,eff,cls,sci,any};
}
VIEW.debrief=()=>{
  const sc=score(),f=S.fl,o=S.ops;
  if(S.race&&window.Race)Race.finish({score:Math.round(sc.S),cls:sc.cls[1],failed:!!S.fail.length});
  if(S.landing&&!S.fail.length){if(!CAMP.m1||sc.S>=(CAMP.m1.score||0))CAMP.m1={score:Math.round(sc.S),cls:sc.cls[1],site:S.landing,survey:S.survey||[]};else{CAMP.m1.site=S.landing;CAMP.m1.survey=S.survey||[];}saveCamp();}
  try{const b=JSON.parse(localStorage.getItem('mcb-rf-best'));if(!b||sc.S>b.s)localStorage.setItem('mcb-rf-best',JSON.stringify({s:Math.round(sc.S),c:sc.cls[1]}));}catch(e){}
  const echo=o&&(o.sci.polarradar||0)>0;
  const epi=S.fail.length?say('reyes','We lost it. Read the flight log, find the decision that did it, and fly again. Every real mission team learns this way.'):echo?say('lind',`Kestrel’s echo was the floor of the polar ice: two kilometers of frozen water, layer on layer. It is going in the textbooks, with ${S.name}’s name on it.`):say('lind','Good data, and real answers. But Kestrel’s echo is still down there under the pole, unexplained. Next time, take the radar north.');
  const cats=[['R','Scientific return',30,sc.R,'Science value that reached Earth, against a strong mission’s 185'],['O','Objective completion',20,sc.O,'Six primary objectives'],['C','Crew',15,sc.C,'Average crew health at the end'],
    ['E','Resource efficiency',15,sc.E,Object.entries(sc.eff).map(([k,v])=>`${k} ${f0(v*100)}`).join(' · ')],['P','Operational performance',10,sc.P,`${S.P.length} decisions${S.retries?`, ${S.retries} insertion retr${S.retries>1?'ies':'y'}`:''}`],['L','Reliability',10,sc.L,'Spacecraft health at end of mission']];
  const cmp=(title,k,region,sim,ref,cvId,quiz)=>`<div class="panel"><p class="kicker">${title}</p><div class="cvwrap"><canvas id="${cvId}"></canvas></div>
    <div class="two"><div class="sim"><p class="kicker" style="color:var(--rust)">Your simulated result</p><p style="font-size:.9rem">${sc.any(k)?sim:`No ${INST[k].name.toLowerCase()} data reached Earth, so this question stays open for your mission.`}</p></div>
    <div class="ref"><p class="kicker" style="color:var(--ice)">What NASA observed</p><p style="font-size:.9rem">${ref}</p></div></div>${quiz||''}</div>`;
  main.innerHTML=head(9,'Debrief','ASEA Science Operations Center')+`
  <section class="panel"><div class="score"><div class="S num">${f0(sc.S)}</div><div class="grid" style="gap:8px">
    <span class="banner ${sc.cls[0]}">${sc.cls[1]}</span>
    <p class="num" style="font-size:.78rem">S = 0.30×${f0(sc.R)} + 0.20×${f0(sc.O)} + 0.15×${f0(sc.E)} + 0.15×${f0(sc.C)} + 0.10×${f0(sc.P)} + 0.10×${f0(sc.L)} = ${f1(sc.S)}</p>
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
      '')}
    ${cmp('Question 2 · the atmosphere','mcs','valles',`Your profiler returned ${f1(sc.sci('jezero','mcs')+sc.sci('valles','mcs')+sc.sci('polar','mcs'))} science units of temperature, dust and water-vapor profiles.`,
      'Mars Climate Sounder profiles the atmosphere from the surface to about 80 km. During dust storms the middle atmosphere warms by tens of degrees as dust absorbs sunlight.','cMcs')}
    ${cmp('Question 3 · subsurface ice','radar','polar',`Your radar returned ${f1(sc.sci('jezero','radar')+sc.sci('valles','radar')+sc.sci('polar','radar'))} science units. Stacked reflectors under the polar cap mark layers of ice and dust.`,
      'SHARAD showed the north polar layered deposits are about 2 km thick and almost entirely water ice, and found buried glaciers at mid-latitudes under a blanket of rock debris.','cRad')}
    <div class="panel"><p class="kicker">Surface imaging</p><p style="font-size:.92rem" class="sim">${sc.any('cam')?`Your camera imaged ${Object.keys(REG).filter(r=>sc.sci(r,'cam')>0).map(r=>REG[r].n).join(', ')}.`:'No camera data reached Earth.'}</p>
      <p style="font-size:.92rem" class="ref">HiRISE resolves objects about a meter across from 300 km up. Mars Odyssey’s THEMIS maps surface temperature by day and night, which separates bare rock from dust.</p>
      <p class="kicker">Real archives to compare against</p><ul class="plain" style="font-size:.9rem"><li><a href="https://www.uahirise.org/">HiRISE image archive</a></li><li><a href="https://pds-geosciences.wustl.edu/missions/mro/">NASA PDS Geosciences Node: CRISM and SHARAD</a></li><li><a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons planetary positions</a></li><li><a href="https://www.nasa.gov/smallsat-institute">NASA Small Spacecraft Systems Virtual Institute: “Design and Develop Science Missions”</a></li><li><a href="https://www.nasa.gov/reference/systems-engineering-handbook/">NASA Systems Engineering Handbook</a></li><li><a href="https://sourceforge.net/projects/gmat/">GMAT, NASA’s open-source mission analysis tool</a></li><li>Planet maps in the 3D scenes: Mars by JPL/Caltech/USGS and Earth from NASA’s Blue Marble, as distributed with GMAT R2026a</li></ul>
      ${teach('Scientific interpretation, evidence, uncertainty.')}</div></section>
  <section class="grid g2"><div class="panel"><p class="kicker">Mission archive</p><div class="tw"><table>
    ${f?`<tr><th>Departure</th><td>${dateStr(f.dep)}, ${TR[S.transfer].n}, ${f0(f.tr.T)} days</td></tr><tr><th>Orbit plan</th><td>${ORB[f.orbit].n}</td></tr>
    <tr><th>Spacecraft</th><td>${S.name}, ${f0(f.wet0)} kg, ${money(f.cost)}, design reliability ${f1(f.rel*100)}%</td></tr><tr><th>Systems</th><td>${Object.keys(SYS).map(k=>tier(k).n).join(', ')}, ${oxyOf(S.fl?S.fl.oxy:S.oxy).n}${S.red?', redundant critical components':''}</td></tr>
    <tr><th>Instruments</th><td>${f.on.map(k=>INST[k].name).join(', ')}</td></tr><tr><th>Propellant left</th><td>${f0(S.prop)} of ${f0(f.prop0)} kg</td></tr>`:''}
    ${o?`<tr><th>Science</th><td>${f1(o.delivered)} delivered, ${f1(o.lost)} lost on board</td></tr>`:''}</table></div>
    <div class="row"><button class="ghost" id="copy">Copy mission report</button><button class="ghost" id="gmat">Export flight plan for GMAT</button></div></div>
    <div class="panel"><p class="kicker">Flight log</p><div class="log" style="max-height:260px">${S.log.map(l=>`<div><b>›</b> ${l}</div>`).join('')}</div></div></section>
  <section class="panel" style="border-color:${S.fail.length?'var(--line)':'var(--rust)'}"><p class="kicker">${S.fail.length?'Locked':'Unlocked'}</p><h3>${S.fail.length?'Europa stays out of reach':'Mission 2: Beneath the Ice'}</h3>
    <p class="dim">${S.fail.length?'Complete The Red Frontier without a hard failure to open the Europa mission.':'Europa mission access, advanced propulsion and orbital-planning components, improved autonomy and new notebook entries. The Europa mission itself is not built yet.'}</p></section>
  <div class="nav"><button class="ghost" id="again">Main menu</button>${S.landing&&!S.fail.length?`<div class="row"><span class="pill go">Landing site: ${LSITE[S.landing][1]}</span><button class="btn" id="toM2">Mission 2</button></div>`:''}</div>`;
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
  $('gmat').onclick=exportGmat;
  if($('toM2'))$('toM2').onclick=()=>{const nm=S.name,gd=S.guided;S=fresh();S.mission=2;S.name=nm;S.guided=gd;S.m2={site:CAMP.m1.site,fromM1:true,survey:CAMP.m1.survey};go('m2brief');};
  $('again').onclick=()=>{S=fresh();go('title');};
  $('copy').onclick=async()=>{const t=`THE RED FRONTIER — mission report\nScore ${f1(sc.S)} (${sc.cls[1]})\nR ${f0(sc.R)}  O ${f0(sc.O)}  E ${f0(sc.E)}  P ${f0(sc.P)}  L ${f0(sc.L)}  Aura ${f0(S.aura)}\n${S.fail.length?'Hard failures: '+S.fail.join('; ')+'\n':''}\n${S.log.join('\n')}`;
    try{await navigator.clipboard.writeText(t);toast('Mission report copied.');}catch(e){toast('Copy was blocked by the browser.');}};
};

/* ============ notebook and demo controls ============ */
$('nbBtn').onclick=()=>{const seen=NB.filter(n=>STAGES.indexOf(n[0])<=S.max);
  ask({kicker:`Engineering notebook · ${seen.length} of ${NB.length} entries`,title:'Notebook',body:seen.length?`<div class="tw"><table>${seen.map(n=>`<tr><th style="white-space:nowrap">${n[1]}</th><td>${n[2]}</td></tr>`).join('')}</table></div>`:'<p class="dim">Entries appear as you reach each stage of a mission.</p>',choices:[{label:'Close'}]});};
if(/[?&]demo\b/.test(location.search))document.body.classList.add('demo');
$('demoBtn').onclick=async()=>{
  const r=await ask({kicker:'For demos and testing',title:'Demo controls',body:'<p class="dim">Trigger a random event or replay a cutscene. Drills do not count toward the mission. The bolt and lights events do.</p>',choices:[
    {label:'Solar storm (drill)',value:'storm'},{label:'Rock on a collision path (drill)',value:'rock'},{label:'The toilet exploded (drill)',value:'toilet'},{label:'Instrument malfunction (drill)',value:'panel'},{label:'A bolt fell out',value:'bolt'},{label:'Lights shut off',value:'lights'},{label:'Everything explodes (drill)',value:'boom'},{label:'Replay a cutscene',value:'cine'},{label:'Close',value:'x'}]});
  {const dr={storm:evStorm,rock:evRock,toilet:evToilet,panel:()=>evPanel('High-resolution camera')}[r];if(dr){const n=S.P.length,ok=await dr();S.P.length=n;toast(ok?'Drill passed.':'Drill failed. In a real mission that ends the flight.');}}
  if(r==='bolt')evBolt();if(r==='lights')evLights();if(r==='boom')explode(true);
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
${sc}.INC = ${site().inc};
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
/* Console sound, synthesized with Web Audio. There are no files to load and nothing to go missing.
   Sounds are short and share one master gain and one compressor. A repeated sound is skipped if it would
   start within 40 ms of the last one, so clicks never stack into a buzz. The player's choice is remembered. */
const SFX=(()=>{
  let ac=null,on=true,master=null,hum=null,last={};
  try{on=localStorage.getItem('mcb-sfx')!=='0';}catch(e){}
  const ctx=()=>{if(!ac){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ac=new C();
    const comp=ac.createDynamicsCompressor();comp.threshold.value=-18;comp.knee.value=20;comp.ratio.value=4;
    master=ac.createGain();master.gain.value=.9;master.connect(comp);comp.connect(ac.destination);}return ac;};
  const gate=k=>{const t=performance.now();if(last[k]&&t-last[k]<40)return false;last[k]=t;return on;};
  function tone(f=900,d=.06,v=.04,type='sine',slide=0){if(!gate('t'+f))return;const a=ctx();if(!a)return;
    const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=type;o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,f+slide),t+d);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(master);o.start(t);o.stop(t+d+.03);}
  let noise=null;
  const nbuf=a=>{if(noise)return noise;const b=a.createBuffer(1,Math.floor(a.sampleRate*2),a.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;noise=b;return b;};
  function hiss(d=.2,v=.05,f=1200,q=.7,to){if(!gate('h'))return;const a=ctx();if(!a)return;
    const src=a.createBufferSource();src.buffer=nbuf(a);src.loop=true;
    const bp=a.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
    const g=a.createGain(),t=a.currentTime;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    if(to)bp.frequency.exponentialRampToValueAtTime(to,t+d);
    src.connect(bp);bp.connect(g);g.connect(master);src.start(t);src.stop(t+d+.02);}
  function ambient(){try{const a=ctx();if(!a)return;if(a.state==='suspended')a.resume();if(hum){hum.gain.setTargetAtTime(on?.02:0,a.currentTime,.5);return;}if(!on)return;
    hum=a.createGain();hum.gain.value=0;const lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.value=240;lp.connect(hum);hum.connect(master);
    for(const f of[55,82.5,110]){const o=a.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(lp);o.start();}
    hum.gain.setTargetAtTime(.02,a.currentTime,.9);}catch(e){}}
  return {ambient,
    get on(){return on},
    set(v){on=v;try{localStorage.setItem('mcb-sfx',v?'1':'0');}catch(e){}ambient();},
    click(strong){tone(strong?560:880,.045,strong?.05:.03,'triangle',strong?-60:40);},
    toggle(state){tone(state?740:420,.07,.035,'square');},
    blip(f=920,d=.05,v=.035,type='sine'){tone(f,d,v,type);},
    chime(){tone(880,.09,.035,'sine');setTimeout(()=>tone(1320,.12,.03,'sine'),90);},
    alarm(){tone(440,.2,.05,'square');setTimeout(()=>tone(330,.28,.05,'square'),230);hiss(.25,.02,900,1);},
    radio(){hiss(.35,.03,1600,.8);setTimeout(()=>tone(1000,.1,.03,'sine'),120);},
    thruster(d=.6){hiss(d,.06,420,.5,180);},
    deploy(){tone(180,.25,.03,'sawtooth',320);hiss(.3,.02,700,1,1400);},
    boom(){hiss(1.1,.12,300,.4,90);tone(70,.7,.08,'sine',-20);}};
})();

/* audio settings: sound effects and narration are separate, and both are remembered */
function audioPanel(){const o=document.createElement('div');o.className='overlay';
  o.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:460px"><p class="kicker">Settings</p><h3>Audio</h3>
    <label class="row" style="gap:8px"><input type="checkbox" id="auS" ${SFX.on?'checked':''}> <span><b>Console sounds.</b> Hum, key clicks and alarms.</span></label>
    <label class="row" style="gap:8px"><input type="checkbox" id="auV" ${Voice.on?'checked':''} ${Voice.available?'':'disabled'}> <span><b>Narrator.</b> Reads cutscenes and briefings aloud${Voice.available?'':' (not available in this browser)'}. Subtitles always stay on.</span></label>
    <label class="kicker" for="auVol">Narrator volume</label><input type="range" id="auVol" min="0" max="1" step="0.05" value="${Voice.vol}">
    <div class="row"><button class="ghost" id="auT">Test the narrator</button><button class="btn" id="auX">Done</button></div></div>`;
  document.body.appendChild(o);const q=s=>o.querySelector(s);
  q('#auS').onchange=e=>{SFX.set(e.target.checked);};q('#auV').onchange=e=>{Voice.set(e.target.checked);};q('#auVol').oninput=e=>Voice.setVol(e.target.value);
  q('#auT').onclick=()=>{const was=Voice.on;Voice.set(true);Voice.say('Six years ago, Kestrel reached Mars. It never called home again.','narrator');if(!was){q('#auV').checked=true;}};
  q('#auX').onclick=()=>o.remove();}
{const b=$('sfxBtn');if(b){b.textContent='Audio';b.removeAttribute('aria-pressed');b.onclick=audioPanel;}
  addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('button');if(!t||t.id==='sfxBtn')return;SFX.ambient();SFX.click(t.classList.contains('btn')||t.classList.contains('choice'));},true);
  /* UTC comes from the device clock (toISOString is always UTC, never local time), corrected against the
     server's Date header when the device clock is off by more than a couple of seconds */
  let utcOff=0;try{fetch(location.href,{method:'HEAD',cache:'no-store'}).then(r=>{const d=r.headers.get('date');if(d){const o=new Date(d).getTime()-Date.now();if(Math.abs(o)>2500&&Math.abs(o)<864e5*366)utcOff=o;}}).catch(()=>{});}catch(e){}
  const ck=$('clock');if(ck){const tk=()=>{const s=new Date(Date.now()+utcOff).toISOString();ck.textContent='UTC '+s.slice(0,10)+' '+s.slice(11,19);};tk();setInterval(tk,1000);}}

/* ============ boot ============ */
if(typeof installM2==='function')installM2();
BG=Models.backdrop($('bg'));if(!BG){const c=$('bg');if(c)c.remove();document.body.classList.add('nobg');}
function start(data){
  if(data&&data.stage){
    S=data;
    /* saves from before the science stage was merged open on the merged screen */
    if(S.stage==='science'||S.stage==='payload')S.stage='design';
    if(!S.oxy)S.oxy='regen';
    if(!VIEW[S.stage])S.stage='title';
    RUN++;chrome();setScene(S.stage);VIEW[S.stage]();}
  else go('title');
}
/* back-to-top button: appears once the page has been scrolled a screen down */
{const tb=$('topBtn');if(tb){const sh=()=>tb.classList.toggle('show',scrollY>innerHeight*.6);addEventListener('scroll',sh,{passive:true});sh();
  tb.onclick=()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}
/* ---------- race hooks (js/race.js) ---------- */
window.__raceStart=(mission,seed,site,name)=>{const gd=$('guided')?$('guided').checked:true;Voice.stop();
  S=fresh();S.mission=mission;S.name=name||'Wayfarer';S.guided=gd;S.race={seed,code:window.Race?Race.code:''};store.del('mcb-save');
  if(mission===2){S.m2={site,fromM1:false,survey:null,rover:CAMP.rover?JSON.parse(JSON.stringify(CAMP.rover)):undefined,seed};go('m2brief');}
  else{pickWindow();go('briefing');}};
window.__raceProgress=()=>{let score=0;try{score=S.mission===2?(window.__m2?__m2.score2().total:0):score_();}catch(e){}
  const t=track(),i=stageIdx(S.stage);return {mission:S.mission,stage:i>=0?t[i][1]:S.stage==='title'?'Menu':S.stage,step:Math.max(0,i)+1,of:t.length,score:Math.round(score),failed:!!(S.dead||S.fail.length)};};
const score_=()=>{const sc=score();return S.stage==='title'?0:sc.S;};
window.__game={SITES,OXY,INST,crewTick,get S(){return S},DEMO,go,plan,design,checks,propNeeded,bestDep,pickWindow,windowOf,scanWindows,makeSchedule,boltP,evRock,evToilet,evStorm,gmatScript};
window.claude?.hot?.snapshot?.(()=>S);
VIEW.science=VIEW.design; /* old links and old saves land on the merged screen */
/* No screen in this game submits a form. Making that explicit keeps a stray click from reloading the page. */
document.addEventListener('submit',e=>e.preventDefault(),true);
if(window.claude?.hot?.ready)window.claude.hot.ready(()=>start(window.claude.hot.data??{}));else start({});
