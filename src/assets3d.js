// Assets GLB (électroménagers photoréalistes) — cache module + repli procédural.
// getAsset() est synchrone : il retourne un clone prêt à poser si le GLB est en
// cache, sinon il lance le chargement (une seule fois) et retourne null — le
// modèle procédural sert de repli, et un rebuild est demandé à l'arrivée du
// fichier via setAssetReadyCallback.
//
// Pipeline de production des GLB : scripts/blender-export-glb.py (export +
// optimisation gltf-transform : textures 512 WebP + meshopt, ~150 Ko par modèle).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// fit 'stretch' : remplit exactement la niche w×h×d — léger étirement accepté,
// à distance de pièce la texture photo l'absorbe (l'electric_stove 50 cm
// s'étire vers 77 cm ; un asset déjà aux cotes 30 po ne bougera presque pas).
// fit 'contain' : échelle uniforme, centré dans la niche.
const CATALOG = {
  cuisiniere: { url: '/assets/appliances/electric_stove/electric_stove.glb', fit: 'stretch' },
};

const cache = new Map(); // clé -> { pending } | { scene } | { failed }
let loader = null;
let onAssetReady = null;

// main.js branche ici son déclencheur de reconstruction
export function setAssetReadyCallback(fn) { onAssetReady = fn; }

// vrai si l'asset est chargé et servira au prochain build (pour ajuster les
// éléments pensés pour le modèle procédural — ex. le torchon sur la barre du four)
export function hasAsset(key) {
  return !!cache.get(key)?.scene;
}

// matériaux des assets chargés — enregistrés dans la matMap du tap-to-edit
// (toucher la cuisinière GLB ouvre l'éditeur d'électroménagers)
export function getLoadedAssetMaterials() {
  const mats = [];
  for (const c of cache.values()) {
    if (c.scene) c.scene.traverse((o) => { if (o.isMesh && o.material) mats.push(o.material); });
  }
  return mats;
}

function startLoad(key, def) {
  cache.set(key, { pending: true });
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  loader.load(def.url, (gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // la géométrie est partagée entre tous les rebuilds : disposeKitchen
        // ne doit pas la libérer
        o.userData.sharedAsset = true;
      }
    });
    cache.set(key, { scene: gltf.scene });
    if (onAssetReady) onAssetReady(key);
  }, undefined, (err) => {
    console.warn(`[assets3d] échec de chargement ${def.url}`, err);
    cache.set(key, { failed: true }); // repli procédural définitif
  });
}

// Retourne l'asset ajusté dans la niche [0..w]×[0..h]×[0..d] (origine du
// module : coin au sol contre le mur, +x le long du mur, +z vers la pièce,
// façade vers +z), ou null si le GLB n'est pas (encore) disponible.
export function getAsset(key, w, h, d) {
  if (typeof window === 'undefined' || globalThis.__DISABLE_GLB_ASSETS__) return null;
  const def = CATALOG[key];
  if (!def) return null;
  const c = cache.get(key);
  if (!c) { startLoad(key, def); return null; }
  if (!c.scene) return null;
  const inst = c.scene.clone(true);
  const bb = new THREE.Box3().setFromObject(inst);
  const size = new THREE.Vector3();
  bb.getSize(size);
  if (!size.x || !size.y || !size.z) return null;
  if (def.fit === 'stretch') inst.scale.set(w / size.x, h / size.y, d / size.z);
  else inst.scale.setScalar(Math.min(w / size.x, h / size.y, d / size.z));
  const bb2 = new THREE.Box3().setFromObject(inst);
  inst.position.set(
    inst.position.x + w / 2 - (bb2.min.x + bb2.max.x) / 2,
    inst.position.y - bb2.min.y,
    inst.position.z - bb2.min.z,
  );
  return inst;
}
