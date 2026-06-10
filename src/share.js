// REQ-914 : sauvegarde et partage de la configuration par lien — la configuration
// complète vit dans l'URL (?c=...), aucun serveur requis. Le client revient sur son
// projet, le vendeur le rouvre au rendez-vous, et chaque lead inclut le lien.
import { state, setState } from './state.js';

// base64url sûr pour l'unicode (les libellés d'état restent en ASCII, mais on ne parie pas)
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildShareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('c', b64encode(JSON.stringify(state)));
  return url.toString();
}

// Applique la configuration portée par l'URL (si présente). Appelé au démarrage,
// avant la première construction — les clés inconnues des vieilles versions sont
// ignorées par le deep-merge, les clés manquantes gardent leur valeur par défaut.
export function applySharedConfig() {
  try {
    const c = new URL(window.location.href).searchParams.get('c');
    if (!c) return false;
    const cfg = JSON.parse(b64decode(c));
    if (!cfg || typeof cfg !== 'object' || !cfg.dims) return false;
    setState(cfg);
    return true;
  } catch {
    return false;
  }
}
