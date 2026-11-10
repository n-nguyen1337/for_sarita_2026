import * as THREE from 'three';
import { canvasTexture, heartShape, mat } from './kit.js';
import { sfx } from './audio.js';

/* ------------------------------------------------------------------ */
/* THE LAGOON: the sea off Hawaii's cove, where you can swim           */
/* A line of buoys marks where it meets the open sea. Out in it are a  */
/* raft to climb up on and jump off, floaties to bump about, sea       */
/* turtles paddling around, and fish that hop out of the water. All of */
/* it rides the swell. Coordinates are local to the zone's center, as  */
/* in beach.js, which bakes where you can swim (the lagoon's water,    */
/* clear of rocks) and hands this the zone once that's done.           */
/* ------------------------------------------------------------------ */
// A circle overlapping the beach. You're stopped LAGOON_EDGE inside its rim, where the buoys float
export const LAGOON = { x: 3, z: 16, r: 16 };
export const LAGOON_EDGE = 0.8;

const RAFT = { x: 3, z: 25, r: 1.7, freeboard: 0.25 }; // its deck stands this far out of the water
const STEP_UP = 0.3;       // main.js's STEP_UP: the raft only stops a swimmer this far below its deck
const FOOT = 0.25;         // you can stand this far past the deck's edge
const BUOY_GAP = 1.5;      // between the buoys along the line

// Bump into one and it drifts off, slowing down, and the current slowly brings it back
const FLOATIES = [
  { kind: 'donut', x: -3, z: 21 },
  { kind: 'duck', x: 9, z: 19.5 },
  { kind: 'ball', x: 5, z: 13 },
];
const FLOAT_DRAG = 0.9;    // per second
const HOME_PULL = 0.025;   // the current back home (per second, per unit away)
const BOOP = 1.6;          // a bump sends it off this many times faster than you were going into it
const BUMP_EVERY = 1.2;    // the soonest one squeaks or bonks again (s)

const TURTLES = [{ x: -1, z: 26 }, { x: 10, z: 23 }];
const TURTLE_SPEED = 0.85;
const TURTLE_TURN = 1.3;   // radians per second
const GREET_RANGE = 3.4;   // like the characters on the beach, they turn to say hello...
const GREET_EVERY = 11;    // ...about this often (s) each

const FISH_COLORS = ['#ffa630', '#4fc3f7', '#ff6fa8'];
const FISH_NEAR = [3.5, 9]; // they hop somewhere this far from you (so you see them)...
const FISH_EVERY = [2.5, 6]; // ...each about this often (s)

