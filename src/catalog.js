// Catalogue des finitions : apparence 3D + tarification.
// Chaque entrée fournit makeMaterial() (paresseux, mis en cache) et des données de prix en CAD.
import * as THREE from 'three';
import {
  woodTexture, plankFloorTexture, marbleTexture, speckleTexture,
  tileTexture, brushedMetalTexture, concreteTexture, paintTexture,
} from './textures.js';

const matCache = new Map();
function cached(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

// ajuste l'échelle physique apparente d'un jeu de textures
function rep(t, x, y) {
  for (const k of ['map', 'bumpMap', 'roughnessMap']) {
    if (t[k]) t[k].repeat.set(x, y);
  }
  return t;
}

function lacquer(color, { sheen = false } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: sheen ? 0.34 : 0.5, metalness: 0,
    clearcoat: sheen ? 0.55 : 0.12, clearcoatRoughness: 0.32,
  });
}

function woodMat(opts, rough = 0.62) {
  const t = woodTexture(opts);
  return new THREE.MeshPhysicalMaterial({
    map: t.map, bumpMap: t.bumpMap, bumpScale: 0.12,
    roughness: rough, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.5,
  });
}

// ————————————— ARMOIRES —————————————
export const CABINET_FINISHES = {
  'blanc-pur': {
    label: 'Laque blanc pur', swatch: '#f5f3ee', group: 'Peint', mult: 1.0,
    make: () => cached('c-blanc', () => lacquer('#f0ede6', { sheen: true })),
  },
  'creme-lin': {
    label: 'Peint crème de lin', swatch: '#e7decc', group: 'Peint', mult: 1.05,
    make: () => cached('c-creme', () => lacquer('#e2d9c6')),
  },
  'vert-sauge': {
    label: 'Peint vert sauge', swatch: '#8a9a84', group: 'Peint', mult: 1.18,
    make: () => cached('c-sauge', () => lacquer('#7d8d77')),
  },
  'vert-foret': {
    label: 'Laque vert forêt', swatch: '#394a3e', group: 'Peint', mult: 1.28,
    make: () => cached('c-foret', () => lacquer('#32433a', { sheen: true })),
  },
  'bleu-minuit': {
    label: 'Laque bleu minuit', swatch: '#2e3c4f', group: 'Peint', mult: 1.28,
    make: () => cached('c-bleu', () => lacquer('#293749', { sheen: true })),
  },
  'terracotta': {
    label: 'Peint terracotta', swatch: '#b06a4d', group: 'Peint', mult: 1.18,
    make: () => cached('c-terra', () => lacquer('#a55f44')),
  },
  'noir-mat': {
    label: 'Noir mat velouté', swatch: '#26262a', group: 'Peint', mult: 1.22,
    make: () => cached('c-noir', () => new THREE.MeshPhysicalMaterial({ color: '#222226', roughness: 0.74 })),
  },
  'chene-naturel': {
    label: 'Chêne naturel', swatch: 'wood:#c8a06c', group: 'Bois véritable', mult: 1.45,
    make: () => cached('c-chene', () => woodMat({ base: '#c09a68', dark: '#9a7549', light: '#dab685', seed: 12, ringScale: 8 })),
  },
  'chene-fume': {
    label: 'Chêne fumé', swatch: 'wood:#8a6a48', group: 'Bois véritable', mult: 1.5,
    make: () => cached('c-fume', () => woodMat({ base: '#85664a', dark: '#5d4430', light: '#a3825e', seed: 19, ringScale: 8 })),
  },
  'noyer': {
    label: 'Noyer huilé', swatch: 'wood:#6b4a30', group: 'Bois véritable', mult: 1.6,
    make: () => cached('c-noyer', () => woodMat({ base: '#64452c', dark: '#3f2a18', light: '#8a6442', seed: 5, ringScale: 9 })),
  },
};

