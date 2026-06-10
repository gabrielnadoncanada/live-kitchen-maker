// Extrait de catalog.xlsx une grille de prix compacte par famille/largeur
// (finition Blanc Pur = prix de base ; les multiplicateurs de finition du tenant
// s'appliquent par-dessus). Sortie : src/data/dilamcoPrices.json
// Usage : node scripts/extract-prices.mjs
import pkg from 'xlsx';
import { writeFileSync } from 'fs';

const { readFile, utils } = pkg;
const wb = readFile('catalog.xlsx');
const rows = utils.sheet_to_json(wb.Sheets['Products']);
const bp = rows.filter((r) => r.finish === 'Blanc Pur' && r.price);

const num = (v) => (v === '' || v == null ? null : parseFloat(String(v).replace(' 1/2', '.5')));
// le code lisible vit parfois dans `name` (la colonne SKU ne contient que le suffixe de fini)
const skuOf = (r) => (r.SKU && !String(r.SKU).startsWith('-') ? r.SKU : String(r.name || r.internal_code || '').trim());

function byWidth(list, pickHeight = null, depth = null) {
  const out = {};
  for (const r of list) {
    const w = num(r.w);
    if (!w) continue;
    if (depth != null && num(r.d) !== depth) continue;
    const h = num(r.h);
    const cur = out[w];
    const better =
      !cur ||
      (pickHeight != null && Math.abs((h ?? 0) - pickHeight) < Math.abs((cur.h ?? 0) - pickHeight));
    if (better) out[w] = { sku: skuOf(r), price: +r.price, h };
  }
  for (const k of Object.keys(out)) delete out[k].h;
  return out;
}

const sub = (s) => bp.filter((r) => r.sub_category === s);

const data = {
  // caissons bas — hauteur 34½, prof. 24
  baseStandard: byWidth(sub('base-cabinet-standard')),
  baseDrawer: byWidth(sub('base-cabinet-drawer')),
  baseCorner: byWidth(sub('base-cabinet-corner')),
  // murales — hauteur 30 po (≈ notre 0,75 m), prof. 12
  wall: byWidth(
    bp.filter((r) => r.sub_category === 'wall-cabinet-standard' && num(r.d) === 12),
    30
  ),
  // au-dessus du frigo : murales basses (hauteur ~15), prof. la plus profonde dispo
  overFridge: byWidth(
    bp.filter(
      (r) => r.sub_category === 'wall-cabinet-standard' && num(r.h) != null && num(r.h) <= 24 && num(r.h) >= 12
    ),
    15
  ),
  // coin aveugle mural (REQ-704) — hauteur 30
  wallBlindCorner: byWidth(sub('wall-blind-corner'), 30),
  // fausse porte de bout de bas (REQ-711) — hauteur 36
  dummyBaseEnd: byWidth(sub('dummy-door-base-end'), 36),
  // plinthe vendue en longueurs de 96 po (REQ-714)
  toeKick: (() => {
    const list = sub('toe-kick').sort((a, b) => +a.price - +b.price);
    const r = list[0];
    return r ? { sku: skuOf(r), price: +r.price } : null;
  })(),
  // garde-manger — hauteur ~90 (≈ notre 2,25 m), prof. 27
  pantry: byWidth(sub('utility-cabinet-pantry'), 90),
  // rangements spécialisés (REQ-1001)
  spiceRack: byWidth(sub('base-cabinet-spice-rack-pull-out')),
  garbagePullOut: byWidth(sub('base-cabinet-garbage-pull-out')),
  baseMicrowave: byWidth(sub('base-microwave-cabinet')),
  // colonne four mural (REQ-1004) — OC33X103.5
  ovenColumn: byWidth(sub('utility-cabinet-oven'), 100),
  // fillers (1½ / 3 / 6 po) — hauteur 30 pour les bas/murales
  filler: byWidth(sub('fillers-base-wall-tall-filler'), 30),
  // panneaux
  fridgeReturnPanel: (() => {
    const list = sub('panel-refrigerator-return-panel').sort((a, b) => +a.price - +b.price);
    const r = list[0];
    return r ? { sku: skuOf(r), price: +r.price } : null;
  })(),
  dwReturnPanel: (() => {
    const r = sub('panel-dishwasher-return-panel')[0];
    return r ? { sku: skuOf(r), price: +r.price } : null;
  })(),
  islandBackPanel: byWidth(sub('island-back-panel'), 36),
  islandSkinPanel: (() => {
    const list = sub('island-skin-panel').sort((a, b) => +a.price - +b.price);
    const r = list[0];
    return r ? { sku: skuOf(r), price: +r.price } : null;
  })(),
};

writeFileSync('src/data/dilamcoPrices.json', JSON.stringify(data, null, 2));
console.log('OK → src/data/dilamcoPrices.json');
for (const [k, v] of Object.entries(data)) {
  console.log(`  ${k}: ${v && v.sku ? `${v.sku} ${v.price}$` : Object.keys(v || {}).length + ' largeurs'}`);
}
