// Moteur de devis — convertit le manifeste de construction + l'état en lignes chiffrées (CAD).
// Les paramètres d'affaires (taxes, installation, livraison, financement) viennent du tenant.
import {
  MODULE_PRICES, CABINET_FINISHES, COUNTERS, BACKSPLASHES, FLOORS,
  HANDLES, APPLIANCES, APPLIANCE_FINISHES, DOOR_STYLE_MULT,
} from './catalog.js';
import { getBusiness } from './tenant.js';

const M2_TO_FT2 = 10.7639;

export function computeQuote(state, manifest) {
  const biz = getBusiness();
  const groups = [];
  const finish = CABINET_FINISHES[state.cabinetFinish];
  // REQ-1002 : chaque zone (bas / hauts / îlot) applique le multiplicateur de SA finition
  const multFor = (fk) => (CABINET_FINISHES[fk || state.cabinetFinish] || finish).mult * DOOR_STYLE_MULT[state.doorStyle];
  const zoneMult = {
    base: multFor(state.cabinetFinish),
    upper: multFor(state.upperFinish),
    island: multFor(state.islandFinish),
  };
  const mult = zoneMult.base;

  // ——— Armoires ———
  const cabLines = [];
  let cabTotal = 0;
  // REQ-705 : lignes par SKU réel du catalogue (le devis devient un bon de commande)
  for (const it of Object.values(manifest.skuItems || {})) {
    const unit = Math.round(it.unit * (it.finishMult ? (zoneMult[it.zone] || mult) : 1));
    const total = unit * it.qty;
    cabTotal += total;
    cabLines.push({ name: it.label, detail: `${it.qty} × ${fmt(unit)} · ${it.sku}`, value: total });
  }
  for (const [key, count] of Object.entries(manifest.modules)) {
    const def = MODULE_PRICES[key];
    if (!def || def.price === 0) continue;
    // le façonnage de chant (REQ-912) suit le comptoir, pas la finition d'armoires
    const isCab = !['panneau-lv', 'chant-bullnose'].includes(key);
    const unit = Math.round(def.price * (isCab ? mult : 1));
    const total = unit * count;
    cabTotal += total;
    cabLines.push({ name: def.label, qty: count, detail: `${count} × ${fmt(unit)}`, value: total });
  }
  const upperDef = state.upperFinish && state.upperFinish !== state.cabinetFinish
    ? CABINET_FINISHES[state.upperFinish] : null;
  cabLines.push({
    name: upperDef
      ? `Finition bas ${finish.label.toLowerCase()} · hauts ${upperDef.label.toLowerCase()}`
      : `Finition ${finish.label.toLowerCase()}`,
    detail: state.doorStyle === 'shaker' ? 'façade shaker' : 'façade plane',
    value: null,
  });
  groups.push({ title: 'Armoires et caissons', lines: cabLines, total: cabTotal });

  // ——— Quincaillerie ———
  const handle = HANDLES[state.handle];
  const handleTotal = Math.round(manifest.handles * handle.price);
  groups.push({
    title: 'Quincaillerie',
    lines: [{ name: handle.label, detail: `${manifest.handles} × ${fmt(handle.price)}`, value: handleTotal }],
    total: handleTotal,
  });

  // ——— Surfaces ———
  const surfLines = [];
  let surfTotal = 0;
  const counter = COUNTERS[state.counter];
  const cFt2 = manifest.counterArea * M2_TO_FT2;
  const cVal = Math.round(cFt2 * counter.price);
  surfLines.push({ name: `Comptoir — ${counter.label}`, detail: `${cFt2.toFixed(0)} pi² × ${fmt(counter.price)}`, value: cVal });
  surfTotal += cVal;

  const bs = BACKSPLASHES[state.backsplash];
  const bFt2 = manifest.backsplashArea * M2_TO_FT2;
  const bVal = Math.round(bFt2 * bs.price);
  surfLines.push({ name: `Dosseret — ${bs.label}`, detail: `${bFt2.toFixed(0)} pi² × ${fmt(bs.price)}`, value: bVal });
  surfTotal += bVal;

  const fl = FLOORS[state.floor];
  const fFt2 = manifest.floorArea * M2_TO_FT2;
  const fVal = Math.round(fFt2 * fl.price);
  surfLines.push({ name: `Plancher — ${fl.label}`, detail: `${fFt2.toFixed(0)} pi² × ${fmt(fl.price)}`, value: fVal });
  surfTotal += fVal;
  groups.push({ title: 'Surfaces', lines: surfLines, total: surfTotal });

  // ——— Électroménagers — facturés seulement si le cuisiniste en vend ———
  let appTotal = 0;
  if (biz.sellAppliances) {
    const appLines = [];
    const aMult = APPLIANCE_FINISHES[state.applianceFinish].mult;
    for (const key of ['fridge', 'range', 'hood', 'dw']) {
      if (!manifest.appliances[key]) continue;
      const val = Math.round(APPLIANCES[key].price * aMult);
      appLines.push({ name: APPLIANCES[key].label, detail: APPLIANCE_FINISHES[state.applianceFinish].label, value: val });
      appTotal += val;
    }
    if (appLines.length) groups.push({ title: 'Électroménagers', lines: appLines, total: appTotal });
  }

  // ——— Totaux ———
  const materials = cabTotal + handleTotal + surfTotal;
  const install = Math.round(materials * biz.installRate);
  const subtotal = materials + appTotal + install + biz.delivery;
  const taxes = biz.taxes.map((t) => ({ label: t.label, value: subtotal * t.rate }));
  const total = subtotal + taxes.reduce((s, t) => s + t.value, 0);
  const monthly = Math.round((total * biz.financingFactor) / biz.financingMonths);

  return {
    groups,
    install, installRate: biz.installRate, delivery: biz.delivery,
    subtotal, taxes, total, monthly, financingMonths: biz.financingMonths,
  };
}

export function fmt(n) {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(n);
}
