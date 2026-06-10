// Générateur paramétrique de cuisine avec contraintes réelles de la pièce :
// portes (zones interdites), fenêtres (bloquent les armoires murales), entrée d'eau
// (position de l'évier) et prise de cuisinière. Le planificateur résout les positions
// sur des segments libres, mur par mur.
// buildKitchen(state) -> { group, manifest, editables, focus, walls }
import * as THREE from 'three';
import {
  CABINET_FINISHES, COUNTERS, BACKSPLASHES, FLOORS, WALLS,
  HANDLES, APPLIANCE_FINISHES,
} from './catalog.js';
import { getTenant, getTheme } from './tenant.js';
import { findSku, fillerSku, IN } from './skuCatalog.js';

// ——— dimensions normalisées (m) ———
const PLINTH = 0.1;
const CARCASS_H = 0.76;
const COUNTER_H = PLINTH + CARCASS_H;        // 0.86
const COUNTER_T = 0.04;
const COUNTER_TOP = COUNTER_H + COUNTER_T;   // 0.90
const BASE_D = 0.6;
const COUNTER_D = 0.66;
const WALL_BOT = 1.5;
const WALL_CAB_H = 0.75;
const WALL_CAB_D = 0.305; // 12 po — profondeur murale catalogue (REQ-702)
const PANTRY_D = 0.69;    // 27 po — profondeur garde-manger catalogue (REQ-702)
const TALL_H = WALL_BOT + WALL_CAB_H;        // 2.25
// REQ-708 : hauteur de pièce selon le plafond du client (8/9/10 pi) —
// mutée au début de chaque buildKitchen (construction synchrone)
let ROOM_H = 2.74;
const CEILINGS = { 8: 2.44, 9: 2.74, 10: 3.05 };
const CORNER = 0.92;
const DOOR_T = 0.019;
const GAP = 0.004;

const SINK_W = 0.9, DW_W = 0.61, RANGE_W = 0.77, FRIDGE_W = 0.93, PANTRY_W = 0.62;

// matériaux fixes partagés
const shared = {};
function fixedMats() {
  if (shared.done) return shared;
  shared.interior = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.8 });
  shared.darkMetal = new THREE.MeshPhysicalMaterial({ color: '#26262a', metalness: 0.7, roughness: 0.45 });
  shared.blackGlass = new THREE.MeshPhysicalMaterial({ color: '#0c0c0e', metalness: 0.4, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 });
  shared.sinkSteel = new THREE.MeshPhysicalMaterial({ color: '#c6c9cc', metalness: 0.9, roughness: 0.38 });
  shared.white = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.6 });
  shared.doorWhite = new THREE.MeshStandardMaterial({ color: '#f2efe7', roughness: 0.55 });
  shared.glow = new THREE.MeshBasicMaterial({ color: '#fff3da' });
  shared.skyGlow = new THREE.MeshBasicMaterial({ color: '#eaf3fb' });
  shared.plantGreen = new THREE.MeshStandardMaterial({ color: '#4a6b3f', roughness: 0.85 });
  shared.plantGreen2 = new THREE.MeshStandardMaterial({ color: '#5d8049', roughness: 0.85 });
  shared.potClay = new THREE.MeshStandardMaterial({ color: '#a8765a', roughness: 0.9 });
  shared.fruit = new THREE.MeshStandardMaterial({ color: '#d98e32', roughness: 0.55 });
  shared.ceramic = new THREE.MeshPhysicalMaterial({ color: '#ece6d8', roughness: 0.25, clearcoat: 0.8 });
  shared.shadeBlack = new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.6, metalness: 0.4 });
  shared.brassTrim = new THREE.MeshPhysicalMaterial({ color: '#c9a35f', metalness: 1, roughness: 0.3 });
  shared.boardWood = new THREE.MeshStandardMaterial({ color: '#9c7448', roughness: 0.7 });
  shared.done = true;
  return shared;
}

// répète la texture sur les grandes surfaces pour garder une densité de grain constante
function scaleUV(mesh, sx, sy = 1) {
  const uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return mesh;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r, h, mat, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ——— façades ———
function makeFront(w, h, mat, style) {
  const g = new THREE.Group();
  if (style === 'shaker' && w > 0.24 && h > 0.22) {
    const fw = 0.066;
    g.add(box(w, h, DOOR_T * 0.6, mat, 0, 0, -DOOR_T * 0.2));
    g.add(box(w, fw, DOOR_T, mat, 0, h / 2 - fw / 2, 0));
    g.add(box(w, fw, DOOR_T, mat, 0, -h / 2 + fw / 2, 0));
    g.add(box(fw, h - fw * 2, DOOR_T, mat, -w / 2 + fw / 2, 0, 0));
    g.add(box(fw, h - fw * 2, DOOR_T, mat, w / 2 - fw / 2, 0, 0));
  } else {
    g.add(box(w, h, DOOR_T, mat));
  }
  return g;
}

function makeHandle(kind, mat, vertical = false, len = 0.17) {
  if (!mat || kind === 'integre') return null;
  const g = new THREE.Group();
  if (kind === 'bouton-chrome') {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 16, 12), mat);
    knob.castShadow = true;
    knob.position.z = 0.018;
    g.add(cyl(0.005, 0.018, mat, 0, 0, 0.008).rotateX(Math.PI / 2), knob);
  } else {
    const bar = cyl(0.0058, len, mat, 0, 0, 0.03);
    bar.rotation.z = vertical ? 0 : Math.PI / 2;
    g.add(bar);
    const off = len / 2 - 0.015;
    for (const s of [-1, 1]) {
      const st = cyl(0.004, 0.026, mat, vertical ? 0 : s * off, vertical ? s * off : 0, 0.015);
      st.rotation.x = Math.PI / 2;
      g.add(st);
    }
  }
  return g;
}

// ——— caisson bas ———
function buildBase(w, type, mats, manifest, widthIn = null) {
  const { finish, handleKind, handleMat, doorStyle, applianceMat } = mats;
  const g = new THREE.Group();
  const S = fixedMats();

  if (type === 'cuisiniere') {
    g.add(buildRange(w, applianceMat));
    return g;
  }

  g.add(box(w, PLINTH, BASE_D - 0.07, S.shadeBlack, w / 2, PLINTH / 2, (BASE_D - 0.07) / 2));

  if (type === 'ouvert') {
    const t = 0.018;
    g.add(box(t, CARCASS_H, BASE_D - 0.02, finish, t / 2, PLINTH + CARCASS_H / 2, BASE_D / 2));
    g.add(box(t, CARCASS_H, BASE_D - 0.02, finish, w - t / 2, PLINTH + CARCASS_H / 2, BASE_D / 2));
    g.add(box(w, t, BASE_D - 0.02, finish, w / 2, PLINTH + t / 2, BASE_D / 2));
    g.add(box(w, t, BASE_D - 0.02, finish, w / 2, PLINTH + CARCASS_H - t / 2, BASE_D / 2));
    g.add(box(w - t * 2, t, BASE_D - 0.05, S.interior, w / 2, PLINTH + CARCASS_H * 0.52, BASE_D / 2));
    g.add(box(w - t * 2, CARCASS_H - t * 2, 0.012, S.interior, w / 2, PLINTH + CARCASS_H / 2, 0.03));
    for (let i = 0; i < 3; i++) g.add(cyl(0.055 - i * 0.004, 0.022, S.ceramic, w / 2, PLINTH + CARCASS_H * 0.52 + 0.02 + i * 0.022, BASE_D / 2));
    manifest.add('base-ouvert');
    return g;
  }

  g.add(box(w - 0.004, CARCASS_H, BASE_D - DOOR_T, finish, w / 2, PLINTH + CARCASS_H / 2, (BASE_D - DOOR_T) / 2));

  const frontY0 = PLINTH + 0.005, frontH = CARCASS_H - 0.01;
  const zF = BASE_D - DOOR_T / 2;

  if (type === 'lavevaisselle') {
    const f = box(w - 0.008, frontH, 0.02, applianceMat, w / 2, frontY0 + frontH / 2, zF);
    g.add(f);
    g.add(box(w - 0.02, 0.05, 0.022, S.darkMetal, w / 2, frontY0 + frontH - 0.04, zF + 0.002));
    const h = makeHandle('barre-noire', S.darkMetal, false, w * 0.7);
    if (h) { h.position.set(w / 2, frontY0 + frontH - 0.1, zF + 0.005); g.add(h); }
    manifest.add('panneau-lv');
    return g;
  }

  if (type === 'filler') {
    g.add(box(w - 0.002, frontH, DOOR_T, finish, w / 2, frontY0 + frontH / 2, zF));
    manifest.addSku(fillerSku(widthIn ?? w / IN), 'Filler de finition (bas)');
    return g;
  }

  if (type === 'tiroirs') {
    const hs = [0.30, 0.30, 0.40];
    let y = frontY0 + frontH;
    hs.forEach((frac) => {
      const dh = frontH * frac - GAP;
      y -= frontH * frac;
      const f = makeFront(w - GAP * 2, dh, finish, doorStyle);
      f.position.set(w / 2, y + (frontH * frac) / 2, zF);
      g.add(f);
      const h = makeHandle(handleKind, handleMat, false, Math.min(0.3, w * 0.45));
      if (h) { h.position.set(w / 2, y + (frontH * frac) / 2 + dh * 0.32, zF + DOOR_T / 2); g.add(h); }
      manifest.handles++;
    });
    const s = widthIn != null ? findSku('baseDrawer', widthIn) : null;
    if (!manifest.addSku(s, `Caisson à tiroirs ${s?.widthIn} po`)) manifest.add('base-tiroirs');
    return g;
  }

  const two = w > 0.58;
  const dw = two ? (w - GAP * 3) / 2 : w - GAP * 2;
  const xs = two ? [GAP + dw / 2, GAP * 2 + dw * 1.5] : [w / 2];
  xs.forEach((x, i) => {
    const f = makeFront(dw, frontH - GAP, finish, doorStyle);
    f.position.set(x, frontY0 + frontH / 2, zF);
    g.add(f);
    const h = makeHandle(handleKind, handleMat, true, 0.17);
    if (h) {
      const side = two ? (i === 0 ? 1 : -1) : 1;
      h.position.set(x + side * (dw / 2 - 0.045), frontY0 + frontH - 0.16, zF + DOOR_T / 2);
      g.add(h);
    }
    manifest.handles++;
  });
  if (type === 'evier') {
    manifest.add('base-evier');
  } else {
    const s = widthIn != null ? findSku('baseStandard', widthIn) : null;
    if (!manifest.addSku(s, `Caisson bas ${s?.widthIn} po`)) manifest.add('base-portes');
  }
  return g;
}