// ————————————— COMPTOIRS ($ / pi²) —————————————
export const COUNTERS = {
  'stratifie': {
    label: 'Stratifié blanc', swatch: '#eceae3', price: 28,
    make: () => cached('t-strat', () => new THREE.MeshPhysicalMaterial({ color: '#e9e7df', roughness: 0.42 })),
  },
  'quartz-blanc': {
    label: 'Quartz Calacatta', swatch: 'marble:#f1efe9', price: 95,
    make: () => cached('t-qblanc', () => {
      const t = marbleTexture({ bg: '#f2f0ea', vein: '#a39c8e', vein2: '#cfc8b9', density: 4, seed: 3 });
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.22 });
    }),
  },
  'quartz-gris': {
    label: 'Quartz gris pierre', swatch: 'speckle:#9d9d9f', price: 88,
    make: () => cached('t-qgris', () => {
      const t = speckleTexture({ bg: '#9a9a9c', specks: ['#7c7c7f', '#b9b9bb', '#65656a', '#d6d6d8'], seed: 8, count: 30000 });
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.25 });
    }),
  },
  'granit-noir': {
    label: 'Granit noir galaxie', swatch: 'speckle:#222', price: 110,
    make: () => cached('t-granit', () => {
      const t = speckleTexture({ bg: '#1d1d20', specks: ['#3c3c42', '#6a6a72', '#0e0e10', '#9b8f76'], seed: 11 });
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.14 });
    }),
  },
  'marbre-vrai': {
    label: 'Marbre Statuario', swatch: 'marble:#eef0f2', price: 145,
    make: () => cached('t-marbre', () => {
      const t = marbleTexture({ bg: '#eef0f1', vein: '#6e7787', vein2: '#aab3bf', density: 7, seed: 14, contrast: 1.3 });
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.18 });
    }),
  },
  'boucher': {
    label: 'Bloc de boucher', swatch: 'wood:#b98a5c', price: 62,
    make: () => cached('t-boucher', () => woodMat({ base: '#b08350', dark: '#8a6038', light: '#cfa472', seed: 27, ringScale: 60 }, 0.5)),
  },
};

// ————————————— DOSSERETS ($ / pi²) —————————————
export const BACKSPLASHES = {
  'metro-blanc': {
    label: 'Tuile métro blanche', swatch: 'tile:#f4f2ec', price: 19,
    make: () => cached('b-metro', () => {
      const t = rep(tileTexture({ tile: '#f4f2ec', grout: '#cfcabf', cols: 7, rows: 13 }), 3, 0.5);
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.5, roughness: 0.24, clearcoat: 0.5 });
    }),
  },
  'zellige-vert': {
    label: 'Zellige émeraude', swatch: 'tile:#3f6a58', price: 36,
    make: () => cached('b-zell', () => {
      const t = rep(tileTexture({ tile: '#3e6b58', grout: '#2c3c34', cols: 9, rows: 9, zellige: true, seed: 13 }), 3.2, 0.4);
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.7, roughness: 0.16, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    }),
  },
  'zellige-blanc': {
    label: 'Zellige nacré', swatch: 'tile:#ece7da', price: 34,
    make: () => cached('b-zellb', () => {
      const t = rep(tileTexture({ tile: '#ebe6d8', grout: '#c5bfae', cols: 9, rows: 9, zellige: true, seed: 23 }), 3.2, 0.4);
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.7, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    }),
  },
  'marbre-plaque': {
    label: 'Plaque de marbre', swatch: 'marble:#eef0f2', price: 92,
    make: () => COUNTERS['marbre-vrai'].make(),
  },
  'assorti': {
    label: 'Assorti au comptoir', swatch: 'match', price: 58,
    make: null, // résolu dynamiquement
  },
};

