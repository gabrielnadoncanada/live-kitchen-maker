// Correspondance entre les pièces générées et les produits réels du catalogue
// Dilamco (REQ-705). La grille src/data/dilamcoPrices.json est extraite de
// catalog.xlsx par scripts/extract-prices.mjs (prix Blanc Pur = base ; les
// multiplicateurs de finition du tenant s'appliquent par-dessus).
import PRICES from './data/dilamcoPrices.json';

export const IN = 0.0254;

// famille → entrée unique { sku, price } ou table { largeurPo: { sku, price } }
export function findSku(family, widthIn = null) {
  const table = PRICES[family];
  if (!table) return null;
  if (table.sku) return { ...table };
  const keys = Object.keys(table).map(Number);
  if (!keys.length || widthIn == null) return null;
  const w = keys.includes(widthIn)
    ? widthIn
    : keys.reduce((b, k) => (Math.abs(k - widthIn) < Math.abs(b - widthIn) ? k : b));
  return { ...table[w], widthIn: w };
}

// largeur de filler catalogue (1½ / 3 / 6 po) couvrant un reste donné
export function fillerSku(widthIn) {
  const w = widthIn <= 1.5 ? 1.5 : widthIn <= 3 ? 3 : 6;
  return findSku('filler', w);
}
