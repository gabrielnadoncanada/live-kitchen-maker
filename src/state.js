// État central de la configuration + pub/sub minimaliste.
const listeners = new Set();

export const state = {
  layout: 'l',            // 'lineaire' | 'l' | 'u' | 'galley' (REQ-1005)
  autoFill: true,         // false = page blanche : les espaces libres ne s'auto-peuplent pas
  // coins retirés par l'utilisateur (bl/br = caissons de coin bas, ul/ur = coins aveugles muraux)
  cornerOff: { bl: false, br: false, ul: false, ur: false },
  island: true,
  islandMode: 'libre',    // 'libre' | 'peninsule' — rattachée au mur droit (REQ-1005)
  islandFeature: 'aucun', // 'aucun' | 'evier' | 'plaque' — fonction de l'îlot (REQ-1006)
  dims: { a: 4.4, b: 3.2, c: 3.0 },  // en galley, b = profondeur du corridor
  ceiling: 9,             // hauteur de plafond en pieds : 8 | 9 | 10
  // contraintes réelles de la pièce
  constraints: {
    water: { auto: true, wall: 'back', pos: 2.2 },   // entrée d'eau → position de l'évier
    stove: { auto: true, wall: 'back', pos: 3.4 },   // prise 240 V → position de la cuisinière
    fridge: { auto: true, wall: 'back', pos: 3.9 },  // REQ-1008 : frigo déplaçable en vue plan
    dw: { auto: true, wall: 'back', pos: 2.9 },      // REQ-1008 : lave-vaisselle déplaçable
    // ouvertures existantes : fenêtres et portes, positionnées le long d'un mur
    openings: [
      { id: 1, type: 'fenetre', wall: 'back', pos: 2.2, width: 1.25 },
    ],
  },
  preset: 'noyer-chic',
  wallCabHeight: 30,      // hauteur des murales en pouces : 30 | 36 | 42 (REQ-1007)
  doorStyle: 'plate',     // 'plate' | 'shaker'
  cabinetFinish: 'noyer',
  upperFinish: null,      // finition des armoires murales — null = comme les bas (REQ-1002)
  islandFinish: 'noyer',
  handle: 'barre-laiton',
  counter: 'quartz-blanc',
  counterEdge: 'adouci',  // 'vif' | 'adouci' | 'bullnose' — profil de chant (REQ-912)
  backsplash: 'zellige-blanc',
  floor: 'beton-poli',
  wall: 'blanc-casse',
  appliances: { fridge: true, range: true, hood: true, dw: true, sink: true, pantry: true },
  sinkStyle: 'encastre',  // 'encastre' | 'farmhouse' — évier à tablier FSBC (REQ-908)
  sinkBowls: 'simple',    // 'simple' | 'double' (REQ-908)
  faucetStyle: 'colcygne',// 'colcygne' | 'pont' | 'pro' (REQ-908)
  cooking: 'cuisiniere',  // 'cuisiniere' | 'mural' — four mural + plaque séparée (REQ-1004)
  hoodType: 'cheminee',   // 'cheminee' | 'micro' — micro-hotte combinée (REQ-1003)
  applianceFinish: 'inox',
  moduleOverrides: {},    // id de module -> 'portes' | 'tiroirs' | 'ouvert'
  // REQ-1001 : composition persistée par segment de comptoir.
  // clé de segment -> { widths: [poucesPo...], types: [...], hinges: [...] }
  // (hinges : REQ-910 — 'gauche' | 'droite' par caisson à porte simple)
  gapPlans: {},
};

// ——— historique (annuler / rétablir) ———
// Instantané AVANT chaque changement ; les rafales (drag en vue plan, curseurs)
// se groupent en une seule entrée — un geste = un undo.
const history = { past: [], future: [], lastPush: 0 };

export function setState(patch, meta = {}) {
  if (!meta.undo) {
    const now = Date.now();
    if (now - history.lastPush > 350) {
      history.past.push(JSON.stringify(state));
      if (history.past.length > 100) history.past.shift();
      history.future.length = 0;
    }
    history.lastPush = now;
  }
  deepMerge(state, patch);
  for (const fn of listeners) fn(state, meta);
}

function restore(snap) {
  // remplacement EN PLACE : tous les modules référencent cet objet
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, JSON.parse(snap));
  history.lastPush = 0; // le prochain changement repart sur une entrée neuve
  for (const fn of listeners) fn(state, { undo: true });
}

export function undo() {
  if (!history.past.length) return false;
  history.future.push(JSON.stringify(state));
  restore(history.past.pop());
  return true;
}

export function redo() {
  if (!history.future.length) return false;
  history.past.push(JSON.stringify(state));
  restore(history.future.pop());
  return true;
}

export const canUndo = () => history.past.length > 0;
export const canRedo = () => history.future.length > 0;

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