// ————————————— PLANCHERS ($ / pi²) —————————————
export const FLOORS = {
  'chene-clair': {
    label: 'Chêne clair huilé', swatch: 'wood:#c09a6b', price: 8.5,
    make: () => cached('f-chene', () => {
      const t = plankFloorTexture({ base: '#b3895c', dark: '#8a6440', light: '#d2ab7d', seed: 21 });
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.4, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    }),
  },
  'noyer-fonce': {
    label: 'Noyer foncé', swatch: 'wood:#5e4128', price: 11,
    make: () => cached('f-noyer', () => {
      const t = plankFloorTexture({ base: '#5e4128', dark: '#3c2917', light: '#7d5b39', seed: 33 });
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.4, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    }),
  },
  'beton-poli': {
    label: 'Béton poli', swatch: '#b6b1a8', price: 12,
    make: () => cached('f-beton', () => {
      const t = rep(concreteTexture({ base: '#b4afa6', seed: 9 }), 2.2, 2.2);
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.3 });
    }),
  },
  'carrelage-gres': {
    label: 'Grès grand format', swatch: '#d8d4cc', price: 9.5,
    make: () => cached('f-gres', () => {
      const t = rep(tileTexture({ tile: '#d8d4cb', grout: '#aaa499', cols: 3, rows: 3, seed: 31 }), 3, 3);
      return new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.4, roughness: 0.42 });
    }),
  },
};

// ————————————— MURS —————————————
export const WALLS = {
  'blanc-casse': { label: 'Blanc cassé', swatch: '#ece7dc', make: () => cached('w-blanc', () => new THREE.MeshStandardMaterial({ map: paintTexture({ base: '#e9e4d8' }).map, roughness: 0.92 })) },
  'gris-perle': { label: 'Gris perle', swatch: '#cfcdc8', make: () => cached('w-gris', () => new THREE.MeshStandardMaterial({ map: paintTexture({ base: '#cccac4', seed: 6 }).map, roughness: 0.92 })) },
  'sable': { label: 'Sable chaud', swatch: '#ddcdb2', make: () => cached('w-sable', () => new THREE.MeshStandardMaterial({ map: paintTexture({ base: '#dccdb3', seed: 8 }).map, roughness: 0.92 })) },
  'argile': { label: 'Argile rosée', swatch: '#cfb3a3', make: () => cached('w-argile', () => new THREE.MeshStandardMaterial({ map: paintTexture({ base: '#ccb1a1', seed: 10 }).map, roughness: 0.92 })) },
  'olive-pale': { label: 'Olive pâle', swatch: '#b9bda4', make: () => cached('w-olive', () => new THREE.MeshStandardMaterial({ map: paintTexture({ base: '#b6ba9f', seed: 12 }).map, roughness: 0.92 })) },
};

// ————————————— POIGNÉES ($ / unité) —————————————
export const HANDLES = {
  'barre-laiton': {
    label: 'Barre laiton brossé', swatch: '#c9a35f', price: 16,
    make: () => cached('h-laiton', () => new THREE.MeshPhysicalMaterial({ color: '#c9a35f', metalness: 1, roughness: 0.32 })),
  },
  'barre-noire': {
    label: 'Barre noire mate', swatch: '#2a2a2c', price: 11,
    make: () => cached('h-noir', () => new THREE.MeshPhysicalMaterial({ color: '#222224', metalness: 0.85, roughness: 0.5 })),
  },
  'bouton-chrome': {
    label: 'Bouton chromé', swatch: '#c8ccd0', price: 8,
    make: () => cached('h-chrome', () => new THREE.MeshPhysicalMaterial({ color: '#cdd1d5', metalness: 1, roughness: 0.14 })),
  },
  'integre': {
    label: 'Prise intégrée (sans poignée)', swatch: 'none', price: 4,
    make: () => null,
  },
};

// ————————————— ÉLECTROMÉNAGERS —————————————
export const APPLIANCES = {
  fridge: { label: 'Réfrigérateur 36" portes françaises', price: 2199 },
  range: { label: 'Cuisinière 30" encastrée', price: 1649 },
  hood: { label: 'Hotte cheminée', price: 549 },
  dw: { label: 'Lave-vaisselle panneau intégré', price: 949 },
};
export const APPLIANCE_FINISHES = {
  inox: {
    label: 'Inox brossé', mult: 1.0,
    make: () => cached('a-inox', () => {
      const t = rep(brushedMetalTexture({ base: '#c0c2c5' }), 2, 4);
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, metalness: 0.85, roughness: 0.5, envMapIntensity: 1.1 });
    }),
  },
  noir: {
    label: 'Acier noir', mult: 1.12,
    make: () => cached('a-noirm', () => {
      const t = rep(brushedMetalTexture({ base: '#3a3b3e', seed: 23 }), 2, 4);
      return new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.roughnessMap, metalness: 0.85, roughness: 0.5 });
    }),
  },
};

