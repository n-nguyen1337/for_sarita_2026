import * as THREE from 'three';
import { box, cyl, mat } from './kit.js';
import { sfx } from './audio.js';
import { COURSE, TRENCH } from './gymcourse.js';

/* ------------------------------------------------------------------ */
/* THROWERS: the gym characters up on the trench's rims throw dumbbells */
/* and yoga balls at you. One lifts it overhead while a ring shows      */
/* where it's going to land, so you have time to see it coming. It's    */
/* aimed at where you're heading, so to dodge it you have to change     */
/* course, or get behind some cover. Nobody throws at you on a deck.    */
/* ------------------------------------------------------------------ */
const THROW = {
  // windup: how long (s) it's held overhead. flight: how long it's in the air
  // reach: how close to you counts as a hit. shove: how hard it knocks you (units/s)
  dumbbell: { windup: 0.75, flight: 0.8, reach: 0.65, shove: 5, bounce: 0.3, r: 0.4 },
  ball:     { windup: 0.95, flight: 1.3, reach: 1.05, shove: 7, bounce: 0.72, r: 0.8 },
};
const GRAVITY = 18;
const IN_AIR = 4;            // at most this many at once, held or flying
const IN_RANGE = [3, 28];    // a character throws when you're this far short of them, so they're on screen
const LEAD = 0.7;            // aims for where you'll be after this share of its flight, if you keep going
const SETTLE = 1.4;          // how long (s) something lies in the pit before it's cleared away
const BALL_COLORS = ['#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];
const WARNING = '#ff4f6d';

function dumbbellMesh() {
  const g = new THREE.Group();
  const handle = cyl(0.07, 0.8, mat('#c9ced4', { metalness: 0.7, roughness: 0.3 }), 0, 0, 0, 10);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  for (const s of [-1, 1]) g.add(box(0.26, 0.56, 0.56, mat('#26282c', { roughness: 0.5 }), s * 0.42, 0, 0));
  return g;
}

function ballMesh(color) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(THROW.ball.r, 24, 16), mat(color, { roughness: 0.35 }));
  ball.castShadow = true;
  g.add(ball);
  return g;
}

