import './styles.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildKitchen, disposeKitchen } from './kitchen.js';
import { state, subscribe } from './state.js';
import { computeQuote } from './pricing.js';
import { buildPanel, renderQuote, showPopover, hidePopover } from './ui.js';
import { createPlanEditor } from './planEditor.js';
import { loadTenant, getTenant, getTheme } from './tenant.js';
import { captureLead } from './lead.js';
import { downloadQuotePdf } from './pdf.js';

const canvas = document.getElementById('scene');
const ctx = createScene(canvas);

let current = null;   // { group, manifest, editables, focus }
let outline = null;
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
});

let rebuildTimer = null;
let lastRebuild = 0;
subscribe(() => {
  const veil = document.getElementById('loadveil');
  const dragging = planEd.isDragging();
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
    ensemble: { pos: [f.a * 0.28 + 1.2, 2.3, d / 2 + 2.7], tgt: [0, 0.9, -d * 0.12] },
    plan: { pos: [0, 9.2, 0.02], tgt: [0, 0, 0] },
    detail: { pos: [f.sink.x + 1.35, 1.5, f.sink.z + 1.7], tgt: [f.sink.x, 0.95, f.sink.z] },
  };
}

const hintChip = document.querySelector('.hint-chip');
document.getElementById('viewBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#viewBtns button').forEach((b) => b.classList.toggle('active', b === btn));
  const view = btn.dataset.view;
  planEd.setMode(view);
  if (hintChip) {
    hintChip.textContent = view === 'plan'
      ? '✏️ Glissez fenêtres, portes, eau · cliquez un mur pour ajouter'
      : '💡 Cliquez sur un meuble pour le modifier';
  }
  const v = viewPositions()[view];
  if (v) ctx.flyTo(v.pos, v.tgt, 1.3);
});

// ————— sélection de module (clic) —————
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return; // c'était une rotation de caméra
  if (planEd.mode() === 'plan') return; // l'éditeur de plan gère ses propres clics
  pickModule(e.clientX, e.clientY);
});

function pickModule(x, y) {
  pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, ctx.camera);
  const hits = raycaster.intersectObjects(current.editables, false);
  clearOutline();
  if (!hits.length) { hidePopover(); return; }
  const hit = hits[0].object;
  const { moduleId, current: cur, width } = hit.userData;
  drawOutline(hit);
  showPopover(x, y, moduleId, cur, width);
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
  canvas.style.cursor = raycaster.intersectObjects(current.editables, false).length ? 'pointer' : '';
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
    devis: { total: lastQuote.total, sousTotal: lastQuote.subtotal, mensualite: lastQuote.monthly },
  }));
  downloadQuotePdf(lastQuote, state, contact);
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
  buildPanel();
  rebuild();
  document.getElementById('printBtn').textContent = 'Télécharger mon devis (PDF)';
  if (process.env.NODE_ENV !== 'production') window.__dbg = { ctx, getCurrent: () => current };

  const splash = document.getElementById('splash');
  document.getElementById('startBtn').addEventListener('click', () => {
    splash.classList.add('gone');
    document.getElementById('app').setAttribute('aria-hidden', 'false');
    // envolée d'introduction
    const v = viewPositions().ensemble;
    ctx.camera.position.set(9, 6, 12);
    ctx.flyTo(v.pos, v.tgt, 2.4);
  });

  // position de départ douce derrière l'écran d'accueil
  ctx.camera.position.set(7, 4.5, 9);
}
