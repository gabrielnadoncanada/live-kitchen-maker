// Multi-tenant (marque blanche) : charge la configuration d'une entreprise cliente
// (?client=cle ou data-attribute en mode embed), applique son branding, filtre son
// catalogue et surcharge ses prix. Le configurateur reste identique — seules les
// données changent.
import {
  CABINET_FINISHES, COUNTERS, BACKSPLASHES, FLOORS, HANDLES,
  APPLIANCES, MODULE_PRICES, PRESETS,
} from './catalog.js';

const DEFAULTS = {
  key: 'atelier-demo',
  name: 'Atelier Cuisine',
  nameAccent: 'Cuisine',
  tagline: 'Atelier Cuisine · Studio 3D',
  accent: '#b08d57',
  accentBright: '#d4ab6a',
  contact: { phone: '', email: '', web: '' },
  // 'neutral' (défaut) : chrome gris neutre, l'accent du client est réservé aux actions —
  // résultat sûr pour n'importe quelle couleur de marque.
  // 'tinted' : tout le thème (surfaces sombres, papier) est dérivé de la teinte de l'accent —
  // opt-in pour les marques où ça flatte (verts profonds, bleus, terres).
  theming: 'neutral',
  business: {
    priceMultiplier: 1.0,
    installRate: 0.15,
    delivery: 295,
    // les électroménagers servent à la planification 3D ; ils ne sont facturés
    // que si le cuisiniste en vend (rare)
    sellAppliances: false,
    taxes: [
      { label: 'TPS (5 %)', rate: 0.05 },
      { label: 'TVQ (9,975 %)', rate: 0.09975 },
    ],
    financingMonths: 60,
    financingFactor: 1.045,
  },
  leadCapture: true,
  catalog: { disable: {}, priceOverrides: {} },
};

let tenant = { ...DEFAULTS };

export function getTenant() { return tenant; }
export function getBusiness() { return tenant.business; }

export async function loadTenant() {
  const params = new URLSearchParams(location.search);
  const key = (params.get('client') || 'atelier-demo').replace(/[^a-z0-9-]/gi, '');
  try {
    const res = await fetch(`/tenants/${key}.json`);
    if (res.ok) {
      const data = await res.json();
      tenant = {
        ...DEFAULTS,
        ...data,
        contact: { ...DEFAULTS.contact, ...(data.contact || {}) },
        business: { ...DEFAULTS.business, ...(data.business || {}) },
        catalog: { disable: {}, priceOverrides: {}, ...(data.catalog || {}) },
      };
    }
  } catch { /* client inconnu : configuration par défaut */ }
  applyCatalog();
  applyBranding();
  return tenant;
}

// ——— catalogue : retraits + surcharges + multiplicateur global ———
const CATALOG_MAP = {
  cabinetFinishes: CABINET_FINISHES,
  counters: COUNTERS,
  backsplashes: BACKSPLASHES,
  floors: FLOORS,
  handles: HANDLES,
};

function applyCatalog() {
  const { disable = {}, priceOverrides = {} } = tenant.catalog;
  for (const [group, keys] of Object.entries(disable)) {
    const target = CATALOG_MAP[group];
    if (!target) continue;
    for (const k of keys) delete target[k];
  }
  for (const [group, prices] of Object.entries(priceOverrides)) {
    const target = group === 'modules' ? MODULE_PRICES : group === 'appliances' ? APPLIANCES : CATALOG_MAP[group];
    if (!target) continue;
    for (const [k, price] of Object.entries(prices)) {
      if (target[k]) target[k].price = price;
    }
  }
  const mult = tenant.business.priceMultiplier;
  if (mult !== 1) {
    for (const def of Object.values(MODULE_PRICES)) def.price = Math.round(def.price * mult);
    for (const group of [COUNTERS, BACKSPLASHES, FLOORS, HANDLES]) {
      for (const def of Object.values(group)) def.price = Math.round(def.price * mult * 100) / 100;
    }
    for (const def of Object.values(APPLIANCES)) def.price = Math.round(def.price * mult);
  }
  // un préréglage qui référence une finition retirée disparaît
  for (const [k, p] of Object.entries(PRESETS)) {
    const a = p.apply;
    const ok = CABINET_FINISHES[a.cabinetFinish] && CABINET_FINISHES[a.islandFinish]
      && COUNTERS[a.counter] && BACKSPLASHES[a.backsplash] && FLOORS[a.floor] && HANDLES[a.handle];
    if (!ok) delete PRESETS[k];
  }
}

