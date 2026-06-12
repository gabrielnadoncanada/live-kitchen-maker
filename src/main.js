import './styles.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildKitchen, disposeKitchen } from './kitchen.js';
import { setAssetReadyCallback } from './assets3d.js';
import { state, setState, subscribe } from './state.js';
import { computeQuote } from './pricing.js';
import { buildPanel, renderQuote, renderNkba, showModuleEditor, showSurfaceEditor, showMenu, hidePopover, showToast, reorderModule, placeModuleAt, moduleTypeLabel } from './ui.js';
import { resolveOpeningPos } from './openings.js';
import { IN } from './skuCatalog.js';
import { buildShareUrl, applySharedConfig } from './share.js';
import { computeNkbaWarnings } from './nkba.js';
import { createPlanEditor } from './planEditor.js';
import { loadTenant, getTenant, getTheme } from './tenant.js';
import { captureLead } from './lead.js';
import { downloadQuotePdf } from './pdf.js';

const canvas = document.getElementById('scene');
const ctx = createScene(canvas);

let current = null;   // { group, manifest, editables, focus }
let outline = null;
let selection = null; // module sélectionné { key, idx, ud, mesh } — clic = choisir, puis déplacer ou paramétrer
let moveDrag = null;  // session de glissement du module sélectionné le long de son mur
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ————— reconstruction de la cuisine —————
function rebuild() {
  if (current) {
    ctx.scene.remove(current.group);
    disposeKitchen(current.group);
  }
  clearOutline();
  hidePopover();
  current = buildKitchen(state);
  ctx.scene.add(current.group);

  // le soleil entre par la fenêtre, quel que soit le mur où elle se trouve
  const w = current.focus.window;
  const n = current.focus.windowNormal;
  ctx.sun.position.set(w.x - n.x * 2.0 - n.z * 1.2, 5.6, w.z - n.z * 2.0 + n.x * 1.2);
  ctx.sun.target.position.set(w.x + n.x * 2.2, 0.4, w.z + n.z * 2.2);
  ctx.sun.target.updateMatrixWorld();

  planEd.sync();
  lastQuote = computeQuote(state, current.manifest);
  renderQuote(lastQuote);
  renderNkba(computeNkbaWarnings(current.nkba));

  // la sélection (module, électro, coin ou ouverture) survit aux reconstructions
  if (selection) {
    const m = selection.ud.fixture
      ? current.editables.find((e2) => e2.userData.fixture === selection.ud.fixture)
      : selection.ud.corner
        ? current.editables.find((e2) => e2.userData.corner === selection.ud.corner)
        : selection.ud.opening
          ? current.editables.find((e2) => e2.userData.opening === selection.ud.opening)
          : findEditable(selection.key, selection.idx);
    if (m) attachSelection(m);
    else deselectModule();
  }
  // micro-animation d'installation après un drop (petit pop d'échelle)
  if (pendingSettle && selection && selection.mesh.parent && !selection.ud.opening) {
    settle = { obj: selection.mesh.parent, t0: performance.now() };
  }
  pendingSettle = false;
}
let lastQuote = null;

const planEd = createPlanEditor(ctx, canvas, () => current, {
  goPlanView: () => {
    const v = viewPositions().plan;
    ctx.flyTo(v.pos, v.tgt, 1.1);
  },
});

// « maison de poupée » : un mur situé entre la caméra et la cuisine s'efface
const tmpV = new THREE.Vector3();
ctx.setTick(() => {
  if (!current) return;
  for (const w of current.walls) {
    tmpV.copy(ctx.camera.position).sub(w.point);
    w.group.visible = tmpV.dot(w.normal) > -0.02;
  }
  positionModbar(); // la mini-barre suit le caisson sélectionné quand la caméra bouge
  if (settle) {
    const f2 = (performance.now() - settle.t0) / 200;
    if (f2 >= 1) { settle.obj.scale.setScalar(1); settle = null; }
    else settle.obj.scale.setScalar(1 + 0.04 * (1 - f2) * (1 - f2));
  }
});

// un asset GLB qui finit de charger remplace son repli procédural au
// prochain rebuild (patch vide → le subscribe debounce fait le reste)
setAssetReadyCallback(() => setState({}));

let rebuildTimer = null;
let lastRebuild = 0;
subscribe(() => {
  const veil = document.getElementById('loadveil');
  // pas de voile pendant un geste ni au lâcher d'un drop (la reconstruction
  // est quasi instantanée — le voile la ferait paraître lente)
  const dragging = planEd.isDragging() || !!(moveDrag && moveDrag.started) || justDropped;
  justDropped = false;
  if (!dragging) veil.classList.add('show');
  clearTimeout(rebuildTimer);
  // pendant un drag en vue plan : throttle (replanification en direct, ~7 fps),
  // sinon : debounce court
  const wait = dragging ? Math.max(0, 140 - (performance.now() - lastRebuild)) : 60;
  rebuildTimer = setTimeout(() => {
    lastRebuild = performance.now();
    rebuild();
    veil.classList.remove('show');
  }, wait);
});

// ————— points de vue —————
function viewPositions() {
  const f = current.focus;
  const d = f.roomD;
  return {
    // en couloir, la vue d'ensemble plonge dans le corridor (la rangée avant cacherait tout)
    ensemble: state.layout === 'galley'
      ? { pos: [f.a * 0.3, 5.4, d / 2 + 3.6], tgt: [0, 0.2, -d * 0.1] }
      : { pos: [f.a * 0.28 + 1.2, 2.3, d / 2 + 2.7], tgt: [0, 0.9, -d * 0.12] },
    // la hauteur du plan cadre toute la cuisine quel que soit le ratio d'écran
    // (en portrait mobile, c'est la largeur qui dicte la distance)
    plan: (() => {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      const half = Math.tan(((ctx.camera.fov / 2) * Math.PI) / 180);
      const need = Math.max(9.2, (d + 1.6) / (2 * half), (f.a + 2.6) / (2 * half * aspect));
      return { pos: [0, Math.min(16, need), 0.02], tgt: [0, 0, 0] };
    })(),
    detail: { pos: [f.sink.x + 1.35, 1.5, f.sink.z + 1.7], tgt: [f.sink.x, 0.95, f.sink.z] },
  };
}

