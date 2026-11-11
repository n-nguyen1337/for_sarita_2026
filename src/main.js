import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { KTOWN } from './street.js';
import { GYM } from './gym.js';
import { BEACH } from './beach.js';
import { FARM } from './farm.js';
import { CELEBRATION } from './celebration.js';
import { makeCharacter } from './character.js';
import { makeFx } from './fx.js';
import { makeLook } from './look.js';
import { makePortal } from './portal.js';
import { makeSign } from './sign.js';
import { MESSAGES } from './messages.js';
import { heartTexture, loading, modelLoader, ringTexture, softDisc } from './kit.js';
import { setFinaleSound, setZoneSound, sfx, toggleMute } from './audio.js';
import * as ui from './ui.js';

// Cube Pets asset pack (Kenney), with their colors embedded (see tools/optimize-assets.mjs)
const PET_GLB = {
  cat:        new URL('../assets/optimized/pets/animal-cat.glb', import.meta.url).href,
  dog:        new URL('../assets/optimized/pets/animal-dog.glb', import.meta.url).href,
  bunny:      new URL('../assets/optimized/pets/animal-bunny.glb', import.meta.url).href,
  pig:        new URL('../assets/optimized/pets/animal-pig.glb', import.meta.url).href,
  cow:        new URL('../assets/optimized/pets/animal-cow.glb', import.meta.url).href,
  panda:      new URL('../assets/optimized/pets/animal-panda.glb', import.meta.url).href,
  penguin:    new URL('../assets/optimized/pets/animal-penguin.glb', import.meta.url).href,
  fox:        new URL('../assets/optimized/pets/animal-fox.glb', import.meta.url).href,
  monkey:     new URL('../assets/optimized/pets/animal-monkey.glb', import.meta.url).href,
  chick:      new URL('../assets/optimized/pets/animal-chick.glb', import.meta.url).href,
  elephant:   new URL('../assets/optimized/pets/animal-elephant.glb', import.meta.url).href,
  parrot:     new URL('../assets/optimized/pets/animal-parrot.glb', import.meta.url).href,
};

// Cute characters (Sketchfab, CC-BY) that wander K-Town, the gym and the beach as NPCs
const NPC_GLB = {
  bananaCat:  new URL('../assets/optimized/cute_characters/cute_cat_in_cute_banana.glb', import.meta.url).href,
  chick:      new URL('../assets/optimized/cute_characters/cute_chick.glb', import.meta.url).href,
  star:       new URL('../assets/optimized/cute_characters/cute_little_star.glb', import.meta.url).href,
  rabbit:     new URL('../assets/optimized/cute_characters/cute_rabbit.glb', import.meta.url).href,
  alien:      new URL('../assets/optimized/cute_characters/cute_alien_character.glb', import.meta.url).href,
  avocado:    new URL('../assets/optimized/cute_characters/cute_avocado.glb', import.meta.url).href,
  bear:       new URL('../assets/optimized/cute_characters/cute_bear.glb', import.meta.url).href,
  squid:      new URL('../assets/optimized/beach_characters/cute_squid.glb', import.meta.url).href,
  mascot:     new URL('../assets/optimized/beach_characters/mascot.glb', import.meta.url).href,
  shark:      new URL('../assets/optimized/beach_characters/vress_the_puppy_shark.glb', import.meta.url).href,
  chungus:    new URL('../assets/optimized/gym_characters/big_chungus.glb', import.meta.url).href,
  doge:       new URL('../assets/optimized/gym_characters/buff_doge.glb', import.meta.url).href,
  eggplant:   new URL('../assets/optimized/gym_characters/courage_eggplant.glb', import.meta.url).href,
  perri:      new URL('../assets/optimized/gym_characters/perri_buff.glb', import.meta.url).href,
  hamster:    new URL('../assets/gym_characters/srpelo_hamster_model.glb', import.meta.url).href, // not slimmed: see tools/optimize-assets.mjs
};
const NPC_HEIGHT = 1.1; // the player is ~1.8 tall; a zone can override it with `npcHeight`
const NPC_RADIUS = 0.8;  // collision circle at NPC_HEIGHT, scaled with the height

/* NPCs that ship without an animation clip (they'd stand in their bind
   pose, often a T-pose) get a procedural walk instead. Bone names are from
   the GLB; `side` is +1 for the character's left (+X), -1 for its right.
   `armDrop` (radians) lowers the arms from their bind pose to hang at the
   sides, and `armUp` is the same turn that puts them overhead to throw. A model with no skeleton at all gets one built from `skin`. */
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const NPC_RIGS = {
  chungus: { // bind pose: T-pose
    arms: [['shoulder_L_twist2_sc_068', 1], ['shoulder_R_twist2_sc_045', -1]],
    legs: [['foot_L_sc_094', 1], ['foot_R_sc_092', -1]],
    hips: 'pelvis_sc_03',
    armDrop: 1.25,
    armUp: -1.35, // the same turn, the other way: arms overhead, to throw something
  },
  perri: { // bind pose: A-pose, arms ~55° below horizontal
    arms: [['upperarm_l_032', 1], ['upperarm_r_067', -1]],
    legs: [['thigh_l_0140', 1], ['thigh_r_0150', -1]],
    knees: [['calf_l_0141', 1], ['calf_r_0151', -1]],
    hips: 'spine_01_04', // above the pelvis, so the waddle doesn't tilt the legs
    armDrop: 0.45,
    armUp: -2.3,
  },
  doge: { // one static mesh: arms already angled down, so just a little drop
    skin: {
      mesh: 'Body_Mat_0',
      carry: 'hips', // the separate eye and nose meshes ride on this bone
      // [name, parent, x, y, z] in the mesh's own space (Y up, facing +Z, 2.1 tall)
      bones: [
        ['root', null, 0, 0, 0],
        ['hips', 'root', 0, 0.45, 0],
        ['arm_L', 'hips', 0.62, 1.35, 0],
        ['arm_R', 'hips', -0.62, 1.35, 0],
        ['leg_L', 'root', 0.22, 0.4, 0],
        ['leg_R', 'root', -0.22, 0.4, 0],
      ],
      // Arms hang clear of the waist below y≈1 and join the chest above it;
      // the stubby legs are everything under the crotch (the hands reach as
      // low as the hips, but well out to the side)
      weights: (x, y) => {
        const side = x > 0 ? 'L' : 'R';
        const leg = Math.abs(x) > 0.05 && Math.abs(x) < 0.42 ? 1 - smooth(0.32, 0.48, y) : 0;
        const arm = (1 - leg) * smooth(0.48, 0.64, Math.abs(x)) * (1 - smooth(1.55, 1.65, y));
        return { [`leg_${side}`]: leg, [`arm_${side}`]: arm, hips: 1 - leg - arm };
      },
    },
    arms: [['arm_L', 1], ['arm_R', -1]],
    legs: [['leg_L', 1], ['leg_R', -1]],
    hips: 'hips',
    armDrop: 0.15,
    armUp: -2.2,
  },
};

/* ------------------------------------------------------------------ */
/* CONFIG: tweak these numbers to change how the game feels            */
/* ------------------------------------------------------------------ */
/* ZONES: 4 areas in a 2x2 grid, with the gym's long hall pushed out  */
/* east, and the celebration south of the farm. Nothing here checks   */
/* which zone an obstacle or portal is in, so zones must not overlap. */
/* Portals chain them together in this order.                         */
const ZONE_RADIUS = 24;      // radius of each zone
const ZONE_SPACING = 60;     // distance between zone centers
const ZONES = [
  // Zone 1 is a city street: its own builder, a rectangular boundary, and hand-placed portals/pets
  { name: 'K-Town',   x: -ZONE_SPACING / 2, z: -ZONE_SPACING / 2, ground: 0x4a4a4f, portal: 0xff4fa3, ...KTOWN },
  // Zone 2 is an indoor gym, built the same way: a hall too long for its spot in the grid.
  // It's pushed 20 further east, as its long west end would otherwise reach back into K-Town
  { name: 'Gym',      x:  ZONE_SPACING * 1.5 + 20, z: -ZONE_SPACING / 2, ground: 0x2a2b2f, portal: 0xff7a1a, ...GYM },
  // Zone 3 is Hawaii, a beach diorama with real (uneven) terrain
  { name: 'Hawaii',   x: -ZONE_SPACING / 2, z:  ZONE_SPACING / 2, ground: 0x2a9fa6, portal: 0xffcc4d, ...BEACH },
  // Zone 4 is a farm in the fall, with its own golden sky
  { name: 'Farm',     x:  ZONE_SPACING / 2, z:  ZONE_SPACING / 2, ground: 0x9a9550, portal: 0xe0452b, ...FARM },
  // Zone 5 is the party at the end of the farm's corn maze, at dusk. It sits a row
  // further south, clear of the maze, which reaches out east of the farm
  { name: 'Celebration', x: ZONE_SPACING / 2, z: ZONE_SPACING * 1.5, ground: 0x3f6b3a, portal: 0xff5d8f, ...CELEBRATION },
];
const PORTAL_DIST_FROM_CENTER = ZONE_RADIUS - 4; // where portals stand inside each zone
const PORTAL_TRIGGER = 2.4;                      // walk this close to a portal to use it
const PORTAL_SINK = 0.55;                        // a portal out in the water floats this far down in it, so its ring rises out of the water
const SIGN_RANGE = 2.2;                          // stand this close to a sign to read it (E)
const SIGN_CLOSE = 3.0;                          // walk this far away and its message closes
const GREET_RANGE = 3.4;                         // characters hop and show a heart when you come this close...
const GREET_EVERY = 9;                           // ...about this often (s) each
const WIPE_CLOSE = 0.45;                         // seconds for the heart to close over the screen at a portal...
const WIPE_OPEN = 0.6;                           // ...and to open on the next zone

/* Zone shape: a disc of ZONE_RADIUS, or a rectangle when the zone has `bounds`. A
   rectangle's middle can be `bounds.x` along from the zone's center (the gym's is) */
