import * as THREE from 'three';
import { mat } from './kit.js';

/* ------------------------------------------------------------------ */
/* PLAYER CHARACTER: a cute chibi girl with long black hair            */
/* Built from primitives, ~1.8 units tall, feet at y = 0, facing +Z.   */
/* ------------------------------------------------------------------ */
const SKIN = '#ffe0cc';
const HAIR = '#2b2130';
const HAIR_SHINE = '#75637f';
const DRESS = '#ff8fb8';
const SHOES = '#ffffff';
const BOW = '#ff4f8b';

function part(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function makeCharacter() {
  const root = new THREE.Group();   // stays on the ground, and squashes and stretches about the feet
  const body = new THREE.Group();   // bobs while walking
  root.add(body);
  const skin = mat(SKIN, { roughness: 0.7 });
  const hair = mat(HAIR, { roughness: 0.3 });
  const dress = mat(DRESS, { roughness: 0.8 });

  /* Legs (pivot at the hip so they can swing) */
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.1, 0.55, 0);
    hip.add(part(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), skin, 0, -0.25, 0));
    hip.add(part(new THREE.SphereGeometry(0.09, 12, 8), mat(SHOES), 0, -0.5, 0.03));
    body.add(hip);
    return hip;
  });

  /* Dress: flared skirt + bodice */
  const skirt = part(new THREE.CylinderGeometry(0.19, 0.36, 0.42, 20), dress, 0, 0.66, 0);
  body.add(skirt);
  body.add(part(new THREE.CylinderGeometry(0.17, 0.19, 0.32, 20), dress, 0, 1.02, 0));
  const sash = part(new THREE.TorusGeometry(0.19, 0.025, 8, 24), mat('#ffffff'), 0, 0.87, 0); // white waistband
  sash.rotation.x = Math.PI / 2;
  body.add(sash);

  /* Arms (pivot at the shoulder) */
  const arms = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.22, 1.12, 0);
    shoulder.rotation.z = s * 0.18; // relaxed, slightly out from the body
    shoulder.add(part(new THREE.CapsuleGeometry(0.055, 0.3, 4, 8), skin, 0, -0.2, 0));
    body.add(shoulder);
    return shoulder;
  });

  /* Head */
  const head = new THREE.Group();
  head.position.y = 1.44;
  body.add(head);
  head.add(part(new THREE.SphereGeometry(0.3, 24, 18), skin));

  // Hair: a cap over the crown, the back of the head, bangs across the forehead
  // (sphere slices: phi = π/2 is the +Z face side, θ runs down from the top),
  // and long hair hanging down the back
  head.add(part(new THREE.SphereGeometry(0.325, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.3), hair, 0, 0.02, 0));
  head.add(part(new THREE.SphereGeometry(0.325, 24, 18, Math.PI, Math.PI, 0, Math.PI * 0.75), hair, 0, 0.02, 0));
  // temples: wraps from cheek to cheek around the back, leaving only the face open
  head.add(part(new THREE.SphereGeometry(0.322, 24, 18, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.6), hair, 0, 0.02, 0));
  head.add(part(new THREE.SphereGeometry(0.318, 24, 12, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.08, Math.PI * 0.3), hair, 0, 0.02, 0));
  const back = new THREE.Group();   // long hair, sways a little
  back.position.set(0, 0.02, -0.08);
  back.add(part(new THREE.CapsuleGeometry(0.27, 0.42, 6, 16), hair, 0, -0.28, -0.06));
  head.add(back);
  for (const s of [-1, 1]) { // side locks framing the face
    head.add(part(new THREE.CapsuleGeometry(0.07, 0.34, 4, 8), hair, s * 0.26, -0.16, 0.06));
  }
  // A band of shine across the back of the hair, like a drawn highlight
  const shine = part(new THREE.TorusGeometry(0.312, 0.012, 6, 28, Math.PI * 0.55), mat(HAIR_SHINE, { roughness: 0.35 }), 0, 0.13, -0.04);
  shine.rotation.set(Math.PI / 2 - 0.3, 0, Math.PI * 1.225);
  shine.castShadow = false;
  head.add(shine);

  // Bow clipped to the side of the hair
  const bow = new THREE.Group();
  bow.position.set(0.2, 0.22, 0.12);
  bow.rotation.z = -0.4;
  for (const s of [-1, 1]) {
    const loop = part(new THREE.ConeGeometry(0.07, 0.13, 12), mat(BOW), s * 0.065, 0, 0);
    loop.rotation.z = s * Math.PI / 2;
    bow.add(loop);
  }
  bow.add(part(new THREE.SphereGeometry(0.035, 10, 8), mat(BOW)));
  head.add(bow);
  // ...and a big one on the back, since that's the side you mostly see
  const backBow = bow.clone();
  backBow.position.set(0, 0.06, -0.33);
  backBow.rotation.set(0, Math.PI, 0);
  backBow.scale.setScalar(2.1);
  head.add(backBow);

  // Face (on the +Z side)
  const eyes = [], sparkles = [];
  for (const s of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.045, 12, 10), mat('#1c1420', { roughness: 0.3 }), s * 0.1, -0.02, 0.265);
    eye.scale.set(1, 1.35, 0.6);
    head.add(eye);
    eyes.push(eye);
    const sparkle = part(new THREE.SphereGeometry(0.015, 8, 6), mat('#ffffff'), s * 0.1 + 0.015, 0.01, 0.29);
    head.add(sparkle);
    sparkles.push(sparkle);
    const blush = part(new THREE.CircleGeometry(0.05, 16),
      new THREE.MeshBasicMaterial({ color: '#ff9eb5', transparent: true, opacity: 0.7 }), s * 0.17, -0.09, 0.245);
    blush.rotation.y = s * 0.55;
    blush.castShadow = false;
    head.add(blush);
  }
  const smile = part(new THREE.TorusGeometry(0.035, 0.009, 6, 16, Math.PI), mat('#c2415e'), 0, -0.11, 0.285);
  smile.rotation.z = Math.PI; // arc opens upward
  head.add(smile);

  /* Animation. Everything eases between standing, walking, swimming and the
     jump pose, so nothing snaps. These all start at rest. */
  let walk = 0;       // 0 = standing, 1 = full stride
  let air = 0;        // 0 = on the ground, 1 = the jump pose
  let joy = 0;        // 0 = calm, 1 = both arms up, cheering
  let swim = 0;       // 0 = on your feet, 1 = afloat, paddling
  let glide = 0;      // ...and how fast you're swimming, 0..1, eased
  let stride = 0;     // how far through the walk cycle (radians), driven by speed
  let stroke = 0;     // ...and through the paddle, in the water
  let bounce = 0;     // squash (negative) or stretch (positive) on a spring
  let bounceSpeed = 0;
  let hairSwing = 0.08;
  let hairSpeed = 0;
  let blink = 0;      // 1 just as a blink starts, down to 0 when it's over
  let nextBlink = 2;

  // Call every frame. `speed` is 0..1 of a full run (or a full swim), `turn` how hard
  // you're turning, `cheering` whether to throw your arms up, `swimming` whether you're
  // afloat. Returns true on the frame a foot lands, or in the water, a hand dips in
  function animate(dt, time, speed, airborne, turn, cheering, swimming = false) {
    walk += ((airborne || swimming ? 0 : speed) - walk) * Math.min(1, dt * 12);
    air += ((airborne ? 1 : 0) - air) * Math.min(1, dt * 14);
    joy += ((cheering ? 1 : 0) - joy) * Math.min(1, dt * 8);
    swim += ((swimming ? 1 : 0) - swim) * Math.min(1, dt * 7);
    glide += ((swimming ? speed : 0) - glide) * Math.min(1, dt * 4);

    const before = stride;
    stride += dt * 10 * speed;
    const footDown = !airborne && !swimming && walk > 0.3 && Math.sin(before) * Math.sin(stride) <= 0 && stride !== before;
    // A doggy paddle: brisk while you're going somewhere, a lazy scull while you tread water.
    // Each hand dipping back in counts as a beat, for its little splash
    const lastStroke = stroke;
    stroke += dt * (3.4 + 6 * glide);
    const handIn = swimming && glide > 0.25 && Math.cos(lastStroke) * Math.cos(stroke) <= 0;
    if (handIn) character.hand = Math.sin(stroke) > 0 ? -1 : 1; // the one reaching furthest forward

    const swing = Math.sin(stride) * walk * (1 - air);
    // Leaning into the water about the chest, so the head stays over where you are,
    // and not so far that your face goes under
    const lean = swim * (0.25 + 0.4 * glide) * (1 - air);
    for (const [i, leg] of legs.entries()) {
      const kick = Math.sin(stroke * 2 + i * Math.PI) * (0.25 + 0.2 * glide); // flutter kicks
      leg.rotation.x = (i ? -1 : 1) * (swing * 0.6) + air * (i ? -0.2 : 0.3) + swim * kick;
    }
    const wave = Math.sin(time * 9) * 0.28 * joy; // arms waving overhead
    for (const [i, arm] of arms.entries()) {
      const s = i ? 1 : -1;
      const land = s * swing * 0.7 - air * 0.9 * (1 - joy) - joy * 2.7 - s * wave; // little "wheee" pose in the air
      // Paddling: each hand reaches out in front and pulls down under you, the two in turn.
      // `reach` is the arm's angle forward from straight down, in the world, so the lean is undone
      const ph = stroke + i * Math.PI;
      const reach = (0.75 + 0.3 * glide) + (0.35 + 0.5 * glide) * Math.sin(ph);
      arm.rotation.x = land * (1 - swim) - swim * (reach + lean);
      arm.rotation.z = s * (0.18 + swim * (0.42 + 0.22 * Math.cos(ph))); // out to the side as it comes back, so you see it
    }

    const pivot = 1.0; // the chest
    body.position.y = Math.abs(Math.sin(stride)) * 0.06 * walk + Math.sin(time * 2) * 0.008 * (1 - walk) * (1 - swim)
      + Math.abs(Math.sin(time * 6.5)) * 0.14 * joy // bouncing on the spot
      + pivot * (1 - Math.cos(lean)) + swim * Math.sin(stroke * 2) * 0.025; // bobbing with the strokes
    body.position.z = -pivot * Math.sin(lean);
    body.rotation.x = 0.09 * walk + lean; // lean into the run (or the water)...
    body.rotation.z = -turn * (0.12 * walk + 0.18 * swim); // ...and into the turns
    head.rotation.x = -lean * 0.8; // ...but keep looking where you're going
    skirt.scale.x = skirt.scale.z = 1 + 0.05 * walk + 0.12 * air + 0.15 * swim; // the skirt flares

    // The hair trails behind on its own spring, and floats out behind you on the water
    hairSpeed += ((0.08 + walk * 0.26 + air * 0.32 + swim * (0.55 + 0.45 * glide)
      + Math.sin(time * 1.5) * 0.03 * (1 - walk) - hairSwing) * 60 - hairSpeed * 9) * dt;
    hairSwing += hairSpeed * dt;
    back.rotation.x = hairSwing;

    // Jumps and landings set this spring going; it wobbles back to rest
    bounceSpeed += (-bounce * 180 - bounceSpeed * 14) * dt;
    bounce += bounceSpeed * dt;
    root.scale.set(1 - bounce * 0.45, 1 + bounce, 1 - bounce * 0.45);

    // Idle: tilt the head and look around a little, and blink now and then
    head.rotation.z = Math.sin(time * 0.8) * 0.04 * (1 - walk);
    head.rotation.y = Math.sin(time * 0.37) * 0.14 * (1 - walk);
    nextBlink -= dt;
    if (nextBlink < 0) {
      blink = 1;
      nextBlink = 2 + Math.random() * 3.5;
    }
    blink = Math.max(0, blink - dt * 8);
    const open = 1 - Math.sin(blink * Math.PI) * 0.92;
    for (const eye of eyes) eye.scale.y = 1.35 * open;
    for (const sparkle of sparkles) sparkle.visible = open > 0.6;

    return footDown || handIn;
  }

  const character = {
    root,
    animate,
    hand: 1, // which hand last dipped into the water: -1 her right, 1 her left (on +X)
    jump() { bounceSpeed += 3.4; },
    land(impact) { bounceSpeed -= Math.min(4.6, impact * 0.55); },
  };
  return character;
}