// ————— mobile : panneau en bottom-sheet à 3 états (pincé / mi-écran / plein) —————
const mobileMq = window.matchMedia('(max-width: 860px)');
const sheet = {
  snaps: () => [88, Math.round(window.innerHeight * 0.45), Math.round(window.innerHeight * 0.86)],
  idx: 1,
  set(i) {
    this.idx = Math.max(0, Math.min(2, i));
    document.documentElement.style.setProperty('--sheet-h', `${this.snaps()[this.idx]}px`);
  },
};
function setupMobileSheet() {
  const panel = document.getElementById('panel');
  const grip = document.getElementById('sheetGrip');
  sheet.set(1);
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    drag = { y0: e.clientY, h0: panel.getBoundingClientRect().height, moved: false };
    panel.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const h = Math.max(60, Math.min(window.innerHeight * 0.92, drag.h0 + (drag.y0 - e.clientY)));
    if (Math.abs(e.clientY - drag.y0) > 4) drag.moved = true;
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
  });
  grip.addEventListener('pointerup', () => {
    if (!drag) return;
    panel.classList.remove('dragging');
    const h = panel.getBoundingClientRect().height;
    if (drag.moved) {
      const snaps = sheet.snaps();
      sheet.idx = snaps.reduce((b, s, i) => (Math.abs(s - h) < Math.abs(snaps[b] - h) ? i : b), 0);
      sheet.set(sheet.idx);
    } else {
      // simple tap sur la poignée : pincé ⇄ mi-écran
      sheet.set(sheet.idx === 0 ? 1 : 0);
    }
    drag = null;
  });
}
// le popover module (ui.js) demande à voir le meuble : on pince le sheet
document.addEventListener('sheet:peek', () => { if (mobileMq.matches) sheet.set(0); });

document.getElementById('viewBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#viewBtns button').forEach((b) => b.classList.toggle('active', b === btn));
  const view = btn.dataset.view;
  deselectModule(); // la sélection de module n'a de sens qu'en vue 3D
  planEd.setMode(view);
  // coachmark unique du plan (remplace l'ancien hint permanent)
  if (view === 'plan' && !sessionStorage.getItem('coach-plan')) {
    sessionStorage.setItem('coach-plan', '1');
    setTimeout(() => showToast('✏️ Glissez appareils, fenêtres et portes · touchez un mur pour ajouter'), 1400);
  }
  // en mobile, la vue Plan a besoin de tout l'écran
  if (mobileMq.matches && view !== 'ensemble') sheet.set(0);
  const v = viewPositions()[view];
  if (v) ctx.flyTo(v.pos, v.tgt, 1.3);
});

// ————— sélection de module / surface (tap franc seulement) —————
// Tout est touchable : il faut donc filtrer sévèrement ce qui compte comme un
// « tap ». Au doigt : court (< 400 ms), immobile (< 10 px), et jamais en chaîne
// (un éditeur déjà ouvert se ferme au tap suivant au lieu d'en ouvrir un autre).
let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType === 'touch' };
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const d = downAt;
  downAt = null;
  const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
  const held = performance.now() - d.t;
  if (moved > (d.touch ? 10 : 6)) return; // c'était une rotation de caméra
  if (d.touch && held > 400) return;      // appui long = manipulation, pas un choix
  if (planEd.mode() === 'plan') return;   // l'éditeur de plan gère ses propres clics
  if (moveDrag && moveDrag.freshSelect) return; // ce geste vient de sélectionner : pas d'éditeur en plus
  if (d.touch && !document.getElementById('popover').hidden) {
    hidePopover(); // la sélection (contour + barre) reste : on ferme juste l'éditeur
    return;
  }
  pickModule(e.clientX, e.clientY);
});

function pickModule(x, y) {
  pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, ctx.camera);
  // les hitbox d'un mur escamoté (maison de poupée) ne se cliquent pas à
  // travers ; un espace VIDE est de l'air : tout objet réel touché par le
  // rayon derrière lui gagne
  const hits = raycaster.intersectObjects(current.editables, false).filter((h) => chainVisible(h.object));
  const modHit = hits.find((h) => h.object.userData.current !== 'vide') || hits[0] || null;
  const surfHit = findSurfaceHit();
  // le plus proche gagne — avec deux tolérances : 5 cm en général (façades,
  // panneaux cascade à ~4 cm devant la hitbox), 20 cm quand la surface devant
  // est un comptoir/dosseret (saisir le caisson à travers le débord du
  // comptoir est l'intention évidente)
  const pickTol = surfHit && (surfHit.kind.type === 'counter' || surfHit.kind.type === 'backsplash') ? 0.2 : 0.05;
  if (modHit && (!surfHit || modHit.distance <= surfHit.distance + pickTol)) {
    const ud = modHit.object.userData;
    // fenêtre / porte : sélection simple (glisser, décaler, retirer)
    if (ud.opening) {
      if (!selection || selection.mesh !== modHit.object) {
        hidePopover();
        selectModule(modHit.object);
      }
      return;
    }
    // coin : sélection simple (retirer / remettre via la barre)
    if (ud.corner) {
      if (!selection || selection.mesh !== modHit.object) {
        hidePopover();
        selectModule(modHit.object);
      }
      return;
    }
    // électro : 1er clic = sélection, 2e clic = ses réglages (fini / style)
    if (ud.fixture) {
      if (selection && selection.mesh === modHit.object) {
        showSurfaceEditor(x, y, ud.fixture === 'water' ? { type: 'sink' } : { type: 'appliance' });
      } else {
        hidePopover();
        selectModule(modHit.object);
      }
      return;
    }
    const comp = current.gapComps && current.gapComps[ud.gapKey];
    if (comp) {
      // 1er clic = sélection (déplacer ou paramétrer) ; 2e clic = paramètres
      if (selection && selection.mesh === modHit.object) {
        showModuleEditor(x, y, ud, comp);
      } else {
        hidePopover();
        selectModule(modHit.object);
      }
      return;
    }
  }
  deselectModule();
  if (surfHit) {
    showSurfaceEditor(x, y, surfHit.kind);
    return;
  }
  hidePopover();
}

