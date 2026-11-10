import * as THREE from 'three';
import { DISPLAY_FONT, canvasTexture, plateTexture, slabTexture, softDisc, heartShape, seeded, lightPool, mat, glow, box, cyl, flat } from './kit.js';
import { skyDome, hills } from './sky.js';
import { grassTufts } from './grass.js';
import { sfx } from './audio.js';

/* ------------------------------------------------------------------ */
/* CELEBRATION: a party at dusk, through the portal at the end of the  */
/* farm's corn maze. You arrive in the west and walk under the banner  */
/* to a glowing dance floor beneath string lights; past it stand the   */
/* cake and a big heart. A hedge with fairy lights rings the lawn, and */
/* fireworks go off all round the horizon. Every number below is local */
/* to the zone center.                                                  */
/* ------------------------------------------------------------------ */
const PARTY = ['#ff5d8f', '#ffb84d', '#ffe066', '#7bdff2', '#b388ff', '#7ee081'];
const HORIZON = 0xb05a6e;                  // dusky rose: the sky's glow along the horizon, and the fog
const HEDGE_R = 23.8;                      // just past where the player stops (ZONE_RADIUS - 1)
const FLOOR_R = 5.5;                       // the dance floor
const POLES = 8, POLE_R = 8.5, POLE_H = 6; // the ring of string-light poles round the floor: the strands hang above the camera
const GLOW = 2.2;                          // how bright the bulbs are (see kit.js's glow)
const LAWN_COLORS = ['#4d7d45', '#5a8a4e', '#42703c', '#68985a'];
// Set going by the finale (reading the party's sign): more fireworks, confetti poppers
const show = { finale: false, nextPop: 0, pop: () => {} };
const BANNER_X = -9;
const CAKE = { x: 9, z: 0 };
const HEART = { x: 15, z: 0 };

export const CELEBRATION = {
  title: 'The Celebration',
  sky: HORIZON,
  // Twilight: a lilac sky light and a low rosy sun (main.js has the daytime defaults)
  light: { sky: 0xb0a0ff, ground: 0x4f4058, hemi: 1.25, sun: 0xffa97c, sunIntensity: 1.2 },
  sunOffset: [-30, 16, 12],
  look: { bloom: 0.42, vignette: 0.24, saturation: 1.06, env: 0.35 },
  fog: [34, 110],
  // A bouncy party tune (audio.js)
  sound: 'party',
  // What you're walking on (local coords). The dance floor plays a note with each step
  surfaceAt: (x, z) => (Math.hypot(x, z) < FLOOR_R ? 'tiles' : x < -FLOOR_R && x > -19.5 && Math.abs(z) < 1.1 ? 'stone' : 'grass'),
  dust: '#7f9a6c',
  // Reading the sign sets all this off, while main.js gathers everyone round
  finale: {
    start() {
      show.finale = true;
      show.nextPop = 0;
    },
    stop() { show.finale = false; },
  },
  portalSpots: {
    Farm: { x: -19, z: 0 }, // you arrive facing east, looking under the banner at the party
  },
  // The "press E" sign (text in messages.js): beside the cake
  signSpot: { x: CAKE.x - 1, z: 2.6, face: { x: 0, z: 2.6 } },
  // Everyone came: characters from K-Town, the gym and Hawaii...
  npcSpots: [
    { npc: 'bananaCat', x: -3,  z: -3  },
    { npc: 'star',      x: 3,   z: 2   },
    { npc: 'rabbit',    x: -2,  z: 4   },
    { npc: 'bear',      x: 5,   z: -6  },
    { npc: 'chick',     x: -12, z: 6   },
    { npc: 'squid',     x: -6,  z: 10  },
    { npc: 'shark',     x: 4,   z: 11  },
    { npc: 'mascot', part: 0, x: -10, z: -9 },
    { npc: 'doge',      x: 12,  z: -7  },
    { npc: 'hamster',   x: 12,  z: 7   },
  ],
  // ...and some of the farm's animals
  petSpots: [
    { pet: 'cat',     x: -5,  z: -12 },
    { pet: 'dog',     x: 8,   z: 14  },
    { pet: 'bunny',   x: -14, z: -7  },
    { pet: 'pig',     x: 16,  z: -11 },
    { pet: 'fox',     x: -9,  z: 16  },
    { pet: 'penguin', x: 2,   z: -15 },
  ],
  build: buildCelebration,
};