function insideZone(zone, x, z, margin) {
  const dx = x - zone.x, dz = z - zone.z;
  if (zone.bounds) return Math.abs(dx - (zone.bounds.x ?? 0)) <= zone.bounds.halfX - margin && Math.abs(dz) <= zone.bounds.halfZ - margin;
  return Math.hypot(dx, dz) <= ZONE_RADIUS - margin;
}
function clampToZone(zone, pos, margin) {
  const dx = pos.x - zone.x, dz = pos.z - zone.z;
  if (zone.bounds) {
    const hx = zone.bounds.halfX - margin, hz = zone.bounds.halfZ - margin, mid = zone.bounds.x ?? 0;
    pos.x = zone.x + mid + Math.max(-hx, Math.min(hx, dx - mid));
    pos.z = zone.z + Math.max(-hz, Math.min(hz, dz));
    return;
  }
  const d = Math.hypot(dx, dz), maxDist = ZONE_RADIUS - margin;
  if (d > maxDist) {
    pos.x = zone.x + dx * (maxDist / d);
    pos.z = zone.z + dz * (maxDist / d);
  }
}

/* Terrain: most zones are flat at y = 0. A zone with `terrain` (the beach,
   once it has loaded) has hills, plus no-go areas like the sea and rocks. */
function groundAt(zone, x, z) {
  return zone.terrain ? zone.terrain.heightAt(x, z) : 0;
}
function canWalk(zone, x, z) {
  return !zone.terrain || zone.terrain.walkable(x, z);
}
// Water (the beach's lagoon): the height of its surface at (x, z), or null where it's dry
function waterAt(zone, x, z) {
  return zone.terrain?.waterAt?.(x, z) ?? null;
}
// Where the player can go: wherever the characters can walk, and the water you can swim in
function canGo(zone, x, z) {
  return canWalk(zone, x, z) || !!zone.terrain?.swimmable?.(x, z);
}
// What you'd come down on from height y. A zone with a `course` (the gym) has things
// to stand on at different heights over the same spot of floor. In water too deep to
// stand in you float, with SWIM_FLOAT of you under, and a zone's `deckAt` (the beach's
// raft) can put something to stand on over it. Pass `water` if you've just looked it up
function standHeight(zone, x, y, z, water = waterAt(zone, x, z)) {
  if (zone.course) return zone.course.surfaceBelow(x - zone.x, y, z - zone.z);
  const floor = water === null ? groundAt(zone, x, z) : Math.max(zone.terrain.bedAt(x, z), water - SWIM_FLOAT);
  return Math.max(floor, zone.deckAt?.(x - zone.x, y, z - zone.z) ?? -Infinity);
}
// The solid ground at (x, z), under any water: what you'd have to climb up onto
function solidAt(zone, x, z) {
  return waterAt(zone, x, z) === null ? groundAt(zone, x, z) : zone.terrain.bedAt(x, z);
}

const PLAYER_SPEED = 6;      // units per second
const PLAYER_ACCEL = 14;     // how quickly you get up to speed (higher = snappier)
const PLAYER_BRAKE = 11;     // how quickly you come to a stop (higher = snappier)
const PLAYER_RADIUS = 0.5;   // used for collision
const PLAYER_HEIGHT = 1.8;   // for what you can pass underneath
const STEP_UP = 0.3;         // you get lifted onto a ledge your feet are this close below
const PLAYER_SLIP = 2;       // how fast you slip sideways off something you walk into dead-on (units/s)
const TURN_SPEED = 12;       // how quickly the character turns to face movement
const GRAVITY = 22;          // units/s² pulling the player back down
const JUMP_VELOCITY = 7.5;   // launch speed → ~1.3 units high, ~0.7s in the air
const JUMP_BUFFER = 0.14;    // a jump pressed this long (s) before landing still counts
const COYOTE_TIME = 0.1;     // ...and one pressed this long (s) after walking off an edge
const REACH_HEIGHT = 3;      // how far above or below you a portal or sign can be and still count
const HIT_SAFE = 1.5;        // after a hit, nothing else can hit you for this long (s)
const HIT_HOP = 4;           // a hit knocks you up this fast...
const KNOCK_FADE = 4;        // ...and sideways, fading this quickly
const SWIM_SPEED = 3.8;      // swimming speed (units per second): about two thirds of walking...
const SWIM_ACCEL = 4;        // ...which you get up to slowly...
const SWIM_BRAKE = 2.2;      // ...and glide on from after you stop paddling
const SWIM_TURN = 6;         // turning in the water is lazier than on land
const SWIM_FLOAT = 0.95;     // how far under the surface your feet are while you swim: the head and shoulders stay out
const FLOAT_EASE = 8;        // how quickly you rise and fall with the water's surface
const CLIMB_HOP = 0.35;      // climbing out of the water onto a bank or the raft, you hop this much higher than you need to
const WAKE_EVERY = 0.4;      // a ripple spreads out from you this often (s) while you swim along...
const BOB_EVERY = 1.3;       // ...or this often while you tread water
const CAM_DISTANCE = 8.2;    // how far behind the player the camera sits
const CAM_HEIGHT = 3.9;      // how high the camera sits
const CAM_LOOK_HEIGHT = 1.55; // how high on the player the camera looks
const CAM_FOV = 54;          // the camera's vertical field of view (degrees)
const CAM_SMOOTHING = 0.001; // lower = snappier camera (0..1)
const CAM_FOLLOW = 0.9;      // how quickly the camera swings round behind you as you walk (radians/s)
const CAM_FOLLOW_PAUSE = 1.2; // ...starting this long (s) after you last turned it with the mouse yourself
const LOOK_SPEED = 0.005;    // how far the camera turns (radians) for each pixel the mouse moves
const CAM_RIDE = 4;          // on a course, how quickly the camera rises and falls to the height you're standing at
const CAM_TURN = 3;          // ...and how quickly it turns along the course
const FINALE_VIEW = { distance: 5.6, height: 2.2 }; // the camera slowly circles you during the party's finale, inside the ring of guests...
const FINALE_LOOK_HEIGHT = 2.5;  // ...looking up a little, to get the fireworks in
const FINALE_RING = 5.4;         // how far off the guests gather
const FINALE_ORBIT = 0.13;       // radians/s

/* ------------------------------------------------------------------ */
/* SCENE, CAMERA, RENDERER                                             */
/* ------------------------------------------------------------------ */
const SKY = 0x9fd8ff; // a zone with its own `sky` (the farm) swaps this out while you're there
const FOG = [30, 90]; // where the fog starts and fully covers things; a zone's `fog` swaps this out
const SUN_OFFSET = [20, 30, 10]; // where the sun sits, from the zone's center; a zone's `sunOffset` swaps this out
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, ...FOG);

/* Each zone keeps its own container group. Only the active zone is
   rendered, so off-screen zones cost nothing. */
for (const zone of ZONES) {
  zone.group = new THREE.Group();
  scene.add(zone.group);
}
function setActiveZone(zone) {
  for (const z of ZONES) z.group.visible = (z === zone);
  scene.background.set(zone.sky ?? SKY);
  scene.fog.color.set(zone.sky ?? SKY);
  [scene.fog.near, scene.fog.far] = zone.fog ?? FOG;
  const light = zone.light ?? DAYLIGHT;
  hemi.color.set(light.sky);
  hemi.groundColor.set(light.ground);
  hemi.intensity = light.hemi;
  sun.color.set(light.sun);
  sun.intensity = light.sunIntensity;
  look.setZone(zone);
  snapSunTo(zone);
}

// The near plane sits well out, so a lamp post right up against the camera
// gets clipped instead of filling the screen
const camera = new THREE.PerspectiveCamera(CAM_FOV, innerWidth / innerHeight, 1.1, 260);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.debug.checkShaderErrors = import.meta.env.DEV; // shaders compile faster without the check
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

/* Lights. A zone with its own `light` (the celebration's dusk) swaps these
   colors and strengths in while you're there. */
const DAYLIGHT = { sky: 0xffffff, ground: 0x88aa77, hemi: 1.1, sun: 0xfff2cc, sunIntensity: 1.6 };
const hemi = new THREE.HemisphereLight(DAYLIGHT.sky, DAYLIGHT.ground, DAYLIGHT.hemi);
scene.add(hemi);
const sun = new THREE.DirectionalLight(DAYLIGHT.sun, DAYLIGHT.sunIntensity);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun);
const look = makeLook(renderer, scene, camera, sun); // the rest of the sun's shadow setup is in there

/* Keep the sun (and its shadow camera) over whichever zone you're in,
   so only the current zone wastes shadow quality */
function snapSunTo(zone) {
  const [x, y, z] = zone.sunOffset ?? SUN_OFFSET;
  sun.position.set(zone.x + x, y, zone.z + z);
  sun.target.position.set(zone.x, 0, zone.z);
  sun.target.updateMatrixWorld();
}
scene.add(sun.target);
snapSunTo(ZONES[0]);

/* ------------------------------------------------------------------ */
/* GROUND: one disc per zone                                           */
/* ------------------------------------------------------------------ */
for (const zone of ZONES) {
  if (zone.build) continue; // custom zones lay their own ground
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(ZONE_RADIUS, 64),
    new THREE.MeshStandardMaterial({ color: zone.ground })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(zone.x, 0, zone.z);
  disc.receiveShadow = true;
  zone.group.add(disc);
}

/* ------------------------------------------------------------------ */
/* OBSTACLES: anything the player can't walk through                   */
/* Each obstacle is a circle on the ground: { x, z, r }                */
/* ------------------------------------------------------------------ */
const obstacles = [];

function addObstacle(object3d, x, z, radius, parent = scene) {
  object3d.position.set(x, 0, z);
  parent.add(object3d);
  const obs = { x, z, r: radius };
  obstacles.push(obs);
  return obs;
}

function makeTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  );
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f8f4e })
  );
  leaves.position.y = 3;
  leaves.castShadow = true;
  tree.add(trunk, leaves);
  return tree;
}

