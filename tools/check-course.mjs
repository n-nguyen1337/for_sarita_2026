// Tests every jump on the gym's course against the game's real physics, read out of src/main.js.
// Run it after changing src/gymcourse.js: node tools/check-course.mjs
import { readFileSync } from 'node:fs';
import { CEILING, COVER, CYCLE, PIT_TOP, PIT_WEST, PLATFORMS, TRENCH, gapBetween, moveTo, rimAt } from '../src/gymcourse.js';

const MAX_RISE = 0.9;      // the biggest step up we ask for
const COMFORT = 0.75;      // ask for no more than this share of the furthest a jump can reach
const CAMERA_ROOM = 3.9 + 1.5; // the camera's height over you, plus a bit
const RIM_CLEARANCE = 1.5; // a rim stays this far over a platform, so you can't jump up on to it
const STEP_UP = 0.3;       // STEP_UP in main.js: how far you can be below a top and still get lifted on to it
const BODY = 0.4;          // BODY in gymcourse.js: how close to a side you can be
const WALL_MARGIN = 0.5;   // how close to the trench's walls you can be
const MIN_WINDOW = 1;      // a moving platform has to be comfortably in reach for this many seconds of each cycle
const SAMPLES = 240;       // how many moments of the cycle to test moving platforms at

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const constant = (name) => Number(main.match(new RegExp(`const ${name} = ([\\d.]+)`))[1]);
const SPEED = constant('PLAYER_SPEED'), GRAVITY = constant('GRAVITY'), JUMP = constant('JUMP_VELOCITY');

const peak = JUMP ** 2 / (2 * GRAVITY);
// How long a jump is in the air before you land `rise` higher (or null if it can't get there)
function airTime(rise) {
  const under = JUMP ** 2 - 2 * GRAVITY * rise;
  return under < 0 ? null : (JUMP + Math.sqrt(under)) / GRAVITY;
}
const reach = (rise) => (airTime(rise) === null ? null : SPEED * airTime(rise));

let problems = 0;
const problem = (text) => { problems++; console.log(`  PROBLEM: ${text}`); };

// The same jump as below, but off and on to platforms that are moving: you take off at time t
// with the speed of the one you're on, and land on the other wherever it's got to by then
function jumpAt(t, from, p) {
  moveTo(t);
  const off = { ...from };
  const guess = airTime(p.y - off.y);
  if (guess === null) return { gap: Infinity, rise: p.y - off.y, far: 0, share: Infinity };
  moveTo(t + guess);
  const rise = p.y - off.y, air = airTime(rise);
  if (air === null) return { gap: Infinity, rise, far: 0, share: Infinity };
  moveTo(t + air);
  const carried = { ...off, x: off.x + (off.vx ?? 0) * air, z: off.z + (off.vz ?? 0) * air };
  const gap = Math.max(0, gapBetween(carried, p)), far = SPEED * air;
  return { gap, rise: p.y - off.y, far, share: gap / far };
}