// ————— sélection de module : mini-barre flottante (déplacer / paramétrer) —————
const modbar = document.createElement('div');
modbar.id = 'modbar';
modbar.hidden = true;
modbar.innerHTML = `
  <span class="mb-title"></span>
  <button class="mb-left" title="Déplacer vers la gauche">◀</button>
  <button class="mb-right" title="Déplacer vers la droite">▶</button>
  <button class="mb-edit">✏️ Paramètres</button>
  <button class="mb-del" title="Retirer ce caisson">🗑</button>
  <button class="mb-close" title="Désélectionner">✕</button>`;
document.getElementById('app').appendChild(modbar);

function findEditable(key, idx) {
  return current.editables.find((m) => m.userData.gapKey === key && m.userData.gapIndex === idx) || null;
}

const FIXTURE_TITLES = { water: 'Évier', stove: 'Cuisinière', dw: 'Lave-vaisselle', fridge: 'Réfrigérateur' };
const CORNER_TITLES = { bl: 'Caisson de coin', br: 'Caisson de coin', ul: 'Coin mural', ur: 'Coin mural' };

function attachSelection(mesh) {
  clearOutline();
  drawOutline(mesh);
  const ud = mesh.userData;
  selection = ud.fixture
    ? { fixture: ud.fixture, ud, mesh }
    : ud.corner
      ? { corner: ud.corner, ud, mesh }
      : ud.opening
        ? { opening: ud.opening, ud, mesh }
        : { key: ud.gapKey, idx: ud.gapIndex, ud, mesh };
  modbar.querySelector('.mb-title').textContent = ud.fixture
    ? `${FIXTURE_TITLES[ud.fixture]} · ${Math.round(ud.widthIn)} po`
    : ud.corner
      ? `${CORNER_TITLES[ud.corner]} · ${Math.round(ud.widthIn)} po`
      : ud.opening
        ? `${ud.openingType === 'fenetre' ? 'Fenêtre' : 'Porte'} · ${Math.round(ud.width * 100)} cm`
        : `${moduleTypeLabel(ud.current)} · ${Math.round(ud.widthIn)} po`;
  // un espace vide se « remplit » plutôt qu'il ne se paramètre ; les coins et
  // les ouvertures n'ont pas de paramètres ; un coin ne se déplace pas
  modbar.querySelector('.mb-edit').textContent = ud.current === 'vide' ? '➕ Ajouter' : '✏️ Paramètres';
  modbar.querySelector('.mb-edit').style.display = (ud.corner || ud.opening) ? 'none' : '';
  modbar.querySelector('.mb-del').style.display = ud.current === 'vide' ? 'none' : '';
  const noMove = !!ud.corner;
  modbar.querySelector('.mb-left').style.display = noMove ? 'none' : '';
  modbar.querySelector('.mb-right').style.display = noMove ? 'none' : '';
  modbar.hidden = false;
  positionModbar();
}
document.addEventListener('atelier:deselect', () => { deselectModule(); hidePopover(); });

function selectModule(mesh) {
  attachSelection(mesh);
  if (!sessionStorage.getItem('coach-module')) {
    sessionStorage.setItem('coach-module', '1');
    showToast('↔ Glissez le caisson pour le déplacer · re-touchez-le pour ses réglages');
  }
}

function deselectModule() {
  if (!selection) return;
  selection = null;
  clearOutline();
  modbar.hidden = true;
}

// la barre suit le caisson sélectionné (projection écran, recalée chaque frame) ;
// elle s'efface si le point passe derrière la caméra ou si le mur est escamoté
function positionModbar() {
  if (!selection || modbar.hidden) return;
  const v = new THREE.Vector3();
  selection.mesh.getWorldPosition(v);
  const behind = v.clone().applyMatrix4(ctx.camera.matrixWorldInverse).z > -0.1;
  const masked = !chainVisible(selection.mesh);
  modbar.style.visibility = behind || masked ? 'hidden' : 'visible';
  if (behind || masked) return;
  v.project(ctx.camera);
  const r = modbar.getBoundingClientRect();
  const x = ((v.x + 1) / 2) * window.innerWidth - r.width / 2;
  const y = ((1 - v.y) / 2) * window.innerHeight - r.height - 46;
  modbar.style.left = `${Math.round(Math.min(Math.max(x, 8), window.innerWidth - r.width - 8))}px`;
  modbar.style.top = `${Math.round(Math.min(Math.max(y, 8), window.innerHeight - r.height - 8))}px`;
}

// préfixe de genre d'un gap : 'back:g' (bas), 'back:u' (murales), 'isl' (îlot) —
// les déplacements ne traversent jamais les genres. Les hitbox sans gapKey
// (électros, coins, ouvertures) donnent null.
const gapPrefix = (key) => (!key ? null : key === 'isl' ? 'isl' : key.slice(0, key.search(/\d+$/)));

// gaps du même mur ET du même genre que key, triés par position de départ
function gapsLike(key) {
  if (key === 'isl') return [{ key: 'isl', comp: current.gapComps.isl, start: 0 }];
  const pre = gapPrefix(key);
  return Object.entries(current.gapComps || {})
    .filter(([k]) => k.startsWith(pre) && /^\d+$/.test(k.slice(pre.length)))
    .map(([k, comp]) => ({ key: k, comp, start: parseInt(k.slice(pre.length), 10) }))
    .sort((p, q) => p.start - q.start);
}

