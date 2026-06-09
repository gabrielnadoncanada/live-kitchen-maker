import { defineConfig } from 'vite';

export default defineConfig({
  // chemins relatifs : le dossier dist/ peut être servi tel quel (Laragon, sous-dossier, etc.)
  base: './',
  build: {
    // top-level await (chargement du tenant) requiert es2022+
    target: 'es2022',
  },
});
