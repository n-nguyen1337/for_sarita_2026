/* ------------------------------------------------------------------ */
/* THE GYM'S TRENCH: a long, narrow corridor with a pit along the      */
/* bottom. You go east along it, first over a flat floor between stacks */
/* of mats to hide behind, then zigzagging between ledges that stick   */
/* out of the side walls, and last of all over platforms that move,    */
/* with the gym characters up on the rims on both sides, throwing      */
/* things. Coordinates are local to the zone's center (TRENCH says     */
/* where the room's ends are around it), and `y` is the                */
/* height of a platform's top. A platform has `r` if it's round, or    */
/* `w` (along X) and `d` (along Z) if it's a box.                      */
/*                                                                      */
/* `move` makes a platform swing to and fro around where it's listed:  */
/* `x`, `y` and `z` are how far it goes each way, and `phase` is where */
/* in the cycle it starts, as a share of CYCLE.                        */
/*                                                                      */
/* `deck` marks the wide, safe checkpoints: fall into the pit and you  */
/* go back up to one. Run `node tools/check-course.mjs` after changing */
/* any of this: it tests every jump against the game's real physics.   */
/* There's nothing but numbers in this file, so that tool can read it. */
/* ------------------------------------------------------------------ */
// The trench runs from `west` to `east`, and its walls stand at `halfZ` either side.
// It's longer to the west than the east, for the flat floor, so the room's middle is at `midX`
export const TRENCH = { west: -105, east: 85, halfZ: 6 };
TRENCH.midX = (TRENCH.west + TRENCH.east) / 2;
TRENCH.halfX = (TRENCH.east - TRENCH.west) / 2; // half the room's length, from `midX`
export const HALL_HALF_Z = 16;                 // the room's outer walls, past the rims
export const CEILING = 24;
export const PIT_WEST = -22;                   // the pit starts here, past the flat floor
export const PIT_TOP = 4;                      // nothing to stand on over the pit is lower than this, so below it you've fallen
export const CYCLE = 5;                        // the seconds a moving platform takes to go there and back. They all share it, so they stay in step

// The tops of the trench's walls, stepping up as the course does, so the
// characters stand about level with you: [from x, to x, height]
export const RIMS = [[TRENCH.west, -14, 8.5], [-14, 32, 10.5], [32, TRENCH.east, 13]];
export const rimAt = (x) => RIMS.find(([, to]) => x <= to)[2];

// A ledge sticks out of the south wall (side 1) or the north wall (side -1)
const ledge = (x, side, y, w, d, move) => ({ x, z: side * (TRENCH.halfZ - d / 2), y, w, d, move });
const stair = (x, y, w = 3) => ({ x, z: 0, y, w, d: TRENCH.halfZ * 2, solid: true, stair: true });
const deck = (x, y, w, more) => ({ x, z: 0, y, w, d: TRENCH.halfZ * 2, deck: true, ...more });

// A flight of `steps` equal stairs, wall to wall, going up east from height y0 at x0 to
// a deck's edge at x1, height y1. You walk it as a smooth slope through the middle of
// each step (see SLOPES), so you go up without bumping from step to step
function flight(x0, x1, y0, y1, steps) {
  const run = (x1 - x0) / steps, rise = (y1 - y0) / (steps + 1);
  const stairs = Array.from({ length: steps }, (_, i) => stair(x0 + run * (i + 0.5), y0 + rise * (i + 1), run));
  const slope = { x0, x1, z: 0, d: TRENCH.halfZ * 2, stair: true, points: [[x0, y0], ...stairs.map((s) => [s.x, s.y]), [x1, y1]] };
  for (const s of stairs) s.slope = slope;
  return stairs;
}

const FLOOR_Y = 4.8;

