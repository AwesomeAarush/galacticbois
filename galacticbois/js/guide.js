"use strict";
/* Step guides, system explanations and outcome explainers.
   Loaded before game.js. Everything here reads game globals (S, T, SYS, INST, f0...) only when
   it is called, never at load time, so the load order is safe. Numbers quoted in the text match
   the constants in game.js: if you rebalance the game, update the matching sentence here. */

const li=a=>a.map(x=>`<li>${x}</li>`).join('');
function explain(rows,title='Why this happened'){return `<div class="explain"><p class="kicker">${title}</p>${rows.map(r=>`<p>${r}</p>`).join('')}</div>`;}
function more(summary,html){return `<details class="more"><summary>${summary}</summary><div>${html}</div></details>`;}

/* ---------- the per-stage step guide ---------- */
function guide(stage,openFirst){
  const g=guideData()[stage];if(!g)return '';
  const saved=(S.gopen||{})[stage];
  const def=openFirst===undefined?true:openFirst;
  const open=saved===undefined?(!!S.guided&&def):saved;
  return `<details class="guide" data-stage="${stage}"${open?' open':''}><summary><span class="kicker">Step guide</span><b>${g.title}</b></summary>
  <div class="gbody">
    <div class="g2c"><div><h4>What is happening</h4><p>${g.what}</p></div><div><h4>Why it matters</h4><p>${g.why}</p></div></div>
    <h4>Step by step</h4><ol>${li(g.how)}</ol>
    <h4>What your choices do</h4><dl>${g.choices.map(c=>`<dt>${c[0]}</dt><dd>${c[1]}</dd>`).join('')}</dl>
    <div class="g2c"><div><h4>Common mistakes</h4><ul>${li(g.mistakes)}</ul></div><div><h4>In the real world</h4><p>${g.real}</p></div></div>
  </div></details>`;}
/* remember whether the player opened or closed a guide (clicks only, so rendering never overwrites it) */
document.addEventListener('click',e=>{const s=e.target.closest&&e.target.closest('details.guide>summary');if(!s)return;
  const d=s.parentElement;setTimeout(()=>{S.gopen=S.gopen||{};S.gopen[d.dataset.stage]=d.open;});});