// coordonnée « le long du mur » (m) d'un point monde, pour le mur donné
const alongAxis = (wall, v, f) =>
  (wall === 'left' || wall === 'right') ? v.z + f.roomD / 2 : v.x + f.a / 2;

function modsOfGap(key) {
  return current.editables
    .filter((m) => m.userData.gapKey === key)
    .sort((p, q) => p.userData.gapIndex - q.userData.gapIndex);
}

// vrai si l'ordre des index du gap décroît le long de l'axe (îlot : modules
// posés en miroir, l'index 0 est à droite dans le monde)
const tmpA = new THREE.Vector3();
function gapReversed(key, wall, f) {
  const mods = modsOfGap(key);
  if (mods.length < 2) return false;
  const a0 = alongAxis(wall, mods[0].getWorldPosition(tmpA).clone(), f);
  const a1 = alongAxis(wall, mods[mods.length - 1].getWorldPosition(tmpA).clone(), f);
  return a0 > a1;
}

function applySelectionMove(dstKey, dstIdx) {
  const r = reorderModule(current.gapComps, selection.key, selection.idx, dstKey, dstIdx);
  if (!r) return false;
  selection.key = dstKey;
  selection.idx = r.idx;
  setState({ gapPlans: r.plans });
  return true;
}

// cible des flèches ◀ ▶ : la position voisine, en passant au gap suivant du
// même mur quand on atteint un bord. dir est VISUEL (◀ = vers la gauche) :
// sur un gap inversé (îlot), l'index bouge en sens contraire.
function arrowTarget(dir) {
  const comp = current.gapComps[selection.key];
  if (!comp) return null;
  const wall = selection.key.split(':')[0];
  const d = gapReversed(selection.key, wall, current.focus) ? -dir : dir;
  const ni = selection.idx + d;
  if (ni >= 0 && ni < comp.widths.length) return { key: selection.key, idx: ni };
  const gaps = gapsLike(selection.key);
  const gi = gaps.findIndex((g) => g.key === selection.key);
  const ng = gaps[gi + d];
  if (!ng) return null;
  return { key: ng.key, idx: d > 0 ? 0 : ng.comp.widths.length };
}

const flashDeny = (btn) => { btn.classList.add('deny'); setTimeout(() => btn.classList.remove('deny'), 320); };

// geler la composition actuelle d'un mur en plans explicites : après le
// retrait ou le déplacement d'un électro, la reconstruction par positions
// absolues préserve chaque caisson À SA PLACE — l'espace libéré reste vide
// au lieu d'être re-rempli automatiquement
function freezeWallPlans(wall) {
  const patch = {};
  for (const [k, c] of Object.entries(current.gapComps || {})) {
    if (!k.startsWith(`${wall}:`)) continue;
    patch[k] = {
      widths: [...c.widths],
      types: [...c.types],
      hinges: c.widths.map((_, i) => (c.hinges || [])[i] ?? null),
    };
  }
  return patch;
}

// décaler un électro de 3 po (le solveur revalide : fenêtres, dégagements…)
function nudgeFixture(dir) {
  const ud = selection.ud;
  const len = current.focus.wallLens[ud.wall];
  const pos = Math.min(Math.max(ud.along + dir * 0.075, ud.width / 2 + 0.08), len - ud.width / 2 - 0.08);
  setState({ constraints: { [ud.fixture]: { auto: false, wall: ud.wall, pos } } });
}

// décaler une fenêtre/porte de 3 po (anti-chevauchement REQ-802 respecté)
function nudgeOpening(dir) {
  const ud = selection.ud;
  const p = resolveOpeningPos(state, ud.wall, ud.width, ud.along + dir * 0.075, ud.opening);
  if (p == null) return false;
  setState({ constraints: { openings: state.constraints.openings.map((o) => (o.id === ud.opening ? { ...o, pos: p } : o)) } });
  return true;
}

modbar.querySelector('.mb-left').addEventListener('click', (e) => {
  if (!selection) return;
  if (selection.ud.fixture) return nudgeFixture(-1);
  if (selection.ud.opening) return void (nudgeOpening(-1) || flashDeny(e.currentTarget));
  const t = arrowTarget(-1);
  if (!t || !applySelectionMove(t.key, t.idx)) flashDeny(e.currentTarget);
});
modbar.querySelector('.mb-right').addEventListener('click', (e) => {
  if (!selection) return;
  if (selection.ud.fixture) return nudgeFixture(1);
  if (selection.ud.opening) return void (nudgeOpening(1) || flashDeny(e.currentTarget));
  const t = arrowTarget(1);
  if (!t || !applySelectionMove(t.key, t.idx)) flashDeny(e.currentTarget);
});
modbar.querySelector('.mb-edit').addEventListener('click', () => {
  if (!selection) return;
  // coin retiré : ➕ le remet en place
  if (selection.ud.corner) {
    if (selection.ud.current === 'vide') setState({ cornerOff: { [selection.ud.corner]: false } });
    return;
  }
  const r = modbar.getBoundingClientRect();
  if (selection.ud.fixture) {
    showSurfaceEditor(r.left, r.bottom + 8, selection.ud.fixture === 'water' ? { type: 'sink' } : { type: 'appliance' });
    return;
  }
  const comp = current.gapComps[selection.key];
  if (comp) showModuleEditor(r.left, r.bottom + 8, selection.ud, comp);
});
modbar.querySelector('.mb-del').addEventListener('click', (e) => {
  if (!selection) return;
  // coin : retirer → sa zone est rendue au ruban (ré-ajout depuis l'espace vide)
  if (selection.ud.corner) {
    const k = selection.ud.corner;
    deselectModule();
    hidePopover();
    setState({ cornerOff: { [k]: true } });
    return;
  }
  // fenêtre / porte : retirer l'ouverture
  if (selection.ud.opening) {
    const id = selection.ud.opening;
    deselectModule();
    hidePopover();
    setState({ constraints: { openings: state.constraints.openings.filter((o) => o.id !== id) } });
    return;
  }
  // électro : retirer = désactiver l'appareil (la hotte part avec la
  // cuisinière) — le mur est gelé pour que sa place reste un espace VIDE et
  // que les caissons voisins ne bougent pas
  if (selection.ud.fixture) {
    const off = {
      stove: { range: false, hood: false }, fridge: { fridge: false },
      dw: { dw: false }, water: { sink: false },
    }[selection.ud.fixture];
    if (!off) return flashDeny(e.currentTarget);
    const frozen = freezeWallPlans(selection.ud.wall);
    deselectModule();
    hidePopover();
    setState({ appliances: off, gapPlans: frozen });
    return;
  }
  const comp = current.gapComps[selection.key];
  if (!comp || selection.ud.current === 'vide') return flashDeny(e.currentTarget);
  const types = [...comp.types];
  types[selection.idx] = 'vide';
  setState({ gapPlans: { [selection.key]: {
    widths: [...comp.widths], types,
    hinges: comp.widths.map((_, i) => (comp.hinges || [])[i] ?? null),
  } } });
});
modbar.querySelector('.mb-close').addEventListener('click', () => { deselectModule(); hidePopover(); });

