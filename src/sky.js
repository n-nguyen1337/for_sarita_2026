import * as THREE from 'three';
import { canvasTexture } from './kit.js';

/* ------------------------------------------------------------------ */
/* SKY: a gradient dome, drifting clouds and far-off hills             */
/* A zone's build adds these to its group, around the zone's center.   */
/* The zone's `sky` color should match the dome's horizon: the fog     */
/* uses it, so the ground melts into the sky.                          */
/* ------------------------------------------------------------------ */
const DOME_R = 190; // inside the camera's far plane (260)

export function skyDome(x, z, { horizon, mid, top }) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color(horizon) },
        mid: { value: new THREE.Color(mid) },
        top: { value: new THREE.Color(top) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 horizon, mid, top;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          gl_FragColor = vec4(mix(c, top, smoothstep(0.14, 0.62, h)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  dome.position.set(x, 0, z);
  dome.renderOrder = -2; // behind everything
  return dome;
}

// Puffy and flat-bottomed, like a child's drawing of a cloud
let cloudTex = null;
function cloudTexture() {
  cloudTex ??= canvasTexture(512, 256, (ctx) => {
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = '#fff';
    for (const [x, y, r] of [[150, 165, 62], [235, 125, 86], [330, 150, 70], [395, 178, 46], [95, 188, 38]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(95, 165, 310, 60);
  });
  return cloudTex;
}

// A ring of clouds, turning very slowly around the zone
export function clouds(x, z, { count, color = '#ffffff', rand = Math.random }) {
  const ring = new THREE.Group();
  ring.position.set(x, 0, z);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.4, d = 110 + rand() * 40, size = 34 + rand() * 30;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(), color, transparent: true, opacity: 0.92, fog: false, depthWrite: false }));
    cloud.position.set(Math.cos(a) * d, 26 + rand() * 34, Math.sin(a) * d);
    cloud.scale.set(size, size / 2, 1);
    cloud.renderOrder = -1;
    ring.add(cloud);
  }
  ring.children[0].frustumCulled = false; // it ticks the whole ring, on screen or off
  ring.children[0].onBeforeRender = () => { ring.rotation.y = performance.now() * 0.000004; };
  return ring;
}

// Two layers of rolling hills on the inside of a big band round the zone. Its
// bottom edge sits under the ground, so no gap shows beyond the ground's far edge
export function hills(x, z, near, far) {
  const tex = canvasTexture(2048, 128, (ctx, w, h) => {
    const layer = (color, base, height, seed) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let px = 0; px <= w; px += 8) {
        const a = (px / w) * Math.PI * 2;
        ctx.lineTo(px, base - height * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7 + seed * 2) * 0.3 + Math.sin(a * 17 + seed * 3) * 0.12 + 0.6));
      }
      ctx.lineTo(w, h);
      ctx.fill();
    };
    layer(far, 112, 66, 1.3);
    layer(near, 122, 40, 4.1);
  });
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(150, 150, 40, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false })
  );
  band.position.set(x, 14, z);
  band.renderOrder = -1;
  return band;
}
