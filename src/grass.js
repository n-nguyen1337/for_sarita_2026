import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* GRASS TUFTS: little fans of blades scattered over a lawn, swaying   */
/* in the breeze. One instanced mesh, in local coords around the zone. */
/* ------------------------------------------------------------------ */
function tuftGeometry() {
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const height = 1 - (i % 2) * 0.28, lean = 0.22 + (i % 3) * 0.08;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, lean, height, 0], 3));
    // Lit from straight up like the ground they grow on, so they never stand out dark against it
    blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute([0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 1.08, 1.08, 1.08], 3)); // a little darker at the root
    blades.push(blade.rotateY(i * 1.57 + 0.4));
  }
  return mergeGeometries(blades);
}

// `allowed(x, z)` says where tufts may grow, within `radius` of the middle
export function grassTufts({ count, radius, colors, rand, allowed, size = 0.26 }) {
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Tips sway, roots stay put; each tuft in its own time
        float gust = sin(uTime * 1.7 + instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.5);
        transformed.xz += position.y * 0.16 * vec2(gust, gust * 0.6);`);
  };
  const tufts = new THREE.InstancedMesh(tuftGeometry(), material, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 6; tries++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * radius;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!allowed(x, z)) continue;
    const w = size * (0.7 + rand() * 0.7);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    tufts.setMatrixAt(placed, m.compose(p.set(x, 0, z), q, s.set(w, w * (0.8 + rand() * 0.6), w)));
    tufts.setColorAt(placed, color.set(colors[Math.floor(rand() * colors.length)]));
    placed++;
  }
  tufts.count = placed;
  tufts.onBeforeRender = () => { uniforms.uTime.value = performance.now() / 1000; }; // only ticks while the zone is shown
  return tufts;
}
