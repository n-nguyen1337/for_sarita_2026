import * as THREE from 'three';
import { modelLoader } from './kit.js';
import { skyDome, clouds } from './sky.js';
import { LAGOON, LAGOON_EDGE, makeLagoon } from './lagoon.js';

// "Miami Beach Diorama" by David Jávorcsík (https://sketchfab.com/Redlobo), CC-BY-4.0:
// https://sketchfab.com/3d-models/miami-beach-diorama-020167590ea34247beeeea8d176e36ec
// A round island ~23 units across (1 unit ≈ 1 m): sand sloping down to the sea,
// a lifeguard house on stilts, palms, and beach clutter. The sea is on its +Z side.
const BEACH_GLB = new URL('../assets/optimized/miami_beach/miami_beach_diorama.glb', import.meta.url).href;

/* ------------------------------------------------------------------ */
/* HAWAII: the beach diorama, scaled up and set in an endless ocean    */
/* Every number below is local to the zone center. The sea surface is  */
/* y = 0; the sand climbs from there up toward the lifeguard house.    */
/* ------------------------------------------------------------------ */
const SCALE = 1.6;                           // diorama → world units
const DIORAMA_CENTER = { x: 28.15, z: 0.35 }; // middle of the island, in the GLB's own coords
const CELL = 0.25;                           // terrain grid resolution (world units)
const BODY_HEIGHT = 2.0;                     // props between the ground and this height block you
const MAX_STEP = 0.3;                        // steeper than this per cell (rock faces) is a wall
const WADE_DEPTH = 0.35;                     // the characters can paddle in water this shallow; past it, only you can go (swimming)
const OCEAN_Y = -0.03;                       // the open sea's surface, just under the island's own water
const SWIMMER = [-0.95, 0.9];                // how far a swimmer reaches below and above the surface (main.js's SWIM_FLOAT)
const BANK_CLIMB = 0.7;                      // you can climb out of the water onto a bank this high above it
// (Where you can swim, the lagoon off the island's cove, is LAGOON in lagoon.js)
let lagoon = null;                           // its raft, floaties, turtles and fish, once the island's loaded

export const BEACH = {
  // High noon: a deep blue sky, paling toward the horizon
  sky: 0xdcf3ff,
  light: { sky: 0xdff0ff, ground: 0xb8a57a, hemi: 1.05, sun: 0xfff1d0, sunIntensity: 2.4 },
  look: { bloom: 0.28, vignette: 0.12, saturation: 1.1, env: 0.35 },
  fog: [45, 170],
  surface: 'sand',
  // Footsteps: the raft's planks out in the lagoon, splashing through shallow water, or sand
  surfaceAt(x, z) {
    if (lagoon?.onRaft(x, z)) return 'wood';
    return this.terrain?.waterAt(this.x + x, this.z + z) != null ? 'water' : 'sand';
  },
  dust: '#fff6e0',
  // Its music (audio.js)
  sound: 'cozy',
  // Portals stand on the sand, or float in the water, once the terrain has loaded.
  // (Load with ?terrain to print a map: the lagoon is the `~`.)
  portalSpots: {
    Gym:      { x: -15.5, z: 2.5, face: { x: 0, z: 2.5 } }, // the west end of the beach, where you come in, facing along it
    Farm:     { x: 12,    z: 11.5, face: { x: 0, z: 2.5 } }, // out in the lagoon, off the east end, facing back at the beach: you swim to it
  },
  // The "press E" sign (text in messages.js): halfway between them, facing the way you come in
  signSpot: { x: -0.5, z: 2.5, face: { x: -15.5, z: 2.5 } },
  // The beach characters hang out on the wide part of the sand, leaving the
  // narrow strip along the water (the way out to the Farm portal) mostly clear
  npcSpots: [
    { npc: 'squid',  x: -17, z: -2  },
    { npc: 'squid',  x: -4,  z: 6   },
    { npc: 'squid',  x: -2,  z: -2  },
    { npc: 'shark',  x: -10, z: -1  },
    { npc: 'shark',  x: -8,  z: -4  },
    { npc: 'shark',  x: -10, z: 9   },
    // mascot.glb holds two octopuses; `part` picks one so each wanders alone
    { npc: 'mascot', part: 0, x: -4,  z: -1  },
    { npc: 'mascot', part: 1, x: -5,  z: 2   },
    { npc: 'mascot', part: 0, x: -11, z: 6   },
    { npc: 'mascot', part: 1, x: -14, z: 7.5 },
  ],
  build: buildBeach,
  // The lagoon: its things bob and swim about, and the raft is something to stand on out there
  update(dt, movers, obstacles, play) { lagoon?.update(dt, play); },
  deckAt: (x, y, z) => lagoon?.deckAt(x, y, z) ?? -Infinity,
};

