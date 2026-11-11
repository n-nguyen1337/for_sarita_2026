import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, plateTexture, slabTexture, modelLoader, lightPool, mat, glow, glowMap, box, cyl, flat } from './kit.js';
import { skyDome, clouds } from './sky.js';

// Asian Shop Pack: one GLB holding two rows of storefronts, each ~22 units long,
// 3 units tall, glass line near z = 0.5, facing +Z. The upper row sits on y = 0,
// the lower one on y = -3 (they're stacked like a catalog sheet).
const SHOPLIB_GLB = new URL('../assets/optimized/asian-shop-pack-free-gameready/source/hongkong.glb', import.meta.url).href;

/* ------------------------------------------------------------------ */
/* K-TOWN: West 32nd Street, Manhattan ("Korea Way")                   */
/* The street runs along X through the zone center. Every number below */
/* is local to the zone center; north is -Z, Fifth Avenue is +X.       */
/* ------------------------------------------------------------------ */
const STREET_HALF_LEN = 22.75; // storefront rows run x = -22.75..22.75
const ROAD_HALF = 4;           // asphalt from z = -4..4, sidewalks beyond
const SHOP_FRONT = 7.45;       // storefront glass line on each side
const SHOP_TOP = 3;            // storefronts are 3 units tall; buildings stack above
const AVENUE = { sidewalk: 3.25, road: 8 }; // the cross avenues at both ends
const KOREAN_FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/* The time of day: a fresh morning, so the game runs from morning here to the
   party at dusk. Change this to 'dusk' for a neon evening: the windows and shops
   light up and pools of light fall on the road. (Or try it with ?ktown=dusk) */
const DEFAULT_TIME = 'day';
const TIME_OF_DAY = new URLSearchParams(location.search).get('ktown') === 'dusk' ? 'dusk' : DEFAULT_TIME;
const DUSK = TIME_OF_DAY === 'dusk';
const NEON_GLOW = DUSK ? 2.1 : 2;
const TIMES = {
  day: {
    sky: 0xfff0e4, // the morning's pale horizon
    dome: { horizon: 0xfff0e4, mid: '#a9dcff', top: '#4a97ea' },
    clouds: '#ffffff',
    light: { sky: 0xeaf4ff, ground: 0x8a8578, hemi: 1.1, sun: 0xfff0d6, sunIntensity: 2.0 },
    sunOffset: [20, 38, 13], // high enough that the buildings only shade part of the road
    look: { bloom: 0.3, vignette: 0.14, saturation: 1.08, env: 0.24 },
  },
  dusk: {
    sky: 0xf4a27c,
    dome: { horizon: 0xf4a27c, mid: '#a8628f', top: '#2a3170' },
    clouds: '#ffb8a0',
    light: { sky: 0x8f98ff, ground: 0x4c4358, hemi: 1.15, sun: 0xffa768, sunIntensity: 1.5 },
    sunOffset: [36, 14, 16],
    look: { bloom: 0.34, vignette: 0.2, saturation: 1.08, env: 0.2 },
  },
};
const TIME = TIMES[TIME_OF_DAY];

