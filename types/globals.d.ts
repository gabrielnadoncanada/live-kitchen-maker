// Importations CSS à effet de bord (feuille globale du configurateur)
declare module '*.css';

// Accroches de debug exposées en développement (tests E2E)
interface Window {
  __planEd?: {
    _snap: () => void;
    _screens: () => Array<Record<string, unknown> & { x: number; y: number }>;
    _enterElevation: (wall: 'back' | 'left' | 'right') => void;
  };
  __dbg?: { ctx: unknown; getCurrent: () => unknown };
}