/* ------------------------------------------------------------------ */
/* TERRAIN BAKE                                                         */
/* Projects every triangle onto a grid from above to find, per cell:    */
/* the ground height, the water height, and whether a prop stands       */
/* there at body height. Runs once after loading (~30k triangles).     */
/* ------------------------------------------------------------------ */
// Props taken out of the diorama: the two white plastic chairs, and the grill
// with its propane tank and the food and cans sitting on it (nodes 207–252,
// minus a surfboard and two cans that lie elsewhere on the sand); the ATV
// (152–192, minus a loose tire beside it); the fire barrel under the sign
// (152–192), the loose tire beside it (163) and the toolbox with its tools
// (197–202); the fire barrel under the sign (260–271); the portable toilet;
// and the wooden changing cabin with the towels hanging on it (255–257, 259)
const REMOVED = new Set([
  'polySurface196', 'polySurface246', 'WC',
  'ChangingCabin1_m_colored_woods_0', 'ChangingCabin1_m_prangeWood_0', 'ChangingCabin1_m_towels_0',
  'polySurface255', 'polySurface256', 'polySurface257', 'polySurface259',
]);
for (let n = 207; n <= 252; n++) if (![210, 211, 247].includes(n)) REMOVED.add('polySurface' + n);
for (let n = 152; n <= 192; n++) REMOVED.add('polySurface' + n);
for (let n = 197; n <= 202; n++) REMOVED.add('polySurface' + n);
for (let n = 260; n <= 271; n++) REMOVED.add('polySurface' + n);

// The surfboards leaning on the cabin share meshes with the ones up at the
// lifeguard house, so only the triangles inside the cabin's footprint go
const CABIN_BOARDS = new Set(['ChangingCabin1_m_surfBoardOldBack_0', 'ChangingCabin1_m_SurfBoards_0']);
const inCabin = (x, z) => x < 2010 && z > 30 && z < 320; // GLB coords

function trimCabinBoards(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position;
  const idx = geo.index ? Array.from(geo.index.array) : [...Array(pos.count).keys()];
  const keep = [];
  for (let k = 0; k < idx.length; k += 3) {
    const tri = idx.slice(k, k + 3);
    if (!tri.every((v) => inCabin(pos.getX(v), pos.getZ(v)))) keep.push(...tri);
  }
  geo.setIndex(keep);
}

// The sand textures are a neutral gray; these tints warm them to golden sand,
// and the patches and tracks laid on top of it, or they'd show up gray against it
const SAND_TINT = { m_Sand: [1.3, 1.08, 0.75], m_SandWetSea: [1.15, 0.95, 0.7], m_seaWeed: [1.3, 1.08, 0.75], m_GrassAndTrack: [1.3, 1.08, 0.75] };

const GROUND = /m_Sand|m_SandWetSea|m_ground|m_Rock|m_rock/;
const WATER = /m_water/;
// Decals, flat clutter and things overhead never block
const SKIP = /grass|Grass|moss|seaWeed|seaDetail|Seagul|SeaGull|PalmTreeTop|treeHair|towel|vines|Stains|dirt/;

function classify(mesh) {
  const name = mesh.material.name;
  if (SKIP.test(name)) return 'skip';
  if (WATER.test(name)) return 'water';
  if (GROUND.test(name)) return 'ground';
  // the base's own boardwalk and edging are ground too; elsewhere wood is a prop
  if (mesh.name.startsWith('Base1') && /m_floorWood1|lambert1/.test(name)) return 'ground';
  return 'solid';
}