// ——— cuisinière encastrée ———
function buildRange(w, steel) {
  const S = fixedMats();
  const g = new THREE.Group();
  const bodyH = COUNTER_TOP - 0.02;
  g.add(box(w - 0.01, bodyH, BASE_D - 0.02, steel, w / 2, bodyH / 2 + 0.01, (BASE_D - 0.02) / 2 + 0.01));
  g.add(box(w - 0.05, 0.5, 0.02, steel, w / 2, 0.42, BASE_D - 0.005));
  g.add(box(w - 0.14, 0.3, 0.022, S.blackGlass, w / 2, 0.42, BASE_D));
  const bar = cyl(0.011, w - 0.12, S.darkMetal, w / 2, 0.71, BASE_D + 0.04);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  g.add(box(w - 0.05, 0.07, 0.02, S.blackGlass, w / 2, 0.8, BASE_D - 0.002));
  for (let i = 0; i < 5; i++) {
    const k = cyl(0.014, 0.02, S.darkMetal, w / 2 - 0.22 + i * 0.11, 0.8, BASE_D + 0.008);
    k.rotation.x = Math.PI / 2;
    g.add(k);
  }
  g.add(box(w - 0.02, 0.015, BASE_D - 0.04, S.blackGlass, w / 2, COUNTER_TOP - 0.008, BASE_D / 2));
  const pos = [[-0.18, 0.14], [0.18, 0.14], [-0.18, 0.42], [0.18, 0.42]];
  pos.forEach(([dx, dz]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.006, 10, 32), S.darkMetal);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(w / 2 + dx, COUNTER_TOP + 0.002, dz + 0.04);
    ring.castShadow = true;
    g.add(ring);
    for (let aa = 0; aa < 4; aa++) {
      const spoke = box(0.13, 0.006, 0.012, S.darkMetal, w / 2 + dx, COUNTER_TOP + 0.004, dz + 0.04);
      spoke.rotation.y = (aa * Math.PI) / 4;
      g.add(spoke);
    }
  });
  return g;
}

// ——— réfrigérateur ———
function buildFridge(steel) {
  const S = fixedMats();
  const g = new THREE.Group();
  // corps légèrement plus étroit que la niche : les panneaux de finition (REQ-101)
  // occupent 2,5 cm de chaque côté
  const W = FRIDGE_W - 0.07, H = 1.82, D = 0.68;
  g.add(box(W, H, D, steel, FRIDGE_W / 2, H / 2 + 0.02, D / 2 + 0.01));
  g.add(box(W, 0.02, D, S.shadeBlack, FRIDGE_W / 2, 0.01, D / 2 + 0.01));
  g.add(box(W + 0.002, 0.012, 0.012, S.shadeBlack, FRIDGE_W / 2, 0.02 + H * 0.42, D + 0.012));
  g.add(box(0.01, H * 0.58 - 0.02, 0.012, S.shadeBlack, FRIDGE_W / 2, 0.02 + H * 0.42 + H * 0.29, D + 0.012));
  for (const s of [-1, 1]) {
    g.add(cyl(0.011, H * 0.4, S.darkMetal, FRIDGE_W / 2 + s * 0.06, 0.02 + H * 0.68, D + 0.05));
  }
  const fh = cyl(0.011, W * 0.5, S.darkMetal, FRIDGE_W / 2, 0.02 + H * 0.3, D + 0.05);
  fh.rotation.z = Math.PI / 2;
  g.add(fh);
  return g;
}

// ——— garde-manger ———
function buildPantry(mats, manifest) {
  const { finish, handleKind, handleMat, doorStyle } = mats;
  const g = new THREE.Group();
  const S = fixedMats();
  const W = PANTRY_W, D = PANTRY_D;
  g.add(box(W, PLINTH, D - 0.07, S.shadeBlack, W / 2, PLINTH / 2, (D - 0.07) / 2));
  g.add(box(W - 0.004, TALL_H - PLINTH, D - DOOR_T, finish, W / 2, PLINTH + (TALL_H - PLINTH) / 2, (D - DOOR_T) / 2));
  const zF = D - DOOR_T / 2;
  const h1 = (TALL_H - PLINTH) * 0.62, h2 = (TALL_H - PLINTH) * 0.38 - GAP * 2;
  const f1 = makeFront(W - GAP * 2, h1, finish, doorStyle);
  f1.position.set(W / 2, PLINTH + h1 / 2, zF);
  const f2 = makeFront(W - GAP * 2, h2, finish, doorStyle);
  f2.position.set(W / 2, PLINTH + h1 + GAP + h2 / 2, zF);
  g.add(f1, f2);
  const hh = makeHandle(handleKind, handleMat, true, 0.24);
  if (hh) { hh.position.set(W - 0.06, PLINTH + h1 - 0.18, zF + DOOR_T / 2); g.add(hh); }
  const hh2 = makeHandle(handleKind, handleMat, true, 0.17);
  if (hh2) { hh2.position.set(W - 0.06, PLINTH + h1 + 0.12, zF + DOOR_T / 2); g.add(hh2); }
  manifest.handles += 2;
  const s = findSku('pantry', Math.round(W / IN));
  if (!manifest.addSku(s, `Garde-manger ${s?.widthIn} po`)) manifest.add('garde-manger');
  return g;
}

// ——— armoire murale ———
function buildWallCab(w, mats, manifest, widthIn = null) {
  const { finish, handleKind, handleMat, doorStyle } = mats;
  const g = new THREE.Group();
  g.add(box(w - 0.004, WALL_CAB_H, WALL_CAB_D - DOOR_T, finish, w / 2, WALL_CAB_H / 2, (WALL_CAB_D - DOOR_T) / 2));
  const zF = WALL_CAB_D - DOOR_T / 2;
  const two = w > 0.58;
  const dw = two ? (w - GAP * 3) / 2 : w - GAP * 2;
  const xs = two ? [GAP + dw / 2, GAP * 2 + dw * 1.5] : [w / 2];
  xs.forEach((x, i) => {
    const f = makeFront(dw, WALL_CAB_H - GAP * 2, finish, doorStyle);
    f.position.set(x, WALL_CAB_H / 2, zF);
    g.add(f);
    const h = makeHandle(handleKind, handleMat, true, 0.14);
    if (h) {
      const side = two ? (i === 0 ? 1 : -1) : 1;
      h.position.set(x + side * (dw / 2 - 0.04), 0.13, zF + DOOR_T / 2);
      g.add(h);
    }
    manifest.handles++;
  });
  const S = fixedMats();
  const strip = box(w - 0.06, 0.008, 0.02, S.glow, w / 2, -0.006, WALL_CAB_D - 0.08);
  strip.castShadow = false;
  g.add(strip);
  const s = widthIn != null ? findSku('wall', widthIn) : null;
  if (!manifest.addSku(s, `Armoire murale ${s?.widthIn} po`)) manifest.add('mur');
  return g;
}

// ——— hotte (centrée sur x=0) ———
function buildHood(steel) {
  const g = new THREE.Group();
  const W = 0.9;
  g.add(box(W, 0.07, 0.5, steel, 0, WALL_BOT + 0.035, 0.27));
  g.add(box(W * 0.62, 0.22, 0.34, steel, 0, WALL_BOT + 0.07 + 0.11, 0.2));
  g.add(box(0.32, ROOM_H - (WALL_BOT + 0.29), 0.32, steel, 0, (WALL_BOT + 0.29 + ROOM_H) / 2, 0.17));
  const S = fixedMats();
  const lamp = box(W * 0.8, 0.006, 0.3, S.glow, 0, WALL_BOT + 0.002, 0.28);
  lamp.castShadow = false;
  g.add(lamp);
  return g;
}

// ——— évier + robinet, centré sur x=0, mur en z=0 ———
function buildSink() {
  const S = fixedMats();
  const g = new THREE.Group();
  const cx = 0, cz = 0.32;
  const W = 0.56, D = 0.44, depth = 0.17, t = 0.012;
  const y0 = COUNTER_TOP;
  g.add(box(W + 0.05, 0.008, t, S.sinkSteel, cx, y0 + 0.004, cz - D / 2 - t / 2));
  g.add(box(W + 0.05, 0.008, t, S.sinkSteel, cx, y0 + 0.004, cz + D / 2 + t / 2));
  g.add(box(t, 0.008, D + 0.026, S.sinkSteel, cx - W / 2 - t / 2, y0 + 0.004, cz));
  g.add(box(t, 0.008, D + 0.026, S.sinkSteel, cx + W / 2 + t / 2, y0 + 0.004, cz));
  const wall = (w, h, d, x, y, z) => box(w, h, d, S.sinkSteel, x, y, z);
  g.add(wall(W, depth, t, cx, y0 - depth / 2, cz - D / 2 + t / 2));
  g.add(wall(W, depth, t, cx, y0 - depth / 2, cz + D / 2 - t / 2));
  g.add(wall(t, depth, D, cx - W / 2 + t / 2, y0 - depth / 2, cz));
  g.add(wall(t, depth, D, cx + W / 2 - t / 2, y0 - depth / 2, cz));
  g.add(wall(W, t, D, cx, y0 - depth + t / 2, cz));
  g.add(cyl(0.024, 0.006, S.darkMetal, cx, y0 - depth + t + 0.003, cz));
  const fx = cx, fz = cz - D / 2 - 0.07;
  g.add(cyl(0.022, 0.012, S.brassTrim, fx, y0 + 0.006, fz));
  g.add(cyl(0.013, 0.3, S.brassTrim, fx, y0 + 0.16, fz));
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 12, 28, Math.PI), S.brassTrim);
  arc.position.set(fx, y0 + 0.31, fz + 0.085);
  arc.rotation.y = Math.PI / 2;
  arc.castShadow = true;
  g.add(arc);
  g.add(cyl(0.011, 0.07, S.brassTrim, fx, y0 + 0.28, fz + 0.17));
  const lever = cyl(0.008, 0.09, S.brassTrim, fx + 0.05, y0 + 0.07, fz);
  lever.rotation.z = -0.7;
  g.add(lever);
  return g;
}

// ——— fenêtre centrée sur x=0, posée sur le mur z=0, face +z ———
function buildWindow(winW) {
  const S = fixedMats();
  const wg = new THREE.Group();
  const fr = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.5 });
  const y0 = WALL_BOT + 0.02, y1 = WALL_BOT + WALL_CAB_H - 0.05;
  const t = 0.05, d = 0.07;
  wg.add(box(winW + t * 2, t, d, fr, 0, y1 + t / 2, 0.02));
  wg.add(box(winW + t * 2, t, d, fr, 0, y0 - t / 2, 0.02));
  wg.add(box(t, y1 - y0, d, fr, -winW / 2 - t / 2, (y0 + y1) / 2, 0.02));
  wg.add(box(t, y1 - y0, d, fr, winW / 2 + t / 2, (y0 + y1) / 2, 0.02));
  wg.add(box(0.03, y1 - y0, 0.03, fr, 0, (y0 + y1) / 2, 0.02));
  wg.add(box(winW + t * 3, 0.035, 0.12, fr, 0, y0 - t - 0.018, 0.05));
  const sky = box(winW, y1 - y0, 0.012, S.skyGlow, 0, (y0 + y1) / 2, 0.007);
  sky.castShadow = false;
  wg.add(sky);
  return wg;
}