// ————— drag fantôme : aucun rebuild pendant le geste —————
// Le state ne bouge pas tant qu'on glisse : un fantôme translucide suit le
// curseur en continu (60 fps), se snape dans les plages libres, et les cotes
// vers les voisins s'affichent en direct. Tout ne s'applique qu'au lâcher.
let ghost = null;   // { mesh, mat, axis, drop } — drop = action à appliquer au lâcher
let settle = null;  // micro-animation d'installation après le drop

const dimsChip = document.createElement('div');
dimsChip.id = 'dragdims';
dimsChip.hidden = true;
document.getElementById('app').appendChild(dimsChip);

const GHOST_OK = 0xd4ab6a, GHOST_BAD = 0xc0392b;
function makeGhost() {
  const src = selection.mesh;
  const p = src.geometry.parameters;
  const geo = new THREE.BoxGeometry(p.width, p.height, p.depth);
  const mat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.28, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  const edgeMat = new THREE.LineBasicMaterial({ color: GHOST_OK });
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
  src.getWorldPosition(mesh.position);
  src.getWorldQuaternion(mesh.quaternion);
  ctx.scene.add(mesh);
  const wall = selection.ud.wall || (selection.key || '').split(':')[0];
  return { mesh, mat, edgeMat, axis: (wall === 'left' || wall === 'right') ? 'z' : 'x', drop: null };
}

function killGhost() {
  if (!ghost) return;
  ctx.scene.remove(ghost.mesh);
  ghost.mesh.geometry.dispose();
  ghost.mat.dispose();
  ghost.edgeMat.dispose();
  ghost = null;
  dimsChip.hidden = true;
}

function ghostTint(ok) {
  ghost.mat.color.setHex(ok ? GHOST_OK : GHOST_BAD);
  ghost.edgeMat.color.setHex(ok ? GHOST_OK : GHOST_BAD);
}

// chip de cotes au-dessus du fantôme : « ← 13 po | 18 po → »
function showDims(leftIn, rightIn) {
  dimsChip.textContent = `← ${Math.round(leftIn)} po · ${Math.round(rightIn)} po →`;
  dimsChip.hidden = false;
  const v = ghost.mesh.position.clone();
  v.y += ghost.mesh.geometry.parameters.height / 2 + 0.12;
  v.project(ctx.camera);
  const r = dimsChip.getBoundingClientRect();
  dimsChip.style.left = `${Math.round(((v.x + 1) / 2) * window.innerWidth - r.width / 2)}px`;
  dimsChip.style.top = `${Math.round(((1 - v.y) / 2) * window.innerHeight - r.height - 6)}px`;
}

// plages libres ABSOLUES (m, coord pièce) où le module saisi peut se poser :
// les vides du même mur/genre, plus sa propre place actuelle
function moduleFreeRuns() {
  const pre = gapPrefix(selection.key);
  const w = selection.ud.width;
  const runs = [];
  for (const [k, comp] of Object.entries(current.gapComps || {})) {
    if (gapPrefix(k) !== pre) continue;
    const rev = k === 'isl';
    const startM = k === 'isl' ? current.islandRect.x0 + 0.04 : parseInt(k.slice(pre.length), 10) * IN;
    const totalM = comp.totalIn * IN;
    let cum = 0, run = null;
    const push = () => { if (run) { runs.push({ k, a0: run[0], a1: run[1], startM, totalM, rev }); run = null; } };
    for (let i = 0; i < comp.widths.length; i++) {
      const wi = comp.widths[i] * IN;
      const free = comp.types[i] === 'vide' || (k === selection.key && i === selection.idx);
      const a0 = rev ? startM + totalM - cum - wi : startM + cum;
      const a1 = a0 + wi;
      if (free) {
        if (run && Math.abs(a0 - run[1]) < 0.002) run[1] = a1;
        else if (run && Math.abs(a1 - run[0]) < 0.002) run[0] = a0;
        else { push(); run = [a0, a1]; }
      } else push();
      cum += wi;
    }
    push();
  }
  return runs.filter((r) => r.a1 - r.a0 >= w - 0.001);
}