// ————————————— STYLES PRÉCONÇUS —————————————
export const PRESETS = {
  'scandinave': {
    label: 'Scandinave', colors: ['#f0ede6', '#c8a06c', '#f1efe9', '#b3895c'],
    apply: { cabinetFinish: 'blanc-pur', islandFinish: 'chene-naturel', doorStyle: 'plate', handle: 'integre', counter: 'quartz-blanc', backsplash: 'metro-blanc', floor: 'chene-clair', wall: 'blanc-casse' },
  },
  'noyer-chic': {
    label: 'Noyer chic', colors: ['#64452c', '#f2f0ea', '#c9a35f', '#b4afa6'],
    apply: { cabinetFinish: 'noyer', islandFinish: 'noyer', doorStyle: 'plate', handle: 'barre-laiton', counter: 'quartz-blanc', backsplash: 'zellige-blanc', floor: 'beton-poli', wall: 'blanc-casse' },
  },
  'bistro-vert': {
    label: 'Bistro vert', colors: ['#32433a', '#c9a35f', '#eef0f1', '#8a6440'],
    apply: { cabinetFinish: 'vert-foret', islandFinish: 'vert-foret', doorStyle: 'shaker', handle: 'barre-laiton', counter: 'marbre-vrai', backsplash: 'zellige-vert', floor: 'chene-clair', wall: 'sable' },
  },
  'campagne-douce': {
    label: 'Campagne douce', colors: ['#e2d9c6', '#7d8d77', '#b08350', '#dccdb3'],
    apply: { cabinetFinish: 'creme-lin', islandFinish: 'vert-sauge', doorStyle: 'shaker', handle: 'bouton-chrome', counter: 'boucher', backsplash: 'metro-blanc', floor: 'chene-clair', wall: 'olive-pale' },
  },
  'minuit-marbre': {
    label: 'Minuit & marbre', colors: ['#293749', '#eef0f1', '#c9a35f', '#5e4128'],
    apply: { cabinetFinish: 'bleu-minuit', islandFinish: 'bleu-minuit', doorStyle: 'shaker', handle: 'barre-laiton', counter: 'marbre-vrai', backsplash: 'marbre-plaque', floor: 'noyer-fonce', wall: 'gris-perle' },
  },
  'contraste-brut': {
    label: 'Contraste brut', colors: ['#222226', '#85664a', '#1d1d20', '#b4afa6'],
    // REQ-1002 : two-tone d'origine — bas noirs, hauts chêne fumé
    apply: { cabinetFinish: 'noir-mat', upperFinish: 'chene-fume', islandFinish: 'chene-fume', doorStyle: 'plate', handle: 'barre-noire', counter: 'granit-noir', backsplash: 'assorti', floor: 'beton-poli', wall: 'gris-perle' },
  },
};

// ————————————— PRIX DES CAISSONS (base, avant multiplicateur de finition) —————————————
export const MODULE_PRICES = {
  'base-portes': { label: 'Caisson bas à portes', price: 389 },
  'base-tiroirs': { label: 'Caisson bas à tiroirs', price: 579 },
  'base-ouvert': { label: 'Caisson bas ouvert', price: 329 },
  'base-evier': { label: 'Caisson évier + cuve et robinet', price: 829 },
  'base-coin': { label: 'Caisson de coin', price: 529 },
  'panneau-lv': { label: 'Panneau lave-vaisselle', price: 189 },
  'panneau-frigo': { label: 'Panneau de finition (réfrigérateur)', price: 165 },
  'mur': { label: 'Armoire murale', price: 289 },
  'garde-manger': { label: 'Garde-manger pleine hauteur', price: 949 },
  'couronne': { label: 'Moulure couronne (96 po)', price: 92 },
  'ilot-module': { label: 'Module d’îlot', price: 469 },
  'hotte-coffrage': { label: 'Coffrage de hotte', price: 0 },
};

export const DOOR_STYLE_MULT = { plate: 1.0, shaker: 1.12 };