export const KTOWN = {
  sky: TIME.sky,
  light: TIME.light,
  sunOffset: TIME.sunOffset,
  look: TIME.look,
  fog: [40, 125],
  surface: 'pavement',
  dust: '#d8d4cc',
  cameraMargin: 1.5, // keeps the camera clear of the shops' awnings
  // Walkable rectangle; like the disc zones, the player stops 1 unit inside it
  bounds: { halfX: STREET_HALF_LEN + 0.25, halfZ: SHOP_FRONT + 0.5 },
  // Its music, with toy-sized street sounds around it (audio.js)
  sound: 'cutesy',
  // The Fifth Avenue end leads east to the Gym, the next zone in the chain.
  // A spot may add `face: { x, z }`, the point the portal looks at (default: zone center).
  portalSpots: {
    Gym: { x: 20.5, z: 0 },
  },
  // The game starts between the parked cabs, looking straight down the street at the Gym portal
  spawn: { x: -14.5, z: 0, face: { x: 20.5, z: 0 } },
  // The "press E" sign (text in messages.js): across the sidewalk from The Maze Bar's neon,
  // at the road's edge in line with the curb props and facing the middle of the street
  signSpot: { x: 1.75, z: -4.6 },
  // The cute characters stroll up and down the block, on sidewalks and in the road.
  // A spot with `patrolTo` walks back and forth between its spot and that point instead.
  npcSpots: [
    { npc: 'bananaCat', x: -12, z: 5.6  },
    { npc: 'chick',     x: -4,  z: -1.5 },
    { npc: 'star',      x: 6,   z: 1.5  },
    { npc: 'rabbit',    x: 12,  z: -5.6 },
    { npc: 'alien',     x: -20, z: 3    },
    { npc: 'avocado',   x: 16,  z: -3   },
    { npc: 'bear',      x: 1,   z: 6    },
    { npc: 'avocado',   x: -8,  z: 2    },
    { npc: 'alien',     x: 14,  z: 2.5  },
    { npc: 'bananaCat', x: -1,  z: -3   },
    // Sidewalk walkers, in a lane just inside the curb props (lamps, hydrants, cans)
    { npc: 'chick',     x: -19, z: -5.9, patrolTo: { x: 19,  z: -5.9 } },
    { npc: 'star',      x: 19,  z: -5.9, patrolTo: { x: -19, z: -5.9 } },
    { npc: 'bear',      x: -19, z: 5.9,  patrolTo: { x: 19,  z: 5.9  } },
    { npc: 'rabbit',    x: 19,  z: 5.9,  patrolTo: { x: -19, z: 5.9  } },
  ],
  build: buildKoreatown,
};

/* Buildings along each side of the street: [width, height, style, extra].
   Widths add up to the full block (2 × STREET_HALF_LEN). `escape` hangs a
   fire escape on the front; a string hangs a vertical neon blade sign. */
const NORTH_FRONTAGE = [
  [7,   14, 'brick',      'escape'],
  [5.5, 20, 'limestone',  '노래방'],
  [9,   11, 'brownstone', '한식당'],
  [6,   17, 'cream',      'escape'],
  [8,   24, 'gray',       '치킨'],
  [10,  13, 'brick',      '카페'],
];
const SOUTH_FRONTAGE = [
  [9,   12, 'brownstone', 'escape'],
  [6,   18, 'gray',       '고기집'],
  [7.5, 22, 'limestone',  '포차'],
  [11,  10, 'brick',      'escape'],
  [5,   16, 'cream',      '서울'],
  [7,   13, 'brownstone', '빙수'],
];
// Avenue-facing blocks (no storefront pack, buildings from the ground up)
const AVENUE_FRONTAGE = [
  [8, 15, 'gray'], [6, 22, 'brick'], [9, 12, 'cream'], [7, 18, 'limestone'], [7.55, 13, 'brownstone'],
];

const STYLES = {
  brick:      { wall: '#8e4636', trim: '#e7dccb' },
  brownstone: { wall: '#6f4a3a', trim: '#d6c2a0' },
  limestone:  { wall: '#c9b99c', trim: '#6e604c' },
  cream:      { wall: '#ddd0b3', trim: '#5b4c3c' },
  gray:       { wall: '#878c93', trim: '#e3e3e3' },
};
const NEON = ['#ff4fa3', '#3ff0ff', '#ffd23f', '#6dff8f', '#ff8a3d', '#b98bff'];

/* ------------------------------------------------------------------ */
/* CANVAS TEXTURES                                                      */
/* ------------------------------------------------------------------ */
// 4 bays × 4 floors of windows; one bay = 2.5 units wide, one floor = 3 tall
function windowTexture(style) {
  const { wall, trim } = style;
  const litWindows = [];
  const tex = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 512, 512);
    // faint mortar/stone courses
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < 512; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    for (let bx = 0; bx < 4; bx++) {
      for (let fy = 0; fy < 4; fy++) {
        const x = bx * 128, y = fy * 128;
        ctx.fillStyle = trim;
        ctx.fillRect(x + 28, y + 18, 72, 96);       // frame
        ctx.fillRect(x + 22, y + 112, 84, 8);       // sill
        const lit = Math.random() < (DUSK ? 0.42 : 0.18);
        if (lit) litWindows.push([x + 33, y + 23, 62, 86]);
        const g = ctx.createLinearGradient(0, y + 22, 0, y + 110);
        g.addColorStop(0, lit ? '#ffe9b0' : '#a9c4dc');
        g.addColorStop(1, lit ? '#f2b860' : '#3e5163');
        ctx.fillStyle = g;
        ctx.fillRect(x + 33, y + 23, 62, 86);       // glass
        ctx.fillStyle = trim;
        ctx.fillRect(x + 33, y + 62, 62, 5);        // sash bar
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // At dusk, the lit windows glow
  style.lit = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#ffd08a';
    for (const [x, y, w, h] of litWindows) ctx.fillRect(x, y, w, h);
  });
  style.lit.wrapS = style.lit.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Vertical neon blade sign: characters stacked top to bottom
