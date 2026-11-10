// Per-piece breakdown of a GLB pack: world position + local size of each mesh.
// Usage: node tools/inspect-glb-parts.mjs <file.glb>
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const file = process.argv[2];
if (!file) { console.error('usage: node inspect-glb-parts.mjs <file.glb>'); process.exit(1); }

const buf = Buffer.from(readFileSync(file));
const gltf = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));

const { nodes = [], meshes = [] } = gltf;

const parentOf = new Map();
for (const n of nodes) for (const c of n.children || []) parentOf.set(c, n);

const local = nodes.map((n) => {
  if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix);
  const m = new THREE.Matrix4();
  if (n.translation) m.setPosition(...n.translation);
  if (n.rotation) {
    const e = new THREE.Euler(n.rotation[2], n.rotation[1], n.rotation[0], 'ZYX');
    m.premultiply(new THREE.Matrix4().makeRotationFromEuler(e));
  }
  if (n.scale) m.premultiply(new THREE.Matrix4().makeScale(...n.scale));
  return m;
});

const world = nodes.map((_, i) => {
  let m = local[i].clone();
  let p = parentOf.get(i);
  while (p != null) { m = local[p].clone().multiply(m); p = parentOf.get(p); }
  return m;
});

console.log('idx | name | pos (x,y,z) | size (x,y,z)');
nodes.forEach((n, i) => {
  if (n.mesh == null) return;
  const msh = meshes[n.mesh];
  let min = null, max = null;
  for (const p of msh.primitives || []) {
    const pos = gltf.accessors[p.attributes.POSITION];
    if (pos && pos.min && pos.max) { min = new THREE.Vector3(...pos.min); max = new THREE.Vector3(...pos.max); break; }
  }
  if (!min) return;
  const size = max.clone().sub(min);
  const pos = new THREE.Vector3().setFromMatrixPosition(world[i]);
  const f = (v) => v.toFixed(1);
  console.log(`${String(i).padEnd(3)} | ${n.name} | ${f(pos.x)},${f(pos.y)},${f(pos.z)} | ${f(size.x)},${f(size.y)},${f(size.z)}`);
});