// Custom zones (K-Town, Gym, Hawaii, Farm) build their own scenery and obstacles.
// The beach returns a promise: once its terrain is baked, stand its portals and sign on the sand.
// A portal out in the water floats instead, bobbing on it (see updatePortalLooks)
for (const zone of ZONES) {
  zone.build?.(zone, addObstacle)?.then(() => {
    for (const p of portals) {
      if (p.from !== zone) continue;
      p.afloat = waterAt(zone, p.x, p.z) !== null;
      p.group.position.y = p.afloat ? waterAt(zone, p.x, p.z) - PORTAL_SINK : groundAt(zone, p.x, p.z);
    }
    for (const s of signs) if (s.zone === zone) s.group.position.y = groundAt(zone, s.x, s.z);
  });
}

// Scatter some placeholder trees per zone (replace with real assets later).
// Kept inside the inner circle so they never sit on top of a portal.
for (const zone of ZONES) {
  if (zone.build) continue;
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * (ZONE_RADIUS - 16);
    addObstacle(makeTree(), zone.x + Math.cos(angle) * dist, zone.z + Math.sin(angle) * dist, 1.0, zone.group);
  }
}

/* ------------------------------------------------------------------ */
/* CUBE PETS: cute animals scattered around the spawn point            */
/* ------------------------------------------------------------------ */
const petLoader = modelLoader();
const pets = [];        // loaded pets with their wander state
let petLoadCount = 0;   // staggers the idle timers so they don't all move at once

// Fixed spots in a loose ring around the spawn, in the home zone (first one):
// hand-picked angles/distances so they read as intentional, not random.
const homeZone = ZONES[0];
const petSpots = [
  { pet: 'cat',      x: -6,  z: -5   },
  { pet: 'dog',      x: 7,   z: -4   },
  { pet: 'bunny',    x: -9,  z: 3    },
  { pet: 'pig',      x: 5,   z: 8    },
  { pet: 'cow',      x: -14, z: -9   },
  { pet: 'panda',    x: 13,  z: 6    },
  { pet: 'penguin',  x: -4,  z: 13   },
  { pet: 'fox',      x: 9,   z: 12   },
  { pet: 'monkey',   x: -17, z: 8    },
  { pet: 'chick',    x: 16,  z: -10  },
  { pet: 'elephant', x: 20,  z: 3    },
  { pet: 'parrot',   x: -10, z: 18   },
];

function addPet(url, x, z, name, zone = homeZone) {
  petLoader.load(url, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // Initial facing: out from the zone center
    model.rotation.y = Math.atan2(z - zone.z, x - zone.x);
    // Slight random scale variation so they don't all look identical
    const baseScale = 0.85 + Math.random() * 0.3;
    model.scale.setScalar(baseScale);
    addObstacle(model, x, z, 1.2, zone.group);
    const height = new THREE.Box3().setFromObject(model).max.y;
    fadeNearCamera(zone, model, 2.2, 2.9, model);

    // Per-pet personality: speed, how far they roam, how fast they turn
    pets.push({
      model,
      name,
      zone,
      baseScale,
      height,
      greetIn: 0,
      obs: obstacles[obstacles.length - 1], // the collision circle that follows it
      home: { x, z },
      state: 'idle',
      stateTimer: (petLoadCount++) * 0.15 + Math.random() * 2, // stagger the starts
      target: { x, z },
      speed: 0.8 + Math.random() * 0.9,   // 0.8–1.7 units/sec — lazy strolls
      wanderRadius: 6 + Math.random() * 5,
      turnSpeed: 5 + Math.random() * 3,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }, undefined, (err) => console.warn(`Pet ${name} failed to load:`, url, err));
}

/* Cute characters (Sketchfab, CC-BY): each model comes at its own scale and
   offset, so they're normalized to NPC_HEIGHT with feet on y = 0, then wrapped
   in a group the wander code can move and turn like a pet. Some of these
   files are tens of MB, so each is downloaded once and cloned per copy. */
const npcGltfs = new Map(); // url -> Promise<gltf>
function loadNpcGltf(url) {
  if (!npcGltfs.has(url)) npcGltfs.set(url, petLoader.loadAsync(url));
  return npcGltfs.get(url);
}
/* Procedural walk for an NPC_RIGS entry: arms down at the sides, then arms
   and legs swing in opposition with a little hip waddle while walking.
   Rotations are about the model's own axes (Y up, facing +Z) so they don't
   depend on how each bone's local axes happen to point. Call it once the
   body is posed but before it's scaled or placed. */
/* Give a static mesh a skeleton (an NPC_RIGS `skin` spec): bones at fixed
   spots, and each vertex weighted to them by where it sits. Swaps the Mesh
   for a SkinnedMesh in place. Clones share the geometry, so the weights are
   only worked out once. */
function skinStaticMesh(body, spec) {
  const mesh = body.getObjectByName(spec.mesh);
  const bones = new Map(), at = new Map();
  for (const [name, parent, x, y, z] of spec.bones) {
    const bone = new THREE.Bone();
    bone.name = name;
    at.set(name, new THREE.Vector3(x, y, z));
    bone.position.copy(at.get(name));
    if (parent) { bone.position.sub(at.get(parent)); bones.get(parent).add(bone); }
    bones.set(name, bone);
  }
  const names = [...bones.keys()];

  const geo = mesh.geometry;
  if (!geo.attributes.skinIndex) {
    const pos = geo.attributes.position, n = pos.count;
    const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const w = Object.entries(spec.weights(pos.getX(i), pos.getY(i), pos.getZ(i)))
        .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = w.reduce((sum, [, v]) => sum + v, 0) || 1;
      w.forEach(([name, v], k) => { index[i * 4 + k] = names.indexOf(name); weight[i * 4 + k] = v / total; });
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  }

  const skinned = new THREE.SkinnedMesh(geo, mesh.material);
  skinned.name = mesh.name;
  skinned.position.copy(mesh.position);
  skinned.quaternion.copy(mesh.quaternion);
  skinned.scale.copy(mesh.scale);
  mesh.parent.add(skinned);
  mesh.parent.remove(mesh);
  const others = [];
  body.traverse((o) => { if (o.isMesh && o !== skinned) others.push(o); });
  skinned.add(bones.get(spec.bones[0][0]));
  body.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton([...bones.values()]));
  if (spec.carry) for (const o of others) bones.get(spec.carry).attach(o);
}

const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
function makeWalkRig(body, rig) {
  const joint = (name) => {
    const bone = body.getObjectByName(name);
    if (!bone) return null;
    const R = bone.getWorldQuaternion(new THREE.Quaternion());
    return { bone, rest: bone.quaternion.clone(), R, Rinv: R.clone().invert() };
  };
  // Turn a joint by `q`, given in model space, on top of its rest pose
  const pose = (j, q) => {
    if (!j) return;
    j.bone.quaternion.copy(j.rest).multiply(_q.copy(j.Rinv).multiply(q).multiply(j.R));
  };
  const arms = rig.arms.map(([n, side]) => ({ j: joint(n), side }));
  const legs = rig.legs.map(([n, side]) => ({ j: joint(n), side }));
  const knees = (rig.knees ?? []).map(([n, side]) => ({ j: joint(n), side }));
  const hips = joint(rig.hips);
  let blend = 0; // 0 = standing, 1 = full stride

  return (dt, walking, phase, t, raise = 0) => {
    blend += ((walking ? 1 : 0) - blend) * Math.min(1, dt * 8);
    const s = Math.sin(phase) * blend;
    const breathe = Math.sin(t * 2) * 0.03 * (1 - blend);
    // A positive turn about X swings a hanging limb backward
    for (const { j, side } of legs) pose(j, _qa.setFromAxisAngle(AXIS_X, side * s * 0.45));
    for (const { j, side } of knees) pose(j, _qa.setFromAxisAngle(AXIS_X, Math.max(0, side * s) * 0.9)); // bend on the back swing
    for (const { j, side } of arms) {
      const lift = rig.armDrop + breathe + ((rig.armUp ?? 0) - rig.armDrop) * raise;
      _qb.setFromAxisAngle(AXIS_Z, -side * lift);                     // drop the arm to the side, or raise it
      _qa.setFromAxisAngle(AXIS_X, -side * s * 0.5).multiply(_qb);   // swing opposite its leg
      pose(j, _qa);
    }
    _qa.setFromAxisAngle(AXIS_Z, Math.sin(phase) * 0.07 * blend);    // waddle side to side
    _qb.setFromAxisAngle(AXIS_Y, s * 0.12);                          // shoulders twist with the stride
    pose(hips, _qa.multiply(_qb));
  };
}

function addNpc(url, x, z, name, zone, patrol = null, part = null, perch = null) {
  loadNpcGltf(url).then((gltf) => {
    const body = SkeletonUtils.clone(gltf.scene);
    // Files with several characters in one scene (the mascot's two octopuses):
    // keep only the `part`-th mesh by pruning everything off its path to the root
    if (part !== null) {
      const meshes = [];
      body.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (let o = meshes[part]; o !== body; o = o.parent) {
        for (const sib of [...o.parent.children]) if (sib !== o) o.parent.remove(sib);
      }
    }
    const rigSpec = gltf.animations.length ? null : NPC_RIGS[name];
    if (rigSpec?.skin) skinStaticMesh(body, rigSpec.skin);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // Skinned bounds come from bone matrices, which stay zeroed until the first
    // render; pose the skeletons now or rigged parts (the avocado's limbs)
    // collapse to the origin and inflate the box.
    body.updateMatrixWorld(true);
    body.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
    const rig = rigSpec ? makeWalkRig(body, rigSpec) : null;
    const height = zone.npcHeight ?? NPC_HEIGHT;
    const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
    body.scale.multiplyScalar(height / size.y);
    const box = new THREE.Box3().setFromObject(body);
    const center = box.getCenter(new THREE.Vector3());
    body.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

    const model = new THREE.Group();
    model.add(body);
    model.rotation.y = Math.atan2(z - zone.z, x - zone.x);
    const obs = addObstacle(model, x, z, NPC_RADIUS * height / NPC_HEIGHT, zone.group);
    if (perch) { // up on a rim: stay put, and throw things
      model.position.y = perch.y;
      obs.base = perch.y;
      obs.top = perch.y + height;
    }
    fadeNearCamera(zone, model, 2.2 + height * 0.4, 2.9 + height * 0.4, model);

    // Play the model's built-in animation if it has one
    let mixer = null;
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(body);
      mixer.clipAction(gltf.animations[0]).play();
    }

    pets.push({
      model,
      name,
      zone,
      mixer,
      rig,
      baseScale: 1,
      height,
      greetIn: 0,
      obs,
      home: { x, z },
      state: 'idle',
      stateTimer: (petLoadCount++) * 0.15 + Math.random() * 2,
      target: { x, z },
      speed: 1.0 + Math.random() * 0.8,
      wanderRadius: 8 + Math.random() * 6, // NPCs cover more of the block than pets
      patrol,              // if set, walk home <-> patrol in a loop instead of wandering
      patrolOut: true,     // heading to `patrol` (true) or back home (false)
      turnSpeed: 5 + Math.random() * 3,
      bobPhase: Math.random() * Math.PI * 2,
      ...(perch && { state: 'perched', perchY: perch.y, thrower: perch.throws, holding: null, raise: 0, tossed: 0 }),
    });
  }, (err) => console.warn(`NPC ${name} failed to load:`, url, err));
}