// ————— glissement du caisson sélectionné le long de son mur —————
// position cible (gap + index) sous le pointeur, sur le mur du module sélectionné.
// Tout se calcule depuis les positions MONDE réelles des modules (l'îlot pose
// les siens en miroir : les index décroissent le long de l'axe), jamais depuis
// un cumul théorique.
function dragTarget(e) {
  const wall = selection.key.split(':')[0];
  const f = current.focus;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, ctx.camera);
  const pl = new THREE.Plane();
  if (wall === 'isl') pl.set(new THREE.Vector3(0, 1, 0), -0.45); // plan horizontal à mi-caisson
  else if (wall === 'back') pl.set(new THREE.Vector3(0, 0, 1), f.roomD / 2);
  else if (wall === 'front') pl.set(new THREE.Vector3(0, 0, -1), f.roomD / 2);
  else pl.set(new THREE.Vector3(1, 0, 0), -(f.planes[wall] - f.a / 2));
  const hp = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(pl, hp)) return null;
  const alongM = alongAxis(wall, hp, f);
  // gap visé : celui du module éditable le plus proche du pointeur
  // (même mur ET même genre — un bas ne se glisse pas dans les murales)
  const pre = gapPrefix(selection.key);
  let gKey = null, bd = Infinity;
  for (const m of current.editables) {
    if (gapPrefix(m.userData.gapKey) !== pre) continue;
    const d = Math.abs(alongAxis(wall, m.getWorldPosition(tmpA), f) - alongM);
    if (d < bd) { bd = d; gKey = m.userData.gapKey; }
  }
  if (!gKey) return null;
  // index d'insertion = nombre de centres de modules (hors module déplacé)
  // avant le pointeur, remis dans le sens des index du gap
  const others = modsOfGap(gKey).filter((m) => m !== selection.mesh);
  let p = 0;
  for (const m of others) {
    if (alongM > alongAxis(wall, m.getWorldPosition(tmpA), f)) p++;
  }
  const rev = gapReversed(gKey, wall, f);
  const idx = rev ? others.length - p : p;
  // position visée dans le gap (po depuis son début, dans le sens des index) —
  // pour le placement « position préservée » dans les plages vides
  const startIn = gKey === 'isl'
    ? (current.islandRect.x0 + 0.04) / IN
    : parseInt(gKey.slice(gapPrefix(gKey).length), 10);
  const totalIn = current.gapComps[gKey]?.totalIn ?? 0;
  const alongIn = alongM / IN;
  const offIn = rev ? startIn + totalIn - alongIn : alongIn - startIn;
  return { key: gKey, idx, offIn };
}

// saisie DIRECTE : pointer sur n'importe quel caisson ou électro = le
// sélectionner et pouvoir le glisser immédiatement (un seul geste) ; la
// caméra se manipule depuis le reste de la scène
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || planEd.mode() === 'plan' || !current) return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, ctx.camera);
  // un espace vide est de l'air : l'objet réel derrière gagne la saisie
  const hits = raycaster.intersectObjects(current.editables, false).filter((h) => chainVisible(h.object));
  const modHit = hits.find((h) => h.object.userData.current !== 'vide') || hits[0];
  if (!modHit) return;
  // occlusion : à travers l'îlot ou un autre meuble, le geste reste une
  // rotation — mais saisir à travers le débord du comptoir est permis
  const surfHit = findSurfaceHit();
  const grabTol = surfHit && (surfHit.kind.type === 'counter' || surfHit.kind.type === 'backsplash') ? 0.2 : 0.05;
  if (surfHit && modHit.distance > surfHit.distance + grabTol) return;
  const fresh = !selection || selection.mesh !== modHit.object;
  // un coin se sélectionne mais ne se glisse pas (la caméra garde le geste)
  if (modHit.object.userData.corner) {
    if (fresh) { hidePopover(); selectModule(modHit.object); }
    return;
  }
  if (fresh) {
    hidePopover();
    selectModule(modHit.object);
  }
  // pendant le geste, le state ne bouge pas : le fantôme prévisualise tout
  moveDrag = { x0: e.clientX, y0: e.clientY, started: false, freshSelect: fresh };
  ctx.controls.enabled = false;
  e.stopImmediatePropagation(); // ni OrbitControls ni le reste ne doivent voir ce geste
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ }
}, { capture: true });

// coordonnée du curseur le long d'un mur (coord pièce, m) — îlot : plan horizontal
function cursorAlong(wall, e) {
  const f = current.focus;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, ctx.camera);
  const pl = new THREE.Plane();
  if (wall === 'isl') pl.set(new THREE.Vector3(0, 1, 0), -0.45);
  else if (wall === 'back') pl.set(new THREE.Vector3(0, 0, 1), f.roomD / 2);
  else if (wall === 'front') pl.set(new THREE.Vector3(0, 0, -1), f.roomD / 2);
  else pl.set(new THREE.Vector3(1, 0, 0), -(f.planes[wall] - f.a / 2));
  const hp = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(pl, hp)) return null;
  return alongAxis(wall, hp, f);
}

// position cible d'un électro glissé, le long de son mur
function fixtureDragPos(e) {
  const ud = selection.ud;
  const along = cursorAlong(ud.wall, e);
  if (along == null) return null;
  const len = current.focus.wallLens[ud.wall];
  return Math.min(Math.max(along, ud.width / 2 + 0.08), len - ud.width / 2 - 0.08);
}

