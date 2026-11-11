# Our Little World

A small 3D walking game built with [three.js](https://threejs.org) and [Vite](https://vite.dev). You play a chibi girl with long black hair. You explore five zones linked by portals, and cute characters and cube-pet animals wander around them. In the Gym, you have to cross a trench, first over a flat floor with cover, then by jumping from ledge to ledge, and last over moving platforms, while the gym characters throw dumbbells and yoga balls at you. In Hawaii you can swim in a lagoon off the beach, with a raft to jump off, floaties, sea turtles and leaping fish. The last zone, a celebration, is reached through a corn maze on the farm.

## Running it

You need **Node.js 20 or newer**.

```powershell
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

To put it online, run `npm run build` and upload the `dist` folder (about 35 MB) to any static host. It works from a subfolder too. `npm run preview` tries the build locally first.

### Controls

| Action | Input |
|---|---|
| Walk | WASD / arrow keys (camera-relative) |
| Jump | Space (in the water it hops you up out of it) |
| Swim | In Hawaii, walk off the beach into the cove. Swim into the beach or the raft to climb out onto it |
| Rotate camera | Move the mouse, no button needed. The key press or click on the title screen locks the mouse to the game. Esc frees it, and a click on the game locks it again |
| Change zone | Walk into a portal ring |
| Read a sign | Stand next to it and press E (E or walking away closes it. Esc does too, but while the mouse is locked, the browser takes the first Esc to free the mouse) |
| Mute / unmute sound | M, or the button in the corner |

Sound starts with the key press or click on the title screen, because browsers keep a page silent until then.

### Dev URL flags

- `?zone=Hawaii` skips the title screen and starts you in that zone. Any zone name works: `K-Town`, `Gym`, `Hawaii`, `Farm`, `Celebration`.
- `?terrain` prints an ASCII map of Hawaii's baked terrain to the console, and a second one of how deep the water is. Use it to choose portal and pet positions, or to see where you can swim.
- `?quality=low` (or `medium`, `high`) fixes the graphics quality. Without it, the game starts on high and steps down by itself if the frame rate stays low.
- `?ktown=dusk` shows K-Town as a neon evening. To make that permanent, change `DEFAULT_TIME` at the top of [src/street.js](src/street.js).

## The world

The zones sit in a rough 2×2 grid, 60 units apart. The Gym's hall is too long for its spot, so it's pushed out to the east, and the Celebration sits one row further south of the Farm, clear of the corn maze that reaches out east of the farm. Zones must not overlap, because nothing checks which zone a portal or obstacle belongs to. Only the zone you're in is rendered, and the sun and its shadow camera follow you. The portals form a chain in `ZONES` order:

**K-Town ↔ Gym ↔ Hawaii ↔ Farm ↔ Celebration**

The Farm's portal to the Celebration stands at the far end of the corn maze.

| Zone | File | What it is |
|---|---|---|
| K-Town | [src/street.js](src/street.js) | West 32nd Street in Manhattan: storefronts from the Asian Shop Pack, procedural buildings, Korean neon signs, paper lanterns strung over a street fair, chalk drawings on the road, a rectangular boundary |
| Gym | [src/gym.js](src/gym.js), [src/gymcourse.js](src/gymcourse.js), [src/gymthrowers.js](src/gymthrowers.js) | A long hall with a trench down the middle, and flickering neon love signs at the far end. You run between stacks of mats, jump from ledge to ledge, then ride moving platforms while the gym characters throw things from the rims |
| Hawaii | [src/beach.js](src/beach.js), [src/lagoon.js](src/lagoon.js) | A beach (the Miami Beach diorama), scaled up, with real uneven terrain and gulls wheeling out to sea. Its rocks and props are blocked off. Off its cove is a lagoon you can swim in, ringed with buoys, with a raft, floaties, sea turtles and fish |
| Farm | [src/farm.js](src/farm.js), [src/cornmaze.js](src/cornmaze.js) | A farm in the fall, under a golden hazy sky: a farmhouse, a crop field with a pumpkin-head scarecrow, a pumpkin patch, hay bales, maples dropping leaves, and a split-rail fence around the edge. A "CORN MAZE" gate in the east fence leads into an easy corn maze, with the Celebration portal in a clearing at its far end |
| Celebration | [src/celebration.js](src/celebration.js) | A party at dusk: a "Happy Anniversary!" banner, a glowing dance floor under string lights and balloons, a cake with candles, presents, a big glowing heart, falling confetti, fireworks on the horizon, and a hedge strung with fairy lights |

Every zone has its own music, and walking through a portal crossfades to the next zone's. K-Town, the Gym, Hawaii and the Farm play the songs in [assets/bgm](assets/bgm) (`zone1.mp3` to `zone4.mp3`, in that order). They loop, and each one picks up where it left off when you come back. The Gym's song is the exception at the end: it fades away when you reach the last deck, and stays gone. Around the music, K-Town has toy-sized street sounds: little cars going meep-meep, bike bells, a shop door's ding-dong and birds. The Gym has room tone: clanking weights, a dropped dumbbell and a treadmill, plus sounds for things being thrown, thudding and bouncing. The Farm has a breeze in the dry leaves, crickets, birds and the farm's animals. The Celebration plays a bouncy party tune with a music box, ukulele and marimba. On top of that are the little sounds of playing: footsteps for whatever you're walking on (the dance floor plays a note with each step, and the raft's planks knock), jumps, portals, letters, and characters saying hello. In the water there are splashes (bigger the further you drop in), a soft plip for each paddle, fish plopping, and the rubber duck squeaks when you bump it. Everything but the four songs is synthesized live in [src/audio.js](src/audio.js).

Each zone also has wandering characters: Sketchfab characters in K-Town, the Gym and Hawaii, Kenney cube pets on the Farm, and a mix of both at the Celebration. They idle, stroll near their home spot, glance at you, and hop and show a heart when you get close.

The light moves through one day: a fresh morning in K-Town, noon in Hawaii, a golden afternoon on the Farm, and dusk at the party.

### The finale

Reading the sign at the Celebration sets off the finale: every guest gathers round and cheers, the character turns to the camera and throws their arms up, the camera slowly circles, confetti poppers go off, the fireworks come closer and burst into hearts, and bells join the music. The letter moves to the side so you can watch. Closing it, or walking away, lets everyone get back to the party.

### The Gym's trench

You go east along the trench from the K-Town door to the Hawaii door, which is at the far end, up on the last deck with the zone's sign. The first stretch is a flat floor you can't fall off, with stacks of mats for cover. After that it's ledges over a pit, and from the deck at x=28 to the finish, platforms that move. The platforms and the cover are lists at the top of [src/gymcourse.js](src/gymcourse.js). Run `node tools/check-course.mjs` after changing them: it tests every jump against the real jump and speed numbers in `main.js`, and that there's a way through the cover. For moving platforms it tests the whole cycle, including that each jump is in reach for long enough.

- **Throwing** ([src/gymthrowers.js](src/gymthrowers.js)): the character ahead of you lifts something overhead while a ring shows where it's going to land, then throws it at where you're heading. Cover stops a throw that runs into it. A hit only shoves you. You can't lose health, so falling is the only cost. Nobody throws while you're on a deck, on the stairs or in the pit.
- **Moving platforms**: give a platform a `move` and it swings to and fro along X, Y or Z, and they all share `CYCLE`, so they stay in step. One carries you along, you keep its speed through a jump, and throws aim for where it's taking you.
- **Falling and checkpoints** ([src/gym.js](src/gym.js)): fall into the pit and the heart closes over the screen, then opens with you back up on the last deck you stood on.
- **Never stuck**: after 3 falls in a section the throws come less often, after 6 they stop, and the 8th fall takes you up to the next deck instead (`EASE_AFTER`, `STOP_AFTER` and `HELP_AFTER` at the top of `gym.js`).

### Hawaii's lagoon

South of the beach, the island's cove opens into a lagoon, a circle of sea marked off by a line of buoys. Walk off the beach into the cove and you float, swimming slower than you walk, with a doggy paddle that splashes as each hand dips in. Ripples spread out behind you, and you ride the swell out in the open water. Space hops you up out of the water. Swim into the beach and you climb out onto it with a hop. The cove has no shallows: the sand drops straight into deep water.

- **Where you can swim** is baked with the rest of the terrain in [src/beach.js](src/beach.js): the water inside `LAGOON` (in [src/lagoon.js](src/lagoon.js)) that's too deep to wade in, keeping a body's width from rocks and anything floating in it. The bank where the sand meets the water doesn't block you, unless it stands more than `BANK_CLIMB` above the water. The characters on the beach still can't go in. Run with `?terrain` to see it: `~` is where only you can go.
- **The island's own water** stood up to 0.45 above the sea at its rim, which showed as a stepped ledge from out in the lagoon. So its surface now eases down to sea level over its last few units (`lowerWaterRim` in beach.js).
- **In the lagoon** ([src/lagoon.js](src/lagoon.js)): a round raft with a ladder and a heart flag, which you climb onto by swimming into it, and jump off with a big splash. A donut float, a rubber duck that squeaks, and a beach ball drift off when you bump them, and a slow current brings them back. Two sea turtles paddle about and swim over to say hello, and fish leap out of the water near you every few seconds. Everything floats on the swell, using `swellAt()`, which works from the same wave list as the ocean's shader.

### The corn maze

The maze is an ASCII map at the top of [src/cornmaze.js](src/cornmaze.js). `#` is corn and anything else is path. Odd rows and columns are paths (2.6 units wide), and even ones are the thin rows of corn between them (1 unit). Letters on the paths place things: `P` the portal, `S` a scarecrow, `o` a pile of pumpkins, `H` a hay bale with balloons. Edit the map to reshape the maze. Keep the way in on the west edge (column 0), because the maze lines that row up with the gate in the fence. How thick the corn grows is set by `SPACING` (the distance between stalks) and `LEAVES` (leaves on each stalk), just below the map. Inside the maze the camera rises and closes in so you can see over the corn.

## Code layout

```
index.html          page shell: the title screen, hint, letter window, mute button, heart wipe
src/ui.css          how all of that looks
src/ui.js           what drives it
src/main.js         config, scene, zones, pets, player movement, camera, the finale, loop
src/look.js         how the picture gets finished: tone mapping, glow, grade, quality tiers
src/sky.js          gradient sky dome, clouds and far-off hills
src/portal.js       the portal: ring, swirl and sparkles
src/fx.js           little effects: hearts over characters, puffs of dust, splashes and ripples on the water
src/grass.js        swaying grass tufts
src/character.js    the player character, built in code (hair swept along curves, a painted face that blinks and beams when she cheers), with eased walk/jump/idle/cheer/swim animation
src/sign.js         the wooden signpost mesh
src/messages.js     the text each zone's sign shows (placeholders for now)
src/kit.js          shared helpers: model loading, canvas textures, cached materials, box/cyl/flat mesh makers
src/audio.js        zone music (the songs in assets/bgm, and the party's synthesized tune), the sounds around it, and one-shot sounds, with Web Audio
src/street.js       K-Town zone
src/gym.js          Gym zone: the hall, its equipment and checkpoints
src/gymcourse.js    the Gym's trench: the platforms and how you collide with them
src/gymthrowers.js  the Gym's characters throwing dumbbells and yoga balls
src/beach.js        Hawaii zone + terrain bake (height grid, water, walkability, where you can swim)
src/lagoon.js       Hawaii's lagoon: the buoy line, the raft, floaties, sea turtles and leaping fish
src/farm.js         Farm zone (Draco-compressed models, falling leaves, the gate to the maze)
src/cornmaze.js     the farm's corn maze: the map, walkability, instanced corn
src/celebration.js  Celebration zone (dusk sky, dance floor, lights, fireworks)
tools/inspect-glb.mjs        print a GLB's node tree, counts and bounding box
tools/inspect-glb-parts.mjs  print each mesh's world position and size
tools/optimize-assets.mjs    make the slimmed models in assets/optimized from the originals
tools/check-course.mjs       test every jump on the Gym's course against the real physics
assets/             3D asset packs (see Credits); assets/optimized holds the slimmed copies the game loads
```

Run the tools with `node tools/inspect-glb.mjs path/to/file.glb`. If you change or add a model, list it in `JOBS` at the top of [tools/optimize-assets.mjs](tools/optimize-assets.mjs) and run `node tools/optimize-assets.mjs`. The originals are never changed.

### How a zone is defined

Each entry in `ZONES` (in [src/main.js](src/main.js)) has a `name`, center `x`/`z`, a `ground` color and a `portal` color. A custom zone spreads in an object from its own module, which can provide:

- `build(zone, addObstacle)`: adds the scenery to `zone.group`. It may return a promise; the beach does this so its portals can be lifted onto the sand once the terrain has baked. A portal whose spot is in water floats there instead, bobbing with it (`PORTAL_SINK` in [src/main.js](src/main.js) is how far down it sits), and you come out of it swimming. Hawaii's Farm portal stands on the raft out in the lagoon (on a deck, a portal stands on it instead, and rides it as it bobs), so you swim out to it.
- `bounds: { halfX, halfZ }`: a rectangular walkable area. Without it, the zone is a disc of `ZONE_RADIUS`.
- `portalSpots: { [zoneName]: { x, z, face?, y? } }`: hand-placed portals, in coordinates local to the zone center.
- `spawn: { x, z, face: { x, z } }` (the first zone only): where the game starts and the point the character looks at, with the camera right behind.
- `petSpots: [{ pet, x, z }]`: hand-placed pets. A zone can have both `npcSpots` and `petSpots`.
- `terrain` (set by `build`): `heightAt(x, z)` and `walkable(x, z)` for uneven ground and no-go areas. The farm uses this to keep you out of the farmhouse and on the maze paths. An optional `annex(x, z)` marks ground past the zone's disc (the farm's gate and maze, Hawaii's lagoon). There the player isn't clamped to the disc, and `walkable` alone keeps them in. Water you can swim in (the beach) adds `waterAt(x, z)` (its surface, or null where it's dry), `bedAt(x, z)` (the sea bed, `-Infinity` where there's none) and `swimmable(x, z)` (where only the player can go).
- `deckAt(x, y, z)` (local coords): the height of something to stand on over the water at that spot, if it's no higher than `y`, else `-Infinity`. The beach's raft.
- `viewAt(x, z)` (optional): returns `{ distance, height }` to move the camera at that spot, or `null` for the default. The farm uses it to lift the camera over the maze.
- `signSpot: { x, z, face? }`: where the zone's "press E" sign stands. Its text is `MESSAGES[zone.name]` in [src/messages.js](src/messages.js).
- `title`: the name shown as you arrive. The default is `name`.
- `sky`: a background and fog color used while you're in the zone. The default is the blue `SKY` in main.js. Match it to the horizon of the zone's dome ([src/sky.js](src/sky.js)), so the ground melts into the sky.
- `fog: [near, far]`: where the fog starts and fully covers things. The default is `FOG` in main.js.
- `light: { sky, ground, hemi, sun, sunIntensity }`: hemisphere and sun colors and strengths used while you're in the zone. The default is `DAYLIGHT` in main.js.
- `sunOffset: [x, y, z]`: where the sun sits, from the zone's center. The default is `SUN_OFFSET` in main.js. Lower it for long evening shadows.
- `look: { exposure, bloom, vignette, saturation, env }`: how the picture gets finished in this zone (see `DEFAULT_LOOK` in [src/look.js](src/look.js)). Things only bloom if they're brighter than white, so to make something glow use `glow()` or `glowMap()` from [src/kit.js](src/kit.js).
- `sound`: the soundscape that plays while you're in the zone, as a key of `SOUNDSCAPES` in [src/audio.js](src/audio.js): `'cutesy'`, `'gym'`, `'cozy'`, `'harvest'` or `'party'`, or `'city'` for the realistic street noise K-Town used to have. Without it, the zone is quiet. To add a soundscape, write a function like the others and add it to `SOUNDSCAPES`. It gets the audio context, an output node and a start time, and returns its continuous `sources` plus `tracks`, each of which plays one event and returns the seconds until its next one. A soundscape with a song in `BGM` plays that instead of its track marked `tune`.
- `surface` or `surfaceAt(x, z)` (local coords): what you're walking on, as a key of `SURFACES` in [src/audio.js](src/audio.js), for the footsteps.
- `dust`: the color of the puffs you kick up. Without it, you don't.
- `course` (the Gym): platforms at different heights, with `advance` to move the moving ones, `surfaceBelow`, `platformAt`, `pushOut` and the `checkpoint` a fall in the pit takes you back to. A zone with one also gets a shadow right under you, a camera that rides at your standing height and looks along `viewYaw`, the `stoodOn` and `fell` callbacks, and a `play` object passed to its `update`.
- `update(dt, movers, obstacles, play, throwers)`: called every frame while you're in the zone. `play` has your position (`pos`) and speed (`vel`), `effects`, `swimming`, and `climb(top)`, which hops you up out of the water onto something that high (the beach's raft uses it).
- `npcSpots` entries with `throws` and `y`: the character stands on that perch and throws it (see [src/gymthrowers.js](src/gymthrowers.js)).
- `cameraMargin`, `ceiling`: how far the camera keeps from the edge of a rectangular zone, and the height it stays under.
- `camFade`: a list of `{ object, near, far, at }`. The object melts away when the camera comes within `near` of `at`, and comes back past `far`. Characters do this automatically; K-Town's lamps and the party's banner and poles are listed here.
- `finale: { start, stop }`: makes the zone's sign set off the finale.

