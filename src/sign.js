import * as THREE from 'three';
import { canvasTexture, mat, box, cyl } from './kit.js';

// A little wooden signpost with a heart on it. The board faces +Z.
const WOOD = '#9a6a3c';
const WOOD_DARK = '#6e4523';

let faceTex = null;
function signFaceTexture() {
  faceTex ??= canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = WOOD;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; // plank seams and grain
    ctx.lineWidth = 3;
    for (const y of [h / 3, (2 * h) / 3]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.font = 'bold 96px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8456b';
    ctx.fillText('♥', w / 2, h / 2 + 6);
  });
  return faceTex;
}

export function makeSign() {
  const sign = new THREE.Group();
  const wood = mat(WOOD_DARK, { roughness: 0.9 });
  // Post sits behind the board (board back is at z = -0.04) so it never pokes through the face.
  sign.add(cyl(0.07, 1.65, wood, 0, 0.825, -0.11, 8));
  sign.add(box(1.2, 0.75, 0.08, mat(WOOD, { roughness: 0.9 }), 0, 1.35, 0));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.75),
    new THREE.MeshStandardMaterial({ map: signFaceTexture(), roughness: 0.9 })
  );
  face.position.set(0, 1.35, 0.041);
  sign.add(face);
  return sign;
}
