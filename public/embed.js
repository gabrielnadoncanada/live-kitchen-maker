/* Intégration du configurateur sur le site d'un client (marque blanche).
   Usage :
   <script src="https://VOTRE-DOMAINE/embed.js"
           data-client="cuisines-prestige"
           data-height="760px"></script> */
(function () {
  const s = document.currentScript;
  if (!s) return;
  const client = s.dataset.client || 'atelier-demo';
  const height = s.dataset.height || '720px';
  const base = s.src.replace(/embed\.js.*$/, '');
  const frame = document.createElement('iframe');
  frame.src = `${base}?client=${encodeURIComponent(client)}&embed=1`;
  frame.title = 'Configurateur de cuisine 3D';
  frame.loading = 'lazy';
  frame.allow = 'fullscreen';
  frame.style.cssText = `width:100%;height:${height};border:0;border-radius:18px;display:block;box-shadow:0 24px 60px -18px rgba(20,16,12,.35)`;
  s.parentNode.insertBefore(frame, s);
})();
