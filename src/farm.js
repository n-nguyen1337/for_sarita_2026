import * as THREE from 'three';
import { DISPLAY_FONT, canvasTexture, plateTexture, modelLoader, seeded, mat, box, cyl, flat } from './kit.js';
import { skyDome, clouds, hills } from './sky.js';
import { grassTufts } from './grass.js';
import { cornMaze } from './cornmaze.js';
import { makeBalloons } from './celebration.js';

// Farm pack: three low-poly, vertex-colored models, each centered on its own origin.
//   autumn-maple: a fall maple, ~5.9 tall, with leaves scattered round its foot.
//                 The slimmed copy stands in the yard; a much lighter one fills the wood beyond the fence
//   farm-lane:    a 4×4 tile of tilled soil with dry grass; the soil top is ~0.07 above center
//   farmhouse:    ~7.4 × 6.6 × 7.8, front door and porch facing +Z
const FARM_GLB = {
  maple: new URL('../assets/optimized/farm/autumn-maple.glb', import.meta.url).href,
  mapleFar: new URL('../assets/optimized/farm/autumn-maple-far.glb', import.meta.url).href,
  lane:  new URL('../assets/farm/farm-lane.glb', import.meta.url).href,
  house: new URL('../assets/farm/farmhouse.glb', import.meta.url).href,
};

/* ------------------------------------------------------------------ */
/* FARM: a little homestead on an autumn afternoon                     */
/* A disc zone ringed by a split-rail fence. The farmhouse is north    */
/* (-Z), the crop field east, the pumpkin patch southwest, and the     */
/* portal back to Hawaii west. A gate in the east fence opens onto the */
/* corn maze (cornmaze.js), with the portal to the celebration at its  */
/* far end. Every number below is local to the zone center.            */
/* ------------------------------------------------------------------ */
const FENCE_R = 23.8;                       // just past where the player stops (ZONE_RADIUS - 1)
const FENCE_POSTS = Math.round((2 * Math.PI * FENCE_R) / 2.5); // one every ~2.5 units
// The gate to the corn maze: the one gap in the rails, east and a touch north
const GATE_RAIL = FENCE_POSTS - 2;          // the rails between the posts at -12° and -6°
const GATE_ANGLE = ((GATE_RAIL + 0.5) / FENCE_POSTS) * Math.PI * 2;
const GATE = { x: FENCE_R * Math.cos(GATE_ANGLE), z: FENCE_R * Math.sin(GATE_ANGLE) };
const GATE_HALF = 0.65;                     // half the gap, less a body radius
const MAZE = cornMaze({ x: 24.5, z: GATE.z }); // starts just past the fence, its way in level with the gate
const HOUSE = { x: 0, z: -13, scale: 1.5 }; // 1.5× so the door fits the player
// The house walls in the model's own units (the roof and porch overhang them)
const HOUSE_WALLS = { minX: -3.45, maxX: 3.45, minZ: -2.6, maxZ: 2.4 };
const TILE = 4;                             // farm-lane tiles are 4×4
const FIELD = { x: 11, z: 4, cols: 3, rows: 3 };  // crops, east of the yard
const PATCH = { x: -9, z: 12, cols: 2, rows: 1 }; // pumpkin patch
const MAPLE_SCALE = 1.4;                    // ~8 units tall
// Kept clear of the line behind the portal, where the camera sits as you arrive
const YARD_MAPLES = [[-11, -10], [11, -14], [-14, -4], [8, 16], [17, -7], [-19, -9]];
const LEAF_COLORS = ['#c8431f', '#e0702a', '#e8a33a', '#d9b443', '#a8321c', '#b8662a'];
const GRASS_COLORS = ['#b3a95c', '#a39a50', '#c4b464', '#94904a', '#bda44e'];
// The dirt paths, as [x1, z1, x2, z2] down their middles; they're all 2 wide
const PATHS = [
  [0, -7.9, 0, 4],                // porch steps down to the crossroads
  [-20, 3, 5, 3],                 // west to the portal, east to the field
  [-6, 4, -6, 10],                // down to the pumpkin patch
  [1, GATE.z, MAZE.x0, GATE.z],   // off the porch path, along the field, out the gate
];
const onPath = (x, z, pad = 0) => PATHS.some(([x1, z1, x2, z2]) =>
  x > Math.min(x1, x2) - 1 - pad && x < Math.max(x1, x2) + 1 + pad && z > Math.min(z1, z2) - 1 - pad && z < Math.max(z1, z2) + 1 + pad);