function guideData(){return {
briefing:{title:'Mission briefing',
  what:'ASEA hands you the goal, the limits and the scorecard before you pick a single part. Everything you do in the next seven stages is measured against this page.',
  why:'Real missions start with questions, not hardware: decide what you want to learn, then work backwards to the cheapest machine that can answer it. Kestrel had more mass and money than you do and still failed, so the limits here (1,200 kg and 180M credits) are tight on purpose.',
  how:['Read the three science questions. Each one is answered by a different instrument: minerals by the spectrometer, the atmosphere by the profiler, buried ice by the radar.',
    'Note the two hard limits. Launch mass is the empty spacecraft plus its propellant. Both limits stay visible in the bar at the top while you build.',
    'Read the six objectives. Together they are worth 100 points, and that total is 25% of your final score. Entering a stable orbit alone is worth 25 of them.',
    'Read the scoring formula. Scientific return (R) carries the most weight at 35%, so a spacecraft that survives but sends little home cannot score well.',
    'Press <b>Accept mission</b>. Nothing is locked in yet. You can return and change every choice until launch.'],
  choices:[['Accept mission','Moves on to instrument selection. Nothing on this page changes your score.'],
    ['Guided mode (set on the title screen)','Opens these step guides by default, adds hints, widens the burn window at Mars (18 s instead of 14 s, with a green band of ±9% instead of ±4%) and lengthens the course-correction window (75 s instead of 40 s).']],
  mistakes:['Picking hardware before reading the questions. An instrument that answers none of them is mass you pay for twice, in money and in propellant.',
    'Chasing a high score while ignoring hard failures. Losing the spacecraft is reported as “Mission failed” whatever the number says.',
    'Forgetting Kestrel’s echo. It can only be explained with radar data from the north polar cap.'],
  real:'Space agencies write requirements in this order: science goals first, then constraints such as mass and cost, then how success will be judged. The same order is used here.'},

science:{title:'Scientific preparation',
  what:'You decide which of four instruments fly. Each is modelled on a real instrument aboard NASA’s Mars Reconnaissance Orbiter, and each takes a share of your mass, money, power and onboard data storage.',
  why:'The payload is the reason the mission exists, and it is also the most flexible part of your budget. Dropping the camera saves 65 kg and 28M. That mass becomes extra propellant or keeps you under the limit. Carry only what your questions need.',
  how:['Match instruments to questions. Question 1 (minerals) needs the spectrometer, Question 2 (atmosphere) the profiler, Question 3 (buried ice) the radar.',
    'Check the objectives you want. “Map selected surface regions” needs camera data from at least two regions. “Collect atmospheric measurements” needs the profiler. “Investigate evidence of past water” can come from the spectrometer or the radar.',
    'Tap a card to install or remove an instrument and watch <b>Payload totals</b>. All four together weigh 122 kg, cost 74M and draw 136 W.',
    'Remember this is not final. You can still change instruments in the build stage, where their mass and power are checked against everything else.'],
  choices:[['High-resolution camera','65 kg · 28M · 60 W · 8 Gb. Best over Valles Marineris (100%) and Jezero (90%). The heaviest and most power-hungry choice, and the only way to complete the mapping objective.'],
    ['Imaging spectrometer','33 kg · 22M · 45 W · 6 Gb. The only instrument that answers Question 1. Strongest at Jezero Crater (100%), where water-formed minerals are exposed.'],
    ['Atmospheric profiler','9 kg · 10M · 11 W · 1 Gb. The cheapest source of science by far, and the only way to answer Question 2. Strongest over the north polar cap (100%).'],
    ['Shallow subsurface radar','15 kg · 14M · 20 W · 3 Gb. The only way to answer Question 3 and to explain Kestrel’s echo. Full value only over the polar cap. It is worth 60% at Valles Marineris and 40% at Jezero.']],
  mistakes:['Leaving out the profiler to save weight. It weighs 9 kg and costs 10M, and without it Question 2 and an objective stay unanswered.',
    'Taking everything. Four instruments use 122 kg and 74M of a 180M budget before you have bought a single spacecraft system.',
    'Carrying the radar but never flying it over the pole. Its fit drops to 40% over Jezero.'],
  real:'The real orbiter carries a camera (HiRISE), a mineral spectrometer (CRISM), a climate sounder (MCS) and a radar (SHARAD). Each was chosen because it answers a different question. Mission scientists check this with a “science traceability matrix”: every instrument must trace back to a question.'},

planning:{title:'Interplanetary planning',
  what:'You choose when to leave Earth, which path to fly and how you will settle into orbit at Mars. These three choices set how much speed change your spacecraft must be able to produce.',
  why:'Earth and Mars circle the Sun at different speeds, so they line up properly only about every 26 months. Leave on the wrong day and you either miss Mars or pay for it in propellant, and propellant is mass you have to launch.',
  how:['Drag the departure date slider, or press the −1 and +1 day buttons. Watch the white cross on the map: Mars should be sitting on it on the day you arrive.',
    'Read the Flight plan badge. “Window open” means the miss is under 1°, “Costly” means up to 10°, and “No route” means more than 10°.',
    'Choose a transfer. The '+T('hohmann','Hohmann transfer')+' is the cheapest. The fast transfer costs 8M for a bigger launch vehicle and gets there sooner, but you arrive faster and must brake harder.',
    'Choose how to enter Mars orbit: aerobraking, staying in the capture ellipse, or burning straight to the science orbit.',
    'Check <b>Total speed change needed</b>. This is the '+T('deltav')+' your engine must be able to deliver. You will match it in the build stage.',
    'Press <b>Build the spacecraft</b>. The first time, a quick check appears. A wrong answer costs nothing.'],
  choices:[['Departure date','Sets the timing error. Each degree of miss costs 25 × miss² m/s of correction, so 2° costs 100 m/s and 5° costs 625 m/s. Beyond 10° there is no route to Mars at all.'],
    ['Hohmann transfer','The lowest-energy path, about 260 days. No extra cost.'],
    ['Fast transfer','+8M. A shorter trip, so less time for things to go wrong, but you arrive at Mars faster and the orbit-insertion burn is larger.'],
    ['Low orbit by aerobraking','Cheap on propellant because the atmosphere does the slowing, but it takes one observation pass (9 passes instead of 10).'],
    ['Stay in the capture ellipse','All 10 passes and a small burn, but you are far from the surface most of the time, so data quality is 60% of full.'],
    ['Direct to 300 km circular','Full quality and all 10 passes, but the biggest insertion burn. It needs the most propellant, and a burn that runs long drops the orbit into the atmosphere.']],
  mistakes:['Ignoring the miss angle. A 10° miss technically works, but costs 2,500 m/s of correction, which no small spacecraft can carry.',
    'Choosing the direct orbit without checking the propellant budget in the next stage.',
    'Treating the fast transfer as a free time saving. The 8M and the harder braking both come out of your resources.'],
  real:'Real Mars missions launch in windows about 26 months apart, and most fly paths close to a Hohmann transfer. NASA’s Mars Reconnaissance Orbiter reached Mars in March 2006 after a seven-month cruise, then spent about six months aerobraking into its science orbit.'},

design:{title:'Spacecraft construction',
  what:'You assemble the spacecraft from seven systems, a propellant load, optional redundancy and the instruments you chose. A live panel shows what every choice does to mass, cost, power, speed change, storage and reliability.',
  why:'Everything is tied together by mass. Each extra kilogram of hardware needs extra propellant to move it, and that propellant has mass too. This is the rocket equation: '+T('deltav','Δv')+' = Isp × g₀ × ln(wet mass ÷ '+T('drymass','dry mass')+'). Good design is deciding what to leave out.',
  how:['Start from a template if you like. Each one passes review on a well-timed Hohmann transfer with aerobraking.',
    'Change one system at a time and watch <b>Live budgets</b>. Bars turn amber close to a limit and red when over it.',
    'Read the “Not ready for review” box. It lists every critical problem with a suggested fix.',
    'Balance propellant against everything else. The speed-change bar compares what you need (from planning) with what the engine can deliver.',
    'Open <b>Explain this system</b> under any heading to see how it feeds the other numbers.',
    'When the box turns green, press <b>Send to review</b>.'],
  choices:[['Structure','Sets mass, reliability and bolt-loss risk. Lightweight composite saves 80 kg but is 1.6 times as likely to shed bolts in cruise. The reinforced frame halves the risk for 80 kg more than the standard one.'],
    ['Solar arrays','Rated watts are for Earth. At Mars sunlight is 43% as strong, so standard arrays (1,000 W) give about 430 W.'],
    ['Battery','Covers the shadow behind Mars and short bursts. Review needs its usable 80% to run the spacecraft’s own systems for 42 minutes.'],
    ['Communications','Dish size sets the data you can send each pass: 6, 14 or 30 Gb. Larger dishes draw 20, 40 or 70 W.'],
    ['Propulsion','Bipropellant (Isp 320 s) gives about 39% more speed change from the same propellant than monopropellant (230 s), for 30 kg and 9M more and slightly lower reliability.'],
    ['Computing and data','Sets storage (16, 40 or 90 Gb) and autonomy. Each autonomy level improves how the spacecraft copes with signal delay and adds 15 points to the chance a faulty instrument is recovered.'],
    ['Thermal control','Passive blankets need no power but cut calibration by 8%, which reduces every observation’s value. Heaters or a fluid loop draw 25 or 40 W.'],
    ['Propellant','Costs 0.02M per kg and counts toward launch mass. Too little and the burns cannot be completed. Leaving more than 20% unused lowers your efficiency score.'],
    ['Redundancy','+45 kg and +12M. Halves the failure risk of critical parts and adds 20 points to the chance a faulty instrument is recovered.']],
  mistakes:['Sizing arrays for Earth. A 1,000 W array gives roughly 430 W at Mars, and the power check uses the Mars number.',
    'Loading the minimum propellant to save mass. The in-flight events draw on it, and with no margin any extra correction hurts.',
    'Spending everything. Above 130M or 950 kg your Resource efficiency score starts to drop.'],
  real:'Real spacecraft are designed around a “mass budget” and a “power budget”, with deliberate margins, because early estimates are always optimistic. The review in the next stage exists to catch what the design team missed.'},

review:{title:'Technical review',
  what:'The Launch Readiness Board checks your design and trajectory against twelve tests. Nine are critical: a “No go” blocks launch. Three are cautions. They do not stop you, but show where the mission is likely to hurt.',
  why:'A spacecraft cannot be fixed after launch, so the review is the last cheap chance to find problems. A caution means “this will work, but you have little room for surprises.”',
  how:['Read the headline. It says how many critical problems were found.',
    'Open <b>Why this check?</b> under any row to see what it measures and how the number is worked out.',
    'For each No go, read the Fix line. Use <b>Change trajectory</b> or <b>Change spacecraft</b> to go back. Your choices are kept.',
    'Read the cautions even when everything passes. They predict which events in flight will be dangerous.',
    'When every critical check is green, press <b>Launch</b>.'],
  choices:[['Critical checks','Mass, cost, trajectory, array power, battery, propellant, communications, data storage and at least one instrument. All must pass.'],
    ['Cautions','Power for all instruments at once, a 10% propellant margin and a downlink that keeps up with the data. Failing these does not block launch.'],
    ['Launch','Starts the launch cutscene and the cruise. After this point, hardware cannot be changed.']],
  mistakes:['Launching with no propellant margin. The off-course burn uses propellant, and so does 15 m/s if you enter safe mode during the power fault.',
    'Ignoring a downlink caution. It means a backlog of data will build during science operations.'],
  real:'Real missions hold a series of formal reviews before launch, and the finished spacecraft is tested in vacuum and vibration chambers on the ground, because nothing can be repaired once it is on its way.'},

cruise:{title:'Interplanetary cruise',
  what:'The spacecraft flies itself toward Mars. Each tick of the clock is one week. You watch the telemetry and decide what to do when something goes wrong.',
  why:'Mars is 3 to 22 light-minutes from Earth, so controllers cannot steer in real time. The cruise shows how missions cope: planned command sequences, onboard autonomy and margins for faults.',
  how:['Watch the map. The white dot is your spacecraft, the blue dot Earth and the orange dot Mars.',
    'Read the telemetry. Sunlight on the arrays falls with the square of the distance from the Sun (1 ÷ r²), so array output drops as you move outward.',
    'Expect three scripted events: a communication delay at about a quarter of the way, an off-course alert at the halfway point and a solar array fault at about three-quarters.',
    'Between those, random events can happen, such as a loose bolt or a power cut in Mission Control. The alert shows the odds.',
    'Take your time. Alerts have no timer except the correction burn, which has a window (75 s in guided mode, 40 s otherwise).'],
  choices:[['Telemetry','Speed around the Sun, distance, sunlight as a percentage of what Earth gets, array output in watts, signal delay, propellant left and spacecraft health. Health starts at your design reliability and falls 0.12 points each week.'],
    ['Time-tagged sequence','Uploaded ahead of time and run from the spacecraft’s own clock, so signal delay does not matter.'],
    ['Onboard autonomy','Lets the spacecraft decide for itself. Basic computers cannot, standard ones usually can, autonomous ones do it right every time.'],
    ['Correction burn','Direction and size cancel the trajectory error. A larger burn costs more propellant, so use only what you need.'],
    ['Power-fault responses','Cut load, shut down spare systems or enter safe mode. The best choice depends on how much margin your arrays have.']],
  mistakes:['Trying to control a time-critical action live. A round trip can take many minutes.',
    'Burning a bigger correction than you need. Propellant spent now cannot be used for the Mars orbit insertion.',
    'Skipping the quick check. It states the inverse-square law, which governs your power for the rest of the mission.'],
  real:'Real spacecraft run on command sequences uploaded through NASA’s Deep Space Network, and use small course corrections called trajectory correction manoeuvres. Solar arrays also lose output over time, as radiation and dust take their toll.'},

moi:{title:'Mars orbit insertion',
  what:'The spacecraft arrives faster than Mars’s escape speed, so it will fly past unless the engine slows it. You control the burn by holding a button while the spacecraft swings around Mars.',
  why:'Capture is a one-shot manoeuvre. It happens behind Mars, out of contact, so what you programme is what flies. Burn too little and you fly past. Burn too long and the orbit’s low point can dip into the atmosphere.',
  how:['Press <b>Start the approach</b>. A dashed arc shows the path and a green wedge marks where the burn is most efficient.',
    'Wait until the spacecraft enters the green wedge. Burning outside it wastes 45% of the thrust.',
    'Hold the engine button (or the space bar). Watch the white marker on the speed gauge move left toward the green band.',
    'Let go when the marker is inside the green band. The prompt says “Let go now” when you are there.',
    'Read the outcome. A clean capture earns full marks for this step and a high capture earns half.'],
  choices:[['Speed gauge','The red line is escape speed: above it, you are not captured. The green band is your target, within ±9% of the speed you must shed (guided) or ±4% (unguided).'],
    ['Green burn zone','Inside it the engine delivers full thrust. Outside it only 55% of the burn becomes speed change, which wastes propellant.'],
    ['Burn length','At full efficiency, about 4.5 seconds of burning sheds the speed you need.'],
    ['Your orbit plan','Aerobraking and the ellipse need a small burn because the target is close to escape speed. The direct 300 km orbit needs the largest burn and can run too deep.'],
    ['Retry','If the insertion fails you can retry, which costs 10 operational-performance points.']],
  mistakes:['Letting go too early. You are still above '+T('escape','escape speed')+', so the planet only bends your path. The spacecraft ends up orbiting the Sun.',
    'Burning too long. It wastes propellant, and with the direct orbit it can drop the low point into the atmosphere.',
    'Burning before the green wedge. You lose almost half the thrust.'],
  real:'Real orbit-insertion burns happen behind the planet, out of contact, so engineers can only wait for the signal to come back. NASA’s Mars Reconnaissance Orbiter fired its main engines for about 27 minutes to be captured in March 2006.'},

ops:{title:'Science operations',
  what:'You have a limited number of passes over Mars. On each one, choose a region, switch instruments on and fly the pass. Recorded data waits in onboard storage until a downlink sends it to Earth.',
  why:'Instruments can record far more than the radio can send, so the real work is deciding what to look at, what to keep and what to send first. Only data that reaches Earth counts toward your three questions and your score.',
  how:['Tap a region on the map: Jezero Crater, Valles Marineris or the north polar cap. The table shows how well each instrument fits there.',
    'Switch instruments on or off. The power meter compares what you draw with what your arrays supply, and the battery covers any gap.',
    'Check storage and downlink. Each pass records the instruments’ data, then sends as much as your downlink allows.',
    'Press <b>Fly this pass</b>. Read the line added to the operations log. It shows what each instrument earned and why.',
    'Watch <b>Your three science questions</b>. A question changes to Answered once the right data has reached Earth.',
    'Handle the events. A data overload, an observation opportunity and an instrument fault each ask for a decision.'],
  choices:[['Science fit','How well an instrument works at a region, from 0 to 100%. It multiplies the value of every observation made there.'],
    ['Repeat looks','Each time you repeat the same instrument over the same region its value falls: 100%, 60%, 35%, 20%, 10%, then 5%. Variety beats repetition.'],
    ['Observation value','10 × fit × repeat factor × orbit quality × calibration. Orbit quality is 100%, or 60% if you stayed in the capture ellipse. A degraded instrument counts for half.'],
    ['Power and battery','If the load is above what the arrays supply, the shortfall comes out of the battery. If there is a surplus, the battery recharges by 60% of it.'],
    ['Storage','Data that does not fit is lost. The “Storage after this pass” bar warns you before that happens.'],
    ['Downlink order','Oldest first by default, or most valuable first once you choose to prioritise in the data event.']],
  mistakes:['Observing the same region over and over. The fifth look is worth only 10% of the first.',
    'Turning every instrument on every pass. You can drain the battery or overflow storage and lose observations.',
    'Leaving the polar cap until last. Question 3 needs polar radar data to have reached Earth, and passes run out.',
    'Forgetting that data still on board does not count. The final transmission sends a backlog, but only so much.'],
  real:'Operations teams plan every pass weeks ahead and constantly trade observations against power and data volume. NASA’s Deep Space Network schedules antenna time between many spacecraft, so a downlink is a shared, limited resource.'},

debrief:{title:'Mission debrief',
  what:'The mission is scored on five categories and compared with what real orbiters found. This guide explains how each category is worked out, so you can see exactly where points came from.',
  why:'Real teams review every mission to learn which decisions mattered. The score is only a summary. The flight log, the decision table and the comparison panels show the reasons.',
  how:['Read the headline: the score, the banner and any hard failures. Hard failures are reported separately from the number.',
    'Open the <b>Score breakdown</b>. Each category shows the evidence behind it.',
    'Check the <b>Primary objectives</b> and <b>Decisions under pressure</b> to find where points were lost. Each decision lists what happened.',
    'Compare your simulated science with NASA’s real findings. Curves marked as yours are generated by the game.',
    'Read the flight log for the chain of decisions, then press <b>Fly again</b> and change one thing.'],
  choices:[['R · Scientific return (35%)','Science value delivered to Earth ÷ 185, capped at 100. Data left on the spacecraft or lost counts for nothing.'],
    ['O · Objective completion (25%)','Six objectives worth 100 points: reach Mars 15, stable orbit 25, atmospheric measurements 15, mapping two regions 15, evidence of past water 15, and transmitting at least 80% of what you recorded 15.'],
    ['E · Resource efficiency (20%)','The average of four: share of recorded data delivered, propellant left (best at 20% of the starting load or less), budget (penalised above 130M) and mass (penalised above 950 kg).'],
    ['P · Operational performance (10%)','Points earned on all your event decisions as a share of the maximum, minus 10 for every orbit-insertion retry.'],
    ['L · Reliability (10%)','Spacecraft health at the end: design reliability, minus weekly wear and any damage from faults.']],
  mistakes:['Chasing R alone. Efficiency and operations together are 30% of the score.',
    'Reading the banner as the score. A hard failure is shown separately, and the debrief explains each one.',
    'Treating the NASA reference curves as part of the score. They are there for comparison only.'],
  real:'After real missions, teams publish “lessons learned” so later missions can repeat what worked. Data from the Mars Reconnaissance Orbiter’s instruments is released through NASA’s Planetary Data System, which is why the archives linked below can be explored by anyone.'}
};}

