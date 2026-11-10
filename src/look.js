import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------ */
/* THE LOOK: how the picture gets finished                             */
/* The scene renders into an HDR buffer, anything brighter than white  */
/* blooms, a small grade adds saturation and a vignette, then it's     */
/* tone mapped to the screen. A zone tunes all this with its `look`.   */
/* The game drops a quality tier on its own if the frame rate suffers. */
/* ------------------------------------------------------------------ */
const BLOOM_RADIUS = 0.55;
const BLOOM_THRESHOLD = 1.35; // only things pushed past white (kit.js's glow) bloom, not sunlit walls
const DEFAULT_LOOK = { exposure: 1, bloom: 0.3, vignette: 0.18, saturation: 1.05, env: 0.3 };

// `samples` is the antialiasing; the low tier has no bloom and draws straight to the screen
const TIERS = {
  high:   { pixelRatio: 2,    samples: 4, composer: true,  shadowSize: 2048, shadowRadius: 3.5 },
  medium: { pixelRatio: 1.25, samples: 2, composer: true,  shadowSize: 2048, shadowRadius: 2.5 },
  low:    { pixelRatio: 1,    samples: 0, composer: false, shadowSize: 1024, shadowRadius: 1.5 },
};
const NEXT_TIER_DOWN = { high: 'medium', medium: 'low' };
const SLOW_FRAME = 1 / 30;  // a median frame slower than this (s) means the machine is struggling...
const WATCH_WINDOW = 2.5;   // ...measured over this many seconds at a time
const SETTLE = 3;           // ignore this long after starting or changing tier

export function makeLook(renderer, scene, camera, sun) {
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps saturated colors true, and only rolls off the brightest
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), DEFAULT_LOOK.bloom, BLOOM_RADIUS, BLOOM_THRESHOLD);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uVignette: { value: 0 }, uSaturation: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uVignette, uSaturation;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float grey = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(grey), c.rgb, uSaturation);
        c.rgb *= 1.0 - uVignette * smoothstep(0.3, 0.95, length(vUv - 0.5) * 1.35);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  let tier = null;
  function setTier(name) {
    tier = name;
    const t = TIERS[name];
    const ratio = Math.min(devicePixelRatio, t.pixelRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight);
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      target.samples = t.samples;
      target.dispose();
    }
    composer.setPixelRatio(ratio);
    composer.setSize(innerWidth, innerHeight);
    sun.shadow.mapSize.set(t.shadowSize, t.shadowSize);
    sun.shadow.radius = t.shadowRadius;
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    frames.length = 0;
    watched = -SETTLE;
  }

  // Keeps an eye on the frame rate and steps down a tier if it stays low. The
  // median shrugs off one-off hitches, and it never steps back up, so it can't flicker
  const frames = [];
  let watched = -SETTLE;
  const flag = new URLSearchParams(location.search).get('quality');
  const forced = TIERS[flag] ? flag : null;
  setTier(forced ?? 'high');

  return {
    get tier() { return tier; },
    setZone(zone) {
      const look = { ...DEFAULT_LOOK, ...zone.look };
      renderer.toneMappingExposure = look.exposure;
      scene.environmentIntensity = look.env;
      bloom.strength = look.bloom;
      grade.uniforms.uVignette.value = look.vignette;
      grade.uniforms.uSaturation.value = look.saturation;
    },
    render(dt) {
      if (TIERS[tier].composer) composer.render(dt);
      else renderer.render(scene, camera);
    },
    // Draw a zone once from far overhead, so all its shaders and textures get to
    // the GPU behind the title screen instead of stuttering on the way in
    warmUp(warmCamera) {
      renderPass.camera = warmCamera;
      if (TIERS[tier].composer) composer.render(0);
      else renderer.render(scene, warmCamera);
      renderPass.camera = camera;
    },
    watch(rawDt) {
      if (forced || !NEXT_TIER_DOWN[tier] || document.hidden) return;
      watched += rawDt;
      if (watched <= 0) return;
      frames.push(rawDt);
      if (watched < WATCH_WINDOW) return;
      frames.sort((a, b) => a - b);
      const median = frames[Math.floor(frames.length / 2)];
      frames.length = 0;
      watched = 0;
      if (median > SLOW_FRAME) setTier(NEXT_TIER_DOWN[tier]);
    },
    resize() {
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
    },
  };
}