export const FARM = {
  title: 'The Farm',
  // A golden afternoon, with the sun getting low
  sky: 0xffe2b4,
  light: { sky: 0xffefd6, ground: 0x8d8050, hemi: 1.2, sun: 0xffdcb0, sunIntensity: 2.2 },
  sunOffset: [-24, 20, 18],
  look: { bloom: 0.25, vignette: 0.16, saturation: 1.03, env: 0.3 },
  fog: [38, 120],
  // What you're walking on (local coords): dirt on the paths and in the maze, otherwise grass and leaves
  surfaceAt: (x, z) => (onPath(x, z) || MAZE.inside(x, z) ? 'dirt' : 'grass'),
  dust: '#c9a97a',
  // Its music, with a breeze, birds and the farm's animals around it (audio.js)
  sound: 'harvest',
  portalSpots: {
    Hawaii: { x: -19, z: 3, face: { x: 0, z: 3 } }, // at the end of the west path
    // In the clearing at the end of the corn maze, with no name above it
    Celebration: { ...MAZE.portal, label: false },
  },
  // The "press E" sign (text in messages.js): beside the west path, facing it
  signSpot: { x: -13, z: 5, face: { x: -13, z: 3 } },
  // Farm animals by the crops and hay, pets around the porch
  petSpots: [
    { pet: 'cat',      x: 2,   z: -6  },
    { pet: 'dog',      x: -3,  z: -5  },
    { pet: 'bunny',    x: -9,  z: 7   },
    { pet: 'pig',      x: 3,   z: 9   },
    { pet: 'cow',      x: 14,  z: 13  },
    { pet: 'panda',    x: -12, z: -5  },
    { pet: 'penguin',  x: -5,  z: 0   },
    { pet: 'fox',      x: -15, z: 7   },
    { pet: 'monkey',   x: 10,  z: -8  },
    { pet: 'chick',    x: 4,   z: -4  },
    { pet: 'elephant', x: -9,  z: 17  },
    { pet: 'parrot',   x: 16,  z: -2  },
  ],
  build: buildFarm,
};

/* ------------------------------------------------------------------ */
/* TEXTURES AND SMALL PROPS                                             */
/* ------------------------------------------------------------------ */
// Dry autumn grass: olive with gold and brown blades
function grassTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9a9550';
    ctx.fillRect(0, 0, w, h);
    const blades = ['#b3a95c', '#7f7c3e', '#c4a650', '#8d7a45', '#a7a35a'];
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

// All the dirt paths on one big see-through sheet, so their edges can wander and
// soften into the grass, and where they meet they just run together
const PATH_SHEET = 58, PATH_PIXELS = 1024; // the sheet's size in units and pixels
function pathTexture(rand) {
  return canvasTexture(PATH_PIXELS, PATH_PIXELS, (ctx, w) => {
    const px = w / PATH_SHEET, at = (v) => (v + PATH_SHEET / 2) * px;
    ctx.lineCap = 'round';
    // A soft edge: a wide faint stroke, a narrower stronger one, then the solid middle
    for (const [width, alpha] of [[2.5, 0.22], [2.15, 0.4], [1.8, 1]]) {
      ctx.strokeStyle = `rgba(139, 107, 71, ${alpha})`;
      ctx.lineWidth = width * px;
      for (const [x1, z1, x2, z2] of PATHS) {
        const len = Math.hypot(x2 - x1, z2 - z1), steps = Math.ceil(len / 1.2);
        const nx = -(z2 - z1) / len, nz = (x2 - x1) / len; // across the path
        const w1 = rand() * 6, w2 = rand() * 6;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, wander = (Math.sin(t * len * 0.9 + w1) + Math.sin(t * len * 2.1 + w2) * 0.5) * 0.07;
          const x = x1 + (x2 - x1) * t + nx * wander, z = z1 + (z2 - z1) * t + nz * wander;
          ctx[i ? 'lineTo' : 'moveTo'](at(x), at(z));
        }
        ctx.stroke();
      }
    }
    // Scuffs and pebbles, only where there's dirt
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 14000; i++) {
      const size = 1 + rand() * 3;
      ctx.fillStyle = rand() < 0.5 ? `rgba(70, 48, 28, ${rand() * 0.16})` : `rgba(205, 175, 130, ${rand() * 0.14})`;
      ctx.fillRect(rand() * w, rand() * w, size, size);
    }
  });
}