// Every zone gets the same ring of animals around its center; a small
// per-zone offset keeps the layout from looking copy-pasted.
// Zones with their own `npcSpots` (K-Town, the gym, the beach) and/or `petSpots`
// (the farm; the celebration has both) place them as-is.
for (const zone of ZONES) {
  for (const s of zone.npcSpots ?? []) {
    const patrol = s.patrolTo && { x: zone.x + s.patrolTo.x, z: zone.z + s.patrolTo.z };
    addNpc(NPC_GLB[s.npc], zone.x + s.x, zone.z + s.z, s.npc, zone, patrol, s.part ?? null, s.throws ? s : null);
  }
  for (const s of zone.petSpots ?? []) addPet(PET_GLB[s.pet], zone.x + s.x, zone.z + s.z, s.pet, zone);
  if (zone.npcSpots || zone.petSpots) continue;
  const offset = Math.random() * Math.PI * 2; // rotate the ring differently per zone
  for (const s of petSpots) {
    const x = zone.x + s.x * Math.cos(offset) - s.z * Math.sin(offset);
    const z = zone.z + s.x * Math.sin(offset) + s.z * Math.cos(offset);
    addPet(PET_GLB[s.pet], x, z, s.pet, zone);
  }
}

/* Pets wander: idle → pick a spot near home → stroll → idle...        */
function pickPetTarget(p) {
  // Patrollers just head for whichever end of their route is next
  if (p.patrol) return p.patrolOut ? p.patrol : p.home;
  // A random spot near home, on the island, and not on top of a tree or another pet
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 1.5 + Math.random() * p.wanderRadius;
    const x = p.home.x + Math.cos(a) * d;
    const z = p.home.z + Math.sin(a) * d;
    if (!insideZone(p.zone, x, z, 3) || !canWalk(p.zone, x, z)) continue;
    if (obstacles.some((o) => o !== p.obs && !o.base && Math.hypot(o.x - x, o.z - z) < o.r + 1.5)) continue;
    return { x, z };
  }
  return { x: p.home.x, z: p.home.z };
}

// Squash (negative) or stretch (positive) a character about its feet
function stretch(m, base, s) {
  m.scale.set(base * (1 - s * 0.5), base * (1 + s), base * (1 - s * 0.5));
}

// A heart pops up over a character, unless it would be right in the camera's face
function popHeart(p) {
  const m = p.model;
  if (Math.hypot(camera.position.x - m.position.x, camera.position.z - m.position.z) > 4.5) {
    effects.heart(m.position.x, m.position.y + p.height + 0.3, m.position.z, 0.42);
  }
}

// Turn a character toward the player, `rate` radians-ish per second
function facePlayer(m, rate, dt) {
  const diff = Math.atan2(player.position.x - m.position.x, player.position.z - m.position.z) - m.rotation.y;
  m.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, rate * dt);
}

function updatePets(dt) {
  for (const p of pets) {
    const m = p.model;
    if (p.mixer && p.zone === currentZone) p.mixer.update(dt);
    if (p.rig && p.zone === currentZone) p.rig(dt, p.state === 'walking', p.bobPhase, timer.getElapsed(), p.raise ?? 0);
    const playerDist = Math.hypot(player.position.x - m.position.x, player.position.z - m.position.z);

    // Oh, hello! Come close and a character stops to hop and show a heart
    p.greetIn -= dt;
    const inReach = Math.abs(player.position.y - m.position.y) < REACH_HEIGHT;
    if (p.zone === currentZone && p.greetIn <= 0 && playerDist < GREET_RANGE && inReach && !p.thrower && !p.gathering && p.state !== 'greet') {
      p.state = 'greet';
      p.stateTimer = 0.8;
      p.greetIn = GREET_EVERY * (0.7 + Math.random() * 0.6);
      p.hop = 0;
      popHeart(p);
      sfx('greet', 1.25 / (0.7 + p.height * 0.3));
    }

    if (p.state === 'perched') {
      // Watching you from up on the rim, reaching up with something to throw, and a hop as it goes
      facePlayer(m, 5, dt);
      p.tossed = Math.max(0, p.tossed - dt * 3);
      m.position.y = p.perchY + Math.sin(p.tossed * Math.PI) * 0.35;
      stretch(m, p.baseScale, p.raise * 0.08 + Math.sin(p.tossed * Math.PI) * 0.1);
    } else if (p.state === 'idle') {
      p.stateTimer -= dt;
      m.position.y = groundAt(p.zone, m.position.x, m.position.z); // settle down if we were mid-hop
      m.rotation.z *= 1 - Math.min(1, dt * 10);
      stretch(m, p.baseScale, 0);
      // Occasionally glance toward the player — feels alive
      if (playerDist < 10) facePlayer(m, 1.5, dt);
      if (p.stateTimer <= 0) {
        p.state = 'walking';
        p.target = pickPetTarget(p);
      }
    } else if (p.state === 'greet' || p.state === 'cheer') {
      // Hopping on the spot: `greet` for a moment, `cheer` until the party's finale is over
      facePlayer(m, 6, dt);
      p.hop += dt * (p.state === 'cheer' ? 6.5 : 8);
      const up = Math.abs(Math.sin(p.hop));
      m.position.y = (p.perchY ?? groundAt(p.zone, m.position.x, m.position.z)) + up * (0.14 + p.height * 0.13);
      m.rotation.z *= 1 - Math.min(1, dt * 10);
      stretch(m, p.baseScale, up * 0.2 - 0.1);
      if (p.state === 'cheer') {
        if (Math.random() < dt * 0.3) popHeart(p);
      } else if ((p.stateTimer -= dt) <= 0) {
        p.state = 'idle';
        p.stateTimer = 0.5 + Math.random() * 2;
      }
    } else {
      const dx = p.target.x - m.position.x;
      const dz = p.target.z - m.position.z;
      const d = Math.hypot(dx, dz);

      if (d < 0.3 && p.gathering) {
        p.state = 'cheer';
        p.hop = Math.random() * 3;
      } else if (d < 0.3) {
        p.state = 'idle';
        p.stateTimer = 1.5 + Math.random() * 4; // 1.5–5.5 s of standing around
        if (p.patrol) {
          p.patrolOut = !p.patrolOut;           // turn around at the end of the route
          p.stateTimer = 0.5 + Math.random();   // after a short pause
        }
      } else {
        // Blocked (sea, rocks, props on the beach)? Stop and rethink.
        const step = p.speed * (p.gathering ? 2.6 : 1) * dt;
        let nx = m.position.x + (dx / d) * step;
        let nz = m.position.z + (dz / d) * step;
        // Slide around solid props (cabs, lamps, trees) and other wanderers like
        // the player does; only the walker moves, so nobody gets shoved around
        for (const o of obstacles) {
          if (o === p.obs || o.base) continue;
          const ox = nx - o.x, oz = nz - o.z;
          const minDist = o.r + p.obs.r;
          const od = Math.hypot(ox, oz);
          if (od < minDist && od > 0.0001) {
            nx = o.x + (ox / od) * minDist;
            nz = o.z + (oz / od) * minDist;
          }
        }
        // Wedged against a prop (barely moving)? Stop and rethink.
        const moved = Math.hypot(nx - m.position.x, nz - m.position.z);
        if (!canWalk(p.zone, nx, nz) || moved < step * 0.3) {
          p.state = p.gathering ? 'cheer' : 'idle'; // close enough, at a party
          p.hop = Math.random() * 3;
          p.stateTimer = 0.5 + Math.random() * 2;
          continue;
        }
        const fx = (nx - m.position.x) / moved; // face the way we actually went
        const fz = (nz - m.position.z) / moved;
        m.position.x = nx;
        m.position.z = nz;

        // Smoothly turn to face the direction of travel
        const targetAngle = Math.atan2(fx, fz);
        let diff = targetAngle - m.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        m.rotation.y += diff * Math.min(1, p.turnSpeed * dt);

        // A bouncy little waddle while walking
        p.bobPhase += dt * (6 + p.speed * 4);
        const up = Math.abs(Math.sin(p.bobPhase));
        m.position.y = groundAt(p.zone, m.position.x, m.position.z) + up * 0.09;
        m.rotation.z = Math.sin(p.bobPhase) * 0.05;
        stretch(m, p.baseScale, up * 0.09 - 0.04);

        // Don't wander off the island (or onto the K-Town storefronts)
        clampToZone(p.zone, m.position, 2);
      }
    }

    // Keep the pet's collision circle glued to its body
    p.obs.x = m.position.x;
    p.obs.z = m.position.z;
  }
}