export const PLATFORMS = [
  // Up the stairs from the K-Town door, to the first deck
  ...flight(-97, -82, 0, FLOOR_Y, 19),
  deck(-78.5, FLOOR_Y, 7, { solid: true, stair: true }),
  // Section 1: a long flat floor, wall to wall, with nothing to fall off (see COVER), and
  // stairs up to the next deck
  { x: -51, z: 0, y: FLOOR_Y, w: 48, d: TRENCH.halfZ * 2, solid: true, ground: true },
  ...flight(-27, -22, FLOOR_Y, 6.1, 4),
  deck(-18, 6.1, 8),
  // Section 2: a little smaller
  ledge(-10, -1, 6.4, 4.5, 5),
  ledge(-4, 1, 6.7, 4.5, 5),
  ledge(2, -1, 7, 4.5, 5),
  { x: 8.5, z: 0, y: 7.3, r: 2.2 },
  ledge(15, 1, 7.6, 4, 5),
  ledge(20.5, -1, 7.9, 4, 5),
  deck(28, 8.2, 8),
  // Section 3: everything moves, up to the finish. Each one comes closest to the next half
  // a cycle after it came closest to the one before, so you ride, hop, ride, hop. The lift
  // has to be near the top of its ride to reach the one after it
  ledge(36.5, 1, 8.5, 4, 5, { x: 1.5, phase: 0.25 }),
  { x: 43, z: 0, y: 8.8, r: 2, move: { z: 3, phase: 0.25 } },
  ledge(49.5, -1, 9.1, 4, 5, { x: 1.5, phase: 0.25 }),
  ledge(56, 1, 9.6, 4, 6, { y: 1, phase: 0.75 }),
  { x: 61.25, z: 0, y: 10, w: 3.5, d: 4, move: { z: 3, phase: 0.75 } },
  ledge(67, -1, 10.3, 3.5, 5, { x: 1, phase: 0.75 }),
  deck(78, 10.6, 14, { finish: true, songEnds: true }), // `songEnds`: landing here fades the music away
];
export const DECKS = PLATFORMS.filter((p) => p.deck);
export const FINISH = DECKS[DECKS.length - 1];

// The cover on section 1's floor: stacks of gym mats that stop anything thrown at you.
// They're too tall to jump on to. [x, z, w, d]: mostly barricades off alternate walls,
// with a pair to squeeze between and a block in the middle to go round
const COVER_TALL = 2;
export const COVER = [
  [-70, 2.75, 1.5, 6.5],
  [-64, -2.75, 1.5, 6.5],
  [-57, -3.75, 3, 4.5],
  [-57, 3.75, 3, 4.5],
  [-50, -2.75, 1.5, 6.5],
  [-44, 2.75, 1.5, 6.5],
  [-38, 0, 3, 3],
  [-32, -2.75, 1.5, 6.5],
  [-32, 4.5, 1.5, 3],
].map(([x, z, w, d]) => ({ x, z, w, d, y: FLOOR_Y + COVER_TALL, floor: FLOOR_Y, solid: true }));
const SOLIDS = [...PLATFORMS, ...COVER];
const SLOPES = [...new Set(PLATFORMS.map((p) => p.slope).filter(Boolean))];

// How high a flight of stairs is to walk on at (x, z), or null off it: along a line
// through the middle of each step, so you're never more than half a step off its top
function slopeHeight(s, x, z) {
  if (x < s.x0 || x > s.x1 || Math.abs(z - s.z) > s.d / 2) return null;
  const { points } = s;
  let i = 1;
  while (i < points.length - 1 && points[i][0] < x) i++;
  const [ax, ay] = points[i - 1], [bx, by] = points[i];
  return ay + ((x - ax) / (bx - ax)) * (by - ay);
}

const THICKNESS = 0.5;
const FOOT = 0.3;         // your middle can be this far past an edge and you're still standing on it
const BODY = 0.4;         // ...but a platform's side keeps it this far off when you're down beside it

for (const p of SOLIDS) p.bottom = p.solid ? 0 : p.y - THICKNESS;

const MOVING = PLATFORMS.filter((p) => p.move);
for (const p of MOVING) p.home = { x: p.x, y: p.y, z: p.z };