// A white maple-leaf silhouette; each leaf is tinted by its instance color
function leafTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 11 : i === 0 ? 29 : 25;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
    ctx.fillRect(-1.5, 8, 3, 22); // stem
  });
}

// A ribbed, squashed sphere, shared by every pumpkin
const PUMPKIN_GEO = (() => {
  const g = new THREE.SphereGeometry(1, 24, 16);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const rib = 1 - 0.1 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 4)); // 8 ribs
    p.setXYZ(i, v.x * rib, v.y * 0.72, v.z * rib);
  }
  g.computeVertexNormals();
  return g;
})();

function makePumpkin(size) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(PUMPKIN_GEO, mat('#e2711d', { roughness: 0.6 }));
  body.scale.setScalar(size);
  body.position.y = 0.72 * size;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body, cyl(size * 0.12, size * 0.4, mat('#5b4a24'), 0, 1.5 * size, 0, 6));
  return g;
}

function makeHayBale() {
  const g = new THREE.Group();
  g.add(box(1.3, 0.6, 0.7, mat('#d6b45a', { roughness: 1 }), 0, 0.3, 0));
  for (const x of [-0.35, 0.35]) g.add(box(0.04, 0.62, 0.72, mat('#8a6a32'), x, 0.3, 0, false)); // twine
  return g;
}

function makeRoundBale() {
  const g = new THREE.Group();
  const roll = cyl(0.75, 1.3, mat('#cfa94f', { roughness: 1 }), 0, 0.75, 0, 20);
  roll.rotation.z = Math.PI / 2;
  roll.receiveShadow = true;
  g.add(roll);
  return g;
}

// A pumpkin-headed scarecrow, facing +Z
function makeScarecrow() {
  const g = new THREE.Group();
  const wood = mat('#6b4a2b');
  const shirt = mat('#5a77a8');
  g.add(cyl(0.06, 2.2, wood, 0, 1.1, 0, 8));
  g.add(box(0.6, 0.75, 0.3, shirt, 0, 1.35, 0));         // body
  g.add(box(1.6, 0.2, 0.22, shirt, 0, 1.62, 0));         // arms
  for (const s of [-1, 1]) g.add(box(0.12, 0.16, 0.16, mat('#d9b85c'), s * 0.84, 1.62, 0)); // straw hands
  const head = makePumpkin(0.3);
  head.position.y = 1.75;
  g.add(head);
  for (const s of [-1, 1]) g.add(box(0.07, 0.07, 0.02, mat('#2b1a0e'), s * 0.1, 2.0, 0.29, false)); // eyes
  g.add(cyl(0.4, 0.04, mat('#5a3d22'), 0, 2.2, 0, 16));  // hat brim
  g.add(cyl(0.2, 0.3, mat('#5a3d22'), 0, 2.36, 0, 12));  // hat crown
  return g;
}

// Split-rail fence all the way round the zone (two instanced meshes: posts, rails),
// with no rails across the gate
function makeFence() {
  const wood = mat('#7a5a3a', { roughness: 0.95 });
  const n = FENCE_POSTS;
  const segLen = 2 * FENCE_R * Math.sin(Math.PI / n) + 0.1; // chord between posts, a hair long
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), wood, n);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen, 0.1, 0.06), wood, (n - 1) * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0, k = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    q.setFromAxisAngle(up, -a);
    posts.setMatrixAt(i, m.compose(p.set(Math.cos(a) * FENCE_R, 0.55, Math.sin(a) * FENCE_R), q, one));
    if (i === GATE_RAIL) continue;
    const mid = a + Math.PI / n, r = FENCE_R * Math.cos(Math.PI / n);
    q.setFromAxisAngle(up, -mid - Math.PI / 2); // along the tangent
    rails.setMatrixAt(k++, m.compose(p.set(Math.cos(mid) * r, 0.45, Math.sin(mid) * r), q, one));
    rails.setMatrixAt(k++, m.compose(p.set(Math.cos(mid) * r, 0.85, Math.sin(mid) * r), q, one));
  }
  for (const im of [posts, rails]) { im.castShadow = true; im.receiveShadow = true; }
  return [posts, rails];
}