function bakeTerrain(root, offsetX, offsetZ, swell) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const ox = box.min.x, oz = box.min.z;
  const nx = Math.ceil((box.max.x - ox) / CELL) + 1;
  const nz = Math.ceil((box.max.z - oz) / CELL) + 1;
  const ground = new Float32Array(nx * nz).fill(-Infinity);
  const water = new Float32Array(nx * nz).fill(-Infinity);
  const blocked = new Uint8Array(nx * nz);
  const afloat = new Uint8Array(nx * nz); // something solid at the water's surface, in a swimmer's way

  const meshes = { ground: [], water: [], solid: [] };
  root.traverse((o) => {
    if (!o.isMesh) return;
    const kind = classify(o);
    if (kind !== 'skip') meshes[kind].push(o);
  });

  // Calls visit(cell, yLow, yHigh) for every cell a triangle covers from above,
  // plus every cell its edges pass over (so walls and poles count too)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  function rasterize(mesh, visit) {
    const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index;
    const count = idx ? idx.count : pos.count;
    const vtx = (k, v) => v.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(mesh.matrixWorld);
    const edge = (p, q) => {
      const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (CELL * 0.5)) + 1;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps, tm = (t0 + t1) / 2;
        const i = Math.round((p.x + (q.x - p.x) * tm - ox) / CELL);
        const j = Math.round((p.z + (q.z - p.z) * tm - oz) / CELL);
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const y0 = p.y + (q.y - p.y) * t0, y1 = p.y + (q.y - p.y) * t1;
        visit(j * nx + i, Math.min(y0, y1), Math.max(y0, y1));
      }
    };
    for (let k = 0; k < count; k += 3) {
      vtx(k, a); vtx(k + 1, b); vtx(k + 2, c);
      edge(a, b); edge(b, c); edge(c, a);
      const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(det) < 1e-9) continue; // vertical: the edges already covered it
      const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - ox) / CELL));
      const i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - ox) / CELL));
      const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - oz) / CELL));
      const j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - oz) / CELL));
      for (let j = j0; j <= j1; j++) {
        const pz = oz + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const px = ox + i * CELL;
          const w1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / det;
          const w2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / det;
          const w3 = 1 - w1 - w2;
          if (w1 < 0 || w2 < 0 || w3 < 0) continue;
          const y = w1 * a.y + w2 * b.y + w3 * c.y;
          visit(j * nx + i, y, y);
        }
      }
    }
  }

  for (const m of meshes.ground) rasterize(m, (cell, lo, hi) => { if (hi > ground[cell]) ground[cell] = hi; });
  for (const m of meshes.water) rasterize(m, (cell, lo, hi) => { if (hi > water[cell]) water[cell] = hi; });
  // The water's surface over each cell: the island's own water, or the open sea
  // wherever the ground dips under it (or there's no island at all)
  const surface = new Float32Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) surface[k] = Math.max(water[k], ground[k] < OCEAN_Y ? OCEAN_Y : -Infinity);
  for (const m of meshes.solid) {
    rasterize(m, (cell, lo, hi) => {
      const g = ground[cell], s = surface[cell];
      if (hi > g + 0.25 && lo < g + BODY_HEIGHT) blocked[cell] = 1;
      if (s > g && hi > s + SWIMMER[0] && lo < s + SWIMMER[1]) afloat[cell] = 1;
    });
  }

  // No-go: off the island, deep water, steep faces; then grow it by a body radius
  const nogo = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, g = ground[k];
      if (g === -Infinity || blocked[k] || water[k] - g > WADE_DEPTH) { nogo[k] = 1; continue; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = ground[(j + dj) * nx + (i + di)];
        if (i + di < 0 || j + dj < 0 || i + di >= nx || j + dj >= nz) continue;
        if (n !== -Infinity && Math.abs(n - g) > MAX_STEP) { nogo[k] = 1; break; }
      }
    }
  }
  const walk = new Uint8Array(nx * nz);
  const R = 2; // cells ≈ 0.5 units, about a body radius
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let ok = 1;
      for (let dj = -R; dj <= R && ok; dj++) {
        for (let di = -R; di <= R; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || nogo[jj * nx + ii]) { ok = 0; break; }
        }
      }
      walk[j * nx + i] = ok;
    }
  }

  // Swimming (only you can): in the lagoon, wherever the water's too deep to wade, and on
  // round the edge of it so it joins up with the beach, keeping a body's width from rocks
  // and anything else sticking out of the water. Steep slopes under the water don't matter,
  // and nor does the drop where the sand meets the water: it's a bank you can climb out
  // onto, unless it's higher than BANK_CLIMB above the water (a rock face)
  const inLagoon = (lx, lz) => Math.hypot(lx - LAGOON.x, lz - LAGOON.z) < LAGOON.r - LAGOON_EDGE;
  const hard = new Uint8Array(nx * nz), deep = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, g = ground[k], s = surface[k];
      deep[k] = s - g > WADE_DEPTH ? 1 : 0;
      if (s > g) { hard[k] = afloat[k]; continue; }
      if (blocked[k]) { hard[k] = 1; continue; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (i + di < 0 || j + dj < 0 || i + di >= nx || j + dj >= nz) continue;
        const n = (j + dj) * nx + (i + di), gn = ground[n], sn = surface[n];
        const tooSteep = sn > gn ? g - sn > BANK_CLIMB : gn !== -Infinity && Math.abs(gn - g) > MAX_STEP;
        if (tooSteep) { hard[k] = 1; break; }
      }
    }
  }
  const swim = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!inLagoon(ox + i * CELL - offsetX, oz + j * CELL - offsetZ)) continue;
      let clear = 1, nearDeep = 0;
      for (let dj = -R; dj <= R && clear; dj++) {
        for (let di = -R; di <= R; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) { nearDeep = 1; continue; } // off the grid is open sea
          const n = jj * nx + ii;
          if (hard[n]) { clear = 0; break; }
          nearDeep |= deep[n];
        }
      }
      swim[k] = clear && (surface[k] > ground[k] || nearDeep) ? 1 : 0;
    }
  }

  const cellOf = (x, z) => {
    const i = Math.round((x - ox) / CELL), j = Math.round((z - oz) / CELL);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  // Bilinear over the four cells round (x, z). Where some of them have nothing
  // (-Infinity), the highest of the rest; `outside` off the grid or with none at all
  const onGrid = (x, z) => x >= ox && z >= oz && x < ox + (nx - 1) * CELL && z < oz + (nz - 1) * CELL;
  const sample = (grid, x, z, outside) => {
    if (!onGrid(x, z)) return outside;
    const fx = (x - ox) / CELL, fz = (z - oz) / CELL;
    const i = Math.floor(fx), j = Math.floor(fz);
    const h = [grid[j * nx + i], grid[j * nx + i + 1], grid[(j + 1) * nx + i], grid[(j + 1) * nx + i + 1]];
    if (h.some((v) => v === -Infinity)) return Math.max(outside, ...h);
    const tx = fx - i, tz = fz - j;
    return (h[0] * (1 - tx) + h[1] * tx) * (1 - tz) + (h[2] * (1 - tx) + h[3] * tx) * tz;
  };
  return {
    heightAt: (x, z) => sample(ground, x, z, 0),
    walkable(x, z) {
      const k = cellOf(x, z);
      return k >= 0 && walk[k] === 1;
    },
    // The water's surface at (x, z), rising and falling with the swell out at sea, or null where it's dry
    waterAt(x, z) {
      if (!onGrid(x, z)) return OCEAN_Y + swell(x, z);
      const s = sample(surface, x, z, -Infinity);
      return s > sample(ground, x, z, -Infinity) ? s + swell(x, z) : null;
    },
    // What's under the water: the sea bed, or -Infinity out where there's no bottom
    bedAt: (x, z) => sample(ground, x, z, -Infinity),
    // Only for you: the lagoon's water, and the beach at its edge
    swimmable(x, z) {
      if (!inLagoon(x - offsetX, z - offsetZ)) return false;
      const k = cellOf(x, z);
      return k < 0 || swim[k] === 1;
    },
    // Out in the lagoon, past the zone's disc
    annex: (x, z) => inLagoon(x - offsetX, z - offsetZ),
    // Debug aid: ASCII map, 1 char per unit, in zone-local coords. `.` is where everyone can
    // walk, `~` where only you can go (swimming), `-` water you can't get to, `#` blocked
    toString() {
      const firstX = Math.ceil(ox - offsetX);
      const rows = [`x of the first column: ${firstX}`];
      for (let z = Math.ceil(oz - offsetZ); z <= oz - offsetZ + nz * CELL; z++) {
        let row = String(z).padStart(4) + ' ';
        for (let x = firstX; x <= ox - offsetX + nx * CELL; x++) {
          const k = cellOf(x + offsetX, z + offsetZ);
          row += k < 0 ? ' ' : walk[k] ? '.' : swim[k] ? '~' : ground[k] === -Infinity ? ' ' : surface[k] > ground[k] ? '-' : '#';
        }
        rows.push(row);
      }
      return rows.join('\n');
    },
    // Debug aid: how deep the water is (in tenths, capped at 9), `.` dry, ` ` no ground
    depthMap() {
      const firstX = Math.ceil(ox - offsetX);
      const rows = [`x of the first column: ${firstX}`];
      for (let z = Math.ceil(oz - offsetZ); z <= oz - offsetZ + nz * CELL; z++) {
        let row = String(z).padStart(4) + ' ';
        for (let x = firstX; x <= ox - offsetX + nx * CELL; x++) {
          const k = cellOf(x + offsetX, z + offsetZ);
          const d = k < 0 ? 0 : surface[k] - ground[k];
          row += k < 0 || ground[k] === -Infinity ? ' ' : d <= 0 ? '.' : String(Math.min(9, Math.floor(d * 10)));
        }
        rows.push(row);
      }
      return rows.join('\n');
    },
  };
}