const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ */
/* THE THINGS IN IT                                                     */
/* Each is built facing +Z with the waterline at y = 0                  */
/* ------------------------------------------------------------------ */
function part(geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

// Cute faces, the same way as the player's: dark eyes with a sparkle, rosy cheeks
function addFace(group, { y, z, apart, eye = 0.045, cheek = 0.05, cheekY = -0.06, cheekX = 1.7, tilt = 0.5 }) {
  for (const s of [-1, 1]) {
    const e = part(new THREE.SphereGeometry(eye, 10, 8), mat('#1c1420', { roughness: 0.3 }), s * apart, y, z, false);
    e.scale.set(1, 1.3, 0.6);
    group.add(e);
    group.add(part(new THREE.SphereGeometry(eye * 0.35, 6, 4), mat('#ffffff'), s * apart + eye * 0.3, y + eye * 0.35, z + eye * 0.45, false));
    const blush = part(new THREE.CircleGeometry(cheek, 14), new THREE.MeshBasicMaterial({ color: '#ff9eb5', transparent: true, opacity: 0.7 }),
      s * apart * cheekX, y + cheekY, z - 0.02, false);
    blush.rotation.y = s * tilt;
    group.add(blush);
  }
}

// The raft: a round wooden deck on floats, a ladder down into the water, and a heart flag
function makeRaft() {
  const raft = new THREE.Group();
  const planks = canvasTexture(256, 256, (ctx, w, h) => {
    const tones = ['#e8b77a', '#dca76a', '#e3b274', '#d79f62', '#e6b87c', '#dba66b'];
    const n = 9;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = tones[i % tones.length];
      ctx.fillRect(0, (i * h) / n, w, h / n + 1);
      for (let k = 0; k < 30; k++) { // the grain
        ctx.fillStyle = `rgba(120, 72, 32, ${0.05 + Math.random() * 0.07})`;
        ctx.fillRect(Math.random() * w, (i * h) / n + 3 + Math.random() * (h / n - 6), 10 + Math.random() * 40, 1.5);
      }
    }
    ctx.strokeStyle = 'rgba(110, 62, 28, 0.6)';
    ctx.lineWidth = 3;
    for (let i = 1; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(0, (i * h) / n); ctx.lineTo(w, (i * h) / n); ctx.stroke();
    }
  });
  const side = mat('#b9824e', { roughness: 0.8 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(RAFT.r, RAFT.r * 0.97, 0.16, 36),
    [side, new THREE.MeshStandardMaterial({ map: planks, roughness: 0.75 }), side]);
  deck.position.y = -0.08;
  deck.castShadow = deck.receiveShadow = true;
  raft.add(deck);
  // A rope round the edge
  const rope = part(new THREE.TorusGeometry(RAFT.r + 0.02, 0.045, 8, 48), mat('#f2e2bf', { roughness: 0.9 }), 0, -0.03, 0);
  rope.rotation.x = Math.PI / 2;
  raft.add(rope);
  // Blue and white floats underneath, just showing at the waterline
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const drum = part(new THREE.CylinderGeometry(0.28, 0.28, 0.95, 16), mat(i % 2 ? '#3d8fd6' : '#f4f7fa', { roughness: 0.5 }),
      Math.cos(a) * RAFT.r * 0.62, -0.38, Math.sin(a) * RAFT.r * 0.62);
    drum.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2);
    raft.add(drum);
  }
  // A ladder on the side facing the beach (-Z), its rails curling over onto the deck
  const steel = mat('#e9eef2', { metalness: 0.6, roughness: 0.3 });
  for (const s of [-1, 1]) {
    raft.add(part(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), steel, s * 0.26, -0.15, -RAFT.r - 0.12));
    const bend = part(new THREE.TorusGeometry(0.16, 0.035, 8, 12, Math.PI), steel, s * 0.26, 0.5, -RAFT.r + 0.04);
    bend.rotation.y = Math.PI / 2;
    raft.add(bend);
    raft.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), steel, s * 0.26, 0.25, -RAFT.r + 0.2)); // down onto the deck
  }
  for (const y of [-0.42, -0.12]) {
    const rung = part(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 8), steel, 0, y, -RAFT.r - 0.12);
    rung.rotation.z = Math.PI / 2;
    raft.add(rung);
  }
  // A flag on the far side: a pink heart, fluttering
  const pole = part(new THREE.CylinderGeometry(0.035, 0.04, 2, 8), mat('#ffffff', { roughness: 0.5 }), 0, 1, RAFT.r - 0.3);
  raft.add(pole);
  pole.add(part(new THREE.SphereGeometry(0.07, 10, 8), mat('#ffd23f', { roughness: 0.4 }), 0, 1.02, 0));
  const flag = new THREE.Group();
  flag.position.set(0, 0.62, 0);
  const heart = part(new THREE.ShapeGeometry(heartShape(0.6)), mat('#ff5d8f', { roughness: 0.6, side: THREE.DoubleSide }), 0, 0, 0);
  heart.rotation.z = Math.PI / 2; // lying on its side, point away from the pole
  heart.position.x = 0.5;
  heart.position.y = 0.01;
  flag.add(heart);
  pole.add(flag);
  return { raft, flag, pole };
}

function makeDonut() {
  const donut = new THREE.Group();
  const dough = part(new THREE.TorusGeometry(0.62, 0.27, 14, 36), mat('#f0b56f', { roughness: 0.55 }));
  dough.rotation.x = Math.PI / 2;
  donut.add(dough);
  const icing = part(new THREE.TorusGeometry(0.63, 0.255, 14, 36), mat('#ff8fc4', { roughness: 0.35 }), 0, 0.085, 0);
  icing.rotation.x = Math.PI / 2;
  icing.scale.set(1, 1, 0.6); // flattened, on top
  donut.add(icing);
  // Sprinkles on the icing
  const colors = ['#ffffff', '#ffe066', '#7fd8ff', '#9bf0b4', '#c79bff'];
  const sprinkles = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.018, 0.07, 2, 6), mat('#ffffff', { roughness: 0.4 }), 26);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, across = rand(-0.15, 0.15), r = 0.63 + across;
    p.set(Math.cos(a) * r, 0.085 + 0.15 * Math.sqrt(1 - (across / 0.255) ** 2), Math.sin(a) * r);
    q.setFromEuler(e.set(Math.PI / 2, Math.random() * Math.PI, 0));
    sprinkles.setMatrixAt(i, m.compose(p, q, one));
    sprinkles.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  }
  donut.add(sprinkles);
  return donut;
}

