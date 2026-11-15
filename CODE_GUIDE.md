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
7. **Screens.** `VIEW.title`, `.briefing`, `.science`, `.planning`, `.design`, `.review`, `.cruise`, `.moi`, `.ops`, `.debrief`. Each one writes HTML into `<main>` and then attaches click handlers.
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

`window.__game` exposes `S`, `go()`, `plan()`, `design()`, `checks()` and `DEMO.k` (a speed factor: 0.02 runs the game fifty times faster). During a minigame, `window.__mini.solve()` and `.fail()` end it either way.