/* ------------------------------------------------------------------ */
/* PLAYER: a cute girl with long black hair (see character.js)         */
/* The character should face +Z when its rotation.y is 0.              */
/* ------------------------------------------------------------------ */
const player = new THREE.Group();
const hero = makeCharacter();
player.add(hero.root);
scene.add(player);
// Start at the home zone's `spawn`, looking at its `face`, with the camera right behind
const spawn = homeZone.spawn ?? { x: 0, z: 0, face: { x: 0, z: -1 } };
const spawnYaw = Math.atan2(spawn.face.x - spawn.x, spawn.face.z - spawn.z);
player.position.set(homeZone.x + spawn.x, 0, homeZone.z + spawn.z);
player.rotation.y = spawnYaw;
setActiveZone(homeZone); // render only the home zone at first
const effects = makeFx(scene);

/* ------------------------------------------------------------------ */
/* PORTALS: each zone links to the zones before and after it.          */
/* Each portal stands at the edge of its own zone, on the side that    */
/* faces the zone it leads to, so navigation reads intuitively.        */
/* ------------------------------------------------------------------ */
let currentZone = homeZone;
let teleportCooldown = 0; // short lockout so you don't bounce straight back
const portals = [];

// `face` is the world point the portal looks toward; you step out that way.
function addPortal(x, z, fromZone, toZone, face, y = groundAt(fromZone, x, z)) {
  const { group, update } = makePortal(toZone);
  group.position.set(x, y, z);
  group.rotation.y = Math.atan2(face.x - x, face.z - z);
  fromZone.group.add(group);
  portals.push({ x, z, from: fromZone, to: toZone, face, group, update, fade: 1 });
}

// A portal melts away while the camera's right behind it (as it is when you
// arrive through one), so it doesn't block your first view of the zone
function updatePortalLooks(dt) {
  for (const p of portals) {
    if (p.from !== currentZone) continue;
    const toCamX = camera.position.x - p.x, toCamZ = camera.position.z - p.z;
    const faceX = p.face.x - p.x, faceZ = p.face.z - p.z;
    const behind = (toCamX * faceX + toCamZ * faceZ) / (Math.hypot(faceX, faceZ) || 1) < 1.5 && Math.hypot(toCamX, toCamZ) < 14;
    p.fade += ((behind ? 0 : 1) - p.fade) * Math.min(1, dt * 6);
    if (p.afloat) p.group.position.y = waterAt(currentZone, p.x, p.z) - PORTAL_SINK;
    p.update(timer.getElapsed(), p.fade);
  }
}

// Zones form a chain in ZONES order: each one links forward to the next
// and back to the previous (the first and last have just one portal).
for (const [i, from] of ZONES.entries()) {
  for (const to of [ZONES[i - 1], ZONES[i + 1]]) {
    if (!to) continue;
    const spot = from.portalSpots?.[to.name];
    if (spot) { // hand-placed (custom zones); faces the zone center unless told otherwise
      const face = spot.face ?? { x: 0, z: 0 };
      addPortal(from.x + spot.x, from.z + spot.z, from, to, { x: from.x + face.x, z: from.z + face.z }, spot.y);
      continue;
    }
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    addPortal(
      from.x + (dx / len) * PORTAL_DIST_FROM_CENTER,
      from.z + (dz / len) * PORTAL_DIST_FROM_CENTER,
      from, to, from // face the zone it stands in
    );
  }
}

// DEBUG (remove later): a row of portals to every other zone on K-Town's north sidewalk,
// on your left as you spawn. Set to false, or delete this block, to take them out.
const DEBUG_PORTALS = false;
if (DEBUG_PORTALS) {
  const home = ZONES[0];
  ZONES.slice(1).forEach((to, i) => {
    const x = home.x - 21 + i * 4.2, z = home.z - 6.2;
    addPortal(x, z, home, to, { x, z: home.z }); // facing the street
  });
}

function teleportTo(toZone) {
  // Arrive just in front of the destination's portal back to where we came from,
  // far enough past it (3 units) that we're outside its 2-unit trigger.
  const back = portals.find((p) => p.from === toZone && p.to === currentZone)
    ?? portals.find((p) => p.from === toZone); // not a neighbor (the ?zone= shortcut)
  const dx = back.face.x - back.x, dz = back.face.z - back.z;
  const len = Math.hypot(dx, dz) || 1;
  const x = back.x + (dx / len) * 3, z = back.z + (dz / len) * 3;
  // Standing where the portal stands, which might be up on a course, or afloat if it's out in the water
  player.position.set(x, toZone.course ? back.group.position.y : standHeight(toZone, x, Infinity, z), z);
  landingShadow.visible = false;
  knock.set(0, 0, 0);
  hurt = 0;
  hero.root.visible = true;
  dryOff();
  currentZone = toZone;
  teleportCooldown = 0.8;
  vy = 0; // land flat in the new zone
  setActiveZone(toZone);
  setZoneSound(toZone.sound); // crossfade to the zone's ambience or music (none = quiet)
  // Keep up your speed, heading out from the portal
  const speed = vel.length();
  vel.set((dx / len) * speed, 0, (dz / len) * speed);
  // Face away from the portal with the camera right behind, and cut straight
  // there instead of letting the camera glide across the map (through walls)
  player.rotation.y = Math.atan2(dx, dz);
  camYaw = steerYaw = Math.atan2(-dx, -dz);
  camRide = standAt = player.position.y;
  standingOn = null;
  snapCamera();
  updatePortalLooks(1);
  ui.showZoneName(toZone.title ?? toZone.name);
}

// Walking into a portal closes a heart over the screen, teleports while it's
// covered, then opens it again on the new zone
let wipe = 0;           // 0 = clear, 1 = fully covered
let wipeColor = 0;      // the color it's in: the zone you're heading for
let pendingZone = null; // the zone we're closing in on
let respawning = false; // ...or it's closing on a fall, to take you back up the course

