// Inspect a GLB: node tree, mesh/material/image counts, and overall AABB size.
// Usage: node tools/inspect-glb.mjs <file.glb>
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const file = process.argv[2];
if (!file) { console.error('usage: node inspect-glb.mjs <file.glb>'); process.exit(1); }

const buf = Buffer.from(readFileSync(file));
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

const { nodes = [], meshes = [], materials = [], images = [], animations = [] } = gltf;
console.log('nodes:', nodes.length, '| meshes:', meshes.length, '| materials:', materials.length);
console.log('images:', images.length, images.slice(0, 6).map(i => i.uri ? 'URI:' + i.uri : 'embedded').join(', '));
console.log('animations:', animations.length);
console.log('asset:', JSON.stringify(gltf.asset || {}));

// parent map (children -> parent)
const parentOf = new Map();
for (const n of nodes) for (const c of n.children || []) parentOf.set(c, n);
const rootIdx = nodes.map((_, i) => i).filter((i) => !parentOf.has(i));

function printTree(i, depth) {
  const n = nodes[i];
  const bits = n.mesh != null ? `  (mesh#${n.mesh})` : '';
  console.log('  '.repeat(depth) + `[${i}] ${n.name || '(unnamed)'}${bits}`);
  for (const c of n.children || []) printTree(c, depth + 1);
}
for (const r of rootIdx) printTree(r, 0);

// local transform per node (matrix, or composed from TRS)
const local = nodes.map((n) => {
  if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix);
  const m = new THREE.Matrix4();
  if (n.translation) { const t = new THREE.Vector3(...n.translation); m.setPosition(t); }
  if (n.rotation) {
    const e = new THREE.Euler(n.rotation[2], n.rotation[1], n.rotation[0], 'ZYX');
    m.premultiply(new THREE.Matrix4().makeRotationFromEuler(e));
  }
  if (n.scale) m.premultiply(new THREE.Matrix4().makeScale(...n.scale));
  return m;
});

// world transform per node
const world = nodes.map((_, i) => {
  let m = local[i].clone();
  let p = parentOf.get(i);
  while (p != null) {
    m = local[p].clone().multiply(m);
    p = parentOf.get(p);
  }
  return m;
});

// local AABB per mesh from POSITION accessor min/max (when provided)
const meshAABB = meshes.map((msh) => {
  for (const p of msh.primitives || []) {
    const pos = gltf.accessors[p.attributes.POSITION];
    if (pos && pos.min && pos.max) {
      return [new THREE.Vector3(...pos.min), new THREE.Vector3(...pos.max)];
    }
  }
  return null;
});

// overall AABB: transform each mesh's 8 local corners through its node's world matrix
const globalMin = new THREE.Vector3(Infinity, Infinity, Infinity);
const globalMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
let withBounds = 0, withoutBounds = 0;
const tmp = new THREE.Vector3();
nodes.forEach((n, i) => {
  if (n.mesh == null) return;
  const ab = meshAABB[n.mesh];
  if (!ab) { withoutBounds++; return; }
  for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
    tmp.set(
      sx ? ab[1].x : ab[0].x,
      sy ? ab[1].y : ab[0].y,
      sz ? ab[1].z : ab[0].z
    ).applyMatrix4(world[i]);
    globalMin.min(tmp); globalMax.max(tmp);
  }
  withBounds++;
});

console.log('meshes with bounds:', withBounds, '| without bounds:', withoutBounds);
if (withBounds > 0) {
  const size = globalMax.clone().sub(globalMin);
  const center = globalMin.clone().add(globalMax).multiplyScalar(0.5);
  console.log('overall min:', globalMin.toArray().map(v => +v.toFixed(2)));
  console.log('overall size (x,y,z):', size.toArray().map(v => +v.toFixed(2)));
  console.log('overall center:', center.toArray().map(v => +v.toFixed(2)));
}
