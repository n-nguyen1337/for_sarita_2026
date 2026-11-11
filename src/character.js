import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, canvasTexture, seeded } from './kit.js';

/* ------------------------------------------------------------------ */
/* PLAYER CHARACTER: a cute chibi girl with long black hair            */
/* Built in code, ~1.8 units tall, feet at y = 0, facing +Z.           */
/* Her face is painted onto the front of her head (see drawFace). The  */
/* hair is a cap over the head, with locks swept along curves for the  */
/* fringe, the strands framing her face, and the long hair down her    */
/* back.                                                               */
/* ------------------------------------------------------------------ */
const SKIN = '#ffe0cf';
const HAIR = '#3a3046';
const HAIR_SHINE = '#a597c2';
const DRESS = '#ff92bb';
const TRIM = '#fff6f9';   // collar, cuffs, petticoat and socks
const SHOES = '#e94a80';
const BOW = '#ff4f8b';
const EYES = ['#1f1428', '#4b2b4c', '#b27b9a']; // iris, from the top down
const LASHES = '#21151f';
const MOUTH = '#a8334f';

const { smoothstep, lerp, clamp } = THREE.MathUtils;
const HEAD = 0.3;     // the head's radius
const CAP = 0.325;    // ...and the hair's, over it

function part(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A direction out from the middle of her head: `around` from her nose toward her
// left (+X), `up` above the middle, both in radians
function dir(around, up, r = 1) {
  return new THREE.Vector3(Math.sin(around) * Math.cos(up) * r, Math.sin(up) * r, Math.cos(around) * Math.cos(up) * r);
}

// Vertices that share a spot along a seam get one normal between them, so no crease shows
function weld(geometry) {
  geometry.computeVertexNormals();
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const spots = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    if (!spots.has(key)) spots.set(key, []);
    spots.get(key).push(i);
  }
  const v = new THREE.Vector3();
  for (const list of spots.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.set(v.x + n.getX(i), v.y + n.getY(i), v.z + n.getZ(i));
    v.normalize();
    for (const i of list) n.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}

/* ------------------------------------------------------------------ */
/* SHAPES                                                               */
/* ------------------------------------------------------------------ */
// A lock of hair (or a ribbon) swept along a curve through `points`. Its cross-section is
// an oval `width(t)` across and `thick(t)` deep, where t runs 0 at the root to 1 at the tip,
// and `out(point, t, target)` says which way its flat face looks. `notch` cuts a V into
// the end, that deep (as a share of the length), like a ribbon's tail
function sweep(points, { width, thick, out, segs = 18, sides = 10, notch = 0 }) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const pos = [], uv = [], index = [];
  for (let i = 0; i <= segs; i++) {
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const t = Math.min(i / segs, 1 - notch * (1 - Math.abs(c)));
      curve.getPointAt(t, P);
      curve.getTangentAt(t, T);
      out(P, t, N);
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(T, N);
      const w = (width(t) / 2) * c, h = (thick(t) / 2) * s;
      pos.push(P.x + B.x * w + N.x * h, P.y + B.y * w + N.y * h, P.z + B.z * w + N.z * h);
      uv.push(k / sides, t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * (sides + 1) + k, b = a + sides + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return weld(g);
}

// How wide a lock is along its length: `w` at its fullest, starting at `root` of that,
// and narrowing to a point over the last `point` of it
const lockWidth = (w, root = 0.75, point = 0.5) => (t) =>
  w * (root + (1 - root) * Math.sin(Math.min(1, t / 0.3) * Math.PI / 2)) * Math.pow(1 - smoothstep(t, 1 - point, 1), 0.75);

// A surface of revolution about Y, through `profile`'s [radius, y] points from the bottom
// up. `shape(angle, t)` pushes the radius in and out (pleats, frills), `wave(angle, t)`
// moves it up and down (a scalloped hem), and `squash` flattens it front to back. It goes
// all the way round with no seam, or only over `arc` ([from, to] angles, 0 at the front)
function revolve(profile, { around = 40, rows = 24, squash = 1, shape = null, wave = null, arc = null } = {}) {
  const spline = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const columns = arc ? around + 1 : around;
  const pos = [], uv = [], index = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const { x: r, y } = spline.getPoint(t);
    for (let k = 0; k < columns; k++) {
      const a = arc ? lerp(arc[0], arc[1], k / around) : (k / around) * Math.PI * 2;
      const rr = r * (shape ? shape(a, t) : 1);
      pos.push(Math.sin(a) * rr, y + (wave ? wave(a, t) : 0), Math.cos(a) * rr * squash);
      uv.push(k / around, t);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * columns + k, b = i * columns + ((k + 1) % columns);
      index.push(a, b, a + columns, b, b + columns, a + columns);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The hair covers the head down to here, going round from her forehead (0) to the
// nape (π): an angle above the middle of the head
const HAIRLINE = [[0, 0.46], [0.6, 0.36], [1.0, -0.12], [1.5, -0.66], [2.3, -0.98], [Math.PI, -1.05]];
function hairline(around) {
  for (let i = 1; i < HAIRLINE.length; i++) {
    if (around > HAIRLINE[i][0]) continue;
    const [a0, e0] = HAIRLINE[i - 1], [a1, e1] = HAIRLINE[i];
    return lerp(e0, e1, (around - a0) / (a1 - a0));
  }
  return HAIRLINE.at(-1)[1];
}

// The hair over her head: a ball a little bigger than the head, fuller at the back, that
// dips under the skin along the hairline so only the face shows
function hairCap() {
  const g = new THREE.SphereGeometry(1, 96, 64);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const around = Math.abs(Math.atan2(x, z));
    const up = Math.asin(clamp(y, -1, 1));
    const line = hairline(around);
    const cover = smoothstep(up, line - 0.13, line + 0.11);
    const r = lerp(HEAD * 0.9, CAP * (1 + 0.07 * Math.max(0, -z) + 0.025 * Math.max(0, y)), cover);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  return weld(g);
}

// One loop of a ribbon bow, reaching `len` along +X from the knot: pinched where it's
// tied, round at the far end, `height` tall and `depth` thick
function bowLoop(len, height, depth) {
  const g = new THREE.SphereGeometry(1, 22, 16).rotateZ(-Math.PI / 2); // poles along X
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const s = (x + 1) / 2;                       // 0 at the knot, 1 at the far end
    const bulge = 1 - Math.pow(1 - s, 0.6);      // fullest out toward the end
    const r = 2 * Math.sqrt(Math.max(0, bulge * (1 - bulge)));
    const ring = Math.hypot(y, z) || 1;
    // a dent down the middle of the front, where the ribbon folds into the loop
    const dent = 1 - 0.35 * Math.max(0, z / ring) * Math.exp(-((y / ring) ** 2) * 6) * Math.sin(Math.PI * s);
    p.setXYZ(i, s * len, (y / ring) * r * (height / 2), (z / ring) * r * (depth / 2) * dent);
  }
  return weld(g);
}

function makeBow(material, len, height, depth) {
  const bow = new THREE.Group();
  const loop = bowLoop(len, height, depth);
  for (const s of [-1, 1]) {
    const m = part(loop, material);
    m.rotation.set(0, s < 0 ? Math.PI : 0, 0.32); // tilted up a little: a V
    bow.add(m);
  }
  const knot = part(new THREE.SphereGeometry(height * 0.3, 14, 10), material);
  knot.scale.set(1, 1.1, 0.75);
  bow.add(knot);
  return bow;
}

// The hair's texture: fine strands running along it, a shade lighter or darker than the
// hair. On the cap (`ring`), the strands run down from the crown, and a soft band of
// shine goes round the head, the way glossy hair catches the light
function hairTexture(ring) {
  const tex = canvasTexture(ring ? 1024 : 256, ring ? 512 : 256, (ctx, w, h) => {
    const rand = seeded(ring ? 11 : 5);
    ctx.fillStyle = HAIR;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (ring ? 260 : 70); i++) {
      const x = rand() * w;
      ctx.strokeStyle = rand() < 0.45
        ? `rgba(160, 140, 190, ${0.06 + rand() * 0.1})`
        : `rgba(12, 6, 18, ${0.12 + rand() * 0.22})`;
      ctx.lineWidth = 1 + rand() * (ring ? 3 : 2.5);
      ctx.beginPath();
      ctx.moveTo(x, -2);
      ctx.lineTo(x + (rand() - 0.5) * 4, h + 2);
      ctx.stroke();
    }
    if (!ring) return;
    // The shine: a soft band about a third of the way down from the crown, made of
    // light catching on strands, so its edges are ragged
    const top = 0.25 * h, bottom = 0.35 * h;
    ctx.strokeStyle = HAIR_SHINE;
    for (let i = 0; i < 700; i++) {
      const x = rand() * w;
      const mid = lerp(top, bottom, 0.45 + (rand() - 0.5) * 0.3);
      const reach = (bottom - top) * (0.15 + rand() * 0.4);
      ctx.globalAlpha = 0.08 + rand() * 0.16;
      ctx.lineWidth = 1 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(x, mid - reach * 0.7);
      ctx.lineTo(x, mid + reach);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* THE FACE, painted on a patch over the front of the head             */
/* ------------------------------------------------------------------ */
// The patch runs FACE_WIDE radians either side of her nose, and from FACE_TOP to
// FACE_BOTTOM radians down from the crown
const FACE_WIDE = 0.95, FACE_TOP = 1.2, FACE_BOTTOM = 2.35;
const FACE_W = 512, FACE_H = Math.round(FACE_W * (FACE_BOTTOM - FACE_TOP) / (2 * FACE_WIDE));
const PX = FACE_W / (2 * FACE_WIDE); // canvas pixels per head radius, in the middle of the face

// Where a point on her face, seen straight on (x toward her left, y up, in head radii,
// from the middle of the head), lands on the patch
function onFace(x, y) {
  const down = Math.acos(clamp(y, -1, 1));
  const around = Math.asin(clamp(x / Math.sin(down), -1, 1));
  return [((around / FACE_WIDE + 1) / 2) * FACE_W, ((down - FACE_TOP) / (FACE_BOTTOM - FACE_TOP)) * FACE_H];
}
function facePath(points, close = true) {
  const path = new Path2D();
  points.forEach(([x, y], i) => {
    const [u, v] = onFace(x, y);
    if (i) path.lineTo(u, v);
    else path.moveTo(u, v);
  });
  if (close) path.closePath();
  return path;
}
function oval(cx, cy, rx, ry, from = 0, to = Math.PI * 2, n = 48) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return points;
}
// A curve across an eye, from its inner to its outer corner: `lift(f)` is how high
// it is at f (-1 inner, 1 outer)
function across(cx, cy, s, half, lift, n = 24) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * 2 - 1;
    points.push([cx + s * f * half, cy + lift(f)]);
  }
  return points;
}

const EYE_X = 0.34, EYE_Y = -0.2, EYE_W = 0.125, EYE_H = 0.165;

// `look` is 'open', 'half' (blinking), 'closed' (blinking) or 'happy' (cheering)
function drawFace(ctx, look) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Rosy cheeks
  for (const s of [-1, 1]) {
    const [u, v] = onFace(s * 0.6, -0.43);
    ctx.save();
    ctx.translate(u, v);
    ctx.scale(1, 0.62);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.18 * PX);
    g.addColorStop(0, 'rgba(255, 105, 140, 0.75)');
    g.addColorStop(0.55, 'rgba(255, 120, 155, 0.45)');
    g.addColorStop(1, 'rgba(255, 140, 170, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 0.18 * PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ...with a few little strokes across them, the way they're drawn in comics
    ctx.strokeStyle = 'rgba(235, 80, 120, 0.55)';
    ctx.lineWidth = 0.011 * PX;
    for (const k of [-1, 0, 1]) {
      const x = s * 0.6 + k * 0.05;
      ctx.stroke(facePath([[x + 0.012, -0.405], [x - 0.012, -0.455]], false));
    }
  }

  for (const s of [-1, 1]) { // s = 1 is her left eye, on the right as you look at her
    const cx = s * EYE_X, cy = EYE_Y;
    ctx.strokeStyle = LASHES;
    ctx.fillStyle = LASHES;
    if (look === 'happy') { // squeezed shut with joy: ^ ^
      ctx.lineWidth = 0.05 * PX;
      ctx.stroke(facePath(across(cx, cy - 0.02, s, EYE_W * 0.95, (f) => 0.075 * Math.cos(f * Math.PI / 2) - 0.03), false));
      continue;
    }
    if (look === 'closed') { // a soft curve, sagging in the middle
      ctx.lineWidth = 0.04 * PX;
      ctx.stroke(facePath(across(cx, cy - 0.03, s, EYE_W, (f) => -0.045 * Math.cos(f * Math.PI / 2)), false));
      ctx.lineWidth = 0.03 * PX;
      ctx.stroke(facePath([[cx + s * EYE_W * 0.95, cy - 0.03], [cx + s * (EYE_W + 0.05), cy + 0.005]], false));
      continue;
    }
    // The iris: dark at the top, glowing warmer toward the bottom
    const lid = look === 'half' ? cy + 0.02 : cy + EYE_H * 1.02; // where the upper lid is
    ctx.save();
    ctx.clip(facePath([[cx - 0.3, lid], [cx + 0.3, lid], [cx + 0.3, cy - 0.4], [cx - 0.3, cy - 0.4]]));
    const [, top] = onFace(cx, cy + EYE_H), [, bottom] = onFace(cx, cy - EYE_H);
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, EYES[0]);
    g.addColorStop(0.5, EYES[1]);
    g.addColorStop(1, EYES[2]);
    ctx.fillStyle = g;
    ctx.fill(facePath(oval(cx, cy, EYE_W, EYE_H)));
    ctx.fillStyle = 'rgba(18, 8, 22, 0.8)'; // pupil
    ctx.fill(facePath(oval(cx, cy + 0.015, EYE_W * 0.48, EYE_H * 0.52)));
    ctx.lineWidth = 0.012 * PX;
    ctx.strokeStyle = 'rgba(30, 16, 36, 0.9)';
    ctx.stroke(facePath(oval(cx, cy, EYE_W, EYE_H)));
    ctx.fillStyle = '#ffffff'; // catchlights, both from the same side
    ctx.fill(facePath(oval(cx - 0.042, cy + 0.06, 0.047, 0.056)));
    ctx.fill(facePath(oval(cx + 0.05, cy - 0.08, 0.022, 0.022)));
    ctx.restore();
    // The upper lashes: a thick line over the top, flicking out at the outer corner
    ctx.fillStyle = LASHES;
    const lash = look === 'half'
      ? across(cx, lid, s, EYE_W * 1.08, (f) => 0.012 * Math.cos(f * Math.PI / 2))
      : oval(cx, cy + 0.004, EYE_W * 1.07, EYE_H * 1.04, s > 0 ? Math.PI * 0.94 : Math.PI * 0.06, s > 0 ? Math.PI * 0.08 : Math.PI * 0.92, 32);
    ctx.lineWidth = 0.042 * PX;
    ctx.strokeStyle = LASHES;
    ctx.stroke(facePath(lash, false));
    const [ox, oy] = lash.at(-1); // ...the flick
    ctx.fill(facePath([[ox - s * 0.03, oy + 0.025], [ox + s * 0.065, oy + 0.045], [ox + s * 0.01, oy - 0.03]]));
    // and a little lower lash at the outer corner
    if (look === 'open') {
      ctx.lineWidth = 0.014 * PX;
      ctx.stroke(facePath(oval(cx, cy, EYE_W * 1.02, EYE_H * 1.03, s > 0 ? -Math.PI * 0.32 : -Math.PI * 0.68, s > 0 ? -Math.PI * 0.08 : -Math.PI * 0.92, 12), false));
    }
  }

  // The mouth: a little open smile with its corners turned up, or a big one when she's cheering
  const [w, d, y] = look === 'happy' ? [0.1, 0.1, -0.49] : [0.072, 0.048, -0.52];
  const mouth = facePath([...across(0, y, 1, w, (f) => 0.016 * f * f), ...oval(0, y + 0.016, w, d + 0.016, 0, -Math.PI)]);
  ctx.fillStyle = MOUTH;
  ctx.fill(mouth);
  ctx.save();
  ctx.clip(mouth);
  ctx.fillStyle = '#ff7f99'; // tongue
  ctx.fill(facePath(oval(0, y - d * 0.85, w * 0.6, d * 0.5)));
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* THE GIRL                                                             */
/* ------------------------------------------------------------------ */
export function makeCharacter() {
  const root = new THREE.Group();   // stays on the ground, and squashes and stretches about the feet
  const body = new THREE.Group();   // bobs while walking
  root.add(body);
  const skin = mat(SKIN, { roughness: 0.7, emissive: '#ff8f7a', emissiveIntensity: 0.07 }); // a touch of warmth, even in the shade
  const dress = mat(DRESS, { roughness: 0.75, side: THREE.DoubleSide });
  const trim = mat(TRIM, { roughness: 0.8, side: THREE.DoubleSide });
  const ribbon = mat(BOW, { roughness: 0.42 });
  const shoes = mat(SHOES, { roughness: 0.35 });

  /* Legs (pivot at the hip so they can swing): frilly ankle socks and round little shoes */
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, 0.55, 0);
    hip.add(part(new THREE.CapsuleGeometry(0.066, 0.3, 4, 12), skin, 0, -0.25, 0));
    hip.add(part(new THREE.CylinderGeometry(0.071, 0.07, 0.075, 16), trim, 0, -0.44, 0));
    const frill = part(new THREE.TorusGeometry(0.073, 0.015, 8, 20), trim, 0, -0.402, 0);
    frill.rotation.x = Math.PI / 2;
    hip.add(frill);
    const shoe = part(new THREE.SphereGeometry(1, 20, 14), shoes, 0, -0.5, 0.03);
    shoe.scale.set(0.08, 0.056, 0.112);
    hip.add(shoe);
    body.add(hip);
    return hip;
  });

  /* The dress: a bodice, a pleated bell of a skirt with a frilly petticoat peeking
     out from under it, a sash with a bow, and a round collar */
  body.add(part(revolve([[0.158, 0.84], [0.171, 0.93], [0.175, 1.0], [0.163, 1.07], [0.128, 1.13], [0.07, 1.175], [0.001, 1.195]], { squash: 0.8 }), dress));
  const skirt = new THREE.Group(); // flares as she moves
  skirt.add(part(revolve([[0.37, 0.475], [0.36, 0.54], [0.315, 0.65], [0.25, 0.76], [0.2, 0.84], [0.17, 0.9]], {
    around: 64,
    shape: (a, t) => 1 + 0.032 * (1 - t) ** 1.5 * Math.cos(a * 16),  // soft pleats
    wave: (a, t) => 0.012 * (1 - t) ** 6 * Math.cos(a * 16),           // ...that scallop the hem
  }), dress));
  skirt.add(part(revolve([[0.395, 0.445], [0.38, 0.48], [0.355, 0.52]], {
    around: 72, rows: 6,
    shape: (a, t) => 1 + 0.03 * (1 - t) * Math.cos(a * 24),
    wave: (a, t) => 0.012 * (1 - t) * Math.cos(a * 24),
  }), trim));
  body.add(skirt);
  body.add(part(revolve([[0.178, 0.84], [0.188, 0.865], [0.18, 0.893]], { rows: 6 }), ribbon)); // sash
  const sashBow = makeBow(ribbon, 0.075, 0.06, 0.035);
  sashBow.position.set(0, 0.866, 0.188);
  body.add(sashBow);
  body.add(part(revolve([[0.152, 1.105], [0.163, 1.13], [0.138, 1.16], [0.085, 1.178]], { rows: 8, squash: 0.85 }), trim)); // collar

  /* Arms (pivot at the shoulder), in puffed sleeves */
  const arms = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.19, 1.105, 0);
    shoulder.rotation.z = s * 0.18; // relaxed, slightly out from the body
    shoulder.add(part(new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), skin, 0, -0.18, 0));
    shoulder.add(part(new THREE.SphereGeometry(0.06, 16, 12), skin, 0, -0.315, 0.005)); // hand
    const puff = part(new THREE.SphereGeometry(0.086, 18, 14), dress, 0, -0.035, 0);
    puff.scale.set(1, 0.9, 1);
    shoulder.add(puff);
    const cuff = part(new THREE.TorusGeometry(0.064, 0.013, 8, 18), trim, 0, -0.098, 0);
    cuff.rotation.x = Math.PI / 2;
    shoulder.add(cuff);
    body.add(shoulder);
    return shoulder;
  });

  /* Head */
  const head = new THREE.Group();
  head.position.y = 1.44;
  body.add(head);
  head.add(part(new THREE.SphereGeometry(HEAD, 40, 28), skin));

  // The face, painted on a patch just over the skin, with a picture for each look
  const faces = {};
  for (const look of ['open', 'half', 'closed', 'happy']) faces[look] = canvasTexture(FACE_W, FACE_H, (ctx) => drawFace(ctx, look));
  const faceMat = new THREE.MeshStandardMaterial({
    map: faces.open, transparent: true, depthWrite: false, roughness: 0.7,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  head.add(new THREE.Mesh(new THREE.SphereGeometry(HEAD * 1.002, 48, 32, Math.PI / 2 - FACE_WIDE, FACE_WIDE * 2, FACE_TOP, FACE_BOTTOM - FACE_TOP), faceMat));

  // Hair: the cap, the fringe and the strands framing her face all sit still on the head
  const strands = hairTexture(false);
  const fromHead = (p, t, n) => n.copy(p).normalize();
  const outward = (p, t, n) => n.set(p.x, 0, p.z).normalize();
  head.add(part(hairCap(), new THREE.MeshStandardMaterial({ map: hairTexture(true), roughness: 0.5 })));
  const still = [];
  const FRINGE = [ // where each lock of the fringe falls (angle round from her nose), how low it reaches (an angle), how wide
    [-0.7, 0.3, 0.12], [-0.47, 0.16, 0.13], [-0.23, 0.08, 0.135], [0.01, 0.13, 0.13],
    [0.25, 0.05, 0.135], [0.49, 0.15, 0.13], [0.72, 0.28, 0.12],
  ];
  for (const [at, to, w] of FRINGE) {
    const points = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      points.push(dir(at + 0.1 * t * t, lerp(1.25, to, t), lerp(0.29, 0.342, smoothstep(t, 0, 0.45)) - 0.006 * t * t));
    }
    still.push(sweep(points, { width: lockWidth(w, 0.85, 0.42), thick: (t) => 0.05 * (1 - 0.55 * t), out: fromHead }));
  }
  for (const s of [-1, 1]) { // the long strands in front of her ears, and behind them
    still.push(sweep([dir(s * 0.95, 0.75, 0.3), dir(s * 1.1, 0.12, 0.338), new THREE.Vector3(s * 0.305, -0.2, 0.1), new THREE.Vector3(s * 0.27, -0.42, 0.135)],
      { width: lockWidth(0.12, 0.9, 0.55), thick: (t) => 0.055 * (1 - 0.5 * t), out: outward }));
    still.push(sweep([dir(s * 1.35, 0.6, 0.3), dir(s * 1.45, 0.0, 0.34), new THREE.Vector3(s * 0.33, -0.25, -0.0), new THREE.Vector3(s * 0.3, -0.5, 0.02)],
      { width: lockWidth(0.13, 0.9, 0.5), thick: (t) => 0.06 * (1 - 0.5 * t), out: outward }));
  }
  head.add(part(mergeGeometries(still), new THREE.MeshStandardMaterial({ map: strands, roughness: 0.5 })));

  // The long hair down her back, which sways: a curtain of it, with a fan of wide
  // locks over that, every other one lying over its neighbors, coming to soft points
  const back = new THREE.Group();
  back.position.set(0, 0.02, -0.08);
  head.add(back);
  const toBack = (p) => p.sub(back.position);
  const below = (around, r, y) => new THREE.Vector3(Math.sin(around) * r, y, Math.cos(around) * r);
  const flowing = [revolve([[0.272, -0.5], [0.282, -0.4], [0.3, -0.24], [0.328, -0.06], [0.29, 0.14], [0.2, 0.25]], {
    arc: [Math.PI - 1.12, Math.PI + 1.12], around: 32, rows: 16,
    wave: (a, t) => -0.035 * (1 - t) ** 8 * (1 + Math.cos(a * 9)),
  }).translate(0, -back.position.y, -back.position.z)];
  const LOCKS = 8;
  for (let i = 0; i < LOCKS; i++) {
    const f = (i / (LOCKS - 1)) * 2 - 1;  // -1..1 across her back
    const at = Math.PI + f;                // fanned round the back of the head
    const layer = i % 2 ? 0.016 : 0;
    const len = 0.6 + 0.09 * Math.cos(f * Math.PI / 2) + [0, 0.02, -0.01, 0.015][i % 4]; // longest in the middle
    const flare = 0.02 + 0.035 * Math.abs(f);
    const points = [dir(at, 0.55, 0.29), dir(at, -0.05, 0.345 + layer), below(at, 0.312 + layer, -0.34), below(at + f * 0.05, 0.285 + layer + flare, -len)];
    flowing.push(sweep(points.map(toBack), {
      width: lockWidth(0.21, 0.9, 0.36), thick: (t) => 0.058 * (1 - 0.45 * t), segs: 22,
      out: (p, t, n) => n.set(p.x, 0, p.z + back.position.z).normalize(),
    }));
  }
  back.add(part(mergeGeometries(flowing), new THREE.MeshStandardMaterial({ map: strands, roughness: 0.5, side: THREE.DoubleSide })));

  // A big bow on the back of the head, its tails trailing down over the hair
  const bow = makeBow(ribbon, 0.2, 0.15, 0.07);
  bow.position.copy(dir(Math.PI, 0.5, 0.35));
  bow.rotation.set(0.5, Math.PI, 0);
  head.add(bow);
  const tails = new THREE.Group(); // they sway with the hair
  tails.position.copy(bow.position);
  head.add(tails);
  const tailPieces = [-1, 1].map((s) => sweep(
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.05, -0.1, -0.055), new THREE.Vector3(s * 0.09, -0.24, -0.065), new THREE.Vector3(s * 0.12, -0.4, -0.07)],
    { width: (t) => 0.075 + 0.02 * t, thick: (t) => 0.02 * (1 - 0.5 * t), out: (p, t, n) => n.set(0, 0.3, -1).normalize(), segs: 14, sides: 8, notch: 0.12 }));
  tails.add(part(mergeGeometries(tailPieces), ribbon));

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
    tails.rotation.x = hairSwing;

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
    const shut = Math.sin(blink * Math.PI); // 0 open .. 1 shut
    const look = joy > 0.5 ? 'happy' : shut > 0.75 ? 'closed' : shut > 0.3 ? 'half' : 'open';
    if (faceMat.map !== faces[look]) faceMat.map = faces[look];

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
