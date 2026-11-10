/* ------------------------------------------------------------------ */
/* THE GYM'S TRENCH: a long, narrow corridor with a pit along the      */
/* bottom. You go east along it, first over a flat floor between stacks */
/* of mats to hide behind, then zigzagging between ledges that stick   */
/* out of the side walls, and last of all over platforms that move,    */
/* with the gym characters up on the rims on both sides, throwing      */
/* things. Coordinates are local to the room's center, and `y` is the  */
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
export const TRENCH = { halfX: 85, halfZ: 6 }; // halfZ is where the trench's walls stand
export const HALL_HALF_Z = 16;                 // the room's outer walls, past the rims
export const CEILING = 24;
export const PIT_WEST = -22;                   // the pit starts here, past the flat floor
export const PIT_TOP = 4;                      // nothing to stand on over the pit is lower than this, so below it you've fallen
export const CYCLE = 6;                        // the seconds a moving platform takes to go there and back. They all share it, so they stay in step

// The tops of the trench's walls, stepping up as the course does, so the
// characters stand about level with you: [from x, to x, height]
export const RIMS = [[-TRENCH.halfX, -14, 8.5], [-14, 32, 10.5], [32, TRENCH.halfX, 13]];
export const rimAt = (x) => RIMS.find(([, to]) => x <= to)[2];

// A ledge sticks out of the south wall (side 1) or the north wall (side -1)
const ledge = (x, side, y, w, d, move) => ({ x, z: side * (TRENCH.halfZ - d / 2), y, w, d, move });
const stair = (x, y, w = 3) => ({ x, z: 0, y, w, d: TRENCH.halfZ * 2, solid: true, stair: true });
const deck = (x, y, w, more) => ({ x, z: 0, y, w, d: TRENCH.halfZ * 2, deck: true, ...more });

const FLOOR_Y = 4.8;

export const PLATFORMS = [
  // Up the stairs from the K-Town door, to the first deck
  stair(-75.5, 0.8), stair(-72.5, 1.6), stair(-69.5, 2.4), stair(-66.5, 3.2), stair(-63.5, 4),
  deck(-58.5, FLOOR_Y, 7, { solid: true, stair: true }),
  // Section 1: a flat floor, wall to wall, with nothing to fall off (see COVER), and
  // steps low enough to walk up to the next deck
  { x: -41, z: 0, y: FLOOR_Y, w: 28, d: TRENCH.halfZ * 2, solid: true, ground: true },
  stair(-26.375, 5.06, 1.25), stair(-25.125, 5.32, 1.25), stair(-23.875, 5.58, 1.25), stair(-22.625, 5.84, 1.25),
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
// They're too tall to jump on to. [x, z, w, d], with barricades off alternate walls
const COVER_TALL = 2;
export const COVER = [
  [-50, -2.75, 1.5, 6.5],
  [-44, 2.75, 1.5, 6.5],
  [-38, 0, 3, 3],
  [-32, -2.75, 1.5, 6.5],
  [-32, 4.5, 1.5, 3],
].map(([x, z, w, d]) => ({ x, z, w, d, y: FLOOR_Y + COVER_TALL, floor: FLOOR_Y, solid: true }));
const SOLIDS = [...PLATFORMS, ...COVER];

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
    let best = 0;
    for (const p of SOLIDS) {
      if (p.y > best && p.y <= y && pastEdge(p, x, z) <= FOOT) best = p.y;
    }
    return best;
  },

  // The platform at that height, if it's one you're standing on
  platformAt(x, y, z) {
    return PLATFORMS.find((p) => p.y === y && pastEdge(p, x, z) <= FOOT) ?? null;
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