/* ------------------------------------------------------------------ */
/* SKY AND GROUND                                                       */
/* ------------------------------------------------------------------ */
// A dome fading from the rosy horizon up to night, dark hills against it, and a few stars out
function makeSky() {
  const sky = new THREE.Group();
  sky.add(skyDome(0, 0, { horizon: HORIZON, mid: '#5a3a78', top: '#1a1942' }), hills(0, 0, '#3f2a4a', '#6a3f5e'));

  // Stars, thicker toward the horizon where the camera actually looks
  const stars = [];
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.08 + Math.random() ** 2 * 0.9, r = Math.sqrt(1 - y * y);
    stars.push(Math.cos(a) * r * 140, y * 140, Math.sin(a) * r * 140);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  sky.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff6e8', size: 2, sizeAttenuation: false, fog: false })));
  return sky;
}

// Lawn at dusk: deep green with lighter blades
function lawnTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3f6b3a';
    ctx.fillRect(0, 0, w, h);
    const blades = ['#4d7d45', '#355e33', '#5a8a4e', '#2f5530'];
    for (let i = 0; i < 2500; i++) {
      ctx.strokeStyle = blades[i % blades.length];
      ctx.lineWidth = 1.5;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.random() * 4 - 2, y - 3 - Math.random() * 5); ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A ring of round bushes all the way round, sprinkled with warm fairy lights
function addHedge(party) {
  const n = Math.round((2 * Math.PI * HEDGE_R) / 0.9);
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.8, 1), mat('#ffffff', { roughness: 0.95, flatShading: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = HEDGE_R + (Math.random() - 0.5) * 0.3;
    q.setFromAxisAngle(up, Math.random() * Math.PI);
    s.set(0.8 + Math.random() * 0.3, 0.75 + Math.random() * 0.35, 0.8 + Math.random() * 0.3);
    bushes.setMatrixAt(i, m.compose(p.set(Math.cos(a) * r, 0.55, Math.sin(a) * r), q, s));
    bushes.setColorAt(i, color.setHSL(0.33 + Math.random() * 0.05, 0.4, 0.2 + Math.random() * 0.07));
  }
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  party.add(bushes);

  const LIGHTS = 280;
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), glow('#ffe2a8', GLOW), LIGHTS);
  for (let i = 0; i < LIGHTS; i++) {
    const a = Math.random() * Math.PI * 2, round = Math.random() * Math.PI; // where on the bush's cross-section
    const r = HEDGE_R + Math.cos(round) * 0.75;
    lights.setMatrixAt(i, m.makeTranslation(Math.cos(a) * r, 0.55 + Math.sin(round) * 0.7, Math.sin(a) * r));
  }
  party.add(lights);
}