function makeDuck() {
  const duck = new THREE.Group();
  const yellow = mat('#ffd23f', { roughness: 0.35 });
  const body = part(new THREE.SphereGeometry(0.55, 24, 16), yellow, 0, 0.1, 0);
  body.scale.set(1, 0.72, 1.25);
  duck.add(body);
  for (const s of [-1, 1]) { // little wings
    const wing = part(new THREE.SphereGeometry(0.3, 14, 10), yellow, s * 0.47, 0.22, -0.08);
    wing.scale.set(0.35, 0.62, 1);
    wing.rotation.x = -0.3;
    duck.add(wing);
  }
  const tail = part(new THREE.ConeGeometry(0.16, 0.34, 12), yellow, 0, 0.38, -0.66);
  tail.rotation.x = -0.85;
  duck.add(tail);
  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.42);
  head.add(part(new THREE.SphereGeometry(0.37, 22, 16), yellow));
  const beak = part(new THREE.SphereGeometry(0.18, 14, 10), mat('#ff8a2b', { roughness: 0.4 }), 0, -0.07, 0.34);
  beak.scale.set(1.25, 0.5, 1.05);
  head.add(beak);
  addFace(head, { y: 0.07, z: 0.335, apart: 0.15, eye: 0.055, cheek: 0.06, cheekY: -0.1, cheekX: 1.55, tilt: 0.6 });
  duck.add(head);
  duck.scale.setScalar(1.15);
  return { duck, head };
}

function makeBall() {
  const stripes = canvasTexture(256, 128, (ctx, w, h) => {
    const colors = ['#ff5d8f', '#ffffff', '#4fc3f7', '#ffffff', '#ffd23f', '#ffffff'];
    colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * w) / 6, 0, w / 6 + 1, h); });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h * 0.09);
    ctx.fillRect(0, h * 0.91, w, h * 0.09);
  });
  const ball = part(new THREE.SphereGeometry(0.42, 28, 18), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.35 }));
  const holder = new THREE.Group();
  holder.add(ball);
  return { holder, ball };
}