// Puts the moving platforms where they are at time t, and works out how fast they're going
export function moveTo(t) {
  const turn = (2 * Math.PI) / CYCLE;
  for (const p of MOVING) {
    const { x = 0, y = 0, z = 0, phase = 0 } = p.move;
    const angle = turn * t + 2 * Math.PI * phase;
    const out = Math.sin(angle), speed = Math.cos(angle) * turn;
    p.x = p.home.x + x * out;
    p.y = p.home.y + y * out;
    p.z = p.home.z + z * out;
    p.bottom = p.y - THICKNESS;
    p.vx = x * speed;
    p.vz = z * speed;
  }
}
moveTo(0);
let clock = 0;

// How far (x, z) is past the edge of a platform's footprint: negative is inside it
function pastEdge(p, x, z) {
  if (p.r) return Math.hypot(x - p.x, z - p.z) - p.r;
  const dx = Math.abs(x - p.x) - p.w / 2, dz = Math.abs(z - p.z) - p.d / 2;
  if (dx <= 0 || dz <= 0) return Math.max(dx, dz);
  return Math.hypot(dx, dz);
}

// The closest edge-to-edge distance between two platforms, seen from above
export function gapBetween(a, b) {
  const radius = (p) => p.r ?? 0;
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.w ?? 0) / 2 - (b.w ?? 0) / 2);
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.d ?? 0) / 2 - (b.d ?? 0) / 2);
  return Math.hypot(dx, dz) - radius(a) - radius(b);
}

// A jump off the floor can't reach the undersides (every ledge is well above head height),
// so nothing here needs to handle bumping your head
export const COURSE = {
  pitWest: PIT_WEST,
  pitTop: PIT_TOP,
  checkpoint: DECKS[0], // the deck a fall takes you back up to

  advance(dt) {
    moveTo(clock += dt);
  },

  // The highest thing to stand on at or below height y: a platform, or else the floor
  surfaceBelow(x, y, z) {
    // Nothing hangs over the stairs, so on them it's the slope you walk them by
    for (const s of SLOPES) {
      const h = slopeHeight(s, x, z);
      if (h !== null && h <= y) return h;
    }
    let best = 0;
    for (const p of SOLIDS) {
      if (p.slope && slopeHeight(p.slope, x, z) === null) continue; // past the slope's ends, a step's edge isn't something to stand on
      if (p.y > best && p.y <= y && pastEdge(p, x, z) <= FOOT) best = p.y;
    }
    return best;
  },

  // The platform at that height, if it's one you're standing on
  platformAt(x, y, z) {
    return SLOPES.find((s) => slopeHeight(s, x, z) === y)
      ?? PLATFORMS.find((p) => p.y === y && pastEdge(p, x, z) <= FOOT) ?? null;
  },

  // The cover that something of radius r has run into the side of, if any
  coverAt(x, y, z, r) {
    return COVER.find((c) => y - r < c.y - 0.01 && pastEdge(c, x, z) < r) ?? null;
  },

  // Keep a body out of the side of any platform it's level with. `pos` is local, and
  // `stepUp` is how far below a top your feet can be and still get lifted onto it
  pushOut(pos, height, stepUp) {
    for (const p of SOLIDS) {
      if (pos.y + stepUp >= p.y || pos.y + height <= p.bottom) continue;
      const past = pastEdge(p, pos.x, pos.z);
      if (past >= BODY) continue;
      if (p.r) {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz) || 1;
        pos.x = p.x + (dx / d) * (p.r + BODY);
        pos.z = p.z + (dz / d) * (p.r + BODY);
        continue;
      }
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const hx = p.w / 2 + BODY, hz = p.d / 2 + BODY;
      if (Math.abs(dx) >= p.w / 2 && Math.abs(dz) >= p.d / 2) { // off a corner: round it
        const cx = p.x + Math.sign(dx) * p.w / 2, cz = p.z + Math.sign(dz) * p.d / 2;
        const ox = pos.x - cx, oz = pos.z - cz, d = Math.hypot(ox, oz) || 1;
        pos.x = cx + (ox / d) * BODY;
        pos.z = cz + (oz / d) * BODY;
      } else if (hx - Math.abs(dx) < hz - Math.abs(dz)) { // out the nearer side
        pos.x = p.x + Math.sign(dx || 1) * hx;
      } else {
        pos.z = p.z + Math.sign(dz || 1) * hz;
      }
    }
  },
};