function updatePortals(dt) {
  if (pendingZone || respawning) {
    wipe = Math.min(1, wipe + dt / WIPE_CLOSE);
    if (wipe === 1) {
      if (pendingZone) teleportTo(pendingZone);
      else respawn();
      pendingZone = null;
      respawning = false;
    }
  } else if (wipe > 0) {
    wipe = Math.max(0, wipe - dt / WIPE_OPEN);
  }
  ui.setWipe(wipe, wipeColor);
  if (pendingZone || respawning) return;

  if (teleportCooldown > 0) { teleportCooldown -= dt; return; }
  for (const p of portals) {
    if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < PORTAL_TRIGGER
      && Math.abs(player.position.y - p.group.position.y) < REACH_HEIGHT) {
      pendingZone = p.to;
      wipeColor = p.to.portal;
      sfx('portal');
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* FADING WHAT GETS TOO CLOSE TO THE CAMERA                            */
/* Characters and tall props melt away as the camera reaches them,     */
/* instead of filling the screen. Each gets its own copy of its        */
/* materials, in hashed-alpha mode: it dithers away, with no sorting   */
/* trouble. Zones add their own props through `zone.camFade`, too.     */
/* ------------------------------------------------------------------ */
// It goes when the camera comes within `near`, and comes back past `far`. `at` is
// the object whose position counts: one that moves, or a fixed { x, z }
function fadeNearCamera(zone, object, near, far, at) {
  (zone.camFade ??= []).push({ object, near, far, at });
}

function prepareFade(item) {
  item.materials = [];
  item.opacity = 1;
  item.gone = false;
  item.object.traverse((o) => {
    if (!o.material) return;
    const copy = (m) => {
      const c = m.clone();
      c.alphaHash = true;
      item.materials.push(c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
  });
}

function updateCameraFades(dt) {
  for (const item of currentZone.camFade ?? []) {
    if (!item.materials) prepareFade(item);
    const place = item.at.position ?? item.at;
    const d = Math.hypot(camera.position.x - place.x, camera.position.z - place.z);
    if (d < item.near) item.gone = true;
    else if (d > item.far) item.gone = false;
    if (item.opacity === (item.gone ? 0 : 1)) continue;
    item.opacity += (item.gone ? -1 : 1) * dt * 7; // quickly, so nothing stays half-dithered
    item.opacity = Math.min(1, Math.max(0, item.opacity));
    for (const m of item.materials) m.opacity = item.opacity;
    item.object.visible = item.opacity > 0.02;
  }
}

/* ------------------------------------------------------------------ */
/* SIGNS: one per zone. Stand next to it and press E to read its       */
/* message (messages.js); walking away closes the window.              */
/* ------------------------------------------------------------------ */
const signs = [];
let openSign = null; // the sign whose message is showing
let promptShowing = false;

for (const zone of ZONES) {
  const spot = zone.signSpot;
  if (!spot) continue;
  const x = zone.x + spot.x, z = zone.z + spot.z;
  const face = spot.face ?? { x: 0, z: 0 }; // faces the zone center unless told otherwise
  const group = makeSign();
  const obs = addObstacle(group, x, z, 0.35, zone.group);
  group.position.y = spot.y ?? groundAt(zone, x, z);
  if (spot.y) { obs.base = spot.y; obs.top = spot.y + 2.4; } // up on a course: you walk underneath it
  group.rotation.y = Math.atan2(zone.x + face.x - x, zone.z + face.z - z);
  // A heart bobs over it, so you can spot it from across the zone, until you've read it
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false, fog: false }));
  marker.position.y = 2.4;
  marker.scale.setScalar(0.6);
  group.add(marker);
  signs.push({ x, z, zone, group, marker, read: false, message: MESSAGES[zone.name] });
}

const signDist = (s) => Math.abs(player.position.y - s.group.position.y) > REACH_HEIGHT
  ? Infinity : Math.hypot(player.position.x - s.x, player.position.z - s.z);
const nearbySign = () => signs.find((s) => s.zone === currentZone && signDist(s) < SIGN_RANGE);

function openMessage(sign) {
  openSign = sign;
  sign.read = true;
  ui.openLetter(sign.message.title, sign.message.body, !!sign.zone.finale);
  sfx('letterOpen');
  if (sign.zone.finale) startFinale(sign.zone);
}
function closeMessage() {
  if (finaleZone) stopFinale();
  openSign = null;
  ui.closeLetter();
  sfx('letterClose');
}

function updateSigns(dt) {
  // Walked away (or took a portal): close it
  if (openSign && (openSign.zone !== currentZone || signDist(openSign) > SIGN_CLOSE)) closeMessage();
  const prompting = !openSign && !!nearbySign();
  if (prompting !== promptShowing) {
    promptShowing = prompting;
    ui.showPrompt(prompting);
    if (prompting) sfx('ting');
  }
  for (const s of signs) {
    if (s.zone !== currentZone) continue;
    s.marker.position.y = 2.4 + Math.sin(timer.getElapsed() * 2.2) * 0.1;
    s.marker.material.opacity += ((s.read ? 0 : 1) - s.marker.material.opacity) * Math.min(1, dt * 4);
    s.marker.visible = s.marker.material.opacity > 0.01;
  }
}

/* ------------------------------------------------------------------ */
/* THE FINALE: reading the party's sign. Everyone gathers round you    */
/* and cheers, the camera slowly circles, and the zone's own `finale`  */
/* sets off everything it has (celebration.js). Closing the letter     */
/* lets everyone get back to the party.                                */
/* ------------------------------------------------------------------ */
let finaleZone = null;

function startFinale(zone) {
  finaleZone = zone;
  zone.finale.start();
  setFinaleSound(true);
  const guests = pets.filter((p) => p.zone === zone);
  guests.forEach((p, i) => {
    const a = (i / guests.length) * Math.PI * 2, r = FINALE_RING + (i % 3) * 1.2;
    p.gathering = true;
    p.state = 'walking';
    p.target = { x: player.position.x + Math.cos(a) * r, z: player.position.z + Math.sin(a) * r };
  });
}

function stopFinale() {
  finaleZone.finale.stop();
  setFinaleSound(false);
  for (const p of pets) {
    if (!p.gathering) continue;
    p.gathering = false;
    p.state = 'idle';
    p.stateTimer = 1 + Math.random() * 3;
  }
  finaleZone = null;
}

/* ------------------------------------------------------------------ */
/* INPUT                                                               */
/* ------------------------------------------------------------------ */
const keys = new Set();
const vel = new THREE.Vector3(); // ground velocity
let vy = 0;           // vertical velocity (jump state)
let jumpQueued = 0;   // seconds left on the last Space press
let coyote = 0;       // seconds left to jump after walking off an edge
let standAt = 0;      // the height you last stood at...
let camRide = 0;      // ...and the one the camera's riding at, on a course
let hurt = 0;         // seconds left of being safe after a hit
const knock = new THREE.Vector3(); // the shove from a hit, on top of how you're walking
const ride = new THREE.Vector3();  // the speed of the moving platform you're on, or last jumped off
let started = false;  // nothing moves until you're past the title screen
addEventListener('keydown', (e) => {
  if (!started) return;
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') jumpQueued = JUMP_BUFFER;
  if (e.code === 'KeyE') {
    const sign = nearbySign();
    if (openSign) closeMessage();
    else if (sign) openMessage(sign);
  }
  if (e.code === 'Escape' && openSign) closeMessage();
  if (e.code === 'KeyM') ui.setMuted(toggleMute());
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// The mouse turns the camera with no button held. The title screen's key press or click
// locks the pointer to the game (the browser hides it), Esc frees it, and a click on the
// game takes it back
let camYaw = spawnYaw + Math.PI; // camera rotation around the player
let steerYaw = camYaw;           // the way the keys walk you (see updatePlayer)
let lastLook = -Infinity;        // when you last turned the camera yourself
const canvas = renderer.domElement;
const mouseLooking = () => document.pointerLockElement === canvas;
// You've turned the camera just now, so it shouldn't turn by itself yet
const lookingAround = () => performance.now() - lastLook < CAM_FOLLOW_PAUSE * 1000;

// Only works during a key press or click
function lockPointer() {
  if (mouseLooking() || !canvas.requestPointerLock) return;
  // Chromium returns a promise, which rejects when the browser says no (as it does for a
  // moment after Esc). The hint stays up, and the next click tries again
  canvas.requestPointerLock()?.catch?.(() => {});
}
const updateLookHint = () => ui.showLookHint(started && !mouseLooking());
canvas.addEventListener('pointerdown', () => { if (started) lockPointer(); });
document.addEventListener('pointerlockchange', updateLookHint);
addEventListener('mousemove', (e) => {
  if (!started || !mouseLooking() || !e.movementX) return;
  // Chrome on Windows can now and then report a sudden huge jump while the pointer's
  // locked. No hand turns the camera that far between two frames, so leave those out
  if (Math.abs(e.movementX) > innerWidth / 4) return;
  // Your heading turns with the camera, by the same amount. Snapping it to the camera
  // instead would make you veer off whenever the mouse got nudged with the camera swung round
  const turn = e.movementX * LOOK_SPEED;
  camYaw -= turn;
  steerYaw -= turn;
  lastLook = performance.now();
});

/* ------------------------------------------------------------------ */
/* UPDATE LOOP                                                         */
/* ------------------------------------------------------------------ */
const timer = new THREE.Timer();
timer.connect(document);
const move = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
let lookHeight = CAM_LOOK_HEIGHT;
let heldForward = 0, heldRight = 0;

function updatePlayer(dt) {
  // 1. Read input
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
                  (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
                (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);

  // 2. Convert to camera-relative direction on the ground plane. What "forward" means is
  // fixed when the keys change, so you keep walking straight while the camera swings
  // round behind you. Turning the camera with the mouse turns it too (see the mousemove handler)
  if (forward !== heldForward || right !== heldRight) steerYaw = camYaw;
  heldForward = forward;
  heldRight = right;
  const fx = -Math.sin(steerYaw), fz = -Math.cos(steerYaw); // forward
  const rx = Math.cos(steerYaw),  rz = -Math.sin(steerYaw); // right
  move.set(fx * forward + rx * right, 0, fz * forward + rz * right);

  const moving = move.lengthSq() > 0;
  if (moving) move.normalize();

  // 3. Ease toward that speed, so you start and stop with a little weight. In the
  // water you're slower, and take longer to get going and to stop
  const topSpeed = wet ? SWIM_SPEED : PLAYER_SPEED;
  const ease = 1 - Math.exp(-(moving ? (wet ? SWIM_ACCEL : PLAYER_ACCEL) : (wet ? SWIM_BRAKE : PLAYER_BRAKE)) * dt);
  vel.x += (move.x * topSpeed - vel.x) * ease;
  vel.z += (move.z * topSpeed - vel.z) * ease;

  // 4. Move, sliding along no-go areas (the beach's rocks and props). Down in the
  // water, the bank is a wall too, until you've climbed up level with it
  const reachY = player.position.y + STEP_UP;
  const overWater = waterAt(currentZone, player.position.x, player.position.z) !== null;
  const open = (x, z) => canGo(currentZone, x, z) && !(overWater && solidAt(currentZone, x, z) > reachY);
  knock.multiplyScalar(Math.exp(-KNOCK_FADE * dt));
  const nx = player.position.x + (vel.x + knock.x + ride.x) * dt;
  const nz = player.position.z + (vel.z + knock.z + ride.z) * dt;
  if (open(nx, nz)) player.position.set(nx, player.position.y, nz);
  else if (open(nx, player.position.z)) { player.position.x = nx; vel.z = 0; }
  else if (open(player.position.x, nz)) { player.position.z = nz; vel.x = 0; }
  else vel.set(0, 0, 0);

  // 4a. Swimming into the bank, you climb out onto it with a hop
  if (floating && vy === 0 && moving) {
    const ax = player.position.x + move.x * 0.45, az = player.position.z + move.z * 0.45;
    const top = solidAt(currentZone, ax, az);
    if (top > reachY && top < player.position.y + 2.2 && canGo(currentZone, ax, az)) climbOut(top);
  }

  // 4b. Walking dead-on into the edge of a no-go area, none of that gets you anywhere,
  // so feel ahead to either side and slip along whichever way is open
  if (moving && !(wet && vy > 0) && !open(player.position.x + move.x * 0.3, player.position.z + move.z * 0.3)) {
    let side = 0; // +1 or -1, the nearer side with a way forward
    for (const reach of [0.4, 0.8, 1.2, 1.6, 2]) {
      for (const s of [1, -1]) {
        const ox = player.position.x - move.z * s * reach, oz = player.position.z + move.x * s * reach;
        if (!side && open(ox, oz) && open(ox + move.x * 0.3, oz + move.z * 0.3)) side = s;
      }
    }
    const sx = player.position.x - move.z * side * PLAYER_SLIP * dt, sz = player.position.z + move.x * side * PLAYER_SLIP * dt;
    if (side && open(sx, sz)) { player.position.x = sx; player.position.z = sz; }
  }

  // 4c. Smoothly turn to face the direction of travel, and let the camera
  // swing round behind you, unless you've just been steering it yourself
  let turn = 0;
  if (moving) {
    const targetAngle = Math.atan2(move.x, move.z);
    let diff = targetAngle - player.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way around
    player.rotation.y += diff * Math.min(1, (wet ? SWIM_TURN : TURN_SPEED) * dt);
    turn = Math.max(-1, Math.min(1, diff));
    if (!lookingAround() && !finaleZone && !currentZone.course) {
      // Strongest with you walking across the view, and nothing when walking away or straight toward it
      camYaw += Math.sin(Math.atan2(-move.x, -move.z) - camYaw) * CAM_FOLLOW * dt;
    }
  }

  // 4d. Jump: a Space press while grounded launches you, or one just before you land,
  // or just after walking off an edge. On sloped ground (the beach) you stick to the
  // surface while walking. On the way up you only land on what's already below you.
  // In deep water you float, and Space hops you up out of it
  const water = waterAt(currentZone, player.position.x, player.position.z);
  const ground = standHeight(currentZone, player.position.x, player.position.y + (vy > 0 ? 0 : STEP_UP), player.position.z, water);
  const floatsHere = water !== null && ground === water - SWIM_FLOAT;
  const onGround = vy === 0 && player.position.y <= ground + 0.5;
  const justLeft = coyote > 0 && vy <= 0;
  coyote = onGround ? COYOTE_TIME : Math.max(0, coyote - dt);
  jumpQueued = Math.max(0, jumpQueued - dt);
  if (jumpQueued > 0 && (onGround || justLeft)) {
    vy = JUMP_VELOCITY;
    jumpQueued = 0;
    coyote = 0;
    hero.jump();
    sfx('jump');
    if (floatsHere) splashAt(player.position.x, water, player.position.z, 0.9);
    else if (currentZone.dust) effects.puff(player.position.x, ground + 0.1, player.position.z, currentZone.dust, 0.5);
  }
  if (vy === 0 && onGround) {
    // Afloat, you rise and fall with the water, a little behind it
    player.position.y = floatsHere ? player.position.y + (ground - player.position.y) * Math.min(1, FLOAT_EASE * dt) : ground;
  } else {
    player.position.y += vy * dt;
    vy -= GRAVITY * dt;
    if (player.position.y <= ground) {
      const impact = -vy;
      player.position.y = ground;
      vy = 0;
      if (floatsHere) { // in you go: a splash, and you bob under and back up
        hero.land(impact * 0.4);
        dunkSpeed -= Math.min(3.5, impact * 0.3);
        splashAt(player.position.x, water, player.position.z, Math.max(0.7, impact / 5.5));
      } else {
        hero.land(impact);
        sfx('land');
        if (currentZone.dust) effects.ring(player.position.x, ground, player.position.z, currentZone.dust);
      }
    }
  }
  // (Afloat you can lag a little above the water as it falls away, and still be in it)
  const airborne = floatsHere ? vy !== 0 : player.position.y > ground;
  // Swimming. Hop up out of the water and you're still wet, and keep to swimming speed
  floating = floatsHere && !airborne;
  if (!airborne) wet = floatsHere;
  play.swimming = floating;
  if (currentZone.course) updateCourse(dt, airborne);

  // 5. Collision: push the player out of any obstacle circle (gives sliding),
  // unless that would shove them into a no-go area (then they just overlap a bit)
  const preX = player.position.x, preZ = player.position.z;
  for (const o of obstacles) {
    if (player.position.y >= (o.top ?? Infinity) || player.position.y + PLAYER_HEIGHT <= (o.base ?? -Infinity)) continue;
    const dx = player.position.x - o.x;
    const dz = player.position.z - o.z;
    const minDist = o.r + PLAYER_RADIUS;
    const d = Math.hypot(dx, dz);
    if (d < minDist && d > 0.0001) {
      const nx = dx / d, nz = dz / d;
      // Dead-on, the push comes straight back at you and you'd just stop, so slip
      // off to one side. A little off-center, the push slides you round it by itself
      const across = move.z * nx - move.x * nz;
      const deadOn = moving && move.x * nx + move.z * nz < 0 && Math.abs(across) < 0.15;
      const slip = deadOn ? PLAYER_SLIP * dt * (across < 0 ? -1 : 1) : 0;
      player.position.x = o.x + nx * minDist - nz * slip;
      player.position.z = o.z + nz * minDist + nx * slip;
    }
  }
  if (!canGo(currentZone, player.position.x, player.position.z)) {
    player.position.x = preX;
    player.position.z = preZ;
  }
  if (currentZone.course) {
    local.set(player.position.x - currentZone.x, player.position.y, player.position.z - currentZone.z);
    currentZone.course.pushOut(local, PLAYER_HEIGHT, STEP_UP);
    player.position.x = local.x + currentZone.x;
    player.position.z = local.z + currentZone.z;
  }

  // 6. Zone boundary: keep the player inside the current zone (portals are the only exit).
  // Out in a zone's annex (the farm's corn maze), its walkable() does that instead.
  if (!currentZone.terrain?.annex?.(player.position.x, player.position.z)) clampToZone(currentZone, player.position, 1);

  // 7. Walk cycle: swinging arms and legs, a little bob, swaying hair. Each
  // footfall makes a sound for what you're walking on, and kicks up a little dust.
  // Afloat, it's a doggy paddle instead, and each hand splashes as it dips in
  if (finaleZone && !moving) { // turn to the camera and cheer
    const diff = Math.atan2(camera.position.x - player.position.x, camera.position.z - player.position.z) - player.rotation.y;
    player.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, 4 * dt);
  }
  const beat = hero.animate(dt, timer.getElapsed(), Math.hypot(vel.x, vel.z) / topSpeed, airborne, turn, !!finaleZone, floating);
  if (beat && floating) {
    paddleSplash(water);
  } else if (beat) {
    const { x, z } = player.position;
    sfx('step', currentZone.surfaceAt?.(x - currentZone.x, z - currentZone.z) ?? currentZone.surface);
    if (currentZone.dust && Math.random() < 0.5) effects.puff(x, ground + 0.08, z, currentZone.dust, 0.32);
  }
  updateSwimming(dt, water);
}

/* ------------------------------------------------------------------ */
/* IN THE WATER: splashes and ripples, a ring of foam round you where  */
/* you meet the surface, bobbing under and back up when you drop in,   */
/* and climbing back out                                               */
/* ------------------------------------------------------------------ */
const foam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
  map: ringTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
}));
foam.renderOrder = 1;
foam.visible = false;
scene.add(foam);
let wet = false;       // in the water, or in the air after hopping out of it: you keep to swimming speed
let floating = false;  // afloat in water too deep to stand in
let wakeIn = 0;        // seconds until the next ripple spreads out from you
let dunk = 0;          // how far you've bobbed under after dropping in, on a spring
let dunkSpeed = 0;
const surfaceHere = (x, z) => waterAt(currentZone, x, z); // ripples ride the swell with this