function bladeTexture(text, color) {
  return canvasTexture(128, 512, (ctx, w, h) => {
    ctx.fillStyle = '#16131f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    const chars = [...text];
    const step = Math.min(110, (h - 60) / chars.length);
    ctx.font = `bold ${Math.floor(step * 0.8)}px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    chars.forEach((c, i) => ctx.fillText(c, w / 2, h / 2 + (i - (chars.length - 1) / 2) * step));
  });
}

// Horizontal neon sign: one glowing line of text in a glowing frame
function neonTexture(text, color) {
  return canvasTexture(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#16131f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.font = `bold 110px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 28;
    ctx.fillText(text, w / 2, h / 2 + 6, w - 80);
  });
}

/* ------------------------------------------------------------------ */
/* BUILDINGS                                                            */
/* A frontage is a row of buildings along local +X with their fronts    */
/* on local z = 0, facing local +Z. Place the group to aim it.          */
/* ------------------------------------------------------------------ */
const styleTextures = {};
function makeBuilding(w, h, style, base) {
  const s = STYLES[style];
  styleTextures[style] ??= windowTexture(s);
  const tex = styleTextures[style].clone();
  tex.repeat.set(w / 10, (h - base) / 12);
  tex.needsUpdate = true;

  const depth = 14;
  const wall = mat(s.wall);
  const front = new THREE.MeshStandardMaterial({ map: tex });
  if (DUSK) {
    front.emissiveMap = s.lit.clone();
    front.emissiveMap.repeat.copy(tex.repeat);
    front.emissiveMap.needsUpdate = true;
    front.emissive.set('#ffffff');
    front.emissiveIntensity = 1.2;
  }
  const g = new THREE.Group();
  // box faces: +x, -x, +y, -y, +z (front), -z
  g.add(box(w, h - base, depth, [wall, wall, mat('#3a3a3e'), wall, front, wall], w / 2, base + (h - base) / 2, -depth / 2));
  g.add(box(w + 0.1, 0.45, 0.7, mat(s.trim), w / 2, h + 0.1, 0.2)); // roof cornice
  return g;
}

function makeFireEscape(w, h) {
  const g = new THREE.Group();
  const iron = mat('#26282b', { metalness: 0.4, roughness: 0.6 });
  const pw = Math.min(w - 1, 3.6);
  let dir = 1;
  for (let y = 5.6; y < h - 1.5; y += 3) {
    g.add(box(pw, 0.08, 0.9, iron, 0, y, 0.45));                 // landing
    g.add(box(pw, 0.05, 0.05, iron, 0, y + 0.9, 0.88));          // top rail
    for (const x of [-pw / 2, pw / 2]) g.add(box(0.05, 0.9, 0.05, iron, x, y + 0.45, 0.88));
    if (y + 3 < h - 1.5) {                                        // stair up to the next landing
      const dx = pw - 0.8, len = Math.hypot(dx, 3);
      const stair = box(len, 0.06, 0.45, iron, 0, y + 1.5, 0.45);
      stair.rotation.z = dir * Math.atan2(3, dx);
      g.add(stair);
      dir = -dir;
    }
  }
  return g;
}

function makeBladeSign(text, color) {
  const side = glowMap(bladeTexture(text, color), NEON_GLOW);
  const edge = glow(color, NEON_GLOW);
  const sign = box(0.18, 3.6, 0.95, [side, side, edge, edge, edge, edge], 0, 0, 0, false);
  return sign;
}

