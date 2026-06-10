// Édition directe en vue Plan et en vue Élévation (mur de face) :
// glisser fenêtres / portes / entrée d'eau / prise 240 V le long des murs,
// étirer les murs par leurs poignées, cliquer un mur pour ajouter ou le voir de face.
// Le glissement est contraint : un élément ne peut vivre que sur un mur — aucun état invalide.
import * as THREE from 'three';
import { state, setState } from './state.js';
import { showMenu, hidePopover } from './ui.js';
import { resolveOpeningPos } from './openings.js';

const round5 = (v) => Math.round(v * 20) / 20;
const WALL_TITLES = { back: 'Mur principal', left: 'Mur gauche', right: 'Mur droit', front: 'Mur avant' };

export function createPlanEditor(ctx, canvas, getCurrent, { goPlanView } = {}) {
  let mode = 'ensemble';
  let elevWall = null; // mur regardé de face, ou null (vue du dessus)
  let pending = null;
  let drag = null;
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  // plan horizontal à la hauteur des marqueurs (PLAN_Y dans kitchen.js) :
  // projeter au sol créerait une parallaxe importante en bord d'écran
  const PLAN_Y = 2.5;
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLAN_Y);
  const wallPlane = new THREE.Plane();
  const hitPt = new THREE.Vector3();
  const hintChip = document.querySelector('.hint-chip');

  // bouton de retour à la vue du dessus (visible en élévation)
  const backBtn = document.createElement('button');
  backBtn.className = 'elev-back';
  backBtn.innerHTML = '↩ Vue du dessus';
  backBtn.hidden = true;
  document.getElementById('app').appendChild(backBtn);
  backBtn.addEventListener('click', () => exitElevation());

  function setRay(e) {
    ptr.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, ctx.camera);
  }

  function castAt(e, objects) {
    setRay(e);
    const hits = ray.intersectObjects(objects, false);
    return hits.length ? hits[0].object : null;
  }

  // point du pointeur projeté sur le plan des marqueurs, en coordonnées pièce
  function roomPoint(e) {
    setRay(e);
    if (!ray.ray.intersectPlane(ground, hitPt)) return null;
    const f = getCurrent().focus;
    return { x: hitPt.x + f.a / 2, z: hitPt.z + f.roomD / 2, f };
  }

  // point du pointeur projeté sur la face d'un mur → { along, y }
  function wallPoint(e, wallKey) {
    setRay(e);
    const f = getCurrent().focus;
    if (wallKey === 'back') {
      wallPlane.set(new THREE.Vector3(0, 0, 1), f.roomD / 2);
    } else {
      const px = f.planes[wallKey] - f.a / 2; // coordonnée monde du plan du mur
      wallPlane.set(new THREE.Vector3(1, 0, 0), -px);
    }
    if (!ray.ray.intersectPlane(wallPlane, hitPt)) return null;
    const along = wallKey === 'back' ? hitPt.x + f.a / 2 : hitPt.z + f.roomD / 2;
    return { along, y: hitPt.y, f };
  }

  // mur le plus proche parmi les candidats + coordonnée « le long du mur »
  function nearestWall(pt, candidates) {
    const f = pt.f;
    let best = null;
    for (const w of candidates) {
      let d, along;
      if (w === 'back') { d = Math.abs(pt.z); along = pt.x; }
      else if (w === 'front') { d = Math.abs(pt.z - f.roomD); along = pt.x; }
      else if (w === 'left') { d = Math.abs(pt.x - f.planes.left); along = pt.z; }
      else { d = Math.abs(pt.x - f.planes.right); along = pt.z; }
      if (!best || d < best.d) best = { wall: w, d, along };
    }
    return best;
  }

  function clampAlong(wallKey, along, width, f) {
    const len = f.wallLens[wallKey];
    return Math.min(Math.max(along, width / 2 + 0.08), Math.max(width / 2 + 0.08, len - width / 2 - 0.08));
  }

  function patchOpening(id, p) {
    setState({
      constraints: {
        openings: state.constraints.openings.map((o) => (o.id === id ? { ...o, ...p } : o)),
      },
    });
  }

  // cible (mur + along) du pointeur selon le sous-mode
  function pointerTarget(e, candidates) {
    if (elevWall) {
      if (!candidates.includes(elevWall)) return null;
      const wp = wallPoint(e, elevWall);
      return wp ? { wall: elevWall, along: wp.along, f: wp.f } : null;
    }
    const pt = roomPoint(e);
    if (!pt) return null;
    const t = nearestWall(pt, candidates);
    return t ? { wall: t.wall, along: t.along, f: pt.f } : null;
  }

  // ——— mouvements ———
  function moveOpening(id, e) {
    const o = state.constraints.openings.find((x) => x.id === id);
    if (!o) return;
    const t = pointerTarget(e, state.layout === 'galley' ? ['back', 'left', 'right', 'front'] : ['back', 'left', 'right']);
    if (!t) return;
    // anti-chevauchement : la fenêtre/porte s'arrête au bord de sa voisine
    const pos = resolveOpeningPos(state, t.wall, o.width, t.along, id);
    if (pos == null) return;
    patchOpening(id, { wall: t.wall, pos });
  }

  const FIXTURE_W = { water: 0.9, stove: 0.77, fridge: 0.93, dw: 0.61 };
  function moveFixture(key, e) {
    const cur = getCurrent();
    const t = pointerTarget(e, cur.focus.cabWalls);
    if (!t) return;
    const w = FIXTURE_W[key] || 0.8;
    setState({ constraints: { [key]: { auto: false, wall: t.wall, pos: round5(clampAlong(t.wall, t.along, w, t.f)) } } });
  }

  // La pièce est recentrée à chaque reconstruction (origine = -a/2, -roomD/2) :
  // on résout donc la dimension pour laquelle le bord du mur retombe sous le curseur,
  // au lieu d'assigner la coordonnée brute (qui s'auto-alimenterait).
  function moveDim(dim, e) {
    const pt = roomPoint(e);
    if (!pt) return;
    const f = pt.f;
    if (dim === 'a') {
      const wx = pt.x - f.a / 2; // coordonnée monde du curseur
      const minA = state.layout === 'u' ? 4.3 : 3.4;
      setState({ dims: { a: Math.min(Math.max(round5(2 * wx), minA), 6.4) } });
      return;
    }
    const wz = pt.z - f.roomD / 2;
    // en couloir, b EST la profondeur de la pièce : le mur avant suit le curseur
    if (state.layout === 'galley' && dim === 'b') {
      setState({ dims: { b: Math.min(Math.max(round5(2 * wz), 2.6), 4.6) } });
      return;
    }
    const island = state.island;
    const other = dim === 'b' ? (state.layout === 'u' ? state.dims.c : 0) : state.dims.b;
    const rMin = Math.max(3.5, island ? 4.15 : 3.5, other + 0.7);
    // si ce mur impose la profondeur de la pièce : v + 0.7 = roomD → v = 2·wz + 0.7
    let v = 2 * wz + 0.7;
    if (v + 0.7 < rMin) v = wz + rMin / 2; // sinon la profondeur reste rMin
    if (dim === 'b') setState({ dims: { b: Math.min(Math.max(round5(v), 2.7), 4.6) } });
    else setState({ dims: { c: Math.min(Math.max(round5(v), 2.6), 4.6) } });
  }

  // ——— vue élévation ———
  function enterElevation(wallKey) {
    elevWall = wallKey;
    hidePopover();
    const f = getCurrent().focus;
    const len = f.wallLens[wallKey];
    const aspect = window.innerWidth / window.innerHeight;
    const hTan = Math.tan(THREE.MathUtils.degToRad(23)) * aspect;
    const D = Math.min(Math.max((len / 2 + 0.7) / hTan, 2.4), 8.5);
    let pos, tgt;
    if (wallKey === 'back') {
      tgt = [0, 1.3, -f.roomD / 2];
      pos = [0, 1.55, -f.roomD / 2 + D];
    } else {
      const px = f.planes[wallKey] - f.a / 2;
      const cz = len / 2 - f.roomD / 2;
      tgt = [px, 1.3, cz];
      pos = [px + (wallKey === 'left' ? D : -D), 1.55, cz];
    }
    ctx.flyTo(pos, tgt, 1.1);
    applyVisibility();
    if (hintChip) hintChip.textContent = `✏️ ${WALL_TITLES[wallKey]} de face · glissez ou cliquez pour ajouter`;
    backBtn.hidden = false;
  }

  function exitElevation() {
    if (!elevWall) return;
    elevWall = null;
    hidePopover();
    if (goPlanView) goPlanView();
    applyVisibility();
    if (hintChip) hintChip.textContent = '✏️ Glissez fenêtres, portes, eau · cliquez un mur pour ajouter';
    backBtn.hidden = true;
  }

  function applyVisibility() {
    const cur = getCurrent();
    if (!cur) return;
    const inElev = mode === 'plan' && !!elevWall;
    cur.planLayer.visible = mode === 'plan' && !inElev;
    for (const k of ['back', 'left', 'right']) {
      cur.elevGroups[k].visible = inElev && elevWall === k;
    }
    // en élévation, l'îlot (tabourets, suspensions) ne doit pas boucher la vue du mur
    if (cur.islandGroup) cur.islandGroup.visible = !inElev;
    backBtn.hidden = !inElev;
  }

  // ——— menus contextuels ———
  function openAddMenu(e, wallKey, along) {
    const f = getCurrent().focus;
    const opts = [];
    const wins = state.constraints.openings.filter((o) => o.type === 'fenetre');
    const doors = state.constraints.openings.filter((o) => o.type === 'porte');
    let seq = Math.max(100, ...state.constraints.openings.map((o) => o.id));
    const winPos = resolveOpeningPos(state, wallKey, 1.25, along);
    if (wins.length < 3 && winPos != null) {
      opts.push({
        ico: '🪟', label: 'Fenêtre ici',
        onPick: () => setState({
          constraints: {
            openings: [...state.constraints.openings,
              { id: ++seq, type: 'fenetre', wall: wallKey, pos: winPos, width: 1.25 }],
          },
        }),
      });
    }
    const doorPos = resolveOpeningPos(state, wallKey, 0.85, along);
    if (doors.length < 2 && doorPos != null) {
      opts.push({
        ico: '🚪', label: 'Porte ici',
        onPick: () => setState({
          constraints: {
            openings: [...state.constraints.openings,
              { id: ++seq, type: 'porte', wall: wallKey, pos: doorPos, width: 0.85 }],
          },
        }),
      });
    }
    if (f.cabWalls.includes(wallKey)) {
      opts.push({
        ico: '💧', label: 'Évier ici',
        onPick: () => setState({ constraints: { water: { auto: false, wall: wallKey, pos: round5(clampAlong(wallKey, along, 0.9, f)) } } }),
      });
      opts.push({
        ico: '🍳', label: 'Cuisinière ici',
        onPick: () => setState({ constraints: { stove: { auto: false, wall: wallKey, pos: round5(clampAlong(wallKey, along, 0.77, f)) } } }),
      });
    }
    if (!elevWall && wallKey !== 'front') {
      opts.push({ ico: '👁', label: 'Voir ce mur de face', onPick: () => enterElevation(wallKey) });
    }
    if (opts.length) showMenu(e.clientX, e.clientY, `${WALL_TITLES[wallKey]}${elevWall ? '' : ''}`, opts);
  }

  function openItemMenu(e, ud) {
    if (ud.plan === 'opening' || ud.elev === 'opening') {
      const id = ud.id;
      const o = state.constraints.openings.find((x) => x.id === id);
      if (!o) return;
      showMenu(e.clientX, e.clientY, o.type === 'fenetre' ? 'Fenêtre' : 'Porte', [
        {
          ico: '✕', label: 'Retirer',
          onPick: () => setState({ constraints: { openings: state.constraints.openings.filter((x) => x.id !== id) } }),
        },
      ]);
    } else {
      const key = ud.plan || ud.elev;
      const titles = { water: 'Évier', stove: 'Cuisinière', fridge: 'Réfrigérateur', dw: 'Lave-vaisselle' };
      if (!titles[key]) return;
      const cur = state.constraints[key];
      if (!cur) return;
      showMenu(e.clientX, e.clientY, titles[key], [
        cur.auto
          ? { ico: '📌', label: 'Glissez-moi pour fixer la position', onPick: () => {} }
          : { ico: '🔄', label: 'Remettre en automatique', onPick: () => setState({ constraints: { [key]: { ...cur, auto: true } } }) },
      ]);
    }
  }

  // objets saisissables selon le sous-mode
  function pickables() {
    const cur = getCurrent();
    if (!cur) return [];
    if (elevWall) return cur.elevPick.filter((m) => m.userData.wall === elevWall);
    return cur.planPick;
  }

  // ——— écouteurs (phase capture : priorité sur OrbitControls) ———
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'plan' || e.button !== 0) return;
    const cur = getCurrent();
    if (!cur) return;
    const marker = castAt(e, pickables());
    if (marker) {
      pending = { kind: 'marker', ud: marker.userData, x: e.clientX, y: e.clientY };
      ctx.controls.enabled = false;
      e.stopImmediatePropagation(); // OrbitControls ne doit pas voir ce geste
      try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ }
      return;
    }
    if (elevWall) {
      const wp = wallPoint(e, elevWall);
      if (wp && wp.y > -0.1 && wp.y < 2.75 && wp.along > 0.05 && wp.along < cur.focus.wallLens[elevWall] - 0.05) {
        pending = { kind: 'wallface', wall: elevWall, along: wp.along, x: e.clientX, y: e.clientY };
      }
      return;
    }
    const strip = castAt(e, cur.planStrips);
    if (strip) pending = { kind: 'strip', wall: strip.userData.wall, x: e.clientX, y: e.clientY };
  }, { capture: true });

  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'plan') return;
    if (pending && pending.kind === 'marker' && !drag) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 6) {
        drag = pending;
        hidePopover();
      }
    }
    if (drag) {
      e.stopImmediatePropagation();
      const ud = drag.ud;
      const kind = ud.plan || ud.elev;
      if (kind === 'opening') moveOpening(ud.id, e);
      else if (['water', 'stove', 'fridge', 'dw'].includes(kind)) moveFixture(kind, e);
      else if (ud.plan === 'dim') moveDim(ud.dim, e);
      return;
    }
    // curseur indicatif
    const cur = getCurrent();
    if (!cur) return;
    canvas.style.cursor = castAt(e, pickables()) ? 'grab'
      : (!elevWall && castAt(e, cur.planStrips)) || elevWall ? 'copy' : '';
  }, { capture: true });

  function release(e) {
    if (mode !== 'plan') { pending = null; drag = null; return; }
    if (drag) {
      e.stopImmediatePropagation();
      drag = null;
      pending = null;
      ctx.controls.enabled = true;
      return;
    }
    if (pending) {
      const p = pending;
      pending = null;
      ctx.controls.enabled = true;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 6) {
        if (p.kind === 'marker') {
          e.stopImmediatePropagation();
          openItemMenu(e, p.ud);
        } else if (p.kind === 'wallface') {
          openAddMenu(e, p.wall, p.along);
        } else {
          // bande de mur en vue du dessus : calcule along au point cliqué
          const pt = roomPoint(e);
          if (pt) {
            const t = nearestWall(pt, [p.wall]);
            openAddMenu(e, p.wall, t.along);
          }
        }
      }
    }
  }
  canvas.addEventListener('pointerup', release, { capture: true });
  canvas.addEventListener('pointercancel', release, { capture: true });

  const api = {
    // aides pour les tests E2E
    _snap: () => ctx.snapFly(),
    _screens: () => {
      const cur = getCurrent();
      if (!cur) return [];
      const v = new THREE.Vector3();
      const list = elevWall ? cur.elevPick.filter((m) => m.userData.wall === elevWall) : cur.planPick;
      return list.map((m) => {
        m.getWorldPosition(v);
        v.project(ctx.camera);
        return {
          ...m.userData,
          x: Math.round(((v.x + 1) / 2) * window.innerWidth),
          y: Math.round(((1 - v.y) / 2) * window.innerHeight),
        };
      });
    },
    _enterElevation: enterElevation,
    setMode(m) {
      mode = m;
      if (m !== 'plan') elevWall = null;
      else if (elevWall) elevWall = null; // re-cliquer « Plan » ramène à la vue du dessus
      ctx.controls.enableRotate = m !== 'plan';
      applyVisibility();
      if (m !== 'plan') { pending = null; drag = null; ctx.controls.enabled = true; hidePopover(); }
    },
    mode: () => mode,
    isDragging: () => !!drag,
    sync: applyVisibility,
  };
  if (typeof window !== 'undefined') window.__planEd = api;
  return api;
}
