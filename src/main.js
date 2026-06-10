import './styles.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildKitchen, disposeKitchen } from './kitchen.js';
import { state, setState, subscribe } from './state.js';
import { computeQuote } from './pricing.js';
import { buildPanel, renderQuote, renderNkba, showModuleEditor, hidePopover, showToast } from './ui.js';
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
  // en mobile, les vues Plan/Détail ont besoin de tout l'écran
  if (mobileMq.matches && view !== 'ensemble') sheet.set(0);
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
  const ud = hit.userData;
  const comp = current.gapComps && current.gapComps[ud.gapKey];
  if (!comp) { hidePopover(); return; }
  drawOutline(hit);
  showModuleEditor(x, y, ud, comp);
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
    lien: buildShareUrl(), // REQ-914 : le vendeur rouvre le projet 3D du lead
    devis: { total: lastQuote.total, sousTotal: lastQuote.subtotal, mensualite: lastQuote.monthly },
  }));
  // REQ-916 : vignette panoramique de la cuisine dans le PDF
  const image = ctx.captureImage(2000, 750, 'image/jpeg', 0.85);
  downloadQuotePdf(lastQuote, state, contact, { image, shareUrl: buildShareUrl() });
});

// REQ-914 : partage de la configuration par lien
document.getElementById('shareBtn').addEventListener('click', async () => {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Lien copié ! Envoyez-le ou gardez-le pour reprendre votre projet.');
  } catch {
    window.prompt('Copiez le lien de votre cuisine :', url);
  }
});

// REQ-915 : photo HD de la vue actuelle
document.getElementById('photoBtn').addEventListener('click', () => {
  const url = ctx.captureImage(2560, 1440, 'image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ma-cuisine.png';
  a.click();
  showToast('Photo HD téléchargée 📸');
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
  if (process.env.NODE_ENV !== 'production') window.__dbg = { ctx, getCurrent: () => current, state, setState };

  // mobile : la 3D d'abord — devis en pastille, panneau en bottom-sheet
  if (mobileMq.matches) {
    document.getElementById('quote').classList.add('collapsed');
    setupMobileSheet();
  }

  const splash = document.getElementById('splash');
  document.getElementById('startBtn').addEventListener('click', () => {
    splash.classList.add('gone');
    document.getElementById('app').setAttribute('aria-hidden', 'false');
    // envolée d'introduction
    const v = viewPositions().ensemble;
    ctx.camera.position.set(9, 6, 12);
    ctx.flyTo(v.pos, v.tgt, 2.4);
    // coachmark tactile : le hint desktop n'existe pas en mobile
    if (mobileMq.matches && !sessionStorage.getItem('coach-tap')) {
      sessionStorage.setItem('coach-tap', '1');
      setTimeout(() => showToast('💡 Touchez un meuble pour le modifier'), 2800);
    }
  });

  // position de départ douce derrière l'écran d'accueil
  ctx.camera.position.set(7, 4.5, 9);
}