// ——— porte intérieure centrée sur x=0, mur z=0, face +z ———
function buildDoorway(doorW) {
  const S = fixedMats();
  const g = new THREE.Group();
  const fr = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.5 });
  const H = 2.04, t = 0.07, d = 0.1;
  // cadre
  g.add(box(t, H, d, fr, -doorW / 2 - t / 2, H / 2, 0.02));
  g.add(box(t, H, d, fr, doorW / 2 + t / 2, H / 2, 0.02));
  g.add(box(doorW + t * 2, t, d, fr, 0, H + t / 2, 0.02));
  // battant blanc à 2 panneaux moulurés
  const leaf = new THREE.Group();
  leaf.add(box(doorW - 0.012, H - 0.02, 0.042, S.doorWhite, 0, H / 2, 0.018));
  for (const [py, ph] of [[H * 0.68, H * 0.5], [H * 0.22, H * 0.28]]) {
    leaf.add(box(doorW - 0.22, ph, 0.012, S.doorWhite, 0, py, 0.044));
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), S.brassTrim);
  knob.position.set(doorW / 2 - 0.08, 0.98, 0.062);
  knob.castShadow = true;
  leaf.add(knob);
  g.add(leaf);
  return g;
}

// ——— déco ———
function decor(S) {
  return {
    plant(x, y, z, s = 1) {
      const g = new THREE.Group();
      g.add(cyl(0.075 * s, 0.12 * s, S.potClay, 0, 0.06 * s, 0));
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 * s, 0), i % 2 ? S.plantGreen : S.plantGreen2);
        const a = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.05 * s, 0.17 * s + (i % 3) * 0.045 * s, Math.sin(a) * 0.05 * s);
        leaf.scale.y = 1.5;
        leaf.castShadow = true;
        g.add(leaf);
      }
      g.position.set(x, y, z);
      return g;
    },
    bowl(x, y, z) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), S.ceramic);
      b.scale.y = 0.85;
      b.position.y = 0.115;
      b.castShadow = true; b.receiveShadow = true;
      g.add(b);
      const fr = [[0, 0.075, 0], [0.06, 0.06, 0.03], [-0.055, 0.06, 0.02], [0.01, 0.06, -0.055], [-0.02, 0.115, -0.01]];
      fr.forEach(([fx, fy, fz]) => {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), S.fruit);
        f.position.set(fx, fy, fz);
        f.castShadow = true;
        g.add(f);
      });
      g.position.set(x, y, z);
      return g;
    },
    board(x, y, z, rot = 0.3) {
      const g = new THREE.Group();
      g.add(box(0.34, 0.018, 0.22, S.boardWood, 0, 0.009, 0));
      g.add(cyl(0.025, 0.02, S.boardWood, 0.14, 0.009, 0));
      g.position.set(x, y, z);
      g.rotation.y = rot;
      return g;
    },
    stool(x, z, s = 1) {
      const g = new THREE.Group();
      g.add(cyl(0.17 * s, 0.045, S.boardWood, 0, 0.62, 0, 28));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = cyl(0.014, 0.62, S.shadeBlack, Math.cos(a) * 0.13, 0.3, Math.sin(a) * 0.13);
        leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
        g.add(leg);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 8, 24), S.shadeBlack);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.2;
      ring.castShadow = true;
      g.add(ring);
      g.position.set(x, 0, z);
      return g;
    },
    pendant(x, y, z) {
      const g = new THREE.Group();
      g.add(cyl(0.004, ROOM_H - y - 0.12, S.shadeBlack, 0, (ROOM_H - y) / 2 + 0.06, 0));
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.13, 0.16, 24, 1, true), S.shadeBlack);
      shade.castShadow = true;
      shade.position.y = 0.06;
      g.add(shade);
      const inShade = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.125, 0.15, 24, 1, true), S.brassTrim);
      inShade.position.y = 0.06;
      g.add(inShade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), S.glow);
      bulb.position.y = -0.01;
      g.add(bulb);
      const light = new THREE.PointLight('#ffd9a3', 4.5, 4.5, 2);
      light.position.y = -0.05;
      g.add(light);
      g.position.set(x, y, z);
      return g;
    },
  };
}

function splitWidths(len) {
  if (len < 0.16) return [];
  const n = Math.max(1, Math.round(len / 0.6));
  return Array(n).fill(len / n);
}

// REQ-701 : largeurs modulaires catalogue. Un espace se remplit avec des caissons
// aux largeurs réelles (multiples de 3 po, 9–36 po) ; le reste (< 3 po) devient
// un filler catalogue (1½ / 3 / 6 po). Retourne [{ w (m), widthIn, filler }].
function catalogWidths(len) {
  const T = len / IN; // pouces disponibles
  if (T < 1) return [];
  if (T < 9) return [{ w: len, widthIn: T, filler: true }];
  const S = Math.floor(T / 3) * 3; // somme des caissons, multiple de 3 po
  let n = Math.max(1, Math.round(S / 30)); // cible ~30 po par caisson
  while (S / n > 36) n++;
  while (n > 1 && S / n < 9) n--;
  const base3 = Math.floor(S / (3 * n));
  const extra = S / 3 - base3 * n; // caissons recevant +3 po
  const out = [];
  for (let i = 0; i < n; i++) {
    const wi = (base3 + (i < extra ? 1 : 0)) * 3;
    out.push({ w: wi * IN, widthIn: wi, filler: false });
  }
  const rest = T - S;
  if (rest * IN >= 0.012) out.push({ w: rest * IN, widthIn: rest, filler: true });
  return out;
}

// retranche [c0,c1] d'une liste d'intervalles
function cut(intervals, c0, c1) {
  return intervals.flatMap(([s0, s1]) =>
    (c1 <= s0 || c0 >= s1 ? [[s0, s1]] : [[s0, Math.max(s0, c0)], [Math.min(s1, c1), s1]])
  ).filter(([s0, s1]) => s1 - s0 > 0.001);
}

class Manifest {
  constructor() {
    this.modules = {};
    this.skuItems = {}; // REQ-705 : lignes de devis par SKU réel du catalogue
    this.handles = 0;
    this.counterArea = 0;
    this.backsplashArea = 0;
    this.floorArea = 0;
    this.appliances = { fridge: false, range: false, hood: false, dw: false };
    this.islandModules = 0;
  }
  add(key, n = 1) { this.modules[key] = (this.modules[key] || 0) + n; }
  // retourne true si l'entrée catalogue existe (sinon l'appelant retombe sur add())
  addSku(entry, label, { finishMult = true } = {}) {
    if (!entry || !entry.sku) return false;
    const it = (this.skuItems[entry.sku] ||= { sku: entry.sku, label, unit: entry.price, qty: 0, finishMult });
    it.qty++;
    return true;
  }
}

