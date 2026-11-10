// Slim the game's models: smaller textures, and fewer triangles where a model has far more than it shows.
// The originals stay where they are; the slimmed copies go to assets/optimized/, which is what the game loads.
// Node, mesh, material and bone names are kept, because the code finds things by name. So is the geometry
// of anything the code measures or rigs by hand, like the beach's terrain bake and the doge's bones.
// Usage: node tools/optimize-assets.mjs [part of a file name, to redo just that one]
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { join as joinPrimitives, normals, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/* Every model the game loads, except the farm's tiny house and field tile. The Kenney pets
   are small already, but keep their colors in a file beside them, which a production build
   can't find. Going through here embeds it, untouched: it's a palette, so it has to stay crisp.
   colors: longest side of the color textures (default 1024)
   other:  longest side of the normal, roughness and other maps (default 512)
   keep:   share of the triangles to keep (default all of them)
   error:  how far the simplified shape may drift, as a share of its size (default 0.002)
   rejoin: drop the normals first, so vertices that are only split by them can merge, and join
           the chunks of each material. 'smooth' then rebuilds smooth normals; 'flat' leaves
           them off, and three shades a mesh with no normals flat
   out:    a different output name (the farm's far-off maples are a second copy)
   draco:  compress the mesh with Draco too
   textures: false leaves the textures exactly as they are */
const PETS = ['cat', 'dog', 'bunny', 'pig', 'cow', 'panda', 'penguin', 'fox', 'monkey', 'chick', 'elephant', 'parrot'];
const JOBS = [
  ...PETS.map((pet) => ({ file: `kenney_cube-pets_1.0/Models/GLB format/animal-${pet}.glb`, out: `pets/animal-${pet}.glb`, textures: false })),
  { file: 'miami_beach/miami_beach_diorama.glb', colors: 1536, other: 1024 },
  { file: 'asian-shop-pack-free-gameready/source/hongkong.glb', colors: 2048, other: 1024 },
  { file: 'beach_characters/mascot.glb' },
  { file: 'beach_characters/cute_squid.glb' },
  { file: 'beach_characters/vress_the_puppy_shark.glb', keep: 0.06, error: 0.012, rejoin: 'smooth' },
  { file: 'cute_characters/cute_alien_character.glb', keep: 0.6 },
  { file: 'cute_characters/cute_avocado.glb' },
  { file: 'cute_characters/cute_bear.glb', keep: 0.16 },
  { file: 'cute_characters/cute_cat_in_cute_banana.glb' },
  { file: 'cute_characters/cute_chick.glb', keep: 0.4 },
  { file: 'cute_characters/cute_little_star.glb' },
  { file: 'cute_characters/cute_rabbit.glb', keep: 0.16 },
  { file: 'gym_characters/big_chungus.glb' },
  { file: 'gym_characters/buff_doge.glb' },
  { file: 'gym_characters/courage_eggplant.glb' },
  { file: 'gym_characters/perri_buff.glb' },
  // Not the hamster: its license (CC-BY-NC-ND) doesn't allow sharing modified copies, so the game loads the original
  { file: 'farm/autumn-maple.glb', keep: 0.5, error: 0.02, rejoin: 'flat', draco: true },
  { file: 'farm/autumn-maple.glb', out: 'farm/autumn-maple-far.glb', keep: 0.12, error: 0.06, rejoin: 'flat', draco: true },
];

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

const triangles = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((sum, p) => sum + (p.getIndices() ?? p.getAttribute('POSITION')).getCount() / 3, 0);
const mb = (path) => (statSync(path).size / 1048576).toFixed(1).padStart(6) + ' MB';

// Share vertices between triangles that touch, keeping one color per corner. A flat-shaded mesh
// colored per face (the maple) has none shared, so the simplifier has nothing it can collapse
function shareVertices(doc, prim) {
  const pos = prim.getAttribute('POSITION'), color = prim.getAttribute('COLOR_0'), idx = prim.getIndices();
  const seen = new Map(), indices = [], positions = [], colors = [], p = [], c = [];
  for (let i = 0, n = idx ? idx.getCount() : pos.getCount(); i < n; i++) {
    const v = idx ? idx.getScalar(i) : i;
    pos.getElement(v, p);
    const key = p.map((x) => x.toFixed(4)).join();
    if (!seen.has(key)) {
      seen.set(key, positions.length / 3);
      positions.push(...p);
      color.getElement(v, c);
      colors.push(c[0], c[1], c[2]);
    }
    indices.push(seen.get(key));
  }
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)));
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(colors)));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)));
}

const only = process.argv[2];
for (const { file, out = file, colors = 1024, other = 512, keep, error = 0.002, rejoin, draco, textures = true } of JOBS) {
  if (only && !file.includes(only) && !out.includes(only)) continue;
  const from = join(ASSETS, file), to = join(ASSETS, 'optimized', out);
  const doc = await io.read(from);
  const before = triangles(doc);

  const steps = [];
  if (rejoin) {
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        prim.setAttribute('NORMAL', null);
        if (rejoin === 'flat') shareVertices(doc, prim);
      }
    }
    steps.push(joinPrimitives({ keepMeshes: false, keepNamed: false }));
  }
  if (keep) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: keep, error }));
  if (rejoin === 'smooth') steps.push(normals({ overwrite: true }));
  steps.push(resample());
  if (textures) {
    steps.push(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [colors, colors], quality: 82, slots: /baseColor|emissive/ }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [other, other], quality: 78, slots: /^(?!baseColor|emissive)/ }),
    );
  }
  await doc.transform(...steps);
  if (draco) doc.createExtension(KHRDracoMeshCompression).setRequired(true);

  mkdirSync(dirname(to), { recursive: true });
  await io.write(to, doc);
  console.log(`${mb(from)} -> ${mb(to)}  ${String(Math.round(before)).padStart(7)} -> ${String(Math.round(triangles(doc))).padStart(6)} tris  ${out}`);
}