/* ------------------------------------------------------------------ */
/* MOVING WATER                                                         */
/* Patches a standard material so its surface ripples. Everything is in */
/* world space, so the ocean and the diorama's water line up. The open  */
/* ocean also gets a real rolling swell (WATER_SWELL), which dies down  */
/* near the island so it never pokes up through the beach.             */
/* ------------------------------------------------------------------ */
const SWELL_CALM = 19;   // no swell inside this radius of the island center...
const SWELL_FULL = 27;   // ...full swell beyond this one
const RIPPLE_NEAR = 10;  // ripples start fading this far from the camera...
const RIPPLE_FAR = 34;   // ...and are gone here, or far-off water turns into shimmering moire
const SHORE_FADE = 13;   // the island's own water starts turning into the ocean's color here...
const SHORE_END = 18.5;  // ...and is the same as the ocean at its rim, so no line shows between them
// The swell: long, slow waves rolling in toward the beach. [direction x, z, wavelength,
// height, speed]. The ocean's shader and swellAt() below both work from this list
const SWELL = [[0.3, -1.0, 11, 0.09, 1.6], [-0.6, -0.8, 6.5, 0.05, 1.2], [0.9, -0.4, 4, 0.025, 1.0]];
const glslFloat = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// How far the swell lifts the sea at world (x, z) right now, around an island centered on (cx, cz).
// Things afloat (and you, swimming) ride on this, in step with the ocean the shader draws
export function swellAt(x, z, cx, cz, time = performance.now() / 1000) {
  const d = Math.hypot(x - cx, z - cz);
  if (d <= SWELL_CALM) return 0;
  const t = Math.min(1, (d - SWELL_CALM) / (SWELL_FULL - SWELL_CALM));
  let h = 0;
  for (const [dx, dz, len, amp, speed] of SWELL) {
    const n = Math.hypot(dx, dz);
    h += amp * Math.sin((2 * Math.PI / len) * ((dx * x + dz * z) / n - speed * time));
  }
  return t * t * (3 - 2 * t) * h; // smoothstep, as in the shader
}

