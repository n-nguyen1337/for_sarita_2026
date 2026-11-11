import * as THREE from 'three';
import { DISPLAY_FONT, canvasTexture, fontTexture, softDisc, lightPool, mat, glow, glowMap, box, cyl, flat } from './kit.js';
import { fadeSongAway, sfx } from './audio.js';
import * as ui from './ui.js';
import { CEILING, COURSE, COVER, DECKS, FINISH, HALL_HALF_Z, PIT_TOP, PIT_WEST, PLATFORMS, RIMS, TRENCH, rimAt } from './gymcourse.js';
import { makeThrowing } from './gymthrowers.js';

/* ------------------------------------------------------------------ */
/* GYM: a long hall with a trench down the middle (gymcourse.js).      */
/* Every number below is local to the zone center. You come in the     */
/* west door from K-Town, and go east along the trench, over a flat    */
/* floor with cover and then from ledge to ledge, while the gym        */
/* characters throw things at you from the rims (gymthrowers.js). A    */
/* fall into the pit takes you back up to the last deck you stood on.  */
/* The Hawaii door and the zone's sign are on the last deck.           */
/* ------------------------------------------------------------------ */
const ACCENT = '#ff7a1a';    // gym orange
const SIGN_FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const NEON_GLOW = 2.1;       // how bright the neon signs are (see kit.js's glow)
const THROWER_Z = 9;         // how far from the middle the characters stand, up on the rims

// How fast things fly in each section, as a multiple of their usual speed (gymthrowers.js).
// The flat floor's faster, since there's cover to hide behind and nothing to fall off
const THROW_PACE = [1.35, 1, 1];
// Seconds between throws in each section, longer if you've fallen a lot there...
const THROW_EVERY = [0.8, 1.1, 0.7];
const EASE_AFTER = 3;        // ...after this many falls in a section...
const EASED = 1.6;           // ...by this much...
const STOP_AFTER = 6;        // ...and after this many they stop throwing altogether
const HELP_AFTER = 8;        // ...and after this many, a fall takes you up to the next deck instead

export const GYM = {
  title: 'The Gym',
  sky: 0xf6e4d8,             // the walls: it tints whatever the fog reaches, and the Gym's portals
  // A warm, bright room under its ceiling lights
  light: { sky: 0xfff4e8, ground: 0x8d8074, hemi: 1.2, sun: 0xfff0dc, sunIntensity: 2.0 },
  look: { bloom: 0.3, vignette: 0.16, saturation: 1.06, env: 0.35 },
  fog: [140, 260],
  // Nearly straight down, like a skylight, so shadows fall right under the platforms
  sunOffset: [6, 40, 3],
  surface: 'rubber',
  ceiling: CEILING - 1.5,    // the camera stays under this, and clear of the ducts
  course: COURSE,
  viewYaw: -Math.PI / 2,     // up on the course, the camera looks along the trench
  // Walkable rectangle = inside the trench's walls (the player stops 1 unit short).
  // `x` is where its middle is: the room's longer to the west of the zone's center
  bounds: { halfX: TRENCH.halfX, halfZ: TRENCH.halfZ + 0.5, x: TRENCH.midX },
  cameraMargin: 0.8,
  // Its music, with room tone around it: clanking weights, a treadmill (audio.js)
  sound: 'gym',
  portalSpots: {
    'K-Town': { x: TRENCH.west + 3, z: 0 },                  // west door
    Hawaii:   { x: TRENCH.east - 3, z: 0, y: FINISH.y },     // east door, at the end of the course
  },
  // The "press E" sign (text in messages.js): on the last deck, facing the way you come in
  signSpot: { x: 74.5, z: -4, y: FINISH.y, face: { x: 0, z: -4 } },
  // The gym characters are bigger than everywhere else (default 1.1; the player is ~1.8)
  npcHeight: 2.2,
  // Up on the rims, each throwing one thing. In section order, and alternating sides
  npcSpots: [
    { npc: 'perri',    x: -68, side: 1,  throws: 'dumbbell' },
    { npc: 'hamster',  x: -62, side: -1, throws: 'ball' },
    { npc: 'chungus',  x: -56, side: 1,  throws: 'dumbbell' },
    { npc: 'doge',     x: -50, side: -1, throws: 'ball' },
    { npc: 'perri',    x: -44, side: 1,  throws: 'dumbbell' },
    { npc: 'eggplant', x: -38, side: -1, throws: 'ball' },
    { npc: 'chungus',  x: -33, side: 1,  throws: 'dumbbell' },
    { npc: 'hamster',  x: -28, side: -1, throws: 'ball' },
    { npc: 'doge',     x: -23, side: 1,  throws: 'dumbbell' },
    { npc: 'eggplant', x: -9,  side: -1, throws: 'ball' },
    { npc: 'chungus',  x: -4,  side: 1,  throws: 'dumbbell' },
    { npc: 'doge',     x: 1,   side: -1, throws: 'ball' },
    { npc: 'perri',    x: 6,   side: 1,  throws: 'dumbbell' },
    { npc: 'hamster',  x: 11,  side: -1, throws: 'ball' },
    { npc: 'eggplant', x: 16,  side: 1,  throws: 'ball' },
    { npc: 'chungus',  x: 21,  side: -1, throws: 'dumbbell' },
    { npc: 'doge',     x: 26,  side: 1,  throws: 'ball' },
    { npc: 'perri',    x: 36,  side: -1, throws: 'dumbbell' },
    { npc: 'doge',     x: 41,  side: 1,  throws: 'ball' },
    { npc: 'chungus',  x: 46,  side: -1, throws: 'dumbbell' },
    { npc: 'eggplant', x: 51,  side: 1,  throws: 'ball' },
    { npc: 'perri',    x: 56,  side: -1, throws: 'dumbbell' },
    { npc: 'doge',     x: 61,  side: 1,  throws: 'dumbbell' },
    { npc: 'chungus',  x: 66,  side: -1, throws: 'ball' },
    { npc: 'hamster',  x: 71,  side: 1,  throws: 'ball' },
  ].map((s) => ({ ...s, z: s.side * THROWER_Z, y: rimAt(s.x) })),
  build: buildGym,
  update: updateGym,
  stoodOn,
  fell,
};