/* ------------------------------------------------------------------ */
/* DANCE FLOOR AND STRING LIGHTS                                        */
/* ------------------------------------------------------------------ */
// Glowing tiles on a dark disc with a gold rim; colors ripple out from the
// middle and the pattern steps along on every beat
function addDanceFloor(party) {
  const TILE = 1.1;
  const tiles = [];
  for (let i = -5; i <= 5; i++) {
    for (let j = -5; j <= 5; j++) {
      if (Math.hypot(Math.abs(i * TILE) + TILE / 2, Math.abs(j * TILE) + TILE / 2) <= FLOOR_R) tiles.push([i, j]);
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(TILE - 0.08, TILE - 0.08).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.1) }), // bright, but not enough to bloom away its colors
    tiles.length
  );
  const m = new THREE.Matrix4(), color = new THREE.Color();
  tiles.forEach(([i, j], k) => {
    mesh.setMatrixAt(k, m.makeTranslation(i * TILE, 0.03, j * TILE));
    mesh.setColorAt(k, color.set(PARTY[0]));
  });
  mesh.onBeforeRender = () => { // only ticks while the party is shown
    const t = performance.now() / 1000, beat = Math.floor(t * (show.finale ? 4 : 2));
    tiles.forEach(([i, j], k) => {
      const glowAmount = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 4 - Math.hypot(i, j) * 1.3));
      mesh.setColorAt(k, color.set(PARTY[(Math.abs(i) + Math.abs(j) + beat) % PARTY.length]).multiplyScalar(glowAmount));
    });
    mesh.instanceColor.needsUpdate = true;
  };
  party.add(mesh);

  const base = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 48).rotateX(-Math.PI / 2), mat('#231c2e', { roughness: 0.6 }));
  base.position.y = 0.02;
  base.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(FLOOR_R, 0.1, 8, 64).rotateX(Math.PI / 2), mat('#d9b25a', { metalness: 0.6, roughness: 0.35 }));
  rim.position.y = 0.04;
  party.add(base, rim);
}

// Poles round the floor with balloons on top, strands of twinkling bulbs
// from pole to pole and across the floor between opposite poles
function addStringLights(party, prop, zone) {
  const tops = [];
  for (let k = 0; k < POLES; k++) {
    const a = ((k + 0.5) / POLES) * Math.PI * 2; // half a step round, so none stand on the walk in
    const x = Math.cos(a) * POLE_R, z = Math.sin(a) * POLE_R;
    const pole = new THREE.Group();
    pole.add(cyl(0.07, POLE_H, mat('#4a3a33'), 0, POLE_H / 2, 0, 8));
    const balloons = makeBalloons([PARTY[k % 6], PARTY[(k + 2) % 6], PARTY[(k + 4) % 6]], 1.1);
    balloons.position.y = POLE_H;
    pole.add(balloons);
    prop(pole, x, z, 0.25);
    (zone.camFade ??= []).push({ object: pole, near: 1.3, far: 2, at: { x: zone.x + x, z: zone.z + z } });
    tops.push(new THREE.Vector3(x, POLE_H - 0.15, z));
  }
  const strands = tops.map((a, k) => [a, tops[(k + 1) % POLES], 0.5]); // [from, to, sag]
  for (let k = 0; k < POLES / 2; k++) strands.push([tops[k], tops[k + POLES / 2], 0.8]);

  const bulbs = [];
  const wire = new THREE.LineBasicMaterial({ color: '#2b2430' });
  for (const [a, b, sag] of strands) {
    const n = Math.round(a.distanceTo(b) / 0.55), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
      if (i > 0 && i < n) bulbs.push(p);
    }
    party.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
  }
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), glow('#ffffff', GLOW), bulbs.length);
  const m = new THREE.Matrix4(), color = new THREE.Color();
  bulbs.forEach((p, i) => {
    mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    mesh.setColorAt(i, color.set(PARTY[i % PARTY.length]));
  });
  mesh.onBeforeRender = () => {
    const t = performance.now() / 1000;
    bulbs.forEach((_, i) => mesh.setColorAt(i, color.set(PARTY[i % PARTY.length]).multiplyScalar(0.55 + 0.45 * Math.sin(t * 2 + i * 1.7))));
    mesh.instanceColor.needsUpdate = true;
  };
  party.add(mesh);
}

