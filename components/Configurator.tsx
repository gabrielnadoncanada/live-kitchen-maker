'use client';

import { useEffect, type CSSProperties } from 'react';

// Le moteur (Three.js, planificateur, devis, plan/élévation) est en modules ES
// vanilla — React ne fait que rendre le balisage initial puis lui passe la main.
// Le balisage ci-dessous n'est jamais re-rendu : toute mutation vient du moteur.
export default function Configurator() {
  useEffect(() => {
    let disposed = false;
    import('../src/main.js').then((m) => {
      if (!disposed) m.initApp();
    });
    return () => {
      disposed = true;
    };
  }, []);

  const d = (delay: string): CSSProperties => ({ ['--d' as never]: delay } as CSSProperties);

  return (
    <>
      {/* ÉCRAN D'ACCUEIL */}
      <div id="splash" className="splash">
        <div className="splash-inner">
          <div className="splash-kicker reveal" style={d('.1s')}>
            Atelier Cuisine · Studio 3D
          </div>
          <h1 className="splash-title">
            <span className="reveal" style={d('.25s')}>
              Votre cuisine de rêve,
            </span>
            <span className="reveal splash-em" style={d('.45s')}>
              visible avant d&apos;exister.
            </span>
          </h1>
          <p className="splash-sub reveal" style={d('.65s')}>
            Choisissez une forme, glissez quelques curseurs, touchez les matières. Le rendu 3D et
            le prix se mettent à jour instantanément — aucune connaissance requise.
          </p>
          <button id="startBtn" className="btn-primary reveal" style={d('.85s')}>
            Commencer ma cuisine
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="splash-steps reveal" style={d('1.05s')}>
            <div>
              <b>1</b> La forme
            </div>
            <i></i>
            <div>
              <b>2</b> Les matières
            </div>
            <i></i>
            <div>
              <b>3</b> Le devis
            </div>
          </div>
        </div>
        <div className="splash-grain"></div>
      </div>

      {/* APPLICATION */}
      <div id="app" className="app" aria-hidden="true">
        <canvas id="scene"></canvas>

        {/* Barre supérieure */}
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark"></span>
            <span className="brand-name">
              Atelier <em>Cuisine</em>
            </span>
          </div>
          <nav className="views" id="viewBtns">
            <button data-view="ensemble" className="active">
              Vue 3D
            </button>
            <button data-view="plan">Plan</button>
            <button data-view="detail">Détail</button>
          </nav>
          <div className="topbar-right">
            <span className="hint-chip">💡 Cliquez sur un meuble pour le modifier</span>
          </div>
        </header>

        {/* Panneau de configuration (gauche) */}
        <aside className="panel" id="panel">
          <div className="panel-scroll" id="panelScroll"></div>
        </aside>

        {/* Devis en direct (droite) */}
        <aside className="quote" id="quote">
          <div className="quote-head">
            <div>
              <div className="quote-label">Devis en direct</div>
              <div className="quote-total" id="quoteTotal">
                0&nbsp;$
              </div>
              <div className="quote-monthly" id="quoteMonthly"></div>
            </div>
            <button className="quote-toggle" id="quoteToggle" aria-label="Détails du devis">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="quote-body" id="quoteBody">
            <div id="quoteLines"></div>
            <div className="quote-foot">
              <button className="btn-ghost" id="printBtn">
                Imprimer le devis
              </button>
            </div>
          </div>
        </aside>

        {/* Popover d'édition de module */}
        <div className="popover" id="popover" hidden>
          <div className="popover-title" id="popoverTitle">
            Caisson
          </div>
          <div className="popover-opts" id="popoverOpts"></div>
        </div>

        <div className="loadveil" id="loadveil">
          <span></span>
        </div>
      </div>
    </>
  );
}
