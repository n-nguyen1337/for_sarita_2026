import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { slabTexture, flat } from './kit.js';

/* ------------------------------------------------------------------ */
/* CORN MAZE: an easy one, out through the gate in the farm's east     */
/* fence. In the map '#' is corn and everything else is path; columns  */
/* run east (+X) and rows south (+Z). Odd rows and columns are paths,  */
/* even ones the thin rows of corn between them. You walk in through   */
/* the gap on the west edge, and two routes lead through to the        */
/* clearing in the east. Marks on the paths:                           */
/*   P  the portal (it looks back west, the way you came)              */
/*   S  a scarecrow   o  a few pumpkins   H  a hay bale with balloons  */
/* ------------------------------------------------------------------ */
const MAP = [
  '#################',
  '#S#         #####',
  '# # # # ### #####',
  '# # # #   #o#o H#',
  '# # # ### ###   #',
  '    #  o# #    P#',
  '### ##### # #   #',
  '#   #   #   #o H#',
  '# ### # # #######',
  '#     #    S#####',
  '#################',
];
const PATH = 2.6;          // width of a path
const ROW = 1.0;           // thickness of a row of corn between two paths
const PERIOD = PATH + ROW;
const PAD = 0.45;          // keeps you about a body radius off the corn
const CORN_HEIGHT = 2.4;   // a head taller than you
const MARGIN = 2;          // extra corn round the north, east and south edges (scenery only)
// In the maze the camera climbs and closes in, so you can see over the corn
const VIEW = { distance: 6.2, height: 6.4 };
const TINTS = ['#ffffff', '#fff1d0', '#f0f5d0', '#ffe8c0', '#e8eccc'];

const COLS = MAP[0].length, ROWS = MAP.length;
// Where map row/column k starts, its middle, and which one a distance from the edge falls in
const edge = (k) => Math.floor(k / 2) * PERIOD + (k % 2) * ROW;
const middle = (k) => (edge(k) + edge(k + 1)) / 2;
const blockAt = (u) => {
  const m = Math.floor(u / PERIOD);
  return 2 * m + (u - m * PERIOD < ROW ? 0 : 1);
};

// `entry` is the middle of the way in, on the maze's west edge (farm-local coords)
export function cornMaze(entry) {
  const entryRow = MAP.findIndex((row) => row[0] !== '#');
  const x0 = entry.x, z0 = entry.z - middle(entryRow);
  const width = edge(COLS), depth = edge(ROWS);
  const corn = (x, z) => MAP[blockAt(z - z0)]?.[blockAt(x - x0)] === '#';

  // Everything marked on the map, turned to face along its path (its first open side)
  const marks = [];
  MAP.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '#' || ch === ' ') return;
    const [dc, dr] = [[-1, 0], [1, 0], [0, -1], [0, 1]].find(([dc, dr]) => (MAP[r + dr]?.[c + dc] ?? '#') !== '#');
    marks.push({ ch, x: x0 + middle(c), z: z0 + middle(r), face: Math.atan2(dc, dr) });
  }));
  const portal = marks.find((m) => m.ch === 'P');

  return {
    x0,
    view: VIEW,
    marks,
    inside: (x, z) => x >= x0 && x <= x0 + width && z >= z0 && z <= z0 + depth,
    // The paths, less a body's width along the corn
    walkable: (x, z) => !corn(x, z) && !corn(x - PAD, z) && !corn(x + PAD, z) && !corn(x, z - PAD) && !corn(x, z + PAD),
    // Within `pad` of the maze or the corn round it
    near: (x, z, pad) => x > x0 - pad && x < x0 + width + MARGIN + pad && z > z0 - MARGIN - pad && z < z0 + depth + MARGIN + pad,
    portal: { x: portal.x, z: portal.z, face: { x: x0, z: portal.z } },
    build: (farm, rand) => buildMaze(farm, rand, x0, z0, width, depth, corn),
  };
}

/* ------------------------------------------------------------------ */
/* THE CORN                                                            */
/* ------------------------------------------------------------------ */
// One late-season stalk: a thin stem, drooping leaves spiralling up it,
// a tassel on top and an ear. Vertex colors, so it's one instanced mesh.
function stalkGeometry() {
  const paint = (geo, hex) => {
    const c = new THREE.Color(hex), colors = [];
    for (let i = 0; i < geo.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  };
  const parts = [paint(new THREE.CylinderGeometry(0.025, 0.04, CORN_HEIGHT, 5, 1, true).translate(0, CORN_HEIGHT / 2, 0), '#8f8a45')];
  for (let i = 0; i < 4; i++) {
    const len = 0.8 - i * 0.08;
    const leaf = new THREE.PlaneGeometry(0.09, len, 1, 4).translate(0, len / 2, 0);
    const p = leaf.attributes.position;
    for (let k = 0; k < p.count; k++) { // arch out from the stalk, then droop
      const t = p.getY(k) / len;
      p.setXYZ(k, len * 0.8 * t, len * (0.6 * t - 0.45 * t * t), p.getX(k));
    }
    leaf.computeVertexNormals();
    parts.push(paint(leaf.rotateY(i * 2.4).translate(0, 0.5 + i * 0.38, 0), '#a7a04a'));
  }
  parts.push(paint(new THREE.ConeGeometry(0.07, 0.35, 5).translate(0, CORN_HEIGHT + 0.12, 0), '#d6b55c'));
  parts.push(paint(new THREE.SphereGeometry(0.055, 5, 3).scale(1, 2.6, 1).rotateZ(0.35).translate(0.06, CORN_HEIGHT * 0.5, 0), '#c8b56b'));
  return mergeGeometries(parts);
}

function buildMaze(farm, rand, x0, z0, width, depth, corn) {
  // Packed dirt underfoot
  const dirt = slabTexture('#8b6b47', null);
  dirt.repeat.set(width / 3, depth / 3);
  farm.add(flat(width, depth, new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }), x0 + width / 2, z0 + depth / 2, 0.006));

  // Stalks on a jittered grid wherever the map has corn, and all round the
  // outside except the west edge, where you come in
  const STEP = 0.5;
  const spots = [];
  for (let x = x0 + STEP / 2; x < x0 + width + MARGIN; x += STEP) {
    for (let z = z0 - MARGIN + STEP / 2; z < z0 + depth + MARGIN; z += STEP) {
      const px = x + (rand() - 0.5) * 0.3, pz = z + (rand() - 0.5) * 0.3;
      const outside = px > x0 + width || pz < z0 || pz > z0 + depth;
      if (outside || corn(px, pz)) spots.push([px, pz]);
    }
  }
  const stalks = new THREE.InstancedMesh(
    stalkGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }),
    spots.length
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const w = 0.85 + rand() * 0.3;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    stalks.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.set(w, 0.85 + rand() * 0.3, w)));
    stalks.setColorAt(i, color.set(TINTS[Math.floor(rand() * TINTS.length)]));
  });
  stalks.castShadow = true;
  stalks.receiveShadow = true;
  farm.add(stalks);
}
