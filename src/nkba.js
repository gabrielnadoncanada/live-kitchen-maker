// Validateur NKBA doux (REQ-201, 301, 302, 307, 308) : analyse la cuisine générée
// et produit des recommandations — jamais des blocages. Seuils repris du validateur
// de référence (D:\dilamco_render, « 31 Rules of Kitchen Design », NKBA).

const SINK_W = 0.9, RANGE_W = 0.77;

const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const cm = (m) => `${Math.round(m * 100)} cm`;

// surfaces de comptoir adjacentes (gauche/droite) à un appareil, à partir des spans
function landings(spans, along, halfW) {
  let left = 0, right = 0;
  for (const [s0, s1] of spans) {
    // l'appareil vit DANS un span (évier) : comptoir de part et d'autre dans ce span
    if (along - halfW >= s0 - 0.02 && along + halfW <= s1 + 0.02) {
      left = Math.max(left, along - halfW - s0);
      right = Math.max(right, s1 - (along + halfW));
    }
    // l'appareil coupe les spans (cuisinière, frigo) : spans qui le bordent
    if (Math.abs(s1 - (along - halfW)) < 0.05) left = Math.max(left, s1 - s0);
    if (Math.abs(s0 - (along + halfW)) < 0.05) right = Math.max(right, s1 - s0);
  }
  return { left: Math.max(0, left), right: Math.max(0, right) };
}