// ————————————————————————— CONSTRUCTION PRINCIPALE —————————————————————————
export function buildKitchen(state) {
  ROOM_H = CEILINGS[state.ceiling] || CEILINGS[9];
  const S = fixedMats();
  const manifest = new Manifest();
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);

  const a = state.dims.a;
  const b = state.layout !== 'lineaire' ? state.dims.b : 0;
  const c = state.layout === 'u' ? state.dims.c : 0;
  const roomD = Math.max(3.5, state.island ? 4.15 : 3.5, b + 0.7, c + 0.7);

  const finish = CABINET_FINISHES[state.cabinetFinish].make();
  const islandFinish = CABINET_FINISHES[state.islandFinish || state.cabinetFinish].make();
  const counterMat = COUNTERS[state.counter].make();
  const bs = BACKSPLASHES[state.backsplash];
  const backsplashMat = bs.make ? bs.make() : counterMat;
  const floorMat = FLOORS[state.floor].make();
  const wallMat = WALLS[state.wall].make();
  const handleMat = HANDLES[state.handle].make();
  const applianceMat = APPLIANCE_FINISHES[state.applianceFinish].make();
  const mats = { finish, handleKind: state.handle, handleMat, doorStyle: state.doorStyle, applianceMat };
  const islandMats = { ...mats, finish: islandFinish };

  // ——— murs porteurs de caissons selon la forme ———
  const cabWalls = state.layout === 'u' ? ['back', 'left', 'right'] : state.layout === 'l' ? ['back', 'left'] : ['back'];
  const leftX = state.layout !== 'lineaire' ? -0.06 : -0.66;
  const rightX = state.layout === 'u' ? a + 0.06 : a + 0.66;
  // plan de chaque mur (face intérieure) + longueur utile pour les ouvertures
  const wallPlane = { back: { type: 'z', at: 0 }, left: { type: 'x', at: leftX + 0.06 }, right: { type: 'x', at: rightX - 0.06 } };
  const wallLen = { back: a, left: cabWalls.includes('left') ? b : roomD, right: cabWalls.includes('right') ? c : roomD };

  // transforme (mur, position le long, profondeur depuis le mur) -> coords pièce
  function rectFor(wallKey, al0, al1, d0, d1) {
    const w = al1 - al0, dd = d1 - d0;
    if (wallKey === 'back') return { x: (al0 + al1) / 2, z: (d0 + d1) / 2, sx: w, sz: dd };
    const px = wallPlane[wallKey].at;
    if (wallKey === 'left') return { x: px + (d0 + d1) / 2, z: (al0 + al1) / 2, sx: dd, sz: w };
    return { x: px - (d0 + d1) / 2, z: (al0 + al1) / 2, sx: dd, sz: w };
  }
  function addBoxRect(wallKey, al0, al1, d0, d1, y0, y1, mat) {
    if (al1 - al0 < 0.012) return null;
    const r = rectFor(wallKey, al0, al1, d0, d1);
    const m = box(r.sx, y1 - y0, r.sz, mat, r.x, (y0 + y1) / 2, r.z);
    inner.add(m);
    return m;
  }
  // placement d'un module (origine = bord proche du coin arrière)
  function modulePlacement(wallKey, along0, w, y = 0) {
    if (wallKey === 'back') return { pos: new THREE.Vector3(along0, y, 0), rotY: 0 };
    if (wallKey === 'left') return { pos: new THREE.Vector3(wallPlane.left.at, y, along0 + w), rotY: Math.PI / 2 };
    return { pos: new THREE.Vector3(wallPlane.right.at, y, along0), rotY: -Math.PI / 2 };
  }
  // placement d'un élément symétrique centré (fenêtre, porte, hotte, évier)
  function centeredPlacement(wallKey, along, y = 0) {
    if (wallKey === 'back') return { pos: new THREE.Vector3(along, y, 0), rotY: 0 };
    if (wallKey === 'left') return { pos: new THREE.Vector3(wallPlane.left.at, y, along), rotY: Math.PI / 2 };
    return { pos: new THREE.Vector3(wallPlane.right.at, y, along), rotY: -Math.PI / 2 };
  }
  function pointFor(wallKey, along, d, y = 0) {
    const r = rectFor(wallKey, along, along, d, d);
    return new THREE.Vector3(r.x, y, r.z);
  }

  // ——— pièce : les murs butent aux coins, le plancher suit l'enceinte ———
  const exL = leftX - 0.06, exR = rightX + 0.06; // faces extérieures des murs latéraux
  const floorZ0 = -0.12, floorZ1 = roomD + 0.25;  // sous le mur arrière → léger tablier avant
  const floor = box(exR - exL, 0.06, floorZ1 - floorZ0, floorMat, (exL + exR) / 2, -0.03, (floorZ0 + floorZ1) / 2);
  floor.receiveShadow = true;
  floor.castShadow = false;
  inner.add(floor);
  const walls = [];
  const wallGroups = { back: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() };
  const backWall = box(exR - exL, ROOM_H, 0.12, wallMat, (exL + exR) / 2, ROOM_H / 2, -0.06);
  const lWall = box(0.12, ROOM_H, roomD + 0.12, wallMat, leftX, ROOM_H / 2, (roomD - 0.12) / 2);
  const rWall = box(0.12, ROOM_H, roomD + 0.12, wallMat, rightX, ROOM_H / 2, (roomD - 0.12) / 2);
  backWall.castShadow = false; lWall.castShadow = false; rWall.castShadow = false;
  wallGroups.back.add(backWall);
  wallGroups.left.add(lWall);
  wallGroups.right.add(rWall);
  inner.add(wallGroups.back, wallGroups.left, wallGroups.right);
  walls.push({ group: wallGroups.back, point: new THREE.Vector3(0, 1, -roomD / 2), normal: new THREE.Vector3(0, 0, 1) });
  walls.push({ group: wallGroups.left, point: new THREE.Vector3(leftX - a / 2, 1, 0), normal: new THREE.Vector3(1, 0, 0) });
  walls.push({ group: wallGroups.right, point: new THREE.Vector3(rightX - a / 2, 1, 0), normal: new THREE.Vector3(-1, 0, 0) });
  // plinthe du mur arrière (entre les faces intérieures des murs latéraux)
  const skirt = new THREE.MeshStandardMaterial({ color: '#efebe2', roughness: 0.7 });
  wallGroups.back.add(box(rightX - leftX - 0.12, 0.09, 0.016, skirt, (leftX + rightX) / 2, 0.045, 0.008));

  manifest.floorArea = a * roomD;

  // ——— contraintes : ouvertures par mur ———
  const openings = (state.constraints && state.constraints.openings) || [];
  const doorsByWall = { back: [], left: [], right: [] };
  const winsByWall = { back: [], left: [], right: [] };
  for (const o of openings) {
    if (!wallPlane[o.wall]) continue;
    const maxAl = wallLen[o.wall];
    const pos = Math.min(Math.max(o.pos, o.width / 2 + 0.05), Math.max(o.width / 2 + 0.05, maxAl - o.width / 2 - 0.05));
    const entry = { ...o, pos };
    (o.type === 'porte' ? doorsByWall : winsByWall)[o.wall].push(entry);
  }

  // dessine fenêtres et portes (accrochées au groupe de leur mur pour le masquage)
  for (const wallKey of ['back', 'left', 'right']) {
    for (const win of winsByWall[wallKey]) {
      const wg = buildWindow(win.width);
      const p = centeredPlacement(wallKey, win.pos);
      wg.position.copy(p.pos);
      wg.rotation.y = p.rotY;
      wallGroups[wallKey].add(wg);
    }
    for (const door of doorsByWall[wallKey]) {
      const dg = buildDoorway(door.width);
      const p = centeredPlacement(wallKey, door.pos);
      dg.position.copy(p.pos);
      dg.rotation.y = p.rotY;
      wallGroups[wallKey].add(dg);
    }
  }

  // ——— segments libres pour les caissons (coins et portes retranchés) ———
  const hasCornerL = state.layout !== 'lineaire';
  const hasCornerR = state.layout === 'u';
  function cabSegments(wallKey) {
    let lo, hi;
    if (wallKey === 'back') {
      lo = hasCornerL ? CORNER : 0.02;
      hi = hasCornerR ? a - CORNER : a - 0.02;
    } else {
      lo = CORNER;
      hi = wallLen[wallKey] - 0.02;
    }
    let segs = [[lo, hi]];
    for (const door of doorsByWall[wallKey]) {
      segs = cut(segs, door.pos - door.width / 2 - 0.07, door.pos + door.width / 2 + 0.07);
    }
    return segs.filter(([s0, s1]) => s1 - s0 >= 0.34);
  }
  const segsByWall = {};
  for (const wk of cabWalls) segsByWall[wk] = cabSegments(wk);

  // segments « pleine hauteur » : les fenêtres y sont aussi retranchées —
  // un frigo ou un garde-manger ne doit jamais recouvrir une fenêtre
  const tallSegsByWall = {};
  for (const wk of cabWalls) {
    let ts = [...(segsByWall[wk] || [])];
    for (const win of winsByWall[wk]) ts = cut(ts, win.pos - win.width / 2 - 0.05, win.pos + win.width / 2 + 0.05);
    tallSegsByWall[wk] = ts.filter(([s0, s1]) => s1 - s0 >= 0.6);
  }

  function largestSeg(wallKey) {
    const segs = segsByWall[wallKey] || [];
    return segs.reduce((best, s) => (!best || s[1] - s[0] > best[1] - best[0] ? s : best), null);
  }

  // ——— résolution des positions imposées (eau, cuisinière, frigo) ———
  const cons = state.constraints || {};
  let sinkWall, sinkAlong;
  let sinkIsAuto = true;
  if (cons.water && !cons.water.auto && cabWalls.includes(cons.water.wall) && largestSeg(cons.water.wall)) {
    sinkWall = cons.water.wall;
    sinkAlong = cons.water.pos;
    sinkIsAuto = false;
  } else {
    // auto : sous la première fenêtre d'un mur à caissons, sinon centre du plus grand segment
    const win = openings.find((o) => o.type === 'fenetre' && cabWalls.includes(o.wall) && largestSeg(o.wall));
    if (win) { sinkWall = win.wall; sinkAlong = win.pos; }
    else {
      sinkWall = cabWalls.find((w) => largestSeg(w)) || 'back';
      const seg = largestSeg(sinkWall);
      sinkAlong = seg ? (seg[0] + seg[1]) / 2 : a / 2;
    }
  }
  let stoveWall, stoveAlong;
  let stoveIsAuto = true;
  if (cons.stove && !cons.stove.auto && cabWalls.includes(cons.stove.wall) && largestSeg(cons.stove.wall)) {
    stoveWall = cons.stove.wall;
    stoveAlong = cons.stove.pos;
    stoveIsAuto = false;
  } else {
    stoveWall = sinkWall;
    const seg = largestSeg(stoveWall);
    if (seg) {
      // dans le plus grand segment, du côté opposé à l'évier
      const mid = (seg[0] + seg[1]) / 2;
      stoveAlong = sinkAlong <= mid ? seg[1] - RANGE_W / 2 - 0.35 : seg[0] + RANGE_W / 2 + 0.35;
    } else stoveAlong = a * 0.75;
  }
  // frigo + garde-manger : extrémité du dernier mur disposant d'un segment pleine hauteur
  const fridgeWall = [...cabWalls].reverse().find((w) => (tallSegsByWall[w] || []).some(([s0, s1]) => s1 - s0 >= FRIDGE_W))
    || [...cabWalls].reverse().find((w) => largestSeg(w)) || 'back';

  // ——— items fixes par mur, puis résolution segment par segment ———
  const fixedByWall = { back: [], left: [], right: [] };
  function addFixed(wallKey, type, w, want, prio, tall = false) {
    fixedByWall[wallKey].push({ type, w, want, prio, tall });
  }
  addFixed(sinkWall, 'evier', SINK_W, sinkAlong, 1);
  if (state.appliances.dw) addFixed(sinkWall, 'lavevaisselle', DW_W, sinkAlong + SINK_W / 2 + DW_W / 2 + 0.01, 4);
  if (state.appliances.range) addFixed(stoveWall, 'cuisiniere', RANGE_W, stoveAlong, 2);
  if (state.appliances.fridge) {
    const endSeg = (tallSegsByWall[fridgeWall] || []).slice(-1)[0] || (segsByWall[fridgeWall] || []).slice(-1)[0];
    if (endSeg) {
      addFixed(fridgeWall, 'frigo', FRIDGE_W, endSeg[1] - FRIDGE_W / 2, 3, true);
      addFixed(fridgeWall, 'garde-manger', PANTRY_W, endSeg[1] - FRIDGE_W - PANTRY_W / 2, 5, true);
    }
  }

  // les colonnes qui ne trouvent aucun segment pleine hauteur sur leur mur
  // déménagent vers le mur qui en offre un (sinon elles recouvriraient une fenêtre)
  for (const wk of cabWalls) {
    for (const item of [...fixedByWall[wk]]) {
      if (!item.tall) continue;
      if ((tallSegsByWall[wk] || []).some(([t0, t1]) => t1 - t0 >= item.w)) continue;
      const target = cabWalls
        .filter((w2) => w2 !== wk)
        .map((w2) => ({
          w2,
          seg: (tallSegsByWall[w2] || []).reduce((b, s) => (!b || s[1] - s[0] > b[1] - b[0] ? s : b), null),
        }))
        .filter((t) => t.seg && t.seg[1] - t.seg[0] >= item.w)
        .sort((p, q) => (q.seg[1] - q.seg[0]) - (p.seg[1] - p.seg[0]))[0];
      if (target) {
        fixedByWall[wk].splice(fixedByWall[wk].indexOf(item), 1);
        item.want = target.seg[1] - item.w / 2;
        fixedByWall[target.w2].push(item);
      }
    }
  }

  // ——— rééquilibrage : si un mur est surchargé, les items les moins prioritaires
  // déménagent vers le mur qui a le plus d'espace libre (au lieu de disparaître)
  (function rebalance() {
    const capacity = {};
    for (const wk of cabWalls) capacity[wk] = (segsByWall[wk] || []).reduce((s, [s0, s1]) => s + (s1 - s0), 0);
    const demand = (wk) => fixedByWall[wk].reduce((s, it) => s + it.w, 0);
    let guard = 0;
    let moved = true;
    while (moved && guard++ < 12) {
      moved = false;
      for (const wk of cabWalls) {
        while (demand(wk) > capacity[wk] && fixedByWall[wk].length) {
          const items = fixedByWall[wk];
          const worst = items.reduce((m, it) => (it.prio > m.prio ? it : m), items[0]);
          items.splice(items.indexOf(worst), 1);
          const target = cabWalls
            .filter((w2) => w2 !== wk)
            .map((w2) => ({ w2, free: capacity[w2] - demand(w2) }))
            .sort((p, q) => q.free - p.free)[0];
          if (target && target.free >= worst.w) {
            const seg = largestSeg(target.w2);
            worst.want = seg ? seg[1] - worst.w / 2 : 0.5;
            fixedByWall[target.w2].push(worst);
            moved = true;
          }
          // sinon : aucun mur ne peut l'accueillir, l'item est réellement retiré
        }
      }
    }
  })();

  const editables = [];
  const placed = { evier: null, cuisiniere: null, frigo: null };
  const moduleCounters = {};
  const placedIntervals = { back: [], left: [], right: [] }; // REQ-803 : filet AABB
  let plinthLin = 0; // REQ-714 : linéaire de plinthe (toe-kick)

  function layWall(wallKey) {
    const segs = segsByWall[wallKey] || [];
    if (!segs.length) return;
    const items = [...fixedByWall[wallKey]].sort((p, q) => p.want - q.want);
    // REQ-108 (NKBA 20) : la cuisinière auto fuit les fenêtres (sécurité incendie)
    for (const it of items) {
      if (it.type !== 'cuisiniere' || !stoveIsAuto) continue;
      for (const win of winsByWall[wallKey] || []) {
        const lo = win.pos - win.width / 2, hi = win.pos + win.width / 2;
        if (it.want + it.w / 2 > lo && it.want - it.w / 2 < hi) {
          const left = lo - it.w / 2 - 0.05, right = hi + it.w / 2 + 0.05;
          it.want = Math.abs(left - it.want) < Math.abs(right - it.want) ? left : right;
        }
      }
    }
    // REQ-209 (NKBA 12) : zone interdite aux colonnes entre l'évier et la cuisinière
    const sinkF = items.find((i) => i.type === 'evier');
    const rangeF = items.find((i) => i.type === 'cuisiniere');
    const tiLo = sinkF && rangeF ? Math.min(sinkF.want, rangeF.want) : null;
    const tiHi = sinkF && rangeF ? Math.max(sinkF.want, rangeF.want) : null;
    // les colonnes se recalent dans le sous-segment pleine hauteur le plus proche,
    // hors de la zone évier–cuisinière
    for (const item of items) {
      if (!item.tall) continue;
      let best = null, bestD = Infinity;
      for (const [t0, t1] of tallSegsByWall[wallKey] || []) {
        if (t1 - t0 < item.w) continue;
        let c = Math.min(Math.max(item.want, t0 + item.w / 2), t1 - item.w / 2);
        if (tiLo != null && c > tiLo && c < tiHi) {
          // candidat entre les deux centres de travail : tenter les bords du sous-segment
          const cands = [
            Math.min(Math.max(tiLo - item.w / 2, t0 + item.w / 2), t1 - item.w / 2),
            Math.min(Math.max(tiHi + item.w / 2, t0 + item.w / 2), t1 - item.w / 2),
          ].filter((x) => !(x > tiLo && x < tiHi));
          if (!cands.length) continue;
          c = cands.reduce((b, x) => (Math.abs(x - item.want) < Math.abs(b - item.want) ? x : b));
        }
        const d = Math.abs(c - item.want);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best != null) item.want = best;
    }
    // affecter chaque item à un segment (celui qui contient sa position, sinon le plus proche assez long)
    const bySeg = segs.map(() => []);
    for (const item of items) {
      let si = segs.findIndex(([s0, s1]) => item.want >= s0 && item.want <= s1);
      if (si < 0 || segs[si][1] - segs[si][0] < item.w) {
        si = -1;
        let bestD = Infinity;
        segs.forEach(([s0, s1], i) => {
          if (s1 - s0 < item.w) return;
          const d = item.want < s0 ? s0 - item.want : item.want > s1 ? item.want - s1 : 0;
          if (d < bestD) { bestD = d; si = i; }
        });
      }
      if (si >= 0) bySeg[si].push(item);
    }
    // équilibrage intra-mur : un segment surplein déplace ses items les moins
    // prioritaires vers un autre segment du mur qui a encore de la place
    const segFree = (i) => segs[i][1] - segs[i][0] - bySeg[i].reduce((s, it) => s + it.w, 0);
    for (let si = 0; si < segs.length; si++) {
      while (segFree(si) < 0 && bySeg[si].length) {
        const worst = bySeg[si].reduce((m, it) => (it.prio > m.prio ? it : m), bySeg[si][0]);
        bySeg[si] = bySeg[si].filter((it) => it !== worst);
        let alt = -1, best = -Infinity;
        for (let i = 0; i < segs.length; i++) {
          if (i === si) continue;
          const f = segFree(i);
          if (f >= worst.w && f > best) { best = f; alt = i; }
        }
        if (alt >= 0) {
          worst.want = Math.min(Math.max(worst.want, segs[alt][0] + worst.w / 2), segs[alt][1] - worst.w / 2);
          bySeg[alt].push(worst);
        }
        // sinon : réellement retiré (aucune place sur ce mur ni les autres)
      }
    }
    // REQ-107 : marge de comptoir obligatoire entre la cuisinière et une colonne
    // (chaleur + NKBA 19) — l'espace créé est rempli par un caisson/filler avec comptoir
    const isTall = (it) => it && (it.type === 'frigo' || it.type === 'garde-manger');
    const reqGap = (p, q) =>
      (p && q && ((p.type === 'cuisiniere' && isTall(q)) || (isTall(p) && q.type === 'cuisiniere'))) ? 0.31 : 0;
    segs.forEach(([s0, s1], si) => {
      let segItems = bySeg[si].sort((p, q) => p.want - q.want);
      let xs;
      // dé-superposition — si elle déloge un appareil contraint (évier sur sa
      // plomberie, cuisinière sur sa prise), on sacrifie l'item le moins
      // prioritaire du segment et on recommence
      for (let essai = 0; essai <= bySeg[si].length; essai++) {
        xs = segItems.map((it) => Math.min(Math.max(it.want - it.w / 2, s0), s1 - it.w));
        for (let i = 1; i < xs.length; i++) {
          xs[i] = Math.max(xs[i], xs[i - 1] + segItems[i - 1].w + reqGap(segItems[i - 1], segItems[i]));
        }
        let limit = s1;
        for (let i = xs.length - 1; i >= 0; i--) {
          xs[i] = Math.min(xs[i], limit - segItems[i].w - reqGap(segItems[i], segItems[i + 1]));
          limit = xs[i];
        }
        for (let i = 1; i < xs.length; i++) {
          xs[i] = Math.max(xs[i], xs[i - 1] + segItems[i - 1].w + reqGap(segItems[i - 1], segItems[i]));
        }
        const contraint = (it) =>
          (it.type === 'evier' && !sinkIsAuto) || (it.type === 'cuisiniere' && !stoveIsAuto);
        const di = segItems.findIndex(
          (it, i) => contraint(it) && Math.abs(xs[i] + it.w / 2 - it.want) > 0.2
        );
        if (di < 0 || !segItems.length) break;
        // sacrifier du côté qui pousse l'appareil contraint, par priorité décroissante
        const pousseDroite = xs[di] + segItems[di].w / 2 > segItems[di].want;
        const cote = segItems.filter((it, i) => (pousseDroite ? i < di : i > di) && !contraint(it));
        const pool = cote.length ? cote : segItems.filter((it) => !contraint(it));
        if (!pool.length) break;
        const worst = pool.reduce((m, it) => (it.prio > m.prio ? it : m), pool[0]);
        segItems = segItems.filter((it) => it !== worst);
      }
      // construire la liste finale de slots (remplissage automatique entre les items fixes)
      const slots = [];
      let cursor = s0;
      let fillIdx = 0;
      const pushFill = (from, to) => {
        // REQ-701 : caissons aux largeurs catalogue (pas de 3 po) + filler pour le reste
        for (const piece of catalogWidths(to - from)) {
          if (piece.filler) {
            slots.push({ w: piece.w, type: 'filler', widthIn: piece.widthIn });
          } else {
            slots.push({ w: piece.w, type: 'auto-' + (fillIdx % 2 ? 'portes' : 'tiroirs'), widthIn: piece.widthIn });
            fillIdx++;
          }
        }
      };
      segItems.forEach((it, i) => {
        pushFill(cursor, xs[i]);
        slots.push({ w: it.w, type: it.type });
        cursor = xs[i] + it.w;
      });
      pushFill(cursor, s1);
      // REQ-710 : un lave-vaisselle en bout de segment expose son flanc → panneau de retour
      slots.forEach((slot, i) => {
        if (slot.type === 'lavevaisselle') {
          if (i === 0) slot.dwPanel = 'debut';
          else if (i === slots.length - 1) slot.dwPanel = 'fin';
        }
      });
      // REQ-711 : un bout de segment qui ne bute pas sur un caisson de coin
      // est un flanc visible → fausse porte de finition
      const startExposed = wallKey === 'back'
        ? !(hasCornerL && Math.abs(s0 - CORNER) < 0.03)
        : !(Math.abs(s0 - CORNER) < 0.03);
      const endExposed = !(wallKey === 'back' && hasCornerR && Math.abs(s1 - (a - CORNER)) < 0.03);
      if (slots.length) {
        if (startExposed) slots[0].panelStart = true;
        if (endExposed) slots[slots.length - 1].panelEnd = true;
      }
      // poser les modules
      let along = s0;
      // recale pour que les modules collent : la somme des slots = segLen par construction
      for (const slot of slots) {
        const n = (moduleCounters[wallKey] = (moduleCounters[wallKey] || 0) + 1);
        const id = `${wallKey}:${n}`;
        let type = slot.type;
        if (type.startsWith('auto-')) {
          type = state.moduleOverrides[id] || type.slice(5);
          if (slot.w < 0.32) type = 'filler';
        }
        const pl = modulePlacement(wallKey, along, slot.w);
        let g;
        if (type === 'frigo') {
          g = buildFridge(applianceMat);
          // REQ-101 : panneaux de finition pleine hauteur de chaque côté du frigo —
          // ils cachent ses flancs et le séparent des caissons voisins
          const pd = 0.7;
          g.add(box(0.025, TALL_H, pd, finish, 0.0125, TALL_H / 2, pd / 2));
          g.add(box(0.025, TALL_H, pd, finish, FRIDGE_W - 0.0125, TALL_H / 2, pd / 2));
          const rrp = findSku('fridgeReturnPanel');
          if (!manifest.addSku(rrp, 'Panneau de retour réfrigérateur')) manifest.add('panneau-frigo');
          if (rrp) manifest.addSku(rrp, 'Panneau de retour réfrigérateur'); // ×2 (un par côté)
          else manifest.add('panneau-frigo');
          // REQ-110 : armoire dédiée au-dessus du frigo, entre les panneaux
          {
            const niche = FRIDGE_W - 0.05;
            const ofY0 = 1.86, ofH = TALL_H - ofY0, ofD = 0.6;
            g.add(box(niche - 0.004, ofH, ofD - DOOR_T, finish, FRIDGE_W / 2, ofY0 + ofH / 2, (ofD - DOOR_T) / 2));
            const dw2 = (niche - GAP * 3) / 2;
            const zF2 = ofD - DOOR_T / 2;
            [GAP + dw2 / 2, GAP * 2 + dw2 * 1.5].forEach((x, i) => {
              const f = makeFront(dw2, ofH - GAP * 2, finish, mats.doorStyle);
              f.position.set(0.025 + x, ofY0 + ofH / 2, zF2);
              g.add(f);
              const h = makeHandle(mats.handleKind, mats.handleMat, false, 0.14);
              if (h) { h.position.set(0.025 + x, ofY0 + 0.07, zF2 + DOOR_T / 2); g.add(h); }
              manifest.handles++;
            });
            const of = findSku('overFridge', Math.round(niche / IN));
            if (!manifest.addSku(of, 'Armoire au-dessus du réfrigérateur')) manifest.add('mur');
          }
          manifest.appliances.fridge = true;
          placed.frigo = { wall: wallKey, along: along + slot.w / 2, w: slot.w };
        } else if (type === 'garde-manger') {
          g = buildPantry(mats, manifest);
          placed.pantry = { wall: wallKey, along: along + slot.w / 2, w: slot.w };
        } else {
          g = buildBase(slot.w, type, mats, manifest, slot.widthIn ?? null);
          if (type === 'cuisiniere') { manifest.appliances.range = true; placed.cuisiniere = { wall: wallKey, along: along + slot.w / 2, w: slot.w }; }
          if (type === 'lavevaisselle') {
            manifest.appliances.dw = true;
            placed.dw = { wall: wallKey, along: along + slot.w / 2, w: slot.w };
            if (slot.dwPanel) {
              // REQ-710 : panneau de retour côté exposé du lave-vaisselle
              const px = slot.dwPanel === 'debut' ? -0.011 : slot.w + 0.011;
              g.add(box(0.02, PLINTH + CARCASS_H, BASE_D + 0.02, finish, px, (PLINTH + CARCASS_H) / 2, (BASE_D + 0.02) / 2));
              manifest.addSku(findSku('dwReturnPanel'), 'Panneau de retour lave-vaisselle');
            }
          }
          if (type === 'evier') placed.evier = { wall: wallKey, along: along + slot.w / 2, w: slot.w };
          // REQ-711 : fausses portes sur les flancs exposés des caissons bas
          const dummyTypes = ['portes', 'tiroirs', 'ouvert', 'filler', 'evier'];
          if ((slot.panelStart || slot.panelEnd) && dummyTypes.includes(type)) {
            const ds = findSku('dummyBaseEnd', 25);
            for (const side of [slot.panelStart && 'debut', slot.panelEnd && 'fin'].filter(Boolean)) {
              const f = makeFront(BASE_D - 0.05, CARCASS_H - 0.03, finish, state.doorStyle);
              f.rotation.y = side === 'debut' ? -Math.PI / 2 : Math.PI / 2;
              f.position.set(side === 'debut' ? -0.012 : slot.w + 0.012, PLINTH + CARCASS_H / 2, BASE_D / 2);
              g.add(f);
              manifest.addSku(ds, 'Bout de bas (fausse porte)');
            }
          }
        }
        placedIntervals[wallKey].push({ a0: along, a1: along + slot.w, t: type });
        if (type !== 'cuisiniere') plinthLin += slot.w;
        g.position.copy(pl.pos);
        g.rotation.y = pl.rotY;
        inner.add(g);
        if (slot.type.startsWith('auto-') && slot.w >= 0.32) {
          const hit = new THREE.Mesh(
            new THREE.BoxGeometry(slot.w, CARCASS_H + PLINTH, BASE_D),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hit.position.set(slot.w / 2, (CARCASS_H + PLINTH) / 2, BASE_D / 2);
          hit.userData = { editable: true, moduleId: id, current: type, width: slot.w };
          g.add(hit);
          editables.push(hit);
        }
        along += slot.w;
      }
    });
  }
  for (const wk of cabWalls) layWall(wk);

  // ——— caissons de coin ———
  function cornerUnit(mirror) {
    const cg = new THREE.Group();
    const x0 = mirror ? a - CORNER : 0;
    const sgn = mirror ? -1 : 1;
    const base = mirror ? a : 0;
    cg.add(box(CORNER, PLINTH, BASE_D - 0.07, S.shadeBlack, base + sgn * CORNER / 2, PLINTH / 2, (BASE_D - 0.07) / 2));
    cg.add(box(CORNER, CARCASS_H, BASE_D - DOOR_T, finish, base + sgn * CORNER / 2, PLINTH + CARCASS_H / 2, (BASE_D - DOOR_T) / 2));
    const f = makeFront(CORNER - BASE_D - GAP, CARCASS_H - 0.01, finish, state.doorStyle);
    f.position.set(base + sgn * (BASE_D + (CORNER - BASE_D) / 2), PLINTH + CARCASS_H / 2, BASE_D - DOOR_T / 2);
    cg.add(f);
    cg.add(box(0.02, CARCASS_H, 0.3, finish, base + sgn * (BASE_D - 0.01), PLINTH + CARCASS_H / 2, BASE_D + 0.15));
    cg.add(box(BASE_D - 0.02, CARCASS_H, CORNER - BASE_D, finish, base + sgn * (BASE_D - 0.02) / 2, PLINTH + CARCASS_H / 2, BASE_D + (CORNER - BASE_D) / 2));
    cg.add(box(BASE_D - 0.09, PLINTH, CORNER - BASE_D, S.shadeBlack, base + sgn * (BASE_D - 0.09) / 2, PLINTH / 2, BASE_D + (CORNER - BASE_D) / 2));
    inner.add(cg);
    const cs = findSku('baseCorner', Math.round(CORNER / IN));
    if (!manifest.addSku(cs, `Caisson de coin ${cs?.widthIn} po`)) manifest.add('base-coin');
    placedIntervals.back.push({ a0: mirror ? a - CORNER : 0, a1: mirror ? a : CORNER, t: 'coin' });
    plinthLin += CORNER;
    return x0;
  }
  if (hasCornerL) cornerUnit(false);
  if (hasCornerR) cornerUnit(true);

  // ——— comptoirs (segments, trous d'évier, retrait cuisinière et portes) ———
  function counterSpans(wallKey) {
    let lo, hi;
    if (wallKey === 'back') { lo = 0; hi = a; }
    else { lo = COUNTER_D + 0.002; hi = wallLen[wallKey]; }
    let spans = [[lo, hi]];
    for (const door of doorsByWall[wallKey]) spans = cut(spans, door.pos - door.width / 2 - 0.04, door.pos + door.width / 2 + 0.04);
    if (placed.cuisiniere && placed.cuisiniere.wall === wallKey) {
      spans = cut(spans, placed.cuisiniere.along - RANGE_W / 2, placed.cuisiniere.along + RANGE_W / 2);
    }
    // REQ-801 : le comptoir s'interrompt aux colonnes (frigo, garde-manger) —
    // il ne doit jamais les traverser, et leur emprise ne se facture pas en pi²
    for (const tall of [placed.frigo, placed.pantry]) {
      if (tall && tall.wall === wallKey) {
        spans = cut(spans, tall.along - tall.w / 2, tall.along + tall.w / 2);
      }
    }
    return spans;
  }
  const holeW = 0.56, holeD = 0.44, holeD0 = 0.1;
  for (const wk of cabWalls) {
    for (const [s0, s1] of counterSpans(wk)) {
      const hasSink = placed.evier && placed.evier.wall === wk &&
        placed.evier.along - holeW / 2 >= s0 && placed.evier.along + holeW / 2 <= s1;
      if (hasSink) {
        const hx0 = placed.evier.along - holeW / 2, hx1 = placed.evier.along + holeW / 2;
        addBoxRect(wk, s0, hx0, 0, COUNTER_D, COUNTER_H, COUNTER_TOP, counterMat);
        addBoxRect(wk, hx1, s1, 0, COUNTER_D, COUNTER_H, COUNTER_TOP, counterMat);
        addBoxRect(wk, hx0, hx1, 0, holeD0, COUNTER_H, COUNTER_TOP, counterMat);
        addBoxRect(wk, hx0, hx1, holeD0 + holeD, COUNTER_D, COUNTER_H, COUNTER_TOP, counterMat);
      } else {
        addBoxRect(wk, s0, s1, 0, COUNTER_D, COUNTER_H, COUNTER_TOP, counterMat);
      }
      manifest.counterArea += (s1 - s0) * COUNTER_D;
    }
  }
  // évier + robinet
  if (placed.evier) {
    const sg = buildSink();
    const p = centeredPlacement(placed.evier.wall, placed.evier.along);
    sg.position.copy(p.pos);
    sg.rotation.y = p.rotY;
    inner.add(sg);
  }

  // ——— dosseret (suit les comptoirs, continue derrière la cuisinière) ———
  const bsH = WALL_BOT - COUNTER_TOP;
  for (const wk of cabWalls) {
    let spans = [[0.01, wallLen[wk] - 0.01]]; // jusqu'au coin (murret) sur tous les murs
    for (const door of doorsByWall[wk]) spans = cut(spans, door.pos - door.width / 2 - 0.04, door.pos + door.width / 2 + 0.04);
    // REQ-801 : pas de dosseret (ni de pi² facturés) derrière les colonnes
    for (const tall of [placed.frigo, placed.pantry]) {
      if (tall && tall.wall === wk) spans = cut(spans, tall.along - tall.w / 2, tall.along + tall.w / 2);
    }
    for (const [s0, s1] of spans) {
      addBoxRect(wk, s0, s1, 0.004, 0.018, COUNTER_TOP, WALL_BOT, backsplashMat);
      manifest.backsplashArea += (s1 - s0) * bsH;
    }
  }

  // ——— REQ-704 : coin aveugle mural — les armoires murales tournent le coin ———
  const WBC_W = 0.76; // 30 po (produit réel : Wall Blind Corner)
  function blindCornerUpper(mirror) {
    // le caisson aveugle TOUCHE le mur perpendiculaire ; c'est le ruban voisin
    // qui bute contre son flanc (pose réelle d'un blind corner)
    const x0 = mirror ? a - 0.02 - WBC_W : 0.02;
    // une fenêtre ou une porte dans la zone du coin → pas de coin aveugle
    const clash = [...winsByWall.back, ...doorsByWall.back].some(
      (o) => o.pos + o.width / 2 > x0 - 0.05 && o.pos - o.width / 2 < x0 + WBC_W + 0.05
    );
    if (clash) return false;
    const g = new THREE.Group();
    g.add(box(WBC_W - 0.004, WALL_CAB_H, WALL_CAB_D - DOOR_T, finish, WBC_W / 2, WALL_CAB_H / 2, (WALL_CAB_D - DOOR_T) / 2));
    const zF = WALL_CAB_D - DOOR_T / 2;
    // la moitié côté coin est aveugle (panneau plein), l'autre porte une porte
    const doorW = WBC_W / 2 - GAP * 2;
    const blindX = mirror ? WBC_W * 0.75 : WBC_W * 0.25;
    const doorX = mirror ? WBC_W * 0.25 : WBC_W * 0.75;
    g.add(box(WBC_W / 2, WALL_CAB_H - GAP * 2, DOOR_T * 0.7, finish, blindX, WALL_CAB_H / 2, zF - 0.003));
    const f = makeFront(doorW, WALL_CAB_H - GAP * 2, finish, state.doorStyle);
    f.position.set(doorX, WALL_CAB_H / 2, zF);
    g.add(f);
    const h = makeHandle(state.handle, handleMat, true, 0.14);
    if (h) {
      h.position.set(doorX + (mirror ? doorW / 2 - 0.04 : -(doorW / 2 - 0.04)), 0.13, zF + DOOR_T / 2);
      g.add(h);
    }
    manifest.handles++;
    const strip = box(WBC_W - 0.06, 0.008, 0.02, S.glow, WBC_W / 2, -0.006, WALL_CAB_D - 0.08);
    strip.castShadow = false;
    g.add(strip);
    g.position.set(x0, WALL_BOT, 0);
    inner.add(g);
    const s = findSku('wallBlindCorner', 30);
    if (!manifest.addSku(s, 'Coin aveugle mural 30 po')) manifest.add('mur');
    return true;
  }
  const wbcL = hasCornerL ? blindCornerUpper(false) : false;
  const wbcR = hasCornerR ? blindCornerUpper(true) : false;

  // ——— armoires murales (évite fenêtres, hotte, colonnes, portes) ———
  for (const wk of cabWalls) {
    // les rubans muraux vont jusqu'au coin (après le coin aveugle ou le ruban perpendiculaire)
    let upLo, upHi;
    if (wk === 'back') {
      upLo = hasCornerL ? (wbcL ? 0.02 + WBC_W + 0.004 : WALL_CAB_D + 0.04) : 0.02;
      upHi = hasCornerR ? (wbcR ? a - 0.02 - WBC_W - 0.004 : a - WALL_CAB_D - 0.04) : a - 0.02;
    } else {
      // bute contre le flanc du coin aveugle (prof. 35 cm + jeu de filler)
      upLo = WALL_CAB_D + 0.04;
      upHi = wallLen[wk] - 0.02;
    }
    let zones = [[upLo, upHi]];
    for (const door of doorsByWall[wk]) {
      zones = cut(zones, door.pos - door.width / 2 - 0.07, door.pos + door.width / 2 + 0.07);
    }
    for (const win of winsByWall[wk]) zones = cut(zones, win.pos - win.width / 2 - 0.08, win.pos + win.width / 2 + 0.08);
    if (placed.cuisiniere && placed.cuisiniere.wall === wk && state.appliances.hood) {
      zones = cut(zones, placed.cuisiniere.along - 0.5, placed.cuisiniere.along + 0.5);
    }
    if (placed.frigo && placed.frigo.wall === wk) zones = cut(zones, placed.frigo.along - placed.frigo.w / 2 - 0.004, placed.frigo.along + placed.frigo.w / 2 + 0.004);
    if (placed.pantry && placed.pantry.wall === wk) zones = cut(zones, placed.pantry.along - placed.pantry.w / 2 - 0.004, placed.pantry.along + placed.pantry.w / 2 + 0.004);
    for (const [z0, z1] of zones) {
      if (z1 - z0 < 0.34) continue;
      let cx = z0;
      for (const piece of catalogWidths(z1 - z0)) {
        const pl = modulePlacement(wk, cx, piece.w, WALL_BOT);
        if (piece.filler) {
          // caisson plein du mur jusqu'au plan des façades — jamais une lamelle flottante
          const fg = new THREE.Group();
          fg.add(box(Math.max(piece.w - 0.002, 0.008), WALL_CAB_H, WALL_CAB_D - 0.02, finish,
            piece.w / 2, WALL_CAB_H / 2, (WALL_CAB_D - 0.02) / 2));
          fg.position.copy(pl.pos);
          fg.rotation.y = pl.rotY;
          inner.add(fg);
          manifest.addSku(fillerSku(piece.widthIn), 'Filler de finition (mural)');
        } else {
          const wc = buildWallCab(piece.w, mats, manifest, piece.widthIn);
          wc.position.copy(pl.pos);
          wc.rotation.y = pl.rotY;
          inner.add(wc);
        }
        cx += piece.w;
      }
    }
  }

  // ——— hotte ———
  if (state.appliances.hood && placed.cuisiniere) {
    const hood = buildHood(applianceMat);
    const p = centeredPlacement(placed.cuisiniere.wall, placed.cuisiniere.along);
    hood.position.copy(p.pos);
    hood.rotation.y = p.rotY;
    inner.add(hood);
    manifest.appliances.hood = true;
    manifest.add('hotte-coffrage');
  }

  // ——— îlot ———
  const D = decor(S);
  let islandCenter = null;
  let islandGroup = null;
  let islandRect = null;
  let islandImpossible = false;
  if (state.island) {
    // REQ-202 (NKBA 3) : l'allée de 1,06 m s'applique sur TOUS les côtés qui font
    // face à des caissons — y compris les rubans latéraux (frigo qui avance de 70 cm)
    const AISLE = 1.06;
    const eL = (cabWalls.includes('left') ? 0.70 + AISLE : 0.30);
    const eR = a - (cabWalls.includes('right') ? 0.70 + AISLE : 0.30);
    const availW = eR - eL - 0.08; // débords du comptoir (= épaisseur des cascades)
    const islD = 0.95;
    const islZ0 = BASE_D + AISLE;
    // largeur aimantée au pas de 3 po, bornée par l'espace réellement disponible
    const islW = Math.floor(Math.min(Math.max(a - 2.0, 1.5), 2.6, availW) / (3 * IN)) * 3 * IN;
    const islX0 = eL + 0.04 + (availW - islW) / 2;
    if (islW < 0.75) islandImpossible = true; // pas la place avec les allées minimales
    else {
    islandCenter = new THREE.Vector3(islX0 + islW / 2, 0.95, islZ0 + islD / 2);
    const islCx = islX0 + islW / 2; // l'îlot est centré dans son espace libre, pas dans la pièce
    const ig = new THREE.Group();
    const islSlots = catalogWidths(islW)
      .filter((p) => !p.filler)
      .map((p, i) => ({ w: p.w, widthIn: p.widthIn, type: i % 2 ? 'auto-portes' : 'auto-tiroirs' }));
    let cx = islX0 + islW;
    islSlots.forEach((slot, i) => {
      const id = `isl:${i}`;
      let type = state.moduleOverrides[id] || slot.type.slice(5);
      const g = buildBase(slot.w, type, islandMats, manifest, slot.widthIn);
      g.position.set(cx, 0, islZ0 + BASE_D);
      g.rotation.y = Math.PI;
      ig.add(g);
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(slot.w, CARCASS_H + PLINTH, BASE_D),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.set(slot.w / 2, (CARCASS_H + PLINTH) / 2, BASE_D / 2);
      hit.userData = { editable: true, moduleId: id, current: type, width: slot.w };
      g.add(hit);
      editables.push(hit);
      manifest.islandModules++;
      plinthLin += slot.w;
      cx -= slot.w;
    });
    islandRect = { x0: islX0 - 0.04, x1: islX0 + islW + 0.04, z0: islZ0 - 0.03, z1: islZ0 + islD + 0.07 };
    // REQ-709 : les panneaux d'îlot sont des produits facturés (arrière + habillage ×2)
    manifest.addSku(findSku('islandBackPanel', 96), 'Panneau arrière d’îlot');
    const skin = findSku('islandSkinPanel');
    manifest.addSku(skin, 'Panneau d’habillage d’îlot');
    manifest.addSku(skin, 'Panneau d’habillage d’îlot');
    ig.add(scaleUV(box(islW, CARCASS_H + PLINTH, 0.02, islandFinish, islCx, (CARCASS_H + PLINTH) / 2, islZ0 + BASE_D + 0.01), islW / 0.55));
    ig.add(box(0.02, CARCASS_H + PLINTH, BASE_D + 0.02, islandFinish, islX0 + 0.01, (CARCASS_H + PLINTH) / 2, islZ0 + BASE_D / 2));
    ig.add(box(0.02, CARCASS_H + PLINTH, BASE_D + 0.02, islandFinish, islX0 + islW - 0.01, (CARCASS_H + PLINTH) / 2, islZ0 + BASE_D / 2));
    const ct = box(islW + 0.08, COUNTER_T, islD + 0.1, counterMat, islCx, COUNTER_H + COUNTER_T / 2, islZ0 + (islD + 0.04) / 2);
    ig.add(ct);
    for (const s of [0, 1]) {
      ig.add(box(0.04, COUNTER_TOP, islD + 0.1, counterMat,
        islX0 - 0.02 + s * (islW + 0.04), COUNTER_TOP / 2, islZ0 + (islD + 0.04) / 2));
    }
    manifest.counterArea += (islW + 0.08) * (islD + 0.1);
    const nSt = islW > 2 ? 3 : 2;
    for (let i = 0; i < nSt; i++) {
      ig.add(D.stool(islCx + (i - (nSt - 1) / 2) * 0.62, islZ0 + islD + 0.28));
    }
    const nP = islW > 2 ? 3 : 2;
    for (let i = 0; i < nP; i++) {
      ig.add(D.pendant(islCx + (i - (nP - 1) / 2) * (islW / nP), 1.78, islZ0 + islD / 2));
    }
    ig.add(D.bowl(islCx - 0.4, COUNTER_TOP, islZ0 + islD / 2));
    ig.add(D.board(islCx + 0.5, COUNTER_TOP, islZ0 + islD / 2, -0.25));
    inner.add(ig);
    islandGroup = ig;
    } // fin else (îlot possible)
  }

  // déco près de l'évier
  if (placed.evier) {
    const pAl = Math.min(Math.max(placed.evier.along + 0.85, 0.3), wallLen[placed.evier.wall] - 0.3);
    inner.add(D.plant(...pointFor(placed.evier.wall, pAl, 0.3, COUNTER_TOP).toArray(), 1.05));
  }
  if (!state.island && placed.evier) {
    const bAl = Math.min(Math.max(placed.evier.along - 1.0, 0.4), wallLen[placed.evier.wall] - 0.4);
    inner.add(D.bowl(...pointFor(placed.evier.wall, bAl, 0.33, COUNTER_TOP).toArray()));
  }

  // ——— calque PLAN : marqueurs interactifs vus de haut ———
  const PLAN_Y = 2.5;
  const planLayer = new THREE.Group();
  planLayer.visible = false;
  const planPick = [];
  const planStrips = [];
  const flatMat = (color, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });
    m._transient = true;
    return m;
  };
  const lineMat = (color) => {
    const m = new THREE.LineBasicMaterial({ color, depthTest: false });
    m._transient = true;
    return m;
  };
  function flatBox(w, d, color, opacity = 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.015, d), flatMat(color, opacity));
    m.castShadow = false;
    m.renderOrder = 10;
    return m;
  }
  function textSprite(text, { size = 44 } = {}) {
    const pad = 26;
    const cv = document.createElement('canvas');
    let c2 = cv.getContext('2d');
    c2.font = `600 ${size}px 'Albert Sans','Segoe UI Emoji',sans-serif`;
    const tw = c2.measureText(text).width;
    cv.width = Math.ceil(tw + pad * 2);
    cv.height = Math.ceil(size + pad * 1.4);
    const th = getTheme();
    c2 = cv.getContext('2d');
    c2.font = `600 ${size}px 'Albert Sans','Segoe UI Emoji',sans-serif`;
    c2.fillStyle = th ? th.spriteBg : 'rgba(28,24,20,0.88)';
    c2.beginPath();
    c2.roundRect(0, 0, cv.width, cv.height, 18);
    c2.fill();
    c2.fillStyle = th ? th.spriteFg : '#f4efe6';
    c2.textBaseline = 'middle';
    c2.textAlign = 'center';
    c2.fillText(text, cv.width / 2, cv.height / 2 + 2);
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tx, depthTest: false });
    mat._transient = true;
    const sp = new THREE.Sprite(mat);
    const H = 0.27;
    sp.scale.set((H * cv.width) / cv.height, H, 1);
    sp.renderOrder = 12;
    return sp;
  }
  // fenêtres et portes (bande + arc de débattement pour les portes)
  for (const wallKey of ['back', 'left', 'right']) {
    for (const win of winsByWall[wallKey]) {
      const g = new THREE.Group();
      const band = flatBox(win.width, 0.26, '#7fb7e8');
      band.position.z = 0.06;
      band.userData = { plan: 'opening', id: win.id };
      g.add(band);
      planPick.push(band);
      const p = centeredPlacement(wallKey, win.pos, PLAN_Y);
      g.position.copy(p.pos);
      g.rotation.y = p.rotY;
      planLayer.add(g);
    }
    for (const door of doorsByWall[wallKey]) {
      const g = new THREE.Group();
      const band = flatBox(door.width, 0.2, '#c89a6b');
      band.position.z = 0.03;
      band.userData = { plan: 'opening', id: door.id };
      g.add(band);
      planPick.push(band);
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * (Math.PI / 2);
        pts.push(new THREE.Vector3(-door.width / 2 + Math.cos(t) * door.width, 0, Math.sin(t) * door.width));
      }
      const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat('#9a7a52'));
      arc.renderOrder = 11;
      const leaf = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-door.width / 2, 0, 0), new THREE.Vector3(-door.width / 2, 0, door.width),
      ]), lineMat('#9a7a52'));
      leaf.renderOrder = 11;
      g.add(arc, leaf);
      const p = centeredPlacement(wallKey, door.pos, PLAN_Y);
      g.position.copy(p.pos);
      g.rotation.y = p.rotY;
      planLayer.add(g);
    }
  }
  // marqueurs d'eau et de prise 240 V (déplaçables)
  function discMarker(color, label, data, at) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24), flatMat(color));
    disc.renderOrder = 10;
    disc.userData = data;
    g.add(disc);
    const sp = textSprite(label, { size: 38 });
    sp.position.set(0, 0.05, -0.34);
    g.add(sp);
    g.position.copy(at);
    planLayer.add(g);
    planPick.push(disc);
  }
  if (placed.evier) {
    discMarker('#3f86c9', '💧 Eau', { plan: 'water' }, pointFor(placed.evier.wall, placed.evier.along, 0.33, PLAN_Y));
  }
  if (placed.cuisiniere) {
    discMarker('#d9763a', '⚡ 240 V', { plan: 'stove' }, pointFor(placed.cuisiniere.wall, placed.cuisiniere.along, 0.3, PLAN_Y));
  }
  // poignées de redimensionnement des murs
  function dimHandle(dim, x, z) {
    const g = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24), flatMat(getTenant().accent));
    dot.renderOrder = 10;
    dot.userData = { plan: 'dim', dim };
    g.add(dot);
    const sp = textSprite('⟷', { size: 44 });
    sp.position.y = 0.06;
    g.add(sp);
    g.position.set(x, PLAN_Y, z);
    planLayer.add(g);
    planPick.push(dot);
  }
  dimHandle('a', a - 0.02, 0.4);
  if (state.layout !== 'lineaire') dimHandle('b', 0.4, b - 0.02);
  if (state.layout === 'u') dimHandle('c', a - 0.4, c - 0.02);
  // cotes murales
  const lblA = textSprite(`Mur principal · ${a.toFixed(2)} m`);
  lblA.position.set(a / 2, PLAN_Y, 1.0);
  planLayer.add(lblA);
  if (state.layout !== 'lineaire') {
    const lblB = textSprite(`Gauche · ${b.toFixed(2)} m`);
    lblB.position.set(1.15, PLAN_Y, b / 2);
    planLayer.add(lblB);
  }
  if (state.layout === 'u') {
    const lblC = textSprite(`Droit · ${c.toFixed(2)} m`);
    lblC.position.set(a - 1.15, PLAN_Y, c / 2);
    planLayer.add(lblC);
  }
  // bandes de murs cliquables (invisibles) pour « ajouter ici »
  for (const wallKey of ['back', 'left', 'right']) {
    const len = wallLen[wallKey];
    const r = rectFor(wallKey, 0, len, -0.12, 0.55);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(r.sx, 0.02, r.sz), new THREE.MeshBasicMaterial({ visible: false }));
    strip.position.set(r.x, PLAN_Y - 0.08, r.z);
    strip.userData = { plan: 'strip', wall: wallKey };
    planLayer.add(strip);
    planStrips.push(strip);
  }
  inner.add(planLayer);

  // ——— calque ÉLÉVATION : surlignages glissables sur la face des murs (vue de face) ———
  const elevGroups = { back: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() };
  const elevPick = [];
  for (const k of ['back', 'left', 'right']) {
    elevGroups[k].visible = false;
    inner.add(elevGroups[k]);
  }
  function elevHighlight(wallKey, along, w, y0, y1, proud, color, data) {
    const g = new THREE.Group();
    const hl = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, 0.014), flatMat(color, 0.32));
    hl.position.set(0, (y0 + y1) / 2, proud);
    hl.renderOrder = 10;
    hl.userData = data;
    g.add(hl);
    const p = centeredPlacement(wallKey, along, 0);
    g.position.copy(p.pos);
    g.rotation.y = p.rotY;
    elevGroups[wallKey].add(g);
    elevPick.push(hl);
    return g;
  }
  {
    const wy0 = WALL_BOT + 0.02, wy1 = WALL_BOT + WALL_CAB_H - 0.05;
    for (const wallKey of ['back', 'left', 'right']) {
      for (const win of winsByWall[wallKey]) {
        elevHighlight(wallKey, win.pos, win.width + 0.1, wy0 - 0.05, wy1 + 0.05, 0.1, '#7fb7e8',
          { elev: 'opening', id: win.id, wall: wallKey });
      }
      for (const door of doorsByWall[wallKey]) {
        elevHighlight(wallKey, door.pos, door.width + 0.1, 0, 2.12, 0.16, '#c89a6b',
          { elev: 'opening', id: door.id, wall: wallKey });
      }
    }
    // disques eau / prise sur la face du mur, à hauteur réaliste
    function elevDisc(wallKey, along, h, color, label, data) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 24), flatMat(color));
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, h, 0.05);
      disc.renderOrder = 11;
      disc.userData = data;
      g.add(disc);
      const sp = textSprite(label, { size: 36 });
      sp.position.set(0, h + 0.3, 0.08);
      g.add(sp);
      const p = centeredPlacement(wallKey, along, 0);
      g.position.copy(p.pos);
      g.rotation.y = p.rotY;
      elevGroups[wallKey].add(g);
      elevPick.push(disc);
    }
    if (placed.evier) {
      elevDisc(placed.evier.wall, placed.evier.along, 0.55, '#3f86c9', '💧 Eau', { elev: 'water', wall: placed.evier.wall });
    }
    if (placed.cuisiniere) {
      elevDisc(placed.cuisiniere.wall, placed.cuisiniere.along, 0.42, '#d9763a', '⚡ 240 V', { elev: 'stove', wall: placed.cuisiniere.wall });
    }
  }

  // ——— centrage de la pièce ———
  inner.position.set(-a / 2, 0, -roomD / 2);
  const toWorld = (v) => new THREE.Vector3(v.x - a / 2, v.y, v.z - roomD / 2);

  // fenêtre de référence pour le soleil (la première posée, sinon point virtuel au-dessus de l'évier)
  let sunWindow = null;
  for (const wk of ['back', 'left', 'right']) {
    if (winsByWall[wk].length) {
      const win = winsByWall[wk][0];
      const normals = { back: new THREE.Vector3(0, 0, 1), left: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(-1, 0, 0) };
      sunWindow = { pos: toWorld(pointFor(wk, win.pos, 0, 1.85)), normal: normals[wk] };
      break;
    }
  }
  if (!sunWindow) {
    sunWindow = { pos: toWorld(new THREE.Vector3(a / 2, 1.85, 0)), normal: new THREE.Vector3(0, 0, 1) };
  }

  const sinkPt = placed.evier
    ? toWorld(pointFor(placed.evier.wall, placed.evier.along, 0.4, 0.95))
    : toWorld(new THREE.Vector3(a / 2, 0.95, 0.4));

  // REQ-714 : la plinthe (toe-kick) se vend en longueurs de 96 po
  {
    const tk = findSku('toeKick');
    const longueurs = Math.ceil(plinthLin / 2.44);
    for (let i = 0; i < longueurs; i++) manifest.addSku(tk, 'Plinthe (toe-kick) 96 po', { finishMult: false });
  }

  // REQ-803 : filet AABB — en dev, signale tout chevauchement de caissons sur un mur
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    for (const [wk, list] of Object.entries(placedIntervals)) {
      const sorted = [...list].sort((p, q) => p.a0 - q.a0);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].a0 < sorted[i - 1].a1 - 0.005) {
          console.warn(`[REQ-803] Chevauchement sur le mur ${wk} : ${sorted[i - 1].t} [${sorted[i - 1].a0.toFixed(2)}–${sorted[i - 1].a1.toFixed(2)}] ↔ ${sorted[i].t} [${sorted[i].a0.toFixed(2)}–${sorted[i].a1.toFixed(2)}]`);
        }
      }
    }
  }

  // données pour le validateur NKBA (triangle de travail, surfaces de dépôt,
  // séparation des centres, dégagements, fenêtres)
  const nkbaInfo = {
    island: state.island,
    islandImpossible,
    stoveAuto: stoveIsAuto,
    wanted: { frigo: state.appliances.fridge, dw: state.appliances.dw, cuisiniere: state.appliances.range },
    placed: {
      evier: placed.evier, cuisiniere: placed.cuisiniere,
      frigo: placed.frigo, pantry: placed.pantry, dw: placed.dw,
    },
    pts: {},
    spans: {},
    wins: winsByWall,
    // REQ-804 : données pour le débattement des portes
    doors: doorsByWall,
    islandRect,
    dims: { a, roomD },
    planes: { left: wallPlane.left.at, right: wallPlane.right.at },
    cabWalls,
    wallLens: wallLen,
  };
  for (const [k, p] of Object.entries(nkbaInfo.placed)) {
    if (p) nkbaInfo.pts[k] = toWorld(pointFor(p.wall, p.along, 0.3, 0));
  }
  for (const wk of cabWalls) nkbaInfo.spans[wk] = counterSpans(wk);

  const focus = {
    center: new THREE.Vector3(0, 0.95, 0),
    sink: sinkPt,
    island: islandCenter ? toWorld(islandCenter) : toWorld(new THREE.Vector3(a / 2, 0.95, 1.6)),
    window: sunWindow.pos,
    windowNormal: sunWindow.normal,
    roomD, a,
    planes: { left: wallPlane.left.at, right: wallPlane.right.at },
    wallLens: wallLen,
    cabWalls,
  };

  return { group: root, manifest, editables, focus, walls, planLayer, planPick, planStrips, elevGroups, elevPick, islandGroup, nkba: nkbaInfo };
}

export function disposeKitchen(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    // matériaux mis en cache et partagés : on ne les libère pas —
    // seuls les matériaux transitoires du calque plan sont détruits
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m._transient) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}