/* ------------------------------------------------------------------ */
/* TEXTURES                                                             */
/* ------------------------------------------------------------------ */
// Rubber gym flooring: charcoal with colored flecks
function rubberTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a2b2f';
    ctx.fillRect(0, 0, w, h);
    const flecks = ['#4a4c52', '#5b6b8a', '#8a5b5b', '#6f6f6f'];
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = flecks[i % flecks.length];
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; // tile seams
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Wall paint, bottom to top: dark kick band, orange stripe, light gray
function wallTexture() {
  return canvasTexture(16, 512, (ctx, w, h) => {
    const px = h / CEILING; // pixels per unit, canvas top = ceiling
    const paint = ctx.createLinearGradient(0, 0, 0, h); // warm, and a little darker toward the floor
    paint.addColorStop(0, '#fff6ee');
    paint.addColorStop(0.75, '#f6e4d8');
    paint.addColorStop(1, '#d9c2b4');
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2d2f34';
    ctx.fillRect(0, h - 1.0 * px, w, 1.0 * px);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, h - 1.3 * px, w, 0.3 * px);
  });
}

// Vinyl padding down the trench's walls, and a bumper-mat pit floor
function padTexture(base, seam) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = seam;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.roundRect(5, 5, w - 10, h - 10, 22);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.roundRect(16, 14, w - 32, 34, 14);
    ctx.fill();
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Artificial turf lane with white yard lines
function turfTexture() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2f7d3a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#3a8f45' : '#276b31';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 3);
    }
    ctx.fillStyle = '#f4f4f4';
    for (let x = 0; x <= w; x += 64) ctx.fillRect(x - 2, 0, 4, h);
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, h - 4, w, 4);
  });
}

function lockerTexture() {
  const tex = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3d6fb0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1f3e66';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h / 2 - 4);           // two doors per column
    ctx.strokeRect(2, h / 2 + 2, w - 4, h / 2 - 4);
    ctx.fillStyle = '#1f3e66';
    for (const top of [0, h / 2]) {
      for (let i = 0; i < 4; i++) ctx.fillRect(16, top + 14 + i * 8, 32, 3); // vents
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(48, top + 64, 6, 18);                // handle
      ctx.fillStyle = '#1f3e66';
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// A neon sign: glass tubes on a dark board. Text and border are drawn with a soft glow of
// their color around a bright core, and the bloom (see look.js) carries it onto the wall
function neonTexture(text, color) {
  return fontTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#17121f';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 36);
    ctx.fill();
    ctx.shadowColor = color;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(22, 22, w - 44, h - 44, 26);
    ctx.stroke();
    ctx.font = `600 124px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fit = w - 120;
    ctx.shadowBlur = 34;
    ctx.lineWidth = 11;
    ctx.strokeText(text, w / 2, h / 2 + 6, fit);
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff6f0';
    ctx.fillText(text, w / 2, h / 2 + 6, fit);
  });
}

// Wall TV: a cardio screen with a heart-rate line
function screenTexture(title, color) {
  return canvasTexture(256, 144, (ctx, w, h) => {
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `bold 34px ${SIGN_FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, 46);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const pts = [0, 0, 0, -30, 25, -5, 0, 0, 0, -30, 25, -5, 0, 0];
    pts.forEach((dy, i) => ctx[i ? 'lineTo' : 'moveTo'](20 + i * 16, 100 + dy));
    ctx.stroke();
  });
}

/* ------------------------------------------------------------------ */
/* EQUIPMENT (each built at the origin; the caller places it)          */
/* ------------------------------------------------------------------ */
const steel = () => mat('#9aa0a6', { metalness: 0.7, roughness: 0.35 });
const black = () => mat('#1b1c1f', { roughness: 0.7 });
const PLATE_COLORS = ['#c62f2f', '#2f62c6', '#e0b21f', '#2f9e4a'];