export function computeNkbaWarnings(nkba) {
  if (!nkba) return [];
  const out = [];
  const { pts, placed, spans, island } = nkba;

  // appareils demandés mais impossibles à placer avec les contraintes actuelles
  if (nkba.wanted) {
    const noms = { frigo: 'le réfrigérateur', dw: 'le lave-vaisselle', cuisiniere: 'la cuisinière' };
    for (const [k, label] of Object.entries(noms)) {
      if (nkba.wanted[k] && !placed[k]) {
        out.push({ id: 'PLACEMENT', msg: `Impossible de placer ${label} avec ces contraintes (plomberie, prise, fenêtres, portes) — élargissez un mur ou déplacez une contrainte.` });
      }
    }
  }
  if (nkba.islandImpossible) {
    out.push({ id: 'PLACEMENT', msg: `Pas assez d'espace pour un îlot avec ses allées de 106 cm — élargissez la pièce ou retirez l'îlot.` });
  }

  // ——— NKBA 26 : triangle de travail ———
  if (pts.evier && pts.cuisiniere && pts.frigo) {
    const legs = [
      ['évier–cuisinière', dist(pts.evier, pts.cuisiniere)],
      ['cuisinière–frigo', dist(pts.cuisiniere, pts.frigo)],
      ['frigo–évier', dist(pts.frigo, pts.evier)],
    ];
    for (const [name, L] of legs) {
      if (L < 1.22) out.push({ id: 'NKBA26', msg: `Triangle de travail : côté ${name} très court (${cm(L)} < 122 cm) — zones de travail à l'étroit.` });
      else if (L > 2.74) out.push({ id: 'NKBA26', msg: `Triangle de travail : côté ${name} long (${cm(L)} > 274 cm) — déplacements fatigants.` });
    }
    const total = legs.reduce((s, [, L]) => s + L, 0);
    if (total > 7.92) out.push({ id: 'NKBA26', msg: `Triangle de travail total de ${cm(total)} (> 792 cm recommandés).` });
  }

  // ——— NKBA 13 / 17 : dépôts autour de l'évier + centre de préparation ———
  if (placed.evier && spans[placed.evier.wall]) {
    const { left, right } = landings(spans[placed.evier.wall], placed.evier.along, SINK_W / 2);
    const hi = Math.max(left, right), lo = Math.min(left, right);
    if (hi < 0.61 || lo < 0.46) {
      out.push({ id: 'NKBA13', msg: `Évier : surfaces de dépôt de ${cm(left)} / ${cm(right)} (recommandé : 61 cm d'un côté, 46 cm de l'autre).` });
    }
    if (hi < 0.91) {
      out.push({ id: 'NKBA17', msg: `Centre de préparation : ${cm(hi)} de comptoir continu près de l'évier (91 cm recommandés).` });
    }
  }

  // ——— NKBA 19 : dépôts autour de la cuisinière ———
  if (placed.cuisiniere && spans[placed.cuisiniere.wall]) {
    const { left, right } = landings(spans[placed.cuisiniere.wall], placed.cuisiniere.along, RANGE_W / 2);
    const hi = Math.max(left, right), lo = Math.min(left, right);
    if (hi < 0.38 || lo < 0.23) {
      out.push({ id: 'NKBA19', msg: `Cuisinière : surfaces de dépôt de ${cm(left)} / ${cm(right)} (recommandé : 38 cm d'un côté, 23 cm de l'autre).` });
    }
  }

  // ——— NKBA 18 : dépôt près du réfrigérateur ———
  if (placed.frigo && spans[placed.frigo.wall]) {
    const { left, right } = landings(spans[placed.frigo.wall], placed.frigo.along, placed.frigo.w / 2);
    if (Math.max(left, right) < 0.38 && !island) {
      out.push({ id: 'NKBA18', msg: `Réfrigérateur : aucune surface de dépôt à proximité (38 cm recommandés, ou un îlot en face).` });
    }
  }

  // ——— NKBA 12 : aucune colonne entre l'évier et la cuisinière (filet du solveur) ———
  if (placed.evier && placed.cuisiniere && placed.evier.wall === placed.cuisiniere.wall) {
    const lo = Math.min(placed.evier.along, placed.cuisiniere.along);
    const hi = Math.max(placed.evier.along, placed.cuisiniere.along);
    const colNames = { frigo: 'réfrigérateur', pantry: 'garde-manger', four: 'four mural' };
    for (const key of ['frigo', 'pantry', 'four']) {
      const t = placed[key];
      if (t && t.wall === placed.evier.wall && t.along > lo && t.along < hi) {
        out.push({ id: 'NKBA12', msg: `Le ${colNames[key]} coupe le plan de travail entre l'évier et la cuisinière.` });
      }
    }
  }

  // ——— NKBA 16 : dégagement debout au lave-vaisselle (21 po de chaque côté) ———
  if (placed.dw) {
    for (const key of ['frigo', 'pantry', 'four']) {
      const t = placed[key];
      if (!t || t.wall !== placed.dw.wall) continue;
      const gap = Math.abs(t.along - placed.dw.along) - t.w / 2 - placed.dw.w / 2;
      if (gap < 0.53 && gap > -0.05) {
        out.push({ id: 'NKBA16', msg: `Lave-vaisselle : ${cm(Math.max(0, gap))} de dégagement debout contre une colonne (53 cm recommandés).` });
      }
    }
  }

  // ——— NKBA 2 (REQ-804) : le débattement des portes ne heurte rien ———
  if (nkba.doors && nkba.dims) {
    const { a, roomD } = nkba.dims;
    const inter = (r, q) => r.x0 < q.x1 && r.x1 > q.x0 && r.z0 < q.z1 && r.z1 > q.z0;
    // emprise du quart de débattement, en coordonnées pièce
    const swing = (wall, pos, w) => {
      if (wall === 'back') return { x0: pos - w / 2, x1: pos + w / 2, z0: 0, z1: w };
      const px = nkba.planes[wall];
      return wall === 'left'
        ? { x0: px, x1: px + w, z0: pos - w / 2, z1: pos + w / 2 }
        : { x0: px - w, x1: px, z0: pos - w / 2, z1: pos + w / 2 };
    };
    // bandes de caissons bas des autres murs
    const strips = {
      back: { x0: 0, x1: a, z0: 0, z1: 0.66 },
      left: { x0: nkba.planes.left, x1: nkba.planes.left + 0.66, z0: 0.92, z1: nkba.wallLens?.left ?? roomD },
      right: { x0: nkba.planes.right - 0.66, x1: nkba.planes.right, z0: 0.92, z1: nkba.wallLens?.right ?? roomD },
      front: { x0: 0, x1: a, z0: roomD - 0.66, z1: roomD }, // rangée avant (couloir)
    };
    for (const wall of ['back', 'left', 'right', 'front']) {
      for (const door of nkba.doors[wall] || []) {
        const zone = swing(wall, door.pos, door.width);
        if (nkba.islandRect && inter(zone, nkba.islandRect)) {
          out.push({ id: 'NKBA2', msg: `Le débattement de la porte heurte l'îlot — déplacez la porte ou réduisez l'îlot.` });
        }
        for (const wk of nkba.cabWalls || []) {
          if (wk === wall) continue; // son propre mur est déjà dégagé par les segments
          if (inter(zone, strips[wk])) {
            const nom = { back: 'principal', left: 'gauche', right: 'droit', front: 'avant' }[wk];
            out.push({ id: 'NKBA2', msg: `Le débattement de la porte heurte les caissons du mur ${nom}.` });
          }
        }
      }
    }
  }

  // ——— NKBA 20 : cuisinière sous une fenêtre (position 240 V imposée) ———
  if (placed.cuisiniere && nkba.wins) {
    for (const win of nkba.wins[placed.cuisiniere.wall] || []) {
      const lo = win.pos - win.width / 2, hi = win.pos + win.width / 2;
      if (placed.cuisiniere.along + RANGE_W / 2 > lo && placed.cuisiniere.along - RANGE_W / 2 < hi) {
        out.push({ id: 'NKBA20', msg: `Cuisinière sous une fenêtre — interdit par le code si la fenêtre est ouvrante (rideaux, feu).` });
      }
    }
  }

  return out;
}