// An arch over the gap in the fence, its sign facing the yard
function makeGate() {
  const g = new THREE.Group();
  const r = FENCE_R * Math.cos(Math.PI / FENCE_POSTS);
  g.position.set(Math.cos(GATE_ANGLE) * r, 0, Math.sin(GATE_ANGLE) * r);
  g.rotation.y = -GATE_ANGLE - Math.PI / 2; // like the rails it replaces: local X runs along the fence, +Z faces in
  const half = FENCE_R * Math.sin(Math.PI / FENCE_POSTS); // post to post
  const wood = mat('#6b4a2b', { roughness: 0.95 });
  for (const s of [-1, 1]) g.add(box(0.2, 3.1, 0.2, wood, s * half, 1.55, 0));
  g.add(box(2 * half + 0.5, 0.18, 0.22, wood, 0, 3.0, 0));
  g.add(box(2.5, 0.7, 0.08, wood, 0, 3.45, 0.06));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshStandardMaterial({ map: plateTexture('CORN MAZE', '#e8c25a', '#5a3d22', `600 76px ${DISPLAY_FONT}`), roughness: 0.9 })
  );
  sign.position.set(0, 3.45, 0.12);
  g.add(sign);
  return g;
}

/* ------------------------------------------------------------------ */
/* LEAVES: a carpet of fallen ones, and more drifting down              */
/* ------------------------------------------------------------------ */
function scatterLeaves(farm, trees, leafMat, rand) {
  const COUNT = 900;
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 0.28).rotateX(-Math.PI / 2), leafMat, COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    // Two-thirds pile up under the trees, the rest blow all over the yard
    if (i % 3) {
      const [tx, tz] = trees[i % trees.length];
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 4.5;
      p.set(tx + Math.cos(a) * d, 0, tz + Math.sin(a) * d);
    } else {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (FENCE_R - 1);
      p.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    }
    p.y = 0.015 + rand() * 0.02; // staggered so overlapping leaves don't flicker
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    s.setScalar(0.7 + rand() * 0.7);
    leaves.setMatrixAt(i, m.compose(p, q, s));
    leaves.setColorAt(i, color.set(LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)]));
  }
  leaves.receiveShadow = true;
  farm.add(leaves);
}