// Olympic barbell along X, with a pair of bumper plates
function makeBarbell(plateColor) {
  const g = new THREE.Group();
  const bar = cyl(0.025, 2.8, steel(), 0, 0, 0, 8);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [-1, 1]) {
    const plate = cyl(0.45, 0.07, mat(plateColor, { roughness: 0.6 }), s * 1.0, 0, 0, 24);
    plate.rotation.z = Math.PI / 2;
    g.add(plate);
    const collar = cyl(0.05, 0.05, steel(), s * 1.07, 0, 0, 8);
    collar.rotation.z = Math.PI / 2;
    g.add(collar);
  }
  return g;
}

// Dumbbell along X; `r` is the head radius
function makeDumbbell(r) {
  const g = new THREE.Group();
  const handle = cyl(0.025, 0.32, steel(), 0, 0, 0, 8);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  for (const s of [-1, 1]) {
    const head = cyl(r, 0.12, black(), s * 0.2, 0, 0, 6);
    head.rotation.z = Math.PI / 2;
    g.add(head);
  }
  return g;
}

function makePowerRack(plateColor) { // footprint ~2.2 × 1.6, bar racked on the +Z side
  const g = new THREE.Group();
  g.add(box(3, 0.05, 3, mat('#b07a45', { roughness: 0.8 }), 0, 0.025, 0));       // platform
  for (const s of [-1, 1]) g.add(box(0.8, 0.052, 3, black(), s * 1.1, 0.026, 0)); // rubber sides
  const frame = mat('#26282c', { metalness: 0.5, roughness: 0.5 });
  for (const x of [-1, 1]) for (const z of [-0.7, 0.7]) g.add(box(0.09, 2.5, 0.09, frame, x, 1.25, z));
  for (const z of [-0.7, 0.7]) g.add(box(2.1, 0.09, 0.09, frame, 0, 2.5, z));
  for (const x of [-1, 1]) g.add(box(0.09, 0.09, 1.5, frame, x, 2.5, 0));
  for (const x of [-1, 1]) g.add(box(0.12, 0.06, 0.15, mat(ACCENT), x, 1.36, 0.78));   // J-hooks
  const bar = makeBarbell(plateColor);
  bar.position.set(0, 1.42, 0.78);
  g.add(bar);
  return g;
}

function makeBench(withRack, plateColor) { // pad along X, head toward -X
  const g = new THREE.Group();
  g.add(box(1.5, 0.12, 0.34, mat('#202226', { roughness: 0.9 }), 0, 0.48, 0));
  g.add(box(1.3, 0.06, 0.08, steel(), 0, 0.38, 0));
  for (const x of [-0.6, 0.6]) g.add(box(0.06, 0.36, 0.4, steel(), x, 0.18, 0));
  if (withRack) {
    for (const z of [-0.55, 0.55]) g.add(box(0.07, 1.15, 0.07, steel(), -0.75, 0.58, z));
    const bar = makeBarbell(plateColor);
    bar.rotation.y = Math.PI / 2;
    bar.position.set(-0.75, 1.15, 0);
    g.add(bar);
  }
  return g;
}

function makeTreadmill() { // runner faces +Z
  const g = new THREE.Group();
  g.add(box(0.85, 0.2, 2.0, mat('#3a3d42'), 0, 0.1, 0));
  g.add(box(0.62, 0.03, 1.75, black(), 0, 0.215, -0.05));
  for (const s of [-1, 1]) {
    g.add(box(0.06, 1.1, 0.06, steel(), s * 0.38, 0.75, 0.85));
    g.add(box(0.05, 0.05, 0.6, steel(), s * 0.38, 1.05, 0.55));   // handrails
  }
  const console_ = box(0.9, 0.32, 0.18, mat('#2a2c30'), 0, 1.36, 0.88);
  console_.rotation.x = -0.4;
  g.add(console_);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), glow('#5fe0ff', 1.4));
  screen.position.set(0, 1.39, 0.78);
  screen.rotation.x = Math.PI - 0.4;
  g.add(screen);
  return g;
}

function makeBike() { // rider faces +Z
  const g = new THREE.Group();
  const frame = mat('#2a2c30', { metalness: 0.4 });
  g.add(box(0.5, 0.08, 1.2, frame, 0, 0.04, 0));
  const wheel = cyl(0.28, 0.08, mat(ACCENT, { metalness: 0.3 }), 0, 0.4, 0.38, 20);
  wheel.rotation.z = Math.PI / 2;
  g.add(wheel);
  g.add(box(0.07, 0.8, 0.07, frame, 0, 0.5, -0.3));               // seat post
  g.add(box(0.26, 0.07, 0.32, black(), 0, 0.93, -0.32));          // seat
  g.add(box(0.07, 1.0, 0.07, frame, 0, 0.6, 0.35));               // handlebar post
  g.add(box(0.5, 0.05, 0.05, steel(), 0, 1.12, 0.4));
  g.add(box(0.2, 0.12, 0.04, glow('#7dff9a', 1.4), 0, 1.2, 0.36, false));
  return g;
}