/* ---------- planning: plain-language meaning of the flight-plan numbers (live values) ---------- */
function planWhy(p){
  return explain([
    `<b>Travel time, ${f0(p.tr.T)} days (${f1(p.tr.T/30.4)} months).</b> How long the spacecraft takes to follow the transfer arc from Earth’s orbit to Mars’s orbit.`,
    `<b>Approach speed, ${f2(p.tr.vinf)} km/s.</b> Your speed relative to Mars before its gravity pulls you in. The higher it is, the more you must brake.`,
    `<b>Correction for timing error, ${f0(p.pen)} m/s.</b> Worked out as 25 × (miss angle)². Your miss is ${f1(Math.abs(p.miss))}°.`,
    `<b>Orbit insertion burn, ${f0(p.moi)} m/s.</b> Your speed at closest approach (${f2(p.vh)} km/s) minus the speed of the orbit you want (${f2(p.vt)} km/s). Escape speed there is ${f2(p.vesc)} km/s.`,
    `<b>Cruise and orbit trims, 100 m/s.</b> 40 m/s of course corrections on the way, plus 60 m/s to keep the science orbit in shape.`,
    `<b>Total, ${f0(p.need)} m/s.</b> The sum of the four lines above. Your engine has to be able to deliver this speed change, which you check in the build stage.`,
    `<b>Signal delay, ${f1(p.light)} minutes.</b> The Earth–Mars distance on arrival day divided by the speed of light.`],'What these numbers mean');
}