/* ------------------------------------------------------------------ */
/* PROPS                                                                */
/* ------------------------------------------------------------------ */
const BALLOON_GEO = new THREE.SphereGeometry(0.26, 16, 12).scale(1, 1.18, 1);
const KNOT_GEO = new THREE.ConeGeometry(0.05, 0.08, 8).translate(0, -0.33, 0);
const STRING_MAT = new THREE.LineBasicMaterial({ color: '#f4efe6' });

// A bunch of balloons on strings, tied at the group's origin, swaying in the
// breeze. The farm puts a couple at the end of the corn maze, too.
export function makeBalloons(colors, height = 1.6) {
  const bunch = new THREE.Group();
  const tie = new THREE.Vector3();
  colors.forEach((color, i) => {
    const a = (i / colors.length) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * 0.3, height + (i % 2) * 0.3, Math.sin(a) * 0.3);
    const material = mat(color, { roughness: 0.3, emissive: color, emissiveIntensity: 0.3 });
    const balloon = new THREE.Mesh(BALLOON_GEO, material);
    const knot = new THREE.Mesh(KNOT_GEO, material);
    balloon.position.copy(top);
    knot.position.copy(top);
    balloon.castShadow = true;
    const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tie, top.clone().setY(top.y - 0.37)]), STRING_MAT);
    bunch.add(balloon, knot, string);
  });
  const phase = Math.random() * 10;
  bunch.children[0].onBeforeRender = () => { // only ticks while it's on screen
    const t = performance.now() / 1000 + phase;
    bunch.rotation.set(Math.sin(t * 0.9) * 0.06, 0, Math.cos(t * 0.7) * 0.06);
  };
  return bunch;
}

const FLAG_GEO = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.17, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.34)]));

// The welcome banner over the walk in from the portal, with bunting under it; it faces +Z
function makeBanner() {
  const g = new THREE.Group();
  const wood = mat('#4a3a33');
  for (const s of [-1, 1]) g.add(cyl(0.09, 4.4, wood, s * 3.2, 2.2, 0, 8));
  const tex = plateTexture('Happy Anniversary!', '#fff3f6', '#e8456b', `600 66px ${DISPLAY_FONT}`);
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 1.3),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.8 })
  );
  text.position.set(0, 3.6, 0.05);
  g.add(box(5.7, 1.4, 0.08, mat('#e8456b'), 0, 3.6, 0), text);

  const flags = 13, pts = [];
  for (let i = 0; i <= flags; i++) {
    const t = i / flags;
    pts.push(new THREE.Vector3(-3.1 + 6.2 * t, 2.75 - 1.4 * t * (1 - t), 0));
    if (i === flags) break;
    const u = (i + 0.5) / flags;
    const flag = new THREE.Mesh(FLAG_GEO, mat(PARTY[i % PARTY.length], { side: THREE.DoubleSide }));
    flag.position.set(-3.1 + 6.2 * u, 2.75 - 1.4 * u * (1 - u), 0);
    g.add(flag);
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), STRING_MAT));
  return g;
}

// A round table in a white cloth, with a three-tier cake and flickering candles
function makeCakeTable() {
  const g = new THREE.Group();
  g.add(cyl(1.0, 0.9, mat('#fbeff2'), 0, 0.45, 0, 32));
  g.add(cyl(1.06, 0.06, mat('#ffd6e2'), 0, 0.9, 0, 32));
  let y = 0.93;
  for (const [r, h, c] of [[0.55, 0.34, '#fff4f7'], [0.42, 0.3, '#ffc2d4'], [0.3, 0.26, '#fff4f7']]) {
    g.add(cyl(r, h, mat(c, { roughness: 0.6 }), 0, y + h / 2, 0, 32));
    const trim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 32).rotateX(Math.PI / 2), mat('#ff8fb1'));
    trim.position.y = y + h;
    g.add(trim);
    y += h;
  }
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 0.18, z = Math.sin(a) * 0.18;
    g.add(cyl(0.02, 0.16, mat(PARTY[i]), x, y + 0.08, z, 6));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), glow('#ffd36b', GLOW));
    flame.position.set(x, y + 0.21, z);
    flames.push(flame);
    g.add(flame);
  }
  flames[0].onBeforeRender = () => {
    const t = performance.now() / 1000;
    flames.forEach((f, i) => f.scale.set(1, 0.8 + 0.4 * Math.abs(Math.sin(t * 9 + i * 2.3)), 1));
  };
  return g;
}