function makeDumbbellRack(len) { // runs along Z, dumbbells lying along X
  const g = new THREE.Group();
  const frame = mat('#26282c', { metalness: 0.5, roughness: 0.5 });
  const tiers = [0.45, 0.85];
  for (const y of tiers) g.add(box(0.8, 0.05, len, frame, 0, y, 0));
  for (const z of [-len / 2 + 0.1, 0, len / 2 - 0.1]) {
    for (const x of [-0.35, 0.35]) g.add(box(0.06, 0.9, 0.06, frame, x, 0.45, z));
  }
  const pairs = Math.floor(len / 1.3);
  tiers.forEach((y, t) => {
    for (let i = 0; i < pairs; i++) {
      const r = 0.07 + (t * pairs + i) * (0.08 / (pairs * 2)); // heavier toward the end
      for (const dz of [-0.22, 0.22]) {
        const db = makeDumbbell(r);
        db.position.set(0, y + r + 0.03, -len / 2 + 0.65 + i * 1.3 + dz);
        g.add(db);
      }
    }
  });
  return g;
}

function makeKettlebell(r, color) {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color, { roughness: 0.5 }));
  bell.position.y = r;
  bell.castShadow = true;
  g.add(bell);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, r * 0.14, 8, 16, Math.PI), black());
  handle.position.y = r * 1.75;
  g.add(handle);
  return g;
}

function makePunchingBag() {
  const g = new THREE.Group();
  g.add(cyl(0.35, 1.4, mat('#b3261e', { roughness: 0.6 }), 0, 1.7, 0, 16));
  g.add(cyl(0.36, 0.08, black(), 0, 2.4, 0, 16));
  g.add(cyl(0.02, CEILING - 2.4, steel(), 0, (CEILING + 2.4) / 2, 0, 6)); // chain to the ceiling
  return g;
}

function makeSled() {
  const g = new THREE.Group();
  g.add(box(1.0, 0.12, 0.7, black(), 0, 0.06, 0));
  for (const z of [-0.25, 0.25]) g.add(box(0.06, 0.9, 0.06, steel(), 0.35, 0.55, z));
  const plate = cyl(0.3, 0.12, mat(PLATE_COLORS[0]), -0.15, 0.18, 0, 20);
  g.add(plate);
  return g;
}

function makeWaterCooler() {
  const g = new THREE.Group();
  g.add(box(0.45, 1.0, 0.45, mat('#e8e8ea'), 0, 0.5, 0));
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.7 }));
  bottle.position.y = 1.25;
  g.add(bottle);
  return g;
}

/* ------------------------------------------------------------------ */
/* BUILD THE ZONE                                                       */
/* ------------------------------------------------------------------ */
let throwing = null;

