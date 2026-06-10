// État central de la configuration + pub/sub minimaliste.
const listeners = new Set();

export const state = {
  layout: 'l',            // 'lineaire' | 'l' | 'u' | 'galley' (REQ-1005)
  island: true,
  islandMode: 'libre',    // 'libre' | 'peninsule' — rattachée au mur droit (REQ-1005)
  islandFeature: 'aucun', // 'aucun' | 'evier' | 'plaque' — fonction de l'îlot (REQ-1006)
  dims: { a: 4.4, b: 3.2, c: 3.0 },  // en galley, b = profondeur du corridor
  ceiling: 9,             // hauteur de plafond en pieds : 8 | 9 | 10
  // contraintes réelles de la pièce
  constraints: {
    water: { auto: true, wall: 'back', pos: 2.2 },   // entrée d'eau → position de l'évier
    stove: { auto: true, wall: 'back', pos: 3.4 },   // prise 240 V → position de la cuisinière
    // ouvertures existantes : fenêtres et portes, positionnées le long d'un mur
    openings: [
      { id: 1, type: 'fenetre', wall: 'back', pos: 2.2, width: 1.25 },
    ],
  },
  preset: 'noyer-chic',
  doorStyle: 'plate',     // 'plate' | 'shaker'
  cabinetFinish: 'noyer',
  upperFinish: null,      // finition des armoires murales — null = comme les bas (REQ-1002)
  islandFinish: 'noyer',
  handle: 'barre-laiton',
  counter: 'quartz-blanc',
  backsplash: 'zellige-blanc',
  floor: 'beton-poli',
  wall: 'blanc-casse',
  appliances: { fridge: true, range: true, hood: true, dw: true },
  cooking: 'cuisiniere',  // 'cuisiniere' | 'mural' — four mural + plaque séparée (REQ-1004)
  hoodType: 'cheminee',   // 'cheminee' | 'micro' — micro-hotte combinée (REQ-1003)
  applianceFinish: 'inox',
  moduleOverrides: {},    // id de module -> 'portes' | 'tiroirs' | 'ouvert'
  // REQ-1001 : composition persistée par segment de comptoir.
  // clé de segment -> { widths: [poucesPo...], types: { index: type } }
  gapPlans: {},
};

export function setState(patch, meta = {}) {
  deepMerge(state, patch);
  for (const fn of listeners) fn(state, meta);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function deepMerge(target, patch) {
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && target[k]) {
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
}