const WATER_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec2 uCenter;
  uniform vec3 uOcean;
  varying vec3 vWaterWorld;
  // One travelling sine: (height, d/dx, d/dz)
  vec3 waterWave(vec2 p, vec2 dir, float len, float amp, float speed) {
    float k = 6.2831853 / len;
    float ph = k * (dot(normalize(dir), p) - speed * uTime);
    return vec3(amp * sin(ph), amp * k * cos(ph) * normalize(dir));
  }
  // Long, slow waves rolling in toward the beach
  vec3 waterSwell(vec2 p) {
    float mask = smoothstep(${SWELL_CALM.toFixed(1)}, ${SWELL_FULL.toFixed(1)}, distance(p, uCenter));
    return mask * (${SWELL.map(([dx, dz, len, amp, speed]) =>
      `waterWave(p, vec2(${glslFloat(dx)}, ${glslFloat(dz)}), ${glslFloat(len)}, ${glslFloat(amp)}, ${glslFloat(speed)})`).join('\n                 + ')});
  }
  // Small fast ripples, only used for shading
  vec3 waterRipples(vec2 p) {
    return waterWave(p, vec2(1.0, 0.2), 1.7, 0.035, 0.6)
         + waterWave(p, vec2(-0.4, 1.0), 1.1, 0.025, 0.5)
         + waterWave(p, vec2(-1.0, -0.7), 0.7, 0.015, 0.4);
  }