canvas.addEventListener('pointermove', (e) => {
  if (!moveDrag || !selection) return;
  e.stopImmediatePropagation();
  const thresh = e.pointerType === 'touch' ? 10 : 6; // aligné sur le filtre de tap
  if (!moveDrag.started && Math.hypot(e.clientX - moveDrag.x0, e.clientY - moveDrag.y0) < thresh) return;
  if (!moveDrag.started) {
    moveDrag.started = true;
    hidePopover();
    canvas.style.cursor = 'grabbing';
    modbar.hidden = true; // la barre laisse place au fantôme et aux cotes
  }
  if (!ghost) ghost = makeGhost();
  const f = current.focus;
  const ud = selection.ud;
  const toWorld = (along) => along - (ghost.axis === 'x' ? f.a / 2 : f.roomD / 2);

  // électro : suit le curseur librement (le solveur revalidera au lâcher)
  if (ud.fixture) {
    const pos = fixtureDragPos(e);
    if (pos == null) return;
    ghost.mesh.position[ghost.axis] = toWorld(pos);
    ghostTint(true);
    ghost.drop = { kind: 'fixture', pos };
    return;
  }
  // fenêtre / porte : le fantôme se pose sur la position résolue (REQ-802) ;
  // rouge quand aucune place n'est possible à cet endroit
  if (ud.opening) {
    const raw = fixtureDragPos(e);
    if (raw == null) return;
    const p = resolveOpeningPos(state, ud.wall, ud.width, raw, ud.opening);
    ghost.mesh.position[ghost.axis] = toWorld(p ?? raw);
    ghostTint(p != null);
    ghost.drop = p != null ? { kind: 'opening', pos: p } : null;
    return;
  }
  // module : snap continu dans les plages libres + cotes vers les voisins
  const wall = selection.key.split(':')[0];
  const along = cursorAlong(wall, e);
  if (along == null) return;
  const w = ud.width;
  let best = null, bd = Infinity;
  for (const r of moduleFreeRuns()) {
    const c = Math.min(Math.max(along, r.a0 + w / 2), r.a1 - w / 2);
    const d2 = Math.abs(c - along);
    if (d2 < bd) { bd = d2; best = { ...r, c }; }
  }
  // un run sans aucun jeu (= sa propre place dans un mur plein) ne « tient »
  // le fantôme que si le curseur reste proche ; au-delà, on prévisualise l'échange
  if (best && (best.a1 - best.a0 - w > 0.04 || bd < 0.18)) {
    ghost.mesh.position[ghost.axis] = toWorld(best.c);
    ghostTint(true);
    const dimL = (best.c - w / 2 - best.a0) / IN, dimR = (best.a1 - best.c - w / 2) / IN;
    if (dimL + dimR >= 1) showDims(dimL, dimR);
    else dimsChip.hidden = true;
    const offIn = best.rev ? (best.startM + best.totalM - best.c) / IN : (best.c - best.startM) / IN;
    ghost.drop = { kind: 'module', gapKey: best.k, offIn };
  } else {
    // aucun espace libre (cuisine proposée pleine) : le lâcher fera un échange
    const len = wall === 'isl' ? f.a : (f.wallLens[wall] ?? f.a);
    ghost.mesh.position[ghost.axis] = toWorld(Math.min(Math.max(along, w / 2), len - w / 2));
    ghostTint(true);
    dimsChip.hidden = true;
    ghost.drop = { kind: 'module-reorder', x: e.clientX, y: e.clientY };
  }
}, { capture: true });

// le simple clic (drag jamais démarré) retombe sur le flux de tap existant,
// qui ouvre les paramètres du module déjà sélectionné. Le lâcher applique le
// drop du fantôme en UNE reconstruction (Échap : rien n'a été touché).
let justDropped = false;
function endModuleDrag(cancelled = false) {
  if (!moveDrag) return;
  const d = moveDrag;
  const drop = ghost ? ghost.drop : null;
  killGhost();
  moveDrag = null;
  ctx.controls.enabled = true;
  canvas.style.cursor = '';
  if (selection) modbar.hidden = false;
  if (cancelled || !d.started || !drop || !selection) return;
  justDropped = true;
  if (drop.kind === 'fixture') {
    setState({
      constraints: { [selection.ud.fixture]: { auto: false, wall: selection.ud.wall, pos: drop.pos } },
      gapPlans: freezeWallPlans(selection.ud.wall),
    });
    pendingSettle = true;
  } else if (drop.kind === 'opening') {
    setState({ constraints: { openings: state.constraints.openings.map((o) => (o.id === selection.ud.opening ? { ...o, pos: drop.pos } : o)) } });
  } else if (drop.kind === 'module') {
    const r = placeModuleAt(current.gapComps, selection.key, selection.idx, drop.gapKey, drop.offIn);
    if (r) {
      selection.key = drop.gapKey;
      selection.idx = r.idx;
      setState({ gapPlans: r.plans });
      pendingSettle = true;
    }
  } else if (drop.kind === 'module-reorder') {
    const t = dragTarget({ clientX: drop.x, clientY: drop.y });
    if (t && (t.key !== selection.key || t.idx !== selection.idx) && applySelectionMove(t.key, t.idx)) {
      pendingSettle = true;
    }
  }
}
let pendingSettle = false;
canvas.addEventListener('pointerup', () => endModuleDrag(), { capture: true });
canvas.addEventListener('pointercancel', () => endModuleDrag(true), { capture: true });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (moveDrag) endModuleDrag(true);
  else if (selection) { deselectModule(); hidePopover(); }
});

// un objet est cliquable seulement si toute sa chaîne de parents est visible
// (exclut les murs escamotés par la maison de poupée, les calques plan/élévation)
function chainVisible(o) {
  while (o) {
    if (o.visible === false) return false;
    o = o.parent;
  }
  return true;
}

function findSurfaceHit() {
  if (!current || !current.matMap) return null;
  const all = raycaster.intersectObjects(current.group.children, true);
  for (const h of all) {
    if (!h.object.isMesh || !chainVisible(h.object)) continue;
    const info = current.matMap.get(h.object.material);
    if (!info) continue;
    const kind = { ...info };
    // coordonnées « pièce » : c'est inner qui porte le centrage de la cuisine
    const lp = (current.inner || current.group).worldToLocal(h.point.clone());
    // une façade dans l'emprise de l'îlot édite la finition de l'îlot
    if (kind.type === 'finish' && current.islandRect) {
      const r = current.islandRect;
      if (lp.x > r.x0 - 0.05 && lp.x < r.x1 + 0.05 && lp.z > r.z0 - 0.05 && lp.z < r.z1 + 0.05) {
        kind.zone = 'island';
      }
    }
    // le dosseret « assorti » partage le matériau du comptoir : on tranche par la hauteur
    if (kind.type === 'counter' && lp.y > 0.97) kind.type = 'backsplash';
    return { distance: h.distance, kind };
  }
  return null;
}

