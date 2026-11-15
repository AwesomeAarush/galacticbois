"use strict";
/* Rover engineering for Mission 2: the parts catalog, the instrument catalog and the calculator that turns a
   configuration into numbers. Every screen and the expedition read the same calculator (RK.spec), so the
   preparation bay, the 3D model and the drive itself always agree.

   All masses, powers, costs and rates here are simplified game values. They are loosely modelled on real
   rover hardware (the "tag" names the class of instrument each one imitates) but they are not NASA
   specifications. Time on the surface runs fast in the game (12 Mars seconds per real second), so energy and
   data rates are tuned to that pace.

   A configuration (cfg) is a plain object; RK.defaults() lists every field. */
const RK=(()=>{
  const LIMIT=900,BUDGET=110,BUS={mass:260,cost:30,rel:.99,load:45};
  /* ---------- parts, by tab. Each option: n name, s one-line summary, mass kg, cost $M, plus its effects ---------- */
  const CAT={
    mobility:{label:'Mobility',help:'mobility',groups:{
      wheel:{label:'Wheels and tread',opts:{
        std:{n:'Machined aluminum, chevron cleats',s:'The model’s own wheels. Light and proven.',mass:54,cost:3,rel:.96,sand:.55,wear:1,roll:1},
        curved:{n:'Thick aluminum, curved treads',s:'Tougher skin, smoother ride over sharp rock.',mass:66,cost:5,rel:.985,sand:.6,wear:.6,roll:1.02},
        sand:{n:'Wide sand wheels, tall grousers',s:'Float on loose sand. Heavier and draggier on rock.',mass:84,cost:5,rel:.96,sand:.85,wear:.9,roll:1.12},
        mesh:{n:'Woven wire-mesh tires',s:'Flex instead of puncturing. Little Mars experience.',mass:48,cost:9,rel:.93,sand:.8,wear:.45,roll:.97}}},
      wsize:{label:'Wheel diameter',opts:{
        s:{n:'0.45 m',s:'Lighter. Smaller rocks stop it.',k:.85,mass:0,cost:0},
        m:{n:'0.525 m',s:'Perseverance-size.',k:1,mass:0,cost:0},
        l:{n:'0.60 m',s:'Rolls over taller rocks, sinks less. Heavier.',k:1.18,mass:0,cost:1}}},
      susp:{label:'Suspension',opts:{
        rb:{n:'Rocker-bogie',s:'Keeps all six wheels on the ground over rough terrain.',mass:70,cost:4,rel:.98},
        active:{n:'Rocker-bogie with active lift',s:'Can raise the body and walk out of soft sand. Uses power.',mass:95,cost:9,rel:.95,power:12},
        rigid:{n:'Rigid axles with springs',s:'Light and simple. Bounces and tilts on rough ground.',mass:45,cost:2,rel:.99}}},
      clear:{label:'Ground clearance',opts:{
        low:{n:'Low · 0.5 m',s:'Very stable. Many rocks block it.',mass:0,cost:0},
        std:{n:'Standard · 0.6 m',s:'Balanced.',mass:0,cost:0},
        high:{n:'High · 0.72 m',s:'Clears bigger rocks. Tips more easily on slopes.',mass:8,cost:1}}},
      dims:{label:'Rover size',opts:{
        compact:{n:'Compact · 2.6 m',s:'Light and nimble. Less deck space.',mass:-45,cost:-2,deck:3},
        std:{n:'Standard · 3.0 m',s:'Perseverance-class.',mass:0,cost:0,deck:4},
        long:{n:'Long wheelbase · 3.4 m',s:'Steady and roomy. Heavier, turns slowly.',mass:55,cost:3,deck:6}}},
      chassis:{label:'Frame',opts:{
        alu:{n:'Aluminum frame',s:'The standard choice.',mass:140,cost:6,rel:.97,tough:1},
        comp:{n:'Carbon composite',s:'Light. Cracks rather than bends under impact.',mass:105,cost:12,rel:.96,tough:1.2},
        reinf:{n:'Reinforced titanium frame',s:'Shrugs off knocks. Heavy.',mass:185,cost:11,rel:.99,tough:.65}}}}},
    power:{label:'Power',help:'rpower',groups:{
      power:{label:'Power source',opts:{
        solar:{n:'Solar deck and wings',s:'280 W at noon. Falls with dust and low sun.',mass:45,cost:6,rel:.98,peak:280,rtg:0},
        solarL:{n:'Large solar wings',s:'400 W at noon. Wider, heavier, gathers more dust.',mass:70,cost:10,rel:.98,peak:400,rtg:0},
        rtg:{n:'Radioisotope generator',s:'110 W day and night, and its heat warms the rover. Scarce and costly.',mass:45,cost:38,rel:.99,peak:0,rtg:110},
        hybrid:{n:'Small generator with short wings',s:'60 W steady plus 170 W at noon.',mass:68,cost:28,rel:.985,peak:170,rtg:60},
        battery:{n:'Battery only',s:'No generation. An extra battery module instead.',mass:18,cost:2,rel:.995,peak:0,rtg:0,extra:600}}},
      battery:{label:'Battery',opts:{
        s:{n:'800 Wh',s:'Light.',wh:800,mass:20,cost:2},
        m:{n:'1,200 Wh',s:'Standard.',wh:1200,mass:30,cost:4},
        l:{n:'1,800 Wh',s:'Long range. Heavy.',wh:1800,mass:45,cost:7}}}}},
    arm:{label:'Arm and sampling',help:'rarm',groups:{
      arm:{label:'Robot arm',opts:{
        none:{n:'No arm',s:'No drilling, no contact instruments.',mass:0,cost:0,slots:0,rel:1},
        light:{n:'3-joint arm, 1.0 m reach',s:'A drill and one contact tool.',mass:30,cost:4,slots:2,rel:.98},
        full:{n:'5-joint arm, 2.1 m reach',s:'A drill and two contact tools.',mass:55,cost:6,slots:3,rel:.97}}},
      drill:{label:'Sampling tool',opts:{
        core:{n:'Rotary-percussive coring drill',s:'Cuts sealed rock cores for return to base.',mass:18,cost:5,rel:.97,wh:45,secs:2.6},
        powder:{n:'Powder drill',s:'Faster. Makes rock powder: feeds an onboard lab, returns as powder.',mass:12,cost:3,rel:.98,wh:30,secs:1.8},
        scoop:{n:'Soil scoop',s:'Scoops loose soil beside a rock. Cannot cut bedrock.',mass:2,cost:.5,rel:.995,wh:6,secs:1}}},
      store:{label:'Sample storage',opts:{
        4:{n:'4 tubes',s:'Light.',mass:6,cost:1},8:{n:'8 tubes',s:'Standard.',mass:10,cost:2},12:{n:'12 tubes',s:'Room for everything.',mass:15,cost:3}}}}},
    comms:{label:'Communications',help:'rcomms',groups:{
      comms:{label:'Antennas',opts:{
        lga:{n:'Low-gain antenna only',s:'Talks straight to Earth, slowly.',mass:2,cost:.5,rel:.97,dte:.2,relay:0},
        uhf:{n:'UHF relay radio and low-gain',s:'Big bursts through orbiters as they pass overhead.',mass:6,cost:2,rel:.97,dte:.2,relay:12},
        hga:{n:'High-gain dish, UHF relay and low-gain',s:'Fast direct link while Earth is up, plus relay passes.',mass:16,cost:5,rel:.96,dte:2.5,relay:12}}},
      store:{label:'Data storage',opts:{
        small:{n:'1 GB',s:'Fills after a handful of pictures.',mb:1000,mass:1,cost:.5},
        std:{n:'4 GB',s:'Standard.',mb:4000,mass:2,cost:1},
        large:{n:'16 GB',s:'Rarely full. Draws a little power.',mb:16000,mass:3,cost:2,power:3}}},
      backup:{label:'Backup radio',opts:{
        no:{n:'None',s:'One radio. If it faults, data waits.',mass:0,cost:0},
        yes:{n:'Second radio',s:'Takes over if the first one faults.',mass:3,cost:1.5}}}}},
    protect:{label:'Protection',help:'protect',groups:{
      therm:{label:'Thermal insulation',opts:{
        min:{n:'Minimal blankets',s:'Light. Heaters work hard.',mass:5,cost:.5,heat:38},
        std:{n:'Multilayer insulation',s:'Standard.',mass:12,cost:1,heat:22},
        aero:{n:'Aerogel and multilayer',s:'Holds heat well. Costs more.',mass:18,cost:3,heat:12}}},
      dust:{label:'Dust protection',opts:{
        none:{n:'None',s:'Lenses and arrays collect dust.',mass:0,cost:0},
        covers:{n:'Lens and sensor covers',s:'Cleaner pictures and laser readings.',mass:3,cost:1},
        eds:{n:'Covers and array dust shield',s:'Electric fields shed dust from the arrays. Experimental.',mass:7,cost:4,power:6}}},
      shield:{label:'Electronics',opts:{
        std:{n:'Standard electronics',s:'Occasional resets from radiation.',mass:0,cost:0,rel:.97},
        hard:{n:'Radiation-hardened and shielded',s:'Far fewer resets.',mass:8,cost:4,rel:.995}}}}},
    look:{label:'Appearance',help:'look',groups:{
      paint:{label:'Finish',opts:{flight:{n:'Flight gold and foil',s:'As built.',mass:0,cost:0},white:{n:'White thermal paint',s:'',mass:0,cost:0},grey:{n:'Bare anodized aluminum',s:'',mass:0,cost:0}}},
      mark:{label:'Markings',opts:{none:{n:'None',s:'',mass:0,cost:0},stripe:{n:'Mission stripe',s:'',mass:0,cost:0},flag:{n:'Agency flag',s:'',mass:0,cost:0}}},
      insig:{label:'Insignia',opts:{none:{n:'None',s:'',mass:0,cost:0},delta:{n:'Delta',s:'',mass:0,cost:0},orbit:{n:'Orbit',s:'',mass:0,cost:0},star:{n:'Star',s:'',mass:0,cost:0}}}}}
  };
  /* ---------- rover instruments ----------
     mount: mast | deck | arm (turret) | body. units = mounting units used. use = energy per use (Wh) and data per use (MB).
     run = continuous power while on (W). Each has a guide. */
  const INS={
    pancam:{n:'Panoramic stereo camera',tag:'Mastcam-Z-type',mount:'mast',units:1,mass:4,cost:4,run:0,use:{wh:4,mb:180},rel:.98,res:'zoom, 0.7 mm per pixel at 2 m',
      g:{what:'A pair of color zoom cameras on the mast, like a geologist’s eyes.',how:'Two cameras a short distance apart take the same view; the difference between the two pictures gives depth, like your two eyes.',
        meas:'Color stereo pictures of rocks and terrain, close enough to see layering and coarse grains.',why:'Layers, cross-bedding and pebbles are how geologists recognize rock laid down by water.',
        lim:'Sees surfaces only, not chemistry. Grains smaller than sand are a blur. Each picture is a large file.'}},
    navcam:{n:'Navigation cameras',tag:'Navcam-type',mount:'mast',units:1,mass:1.5,cost:1,run:2,use:{wh:0,mb:0},rel:.99,res:'wide angle, black and white',
      g:{what:'Wide-angle black-and-white cameras for driving.',how:'They take quick stereo pictures of the ground ahead, which the rover turns into a map of obstacles.',
        meas:'Terrain shape around the rover.',why:'You see farther, spot outcrops sooner, and drive with fewer surprises.',lim:'Too coarse for science. Black and white.'}},
    chem:{n:'Laser-induced breakdown spectrometer',tag:'SuperCam/ChemCam-type',mount:'mast',units:2,mass:10.6,cost:9,run:0,use:{wh:18,mb:12},rel:.95,res:'spot 0.3 mm, range up to 7 m',
      g:{what:'A laser on the mast that reads a rock’s chemistry from a distance.',how:'Laser pulses vaporize a pinhead of rock into glowing plasma. A spectrometer reads the colors of that light; each element shines at its own wavelengths.',
        meas:'Element abundances: silicon, iron, magnesium, aluminum, calcium, sulfur.',why:'Chemistry from several meters away, without driving up and deploying the arm.',
        lim:'A dusty spot gives a noisy reading. Reads only the top fraction of a millimeter. Elements, not minerals.'}},
    apxs:{n:'Contact X-ray spectrometer',tag:'APXS/PIXL-type',mount:'arm',units:1,mass:2,cost:4,run:0,use:{wh:10,mb:4},rel:.98,res:'contact, 1.7 cm spot',
      g:{what:'A sensor the arm presses against a rock to measure its chemistry.',how:'A small radioactive source makes the rock give off X-rays. Each element emits X-rays of a particular energy.',
        meas:'Element abundances, more precisely than a laser at a distance.',why:'A clean, reliable chemical reading of exactly the spot you choose.',lim:'Needs the arm and the rover parked right beside the rock. Takes longer than the laser.'}},
    mi:{n:'Microscopic imager',tag:'MAHLI/WATSON-type',mount:'arm',units:1,mass:1,cost:2,run:0,use:{wh:3,mb:40},rel:.99,res:'15 µm per pixel',
      g:{what:'A hand-lens camera on the arm.',how:'A close-focus color camera with its own lights, held a few centimeters from the rock.',
        meas:'Grain size, grain shape and crystal texture.',why:'Rounded grains were rolled by water or wind. Interlocking crystals grew from molten rock. This is where the rock type shows itself.',
        lim:'Sees a patch a few centimeters across. Needs the arm and a parked rover.'}},
    thermal:{n:'Thermal infrared imager',tag:'thermal-camera type',mount:'mast',units:1,mass:2,cost:2,run:3,use:{wh:2,mb:25},rel:.98,res:'ground temperature to 0.5 °C',
      g:{what:'A camera that sees how warm the ground is.',how:'Loose sand heats and cools faster than solid rock. Warm and cold patches show which is which.',
        meas:'Surface temperature in front of the rover.',why:'Shows soft sand before you drive into it.',lim:'Says nothing about chemistry. Works best when the ground is heating or cooling.',draw:'thermal'}},
    env:{n:'Environmental sensor suite',tag:'MEDA/REMS-type',mount:'mast',units:1,mass:5.5,cost:3,run:10,use:{wh:0,mb:0},rel:.97,res:'wind, pressure, humidity, dust',
      g:{what:'A small weather station on the mast.',how:'Booms carry wind, temperature and humidity sensors; a pressure sensor and a sky-facing light sensor sit inside.',
        meas:'Wind, air and ground temperature, pressure, humidity, dust in the air.',why:'A weather record for the crew and a warning when dust is about to lift.',lim:'Measures the air at the rover only. Adds no rock science.'}},
    rad:{n:'Radiation detector',tag:'RAD-type',mount:'deck',units:1,mass:1.6,cost:2,run:4,use:{wh:0,mb:0},rel:.98,res:'dose rate every 15 minutes',
      g:{what:'A detector that measures the radiation reaching the surface.',how:'Stacked silicon detectors and a crystal measure the energy of each particle that passes through.',
        meas:'Dose rate from cosmic rays and the Sun at the surface.',why:'How much shielding the crew’s habitat needs.',lim:'Adds nothing to rock science.'}},
    atmo:{n:'Atmospheric gas analyzer',tag:'tunable-laser type',mount:'deck',units:1,mass:4,cost:4,run:0,use:{wh:12,mb:2},rel:.96,res:'methane to parts per billion',
      g:{what:'An instrument that measures trace gases in the air, such as methane.',how:'A laser tuned to the exact color methane absorbs shines through a cell of air; the dimming gives the amount.',
        meas:'Methane, water vapor and carbon dioxide isotopes in the air.',why:'Methane on Mars is a long-running puzzle.',lim:'Measures air, not rock. An onboard lab already includes a gas analyzer.'}},
    mag:{n:'Magnetometer',tag:'fluxgate type',mount:'deck',units:1,mass:1,cost:1,run:1,use:{wh:0,mb:0},rel:.99,res:'about 1 nT',
      g:{what:'A sensor that measures magnetic fields.',how:'Coils on a boom respond to the local field.',meas:'The crustal magnetic field where the rover stands.',
        why:'Records ancient magnetism in the crust.',lim:'The rover’s own motors and electronics add noise. The field at Jezero is weak. Adds no rock or water science.'}},
    seis:{n:'Seismometer',tag:'broadband type',mount:'deck',units:1,mass:3,cost:3,run:2,use:{wh:0,mb:0},rel:.97,res:'ground motion to a billionth of a meter',
      g:{what:'An instrument that feels marsquakes.',how:'A tiny mass on a spring stays still while the ground moves around it.',
        meas:'Ground vibration from quakes and impacts.',why:'Reveals the planet’s interior.',lim:'It must sit still on the ground for weeks. On a driving rover the motors and wind swamp the signal.'}},
    lab:{n:'Onboard sample lab',tag:'SAM/CheMin-type',mount:'deck',units:2,mass:40,cost:14,run:0,use:{wh:70,mb:20},rel:.94,res:'mineral identification by X-ray diffraction',
      g:{what:'A miniature laboratory inside the rover.',how:'Rock powder from the drill falls into an inlet. X-rays bounce off its crystals at angles that identify each mineral; an oven and gas analyzer look for carbon compounds.',
        meas:'Which minerals a sample contains, for certain.',why:'Turns a field guess into a confirmed identification, on the spot.',lim:'Needs rock powder, so it needs a powder drill. Heavy, power hungry and expensive.'}},
    gpr:{n:'Ground-penetrating radar',tag:'RIMFAX-type',mount:'body',units:1,mass:3,cost:3,run:15,use:{wh:0,mb:0},rel:.97,res:'layers to about 10 m deep',
      g:{what:'A radar under the rover that looks into the ground as it drives.',how:'Radio pulses go down; each buried layer reflects a little back. Echo delay gives depth.',
        meas:'Buried layers along the drive, down to about 10 m.',why:'Shows how the delta’s layers continue underground.',lim:'Works only while driving. Draws power the whole time it is on.',draw:'echo'}}
  };
  const IKEYS=Object.keys(INS),MOUNT={mast:{label:'Mast',cap:5},deck:{label:'Deck'},arm:{label:'Arm turret'},body:{label:'Body bay',cap:1}};
  IKEYS.forEach(k=>{const i=INS[k],g=i.g;if(typeof Help!=='undefined')Help.add('r:'+k,{t:i.n,sub:i.tag+' · rover instrument · mounts on the '+MOUNT[i.mount].label.toLowerCase(),
    rows:[['What it does',g.what],['How it works',g.how],['What it measures',g.meas],['Why it matters',g.why],['Limitations',g.lim]],
    spec:[['Mass',i.mass+' kg'],['Power',i.run?i.run+' W while on':i.use.wh?i.use.wh+' Wh per use':'negligible'],['Data',i.use.mb?i.use.mb+' MB per use':'small'],['Mount',MOUNT[i.mount].label+(i.units>1?` · ${i.units} units`:'')],['Cost','$'+i.cost+'M'],['Reliability',Math.round(i.rel*100)+'%']],drawNow:g.draw});});

  /* ---------- the mission's objectives, stated as measurements (shown in the briefing and the bay) ---------- */
  const OBJ=[{id:'water',main:true,q:'Find rock that formed in water',need:'Pictures that show layering and grain texture, plus the chemistry of several different rocks.'},
    {id:'samples',main:true,q:'Bring two samples home',need:'An arm, a tool that cuts bedrock, and sealed storage.'},
    {id:'gpr',q:'Profile the buried delta layers',need:'A look under the surface along 400 m of driving.'},
    {id:'wx',q:'Keep a weather record for the crew',need:'Wind, pressure and dust measured during the drive.'},
    {id:'dose',q:'Measure the surface radiation dose',need:'Radiation measured at the surface.'},
    {id:'labid',q:'Confirm a mineral on the spot',need:'A mineral identification made inside the rover from rock powder.'}];

  function defaults(){return {wheel:'std',wsize:'m',susp:'rb',clear:'std',dims:'std',chassis:'alu',power:'solar',battery:'m',
    arm:'full',drill:'core',store:8,comms:'uhf',dstore:'std',backup:'no',therm:'std',dust:'none',shield:'std',paint:'flight',mark:'none',insig:'none',inst:[]};}
  /* which config field each catalog group writes (the arm tab's "store" is the tube count; the comms tab's is data storage) */
  const FIELD={store:'store'};const fieldOf=(tab,grp)=>tab==='comms'&&grp==='store'?'dstore':grp;
  const opt=(tab,grp,cfg)=>CAT[tab].groups[grp].opts[cfg[fieldOf(tab,grp)]];
  function spec(cfg){
    const c=Object.assign(defaults(),cfg||{}),I=new Set(c.inst),G=(t,g)=>opt(t,g,c)||{};
    const wh=G('mobility','wheel'),ws=G('mobility','wsize'),su=G('mobility','susp'),cl=c.clear,dm=G('mobility','dims'),ch=G('mobility','chassis'),
      pw=G('power','power'),bt=G('power','battery'),ar=G('arm','arm'),dr=c.arm==='none'?null:G('arm','drill'),st=G('arm','store'),
      co=G('comms','comms'),ds=G('comms','store'),bk=c.backup==='yes',th=G('protect','therm'),du=G('protect','dust'),sh=G('protect','shield');
    /* mass and cost */
    let mass=BUS.mass,cost=BUS.cost;const add=o=>{mass+=o.mass||0;cost+=o.cost||0;};
    mass+=wh.mass*ws.k;cost+=wh.cost+ws.cost;[su,G('mobility','clear'),dm,ch,pw,bt,ar,st,co,ds,G('comms','backup'),th,du,sh].forEach(add);if(dr)add(dr);
    for(const k of I)if(INS[k]){mass+=INS[k].mass;cost+=INS[k].cost;}
    /* mounting units */
    const used={mast:0,deck:0,arm:dr?1:0,body:0};for(const k of I)if(INS[k])used[INS[k].mount]+=INS[k].units;
    const capM={mast:5,deck:dm.deck||4,arm:ar.slots||0,body:1};
    /* energy */
    const batWh=bt.wh+(pw.extra||0),heat=pw.rtg?Math.max(0,th.heat-18):th.heat;
    let run=BUS.load+heat+(su.power||0)+(ds.power||0)+(du.power||0);for(const k of I)if(INS[k]&&INS[k].run&&k!=='gpr'&&k!=='thermal')run+=INS[k].run;
    const drive=.024*mass*wh.roll*({rb:1,active:1.05,rigid:.95}[c.susp]);
    /* mobility */
    const massF=Math.max(.85,Math.min(1.1,Math.pow(950/mass,.35)));
    const vmax=46*{s:.9,m:1,l:1.08}[c.wsize]*{rb:1,active:.94,rigid:1.06}[c.susp]*massF*{compact:1.03,std:1,long:.97}[c.dims];
    const sandK=Math.max(.4,Math.min(.95,wh.sand+{s:-.05,m:0,l:.06}[c.wsize]+(c.susp==='active'?.08:0)));
    const climb={rb:1,active:1.15,rigid:.75}[c.susp]*{s:.92,m:1,l:1.1}[c.wsize];
    const passR={low:4.5,std:6,high:8}[cl]+{s:-1,m:0,l:1.5}[c.wsize]+(c.susp==='active'?1:0);
    const stab=Math.max(.4,Math.min(.95,.78+{rb:0,active:.04,rigid:-.15}[c.susp]+{low:.07,std:0,high:-.08}[cl]+{compact:-.05,std:0,long:.05}[c.dims]-(c.power==='solarL'?.03:0)));
    const tough=(ch.tough||1)*wh.wear*(c.susp==='rigid'?1.4:1);
    const turn={compact:1.2,std:1,long:.85}[c.dims],rad=11*{compact:.9,std:1,long:1.1}[c.dims]+(c.power==='solarL'?2:0);
    /* reliability */
    let rel=BUS.rel*(ch.rel||1)*(wh.rel||1)*(su.rel||1)*(pw.rel||1)*(bk?.995:(co.rel||1))*(sh.rel||1)*(ar.rel||1)*(dr?dr.rel:1);
    for(const k of I)if(INS[k])rel*=Math.sqrt(INS[k].rel);
    /* what the rover can do */
    const can={photo:I.has('pancam'),sight:I.has('navcam')?1.45:1,chem:I.has('chem'),contact:I.has('apxs')&&c.arm!=='none',micro:I.has('mi')&&c.arm!=='none',
      sample:c.arm!=='none',bedrock:c.arm!=='none'&&c.drill!=='scoop',core:c.arm!=='none'&&c.drill==='core',lab:I.has('lab')&&c.arm!=='none'&&c.drill==='powder',
      gpr:I.has('gpr'),wx:I.has('env'),dose:I.has('rad'),sand:I.has('thermal'),atmo:I.has('atmo'),mag:I.has('mag'),seis:I.has('seis'),tubes:+c.store||8,
      covers:c.dust!=='none',eds:c.dust==='eds'};
    const genDay=pw.peak*.8+pw.rtg,dayMargin=genDay-run;
    return {cfg:c,mass,cost,limit:LIMIT,budget:BUDGET,used,capM,batWh,peak:pw.peak,rtg:pw.rtg,run,heat,drive,genDay,dayMargin,
      vmax,sandK,sandE:1+(1-sandK)*2.4,climb,passR,stab,tough,turn,rad,rel,can,
      storeMB:ds.mb,dte:co.dte,relay:co.relay,backup:bk,drill:dr?c.drill:null,drillWh:dr?dr.wh:0,drillSecs:dr?dr.secs:0,dustK:c.dust==='eds'?.4:c.power==='solarL'?1.3:1,
      speedCm:vmax*.09,clearM:{low:.5,std:.6,high:.72}[cl]+(c.susp==='active'?.04:0)};}
  /* why an option cannot be fitted right now, or '' when it can (hard limits only: mounting space and the arm) */
  function blocked(cfg,instKey){const c=Object.assign(defaults(),cfg),s=spec(c),i=INS[instKey];if(!i||c.inst.includes(instKey))return '';
    if(i.mount==='arm'&&c.arm==='none')return 'Needs a robot arm';
    if(s.used[i.mount]+i.units>s.capM[i.mount])return `${MOUNT[i.mount].label} full`;return '';}
  /* constraint rows for the bay's readiness panel. ok:false rows block deployment. */
  function checks(s){const R=[],add=(n,ok,d,hard=true)=>R.push({n,ok,d,hard});
    add('Mass within the lander limit',s.mass<=s.limit,`${Math.round(s.mass)} of ${s.limit} kg`);
    add('Cost within budget',s.cost<=s.budget,`$${s.cost.toFixed(1)}M of $${s.budget}M`);
    for(const m in s.capM)if(s.used[m]>s.capM[m])add(`${MOUNT[m].label} space`,false,`${s.used[m]} units for ${s.capM[m]}`);
    add('Daytime power covers the standing load',s.dayMargin>=0,`${Math.round(s.genDay)} W in daylight against ${Math.round(s.run)} W`,false);
    return R;}
  /* capability lines for each objective: facts about the configuration, never a verdict */
  function capLines(s,id){const c=s.can,cf=s.cfg,L=[];
    if(id==='water'){if(c.photo)L.push('Panoramic camera: color stereo pictures');if(c.micro)L.push('Microscopic imager: grain shape and texture');if(c.chem)L.push('Laser spectrometer: chemistry from a distance');if(c.contact)L.push('Contact spectrometer: chemistry at the arm');if(c.lab)L.push('Onboard lab: mineral identification');}
    if(id==='samples'){if(cf.arm==='none')L.push('No arm fitted');else L.push(`${CAT.arm.groups.arm.opts[cf.arm].n}; ${CAT.arm.groups.drill.opts[cf.drill].n.toLowerCase()}; ${cf.store} tubes`);}
    if(id==='gpr'&&c.gpr)L.push('Ground-penetrating radar');if(id==='wx'&&c.wx)L.push('Environmental sensor suite');if(id==='dose'&&c.dose)L.push('Radiation detector');
    if(id==='labid'&&I_has(cf,'lab'))L.push(cf.drill==='powder'?'Onboard lab fed by the powder drill':`Onboard lab; your sampling tool is the ${CAT.arm.groups.drill.opts[cf.drill].n.toLowerCase()}`);
    return L;}
  const I_has=(cf,k)=>(cf.inst||[]).includes(k);
  return {CAT,INS,IKEYS,MOUNT,OBJ,LIMIT,BUDGET,defaults,spec,blocked,checks,capLines,fieldOf,opt};
})();