function buildGym(zone, addObstacle) {
  const room = new THREE.Group();
  room.position.set(zone.x, 0, zone.z);
  zone.group.add(room);
  // Something in the pit that you and the balls bump into. You pass over it up on the course
  const prop = (obj, x, z, r, top = PIT_TOP) => {
    const obs = addObstacle(obj, zone.x + x, zone.z + z, r, zone.group);
    obs.top = top;
    return obs;
  };
  // Scenery standing on a rim, out of your reach, so it needs no collision
  const onRim = (obj, x, z, rotY = 0) => {
    obj.position.set(x, rimAt(x), z);
    obj.rotation.y = rotY;
    room.add(obj);
    return obj;
  };
  const W = TRENCH.halfX * 2, D = HALL_HALF_Z * 2, TW = TRENCH.halfZ;
  const rimDepth = HALL_HALF_Z - TW;

  /* The pit's floor: bumper mats, down the whole trench */
  const foam = padTexture('#4c7fc2', '#2f5a96');
  foam.repeat.set(W / 4, TW / 2);
  room.add(flat(W, TW * 2, new THREE.MeshStandardMaterial({ map: foam, roughness: 0.95 }), TRENCH.midX, 0, 0));

  /* The rims: two long blocks with the trench between them, padded on the trench side */
  const rubber = rubberTexture();
  rubber.repeat.set(W / 2, rimDepth / 2);
  const rimTop = new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.95 });
  const padPaint = padTexture('#d9dee6', '#7d8794');
  for (const [from, to, y] of RIMS) {
    const len = to - from, x = (from + to) / 2;
    const pads = padPaint.clone();
    pads.repeat.set(len / 3, y / 3);
    pads.needsUpdate = true;
    const side = new THREE.MeshStandardMaterial({ map: pads, roughness: 0.85 });
    for (const s of [-1, 1]) {
      // box faces: +x, -x, +y, -y, +z, -z
      room.add(box(len, y, rimDepth, [side, side, rimTop, side, side, side], x, y / 2, s * (TW + rimDepth / 2), false));
      room.add(box(len, 0.2, 0.3, mat(ACCENT, { roughness: 0.6 }), x, y + 0.1, s * (TW + 0.15), false)); // a bright lip along the edge
    }
  }

  /* Walls and ceiling. They don't cast shadows, so the sun still lights
     the room like a big skylight. */
  const paint = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
  for (const s of [-1, 1]) room.add(box(W + 0.8, CEILING, 0.4, paint, TRENCH.midX, CEILING / 2, s * (HALL_HALF_Z + 0.2), false));
  for (const x of [TRENCH.west - 0.2, TRENCH.east + 0.2]) room.add(box(0.4, CEILING, D, paint, x, CEILING / 2, 0, false));
  room.add(box(W + 0.8, 0.3, D + 0.8, new THREE.MeshBasicMaterial({ color: '#4a4c52' }), TRENCH.midX, CEILING + 0.15, 0, false));
  for (let x = -95; x <= 76; x += 19) {
    for (const z of [-10, 0, 10]) room.add(box(7, 0.05, 2.4, glow('#fffaf0', 2.2), x, CEILING - 0.03, z, false));
    room.add(lightPool('#fff0dc', 8, x, 0, 0.14)); // each row lights the pit below it
  }
  for (const z of [-12, 12]) {                                                    // exposed ducts
    const duct = cyl(0.45, W, mat('#b9bec4', { metalness: 0.6, roughness: 0.4 }), TRENCH.midX, CEILING - 0.7, z, 16);
    duct.rotation.z = Math.PI / 2;
    duct.castShadow = false;
    room.add(duct);
  }

  /* Doors behind each portal */
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd8e8', transparent: true, opacity: 0.55, roughness: 0.1 });
  const doorFrame = mat('#26282c');
  const addDoor = (x, y, rotY) => {
    const d = new THREE.Group();
    d.add(box(2.6, 2.9, 0.08, doorFrame, 0, 1.45, 0, false));
    for (const s of [-1, 1]) d.add(box(1.1, 2.6, 0.1, glass, s * 0.6, 1.35, 0.02, false));
    d.add(box(0.8, 0.3, 0.06, glow('#ff3b30', 1.6), 0, 3.25, 0.03, false));   // EXIT sign
    d.position.set(x, y, 0);
    d.rotation.y = rotY;
    room.add(d);
  };
  addDoor(TRENCH.west + 0.05, 0, Math.PI / 2);          // to K-Town
  addDoor(TRENCH.east - 0.05, FINISH.y, -Math.PI / 2);  // to Hawaii

  /* Neon signs, casting a glow on the wall around them, with the odd flicker */
  const sign = (text, color, w, x, z, rotY, y) => {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), glowMap(neonTexture(text, color), NEON_GLOW));
    face.position.z = 0.02;
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.7, w * 0.85),
      new THREE.MeshBasicMaterial({ map: softDisc(), color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const phase = Math.random() * 100;
    face.onBeforeRender = () => { // only ticks while it's on screen
      const t = performance.now() / 1000 + phase;
      const flicker = Math.sin(t * 0.73) > 0.992 && Math.sin(t * 31) > 0 ? 0.62 : 1;
      face.material.color.setScalar(NEON_GLOW * flicker);
      wash.material.opacity = 0.4 * flicker;
    };
    g.add(wash, face);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    room.add(g);
  };
  // Both at the far end of the trench, in sight the whole way along
  sign('♥ I LOVE SARAH ♥', ACCENT, 14, TRENCH.east - 0.03, 0, -Math.PI / 2, FINISH.y + 10);
  sign('YOU ARE SO BEAUTIFUL', '#ff4fa3', 7.6, TRENCH.east - 0.03, 0, -Math.PI / 2, FINISH.y + 6.95); // up above the Hawaii portal's name

  /* The gym goes on up on the rims, behind the characters */
  const mirrorTex = canvasTexture(256, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#c9dbe4');
    g.addColorStop(0.5, '#eef6fa');
    g.addColorStop(1, '#b8cbd6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7d8a92';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  });
  const mirrorMat = new THREE.MeshStandardMaterial({ map: mirrorTex, roughness: 0.1, metalness: 0.2 });
  for (const x of [-72, -52, 4, 22]) {
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.2), mirrorMat);
    mirror.position.set(x, rimAt(x) + 1.9, -HALL_HALF_Z + 0.02);
    room.add(mirror);
    onRim(makeDumbbellRack(10), x, -HALL_HALF_Z + 1.2, Math.PI / 2);
  }
  for (const x of [-78, -72, -66, -58, -52, -46, -2, 4, 10, 16, 22, 28]) onRim(makeBench(false), x, -12, Math.PI / 2);
  for (const [i, x] of [-70, -62, -38, -28, -8, 6].entries()) onRim(makePowerRack(PLATE_COLORS[i % PLATE_COLORS.length]), x, 12.5, Math.PI);
  for (const x of [-48, 12, 20]) onRim(makeBench(true, PLATE_COLORS[(x + 48) % 4]), x, 12.5, Math.PI / 2);

  // The cardio row, along the south wall, facing its TVs
  for (const x of [38, 42, 46, 50, 54]) onRim(makeTreadmill(), x, 13);
  for (const x of [62, 65.5, 69]) onRim(makeBike(), x, 13);
  [['CARDIO', '#5fe0ff'], ['♥ 128 BPM', '#ff4f6d'], ['KEEP GOING', '#7dff9a']].forEach(([t, c], i) => {
    const tv = new THREE.Group();
    tv.add(box(3.1, 1.8, 0.12, black(), 0, 0, 0, false));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.6),
      glowMap(screenTexture(t, c), 1.4));
    screen.position.z = 0.07;
    tv.add(screen);
    const x = 42 + i * 12;
    tv.position.set(x, rimAt(x) + 4.3, HALL_HALF_Z - 0.1);
    tv.rotation.y = Math.PI;
    room.add(tv);
  });

  // The functional corner, on the north rim: turf lane, sled, tire, kettlebells, bags
  const turfY = rimAt(50) + 0.015;
  room.add(flat(16, 3.6, new THREE.MeshStandardMaterial({ map: turfTexture() }), 50, -13.5, turfY));
  onRim(makeSled(), 45, -13.5);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.3, 12, 24), black());
  tire.rotation.x = Math.PI / 2;
  tire.position.y = 0.3;
  tire.castShadow = true;
  const tireGroup = new THREE.Group();
  tireGroup.add(tire);
  onRim(tireGroup, 56, -13.5);
  for (let i = 0; i < 6; i++) onRim(makeKettlebell(0.13 + i * 0.025, PLATE_COLORS[i % PLATE_COLORS.length]), 62 + i * 0.75, -12);
  for (const x of [66, 70, 74]) onRim(makePunchingBag(), x, -13.5);

  // Lockers and a water cooler by the K-Town end
  const lockerTex = lockerTexture();
  for (const x of [-98, -92, -86]) {
    const len = 5.6;
    const t = lockerTex.clone();
    t.repeat.set(len / 0.6, 1);
    t.needsUpdate = true;
    const side = mat('#2c5a94');
    // box faces: +x (front, into the room), -x, +y, -y, +z, -z
    const lockers = box(0.5, 2.2, len, [new THREE.MeshStandardMaterial({ map: t }), side, side, side, side, side], 0, 1.1, 0);
    const g = new THREE.Group();
    g.add(lockers);
    onRim(g, x, HALL_HALF_Z - 0.3, Math.PI / 2);
  }
  onRim(makeWaterCooler(), -80, 14);

  /* Stretching corner down in the pit: a few exercise balls */
  for (const [x, z, c] of [[14, 2.5, '#3b82f6'], [-2, -3, '#ec4899'], [38, 3, '#22c55e']]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), mat(c, { roughness: 0.4 }));
    ball.position.y = BALL_R;
    ball.castShadow = true;
    const g = new THREE.Group();
    g.add(ball);
    const obs = prop(g, x, z, BALL_R + 0.05);
    balls.push({ g, ball, obs, zone, vx: 0, vz: 0, y: 0, vy: 0, cooldown: 0 });
  }

  buildCourse(zone, room, prop);
  throwing = makeThrowing(zone);
}