export function makeThrowing(zone) {
  const items = [];
  const add = (kind, mesh) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(WARNING).multiplyScalar(1.6), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    ring.visible = mesh.visible = false;
    zone.group.add(mesh, ring);
    items.push({ kind, mesh, ring, state: 'free', by: null, t: 0, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, hit: false, landed: false });
  };
  for (let i = 0; i < 8; i++) add('dumbbell', dumbbellMesh());
  for (let i = 0; i < 8; i++) add('ball', ballMesh(BALL_COLORS[i % BALL_COLORS.length]));

  let wait = 1.2;  // until the next throw
  let turn = 0;    // takes the characters in turn

  const free = (item) => {
    item.state = 'free';
    item.mesh.visible = item.ring.visible = false;
    if (item.by) item.by.holding = null;
    item.by = null;
  };

  // The ring lies on whatever's under (x, z), as far as you could be standing on it
  function placeRing(item, x, y, z) {
    const top = COURSE.surfaceBelow(x - zone.x, y + 0.4, z - zone.z);
    item.ring.position.set(x, top + 0.04, z);
    item.ring.scale.setScalar(THROW[item.kind].reach + 0.25);
  }

  function aim(item, play, out) {
    const ahead = THROW[item.kind].flight * LEAD;
    out.x = play.pos.x + (play.vel.x + play.ride.x) * ahead;
    out.y = play.pos.y;
    out.z = Math.max(zone.z - TRENCH.halfZ + 0.6, Math.min(zone.z + TRENCH.halfZ - 0.6, play.pos.z + (play.vel.z + play.ride.z) * ahead));
    return out;
  }
  const target = { x: 0, y: 0, z: 0 };

  function startThrow(by) {
    const item = items.find((i) => i.state === 'free' && i.kind === by.thrower);
    if (!item) return;
    item.state = 'held';
    item.by = by;
    item.t = 0;
    item.hit = item.landed = false;
    item.mesh.visible = item.ring.visible = true;
    item.mesh.rotation.set(0, 0, 0);
    by.holding = item;
  }

  function release(item, play) {
    const spec = THROW[item.kind], p = item.mesh.position;
    aim(item, play, target);
    const ty = COURSE.surfaceBelow(target.x - zone.x, target.y + 0.4, target.z - zone.z) + spec.r + 0.8; // about waist height
    item.vx = (target.x - p.x) / spec.flight;
    item.vz = (target.z - p.z) / spec.flight;
    item.vy = (ty - p.y) / spec.flight + 0.5 * GRAVITY * spec.flight;
    item.spinX = (Math.random() - 0.5) * 12;
    item.spinZ = 5 + Math.random() * 7;
    item.state = 'flying';
    item.t = 0;
    item.aimY = target.y;
    placeRing(item, target.x, target.y, target.z);
    item.by.holding = null;
    item.by.tossed = 1;
    item.by = null;
    sfx('whoosh');
  }

  function fly(item, dt, play) {
    const spec = THROW[item.kind], p = item.mesh.position;
    const prevY = p.y;
    item.t += dt;
    item.vy -= GRAVITY * dt;
    p.x += item.vx * dt;
    p.y += item.vy * dt;
    p.z += item.vz * dt;
    item.mesh.rotation.x += item.spinX * dt;
    item.mesh.rotation.z += item.spinZ * dt;

    // Off the trench's walls
    const wall = TRENCH.halfZ - spec.r;
    if (Math.abs(p.z - zone.z) > wall && item.landed) {
      p.z = zone.z + Math.sign(p.z - zone.z) * wall;
      item.vz *= -0.7;
    }

    // Land on whatever's below: a ball bounces on along it, and a dumbbell thuds and drops
    if (item.vy < 0) {
      const top = COURSE.surfaceBelow(p.x - zone.x, prevY - spec.r + 0.05, p.z - zone.z);
      if (p.y - spec.r <= top) {
        p.y = top + spec.r;
        if (!item.landed) item.ring.visible = false;
        item.landed = true;
        const hard = -item.vy;
        item.vy = hard * spec.bounce;
        item.vx *= 0.92;
        item.vz *= 0.92;
        if (item.kind === 'dumbbell') { item.vx *= 0.5; item.vz *= 0.5; item.spinX *= 0.4; item.spinZ *= 0.4; }
        if (hard > 3) sfx(item.kind === 'ball' ? 'boing' : 'clunk', Math.min(1, hard / 12));
        // Nearly done bouncing: it just lies there a moment, on whatever it's landed on
        if (item.vy < 2) {
          item.state = 'settling';
          item.t = 0;
          item.on = COURSE.platformAt(p.x - zone.x, top, p.z - zone.z);
        }
      }
    }

    // Stopped by some cover: it bounces back off, and can't get you now
    const cover = COURSE.coverAt(p.x - zone.x, p.y, p.z - zone.z, spec.r);
    if (cover) {
      const dx = p.x - zone.x - cover.x, dz = p.z - zone.z - cover.z;
      if (cover.w / 2 - Math.abs(dx) < cover.d / 2 - Math.abs(dz)) {
        p.x = zone.x + cover.x + Math.sign(dx) * (cover.w / 2 + spec.r);
        if (item.vx * dx < 0) item.vx *= -spec.bounce;
      } else {
        p.z = zone.z + cover.z + Math.sign(dz) * (cover.d / 2 + spec.r);
        if (item.vz * dz < 0) item.vz *= -spec.bounce;
      }
      if (!item.hit) {
        sfx(item.kind === 'ball' ? 'boing' : 'clunk');
        play.effects.ring(p.x, p.y, p.z, '#ffffff', 6, 0.5);
      }
      item.hit = item.landed = true;
      item.ring.visible = false;
    }

    // Did it get you? Your body runs from your knees to your head
    if (!item.hit) {
      const dx = p.x - play.pos.x, dz = p.z - play.pos.z;
      const dy = p.y - Math.max(play.pos.y + 0.3, Math.min(play.pos.y + 1.5, p.y));
      if (dx * dx + dy * dy + dz * dz < spec.reach * spec.reach) {
        const speed = Math.hypot(item.vx, item.vz) || 1;
        if (play.hit(item.vx / speed, item.vz / speed, spec.shove)) {
          item.hit = true;
          item.ring.visible = false;
          item.vx *= -0.4;
          item.vz *= -0.4;
          item.vy = Math.max(item.vy, 3);
        }
      }
    }
    if (item.t > 7) free(item); // out of the way, however it ended up
  }

  return {
    // `every` is the seconds between throws, or null if nobody's throwing now
    update(dt, play, throwers, every) {
      wait -= dt;
      const busy = items.filter((i) => i.state === 'held' || (i.state === 'flying' && !i.landed)).length;
      if (every && !play.safe && wait <= 0 && busy < IN_AIR) {
        const ready = throwers.filter((t) => {
          const ahead = t.model.position.x - play.pos.x;
          return !t.holding && ahead > IN_RANGE[0] && ahead < IN_RANGE[1];
        });
        if (ready.length) {
          startThrow(ready[turn++ % ready.length]);
          wait = every * (0.8 + Math.random() * 0.4);
        }
      }

      for (const t of throwers) t.raise += ((t.holding ? 1 : 0) - t.raise) * Math.min(1, dt * 7);

      for (const item of items) {
        if (item.state === 'held') {
          const spec = THROW[item.kind], m = item.by.model;
          item.t += dt;
          item.mesh.position.set(m.position.x, m.position.y + item.by.height + spec.r + 0.2, m.position.z);
          item.mesh.scale.setScalar(Math.min(1, item.t / 0.2));
          aim(item, play, target);
          placeRing(item, target.x, target.y, target.z);
          item.ring.material.opacity = 0.45 + 0.35 * Math.sin(item.t * 16);
          // You've reached somewhere safe: they put it down
          if (play.safe) free(item);
          else if (item.t >= spec.windup) release(item, play);
        } else if (item.state === 'flying') {
          item.ring.material.opacity = 0.9;
          // A moving platform can slide in or out under the spot it's going to land
          if (item.ring.visible) placeRing(item, item.ring.position.x, item.aimY, item.ring.position.z);
          fly(item, dt, play);
        } else if (item.state === 'settling') {
          item.t += dt;
          if (item.on?.move) {
            const p = item.mesh.position;
            p.x += item.on.vx * dt;
            p.y = item.on.y + THROW[item.kind].r;
            p.z += item.on.vz * dt;
          }
          item.mesh.scale.setScalar(Math.min(1, Math.max(0, (SETTLE - item.t) / 0.25)));
          if (item.t >= SETTLE) free(item);
        }
      }
    },
  };
}