/* ---------- science: how each instrument is used ---------- */
const INSTX={
  cam:'Use it to map. It is worth most over Valles Marineris and Jezero, and you need its data from at least two regions to complete the mapping objective.',
  spec:'Use it for Question 1. Each mineral absorbs its own colours, so the dips in the spectrum identify what the ground is made of. Strongest at Jezero.',
  mcs:'Use it for Question 2. It records the atmosphere layer by layer. Tiny, cheap and useful anywhere, but best over the polar cap.',
  radar:'Use it for Question 3. Radio echoes from buried layers show where ice and rock meet. Only the polar cap gives full value, and it is the key to Kestrel’s echo.'};

/* ---------- design: how each system feeds the other numbers ---------- */
const SYSX={
  structure:'The frame carries every other part through launch and every burn. Mass and reliability come straight from the tier. The bolt multiplier changes how often the “A bolt fell out” event happens in cruise: the baseline is roughly 4% per week, ×1.6 for the lightweight frame and ×0.5 for the reinforced one.',
  power:'Arrays are rated at Earth’s distance. Sunlight at Mars is 1 ÷ 1.52² = 43% as strong, so each rating is multiplied by 0.43 for the power check. Later in cruise an array fault removes another 18%. Everything switched on at once has to fit inside the Mars figure.',
  battery:'The battery matters at two points. In review it must carry the spacecraft’s own systems through a 42-minute shadow, using only 80% of its capacity. In science operations it covers any pass where the instruments draw more than the arrays supply, and it recharges from surplus power.',
  comms:'The dish sets your downlink per pass: 6, 14 or 30 Gb. If your instruments record more than that in a pass, a backlog builds up and may overflow storage. A bigger dish draws more power and weighs more, so it must be paid for in the power budget too.',
  engine:'Specific impulse (Isp) is how much speed change each kilogram of propellant buys. Δv = Isp × 9.81 × ln(wet mass ÷ dry mass). 320 ÷ 230 means bipropellant gives about 39% more Δv from the same propellant, which can be worth the extra 30 kg and 9M if you are short.',
  computer:'Storage must hold a full pass of data (18 Gb if all four instruments are on, so the 16 Gb computer cannot). Autonomy decides how the spacecraft handles signal delay (communication event: 4, 8 or 10 of 10 points), hinge repairs (70%, 85% or 95% success) and instrument faults (+15 points of recovery per level).',
  thermal:'Instruments drift out of calibration if they run too hot or too cold. Passive blankets multiply every observation’s value by 0.92 for the whole mission, but need no power. The two powered options keep calibration at 100% and draw 25 or 40 W of your power budget.',
  prop:'Propellant is the fuel gauge of the mission. It costs 0.02M per kg and adds to launch mass, and every manoeuvre spends some. The speed-change bar shows what your load can deliver against what the trajectory needs. Aim for a 10% margin, but not much more: leaving over 20% unused costs efficiency points.',
  red:'Redundancy carries spares of the parts that could end the mission. The failure risk is halved (reliability = 1 − (1 − reliability) ÷ 2), so you start with more health, and recovering a faulty instrument becomes 20 points more likely. It costs 45 kg and 12M.'};

