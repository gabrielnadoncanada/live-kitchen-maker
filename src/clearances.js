// Marges et dégagements normalisés (m) — source unique. Chaque valeur n'existe
// qu'ici : kitchen.js (solveur), planEditor.js (drag) et openings.js (ouvertures)
// importent les mêmes constantes, sinon une position valide dans un éditeur
// devient invalide dans l'autre.

// ——— caissons vs ouvertures ———
export const DOOR_MARGIN = 0.07;      // jeu caissons/murales autour d'une porte
export const WIN_MARGIN = 0.05;       // jeu des colonnes pleine hauteur autour d'une fenêtre
export const UPPER_WIN_MARGIN = 0.08; // jeu des armoires murales autour d'une fenêtre

// ——— ouvertures entre elles (REQ-802) ———
export const OPENING_GAP = 0.06;      // jeu minimal entre deux fenêtres/portes
export const OPENING_EDGE = 0.08;     // marge d'une ouverture aux extrémités du mur

// ——— appareils déplaçables (vue plan) ———
export const FIXTURE_EDGE = 0.08;     // marge d'un appareil aux extrémités du mur

// ——— hotte (REQ-108 / REQ-1003) ———
// halfZone  : demi-emprise PHYSIQUE de la hotte (coupe du ruban de murales)
// halfClear : demi-DÉGAGEMENT exigé entre le centre de cuisson et une fenêtre
//             (emprise + coffrage + jeu de sécurité) — identique en placement
//             auto et en drag manuel
export const HOOD = {
  micro: { halfZone: 0.39, halfClear: 0.45 },
  cheminee: { halfZone: 0.5, halfClear: 0.55 },
};
export const hoodHalfZone = (t) => (HOOD[t] || HOOD.cheminee).halfZone;
export const hoodHalfClear = (t) => (HOOD[t] || HOOD.cheminee).halfClear;
// jeu visuel supplémentaire entre la hotte et le cadre d'une fenêtre — absorbe
// aussi l'arrondi au pas de 5 cm des positions persistées (round5 ≤ 2,5 cm)
export const HOOD_WIN_GAP = 0.05;