function addFrontage(parent, list, base, x, z, rotY) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  let cursor = 0, n = 0;
  for (const [w, h, style, extra] of list) {
    const b = makeBuilding(w, h, style, base);
    b.position.x = cursor;
    g.add(b);
    if (extra === 'escape') {
      const fe = makeFireEscape(w, h);
      fe.position.x = cursor + w / 2;
      g.add(fe);
    } else if (extra) {
      const neon = NEON[n++ % NEON.length];
      const sign = makeBladeSign(extra, neon);
      sign.position.set(cursor + w * 0.3, 6.6, 0.6);
      g.add(sign);
      if (DUSK) g.add(lightPool(neon, 2.8, cursor + w * 0.3, 1.7, 0.16));
    }
    cursor += w;
  }
  parent.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* STREET FURNITURE                                                     */
/* ------------------------------------------------------------------ */
function makeStreetLamp() { // NYC "cobra head", arm reaching toward +Z
  const g = new THREE.Group();
  const pole = mat('#3d4a46', { metalness: 0.5, roughness: 0.5 });
  g.add(cyl(0.09, 6, pole, 0, 3, 0));
  g.add(cyl(0.16, 0.6, pole, 0, 0.3, 0));
  const arm = cyl(0.05, 1.8, pole, 0, 5.85, 0.85);
  arm.rotation.x = Math.PI / 2;
  g.add(arm);
  g.add(box(0.36, 0.16, 0.75, pole, 0, 5.8, 1.85));
  g.add(box(0.28, 0.04, 0.6, glow('#fff1c4'), 0, 5.71, 1.85, false));
  return g;
}

function makeTrafficLight(signs) {
  const g = new THREE.Group();
  const pole = mat('#3d4a46', { metalness: 0.5, roughness: 0.5 });
  g.add(cyl(0.08, 4.4, pole, 0, 2.2, 0));
  g.add(box(0.36, 1.1, 0.36, mat('#e0b000'), 0, 4.2, 0));
  ['#ff3b30', '#ffcc00', '#34c759'].forEach((c, i) => {
    for (const s of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), i === 2 ? glow(c) : mat('#3a3a3a'));
      lamp.position.set(s * 0.185, 4.55 - i * 0.34, 0);
      lamp.rotation.y = s * Math.PI / 2;
      g.add(lamp);
    }
  });
  // Street name plates, readable from both sides of the street
  signs.forEach((tex, i) => {
    const face = new THREE.MeshBasicMaterial({ map: tex });
    const edge = mat('#1d6b3a');
    g.add(box(2.0, 0.42, 0.04, [edge, edge, edge, edge, face, face], 0.9, 3.45 - i * 0.5, 0, false));
  });
  return g;
}

function makeHydrant() {
  const g = new THREE.Group();
  const red = mat('#c8312b', { roughness: 0.5 });
  g.add(cyl(0.16, 0.55, red, 0, 0.3, 0));
  g.add(cyl(0.2, 0.08, red, 0, 0.04, 0));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
  cap.position.y = 0.57;
  g.add(cap);
  const nozzle = cyl(0.07, 0.48, mat('#c9c9c9', { metalness: 0.6 }), 0, 0.38, 0);
  nozzle.rotation.z = Math.PI / 2;
  g.add(nozzle);
  return g;
}

function makeTrashCan() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.85, mat('#2f5a3a', { roughness: 0.8 }), 0, 0.43, 0, 16));
  g.add(cyl(0.32, 0.06, mat('#1f3d27'), 0, 0.87, 0, 16));
  return g;
}

function makeTaxi() { // yellow cab, nose toward +X
  const g = new THREE.Group();
  const yellow = mat('#f7c11b', { roughness: 0.35, metalness: 0.2 });
  const glass = mat('#2a3542', { roughness: 0.1, metalness: 0.5 });
  g.add(box(4.2, 0.75, 1.8, yellow, 0, 0.62, 0));
  g.add(box(2.3, 0.6, 1.62, glass, -0.15, 1.3, 0));
  g.add(box(2.1, 0.08, 1.64, yellow, -0.15, 1.62, 0));
  g.add(box(0.5, 0.2, 0.22, glow('#fff6b0'), -0.15, 1.76, 0, false)); // roof light
  g.add(box(0.06, 0.12, 1.3, glow('#fffbe8'), 2.11, 0.75, 0, false)); // headlights
  g.add(box(0.06, 0.12, 1.3, glow('#ff4040'), -2.11, 0.75, 0, false));
  g.add(box(4.22, 0.12, 1.82, mat('#151515'), 0, 0.68, 0)); // checker stripe
  const tire = mat('#141414', { roughness: 0.9 });
  for (const x of [-1.35, 1.35]) for (const z of [-0.85, 0.85]) {
    const w = cyl(0.34, 0.24, tire, x, 0.34, z, 16);
    w.rotation.x = Math.PI / 2;
    g.add(w);
  }
  return g;
}