// Something going into (or out of) the water at (x, z), whose surface is at y. `size` as for effects.splash
function splashAt(x, y, z, size) {
  effects.splash(x, y, z, size);
  effects.ripple(x, y, z, 1.4 + size * 0.9, { surface: surfaceHere, opacity: 0.7, life: 1.2 });
  sfx('splash', size);
}

// A hand dipping in as you paddle: a little splash where it goes in, and some from your kicks behind
function paddleSplash(water) {
  const yaw = player.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const side = hero.hand * 0.3; // the character's own +X, turned into the world
  const hx = player.position.x + fx * 0.55 + Math.cos(yaw) * side, hz = player.position.z + fz * 0.55 - Math.sin(yaw) * side;
  effects.splash(hx, water, hz, 0.3);
  effects.ripple(hx, water, hz, 1.1, { surface: surfaceHere, opacity: 0.45, life: 0.8 });
  if (Math.random() < 0.6) effects.splash(player.position.x - fx * 0.8, water, player.position.z - fz * 0.8, 0.2);
  sfx('paddle', 0.88 + Math.random() * 0.3);
}

// Out of the water and up onto a bank (or the beach's raft) whose top is at `top`:
// a hop that clears it, carrying on the way you're heading. Only from afloat
function climbOut(top) {
  if (!floating || vy !== 0) return false;
  vy = Math.sqrt(2 * GRAVITY * Math.max(0.3, top - player.position.y - STEP_UP + CLIMB_HOP));
  if (move.lengthSq() > 0) vel.set(move.x * SWIM_SPEED, 0, move.z * SWIM_SPEED);
  jumpQueued = 0;
  coyote = 0;
  floating = false;
  hero.jump();
  sfx('jump');
  const water = waterAt(currentZone, player.position.x, player.position.z);
  if (water !== null) splashAt(player.position.x, water, player.position.z, 0.9);
  return true;
}

function updateSwimming(dt, water) {
  const t = timer.getElapsed();
  // The ring of foam, wherever you're down in the water
  const inWater = water !== null && player.position.y < water - 0.05;
  foam.material.opacity += ((inWater ? 0.6 : 0) - foam.material.opacity) * Math.min(1, dt * 10);
  foam.visible = water !== null && foam.material.opacity > 0.01;
  if (foam.visible) {
    foam.position.set(player.position.x, water + 0.025, player.position.z);
    foam.scale.setScalar((floating ? 1.45 : 1.1) + Math.sin(t * 3) * 0.06);
  }
  // Bobbing back up after dropping in, and gently up and down while you float
  dunkSpeed += (-dunk * 70 - dunkSpeed * 8) * dt;
  dunk += dunkSpeed * dt;
  hero.root.position.y = dunk + (floating ? Math.sin(t * 2.1) * 0.03 : 0);
  if (!floating) return;
  // Ripples spreading out behind you as you swim along, or round you as you tread water
  wakeIn -= dt;
  if (wakeIn <= 0) {
    const going = Math.hypot(vel.x, vel.z) > 0.8;
    wakeIn = going ? WAKE_EVERY : BOB_EVERY;
    effects.ripple(player.position.x, water, player.position.z, going ? 2.3 : 1.7, { surface: surfaceHere, opacity: going ? 0.45 : 0.32, life: going ? 1.0 : 1.5 });
  }
}

// Leaving the water some other way (a portal, a fall in the gym): all dry again
function dryOff() {
  wet = floating = false;
  play.swimming = false;
  dunk = dunkSpeed = 0;
  hero.root.position.y = 0;
  foam.visible = false;
  foam.material.opacity = 0;
}

/* ------------------------------------------------------------------ */
/* ON A COURSE: a shadow right under you to judge your landing by, a   */
/* camera that rides at the height you last stood at and looks along   */
/* the course, falling into the pit, and getting hit by things         */
/* ------------------------------------------------------------------ */
const local = new THREE.Vector3();
const landingShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: softDisc(), color: '#2a1a2e', transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
landingShadow.visible = false;
scene.add(landingShadow);
let standingOn = null;  // the platform under you (or the last one, while you're in the air)
// What the zone's own update gets to work with (see updateZone)
// `swimming`: you're afloat (the beach's lagoon). `climb(top)` hops you up out of the water onto something that high
const play = { pos: player.position, vel, ride, effects, safe: false, hit: hitPlayer, swimming: false, climb: (top) => climbOut(top) };