Obstacles are circles on the ground (`{ x, z, r }`), with an optional height range (`base`, `top`). The player is pushed out of them, which makes them slide around instead of sticking.

## Tuning

The CONFIG block at the top of [src/main.js](src/main.js) controls how the game feels:

| Want to change | Tweak |
|---|---|
| Walking speed | `PLAYER_SPEED` |
| How much weight there is to starting and stopping | `PLAYER_ACCEL`, `PLAYER_BRAKE` |
| Turning speed | `TURN_SPEED` |
| Jump height / floatiness | `JUMP_VELOCITY`, `GRAVITY` |
| Camera closer or farther | `CAM_DISTANCE`, `CAM_HEIGHT` |
| Camera field of view | `CAM_FOV` |
| Camera floatier or snappier | `CAM_SMOOTHING` (closer to 0 is snappier) |
| How quickly the camera swings behind you | `CAM_FOLLOW` (0 turns it off) |
| How far the camera turns as the mouse moves | `LOOK_SPEED` |
| How long the camera waits after you turn it before it turns by itself again | `CAM_FOLLOW_PAUSE` |
| Zone size / spacing | `ZONE_RADIUS`, `ZONE_SPACING` |
| Portal sensitivity | `PORTAL_TRIGGER` |
| How close to read a sign / how far until it closes | `SIGN_RANGE`, `SIGN_CLOSE` |
| How close characters notice you, and how often | `GREET_RANGE`, `GREET_EVERY` |
| How long the heart wipe takes | `WIPE_CLOSE`, `WIPE_OPEN` |
| How often the Gym's characters throw | `THROW_EVERY` in [src/gym.js](src/gym.js) |
| How far and how fast the Gym's platforms move | `move` on each one and `CYCLE` in [src/gymcourse.js](src/gymcourse.js) |
| How hard throws are to dodge, and how hard they hit | `THROW`, `LEAD` and `IN_AIR` in [src/gymthrowers.js](src/gymthrowers.js) |
| How hard a hit knocks you | `HIT_HOP`, `KNOCK_FADE` |
| Swimming speed, and how long it takes to get going and to stop | `SWIM_SPEED`, `SWIM_ACCEL`, `SWIM_BRAKE` |
| How low you float in the water | `SWIM_FLOAT` |
| The lagoon's size and where it is, the raft, the floaties, the turtles and the fish | the top of [src/lagoon.js](src/lagoon.js) |