// A wrapped present with a ribbon and a bow
function makeGift(size, color, ribbon) {
  const g = new THREE.Group();
  const h = size * 0.8;
  g.add(box(size, h, size, mat(color, { roughness: 0.5 }), 0, h / 2, 0));
  g.add(box(size * 1.02, h * 1.02, size * 0.16, mat(ribbon), 0, h / 2, 0, false));
  g.add(box(size * 0.16, h * 1.02, size * 1.02, mat(ribbon), 0, h / 2, 0, false));
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(size * 0.12, size * 0.04, 6, 12), mat(ribbon));
    loop.position.set(s * size * 0.12, h + size * 0.08, 0);
    loop.rotation.z = s * 0.5;
    g.add(loop);
  }
  return g;
}

// A big glowing heart standing in a flower planter, ringed with chasing bulbs; it faces +Z
function makeHeart() {
  const g = new THREE.Group();
  g.add(cyl(0.9, 0.5, mat('#f4ece4'), 0, 0.25, 0, 24));
  g.add(cyl(0.85, 0.08, mat('#3d6b3f'), 0, 0.52, 0, 24));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = 0.25 + (i % 3) * 0.2;
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(PARTY[i % PARTY.length]));
    flower.position.set(Math.cos(a) * r, 0.6, Math.sin(a) * r);
    g.add(flower);
  }

  const DEPTH = 0.35;
  const shape = heartShape(4);
  const heart = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 24 })
      .translate(0, 0, -DEPTH / 2),
    new THREE.MeshStandardMaterial({ color: '#ff4f8b', emissive: '#ff2a6d', emissiveIntensity: 0.8, roughness: 0.35 })
  );
  heart.position.y = 0.55;
  heart.castShadow = true;
  g.add(heart);

  const outline = shape.getSpacedPoints(44).slice(0, -1); // the last point repeats the first
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), glow('#ffffff', GLOW), outline.length);
  const m = new THREE.Matrix4(), color = new THREE.Color();
  outline.forEach((p, i) => {
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y + 0.55, DEPTH / 2 + 0.1));
    bulbs.setColorAt(i, color.set('#fff1c9'));
  });
  bulbs.onBeforeRender = () => { // light chasing round the edge
    const t = performance.now() / 1000;
    outline.forEach((_, i) => bulbs.setColorAt(i, color.set('#fff1c9').multiplyScalar(0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.6)))));
    bulbs.instanceColor.needsUpdate = true;
  };
  g.add(bulbs);
  return g;
}

