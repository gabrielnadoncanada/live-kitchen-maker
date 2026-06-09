// Intégrité géométrique des ouvertures (REQ-802) : deux fenêtres/portes ne peuvent
// jamais se chevaucher sur un même mur. Toutes les voies de modification (drag en vue
// plan/élévation, curseurs de la sidebar, menus d'ajout) passent par resolveOpeningPos.

export function wallLenOf(s, wall) {
  if (wall === 'back') return s.dims.a;
  if (wall === 'left') return s.layout !== 'lineaire' ? s.dims.b : 3.5;
  return s.layout === 'u' ? s.dims.c : 3.5;
}

const GAP = 0.06;          // jeu minimal entre deux ouvertures
const EDGE = 0.08;         // marge aux extrémités du mur
const round5 = (v) => Math.round(v * 20) / 20;

// Retourne la position valide la plus proche du souhait, ou null s'il n'y a pas de place.
export function resolveOpeningPos(s, wall, width, desired, excludeId = null) {
  const len = wallLenOf(s, wall);
  const lo = width / 2 + EDGE;
  const hi = Math.max(lo, len - width / 2 - EDGE);
  let pos = Math.min(Math.max(desired, lo), hi);
  const others = s.constraints.openings.filter((o) => o.wall === wall && o.id !== excludeId);
  // epsilon : un candidat posé exactement « bord à bord » ne doit pas se rejeter lui-même
  const overlaps = (o, p) => Math.abs(o.pos - p) < (o.width + width) / 2 + GAP - 1e-6;
  // n'arrondit au pas de 5 cm que si l'arrondi ne recrée pas un chevauchement
  const finish = (p) => {
    const r = round5(p);
    return others.some((o) => overlaps(o, r)) ? p : r;
  };
  for (let i = 0; i < 6; i++) {
    const hit = others.find((o) => overlaps(o, pos));
    if (!hit) return finish(pos);
    const left = hit.pos - (hit.width + width) / 2 - GAP;
    const right = hit.pos + (hit.width + width) / 2 + GAP;
    const cands = [left, right]
      .filter((c) => c >= lo && c <= hi)
      .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
    if (!cands.length) return null;
    pos = cands[0];
  }
  return others.some((o) => overlaps(o, pos)) ? null : finish(pos);
}
