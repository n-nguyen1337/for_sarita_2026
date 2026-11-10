import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// The farm's models are Draco-compressed; Vite serves the decoder straight out of three
import DRACO_JS from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url';
import DRACO_WASM from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url';

// Shared building blocks for the zones: model loading, canvas textures,
// cached materials, and one-line mesh makers.

/* ------------------------------------------------------------------ */
/* LOADING                                                              */
/* ------------------------------------------------------------------ */
// Every model goes through this manager, so the title screen can show how far along they are
export const loading = new THREE.LoadingManager();
const draco = new DRACOLoader(loading).setDecoderPath({ js: DRACO_JS, wasm: DRACO_WASM });
export const modelLoader = () => new GLTFLoader(loading).setDRACOLoader(draco);

// Same layout every visit
export function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* CANVAS TEXTURES                                                      */
/* ------------------------------------------------------------------ */
export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

export const DISPLAY_FONT = 'Fredoka, "Segoe UI", system-ui, sans-serif';

// Canvas text can only use a font once it has loaded, so this draws straight
// away with the fallback, then again when the game's fonts are ready
const fontsReady = document.fonts.load('600 40px Fredoka');
export function fontTexture(w, h, draw) {
  const tex = canvasTexture(w, h, draw);
  fontsReady.then(() => {
    const ctx = tex.image.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    tex.needsUpdate = true;
  });
  return tex;
}

// A framed text plate (street signs, banners)
export function plateTexture(text, bg, fg, font = 'bold 72px sans-serif') {
  return fontTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    // squeeze long text horizontally so it always fits inside the frame
    const fit = Math.min(1, (w - 48) / ctx.measureText(text).width);
    ctx.setTransform(fit, 0, 0, 1, (w / 2) * (1 - fit), 0);
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

// Speckled tiles; pass a line color to draw a grid of `cell` pixels
export function slabTexture(base, line, cell) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {     // speckle
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    if (line) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 3;
      for (let p = 0; p <= w; p += cell) {
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A soft round glow, fading out from the middle
let discTex = null;
export function softDisc() {
  discTex ??= canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return discTex;
}

// A soft white ring, for ripples and foam on the water
let ringTex = null;
export function ringTexture() {
  ringTex ??= canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.76, 'rgba(255,255,255,1)');
    g.addColorStop(0.88, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return ringTex;
}

// The classic bezier heart, `w` wide, with its point at the origin
export function heartShape(w) {
  const k = w / 22;
  const P = (x, y) => [x * k, y * k];
  const s = new THREE.Shape();
  s.moveTo(...P(0, 14));
  s.bezierCurveTo(...P(0, 14), ...P(-1, 19), ...P(-5, 19));
  s.bezierCurveTo(...P(-11, 19), ...P(-11, 12), ...P(-11, 12));
  s.bezierCurveTo(...P(-11, 8), ...P(-8, 3.6), ...P(0, 0));
  s.bezierCurveTo(...P(7, 3.6), ...P(11, 8), ...P(11, 12));
  s.bezierCurveTo(...P(11, 12), ...P(11, 19), ...P(5, 19));
  s.bezierCurveTo(...P(2, 19), ...P(0, 14), ...P(0, 14));
  return s;
}

// A plump little heart, for the sprites over signs and characters
let heartTex = null;
export function heartTexture() {
  heartTex ??= canvasTexture(128, 128, (ctx) => {
    ctx.scale(128 / 22, 128 / 22);
    ctx.translate(11, 20.5);
    ctx.scale(1, -1);
    const path = new Path2D('M0 14C0 14-1 19-5 19-11 19-11 12-11 12-11 8-8 3.6 0 0 7 3.6 11 8 11 12 11 12 11 19 5 19 2 19 0 14 0 14Z');
    ctx.fillStyle = '#ff5d8f';
    ctx.fill(path);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke(path);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(-5.2, 13.6, 2.3, 1.5, 0.5, 0, 7);
    ctx.fill();
  });
  return heartTex;
}

/* ------------------------------------------------------------------ */
/* SMALL HELPERS                                                        */
/* ------------------------------------------------------------------ */
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, ...opts }));
  return matCache.get(key);
}
// Anything brighter than 1 blooms (see look.js), so `strength` says how much a thing glows
export const glow = (color, strength = 1.8) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), toneMapped: false });
export const glowMap = (map, strength = 1.8) =>
  new THREE.MeshBasicMaterial({ map, color: new THREE.Color(strength, strength, strength), toneMapped: false });

export function box(w, h, d, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
export function cyl(r, h, material, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export function flat(w, d, material, x, z, y = 0.01) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}
// A pool of colored light on the ground, faked with a soft glow laid flat
export function lightPool(color, r, x, z, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: softDisc(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(x, 0.05, z);
  m.renderOrder = 2;
  return m;
}