// The camera turns toward a heading, unless you've just been steering it yourself
function turnCamera(yaw, dt) {
  if (lookingAround()) return;
  camYaw += Math.atan2(Math.sin(yaw - camYaw), Math.cos(yaw - camYaw)) * Math.min(1, CAM_TURN * dt);
}

function rideCamera(dt) {
  camRide += (standAt - camRide) * Math.min(1, dt * CAM_RIDE);
}

function updateCourse(dt, airborne) {
  const p = player.position, course = currentZone.course;
  const lx = p.x - currentZone.x, lz = p.z - currentZone.z;
  standAt = airborne ? Math.min(standAt, p.y) : p.y; // follow you down a fall, but not up a jump
  rideCamera(dt);

  const below = course.surfaceBelow(lx, p.y, lz);
  landingShadow.position.set(p.x, below + 0.03, p.z);
  landingShadow.scale.setScalar(Math.max(0.8, 1.5 - (p.y - below) * 0.05));
  landingShadow.visible = true;

  // Keep the sun's shadows over you, along the length of a long zone
  const [sx, sy, sz] = currentZone.sunOffset;
  const followX = Math.round(p.x / 4) * 4;
  sun.position.set(followX + sx, sy, currentZone.z + sz);
  sun.target.position.set(followX, 0, currentZone.z);
  sun.target.updateMatrixWorld();

  // What you've landed on
  if (!airborne) {
    if (below > 0) {
      const on = course.platformAt(lx, below, lz);
      if (on && on !== standingOn) currentZone.stoodOn?.(on, play);
      standingOn = on ?? standingOn;
    } else {
      standingOn = null;
    }
    // A moving platform carries you with it, and you keep that speed through a jump
    ride.set(standingOn?.vx ?? 0, 0, standingOn?.vz ?? 0);
  }

  // Fallen into the pit: the heart closes over the screen, and you're back up on the course
  if (lx > course.pitWest && p.y < course.pitTop && !respawning && !pendingZone) {
    respawning = true;
    wipeColor = currentZone.portal;
    currentZone.fell?.();
    sfx('portal');
  }
  // Safe while that happens, on a deck, on the floor, and on the way up to the first deck (`stair`)
  play.safe = !!(respawning || (!airborne && (below === 0 || standingOn?.deck)) || standingOn?.stair);

  // Looking along the course. The last deck leaves it alone, since you may have come back
  // through the portal facing west
  if (!standingOn?.finish) turnCamera(currentZone.viewYaw, dt);

  // After a hit you blink for a moment
  hurt = Math.max(0, hurt - dt);
  hero.root.visible = hurt === 0 || Math.sin(hurt * 28) > -0.3;
}

// Back up on the course's checkpoint, while the heart's over the screen
function respawn() {
  const deck = currentZone.course.checkpoint;
  player.position.set(currentZone.x + deck.x, deck.y, currentZone.z + deck.z);
  vel.set(0, 0, 0);
  knock.set(0, 0, 0);
  ride.set(0, 0, 0);
  vy = 0;
  coyote = 0;
  jumpQueued = 0;
  hurt = 0;
  hero.root.visible = true;
  hero.land(2);
  standingOn = null;
  camRide = standAt = deck.y;
  if (!deck.finish) camYaw = steerYaw = currentZone.viewYaw; // the last deck leaves it alone, as above
  player.rotation.y = camYaw + Math.PI;
  snapCamera();
}

// Something thrown has got you. `nx`, `nz` is the way it's going, and `shove` how hard.
// Returns whether it counted
function hitPlayer(nx, nz, shove) {
  if (hurt > 0 || play.safe) return false;
  hurt = HIT_SAFE;
  knock.set(nx * shove, 0, nz * shove);
  vy = Math.max(vy, HIT_HOP);
  coyote = 0;
  hero.land(4);
  sfx('oof');
  effects.ring(player.position.x, player.position.y + 0.9, player.position.z, '#ffe066', 8, 0.7);
  return true;
}

function placeCamTarget() {
  // The finale's slow orbit; a zone can also pull the camera up and in at some spots (over the farm's corn maze)
  const view = finaleZone ? FINALE_VIEW : currentZone.viewAt?.(player.position.x, player.position.z);
  const distance = view?.distance ?? CAM_DISTANCE;
  camTarget.set(
    player.position.x + Math.sin(camYaw) * distance,
    // Ride over hills (and the water, and the raft), not jumps
    (view?.height ?? CAM_HEIGHT) + (currentZone.course ? camRide : standHeight(currentZone, player.position.x, Infinity, player.position.z)),
    player.position.z + Math.cos(camYaw) * distance
  );
  // On the K-Town street, keep the camera out of the buildings. Squeezed in close
  // to a wall, it rises to keep looking over you (but not through the gym's ceiling)
  if (currentZone.bounds) {
    clampToZone(currentZone, camTarget, currentZone.cameraMargin ?? 0.3);
    const lost = distance - Math.hypot(camTarget.x - player.position.x, camTarget.z - player.position.z);
    camTarget.y = Math.min(camTarget.y + Math.max(0, lost - 3) * 0.35, currentZone.ceiling ?? Infinity);
  }
  // Over the beach's rocks and dunes, not through them
  camTarget.y = Math.max(camTarget.y, groundAt(currentZone, camTarget.x, camTarget.z) + 1.4);
}

// Jump the camera straight to where it wants to be (no smoothing)
function snapCamera() {
  placeCamTarget();
  camera.position.copy(camTarget);
}

function updateCamera(dt) {
  placeCamTarget();
  // Frame-rate independent smoothing
  camera.position.lerp(camTarget, 1 - Math.pow(CAM_SMOOTHING, dt));
  lookHeight += ((finaleZone ? FINALE_LOOK_HEIGHT : CAM_LOOK_HEIGHT) - lookHeight) * Math.min(1, dt * 3);
  lookTarget.set(player.position.x, lookHeight + player.position.y, player.position.z);
  camera.lookAt(lookTarget);
}

snapCamera(); // starting position

// Zones with moving scenery (the gym's balls) get the player and their pets each frame
function updateZone(dt) {
  if (!currentZone.update) return;
  const movers = [{ pos: player.position, r: PLAYER_RADIUS }];
  const throwers = [];
  for (const p of pets) {
    if (p.zone !== currentZone) continue;
    movers.push({ pos: p.model.position, r: p.obs.r });
    if (p.thrower) throwers.push(p);
  }
  currentZone.update(dt, movers, obstacles, play, throwers);
}

function loop(now) {
  requestAnimationFrame(loop);
  timer.update(now);
  if (!started) return;
  const raw = timer.getDelta();
  const dt = Math.min(raw, 0.05); // clamp so tab-switching doesn't teleport you
  updatePortals(dt);
  updatePets(dt);
  currentZone.course?.advance(dt);
  updatePlayer(dt);
  updateZone(dt);
  updateSigns(dt);
  if (finaleZone && !lookingAround()) camYaw += FINALE_ORBIT * dt;
  updateCamera(dt);
  updatePortalLooks(dt);
  updateCameraFades(dt);
  effects.update(dt);
  look.watch(raw);
  look.render(dt);
}

/* ------------------------------------------------------------------ */
/* GETTING STARTED: the title screen shows how far along the models    */
/* are, then each zone is drawn once behind it, so its shaders and     */
/* textures don't stutter on the way in. A key press closes the heart  */
/* over the title and opens it on K-Town.                              */
/* ------------------------------------------------------------------ */
function startPlaying() {
  started = true;
  ui.showHint();
  ui.showMuteButton(() => ui.setMuted(toggleMute()));
  updateLookHint();
}

async function warmUpZones() {
  const overhead = new THREE.PerspectiveCamera(120, 1, 1, 400);
  for (const [i, zone] of ZONES.entries()) {
    setActiveZone(zone);
    for (const item of zone.camFade ?? []) if (!item.materials) prepareFade(item);
    overhead.position.set(zone.x, 90, zone.z);
    overhead.lookAt(zone.x, 0, zone.z);
    look.warmUp(overhead);
    ui.setTitleProgress(0.9 + 0.1 * (i + 1) / ZONES.length);
    await new Promise(requestAnimationFrame);
  }
  setActiveZone(homeZone);
  ui.titleReady(begin);
}

async function begin() {
  lockPointer(); // first, while still inside the key press or click that started the game
  sfx('start');
  await ui.closeWipe(0.55, homeZone.portal);
  ui.hideTitle();
  wipe = 1;
  wipeColor = homeZone.portal;
  setZoneSound(homeZone.sound);
  ui.showZoneName(homeZone.title ?? homeZone.name);
  startPlaying();
}

// Dev shortcut: ?zone=Hawaii (any zone name) skips the title and starts you
// there, as if you'd just come through a portal
const startZone = ZONES.find((z) => z.name === new URLSearchParams(location.search).get('zone'));
if (startZone) {
  ui.hideTitle();
  if (startZone !== homeZone) teleportTo(startZone);
  else setZoneSound(homeZone.sound);
  startPlaying();
} else {
  // onLoad can fire in a lull, when a model has downloaded but its textures haven't
  // started yet. So give it a moment, and only go on if nothing new has turned up
  let settling = null, warming = false;
  loading.onStart = () => clearTimeout(settling);
  loading.onProgress = (url, done, total) => {
    clearTimeout(settling);
    ui.setTitleProgress((done / total) * 0.9);
  };
  loading.onLoad = () => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (warming) return;
      warming = true;
      warmUpZones();
    }, 400);
  };
}

requestAnimationFrame(loop);

// Dev only: a handle for driving the game from a test script
if (import.meta.env.DEV) window.__game = { player, keys, get zone() { return currentZone.name; }, get vy() { return vy; }, jump() { jumpQueued = JUMP_BUFFER; }, steer(yaw) { camYaw = steerYaw = yaw; }, camera, play, get course() { return currentZone.course; }, get hurt() { return hurt; }, zones: ZONES };

/* ------------------------------------------------------------------ */
/* RESIZE                                                              */
/* ------------------------------------------------------------------ */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  look.resize();
});
