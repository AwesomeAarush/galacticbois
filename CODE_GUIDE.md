# How the code works

Mission Control: Beyond is a static site. There is no build step and no server code: `index.html` loads one stylesheet and five scripts, and everything runs in the browser.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page shell: header strip, `<main>` (where every screen is drawn), the backdrop canvas, and the script tags. |
| `style.css` | All styling. The first half is layout; the block marked `CONSOLE SKIN` is the look (glass panels, status strip, location card). |
| `js/game.js` | The game itself: physics, data, state, every screen, every event, scoring. |
| `js/models.js` | All 3D assets, as a module called `Models`: planets, spacecraft, rocket, instruments, plus the small live 3D views and the backdrop. |
| `js/cutscenes.js` | The cutscene engine, as a module called `Cine`. |
| `tools/obj2rover.py` | Splits the Mars Exploration Rover OBJ into named parts and writes `js/rover_mesh.js`. |
| `js/roverkit.js` | Rover engineering: parts (`RK.CAT`), instruments (`RK.INS`), objectives (`RK.OBJ`) and the calculator (`RK.spec`). |
| `js/rover_mesh.js` | Generated rover geometry (base64, about 290 KB). |
| `js/equations.js` | Interactive equation panels (`Eq.attach`) and worked-formula cards (`FX`, see below). |
| `js/voice.js` | The narrator, as a module called `Voice`. |
| `js/GLTFLoader.js` | The standard three.js loader for `.glb` files (unchanged library code). |
| `assets/` | `spacecraft_3d.glb` (the spacecraft), `mars.jpg` and `earth.jpg` (planet maps from NASA's GMAT). |

three.js r128 comes from a CDN. If it fails to load, the game falls back to 2D drawings and still plays.

## game.js, top to bottom

1. **Constants and physics.** Real values (Sun's gravity, AU, Mars radius). `transfer(Q)` works out a transfer ellipse from Earth's orbit to a far point `Q`; `posAt()` gives position along it (Kepler's equation). `Le(d)` and `Lm(d)` give where Earth and Mars are on day `d`.
2. **Data tables.** `INST` (instruments), `SYS` (seven subsystems, each with tiers), `TR` (transfers), `ORB` (orbit choices), `REG` (Mars regions), `SITES` (launch sites), `NB` (notebook entries). To rebalance the game, edit these.
3. **State.** One object, `S`, holds the whole game. `fresh()` creates it. Nothing else is stored, which is why a saved game is just `S`.
4. **The three calculators.** Everything shown on screen comes from these:
   - `plan()` : the flight plan. How far off Mars will be on arrival, the braking burn, and the total speed change needed (including the launch site's extra).
   - `design()` : the spacecraft. Adds up mass, cost and power from the chosen parts, and uses the rocket equation for the speed change available.
   - `checks()` : the review board. Compares the two and returns pass/fail rows.
   `propNeeded()` and `howTo()` build on these for the "load what the flight plan needs" button and the step-by-step fixes.
5. **UI helpers.** `head()` (stage header), `say()` (a character line), `coach()` ("what to do here"), `meter()`, `ask()` and `tell()` (modal dialogs that return a Promise).
6. **Navigation.** `go(stage)` is the only way to change screen. It cross-fades the old screen out, shows the location card, moves the backdrop, and calls `VIEW[stage]()`.
7. **Screens.** `VIEW.title`, `.briefing`, `.planning`, `.design`, `.review`, `.cruise`, `.moi`, `.ops`, `.debrief`. Each one writes HTML into `<main>` and then attaches click handlers. `VIEW.science` no longer exists: science objectives and spacecraft build are one `VIEW.design` screen, in that order.
8. **Flight.** `launch()` freezes the design into `S.fl` and plays the launch cutscenes. `VIEW.cruise` runs a loop, one week per tick, firing events at set points. `VIEW.moi` is the engine-burn minigame. `VIEW.ops` is one orbit pass per click.
9. **Crew.** `crewNew()` creates three astronauts and shared supplies. `crewTick(weeks)` uses food, water and oxygen automatically and updates health, energy, stress and radiation. `crewPanel()` draws the panel; the player only sets meals and work schedule. `evWater()` and `evMed()` are the crew events.
10. **Events.** Ordinary events (`evComm`, `evPower`, ...) are choices. Major events (`evStorm`, `evRock`, `evToilet`, `evPanel`) are minigames that return true or false; `lethal()` wraps them and ends the mission on a failure (guided mode forgives one).
11. **Scoring.** `score()` returns six parts: science 30%, objectives 20%, efficiency 15%, crew 15%, operations 10%, reliability 10%.
12. **Extras.** `gmatScript()` writes the flight plan as a GMAT script. `SFX` makes the console sounds. `audioPanel()` is the audio settings.

## How a choice flows through the game

Picking a launch site sets `S.site`. From then on `cap()` returns that site's mass limit, `design()` adds its cost, and `plan()` adds its extra speed change. The review board, the build screen, the header chips and the GMAT export all read those same functions, so they stay in step without any extra code. Every other choice works the same way: change `S`, redraw the screen.

## models.js

- `planet(name)` : a sphere with a colour map, a bump map and a thin glowing atmosphere. The maps start as generated textures and are swapped for `assets/mars.jpg` and `assets/earth.jpg` when those load.
- `craft(options)` : the spacecraft. It loads the `.glb` once, groups its 615 parts by what they are (solar panels, radiator arms, tanks, antenna, ...), and then shows, hides or scales those groups to match the player's build. `stowed:true` folds it for the fairing.
- `rocket(options)` : the launch vehicle, with separable boosters, core stage and fairing halves.
- `view(canvas, kind, options)` : the small live 3D views inside screens. One shared renderer draws each view and copies it into an ordinary canvas.
- `backdrop(canvas)` : the planets behind the console. Each stage has a pose; changing stage glides between poses.

## cutscenes.js

`Cine.play(id, options)` returns a Promise that resolves when the scene ends. `SC` holds one function per scene; each is given progress `u` (0 to 1) and time `s`, and positions the camera and objects for that moment. Scenes are built at real size and distance: `planetAt(planet, radiusKm, distanceKm, direction)` places a planet at its true size, and a logarithmic depth buffer lets a 24 m spacecraft and a 6,779 km planet share one scene. Passing `at: 0.5` in the options freezes a scene at that moment, which is how each shot was checked.

## voice.js

`Voice.say(text, who)` and `Voice.stop()` are the whole interface. It plays a recorded file if `assets/voice/manifest.json` lists one for that line (key = `Voice.key(text)`), and otherwise uses the browser's built-in speech. Recorded lines from a voice-design service can be dropped in later without touching the game code.

## Testing hooks

`window.__game` exposes `S`, `go()`, `plan()`, `design()`, `checks()` and `DEMO.k` (a speed factor: 0.02 runs the game fifty times faster). During a minigame, `window.__mini.solve()` and `.fail()` end it either way. `Rover.dev` is the running expedition (`S`, `forms`, `damage(n)`, `breakdown()`); `Rover.COND` is the condition model; `Race.rank(list)` ranks a leaderboard; `FX._act(id, 'calc'|'hint'|'show')` drives a formula card.

---

## Expansion: two missions, rover, help buttons

**Two missions.** `S.mission` is 1 or 2. `TRACKS` in `js/game.js` lists the screens of each; `startMission(n)` starts one. Campaign results live in the browser under `mcb-campaign` (`CAMP.m1`, `CAMP.m2`), and the mission in progress under `mcb-save` (written on every screen change, restored by "Continue").

- Mission 1, *Orbital Reconnaissance*: one task, **choose the landing site**. The new `VIEW.site` screen shows what your instruments measured over Jezero for three candidate sites (`SURV`). It shows measurements only, and "no data" for any instrument you did not fly or did not point at Jezero.
- Mission 2, *The Red Frontier* (`js/mission2.js`): briefing → rover preparation → rover expedition → five-sol outpost → debrief. It reads the site and survey from `CAMP.m1`; without Mission 1 you land without a site report.

**Rover (`js/rover.js`).** `Rover.start({root, site, loadout})` returns a Promise that resolves with the expedition result. The terrain is a generated height map drawn once to a canvas, with a second canvas for fog of war. `step(dt)` is the physics (acceleration, coasting, braking, sand, slopes, collisions, map edge, battery). Rock classes and their compositions are in `CLS`; the eleven formations in `FORM`. All terrain and compositions are simulated and labelled so on screen.

**Help (`js/help.js`).** `Help.q('key')` returns a small "?" button. All explanations live in the one table at the top of that file (`what`, `why`, `act`, optional `more` and `draw`). To add one: add an entry, then put `${Help.q('yourKey')}` in any screen. `Help.temp({...})` registers a one-off entry built from live numbers.

**Hardware controls.** `.tsw` (toggle switch) and `.brk` (main breaker) are plain buttons styled in `style.css`; the class `on` flips the lever.

**Events.** `evStorm` is a solar particle event with measurements (flare class, proton flux and NOAA S-level, dose rate, duration), a worked dose formula and two decisions: where the crew shelters (1, 5 or 10 g/cm²) and whether the instruments go to safe mode or keep observing. Dose model D = Ḋ₀ × t × ½^(x ÷ 3 g/cm²), fitted to NASA transport calculations for an August-1972-like storm between 1 and 10 g/cm² and labelled as an approximation; the crew limit is NASA's 30-day blood-forming-organ limit, 250 mGy-Eq. It no longer ends the mission. Cruise odds are rolled at launch (`S.cr`): storm 55% (NOAA: about 13 storms of S3 or stronger per 11-year cycle), toilet leak 30%, rock 1%; the reasoning is in the comment above the roll.

**Demo controls** are hidden. Add `?demo` to the address to show them.

**Not done yet.** Narration still uses the browser's built-in voice; recorded voice files can be dropped in through the manifest hook in `js/voice.js`. The exported GMAT script has not been run in GMAT.


---

## Instruments and rover engineering

**Orbiter instruments (Mission 1).** `INST` in `js/game.js` holds ten instruments. Each has mass, power, data per pass, cost, reliability, a resolution line, capabilities (`cap`) and a guide (`g`: what it does, how it works, what it measures, why it matters, limitations). Guides are registered with the help pop-up as `i:<key>` when the game loads, so the numbers in a guide always match the table. The bridge under the spacecraft has six mounting positions (`SLOTS`) and a 150 kg payload allocation (`PAYLOAD_KG`); the build screen blocks a seventh instrument or one that would pass the allocation, and says which limit stops it.

The build screen's Step 1 is a workstation: the four objectives are stated as measurements (`OBJM1`), the catalog cards show each instrument's numbers, and `coverage(id)` lists what each installed instrument contributes to an objective. It lists facts, never a verdict. Tick Compare on two or three cards for a side-by-side table.

Instrument choices reach the rest of the mission through `REG[...].aff` (science value per region), `SURV` (what each instrument shows at the three candidate landing sites), `answered()` and `score()` (coarser instruments answer a question partly), the storm event (a radiation monitor buys 25 seconds of warning) and Mission 2 (no high-resolution camera means the lander comes down among rocks nobody saw: the rover starts at 88% condition).

**Rover (Mission 2).** `js/roverkit.js` is the single source of truth:
- `RK.CAT`: seven tabs of parts (mobility, power, arm and sampling, communications, protection, appearance). Every option carries mass and cost plus its effects.
- `RK.INS`: thirteen rover instruments, each with a mount (mast, deck, arm turret, body bay), mounting units, energy and data per use, and a guide (`r:<key>`).
- `RK.spec(cfg)`: turns a configuration into mass, cost, mounting use, battery, standing load, daylight power, drive energy, top speed, sand performance, climbing, rock clearance, stability, damage taken, reliability, data storage and radio rates, plus `can` (what the rover is able to do).
- `RK.blocked(cfg,key)`: why an instrument cannot be fitted (mount full, no arm). `RK.checks(spec)`: the limits that block deployment (lander mass 900 kg, budget $110M, mounting space).

The configuration lives in `S.m2.rover` and is saved on every change (and in `CAMP.rover`, so a new Mission 2 starts from the last design).

**Rover bay (`VIEW.m2prep` in `js/mission2.js`).** The 3D view is `Models.view(canvas,'rover',cfg,{zoom:true,pick})`: drag to turn, scroll or pinch to zoom, click a part to open its tab (`pick` receives the part's `{tab,key,label}`). `view.highlight(key)` makes a component glow when its option is hovered. Hovering or focusing an option shows the proposed change as green and red differences next to each number before it is applied.

**Rover model (`rover()` in `js/models.js`).** Parts from `js/rover_mesh.js` are assembled into groups: the suspension stretches to the chosen clearance around the hub line; the body, deck and wings stretch with the rover length; wheels are rebuilt at each hub at the chosen size and tread (the model's own wheel, or generated curved-tread, wide sand or wire-mesh wheels) and the whole vehicle is raised so they still touch the ground. Instruments, the radioisotope generator, battery packs, drill bits, the sample rack, antennas, covers, armor plates and decals are children of the part they attach to. Materials use a shared weathering texture (dust and grime, also used as a roughness map).

**Expedition (`js/rover.js`).** `genForms(site, seed)` places exactly ten formations from the seed in `S.m2.seed` (made once per rover mission, renewed only by Restart or Fly it again): rock type follows the terrain zone, positions avoid the base, steep ground, crater walls and each other. The minimap (top right of the view) and the regional map (M) show all ten as diamonds: dashed when only located from orbit, then sighted, photographed, analyzed and sampled. Click a marker for its code, status, distance and bearing, and set it as a waypoint. Names and rock types stay hidden until the rover gets there and uses its instruments. Every three seconds, and when the page is hidden, the expedition saves itself into `S.m2.rv`, so a refresh continues where it stopped.

Gameplay reads the rover spec: energy in watt-hours (generation from sunlight, dust and the time of day, or a generator; standing load; drive energy by mass, sand and slope), top speed, sand speed, climbing, rocks small enough to drive over, slope damage by stability, impact damage by frame and wheel toughness, turning, data storage filled by each picture or analysis and emptied by direct-to-Earth and relay passes, and faults whose rate follows reliability. Instruments decide which actions exist: camera pictures, laser or contact chemistry, microscope close-ups (the grain detail that tells sedimentary from igneous rock), thermal images that show soft sand, radar profiles, weather and radiation records, an onboard lab that needs a powder drill. The magnetometer and seismometer work but return rover noise, and say why.

**Restart.** The button at the bottom left (`restartMission()` in `js/game.js`) restarts the current mission after a confirmation. Mission 2 keeps the landing site, the orbital survey and the rover design and rolls new formations.

**Not done.** The expedition is a top-down map view; the 3D rover appears there as a picture rendered from above, not as a 3D scene. Equipment mounting positions are fixed per instrument (there is no choice of where an instrument bolts on). Hover previews need a mouse or keyboard focus; on a touch screen a tap applies the change straight away.


---

## NASA GMAT trajectories

`js/gmat_data.js` is made by `tools/gmat_pipeline.py`, which writes GMAT scripts and runs GMAT's console program:

1. **Ephemeris run.** A clock spacecraft steps one day at a time and GMAT reports Earth's and Mars's positions and velocities (Sun-centred, mean ecliptic of J2000, DE421) for day −10 to day 1,900 of the game calendar.
2. **Targeting run.** For every launch day inside a window (plus four days either side), and for both routes, GMAT's differential corrector varies the in-plane departure velocity until the spacecraft is within 500 km of Mars's position on arrival day in the ecliptic plane. The flight time is not optimised: it comes from the game's route rule (below), so it changes smoothly from one day to the next. Forces: point-mass Sun, Venus, Jupiter and Saturn, Runge-Kutta 8(9).
3. **Propagation run.** GMAT flies each targeted transfer again and reports position and speed every 2 days and on arrival day.

**One route rule for every launch day** (`GM.route` in `js/game.js`, `QEph.route` in the pipeline; both read the same rounded positions, so they agree to the day). The transfer orbit's perihelion is Earth's actual position on launch day. Its aphelion is Mars's actual distance from the Sun at the arrival longitude (Hohmann), or 2.4% beyond it (fast route, which then crosses Mars's orbit early). Kepler's equation gives the flight time. `plan()` uses this route for the flight time, the arrival point and the aiming error on every date, in or out of a window, so the drawn route, the "You arrive here" mark and the arrival date never jump. Inside a window GMAT's aimed flight path is attached (`tr.gm`) and the cruise follows it (`craftAt`); Mars is up to 1.85° out of the ecliptic, so after half the flight `craftAt` closes the out-of-plane offset (a mid-course plane change) and the spacecraft meets Mars on arrival day. Without the data file the game uses its circular-orbit model.

`drawSys()` draws one full orbit of each planet from the start of the ephemeris (so the orbits never run off the end of the table), the route, the arrival mark, and labels laid out so they do not overlap or leave the canvas.

Bugs this replaced: GMAT data used to exist only for window days, and the game switched to a different model outside them (jumps on 19→20 Nov 2028 and 19→20 Mar 2031); the pipeline picked each day's flight time by optimisation, which switched between short-way and long-way transfers (the route jumped backward on 7→8 Feb 2031); the Mars orbit was drawn from the launch date forward and ran past the end of the ephemeris after 27 Sep 2031; the arrival mark was drawn only on the model path.

**Not from GMAT:** the braking burn, aerobraking and orbit choices, the speed-change budget and the aiming-error penalty still use the game's simplified model. The launch energy (C3) and arrival speed GMAT found are shown next to them for comparison.

## Race mode

`js/race.js` (`Race`) handles rooms over two kinds of route, opened all at once by `openRoutes(room, listen, onLink)`:

- **Game server** (`apiLink`): `/api/race` on the same site (`api/race.js`, a Vercel Function backed by Upstash Redis). The browser POSTs `{room, pub:[{box,msg}], poll:[{box,since}]}` every 1.2 s (2.5 s once the race runs) and right away when it has something to send. Each room has two lists, `up` (players to host) and `down` (host to players); `since = -1` starts listening at the current end. `GET /api/race` reports `{ok, store}`; without Upstash variables the route answers `store:false` and the game does not use it.
- **Public relays** (`mqttLink`): MQTT 3.1.1 over secure WebSockets to the relays in `RELAYS`, topics `mcb-race/v3/<code>/up` and `.../down`. Library: `js/vendor/mqtt.min.js`, with unpkg as a second source.

The host opens every route and listens on all of them; every message it sends goes out on all of them. A joining player opens every route, sends `hello` on each as it opens, and keeps the first route on which the host answers with `welcome` (or `refused`); the others close. Each message has an id (`mid`) so duplicates are ignored. "Check connection" runs `openRoutes` on a test room and lists what is reachable.

Messages: `hello`, `welcome` / `refused`, `lobby` (players list, also every 8 s as a heartbeat), `start` (mission, seed, rover site), `prog` (each player every 5 s and on each screen change: stage, step, score so far, finished, final score, time), `board` (the leaderboard, at most every 2 s; `over` when everyone has finished or left), `left`, `bye`. A player is marked as gone after 30 s without a message; a guest shows "no word from the host" after 30 s.

`game.js` provides `__raceStart(mission, seed, site)` and `__raceProgress()`. With `S.race` set, `srnd(key)` gives seeded random numbers for the launch day (`pickWindow`), whether the rare rock and toilet events happen, and the cruise event schedule (`makeSchedule`); Mission 2 uses the seed for the rock formations and the race picks the landing site. Debriefs call `Race.finish()` with the final score. Restart keeps the race seed. A player who refreshes can rejoin from the title screen with the same call sign. If the host leaves, the race ends and everyone's mission carries on solo.

Why two kinds of route: the first version connected browsers directly (WebRTC through PeerJS) and the second used only public MQTT relays on ports 8084, 8884 and 8081. Both failed on restrictive networks. The game-server route needs nothing but ordinary HTTPS to the game's own site.

**Testing.** `?api=0` turns off the game-server route; `?relay=ws://host:port,...` replaces the relay list; `?api=/path` points at another route.

## Worked formulas (`FX` in js/equations.js)

`FX.card(def)` returns a collapsible card; `FX.bind(root)` wires it; `FX.refresh(root)` re-reads live values after a design change (a solved card asks for new numbers only if its inputs actually changed). A definition lists the formula, each variable (meaning, unit, effect of raising it), an equation template with blanks, `get()` for live values, `calc`, `steps`, `meaning` (what the answer means for this mission), hints, and optional explanations for common wrong values (`why`) and wrong answers (`ansWhy`). Cards in the game: delta-v (engine tab), array power at Mars (power tab), crew oxygen (crew tab), Hohmann flight time (trajectory screen), rover range (rover power tab), storm dose (storm event). Definitions for Mission 1 are in `FXDEF` in game.js.

## Mission 2 and Mission 1's data

`reconOf(survey)` (game.js) turns the instruments whose Jezero data reached Earth in Mission 1 (`S.survey`, saved in `CAMP.m1.survey`) into what the surface team knows: high-resolution images locate the formations exactly and show terrain in detail; context images locate them within about 60 m and show terrain coarsely; the altimeter gives relief; the spectrometer adds likely rock types; nothing on file means formations must be found by driving. The rover reads it as `opt.recon` (marker positions and uncertainty circles, fog darkness). Data still on the orbiter at the end of Mission 1 does not count. "New campaign" on the title screen clears it.

## Rover condition

`Rover.COND` (rover.js): condition runs from 100% to 0%; lower condition means slower driving, more energy per metre, more instrument faults and noisier measurements. A breakdown can happen at any time with a rate of 1.5 × (1 − c/100)⁴ per Mars hour of driving (a fifth of that parked), and 0% is certain failure. A breakdown ends Mission 2: the signal-lost sequence plays, the debrief records it, the outpost does not run, and race mode reports a failed mission.

## Race speed multiplier

`Race.rank(list)` ranks by race score = mission score × speed. Speed is 1.00× to 1.15×, against the slowest completed mission (half its time or less: 1.15×; the same time: 1.00×; linear in between). Failed missions always get 1.00×; one completed mission gets 1.00×.

## Data sources and accuracy

Real figures, with their source: physical constants; planet positions and transfers (NASA GMAT runs, DE421); Earth's spin speed by latitude; instrument masses, powers and resolutions close to the named instruments (HiRISE, CTX, CRISM, THEMIS, MCS, SHARAD, Odyssey GRS, MOLA, MAG/ER, MARIE; Mastcam-Z, SuperCam, APXS, MAHLI, MEDA, RAD, SAM, RIMFAX, MMRTG); best flown storable bipropellant Isp about 329 s; 0.84 kg of oxygen per person per day; NASA's 30-day blood-forming-organ dose limit of 25 cGy-Eq; Jezero temperatures from Perseverance's MEDA; rock chemistry as oxide weight percent typical of Gale and Jezero rocks; spectral band positions; MRO aerobraking (about five months, more than 400 passes); MOXIE (122 g of oxygen in 16 runs).

Game values (labelled in code comments, with the reasoning): Mission 1 costs are scaled so the HiRISE-type camera costs what HiRISE did ($35–40M) and every other cost by the same factor (`COSTK` = 1.5); the rover budget is far below a real rover's (Perseverance: about $2.4 billion to build and launch). The 1,200 kg launch limit with a crew of three is the game's premise and is not physically possible; life-support masses are one tenth of real ones, all at the same scale, and consumables are not counted (comment above `OXY`). Data volumes, reliabilities, rover drive energy, the compressed Mars clock, outpost power and the rover breakdown curve are game values.