// ——— branding : couleurs d'accent + textes ———
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
}

function hueOf(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

function hslHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Thème de l'interface. Deux modes :
// — neutral : palette grise fixe, sûre pour toute marque ; l'accent ne colore que les actions
//   (boutons, états actifs, sélections, total du devis, marqueurs du plan, PDF).
// — tinted : surfaces sombres, papier et encres dérivés de la teinte de l'accent.
let theme = null;
export function getTheme() { return theme; }

const NEUTRAL_THEME = {
  inkAbyss: '#0c0c0d',
  inkDeep: '#111113',
  inkNight: '#19191c',
  inkRaised: '#242428',
  ink: '#1d1d20',
  paper: '#f5f5f3',
  paper2: '#ebebe9',
};

function computeTheme() {
  if (tenant.theming === 'tinted') {
    const h = hueOf(tenant.accent);
    theme = {
      inkAbyss: hslHex(h, 0.20, 0.05),
      inkDeep: hslHex(h, 0.18, 0.07),
      inkNight: hslHex(h, 0.16, 0.10),
      inkRaised: hslHex(h, 0.14, 0.15),
      ink: hslHex(h, 0.14, 0.12),
      paper: hslHex(h, 0.38, 0.93),
      paper2: hslHex(h, 0.33, 0.89),
    };
  } else {
    theme = { ...NEUTRAL_THEME };
  }
  theme.spriteBg = `rgba(${hexToRgb(theme.inkNight)}, 0.88)`;
  theme.spriteFg = theme.paper;
}

function applyBranding() {
  computeTheme();
  const root = document.documentElement;
  root.style.setProperty('--brass', tenant.accent);
  root.style.setProperty('--brass-bright', tenant.accentBright);
  // canaux RGB pour toutes les déclinaisons translucides (ombres, bordures, fonds)
  root.style.setProperty('--brass-rgb', hexToRgb(tenant.accent));
  root.style.setProperty('--brass-bright-rgb', hexToRgb(tenant.accentBright));
  // surfaces et encres teintées
  root.style.setProperty('--ink-abyss', theme.inkAbyss);
  root.style.setProperty('--ink-deep', theme.inkDeep);
  root.style.setProperty('--ink-deep-rgb', hexToRgb(theme.inkDeep));
  root.style.setProperty('--ink-night', theme.inkNight);
  root.style.setProperty('--ink-night-rgb', hexToRgb(theme.inkNight));
  root.style.setProperty('--ink-raised', theme.inkRaised);
  root.style.setProperty('--ink', theme.ink);
  root.style.setProperty('--ink-rgb', hexToRgb(theme.ink));
  root.style.setProperty('--paper', theme.paper);
  root.style.setProperty('--paper-rgb', hexToRgb(theme.paper));
  root.style.setProperty('--paper-2', theme.paper2);
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    const base = tenant.name.replace(tenant.nameAccent, '').trim();
    brandName.innerHTML = `${escapeHtml(base)} <em>${escapeHtml(tenant.nameAccent)}</em>`;
  }
  const kicker = document.querySelector('.splash-kicker');
  if (kicker) kicker.textContent = tenant.tagline;
  document.title = `${tenant.name} — Concevez votre cuisine de rêve en 3D`;
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) {
    fav.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='14' width='24' height='14' rx='1.5' fill='%23${tenant.accent.slice(1)}'/><rect x='4' y='10' width='24' height='3' rx='1' fill='%23e9e2d4'/><rect x='9' y='2' width='14' height='6' rx='1' fill='%232a2724'/></svg>`;
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