function addFallingLeaves(farm, trees, leafMat, rand) {
  const COUNT = 140;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.26), leafMat, COUNT);
  mesh.frustumCulled = false; // they move every frame, so the precomputed bounds are useless
  const leaves = [];
  const color = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const [tx, tz] = trees[i % trees.length];
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 3;
    leaves.push({
      x: tx + Math.cos(a) * d, z: tz + Math.sin(a) * d,
      top: 3.5 + rand() * 4,      // drops from somewhere in the canopy
      speed: 0.35 + rand() * 0.4, // units per second
      sway: 0.4 + rand() * 0.8,
      phase: rand() * 100,
    });
    mesh.setColorAt(i, color.set(LEAF_COLORS[i % LEAF_COLORS.length]));
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  mesh.onBeforeRender = () => { // only ticks while the farm is shown
    const t = performance.now() / 1000;
    leaves.forEach((l, i) => {
      const y = l.top - ((t * l.speed + l.phase) % l.top); // falls, lands, starts again up top
      p.set(l.x + Math.sin(t * 1.3 + l.phase) * l.sway, y, l.z + Math.cos(t * 0.9 + l.phase) * l.sway * 0.6);
      q.setFromEuler(e.set(t * 2.1 + l.phase, t * 1.4 + l.phase, 0));
      mesh.setMatrixAt(i, m.compose(p, q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  farm.add(mesh);
}

/* ------------------------------------------------------------------ */
/* BUILD THE ZONE                                                       */
/* ------------------------------------------------------------------ */
// Each model is one mesh centered on its origin: stand it on y = 0
function stand(gltf, scale) {
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  model.position.y = -new THREE.Box3().setFromObject(model).min.y;
  const g = new THREE.Group();
  g.add(model);
  g.scale.setScalar(scale);
  return g;
}

// Resolves once the farm models are in place
function buildFarm(zone, addObstacle) {
  const farm = new THREE.Group();
  farm.position.set(zone.x, 0, zone.z);
  zone.group.add(farm);
  // props the player and pets bump into, in local coords
  const prop = (obj, x, z, r) => addObstacle(obj, zone.x + x, zone.z + z, r, zone.group);
  const rand = seeded(1031);

  /* Flat ground, but nobody walks through the farmhouse walls, and past
     the fence you can only go through the gate and along the maze paths */
  const wallPad = 0.5; // about a body radius
  const walls = {
    minX: zone.x + HOUSE.x + HOUSE_WALLS.minX * HOUSE.scale - wallPad,
    maxX: zone.x + HOUSE.x + HOUSE_WALLS.maxX * HOUSE.scale + wallPad,
    minZ: zone.z + HOUSE.z + HOUSE_WALLS.minZ * HOUSE.scale - wallPad,
    maxZ: zone.z + HOUSE.z + HOUSE_WALLS.maxZ * HOUSE.scale + wallPad,
  };
  // In local coords: the gap in the fence, and everything out past it
  const inGate = (x, z) => x > 22 && x < MAZE.x0 + 0.01 && Math.abs(z - GATE.z) < GATE_HALF;
  const annex = (x, z) => inGate(x, z) || MAZE.inside(x, z);
  zone.terrain = {
    heightAt: () => 0,
    walkable: (x, z) => {
      if (x > walls.minX && x < walls.maxX && z > walls.minZ && z < walls.maxZ) return false;
      const lx = x - zone.x, lz = z - zone.z;
      if (inGate(lx, lz)) return true;
      if (MAZE.inside(lx, lz)) return MAZE.walkable(lx, lz);
      return Math.hypot(lx, lz) < FENCE_R - 0.5; // a bit past where main.js stops you, so you slide along the fence
    },
    // Out here main.js doesn't hold you inside the disc; walkable() keeps you on the paths
    annex: (x, z) => annex(x - zone.x, z - zone.z),
  };
  // In the maze the camera climbs so you can see over the corn
  zone.viewAt = (x, z) => (annex(x - zone.x, z - zone.z) ? MAZE.view : null);

  farm.add(skyDome(0, 0, { horizon: FARM.sky, mid: '#f6c088', top: '#8fa9d6' }));
  farm.add(clouds(0, 0, { count: 9, color: '#fff0d8', rand }));
  farm.add(hills(0, 0, '#cda67e', '#e6c8a0'));

  /* Ground: dry grass out to the horizon, dirt paths on top, and tufts in the yard */
  const grass = grassTexture();
  grass.repeat.set(64, 64);
  farm.add(flat(320, 320, new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }), 0, 0, 0));
  farm.add(flat(PATH_SHEET, PATH_SHEET, new THREE.MeshStandardMaterial({ map: pathTexture(rand), roughness: 1, transparent: true, depthWrite: false }), 0, 0, 0.008));
  const inPlot = (x, z, { x: px, z: pz, cols, rows }) => Math.abs(x - px) < (cols * TILE) / 2 + 0.3 && Math.abs(z - pz) < (rows * TILE) / 2 + 0.3;
  farm.add(grassTufts({
    count: 2600, radius: FENCE_R - 0.5, colors: GRASS_COLORS, rand,
    allowed: (x, z) => !onPath(x, z, 0.35) && !inPlot(x, z, FIELD) && !inPlot(x, z, PATCH)
      && !(Math.abs(x - HOUSE.x) < 7 && Math.abs(z - HOUSE.z) < 6.5),
  }));

  for (const f of makeFence()) farm.add(f);
  farm.add(makeGate());

  /* Hay and pumpkins */
  prop(makeHayBale(), 6.2, -7.2, 0.7);
  prop(makeHayBale(), 7.7, -6.6, 0.7);
  const top = makeHayBale();
  top.position.set(6.9, 0.6, -6.9);
  top.rotation.y = 0.3;
  farm.add(top);
  const onBale = makePumpkin(0.3);
  onBale.position.set(6.9, 1.2, -6.9);
  farm.add(onBale);
  for (const [x, z, a] of [[-3, 17, 0.2], [-0.8, 18.6, -0.4], [4.5, -1.2, 1.4]]) {
    const bale = makeRoundBale();
    bale.rotation.y = a;
    prop(bale, x, z, 0.85);
  }
  for (const [x, z, s] of [[-1.8, -8.2, 0.3], [1.9, -8.1, 0.25], [-2.4, -7.7, 0.18], [5.3, -6.3, 0.22]]) {
    prop(makePumpkin(s), x, z, s);
  }
  // The patch: rows of pumpkins of every size along the furrows
  for (let i = 0; i < 14; i++) {
    const s = 0.28 + rand() * 0.3;
    const x = PATCH.x - PATCH.cols * TILE / 2 + 0.7 + i * 0.52 + rand() * 0.2;
    const z = PATCH.z + [-1.2, 0, 1.2][i % 3] + (rand() - 0.5) * 0.3;
    const pumpkin = makePumpkin(s);
    pumpkin.rotation.y = rand() * Math.PI * 2;
    prop(pumpkin, x, z, s);
  }

  const scarecrow = makeScarecrow();
  scarecrow.rotation.y = Math.atan2(-FIELD.x, -FIELD.z); // keeps an eye on the yard
  prop(scarecrow, FIELD.x, FIELD.z, 0.4);

  /* Leaves, on the ground and on the breeze */
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  scatterLeaves(farm, YARD_MAPLES, leafMat, rand);
  addFallingLeaves(farm, YARD_MAPLES, leafMat, rand);

  /* Maples: collision now, models once loaded. More of them stand beyond
     the fence (lighter models, no shadows) so the farm sits in a fall wood. */
  const yardSpots = YARD_MAPLES.map(([x, z]) => {
    const spot = new THREE.Group();
    prop(spot, x, z, 0.6);
    return spot;
  });
  const woodSpots = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const d = 28 + rand() * 8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (MAZE.near(x, z, 3)) continue; // the corn maze stands there
    const spot = new THREE.Group();
    spot.position.set(x, 0, z);
    farm.add(spot);
    woodSpots.push(spot);
  }

  /* The corn maze, with scarecrows and pumpkins in its dead ends, and hay
     bales with balloons in the clearing at the end */
  MAZE.build(farm, rand);
  for (const { ch, x, z, face } of MAZE.marks) {
    if (ch === 'S') {
      const scarecrow = makeScarecrow();
      scarecrow.rotation.y = face;
      prop(scarecrow, x, z, 0.4);
    } else if (ch === 'o') {
      const pile = new THREE.Group();
      for (const [px, pz, s] of [[0, 0, 0.42], [0.55, 0.3, 0.3], [-0.4, 0.45, 0.24]]) {
        const pumpkin = makePumpkin(s);
        pumpkin.position.set(px, 0, pz);
        pumpkin.rotation.y = rand() * Math.PI * 2;
        pile.add(pumpkin);
      }
      pile.rotation.y = face;
      prop(pile, x, z, 0.8);
    } else if (ch === 'H') {
      const bale = makeHayBale();
      bale.rotation.y = face;
      const balloons = makeBalloons(['#ff5d8f', '#ffe066', '#7bdff2']);
      balloons.position.y = 0.6;
      bale.add(balloons);
      prop(bale, x, z, 0.7);
    }
  }

  const loader = modelLoader();
  return Promise.all([loader.loadAsync(FARM_GLB.maple), loader.loadAsync(FARM_GLB.mapleFar), loader.loadAsync(FARM_GLB.lane), loader.loadAsync(FARM_GLB.house)])
    .then(([mapleGltf, mapleFarGltf, laneGltf, houseGltf]) => {
      const maple = stand(mapleGltf, MAPLE_SCALE), mapleFar = stand(mapleFarGltf, MAPLE_SCALE);
      for (const spot of [...yardSpots, ...woodSpots]) {
        const far = woodSpots.includes(spot);
        const tree = (far ? mapleFar : maple).clone();
        tree.rotation.y = rand() * Math.PI * 2;
        tree.scale.multiplyScalar(0.85 + rand() * 0.3);
        if (far) tree.traverse((o) => { o.castShadow = false; });
        spot.add(tree);
      }

      // Tiles sink so their soil sits just above the grass; the dry stalks poke out
      const lane = laneGltf.scene;
      lane.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      for (const f of [FIELD, PATCH]) {
        for (let c = 0; c < f.cols; c++) {
          for (let r = 0; r < f.rows; r++) {
            const tile = lane.clone();
            tile.position.set(f.x + (c - (f.cols - 1) / 2) * TILE, -0.04, f.z + (r - (f.rows - 1) / 2) * TILE);
            tile.rotation.y = (c + r) % 2 ? Math.PI : 0; // breaks up the repeat
            farm.add(tile);
          }
        }
      }

      const house = stand(houseGltf, HOUSE.scale);
      house.position.set(HOUSE.x, 0, HOUSE.z);
      farm.add(house);
    })
    .catch((err) => console.warn('Farm models failed to load:', FARM_GLB, err));
}
