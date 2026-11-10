import * as THREE from 'three';
import { heartTexture, ringTexture, softDisc } from './kit.js';

/* ------------------------------------------------------------------ */
/* LITTLE EFFECTS: hearts popping over characters, puffs of dust,      */
/* splashes and ripples on the water                                   */
/* Pools of sprites (and flat rings for the ripples) in world space,   */
/* reused so nothing gets allocated while you play.                    */
/* ------------------------------------------------------------------ */
const POOL = 120;
const RIPPLES = 32;

export function makeFx(scene) {
  const free = [], live = [];
  for (let i = 0; i < POOL; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    sprite.visible = false;
    scene.add(sprite);
    free.push(sprite);
  }

  function spawn(map, color, x, y, z, { vx = 0, vy = 0, vz = 0, size, life, shape, gravity = 0, drag = 0 }) {
    const sprite = free.pop();
    if (!sprite) return; // a busy moment: the effect is only garnish, so skip it
    sprite.material.map = map;
    sprite.material.color.set(color);
    sprite.material.opacity = 0;
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0);
    sprite.visible = true;
    live.push({ sprite, vx, vy, vz, size, life, age: 0, shape, gravity, drag });
  }

  // Ripples lie flat on the water, so they're meshes rather than sprites
  const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringFree = [], ringLive = [];
  for (let i = 0; i < RIPPLES; i++) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: ringTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    ring.visible = false;
    ring.renderOrder = 1;
    scene.add(ring);
    ringFree.push(ring);
  }

  // A heart pops in with a little overshoot, floats up and fades
  const heartShape = (t) => ({
    scale: t < 0.2 ? (t / 0.2) * 1.2 : t < 0.32 ? 1.2 - ((t - 0.2) / 0.12) * 0.2 : 1,
    opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
  });
  // A puff swells as it thins out
  const puffShape = (t) => ({ scale: 0.4 + 0.6 * Math.sqrt(t), opacity: (1 - t) * (t < 0.1 ? t / 0.1 : 1) });
  // A drop of water pops out, shrinks a little as it flies, and fades as it falls back
  const dropShape = (t) => ({ scale: t < 0.12 ? t / 0.12 : 1 - 0.35 * (t - 0.12), opacity: t < 0.65 ? 0.95 : 0.95 * (1 - (t - 0.65) / 0.35) });

  return {
    heart(x, y, z, size = 0.5) {
      spawn(heartTexture(), '#ffffff', x, y, z, { vy: 0.8, size, life: 1.25, shape: heartShape });
    },
    // One soft puff, drifting up
    puff(x, y, z, color, size = 0.4) {
      spawn(softDisc(), color, x, y, z, { vy: 0.35, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, size, life: 0.45, shape: puffShape });
    },
    // A ring of puffs bursting out along the ground: a landing
    ring(x, y, z, color, count = 8, size = 0.85) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        spawn(softDisc(), color, x + Math.cos(a) * 0.2, y + 0.08, z + Math.sin(a) * 0.2, {
          vx: Math.cos(a) * 1.5, vy: 0.25, vz: Math.sin(a) * 1.5, size, life: 0.5, drag: 4, shape: puffShape,
        });
      }
    },
    // Drops of water thrown up from the surface at y. `size` 1 is a hop out of the water;
    // a little paddle is about 0.3, and a jump in from up high 2 or more. Bigger ones throw
    // up a burst of foam round them too, and the biggest a plume of spray
    splash(x, y, z, size = 1) {
      const s = Math.min(size, 2.5);
      const count = Math.round(4 + 9 * s);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, out = (0.4 + Math.random()) * (0.5 + 0.5 * s);
        spawn(softDisc(), i % 3 ? '#ffffff' : '#c8f4ff', x + Math.cos(a) * 0.12 * s, y + 0.05, z + Math.sin(a) * 0.12 * s, {
          vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: (1.7 + Math.random() * 2.4) * (0.6 + 0.45 * s),
          gravity: 13, size: (0.13 + Math.random() * 0.13) * (0.75 + 0.3 * s), life: 0.45 + Math.random() * 0.3, shape: dropShape,
        });
      }
      if (s >= 0.8) {
        const foam = Math.round(5 + 4 * s);
        for (let i = 0; i < foam; i++) {
          const a = (i / foam) * Math.PI * 2 + Math.random() * 0.5;
          spawn(softDisc(), '#ffffff', x + Math.cos(a) * 0.25, y + 0.06, z + Math.sin(a) * 0.25, {
            vx: Math.cos(a) * 1.1 * s, vy: 0.25, vz: Math.sin(a) * 1.1 * s, size: 0.45 + 0.25 * s, life: 0.65, drag: 3.5, shape: puffShape,
          });
        }
      }
      if (s >= 1.6) {
        for (let i = 0; i < 4; i++) {
          spawn(softDisc(), '#ffffff', x + (Math.random() - 0.5) * 0.4, y + 0.1, z + (Math.random() - 0.5) * 0.4, {
            vy: 2.6 + Math.random() * 1.6, gravity: 8, size: 0.5 + Math.random() * 0.25, life: 0.75, shape: puffShape,
          });
        }
      }
    },
    // A ring spreading out on the water to `size` across. `surface(x, z)` gives the water's
    // height there, so it rides the swell as it goes (null keeps it where it started)
    ripple(x, y, z, size = 1.8, { life = 1.1, opacity = 0.55, surface = null } = {}) {
      const ring = ringFree.pop();
      if (!ring) return;
      ring.position.set(x, y + 0.03, z);
      ring.scale.setScalar(0.01);
      ring.material.opacity = 0;
      ring.visible = true;
      ringLive.push({ ring, size, life, age: 0, opacity, surface });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.age += dt;
        const t = p.age / p.life;
        if (t >= 1) {
          p.sprite.visible = false;
          free.push(p.sprite);
          live.splice(i, 1);
          continue;
        }
        const slow = Math.max(0, 1 - p.drag * dt);
        p.vx *= slow;
        p.vz *= slow;
        p.vy -= p.gravity * dt;
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        const { scale, opacity } = p.shape(t);
        p.sprite.scale.setScalar(p.size * scale);
        p.sprite.material.opacity = opacity;
      }
      for (let i = ringLive.length - 1; i >= 0; i--) {
        const r = ringLive[i];
        r.age += dt;
        const t = r.age / r.life;
        if (t >= 1) {
          r.ring.visible = false;
          ringFree.push(r.ring);
          ringLive.splice(i, 1);
          continue;
        }
        r.ring.scale.setScalar(r.size * (0.25 + 0.75 * (1 - (1 - t) ** 2)));
        r.ring.material.opacity = r.opacity * Math.min(1, t * 8) * (1 - t) ** 1.5;
        const y = r.surface?.(r.ring.position.x, r.ring.position.z);
        if (y != null) r.ring.position.y = y + 0.03;
      }
    },
  };
}
