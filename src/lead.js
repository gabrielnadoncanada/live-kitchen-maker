// Capture de lead : avant de remettre le devis PDF, le visiteur laisse ses coordonnées.
// C'est la proposition de valeur du SaaS — chaque devis généré = un lead qualifié
// (configuration complète + budget connu) livré au cuisiniste.
import { getTenant } from './tenant.js';

const API_URL = 'api/lead.php';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let modal = null;

function buildModal() {
  modal = el(`<div class="lead-overlay" hidden>
    <div class="lead-modal" role="dialog" aria-modal="true">
      <button class="lead-close" aria-label="Fermer">✕</button>
      <div class="lead-kicker">Votre devis est prêt</div>
      <h2 class="lead-title">Recevez votre devis détaillé</h2>
      <p class="lead-sub">Vos coordonnées nous permettent de vous remettre le PDF et de garder votre projet 3D pour votre rendez-vous.</p>
      <form class="lead-form" novalidate>
        <div class="lead-grid">
          <label>Prénom et nom<input name="nom" type="text" required autocomplete="name" placeholder="Marie Tremblay" /></label>
          <label>Courriel<input name="courriel" type="email" required autocomplete="email" placeholder="marie@exemple.ca" /></label>
          <label>Téléphone<input name="telephone" type="tel" autocomplete="tel" placeholder="514 555-0123" /></label>
          <label>Code postal<input name="codePostal" type="text" autocomplete="postal-code" placeholder="H2X 1Y4" /></label>
        </div>
        <label class="lead-full">Horizon du projet
          <select name="horizon">
            <option value="moins-3-mois">Moins de 3 mois</option>
            <option value="3-6-mois" selected>3 à 6 mois</option>
            <option value="plus-tard">Plus tard / je magasine</option>
          </select>
        </label>
        <div class="lead-error" hidden></div>
        <button type="submit" class="btn-primary lead-submit">
          Télécharger mon devis PDF
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 -4-4m4 4 4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="lead-privacy">Aucune infolettre sans votre accord. Vos informations servent uniquement à votre projet.</div>
      </form>
    </div>
  </div>`);
  document.body.appendChild(modal);
  modal.querySelector('.lead-close').addEventListener('click', closeModal);
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); });
  return modal;
}

function closeModal() {
  if (modal) modal.hidden = true;
}

function alreadyCaptured() {
  try { return sessionStorage.getItem('lead-captured') === '1'; } catch { return false; }
}

function markCaptured() {
  try { sessionStorage.setItem('lead-captured', '1'); } catch { /* navigation privée */ }
}

async function sendLead(payload) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch {
    // hors-ligne / API absente (dev) : le lead est conservé localement,
    // jamais au prix de bloquer le visiteur
    try {
      const queue = JSON.parse(localStorage.getItem('leads-pending') || '[]');
      queue.push(payload);
      localStorage.setItem('leads-pending', JSON.stringify(queue));
    } catch { /* tant pis */ }
    return false;
  }
}

// Ouvre la capture si nécessaire, puis résout avec les infos du contact (ou null si déjà capturé).
export function captureLead(getPayload) {
  const tenant = getTenant();
  return new Promise((resolve) => {
    if (!tenant.leadCapture || alreadyCaptured()) {
      resolve(null);
      return;
    }
    if (!modal) buildModal();
    const form = modal.querySelector('form');
    const errBox = modal.querySelector('.lead-error');
    errBox.hidden = true;
    modal.hidden = false;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.nom.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.courriel)) {
        errBox.textContent = 'Veuillez indiquer votre nom et un courriel valide.';
        errBox.hidden = false;
        return;
      }
      const submitBtn = form.querySelector('.lead-submit');
      submitBtn.disabled = true;
      const payload = {
        client: tenant.key,
        contact: data,
        date: new Date().toISOString(),
        ...getPayload(),
      };
      await sendLead(payload);
      markCaptured();
      submitBtn.disabled = false;
      closeModal();
      resolve(data);
    };
  });
}
