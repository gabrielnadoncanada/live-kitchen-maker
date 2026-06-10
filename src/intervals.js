// Arithmétique d'intervalles 1D le long d'un mur — source unique pour tous les
// calculs de segments libres, zones interdites et snapping (caissons, murales,
// hotte, ouvertures). Toute comparaison passe par EPS : deux bords « égaux » à
// un bruit flottant près ne doivent jamais créer de micro-segment fantôme.

export const EPS = 1e-4;     // tolérance flottante (0,1 mm)
export const SLIVER = 0.001; // en dessous, un segment résiduel est du bruit de coupe

// retranche [c0,c1] d'une liste d'intervalles [[s0,s1], …]
// minLen : longueur minimale d'un résidu (0 pour conserver les intervalles-points,
// utile quand les intervalles représentent des centres admissibles)
export function cut(intervals, c0, c1, minLen = SLIVER) {
  return intervals.flatMap(([s0, s1]) => {
    if (c1 <= s0 + EPS || c0 >= s1 - EPS) return [[s0, s1]];
    const out = [];
    // un résidu n'existe que s'il est réellement HORS de [c0,c1] — sinon un
    // intervalle dégénéré [s0,s0] apparaîtrait en plein dans la zone retranchée
    if (c0 >= s0 - EPS && Math.min(s1, c0) - s0 >= minLen - EPS) out.push([s0, Math.min(s1, c0)]);
    if (c1 <= s1 + EPS && s1 - Math.max(s0, c1) >= minLen - EPS) out.push([Math.max(s0, c1), s1]);
    return out;
  });
}

// point des intervalles le plus proche de x (null si la liste est vide)
export function nearestIn(intervals, x) {
  let best = null, bestD = Infinity;
  for (const [s0, s1] of intervals) {
    const c = Math.min(Math.max(x, s0), s1);
    const d = Math.abs(c - x);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// vrai si [a0,a1] et [b0,b1] se chevauchent réellement (un simple contact
// bord à bord, à la tolérance près, n'est pas un chevauchement)
export function overlaps1D(a0, a1, b0, b1, tol = EPS) {
  return a0 < b1 - tol && b0 < a1 - tol;
}
