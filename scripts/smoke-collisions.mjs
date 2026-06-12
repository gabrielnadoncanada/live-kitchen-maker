// Test de fumée du filet AABB (REQ-803) : construit une batterie de cuisines
// représentatives en Node (DOM stubé) et vérifie que buildKitchen ne signale
// aucune collision. Usage : node scripts/smoke-collisions.mjs
/* eslint-disable no-console */

// ——— stubs DOM minimaux pour textures.js (canvas 2D procédural) ———
function makeCtx(c) {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return c;
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'getImageData' || k === 'createImageData') {
        return (x, y, w, h) => {
          const W = w ?? x, H = h ?? y;
          return { data: new Uint8ClampedArray(Math.max(4, W * H * 4)), width: W, height: H };
        };
      }
      if (k === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set() { return true; },
  });
}
function makeCanvas() {
  const c = { width: 0, height: 0, style: {} };
  c.getContext = () => makeCtx(c);
  c.toDataURL = () => '';
  return c;
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  querySelector: () => null,
  getElementById: () => null,
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
  addEventListener() {},
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 800,
};
globalThis.__DISABLE_GLB_ASSETS__ = true; // pas de fetch d'assets en Node

const { buildKitchen } = await import('../src/kitchen.js');
const { state, setState } = await import('../src/state.js');

const scenarios = [
  ['défaut (L, îlot, fenêtre, hotte cheminée)', {}],
  ['linéaire sans îlot', { layout: 'lineaire', island: false }],
  ['U, deux fenêtres + porte', {
    layout: 'u',
    dims: { a: 5.2, b: 3.4, c: 3.2 },
    constraints: {
      openings: [
        { id: 1, type: 'fenetre', wall: 'back', pos: 2.4, width: 1.25 },
        { id: 2, type: 'fenetre', wall: 'left', pos: 2.2, width: 1.0 },
        { id: 3, type: 'porte', wall: 'right', pos: 2.4, width: 0.85 },
      ],
    },
  }],
  ['galley (couloir)', { layout: 'galley', island: false, dims: { a: 4.6, b: 2.9, c: 3.0 } }],
  ['micro-hotte + murales 42 po', { layout: 'l', island: true, hoodType: 'micro', wallCabHeight: 42 }],
  ['porte dans l’emprise du coin (garde-fou)', {
    layout: 'l',
    constraints: {
      openings: [
        { id: 1, type: 'fenetre', wall: 'back', pos: 2.6, width: 1.25 },
        { id: 2, type: 'porte', wall: 'back', pos: 0.6, width: 0.85 },
      ],
    },
  }],
  ['cuisinière manuelle sous la fenêtre (rattrapage hotte)', {
    hoodType: 'cheminee',
    constraints: {
      stove: { auto: false, wall: 'back', pos: 2.2 },
      openings: [{ id: 1, type: 'fenetre', wall: 'back', pos: 2.2, width: 1.25 }],
    },
  }],
  ['four mural + farmhouse + péninsule', {
    layout: 'l', island: true, islandMode: 'peninsule', islandFeature: 'evier',
    cooking: 'mural', sinkStyle: 'farmhouse',
  }],
  ['page blanche (autoFill off, vraiment vide)', {
    autoFill: false, island: false,
    appliances: { fridge: false, range: false, hood: false, dw: false, sink: false, pantry: false },
    cornerOff: { bl: true, br: true, ul: true, ur: true },
  }],
  ['page blanche peuplée (caissons + frigo épinglé)', {
    autoFill: false, island: false,
    appliances: { fridge: true, range: false, hood: false, dw: false, pantry: false },
    constraints: {
      fridge: { auto: false, wall: 'back', pos: 3.8 },
      openings: [{ id: 1, type: 'fenetre', wall: 'back', pos: 2.2, width: 1.25 }],
    },
    gapPlans: { 'back:g36': { widths: [24, 30], types: ['tiroirs', 'vide'], hinges: [null, null] } },
  }],
  ['U serré, frigo manuel près du coin', {
    layout: 'u',
    dims: { a: 4.3, b: 3.0, c: 2.8 },
    islandMode: 'libre', islandFeature: 'aucun', island: false,
    cooking: 'cuisiniere', sinkStyle: 'encastre',
    constraints: {
      fridge: { auto: false, wall: 'left', pos: 1.2 },
      openings: [{ id: 1, type: 'fenetre', wall: 'back', pos: 2.0, width: 1.25 }],
    },
  }],
];

let failures = 0;
for (const [name, patch] of scenarios) {
  // repartir d'un état neuf pour les clés non patchées sensibles
  setState({
    layout: 'l', island: true, islandMode: 'libre', islandFeature: 'aucun', autoFill: true,
    dims: { a: 4.4, b: 3.2, c: 3.0 }, ceiling: 9, wallCabHeight: 30,
    cooking: 'cuisiniere', hoodType: 'cheminee', sinkStyle: 'encastre',
    appliances: { fridge: true, range: true, hood: true, dw: true, sink: true, pantry: true },
    cornerOff: { bl: false, br: false, ul: false, ur: false },
    constraints: {
      water: { auto: true, wall: 'back', pos: 2.2 },
      stove: { auto: true, wall: 'back', pos: 3.4 },
      fridge: { auto: true, wall: 'back', pos: 3.9 },
      dw: { auto: true, wall: 'back', pos: 2.9 },
      pantry: { auto: true, wall: 'back', pos: 4.2 },
      openings: [{ id: 1, type: 'fenetre', wall: 'back', pos: 2.2, width: 1.25 }],
    },
    gapPlans: null, // remplacement entier (deepMerge ne vide pas un objet avec {})
  });
  setState(patch);
  let res;
  try {
    res = buildKitchen(state);
  } catch (err) {
    console.error(`✗ ${name} — EXCEPTION : ${err.message}`);
    failures++;
    continue;
  }
  const cols = res.collisions || [];
  if (cols.length) {
    failures++;
    console.error(`✗ ${name} — ${cols.length} chevauchement(s) :`);
    for (const c of cols) console.error(`    ${c.a} ↔ ${c.b}`);
    console.error('    placed:', JSON.stringify(res.nkba?.placed));
    console.error('    openings:', JSON.stringify(state.constraints.openings));
  } else {
    console.log(`✓ ${name}`);
  }
}
console.log(failures ? `\n${failures} scénario(s) en échec` : '\nTous les scénarios passent sans collision.');
process.exit(failures ? 1 : 0);