The title screen's words are in [index.html](index.html). The character's colors (skin, hair and its shine, dress, white trim, shoes, bow, eyes) are constants at the top of [src/character.js](src/character.js). Her face is drawn by `drawFace` in the same file, once for each look: eyes open, half shut and shut for blinking, and happy for cheering.

The graphics quality tiers, and how slow the game has to get before it steps down one, are at the top of [src/look.js](src/look.js).

Sound is tuned at the top of [src/audio.js](src/audio.js): `VOLUME` for overall loudness, `BGM_VOLUME` for the music against everything else, `SFX_VOLUME` for the one-shot sounds against the music, and `CROSSFADE` for how long the fade between zones takes. The songs are listed in `BGM`, further down. To swap one, change its file and its `end`, the second at which its sound stops, so that the loop skips any silence at the end of the file. An optional `start` is the second it begins at and loops back to (the Gym's song skips its first 35 seconds). Take a zone's line out of `BGM` to go back to its synthesized tune. `SONG_FADE` is how long the Gym's song takes to fade away, and `songEnds` on a deck in [src/gymcourse.js](src/gymcourse.js) is where that starts. Each soundscape's mix (how often the toy cars meep, the synthesized music's tempo, chords and melody) is in its own function.

## Common problems

- **Blank page**: open the browser console (F12). A missing import or a typo will show up there.
- **A farm model doesn't load**: the files in `assets/farm` are Draco-compressed. `modelLoader()` in [src/kit.js](src/kit.js) has a `DRACOLoader` whose decoder files are imported from three with `?url`.
- **A model doesn't load**: check the Network tab for a 404. Assets are imported with `new URL('../assets/...', import.meta.url)`, so the path is relative to the source file.
- **A character lost its shape or rig after slimming**: lower the `keep` or `error` for it in `JOBS` in [tools/optimize-assets.mjs](tools/optimize-assets.mjs) and run the tool again for that file.
- **Controls feel reversed**: `camYaw = 0` means the camera sits at +Z, looking toward -Z. If you changed the camera math, check it against that.
- **The mouse doesn't turn the camera**: click the game. The browser only locks the mouse to a page during a key press or click, and for a moment after Esc it refuses even then, so a click right after Esc may need repeating. The `?zone=` flag skips the title screen, so there the first click does it.
- **Shadows look blocky**: raise `shadowSize` in the `TIERS` in [src/look.js](src/look.js), or shrink the shadow camera bounds in [src/main.js](src/main.js).
- **Everything's washed out or glowing**: lower that zone's `look.bloom`, or the `strength` of its `glow()` materials.

## Next up

- Add interactables: a proximity check against a list of `{ position, radius, type, content }` objects, a "Press E" prompt, and a popup panel for photos, text and letters.

## Credits

- [Cube Pets](https://kenney.nl) by Kenney (see `assets/kenney_cube-pets_1.0/License.txt`)
- Gym characters (`assets/gym_characters`), from Sketchfab: [Big Chungus](https://sketchfab.com/3d-models/big-chungus-5d56da5de8f2476dad69091a1d8feca1) by [Juliocesar6328](https://sketchfab.com/Juliocesar6328), [Buff Doge](https://sketchfab.com/3d-models/buff-doge-7789128dcc784612b478add581f07948) by [Cyranek](https://sketchfab.com/cyranek), [Courage Eggplant](https://sketchfab.com/3d-models/courage-eggplant-64f9e381222141db90522a11687374fa) by [Mora](https://sketchfab.com/MoraAzul), [PERRI BUFF](https://sketchfab.com/3d-models/perri-buff-5646fb5ffadf4a2e9a0d48d71ae1ded5) by [christianhierrocordon](https://sketchfab.com/christianhierrocordon) (all CC-BY-4.0), and [SrPelo Hamster model](https://sketchfab.com/3d-models/srpelo-hamster-model-5372209d364b4a4599613ae4b3a79e71) by [victory_summery](https://sketchfab.com/victorysummery) (CC-BY-NC-ND-4.0)
- [Miami Beach Diorama](https://sketchfab.com/3d-models/miami-beach-diorama-020167590ea34247beeeea8d176e36ec) by David Jávorcsík ([Redlobo](https://sketchfab.com/Redlobo)), CC-BY-4.0
- Asian Shop Pack (free, game-ready) for the K-Town storefronts
- Farm models (`assets/farm`): autumn maple, tilled field tile, farmhouse
- The copies of these models in `assets/optimized`, which the game loads, are modified: smaller textures, and for some of them fewer triangles (the shark, bear, rabbit, chick, alien and maples). `JOBS` in [tools/optimize-assets.mjs](tools/optimize-assets.mjs) lists exactly what was done to each. The originals are alongside, unchanged. The hamster isn't slimmed, because its license doesn't allow modified copies
- Fonts, through [Fontsource](https://fontsource.org), all under the SIL Open Font License: [Fredoka](https://fonts.google.com/specimen/Fredoka), [Nunito](https://fonts.google.com/specimen/Nunito) and [Caveat](https://fonts.google.com/specimen/Caveat)
- [three.js](https://threejs.org), [Vite](https://vite.dev), [glTF Transform](https://gltf-transform.dev), [meshoptimizer](https://github.com/zeux/meshoptimizer)