/* ---------- review: why each check exists, in the same order as checks() ---------- */
const CHECK_WHY=[
  'The launch vehicle can lift 1,200 kg. Launch mass is the dry spacecraft plus its propellant, so every kilogram of propellant counts against it.',
  'The budget is 180M credits. It adds up every part, the instruments, propellant at 0.02M per kg, the fast-transfer premium (8M) and redundancy (12M).',
  'Mars must be near your arrival point on arrival day. The miss angle is allowed up to 10°, and the correction costs 25 × miss² m/s, so even a small miss uses propellant.',
  'At Mars the arrays must supply the spacecraft’s own systems (150 W plus the dish, computer and thermal control) and the largest single instrument. That lets you run at least one instrument at a time.',
  'During a 42-minute shadow period the battery alone runs the spacecraft’s own systems. Only 80% of the capacity is counted as usable.',
  'The engine’s speed change (from the rocket equation) must be at least the total the trajectory needs: 40 m/s of cruise trims, the timing correction, the insertion burn and 60 m/s of orbit trims.',
  'A dish is always fitted, so this always passes. It reports how much you can send per pass, which matters for the downlink caution.',
  'Storage must hold the data from one full pass with every instrument on. If it cannot, observations that do not fit are lost.',
  'A mission without a single instrument has no science to return.',
  'This shows whether you can run every instrument at once. If not, you must stagger observations or draw down the battery, which is fine but takes planning.',
  'Cruise events use propellant: the off-course burn, and 15 m/s more if you choose safe mode in the power fault. A 10% margin leaves room for them.',
  'If your instruments record more than the downlink sends in a pass, a backlog builds. You can handle it with the data event, but it costs value.'];