/* ------------------------------------------------------------------ */
/* CONFETTI AND FIREWORKS                                               */
/* ------------------------------------------------------------------ */
function addConfetti(party) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const piece = new THREE.PlaneGeometry(0.1, 0.06);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();

  // Some already scattered on the lawn round the floor...
  const LYING = 400;
  const lying = new THREE.InstancedMesh(piece.clone().rotateX(-Math.PI / 2), material, LYING);
  for (let i = 0; i < LYING; i++) {
    const a = Math.random() * Math.PI * 2, d = FLOOR_R + 0.3 + Math.random() * 7;
    q.setFromAxisAngle(up, Math.random() * Math.PI);
    lying.setMatrixAt(i, m.compose(p.set(Math.cos(a) * d, 0.012 + Math.random() * 0.01, Math.sin(a) * d), q, one));
    lying.setColorAt(i, color.set(PARTY[i % PARTY.length]).multiplyScalar(0.7));
  }
  party.add(lying);

  // ...and more fluttering down over the dance floor
  const FALLING = 240;
  const falling = new THREE.InstancedMesh(piece, material, FALLING);
  falling.frustumCulled = false; // they move every frame, so the precomputed bounds are useless
  const bits = [];
  for (let i = 0; i < FALLING; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 8;
    bits.push({
      x: Math.cos(a) * d, z: Math.sin(a) * d,
      top: 5 + Math.random() * 3,
      speed: 0.5 + Math.random() * 0.5,
      sway: 0.2 + Math.random() * 0.5,
      phase: Math.random() * 100,
    });
    falling.setColorAt(i, color.set(PARTY[i % PARTY.length]));
  }
  falling.onBeforeRender = () => {
    const t = performance.now() / 1000;
    bits.forEach((b, i) => {
      const y = b.top - ((t * b.speed + b.phase) % b.top); // falls, lands, starts again up top
      p.set(b.x + Math.sin(t * 1.7 + b.phase) * b.sway, y, b.z + Math.cos(t * 1.3 + b.phase) * b.sway);
      q.setFromEuler(e.set(t * 4 + b.phase, t * 3 + b.phase, 0));
      falling.setMatrixAt(i, m.compose(p, q, one));
    });
    falling.instanceMatrix.needsUpdate = true;
  };
  party.add(falling);

  // Poppers for the finale: a burst of confetti from either side of the dance
  // floor that shoots up, slows, and flutters down. Pieces rest at no size until they're needed.
  const POPPED = 420, POPPERS = [[-4.5, 2.5], [4.5, -2.5], [-2, -5], [2, 5]];
  const popped = new THREE.InstancedMesh(piece, material, POPPED);
  popped.frustumCulled = false;
  const flying = [];
  const none = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < POPPED; i++) {
    popped.setMatrixAt(i, m.compose(p.set(0, 0, 0), q.identity(), none));
    popped.setColorAt(i, color.set(PARTY[i % PARTY.length]));
    flying.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: Math.random() * 100 });
  }
  let next = 0;
  show.pop = () => {
    sfx('pop');
    for (const [x, z] of POPPERS) {
      for (let k = 0; k < POPPED / POPPERS.length; k++) {
        const b = flying[next];
        next = (next + 1) % POPPED;
        const a = Math.random() * Math.PI * 2, out = Math.random() * 3.2;
        Object.assign(b, { life: 3.5 + Math.random() * 2, x, y: 0.3, z, vx: Math.cos(a) * out, vy: 7 + Math.random() * 6, vz: Math.sin(a) * out });
      }
    }
  };
  let last = performance.now() / 1000;
  popped.onBeforeRender = () => {
    const t = performance.now() / 1000, dt = Math.min(0.05, t - last);
    last = t;
    if (show.finale && t > show.nextPop) {
      show.pop();
      show.nextPop = t + 4.5;
    }
    flying.forEach((b, i) => {
      if (b.life <= 0) return;
      b.life -= dt;
      const drag = Math.max(0, 1 - 2.6 * dt);
      b.vx *= drag;
      b.vz *= drag;
      b.vy = b.vy * drag - 1.6 * dt;
      b.x += (b.vx + Math.sin(t * 2 + b.spin) * 0.4) * dt;
      b.y = Math.max(0.03, b.y + b.vy * dt);
      b.z += (b.vz + Math.cos(t * 1.6 + b.spin) * 0.4) * dt;
      q.setFromEuler(e.set(t * 4 + b.spin, t * 3 + b.spin, 0));
      popped.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, b.life > 0 ? one : none));
    });
    popped.instanceMatrix.needsUpdate = true;
  };
  party.add(popped);
}