`;

function makeWaterMove(material, uniforms, swell) {
  if (swell) material.defines = { ...material.defines, WATER_SWELL: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + WATER_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef WATER_SWELL
          transformed.y += waterSwell(vWaterWorld.xz).x; // the ocean has no rotation or scale
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WATER_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rippleFade = 1.0 - smoothstep(${RIPPLE_NEAR.toFixed(1)}, ${RIPPLE_FAR.toFixed(1)}, distance(cameraPosition, vWaterWorld));
        vec3 ripple = waterRipples(vWaterWorld.xz) * rippleFade;
        vec2 waterSlope = ripple.yz;
        #ifdef WATER_SWELL
          waterSlope += waterSwell(vWaterWorld.xz).yz;
        #else
          float toOcean = smoothstep(${SHORE_FADE.toFixed(1)}, ${SHORE_END.toFixed(1)}, distance(vWaterWorld.xz, uCenter));
          diffuseColor.rgb = mix(diffuseColor.rgb, uOcean, toOcean);
        #endif
        // Bright wobbly lines where ripples cross, like light dancing on the water
        diffuseColor.rgb += 0.12 * pow(max(0.0, 1.0 - abs(ripple.x) * 22.0), 4.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifndef WATER_SWELL
          normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, toOcean));
        #endif
        normal = normalize(normal + (viewMatrix * vec4(-waterSlope.x, 0.0, -waterSlope.y, 0.0)).xyz);`);
  };
}

/* ------------------------------------------------------------------ */
/* SUN                                                                  */
/* A billboard in the sky: a bright disc, a soft glow, and slowly       */
/* turning rays. It rides along with the camera so it looks infinitely  */
/* far away, on the same side as the directional light in main.js       */
/* (offset +20, +10), but lower so it's in view over the sea.           */
/* ------------------------------------------------------------------ */
const SUN_DIR = new THREE.Vector3(20, 14, 10).normalize();
const SUN_DISTANCE = 150; // inside the camera's far plane (200)
const SUN_SIZE = 90;      // billboard width; the disc itself is a small part of it

