import * as THREE from 'three';
import { DISPLAY_FONT, fontTexture, heartShape, lightPool, softDisc } from './kit.js';

/* ------------------------------------------------------------------ */
/* A PORTAL: a glowing ring with a heart on top, filled with a soft    */
/* swirl of color, with sparkles drifting up through it.               */
/* Built at the origin, facing +Z; main.js places it.                  */
/* ------------------------------------------------------------------ */
const RING_R = 1.5;
const RING_Y = 1.9;   // height of the ring's center
const LABEL_Y = RING_Y + RING_R + 2; // height of the zone name floating above it
const SPARKLES = 26;

const RING_GEO = new THREE.TorusGeometry(RING_R, 0.15, 16, 56);
const TRIM_GEO = new THREE.TorusGeometry(RING_R - 0.17, 0.028, 8, 56);
const DISC_GEO = new THREE.CircleGeometry(RING_R - 0.12, 48);
const HEART_GEO = (() => {
  const g = new THREE.ExtrudeGeometry(heartShape(0.6), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -0.05);
  return g;
})();

// The next zone's name, on a pill in the portal's color
function labelTexture(text, color) {
  return fontTexture(512, 128, (ctx, w, h) => {
    ctx.font = `600 66px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pill = Math.min(w - 8, ctx.measureText(text).width + 84);
    ctx.beginPath();
    ctx.roundRect((w - pill) / 2, 10, pill, h - 20, (h - 20) / 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 3, pill - 40);
  });
}

/* A soft bubble: the portal's color at the rim, melting into a pale hint of the
   next zone's sky in the middle (which you can half see through), with three
   faint arms of light slowly turning */
function discMaterial(portal, sky) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uRim: { value: new THREE.Color(portal) },
      uSky: { value: new THREE.Color(sky) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFade;
      uniform vec3 uRim, uSky;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p), a = atan(p.y, p.x);
        float arms = 0.5 + 0.5 * sin((a + r * 3.5 - uTime * 0.8) * 3.0);
        vec3 core = mix(mix(uRim, uSky, 0.5), vec3(1.0), 0.45);
        vec3 color = mix(core, uRim, smoothstep(0.1, 0.95, r));
        color = mix(color, vec3(1.0), arms * 0.26 * (1.0 - r * 0.5));
        float alpha = mix(0.74, 0.96, smoothstep(0.0, 0.9, r));
        gl_FragColor = vec4(color, alpha * smoothstep(1.0, 0.95, r) * uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function makePortal(to, showLabel) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(RING_GEO, new THREE.MeshStandardMaterial({
    color: to.portal, emissive: to.portal, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.35, transparent: true,
  }));
  ring.position.y = RING_Y;
  const trim = new THREE.Mesh(TRIM_GEO, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.5), transparent: true, toneMapped: false }));
  trim.position.y = RING_Y;
  const disc = new THREE.Mesh(DISC_GEO, discMaterial(to.portal, to.sky ?? '#9fd8ff'));
  disc.position.y = RING_Y;
  const heart = new THREE.Mesh(HEART_GEO, ring.material);
  heart.position.y = RING_Y + RING_R + 0.05;
  const pool = lightPool(to.portal, 3.2, 0, 0, 0.5);
  group.add(ring, trim, disc, heart, pool);

  let label = null;
  if (showLabel) {
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(to.name, `#${new THREE.Color(to.portal).getHexString()}`), transparent: true, fog: false, toneMapped: false, depthWrite: false }));
    label.position.y = LABEL_Y;
    label.scale.set(4, 1, 1);
    group.add(label);
  }

  // Sparkles drifting up through the ring
  const positions = new Float32Array(SPARKLES * 3), colors = new Float32Array(SPARKLES * 3);
  const seeds = Array.from({ length: SPARKLES }, () => ({ x: (Math.random() - 0.5) * 3.4, z: (Math.random() - 0.5) * 0.6, phase: Math.random(), speed: 0.1 + Math.random() * 0.14, sway: Math.random() * 6 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sparkles = new THREE.Points(geo, new THREE.PointsMaterial({
    map: softDisc(), size: 0.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  sparkles.frustumCulled = false; // they move every frame, so the precomputed bounds are useless
  group.add(sparkles);
  const sparkle = new THREE.Color(to.portal).lerp(new THREE.Color('#ffffff'), 0.45);

  // `fade` is 1 normally and 0 when the portal is out of the way
  function update(time, fade) {
    group.visible = fade > 0.01;
    if (!group.visible) return;
    ring.material.opacity = fade;
    trim.material.opacity = fade;
    pool.material.opacity = 0.5 * fade;
    if (label) {
      label.material.opacity = fade;
      label.position.y = LABEL_Y + Math.sin(time * 1.6) * 0.05;
    }
    disc.material.uniforms.uFade.value = fade;
    disc.material.uniforms.uTime.value = time;
    heart.rotation.y = Math.sin(time * 0.9) * 0.5;
    heart.position.y = RING_Y + RING_R + 0.05 + Math.sin(time * 1.6) * 0.04;
    seeds.forEach((s, i) => {
      const t = (time * s.speed + s.phase) % 1; // 0 at the ground, 1 at the top
      positions[i * 3] = s.x + Math.sin(time + s.sway) * 0.12;
      positions[i * 3 + 1] = t * 4.2;
      positions[i * 3 + 2] = s.z;
      const bright = Math.sin(t * Math.PI) * fade;
      colors[i * 3] = sparkle.r * bright;
      colors[i * 3 + 1] = sparkle.g * bright;
      colors[i * 3 + 2] = sparkle.b * bright;
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  return { group, update };
}