/* ---------- event outcome explainers ---------- */
function tcmExplain(q){
  const t=S.tcm;if(!t)return Promise.resolve();
  const band=t.km<8000?'under 8,000 km (full marks, 20 of 20)':t.km<30000?'8,000 to 30,000 km (13 of 20)':t.km<90000?'30,000 to 90,000 km (6 of 20)':'over 90,000 km (0 of 20)';
  const rows=[
    `<b>What the error was.</b> Tracking showed a drift that would have missed Mars by ${f0(t.need*9000)} km. To cancel it exactly you needed about ${f0(t.need)} m/s in the direction of ${t.dir}°.`,
    `<b>What you did.</b> You burned ${t.mag} m/s at ${t.set}°. The remaining miss was ${f0(t.km)} km, which falls in the band ${band}.`,
    `<b>What it cost.</b> The rocket equation turns speed change into propellant: Δm = mass × (1 − e^(−Δv ÷ (Isp × g₀))). Your burn used ${f1(t.used)} kg.${t.clean?` The leftover error was above the ring, so navigation spent a further ${f1(t.clean)} m/s cleaning it up later.`:''}`,
    `<b>Why it matters.</b> The final miss sets how much trimming Mars orbit insertion needs. In real navigation, the earlier an error is corrected, the less it costs, because a small speed error grows into a large position error over millions of kilometres.`];
  return tell('Explained · course correction','What your burn did',explain(rows,'Step by step'),'Continue');
}
function moiExplain(f,v,spent,kind){
  const shed=(f.vh-v)*1000,need=(f.vh-f.vt)*1000;
  return explain([
    `<b>Speed you had to lose.</b> You arrived at ${f2(f.vh)} km/s at closest approach. Escape speed there is ${f2(f.vesc)} km/s, and your target orbit speed is ${f2(f.vt)} km/s. That asks for about ${f0(need)} m/s of braking.`,
    `<b>What you did.</b> You ended at ${f2(v)} km/s, a braking of ${f0(shed)} m/s, and used ${f1(spent)} kg of propellant.`,
    kind==='ok'?'<b>Why it counts as clean.</b> Your final speed is inside the target band, so the orbit is the one you planned.':kind==='loose'?'<b>Why it is “captured, but high”.</b> You are below escape speed, so Mars holds you, but you did not reach the target speed. The orbit is wider than planned.':'<b>Why it failed.</b> The final speed was outside what an orbit allows.'],'Why this happened');
}