function drawOutline(mesh) {
  const geo = new THREE.EdgesGeometry(mesh.geometry);
  outline = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: getTenant().accentBright }));
  mesh.updateWorldMatrix(true, false);
  outline.applyMatrix4(mesh.matrixWorld);
  ctx.scene.add(outline);
}

function clearOutline() {
  if (outline) {
    ctx.scene.remove(outline);
    outline.geometry.dispose();
    outline.material.dispose();
    outline = null;
  }
}

// survol : curseur main sur les modules éditables
let hoverThrottle = 0;
canvas.addEventListener('pointermove', (e) => {
  if (planEd.mode() === 'plan') return; // curseur géré par l'éditeur de plan
  const now = performance.now();
  if (now - hoverThrottle < 90 || !current) return;
  hoverThrottle = now;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, ctx.camera);
  // tout ce qui est éditable se saisit directement : curseur main
  canvas.style.cursor = raycaster.intersectObjects(current.editables, false).length ? 'grab' : '';
});

document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#popover') && e.target !== canvas) hidePopover();
});

// ————— devis : repli + PDF (avec capture de lead) —————
document.getElementById('quoteToggle').addEventListener('click', () => {
  document.getElementById('quote').classList.toggle('collapsed');
});
document.getElementById('printBtn').addEventListener('click', async () => {
  if (!lastQuote) return;
  const contact = await captureLead(() => ({
    config: JSON.parse(JSON.stringify(state)),
    lien: buildShareUrl(), // REQ-914 : le vendeur rouvre le projet 3D du lead
    devis: { total: lastQuote.total, sousTotal: lastQuote.subtotal, mensualite: lastQuote.monthly },
  }));
  // REQ-916 : vignette panoramique de la cuisine dans le PDF
  const image = ctx.captureImage(2000, 750, 'image/jpeg', 0.85);
  downloadQuotePdf(lastQuote, state, contact, { image, shareUrl: buildShareUrl() });
});

// REQ-914 : partage de la configuration par lien
async function copyShareLink() {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Lien copié ! Envoyez-le ou gardez-le pour reprendre votre projet.');
  } catch {
    window.prompt('Copiez le lien de votre cuisine :', url);
  }
}

// REQ-915 : photo HD de la vue actuelle
function downloadPhoto() {
  const url = ctx.captureImage(2560, 1440, 'image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ma-cuisine.png';
  a.click();
  showToast('Photo HD téléchargée 📸');
}

// un seul bouton « Partager » : photo HD et lien dans le même menu
document.getElementById('shareMenuBtn').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  showMenu(r.left + r.width / 2, r.bottom + 150, 'Partager ma cuisine', [
    { ico: '🔗', label: 'Copier le lien de mon projet', onPick: copyShareLink },
    { ico: '📸', label: 'Télécharger une photo HD', onPick: downloadPhoto },
  ]);
});

// ————— démarrage —————
// Appelé par le composant React après le rendu du balisage (jamais en SSR).
// Idempotent : le double-montage de React StrictMode ne démarre pas deux moteurs.
let booted = false;
export async function initApp() {
  if (booted) return;
  booted = true;

  await loadTenant();
  // le fond de scène et la brume reprennent la teinte sombre du tenant
  ctx.scene.background.set(getTheme().inkDeep);
  ctx.scene.fog.color.set(getTheme().inkDeep);
  // REQ-914 : une configuration partagée dans l'URL (?c=) est rouverte telle quelle
  applySharedConfig();
  buildPanel();
  rebuild();
  document.getElementById('printBtn').textContent = 'Télécharger mon devis (PDF)';
  if (process.env.NODE_ENV !== 'production') {
    window.__dbg = {
      ctx, getCurrent: () => current, state, setState, pickModule, selection: () => selection,
      dragTarget: (e) => dragTarget(e), moveDrag: () => moveDrag, ghost: () => ghost,
      freeRuns: () => (selection ? moduleFreeRuns() : null),
      pickDebug(x, y) {
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(pointer, ctx.camera);
        const modHit = raycaster.intersectObjects(current.editables, false)[0] || null;
        const surfHit = findSurfaceHit();
        return {
          mod: modHit ? { ud: { ...modHit.object.userData }, d: modHit.distance } : null,
          surf: surfHit ? { kind: surfHit.kind, d: surfHit.distance } : null,
          comp: modHit ? !!(current.gapComps && current.gapComps[modHit.object.userData.gapKey]) : null,
        };
      },
    };
  }

  // la 3D d'abord : le devis démarre en pastille (le détail est à un clic)
  document.getElementById('quote').classList.add('collapsed');
  if (mobileMq.matches) setupMobileSheet();

  const splash = document.getElementById('splash');
  document.getElementById('startBtn').addEventListener('click', () => {
    splash.classList.add('gone');
    document.getElementById('app').setAttribute('aria-hidden', 'false');
    // envolée d'introduction
    const v = viewPositions().ensemble;
    ctx.camera.position.set(9, 6, 12);
    ctx.flyTo(v.pos, v.tgt, 2.4);
    // coachmark unique : un seul concept à apprendre
    if (!sessionStorage.getItem('coach-tap')) {
      sessionStorage.setItem('coach-tap', '1');
      setTimeout(() => showToast('💡 Touchez ce que vous voulez changer — meubles, comptoir, murs…'), 2800);
    }
  });

  // position de départ douce derrière l'écran d'accueil
  ctx.camera.position.set(7, 4.5, 9);
}