function makeBarricade() { // NYPD-style sawhorse with striped boards
  const g = new THREE.Group();
  const stripes = canvasTexture(256, 32, (ctx, w, h) => {
    for (let x = -h; x < w; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? '#ffffff' : '#f26b1d';
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 48, 0); ctx.lineTo(x + 32, h);
      ctx.fill();
    }
  });
  const board = new THREE.MeshStandardMaterial({ map: stripes });
  g.add(box(2.3, 0.25, 0.05, board, 0, 0.95, 0));
  g.add(box(2.3, 0.25, 0.05, board, 0, 0.55, 0));
  const leg = mat('#dcdcdc');
  for (const x of [-0.95, 0.95]) for (const s of [-1, 1]) {
    const l = box(0.06, 1.15, 0.06, leg, x, 0.55, s * 0.18);
    l.rotation.x = s * 0.3;
    g.add(l);
  }
  return g;
}

/* Chalk drawings on the road, left by whoever's been at the street fair */
function chalkTexture() {
  return canvasTexture(1024, 512, (ctx) => {
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    const line = (color, draw) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      draw();
      ctx.stroke();
    };
    const heart = (x, y, s) => {
      ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s, x, y - s * 0.3);
      ctx.bezierCurveTo(x + s * 0.7, y - s, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
    };
    const star = (x, y, r) => {
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
    };
    line('rgba(255, 170, 200, 0.85)', () => heart(190, 270, 120));
    line('rgba(255, 225, 150, 0.8)', () => star(470, 150, 80));
    line('rgba(255, 170, 200, 0.75)', () => heart(450, 380, 46));
    line('rgba(170, 225, 255, 0.8)', () => heart(790, 170, 70));
    line('rgba(200, 245, 190, 0.8)', () => star(740, 380, 56));
    line('rgba(255, 225, 150, 0.75)', () => { // a little sun
      ctx.moveTo(958, 330);
      ctx.arc(930, 330, 28, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(930 + Math.cos(a) * 42, 330 + Math.sin(a) * 42);
        ctx.lineTo(930 + Math.cos(a) * 62, 330 + Math.sin(a) * 62);
      }
    });
  });
}

/* Paper lanterns strung across the street, for the street fair: each is a ribbed
   ball with a dark cap above and below and a little tassel, hanging from its wire
   and swaying. One instanced mesh, lit from within, so they stay bright in the
   shade. Vertex colors: white takes the lantern's color, and dark stays dark. */
const LANTERN_STRANDS = [-18.5, -8.5, 0.5, 8.5, 18.5]; // x of each strand: clear of the lamps
const LANTERN_COLORS = ['#ff6b6b', '#ffb347', '#ffd93d', '#ff85b3', '#ff8a5c', '#fff1c9'];
const LANTERN_DROP = 0.42; // from the wire to the lantern's middle

function lanternGeometry() {
  const paint = (geo, shade) => {
    const colors = [], p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const c = shade(p.getY(i));
      colors.push(c, c, c);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo.index ? geo.toNonIndexed() : geo;
  };
  const r = 0.3, squash = 0.82;
  return mergeGeometries([
    paint(new THREE.SphereGeometry(r, 18, 14).scale(1, squash, 1), (y) => 0.84 + 0.16 * Math.abs(Math.sin(y * 24))), // the paper's ribs
    paint(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12).translate(0, r * squash, 0), () => 0.14),
    paint(new THREE.CylinderGeometry(0.13, 0.11, 0.05, 12).translate(0, -r * squash, 0), () => 0.14),
    paint(new THREE.BoxGeometry(0.03, 0.2, 0.03).translate(0, -r * squash - 0.12, 0), () => 0.9),
  ]);
}