// Rockets climb, then burst into a ball of sparks that slows, droops and
// fades. They go off far out and low, in the strip of sky above the horizon
// that the camera (which looks down at you) actually sees. For the finale,
// more go off, closer and higher, and some burst into hearts.
function addFireworks(party) {
  const BURSTS = 16, CALM_BURSTS = 8, SPARKS = 80, RISE = 0.8, LIFE = 2.4;
  const n = BURSTS * SPARKS;
  const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.4, map: softDisc(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  points.frustumCulled = false;

  const dirs = Array.from({ length: n }, () => new THREE.Vector3().randomDirection().multiplyScalar(0.75 + Math.random() * 0.25));
  // Where each spark ends up in a heart burst: a heart curve, flat, spread evenly round it
  const heart = Array.from({ length: SPARKS }, (_, s) => {
    const a = (s / SPARKS) * Math.PI * 2;
    return { x: Math.sin(a) ** 3, y: (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16 };
  });
  const launch = (b, at) => {
    const a = Math.random() * Math.PI * 2, d = show.finale ? 38 + Math.random() * 24 : 60 + Math.random() * 20;
    b.x = Math.cos(a) * d;
    b.z = Math.sin(a) * d;
    b.y = show.finale ? 15 + Math.random() * 14 : 8 + Math.random() * 4;
    b.size = show.finale ? 9 + Math.random() * 4 : 7 + Math.random() * 2;
    b.color = new THREE.Color(PARTY[Math.floor(Math.random() * PARTY.length)]);
    b.start = at + Math.random() * (show.finale ? 0.8 : 1.5);
    b.boomed = false;
    b.heart = show.finale && Math.random() < 0.4;
    b.sideX = -Math.sin(a); // a heart lies flat along this, facing the party
    b.sideZ = Math.cos(a);
    // Not every burst needs a thump, or they'd drum over the music
    b.loud = (show.finale ? 0.5 : Math.random() < 0.35 ? 0.35 : 0) * (50 / d);
    return b;
  };
  const now = performance.now() / 1000;
  // The extra bursts wait, parked and dark, until the finale wants them
  const bursts = Array.from({ length: BURSTS }, (_, k) => (k < CALM_BURSTS ? launch({}, now + k * 0.5) : { start: Infinity, x: 0, y: 0, z: 0, color: new THREE.Color() }));

  const color = new THREE.Color();
  points.onBeforeRender = () => {
    const t = performance.now() / 1000, active = show.finale ? BURSTS : CALM_BURSTS;
    bursts.forEach((b, k) => {
      if (t - b.start > RISE + LIFE) {
        if (k < active) launch(b, t);
        else b.start = Infinity;
      } else if (b.start === Infinity && k < active) {
        launch(b, t);
      }
      const age = t - b.start;
      if (age >= RISE && !b.boomed) {
        b.boomed = true;
        if (b.loud) sfx('boom', Math.min(1, b.loud), Math.max(-0.9, Math.min(0.9, b.x / 60)));
      }
      for (let s = 0; s < SPARKS; s++) {
        const i = k * SPARKS + s;
        if (age < RISE) { // waiting, or the rocket climbing (just one spark)
          const h = Math.max(0, age) / RISE;
          pos.setXYZ(i, b.x, b.y - 10 * (1 - h) * (1 - h), b.z);
          col.setXYZ(i, age >= 0 && s === 0 ? 1 : 0, age >= 0 && s === 0 ? 0.85 : 0, age >= 0 && s === 0 ? 0.6 : 0);
          continue;
        }
        const e = age - RISE, r = b.size * (1 - Math.exp(-e * 3)), d = dirs[i];
        if (b.heart) {
          const h = heart[s];
          pos.setXYZ(i, b.x + b.sideX * h.x * r, b.y + h.y * r - 0.6 * e * e, b.z + b.sideZ * h.x * r);
        } else {
          pos.setXYZ(i, b.x + d.x * r, b.y + d.y * r - 0.6 * e * e, b.z + d.z * r);
        }
        const fade = 2 * Math.max(0, 1 - e / LIFE) ** 2 * (0.7 + 0.3 * Math.sin(e * 30 + s)); // starts bright enough to bloom
        color.copy(b.color).multiplyScalar(fade);
        col.setXYZ(i, color.r, color.g, color.b);
      }
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };
  party.add(points);
}

/* ------------------------------------------------------------------ */
/* BUILD THE ZONE                                                       */
/* ------------------------------------------------------------------ */
function buildCelebration(zone, addObstacle) {
  const party = new THREE.Group();
  party.position.set(zone.x, 0, zone.z);
  zone.group.add(party);
  // props the player and guests bump into, in local coords
  const prop = (obj, x, z, r) => addObstacle(obj, zone.x + x, zone.z + z, r, zone.group);
  const rand = seeded(2024);

  party.add(makeSky());
  const lawn = lawnTexture();
  lawn.repeat.set(64, 64);
  party.add(flat(320, 320, new THREE.MeshStandardMaterial({ map: lawn, roughness: 1 }), 0, 0, 0));
  party.add(grassTufts({
    count: 2200, radius: HEDGE_R - 0.8, colors: LAWN_COLORS, rand,
    allowed: (x, z) => Math.hypot(x, z) > FLOOR_R + 0.4 && !(x < 0 && Math.abs(z) < 1.5)
      && Math.hypot(x - CAKE.x, z - CAKE.z) > 1.4 && Math.hypot(x - HEART.x, z - HEART.z) > 1.3,
  }));
  // Flagstones from the portal to the dance floor
  const stone = slabTexture('#cbbba6', '#a8977f', 64);
  stone.repeat.set(14 / 2.2, 1);
  party.add(flat(14, 2.2, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9 }), -12.5, 0, 0.008));

  addHedge(party);
  addDanceFloor(party);
  addStringLights(party, prop, zone);
  // The party lights itself: warm light from the strings, and a glow on the lawn from the floor
  const warm = new THREE.PointLight('#ffd2a6', 42, 30, 1.6);
  warm.position.set(0, 5.6, 0);
  const cakeLight = new THREE.PointLight('#ffc18a', 26, 14, 1.8);
  cakeLight.position.set(CAKE.x + 1, 3.2, 0);
  party.add(warm, cakeLight, lightPool('#ff7ab0', 11, 0, 0, 0.24), lightPool('#ffcf8f', 6, CAKE.x + 1.5, 0, 0.2));

  const banner = makeBanner();
  banner.rotation.y = -Math.PI / 2; // faces west, toward you as you arrive
  banner.position.set(BANNER_X, 0, 0);
  party.add(banner);
  // It melts away as the camera reaches it, or its back would fill the screen as you pass under
  (zone.camFade ??= []).push({ object: banner, near: 4.2, far: 5.2, at: { x: zone.x + BANNER_X, z: zone.z } });
  for (const s of [-1, 1]) prop(new THREE.Group(), BANNER_X, s * 3.2, 0.2); // its poles

  prop(makeCakeTable(), CAKE.x, CAKE.z, 1.2);
  for (const [x, z, size, color, ribbon] of [
    [10.5, -1.8, 0.55, '#7bdff2', '#ffffff'],
    [11.3, 1.6, 0.45, '#b388ff', '#ffe066'],
    [7.9, -2.0, 0.4, '#ffe066', '#ff5d8f'],
    [11.4, -0.4, 0.35, '#ff5d8f', '#ffffff'],
  ]) {
    const gift = makeGift(size, color, ribbon);
    gift.rotation.y = Math.random() * Math.PI;
    prop(gift, x, z, size * 0.75);
  }

  const heart = makeHeart();
  heart.rotation.y = -Math.PI / 2; // faces west, behind the cake
  prop(heart, HEART.x, HEART.z, 1.0);
  for (const s of [-1, 1]) prop(new THREE.Group(), HEART.x, HEART.z + s * 1.2, 0.5); // its lobes

  addConfetti(party);
  addFireworks(party);
}