console.log(`A jump rises ${peak.toFixed(2)} and carries ${reach(0).toFixed(2)} on the flat\n`);
console.log(' #   gap  rise  reach  share');
const moments = Array.from({ length: SAMPLES }, (_, s) => (s / SAMPLES) * CYCLE);
const inPlace = (p, i) => {
  const halfW = (p.w ?? p.r * 2) / 2;
  if (p.x - halfW < TRENCH.west || p.x + halfW > TRENCH.east ||Math.abs(p.z) + (p.d ?? p.r * 2) / 2 > TRENCH.halfZ) return `${i} sticks out of the trench`;
  if (rimAt(p.x) - p.y < RIM_CLEARANCE) return `${i} is only ${(rimAt(p.x) - p.y).toFixed(1)} below the rim`;
  if (p.y + CAMERA_ROOM > CEILING) return `${i} leaves no room for the camera under the ceiling`;
  if (p.x > PIT_WEST && p.y < PIT_TOP) return `${i} is so low that standing on it counts as falling into the pit`;
  return null;
};
PLATFORMS.forEach((p, i) => {
  const from = PLATFORMS[i - 1];
  // Anywhere a moving platform goes has to be somewhere it can be, and clear of everything else
  if (p.move) {
    const found = new Set();
    for (const t of moments) {
      moveTo(t);
      const wrong = inPlace(p, i);
      if (wrong) found.add(wrong);
      for (const [j, q] of PLATFORMS.entries()) if (q !== p && gapBetween(p, q) <= 0) found.add(`${i} runs into ${j}`);
    }
    found.forEach(problem);
  } else {
    const wrong = inPlace(p, i);
    if (wrong) problem(wrong);
  }
  // With something moving at either end: how long in each cycle the jump's comfortably in reach
  if (p.move || from?.move) {
    const jumps = moments.map((t) => jumpAt(t, from, p));
    const ok = jumps.filter((j) => j.rise <= MAX_RISE && j.share <= COMFORT);
    const best = jumps.reduce((a, b) => (b.share < a.share ? b : a));
    const window = (ok.length / SAMPLES) * CYCLE;
    moveTo(0);
    console.log(`${String(i).padStart(2)}  ${best.gap.toFixed(2).padStart(4)}  ${best.rise.toFixed(1).padStart(4)}  ${best.far.toFixed(2).padStart(5)}  ${(best.share * 100).toFixed(0).padStart(4)}%${p.deck ? '  deck' : ''}  in reach for ${window.toFixed(1)}s of each ${CYCLE}s`);
    if (window < MIN_WINDOW) problem(`the jump to ${i} is only in reach for ${window.toFixed(1)}s of each cycle`);
    return;
  }
  // The first platform is jumped to from the floor, and only its height matters
  const gap = from ? gapBetween(from, p) : 0, rise = p.y - (from?.y ?? 0);
  const far = reach(rise);
  const share = far ? gap / far : Infinity;
  console.log(`${String(i).padStart(2)}  ${gap.toFixed(2).padStart(4)}  ${rise.toFixed(1).padStart(4)}  ${far?.toFixed(2).padStart(5)}  ${(share * 100).toFixed(0).padStart(4)}%${p.deck ? '  deck' : ''}`);
  if (rise > MAX_RISE) problem(`the step up to ${i} is ${rise.toFixed(2)}, over ${MAX_RISE}`);
  if (share > COMFORT) problem(`the jump to ${i} takes ${(share * 100).toFixed(0)}% of a jump's reach`);
  if (from && gap <= 0 && !p.stair && !p.ground && !from.stair) problem(`${i} touches the one before it`);
});

// The flat floor's cover: on the floor, out of jumping reach, and with a way through it
const floor = PLATFORMS.find((p) => p.ground);
for (const [i, c] of COVER.entries()) {
  if (Math.abs(c.x - floor.x) + c.w / 2 > floor.w / 2 || Math.abs(c.z) + c.d / 2 > TRENCH.halfZ) problem(`cover ${i} sticks out of the floor`);
  if (c.y - c.floor <= peak + STEP_UP) problem(`you can jump on to cover ${i}`);
}
const STEP = 0.2;
const open = (x, z) => COVER.every((c) => Math.hypot(Math.max(0, Math.abs(x - c.x) - c.w / 2), Math.max(0, Math.abs(z - c.z) - c.d / 2)) >= BODY);
const west = floor.x - floor.w / 2, east = floor.x + floor.w / 2, edge = TRENCH.halfZ - WALL_MARGIN;
const seen = new Set(), todo = [];
const visit = (ix, iz) => {
  const key = `${ix},${iz}`;
  if (seen.has(key) || ix < 0 || west + ix * STEP > east || Math.abs(iz * STEP) > edge || !open(west + ix * STEP, iz * STEP)) return;
  seen.add(key);
  todo.push([ix, iz]);
};
for (let iz = -Math.floor(edge / STEP); iz * STEP <= edge; iz++) visit(0, iz);
let through = false;
while (todo.length) {
  const [ix, iz] = todo.pop();
  if (west + (ix + 1) * STEP > east) through = true;
  visit(ix + 1, iz); visit(ix - 1, iz); visit(ix, iz + 1); visit(ix, iz - 1);
}
console.log(`\nCover: ${COVER.length} stacks, ${through ? 'with' : 'WITHOUT'} a way through`);
if (!through) problem('the cover blocks the whole floor');

console.log(problems ? `\n${problems} problem(s)` : `\nAll ${PLATFORMS.length} platforms are fine`);
process.exit(problems ? 1 : 0);