function addLanterns(street) {
  const EDGE = SHOP_FRONT - 0.3, TOP = 6.8, SAG = 1.5, wire = new THREE.LineBasicMaterial({ color: '#2b2430' });
  const spots = [];
  LANTERN_STRANDS.forEach((x, strand) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, z = -EDGE + 2 * EDGE * t, y = TOP - SAG * 4 * t * (1 - t);
      pts.push(new THREE.Vector3(x, y, z));
      const clearOfPortal = strand < LANTERN_STRANDS.length - 1 || Math.abs(z) > 2.5; // none right in front of the Gym portal
      if (i > 0 && i < 16 && i % 2 === 0 && clearOfPortal) spots.push({ x, y, z, phase: i + strand * 2.3 });
    }
    street.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
  });
  const lanterns = new THREE.InstancedMesh(
    lanternGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: false }),
    spots.length
  );
  lanterns.frustumCulled = false; // they move every frame, so the precomputed bounds are useless
  const m = new THREE.Matrix4(), color = new THREE.Color();
  spots.forEach((s, i) => lanterns.setColorAt(i, color.set(LANTERN_COLORS[i % LANTERN_COLORS.length])));
  lanterns.onBeforeRender = () => { // only ticks while the street is shown
    const t = performance.now() / 1000;
    spots.forEach((s, i) => {
      const a = Math.sin(t * 1.1 + s.phase) * 0.09;
      m.makeRotationZ(a);
      m.setPosition(s.x + Math.sin(a) * LANTERN_DROP, s.y - Math.cos(a) * LANTERN_DROP, s.z);
      lanterns.setMatrixAt(i, m);
    });
    lanterns.instanceMatrix.needsUpdate = true;
  };
  street.add(lanterns);
}

/* Empire State Building, a few blocks north-east: a hazy far-off silhouette */
function makeEmpireState() {
  const g = new THREE.Group();
  const haze = new THREE.MeshStandardMaterial({ color: 0xb7c3d3, fog: false });
  const tiers = [[18, 10, 14], [13, 48, 11], [10, 7, 8.5], [7, 5, 6], [5, 4, 4]]; // [w, h, d]
  let y = 0;
  for (const [w, h, d] of tiers) {
    g.add(box(w, h, d, haze, 0, y + h / 2, 0, false));
    y += h;
  }
  g.add(cyl(1.4, 7, haze, 0, y + 3.5, 0));
  g.add(cyl(0.25, 10, haze, 0, y + 12, 0, 6));
  return g;
}