function makeSun() {
  const uniforms = { uTime: { value: 0 } };
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;     // 0 at the center, 1 at the billboard edge
          float a = atan(p.y, p.x);
          float disc = smoothstep(0.11, 0.1, r);
          float glow = exp(-r * 9.0) * 0.9 + exp(-r * 3.5) * 0.25;
          // Two sets of rays turning opposite ways, so they shimmer
          float rays = pow(0.5 + 0.5 * sin(a * 12.0 + uTime * 0.15), 6.0)
                     + 0.6 * pow(0.5 + 0.5 * sin(a * 7.0 - uTime * 0.1 + 1.3), 8.0);
          rays *= smoothstep(0.08, 0.14, r) * (1.0 - smoothstep(0.2, 1.0, r)) * 0.45;
          vec3 color = vec3(1.0, 0.97, 0.85) * disc
                     + vec3(1.0, 0.85, 0.45) * (glow + rays);
          gl_FragColor = vec4(color, 1.0);
        }`,
    })
  );
  sun.frustumCulled = false; // it's moved to the camera just before drawing
  sun.renderOrder = -1;      // first of the see-through things; the island still hides it (depth test)
  sun.onBeforeRender = (renderer, scene, camera) => {
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, SUN_DISTANCE);
    sun.quaternion.copy(camera.quaternion);
    sun.updateMatrixWorld();
    uniforms.uTime.value = performance.now() / 1000;
  };
  return sun;
}

/* ------------------------------------------------------------------ */
/* GULLS: a few white birds wheeling out over the water                 */
/* ------------------------------------------------------------------ */
const GULLS = 7;
const WING_GEO = new THREE.BufferGeometry();
// Half a wing, from the shoulder out along +X, swept back at the tip
WING_GEO.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, 0, 0, -0.12, 0.42, 0, -0.1, 0.42, 0, -0.1, 0, 0, 0.1, 0.5, 0, -0.22], 3));
WING_GEO.computeVertexNormals();
const GULL_BODY_GEO = new THREE.SphereGeometry(0.08, 8, 6).scale(0.8, 0.8, 2.2);

function addGulls(zone) {
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide });
  const gulls = Array.from({ length: GULLS }, (_, i) => {
    const bird = new THREE.Group();
    const wings = [-1, 1].map((s) => {
      const wing = new THREE.Mesh(WING_GEO, white);
      wing.scale.x = s;
      bird.add(wing);
      return wing;
    });
    bird.add(new THREE.Mesh(GULL_BODY_GEO, white));
    bird.scale.setScalar(1.2 + Math.random() * 0.5);
    zone.group.add(bird);
    return {
      bird, wings,
      r: 22 + Math.random() * 26, y: 9 + Math.random() * 11,
      // Out over the sea, on the island's +Z side, each on its own slow circle
      cx: zone.x + (Math.random() - 0.5) * 30, cz: zone.z + 26 + Math.random() * 20,
      speed: (0.09 + Math.random() * 0.07) * (i % 2 ? 1 : -1),
      phase: Math.random() * 6.28, flap: 5 + Math.random() * 3,
    };
  });
  gulls[0].bird.children[2].frustumCulled = false; // it ticks the whole flock, on screen or off
  gulls[0].bird.children[2].onBeforeRender = () => { // only ticks while Hawaii is shown
    const t = performance.now() / 1000;
    for (const g of gulls) {
      const a = t * g.speed + g.phase;
      g.bird.position.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(a * 2.3) * 1.2, g.cz + Math.sin(a) * g.r);
      g.bird.rotation.y = -a + (g.speed > 0 ? Math.PI : 0);
      g.bird.rotation.z = (g.speed > 0 ? 1 : -1) * 0.25; // banking into the turn
      // Flap for a while, then glide
      const flap = Math.sin(t * g.flap) * (Math.sin(t * 0.5 + g.phase) > -0.2 ? 0.55 : 0.08);
      g.wings[0].rotation.z = -flap;
      g.wings[1].rotation.z = flap;
    }
  };
}

// The island's own water stands up to 0.45 above the sea round it at its rim: a ledge you'd
// see from out in the lagoon. So its surface eases down to the sea's level over its last few
// units (where the shader already fades its color into the ocean's). `above`: the world height
// that splits its surface from the sea bed under it, which stays put
const RIM_FROM = 13, RIM_TO = 18;
function lowerWaterRim(island, zone, above) {
  island.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  island.traverse((o) => {
    if (!o.isMesh || !WATER.test(o.material.name)) return;
    const pos = o.geometry.attributes.position, toLocal = o.matrixWorld.clone().invert();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y < above) continue;
      const t = Math.min(1, Math.max(0, (Math.hypot(v.x - zone.x, v.z - zone.z) - RIM_FROM) / (RIM_TO - RIM_FROM)));
      v.y += (OCEAN_Y + 0.01 - v.y) * t * t * (3 - 2 * t);
      v.applyMatrix4(toLocal);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    o.geometry.computeBoundingBox();
    o.geometry.computeBoundingSphere();
  });
}

/* ------------------------------------------------------------------ */
/* BUILD THE ZONE                                                       */
/* ------------------------------------------------------------------ */
// Resolves once the island is in place and zone.terrain is ready
function buildBeach(zone, addObstacle) {
  zone.group.add(skyDome(zone.x, zone.z, { horizon: zone.sky, mid: '#7ccaff', top: '#2a84e0' }), clouds(zone.x, zone.z, { count: 12 }));
  addGulls(zone);

  // Endless sea around the island; the diorama's own water sits right on top.
  // Laid flat in the geometry itself (not via rotation) so the swell can push along y.
  const OCEAN = 0x2a9fa6;
  const waterUniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector2(zone.x, zone.z) }, uOcean: { value: new THREE.Color(OCEAN) } };
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 256, 256).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: OCEAN, roughness: 0.35, metalness: 0 })
  );
  makeWaterMove(ocean.material, waterUniforms, true);
  ocean.position.set(zone.x, -0.03, zone.z);
  ocean.receiveShadow = true;
  ocean.onBeforeRender = () => { waterUniforms.uTime.value = performance.now() / 1000; }; // only ticks while Hawaii is shown
  zone.group.add(ocean);
  zone.group.add(makeSun());

  return modelLoader().loadAsync(BEACH_GLB).then((gltf) => {
    const island = gltf.scene;
    island.scale.setScalar(SCALE);
    island.position.set(zone.x - DIORAMA_CENTER.x * SCALE, 0, zone.z - DIORAMA_CENTER.z * SCALE);
    const removed = [];
    island.traverse((o) => { if (REMOVED.has(o.name)) removed.push(o); });
    for (const o of removed) o.removeFromParent(); // before the bake, so their spots are walkable
    island.traverse((o) => {
      if (!o.isMesh) return;
      if (CABIN_BOARDS.has(o.name)) trimCabinBoards(o);
      o.castShadow = true;
      o.receiveShadow = true;
      const tint = SAND_TINT[o.material.name];
      if (tint) o.material.color.setRGB(...tint);
      if (o.material.name === 'm_grass') o.material.color.setRGB(1.05, 1, 0.62); // dry dune grass, not black scribbles
      if (o.material.map) o.material.map.anisotropy = 16;
      if (o.material.alphaTest > 0) o.material.alphaToCoverage = true; // softer edges on the plants
      if (WATER.test(o.material.name)) {
        o.material.roughness = 0.35; // a bit glossier so the ripples catch the sun
        makeWaterMove(o.material, waterUniforms, false);
      }
    });
    zone.group.add(island);

    // Drop the island so the lowest point of its (wavy) sea surface sits at y = 0,
    // just above the ocean plane. The water mesh also has seabed verts; skip those.
    island.updateMatrixWorld(true);
    const ys = [];
    const v = new THREE.Vector3();
    island.traverse((o) => {
      if (!o.isMesh || !WATER.test(o.material.name)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) ys.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y);
    });
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    island.position.y = -Math.min(...ys.filter((y) => y > mid));
    lowerWaterRim(island, zone, mid + island.position.y);

    zone.terrain = bakeTerrain(island, zone.x, zone.z, (x, z) => swellAt(x, z, zone.x, zone.z));
    if (new URLSearchParams(location.search).has('terrain')) console.log('\n' + zone.terrain + '\n\nWater depth (tenths):\n' + zone.terrain.depthMap());
    lagoon = makeLagoon(zone, addObstacle);
  }).catch((err) => console.warn('Hawaii diorama failed to load:', BEACH_GLB, err));
}