/* ------------------------------------------------------------------ */
/* THE COURSE                                                           */
/* ------------------------------------------------------------------ */
const SECTION_COLORS = ['#ff8a5c', '#5cb8ff', '#b78cff']; // one for each stretch between decks
const DECK_COLOR = '#ffd166';
const STAIR_COLOR = '#f2b48c';
const MAT_COLORS = ['#3f6fb5', '#5cb8ff'];
const MAT_LAYERS = 5;
const COVER_FADE = [7.6, 8.4]; // a stack goes when the camera's this close, and comes back past this (the camera sits 8.2 behind you)

const movingParts = []; // { p, holder }: what's drawn for each moving platform, to keep up with it

function buildCourse(zone, room, prop) {
  const postMat = mat('#8d939a', { metalness: 0.6, roughness: 0.4 });
  let section = -1;
  for (const p of PLATFORMS) {
    if (p.deck) section = Math.min(section + 1, SECTION_COLORS.length - 1);
    const material = p.ground ? groundMaterial(p) : mat(p.deck ? DECK_COLOR : p.stair ? STAIR_COLOR : SECTION_COLORS[section], { roughness: 0.7 });
    const tall = p.y - p.bottom;
    const block = p.r
      ? new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, tall, 32), material)
      : box(p.w, tall, p.d, material);
    // A moving platform's parts go in a group of their own, around its top
    const holder = p.move ? new THREE.Group() : room;
    const at = p.move ? { x: 0, y: 0, z: 0 } : p;
    block.position.set(at.x, at.y - tall / 2, at.z);
    block.castShadow = block.receiveShadow = true;
    holder.add(block);
    // A rim round the top, so an edge is easy to see from any height
    if (!p.stair) {
      const rim = new THREE.Mesh(p.r
        ? new THREE.RingGeometry(p.r - 0.14, p.r, 48).rotateX(-Math.PI / 2)
        : rectRim(p.w, p.d, 0.14), mat('#ffffff'));
      rim.position.set(at.x, at.y + 0.012, at.z);
      holder.add(rim);
    }
    if (p.move) {
      holder.position.set(p.x, p.y, p.z);
      room.add(holder);
      movingParts.push({ p, holder });
      buildRails(p, holder, room, tall, postMat);
    } else if (p.r) { // the round ones stand out in the middle, on a slim post you walk around in the pit
      const post = new THREE.Object3D();
      post.add(cyl(0.22, p.bottom, postMat, 0, p.bottom / 2, 0, 10));
      prop(post, p.x, p.z, 0.32, p.bottom);
    } else if (!p.deck && !p.stair) { // a ledge has a bracket into the wall
      const s = Math.sign(p.z);
      room.add(box(p.w * 0.6, 0.9, 0.3, postMat, p.x, p.bottom - 0.45, s * (TRENCH.halfZ - 0.15), false));
    }
  }
  for (const c of COVER) {
    const stack = makeMatStack(c);
    room.add(stack);
    // Once you're past it, it's between you and the camera: it dithers away so you can see yourself
    (zone.camFade ??= []).push({ object: stack, near: COVER_FADE[0], far: COVER_FADE[1], at: { x: zone.x + c.x, z: zone.z + c.z } });
  }
}