// A honu (Hawaiian green sea turtle), paddling along at the surface
function makeTurtle() {
  const turtle = new THREE.Group();
  const body = new THREE.Group(); // bobs and banks
  turtle.add(body);
  const shellMap = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5aa86a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#86c98a';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h * 0.85, 2 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#2f6e45';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, h * 0.42); ctx.lineTo(w, h * 0.42); ctx.stroke(); // the top plates from the side ones
    for (let i = 0; i < 5; i++) {
      const x = ((i + 0.5) * w) / 5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.42); ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const x = (i * w) / 10;
      ctx.beginPath(); ctx.moveTo(x, h * 0.42); ctx.lineTo(x, h * 0.86); ctx.stroke();
    }
    ctx.fillStyle = '#d9c27a';
    ctx.fillRect(0, h * 0.86, w, h * 0.14); // the rim
  });
  const shell = part(new THREE.SphereGeometry(0.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: shellMap, roughness: 0.55 }), 0, -0.03, 0);
  shell.scale.set(1, 0.52, 1.22);
  body.add(shell);
  const belly = part(new THREE.SphereGeometry(0.48, 20, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#e8d79a', { roughness: 0.7 }), 0, -0.07, 0);
  belly.scale.set(1, 0.3, 1.18);
  body.add(belly);
  const skin = mat('#9fd47f', { roughness: 0.6 });
  const head = new THREE.Group();
  head.position.set(0, 0.06, 0.68);
  head.add(part(new THREE.SphereGeometry(0.2, 18, 14), skin));
  addFace(head, { y: 0.06, z: 0.172, apart: 0.085, eye: 0.04, cheek: 0.038, cheekY: -0.06, cheekX: 1.55, tilt: 0.7 });
  body.add(head);
  // Flippers: big front ones that row, and little back ones
  const flippers = [];
  for (const [s, front] of [[-1, true], [1, true], [-1, false], [1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * (front ? 0.42 : 0.3), -0.1, front ? 0.32 : -0.46);
    const fin = part(new THREE.SphereGeometry(front ? 0.2 : 0.12, 12, 8), skin, s * (front ? 0.2 : 0.1), 0, front ? -0.04 : -0.04);
    fin.scale.set(1.5, 0.28, front ? 0.6 : 0.7);
    pivot.add(fin);
    pivot.rotation.y = s * (front ? -0.5 : 0.6);
    body.add(pivot);
    flippers.push({ pivot, s, front });
  }
  const tail = part(new THREE.ConeGeometry(0.05, 0.16, 8), skin, 0, -0.08, -0.66);
  tail.rotation.x = -Math.PI / 2;
  body.add(tail);
  return { turtle, body, head, flippers };
}

function makeFish(color) {
  const fish = new THREE.Group();
  const scales = mat(color, { roughness: 0.35 });
  const body = part(new THREE.SphereGeometry(0.1, 14, 10), scales);
  body.scale.set(0.6, 1, 2.1);
  fish.add(body);
  const tail = part(new THREE.ConeGeometry(0.1, 0.16, 4), scales, 0, 0, -0.26);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(0.25, 1, 1);
  fish.add(tail);
  const fin = part(new THREE.ConeGeometry(0.05, 0.12, 4), scales, 0, 0.1, -0.02);
  fin.scale.set(0.25, 1, 1);
  fish.add(fin);
  for (const s of [-1, 1]) fish.add(part(new THREE.SphereGeometry(0.022, 8, 6), mat('#1c1420'), s * 0.05, 0.03, 0.13, false));
  fish.scale.setScalar(1.4);
  return { fish, tail };
}

/* ------------------------------------------------------------------ */
/* BUILDING IT                                                          */
/* ------------------------------------------------------------------ */
// `zone.terrain` must be ready (it's baked once the island has loaded)
export function makeLagoon(zone, addObstacle) {
  const t = zone.terrain;
  const water = (x, z) => t.waterAt(x, z);
  // Deep, open water inside the buoys, with room for something `r` across
  const openWater = (x, z, r) => {
    if (Math.hypot(x - zone.x - LAGOON.x, z - zone.z - LAGOON.z) > LAGOON.r - LAGOON_EDGE - r) return false;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const w = water(x + dx, z + dz);
      if (w === null || w - t.bedAt(x + dx, z + dz) < 1.2) return false;
    }
    return true;
  };

  /* The buoy line: round the rim, wherever that's out in the water */
  const spots = [];
  const count = Math.round((2 * Math.PI * LAGOON.r) / BUOY_GAP);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = zone.x + LAGOON.x + Math.cos(a) * LAGOON.r, z = zone.z + LAGOON.z + Math.sin(a) * LAGOON.r;
    const clear = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]].every(([dx, dz]) => {
      const w = water(x + dx, z + dz);
      return w !== null && w - t.bedAt(x + dx, z + dz) > 0.6;
    });
    spots.push(clear ? { x, z, big: i % 6 === 0, phase: Math.random() * 6.28 } : null);
  }
  const buoys = spots.filter(Boolean);
  const ropes = spots.map((s, i) => s && spots[(i + 1) % count] ? [s, spots[(i + 1) % count]] : null).filter(Boolean);
  const buoyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 16, 12), mat('#ffffff', { roughness: 0.35 }), buoys.length);
  buoys.forEach((b, i) => buoyMesh.setColorAt(i, new THREE.Color(b.big ? '#ffd23f' : i % 2 ? '#ff5d8f' : '#ffffff')));
  buoyMesh.castShadow = true;
  buoyMesh.frustumCulled = false; // it moves every frame; its bounds would go stale
  const ropeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2),
    mat('#f2e2bf', { roughness: 0.9 }), ropes.length);
  ropeMesh.frustumCulled = false;
  zone.group.add(buoyMesh, ropeMesh);

  /* The raft */
  const { raft, flag, pole } = makeRaft();
  const raftAt = { x: zone.x + RAFT.x, z: zone.z + RAFT.z, deck: 0 };
  const raftObs = addObstacle(raft, raftAt.x, raftAt.z, RAFT.r, zone.group);
  const poleObs = addObstacle(new THREE.Group(), raftAt.x, raftAt.z + RAFT.r - 0.3, 0.16, zone.group); // the flag's pole, on deck
  (zone.camFade ??= []).push({ object: pole, near: 1.6, far: 2.4, at: { x: raftAt.x, z: raftAt.z + RAFT.r - 0.3 } });

  /* The floaties */
  // `r`: how close you can come; `sit`: where it floats, from the surface; `nod`: a head that looks about
  const floaties = FLOATIES.map(({ kind, x, z }) => {
    let group, nod = null, roll = null, r, sit, sound;
    if (kind === 'donut') { group = makeDonut(); r = 0.95; sit = -0.03; sound = 'bonk'; }
    if (kind === 'duck') { const d = makeDuck(); group = d.duck; nod = d.head; r = 0.75; sit = -0.04; sound = 'squeak'; }
    if (kind === 'ball') { const b = makeBall(); group = b.holder; roll = b.ball; r = 0.45; sit = 0.26; sound = 'boing'; }
    zone.group.add(group);
    group.rotation.y = Math.random() * Math.PI * 2;
    return { kind, group, nod, roll, r, sit, sound, x: zone.x + x, z: zone.z + z, vx: 0, vz: 0, home: { x: zone.x + x, z: zone.z + z },
      turn: 0, cool: 0, wobble: 0, phase: Math.random() * 6.28 };
  });
  const roundThings = [{ x: raftAt.x, z: raftAt.z, r: RAFT.r }, ...floaties]; // what the floaties bounce off each other and the raft as

  /* The turtles */
  const turtles = TURTLES.map(({ x, z }) => {
    const parts = makeTurtle();
    const obs = addObstacle(parts.turtle, zone.x + x, zone.z + z, 0.7, zone.group);
    zone.camFade.push({ object: parts.turtle, near: 2.2, far: 2.9, at: parts.turtle });
    return { ...parts, obs, x: zone.x + x, z: zone.z + z, yaw: Math.random() * Math.PI * 2, state: 'rest', timer: rand(0.5, 3),
      target: null, greetIn: rand(0, 4), hop: 0, paddle: Math.random() * 6.28, speed: 0, stuck: 0, bob: Math.random() * 6.28 };
  });

  /* The fish */
  const fishes = FISH_COLORS.map((color) => {
    const f = makeFish(color);
    zone.group.add(f.fish);
    f.fish.position.set(zone.x + LAGOON.x, -3, zone.z + LAGOON.z); // waiting under the water (and its shaders get warmed up)
    return { ...f, wait: rand(...FISH_EVERY), leap: null };
  });

  /* ---------------------------------------------------------------- */
  /* EVERY FRAME (only while you're in Hawaii)                          */
  /* ---------------------------------------------------------------- */
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3(), rollAxis = new THREE.Vector3();
  const tiltOf = (x, z, w) => { // the water's slope there, for things to lean with
    const sx = (water(x + 0.4, z) ?? w) - (water(x - 0.4, z) ?? w), sz = (water(x, z + 0.4) ?? w) - (water(x, z - 0.4) ?? w);
    return [sx / 0.8, sz / 0.8];
  };

  function updateBuoys(time) {
    for (const [i, b] of buoys.entries()) {
      b.y = (water(b.x, b.z) ?? 0) + 0.06 + Math.sin(time * 1.7 + b.phase) * 0.025;
      scl.setScalar(b.big ? 1.45 : 1).y *= 0.85;
      buoyMesh.setMatrixAt(i, m4.compose(pos.set(b.x, b.y, b.z), q.identity(), scl));
    }
    for (const [i, [a, b]] of ropes.entries()) {
      dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      ropeMesh.setMatrixAt(i, m4.compose(pos.set(a.x, a.y - 0.02, a.z), q, scl.set(1, 1, len)));
    }
    buoyMesh.instanceMatrix.needsUpdate = true;
    ropeMesh.instanceMatrix.needsUpdate = true;
  }

  function updateRaft(time, play) {
    const w = water(raftAt.x, raftAt.z) ?? 0;
    raftAt.deck = w + RAFT.freeboard;
    raft.position.y = raftAt.deck;
    const [sx, sz] = tiltOf(raftAt.x, raftAt.z, w);
    raft.rotation.set(Math.atan(sz) * 0.5, 0, -Math.atan(sx) * 0.5);
    raftObs.top = raftAt.deck - STEP_UP; // a swimmer bumps into it; once you're up level with the deck you're on it
    raftObs.base = raftAt.deck - 4;
    poleObs.base = raftAt.deck;
    poleObs.top = raftAt.deck + 2;
    flag.rotation.y = Math.sin(time * 2.6) * 0.35 + Math.sin(time * 6.1) * 0.08;
    // Swimming into it, you climb up onto it
    if (play.swimming) {
      const dx = raftAt.x - play.pos.x, dz = raftAt.z - play.pos.z, d = Math.hypot(dx, dz);
      if (d < RAFT.r + 0.75 && (play.vel.x * dx + play.vel.z * dz) / d > 0.8) play.climb(raftAt.deck);
    }
  }

  function updateFloaties(dt, time, play) {
    // Bumped by you (down in the water, not up on the raft) or a turtle: pushed out of the way, and sent drifting off
    const bumpers = turtles.map((tu) => ({ x: tu.x, z: tu.z, r: 0.7, vx: Math.sin(tu.yaw) * tu.speed, vz: Math.cos(tu.yaw) * tu.speed }));
    if (play.pos.y < (water(play.pos.x, play.pos.z) ?? -Infinity) + 0.4) {
      bumpers.push({ x: play.pos.x, z: play.pos.z, r: 0.5, vx: play.vel.x, vz: play.vel.z, you: true });
    }
    for (const f of floaties) {
      f.cool -= dt;
      for (const b of bumpers) {
        const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz), min = f.r + b.r;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        f.x = b.x + nx * min;
        f.z = b.z + nz * min;
        const into = b.vx * nx + b.vz * nz;
        const push = Math.max(0.4, into * (b.you ? BOOP : 1.1));
        const vn = f.vx * nx + f.vz * nz;
        if (vn < push) { f.vx += (push - vn) * nx; f.vz += (push - vn) * nz; }
        // ...and slides off to one side, out of the way, rather than being shoved along ahead of you
        const speed = Math.hypot(b.vx, b.vz);
        if (b.you && speed > 0.3) {
          const px = -b.vz / speed, pz = b.vx / speed; // across the way you're going
          const side = Math.sign(nx * px + nz * pz) || (f.phase > Math.PI ? 1 : -1);
          const want = push * 0.6, across = (f.vx * px + f.vz * pz) * side;
          if (across < want) { f.vx += (want - across) * px * side; f.vz += (want - across) * pz * side; }
        }
        if (b.you && into > 0.8 && f.cool <= 0) {
          f.cool = BUMP_EVERY;
          f.turn += (Math.random() < 0.5 ? -1 : 1) * rand(0.8, 1.6); // set spinning
          f.wobble = 1;
          sfx(f.sound);
          play.effects.splash(f.x - nx * f.r, water(f.x, f.z) ?? 0, f.z - nz * f.r, 0.35);
        }
      }
      // Drifting: the water slows it down, and a gentle current takes it home
      f.vx += (f.home.x - f.x) * HOME_PULL * dt;
      f.vz += (f.home.z - f.z) * HOME_PULL * dt;
      const slow = Math.exp(-FLOAT_DRAG * dt);
      f.vx *= slow;
      f.vz *= slow;
      f.turn *= Math.exp(-1.2 * dt);
      let nx = f.x + f.vx * dt, nz = f.z + f.vz * dt;
      // ...and bounces back off the buoys, the rocks, the beach and the raft
      if (!openWater(nx, nz, f.r * 0.8)) {
        if (openWater(nx, f.z, f.r * 0.8)) { nz = f.z; f.vz *= -0.5; }
        else if (openWater(f.x, nz, f.r * 0.8)) { nx = f.x; f.vx *= -0.5; }
        else { nx = f.x; nz = f.z; f.vx *= -0.5; f.vz *= -0.5; }
      }
      for (const o of roundThings) {
        if (o === f) continue;
        const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = o.r + f.r;
        if (d < min && d > 1e-4) {
          nx = o.x + (dx / d) * min;
          nz = o.z + (dz / d) * min;
          const vn = f.vx * (dx / d) + f.vz * (dz / d);
          if (vn < 0) { f.vx -= 1.5 * vn * (dx / d); f.vz -= 1.5 * vn * (dz / d); }
        }
      }
      const moved = Math.hypot(nx - f.x, nz - f.z);
      f.x = nx;
      f.z = nz;
      // Riding the water, leaning with it, and wobbling after a bump
      const w = water(f.x, f.z) ?? f.group.position.y - f.sit;
      const [sx, sz] = tiltOf(f.x, f.z, w);
      f.wobble = Math.max(0, f.wobble - dt * 1.5);
      const wob = Math.sin(time * 14) * 0.18 * f.wobble;
      f.group.position.set(f.x, w + f.sit + Math.sin(time * 1.9 + f.phase) * 0.03, f.z);
      f.group.rotation.y += f.turn * dt;
      if (f.roll) { // the beach ball rolls along the water
        if (moved > 0) f.roll.rotateOnWorldAxis(rollAxis.set(f.vz, 0, -f.vx).normalize(), moved / f.r);
      } else {
        f.group.rotation.x = Math.atan(sz) * 0.8 + wob + Math.sin(time * 1.3 + f.phase) * 0.04;
        f.group.rotation.z = -Math.atan(sx) * 0.8 + wob * 0.6;
      }
      if (f.nod) f.nod.rotation.z = Math.sin(time * 1.1 + f.phase) * 0.08 + wob; // the duck looks about a bit
    }
  }

  // Somewhere else in the lagoon to paddle off to. With you close by, not past you
  function pickTurtleTarget(tu, you) {
    const toYou = Math.hypot(you.x - tu.x, you.z - tu.z);
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(0, LAGOON.r - 3);
      const x = zone.x + LAGOON.x + Math.cos(a) * d, z = zone.z + LAGOON.z + Math.sin(a) * d;
      const away = Math.hypot(x - tu.x, z - tu.z);
      if (away < 4 || Math.hypot(x - raftAt.x, z - raftAt.z) < RAFT.r + 2.5) continue;
      if (toYou < 4 && ((x - tu.x) * (you.x - tu.x) + (z - tu.z) * (you.z - tu.z)) / (away * toYou) > 0.2) continue;
      if (openWater(x, z, 1.2)) return { x, z };
    }
    return null;
  }

  function updateTurtles(dt, time, play) {
    for (const tu of turtles) {
      tu.greetIn -= dt;
      const toYou = Math.hypot(play.pos.x - tu.x, play.pos.z - tu.z);
      const w = water(tu.x, tu.z) ?? 0;
      // Oh, hello! You've swum up close: it turns to you, with a heart and a happy hop
      if (tu.greetIn <= 0 && toYou < GREET_RANGE && Math.abs(play.pos.y - w) < 2.5 && tu.state !== 'greet') {
        tu.state = 'greet';
        tu.timer = 1.1;
        tu.hop = 0;
        tu.greetIn = GREET_EVERY * rand(0.8, 1.2);
        play.effects.heart(tu.x, w + 0.9, tu.z, 0.42);
        sfx('greet', 1.35);
      }
      let want = 0; // how fast it wants to go
      if (tu.state === 'greet') {
        const diff = Math.atan2(play.pos.x - tu.x, play.pos.z - tu.z) - tu.yaw;
        tu.yaw += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, dt * 5);
        tu.hop += dt * 9;
        if ((tu.timer -= dt) <= 0) { tu.state = 'rest'; tu.timer = rand(1, 2.5); }
      } else if (tu.state === 'rest') {
        if ((tu.timer -= dt) <= 0) {
          tu.target = pickTurtleTarget(tu, play.pos);
          tu.state = tu.target ? 'swim' : 'rest';
          tu.timer = rand(1, 3);
        }
      } else {
        const dx = tu.target.x - tu.x, dz = tu.target.z - tu.z, d = Math.hypot(dx, dz);
        const diff = Math.atan2(dx, dz) - tu.yaw;
        const turn = Math.atan2(Math.sin(diff), Math.cos(diff));
        tu.yaw += Math.max(-1, Math.min(1, turn)) * TURTLE_TURN * dt;
        want = TURTLE_SPEED * Math.max(0.25, Math.cos(turn)); // slows down to turn
        if (d < 0.8) { tu.state = 'rest'; tu.timer = rand(2, 5); }
      }
      tu.speed += (want - tu.speed) * Math.min(1, dt * 2);
      const nx = tu.x + Math.sin(tu.yaw) * tu.speed * dt, nz = tu.z + Math.cos(tu.yaw) * tu.speed * dt;
      // In the way: the raft, rocks or the beach (find somewhere else to go), or you (turn
      // on the spot until it's clear, or after a moment, find somewhere else)
      const toYouNext = Math.hypot(nx - play.pos.x, nz - play.pos.z);
      const blocked = Math.hypot(nx - raftAt.x, nz - raftAt.z) < RAFT.r + 1 || !openWater(nx, nz, 0.8);
      const intoYou = toYouNext < 1.25 && toYouNext < toYou;
      if (tu.speed > 0.01 && (blocked || intoYou)) {
        tu.speed = 0;
        tu.stuck += dt;
        if (tu.state === 'swim' && (blocked || tu.stuck > 1.5)) { tu.state = 'rest'; tu.timer = rand(0.5, 1.5); tu.stuck = 0; }
      } else {
        tu.x = nx;
        tu.z = nz;
        tu.stuck = 0;
      }
      // Paddling: big slow strokes going along, little ones sitting still
      tu.paddle += dt * (1.8 + tu.speed * 4.5);
      for (const { pivot, s, front } of tu.flippers) {
        const stroke = Math.sin(tu.paddle + (front ? 0 : Math.PI));
        pivot.rotation.z = s * (front ? 0.35 : 0.2) * stroke;
        pivot.rotation.y = s * ((front ? -0.5 : 0.6) + (front ? 0.45 : 0.25) * Math.cos(tu.paddle + (front ? 0 : Math.PI)));
      }
      const [sx, sz] = tiltOf(tu.x, tu.z, w);
      const hop = tu.state === 'greet' ? Math.abs(Math.sin(tu.hop)) * 0.16 : 0;
      tu.turtle.position.set(tu.x, w + Math.sin(time * 1.6 + tu.bob) * 0.025 + hop, tu.z);
      tu.turtle.rotation.y = tu.yaw;
      tu.body.rotation.x = Math.atan(sz * Math.cos(tu.yaw) + sx * Math.sin(tu.yaw)) * -0.6;
      tu.head.rotation.y = Math.sin(time * 0.7 + tu.bob) * 0.25;
      tu.obs.x = tu.x;
      tu.obs.z = tu.z;
    }
  }

  function updateFish(dt, play) {
    for (const f of fishes) {
      if (!f.leap) {
        if ((f.wait -= dt) > 0) continue;
        f.wait = rand(0.5, 1.5); // try again soon if there's nowhere near you to hop
        for (let i = 0; i < 8 && !f.leap; i++) {
          const a = Math.random() * Math.PI * 2, d = rand(...FISH_NEAR);
          const ax = play.pos.x + Math.cos(a) * d, az = play.pos.z + Math.sin(a) * d;
          const heading = Math.random() * Math.PI * 2, len = rand(1.5, 2.3);
          const bx = ax + Math.sin(heading) * len, bz = az + Math.cos(heading) * len;
          if (!openWater(ax, az, 0.5) || !openWater(bx, bz, 0.5)) continue;
          if (Math.hypot(ax - raftAt.x, az - raftAt.z) < RAFT.r + 1.2 || Math.hypot(bx - raftAt.x, bz - raftAt.z) < RAFT.r + 1.2) continue;
          f.leap = { ax, az, bx, bz, heading, h: rand(0.7, 1.1), t: 0, dur: rand(0.6, 0.8) };
          splash(ax, az, d);
        }
        continue;
      }
      const L = f.leap;
      L.t += dt;
      const s = Math.min(1, L.t / L.dur);
      const x = L.ax + (L.bx - L.ax) * s, z = L.az + (L.bz - L.az) * s;
      const w = water(x, z) ?? 0;
      f.fish.position.set(x, w - 0.12 + 4 * L.h * s * (1 - s), z);
      f.fish.rotation.set(-Math.atan2(4 * L.h * (1 - 2 * s), Math.hypot(L.bx - L.ax, L.bz - L.az)), L.heading, 0, 'YXZ');
      f.tail.rotation.y = Math.sin(L.t * 32) * 0.5;
      if (s >= 1) {
        splash(L.bx, L.bz, Math.hypot(play.pos.x - L.bx, play.pos.z - L.bz));
        f.fish.position.y = w - 3;
        f.leap = null;
        f.wait = rand(...FISH_EVERY);
      }
    }
    function splash(x, z, away) {
      const w = water(x, z) ?? 0;
      play.effects.splash(x, w, z, 0.3);
      play.effects.ripple(x, w, z, 1.2, { surface: water, opacity: 0.5, life: 0.9 });
      sfx('plop', Math.max(0.2, 1 - away / 14));
    }
  }

  return {
    update(dt, play) {
      const time = performance.now() / 1000;
      updateBuoys(time);
      updateRaft(time, play);
      updateFloaties(dt, time, play);
      updateTurtles(dt, time, play);
      updateFish(dt, play);
    },
    // The raft's deck, if (lx, lz) (zone-local) is on it and it's no higher than y
    deckAt(lx, y, lz) {
      const on = Math.hypot(lx - RAFT.x, lz - RAFT.z) <= RAFT.r + FOOT;
      return on && raftAt.deck <= y ? raftAt.deck : -Infinity;
    },
    onRaft: (lx, lz) => Math.hypot(lx - RAFT.x, lz - RAFT.z) <= RAFT.r + FOOT,
  };
}