/* ------------------------------------------------------------------ */
/* BUILD THE ZONE                                                       */
/* ------------------------------------------------------------------ */
function buildKoreatown(zone, addObstacle) {
  const street = new THREE.Group();
  street.position.set(zone.x, 0, zone.z);
  zone.group.add(street);
  // props the player and pets bump into, in local coords
  const prop = (obj, x, z, r) => addObstacle(obj, zone.x + x, zone.z + z, r, zone.group);

  zone.group.add(skyDome(zone.x, zone.z, TIME.dome), clouds(zone.x, zone.z, { count: 9, color: TIME.clouds }));

  /* Ground: asphalt everywhere, sidewalks on top */
  const asphalt = slabTexture('#5c5c64', null);
  asphalt.repeat.set(52, 52);
  street.add(flat(280, 280, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }), 0, 0, 0));

  const concrete = slabTexture('#b9b5ad', 'rgba(70,65,60,0.35)', 64);
  const sidewalk = (w, d, x, z) => {
    const t = concrete.clone();
    t.repeat.set(w / 1.6, d / 1.6);
    t.needsUpdate = true;
    street.add(flat(w, d, new THREE.MeshStandardMaterial({ map: t }), x, z, 0.02));
  };
  const avX = STREET_HALF_LEN + AVENUE.sidewalk; // where the avenue road starts
  const farX = avX + AVENUE.road;                 // far curb across the avenue
  const walkD = SHOP_FRONT + 1.5 - ROAD_HALF;     // runs a little under the storefronts
  for (const s of [-1, 1]) {
    // along 32nd St, running out to the avenue curbs
    sidewalk(avX * 2, walkD, 0, s * (ROAD_HALF + walkD / 2));
    // avenue sidewalks, near and far side, either side of the street opening
    for (const zs of [-1, 1]) {
      const len = 50 - ROAD_HALF;
      sidewalk(AVENUE.sidewalk, len, s * (STREET_HALF_LEN + AVENUE.sidewalk / 2), zs * (ROAD_HALF + len / 2));
      sidewalk(AVENUE.sidewalk, len, s * (farX + AVENUE.sidewalk / 2), zs * (ROAD_HALF + len / 2));
    }
    // curbs
    street.add(box(avX * 2, 0.05, 0.2, mat('#d9d5cc'), 0, 0.025, s * ROAD_HALF, false));
  }

  /* Road markings */
  const paint = mat('#f2f2ee', { roughness: 0.6 });
  for (let x = -STREET_HALF_LEN + 1; x < STREET_HALF_LEN - 1; x += 3.5) {
    street.add(flat(1.8, 0.14, paint, x, 0, 0.015));      // lane dashes (one-way)
  }
  for (const s of [-1, 1]) {
    for (let z = -ROAD_HALF + 0.5; z < ROAD_HALF; z += 1.0) {
      street.add(flat(2.4, 0.5, paint, s * (STREET_HALF_LEN + 1.6), z, 0.03)); // crosswalks
    }
    for (const lane of [1 / 3, 2 / 3]) {                   // avenue lane lines
      for (let z = -48; z < 48; z += 3.5) {
        if (Math.abs(z) < ROAD_HALF + 1) continue;
        street.add(flat(0.14, 1.8, paint, s * (avX + AVENUE.road * lane), z, 0.015));
      }
    }
  }

  /* Storefront rows of buildings on both sides of 32nd St */
  const fronts = [
    addFrontage(street, NORTH_FRONTAGE, SHOP_TOP, -STREET_HALF_LEN, -SHOP_FRONT, 0),
    addFrontage(street, SOUTH_FRONTAGE, SHOP_TOP, STREET_HALF_LEN, SHOP_FRONT, Math.PI),
  ];
  for (const f of fronts) {
    const len = STREET_HALF_LEN * 2;
    f.add(box(len, SHOP_TOP + 0.1, 12, mat('#2e2b2a'), len / 2, (SHOP_TOP + 0.1) / 2, -7.6)); // fills in behind the shops
    f.add(box(len, 0.3, 0.6, mat('#d8ccb6'), len / 2, SHOP_TOP + 0.15, 0));                   // cornice over the shops
  }

  /* The rest of the neighborhood: avenue-facing blocks on all four corners,
     and across both avenues. They frame the view at the end of the street. */
  const blockBack = SHOP_FRONT + 14; // the 32nd St buildings are 14 deep
  const avLen = AVENUE_FRONTAGE.reduce((sum, [w]) => sum + w, 0);
  for (const s of [-1, 1]) {
    const rot = s * Math.PI / 2;          // +X end: fronts face +X; -X end: face -X
    const nearX = s * STREET_HALF_LEN, acrossX = s * (farX + AVENUE.sidewalk);
    // our two corner blocks, continuing past the back of the 32nd St buildings
    addFrontage(street, AVENUE_FRONTAGE, 0, nearX, s * -blockBack, rot);
    addFrontage(street, AVENUE_FRONTAGE, 0, nearX, s * (blockBack + avLen), rot);
    // across the avenue, facing back at us
    addFrontage(street, AVENUE_FRONTAGE, 0, acrossX, s * -45, -rot);
    addFrontage(street, [...AVENUE_FRONTAGE].reverse(), 0, acrossX, s * SHOP_FRONT, -rot);
  }
  // blocks closing the vista where 32nd St continues past each avenue
  addFrontage(street, AVENUE_FRONTAGE.slice(0, 3), 0, 70, -11.5, -Math.PI / 2);
  addFrontage(street, AVENUE_FRONTAGE.slice(2), 0, -70, 11.5, Math.PI / 2);

  const esb = makeEmpireState();
  esb.position.set(64, 0, -50);
  street.add(esb);

  /* Banner over the street-level shops: "Koreatown" */
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 0.9),
    glowMap(plateTexture('코리아타운 · KOREATOWN', '#16131f', '#ff4fa3', `bold 50px ${KOREAN_FONT}`), NEON_GLOW)
  );
  banner.position.set(-STREET_HALF_LEN + 7 + 9 / 2, 4.2, -SHOP_FRONT + 0.05);
  street.add(banner);

  /* "The Maze Bar": a horizontal neon sign on the building in the middle of the block,
     between the shop cornice and the first fire-escape landing */
  const mazeFace = glowMap(neonTexture('THE MAZE BAR', '#3ff0ff'), NEON_GLOW);
  const mazeEdge = glow('#3ff0ff', NEON_GLOW);
  street.add(box(5.2, 0.98, 0.15, [mazeEdge, mazeEdge, mazeEdge, mazeEdge, mazeFace, mazeEdge], 1.75, 4.35, -SHOP_FRONT + 0.1, false));

  addLanterns(street);
  const chalk = new THREE.MeshStandardMaterial({ map: chalkTexture(), transparent: true, depthWrite: false, roughness: 1 });
  street.add(flat(9, 4.5, chalk, -0.5, 1.4, 0.018));
  if (DUSK) {
    street.add(lightPool('#3ff0ff', 3.2, 1.75, -SHOP_FRONT + 1.8, 0.16));
    street.add(lightPool('#ff4fa3', 3.2, banner.position.x, -SHOP_FRONT + 1.8, 0.16));
  }

  /* Street furniture (all solid) */
  for (const [x, s] of [[-17, -1], [-2, -1], [13, -1], [-12, 1], [3, 1], [16, 1]]) {
    const lamp = makeStreetLamp();
    lamp.rotation.y = s > 0 ? Math.PI : 0; // arm reaches out over the road
    prop(lamp, x, s * 4.5, 0.25);
    (zone.camFade ??= []).push({ object: lamp, near: 1.3, far: 2, at: { x: zone.x + x, z: zone.z + s * 4.5 } });
    if (DUSK) street.add(lightPool('#ffc98a', 4, x, s * 2.65, 0.2));
  }
  const plate = (t) => plateTexture(t, '#1d6b3a', '#ffffff', 'bold 64px "Helvetica Neue", Arial, sans-serif');
  const nameSigns = [plate('W 32 St'), plate('Korea Way')];
  for (const [x, z] of [[-21.8, 4.6], [21.8, -4.6]]) {
    const light = makeTrafficLight(nameSigns);
    light.rotation.y = x > 0 ? Math.PI : 0;
    prop(light, x, z, 0.25);
  }
  prop(makeHydrant(), -14.5, 4.6, 0.3);
  prop(makeHydrant(), 8, -4.6, 0.3);
  prop(makeTrashCan(), 19, 4.6, 0.35);
  prop(makeTrashCan(), -6.5, -4.6, 0.35);

  // Parked yellow cabs; extra collision circles cover the nose and trunk
  for (const [x, z] of [[-11, -2.9], [-16, 2.9]]) {
    prop(makeTaxi(), x, z, 1.0);
    prop(new THREE.Object3D(), x - 1.3, z, 0.95);
    prop(new THREE.Object3D(), x + 1.3, z, 0.95);
  }

  // Street-fair barricades close off both ends of the block
  for (const s of [-1, 1]) {
    for (const z of [-2.6, 0, 2.6]) {
      const b = makeBarricade();
      b.position.set(s * (STREET_HALF_LEN + 0.1), 0, z);
      b.rotation.y = Math.PI / 2;
      street.add(b);
    }
  }

  /* Storefronts from the Asian Shop Pack, lining both sides */
  modelLoader().load(SHOPLIB_GLB, (gltf) => {
    const rows = [new THREE.Group(), new THREE.Group()]; // pack's upper row, lower row
    for (const piece of [...gltf.scene.children]) {
      piece.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material.map) o.material.map.anisotropy = 16;
        if (DUSK && o.material.map && !o.material.emissiveMap) { // the shops are lit up
          o.material.emissive.set('#ffdcb0');
          o.material.emissiveMap = o.material.map;
          o.material.emissiveIntensity = 0.32;
        }
      });
      const center = new THREE.Box3().setFromObject(piece).getCenter(new THREE.Vector3());
      rows[center.y >= 0 ? 0 : 1].add(piece);
    }
    // Normalize: each row starts at x = 0, stands on y = 0, glass line on z = 0
    const strip = new THREE.Group();
    rows.forEach((row, i) => {
      const b = new THREE.Box3().setFromObject(row);
      row.position.set(-b.min.x + i * STREET_HALF_LEN, -b.min.y, -0.5);
      strip.add(row);
    });
    fronts[0].add(strip);
    fronts[1].add(strip.clone());
  }, undefined, (err) => console.warn('Asian shop pack failed to load:', SHOPLIB_GLB, err));
}