// What a moving platform runs on, as long as how far it goes: a rail along a wall or up
// one, or a pair across the trench. The bracket under it goes along with it
function buildRails(p, holder, room, tall, material) {
  const { x: alongX = 0, y: alongY = 0, z: alongZ = 0 } = p.move;
  const { x, y, z } = p.home;
  const width = p.w ?? p.r * 2, under = y - tall - 0.45;
  if (alongZ) {
    holder.add(box(width * 0.6, 0.3, 0.8, material, 0, -tall - 0.15, 0, false));
    for (const s of [-1, 1]) room.add(box(0.22, 0.2, TRENCH.halfZ * 2, material, x + s * width * 0.3, y - tall - 0.4, 0, false));
    return;
  }
  const wall = Math.sign(z) * (TRENCH.halfZ - 0.15);
  holder.add(box(width * 0.6, 0.9, 0.3, material, 0, -tall - 0.45, wall - z, false));
  room.add(alongY
    ? box(width * 0.3, alongY * 2 + 0.9, 0.2, material, x, under, wall + Math.sign(z) * 0.05, false)
    : box(width * 0.6 + alongX * 2, 0.24, 0.2, material, x, under, wall + Math.sign(z) * 0.05, false));
}

// The flat floor: padded tiles in the section's color
function groundMaterial(p) {
  const tiles = padTexture(SECTION_COLORS[0], '#c9623a');
  tiles.repeat.set(p.w / 3, p.d / 3);
  return new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.85 });
}

// A stack of gym mats, filling a piece of cover (`c`, in gymcourse.js) from the floor up
function makeMatStack(c) {
  const g = new THREE.Group();
  const tall = c.y - c.floor;
  for (let i = 0; i < MAT_LAYERS; i++) {
    const layer = box(c.w, tall / MAT_LAYERS, c.d, mat(MAT_COLORS[i % MAT_COLORS.length], { roughness: 0.8 }), 0, tall * (i + 0.5) / MAT_LAYERS, 0);
    layer.receiveShadow = true;
    g.add(layer);
  }
  const lip = new THREE.Mesh(rectRim(c.w, c.d, 0.14), mat('#ffffff'));
  lip.position.y = tall + 0.012;
  g.add(lip);
  g.position.set(c.x, c.floor, c.z);
  return g;
}

// A flat rectangular frame, lying level and open in the middle
function rectRim(w, d, t) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -d / 2).lineTo(w / 2, -d / 2).lineTo(w / 2, d / 2).lineTo(-w / 2, d / 2).closePath();
  const hole = new THREE.Path();
  const iw = w / 2 - t, id = d / 2 - t;
  hole.moveTo(-iw, -id).lineTo(-iw, id).lineTo(iw, id).lineTo(iw, -id).closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

/* ------------------------------------------------------------------ */
/* CHECKPOINTS                                                          */
/* The last deck you stood on is where a fall takes you back up to.     */
/* ------------------------------------------------------------------ */
const progress = { reached: 0, falls: DECKS.map(() => 0), cleared: false };

// `p` is the platform you've just landed on
function stoodOn(p, play) {
  if (!p.deck) return;
  COURSE.checkpoint = p;
  const index = DECKS.indexOf(p);
  if (index > progress.reached) {
    progress.reached = index;
    for (let i = 0; i < 5; i++) play.effects.heart(play.pos.x + (Math.random() - 0.5) * 2, play.pos.y + 1.6 + Math.random(), play.pos.z + (Math.random() - 0.5) * 2, 0.45);
    if (p.finish) {
      sfx('start');
      ui.showZoneName('You made it!');
    } else {
      sfx('checkpoint');
      ui.showZoneName('Checkpoint!');
    }
  }
  if (p.finish) progress.cleared = true;
  if (p.songEnds) fadeSongAway(GYM.sound);
}

// You've fallen into the pit from up on the course
function fell() {
  if (progress.cleared) return;
  const falls = ++progress.falls[progress.reached];
  const next = DECKS[progress.reached + 1];
  if (falls === HELP_AFTER && next) COURSE.checkpoint = next; // never stuck: this one takes you on to the next deck
}

function updateGym(dt, movers, obstacles, play, throwers) {
  for (const { p, holder } of movingParts) holder.position.set(p.x, p.y, p.z);
  updateBalls(dt, movers, obstacles);
  const section = Math.min(progress.reached, THROW_EVERY.length - 1);
  const falls = progress.falls[progress.reached];
  const every = progress.cleared || falls >= STOP_AFTER ? null : THROW_EVERY[section] * (falls >= EASE_AFTER ? EASED : 1);
  throwing?.update(dt, play, throwers, every, THROW_PACE[section]);
  if (progress.cleared) { // they're happy for you
    for (const t of throwers) {
      if (t.state === 'cheer') continue;
      t.state = 'cheer';
      t.hop = Math.random() * 3;
    }
  }
}

/* ------------------------------------------------------------------ */
/* BOUNCY EXERCISE BALLS                                                */
/* Run into one (or let a pet do it) and it gets kicked: it hops,      */
/* rolls away, and rebounds off the walls and the equipment.           */
/* ------------------------------------------------------------------ */
const BALL_R = 0.55;
const BALL_GRAVITY = 18;
const BALL_BOUNCE = 0.6;     // share of vertical speed kept on each floor bounce
const BALL_WALL_BOUNCE = 0.7;
const BALL_FRICTION = 1.2;   // per-second roll slowdown
const balls = [];
const lastPos = new Map();   // mover position -> where it was last frame, to know its speed
const rollAxis = new THREE.Vector3();

// movers: [{ pos, r }] for the player and the pets in the room
function updateBalls(dt, movers, obstacles) {
  if (dt <= 0) return;
  for (const b of balls) {
    const p = b.g.position;
    b.cooldown -= dt;

    // 1. Kicks: anything touching the ball and moving into it sends it flying
    for (const m of movers) {
      const prev = lastPos.get(m.pos);
      if (!prev || b.cooldown > 0 || m.pos.y > 2) continue; // only something down in the pit with it
      const mvx = (m.pos.x - prev.x) / dt, mvz = (m.pos.z - prev.z) / dt;
      const speed = Math.hypot(mvx, mvz);
      const dx = p.x - m.pos.x, dz = p.z - m.pos.z;
      const d = Math.hypot(dx, dz);
      if (speed < 0.5 || d > BALL_R + m.r + 0.15 || d < 0.0001) continue;
      if (mvx * dx + mvz * dz <= 0) continue; // moving away from it
      const kick = 2 + speed * 1.3;
      b.vx = (dx / d) * kick + mvx * 0.3;
      b.vz = (dz / d) * kick + mvz * 0.3;
      if (b.y < 0.05) b.vy = 3.5 + speed * 0.5;
      b.cooldown = 0.25;
      sfx('bonk');
    }

    // 2. Hop: gravity and a floor bounce that dies down
    b.vy -= BALL_GRAVITY * dt;
    b.y += b.vy * dt;
    if (b.y <= 0) {
      b.y = 0;
      b.vy = b.vy < -1.5 ? -b.vy * BALL_BOUNCE : 0;
    }

    // 3. Roll, slowing down on the rubber floor
    const step = Math.hypot(b.vx, b.vz) * dt;
    p.x += b.vx * dt;
    p.z += b.vz * dt;
    const slow = Math.max(0, 1 - BALL_FRICTION * dt);
    b.vx *= slow;
    b.vz *= slow;
    if (step > 0) {
      rollAxis.set(b.vz, 0, -b.vx).normalize();
      b.ball.rotateOnWorldAxis(rollAxis, step / BALL_R);
    }

    // 4. Rebound off the equipment, the pets and the other balls
    for (const o of obstacles) {
      if (o === b.obs || o.base) continue; // `base`: it's up on the course, over the balls' heads
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + BALL_R;
      if (d >= min || d < 0.0001) continue;
      const nx = dx / d, nz = dz / d;
      p.x = o.x + nx * min;
      p.z = o.z + nz * min;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= (1 + BALL_WALL_BOUNCE) * vn * nx;
        b.vz -= (1 + BALL_WALL_BOUNCE) * vn * nz;
      }
    }

    // 5. Rebound off the walls
    const hx = b.zone.x, hz = b.zone.z;
    const mz = TRENCH.halfZ - BALL_R - 0.2;
    const west = hx + PIT_WEST + BALL_R + 0.2, east = hx + TRENCH.east - BALL_R - 0.2;
    if (p.x < west || p.x > east) { p.x = Math.max(west, Math.min(east, p.x)); b.vx *= -BALL_WALL_BOUNCE; }
    if (Math.abs(p.z - hz) > mz) { p.z = hz + Math.sign(p.z - hz) * mz; b.vz *= -BALL_WALL_BOUNCE; }

    b.ball.position.y = BALL_R + b.y;
    b.obs.x = p.x;
    b.obs.z = p.z;
  }
  for (const m of movers) {
    const prev = lastPos.get(m.pos);
    if (prev) prev.copy(m.pos);
    else lastPos.set(m.pos, m.pos.clone());
  }
}
