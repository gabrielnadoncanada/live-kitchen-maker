// Devis PDF brandé aux couleurs du tenant — généré côté client avec jsPDF.
import { jsPDF } from 'jspdf';
import { getTenant, getTheme } from './tenant.js';
import { fmt } from './pricing.js';

const LAYOUT_LABELS = { lineaire: 'Linéaire', l: 'En L', u: 'En U', galley: 'Couloir' };

function hexRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function downloadQuotePdf(quote, state, contact, { image = null, shareUrl = null } = {}) {
  const tenant = getTenant();
  const theme = getTheme();
  const accent = hexRgb(tenant.accent);
  const night = theme ? hexRgb(theme.inkNight) : [28, 24, 20];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18;
  let y = 0;

  // bandeau d'en-tête
  doc.setFillColor(...night);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...accent);
  doc.rect(0, 34, W, 1.6, 'F');
  doc.setTextColor(244, 239, 230);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(tenant.name, M, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hexRgb(tenant.accentBright));
  doc.text('DEVIS PRÉLIMINAIRE', M, 23);
  doc.setTextColor(200, 195, 185);
  const now = new Date();
  const num = `AC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  doc.text(`No ${num} · ${now.toLocaleDateString('fr-CA')}`, W - M, 15, { align: 'right' });
  const contactBits = [tenant.contact.phone, tenant.contact.email, tenant.contact.web].filter(Boolean).join('  ·  ');
  if (contactBits) doc.text(contactBits, W - M, 23, { align: 'right' });
  y = 46;

  // client + projet
  doc.setTextColor(33, 29, 25);
  doc.setFontSize(10);
  if (contact) {
    doc.setFont('helvetica', 'bold');
    doc.text('Préparé pour', M, y);
    doc.setFont('helvetica', 'normal');
    const who = [contact.nom, contact.courriel, contact.telephone, contact.codePostal].filter(Boolean).join('  ·  ');
    doc.text(who, M + 32, y);
    y += 7;
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Projet', M, y);
  doc.setFont('helvetica', 'normal');
  const dims = [`mur principal ${state.dims.a.toFixed(2)} m`];
  if (state.layout === 'galley') dims.push(`profondeur ${Math.max(2.6, state.dims.b).toFixed(2)} m`);
  else if (state.layout !== 'lineaire') dims.push(`mur gauche ${state.dims.b.toFixed(2)} m`);
  if (state.layout === 'u') dims.push(`mur droit ${state.dims.c.toFixed(2)} m`);
  const islNote = state.island && state.layout !== 'galley'
    ? ((state.islandMode || 'libre') === 'peninsule' ? ' + péninsule' : ' + îlot') : '';
  doc.text(`Cuisine ${LAYOUT_LABELS[state.layout]}${islNote} — ${dims.join(', ')}`, M + 32, y);
  y += 6;

  // REQ-916 : vignette panoramique de la cuisine configurée (rendu 3D au moment du devis)
  if (image) {
    const iw = W - M * 2;
    const ih = iw * (750 / 2000);
    doc.addImage(image, 'JPEG', M, y, iw, ih, undefined, 'FAST');
    y += ih + 6;
  } else {
    y += 4;
  }

  const line = (name, value, { bold = false, small = false, indent = 0 } = {}) => {
    if (y > 272) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(small ? 8.5 : 9.5);
    doc.setTextColor(bold ? 20 : 55, bold ? 18 : 50, bold ? 16 : 45);
    doc.text(name, M + indent, y, { maxWidth: W - M * 2 - 40 });
    if (value != null) doc.text(value, W - M, y, { align: 'right' });
    y += small ? 4.6 : 5.4;
  };

  for (const g of quote.groups) {
    if (y > 262) { doc.addPage(); y = 20; }
    y += 2;
    doc.setFillColor(...accent);
    doc.rect(M, y - 3.4, 2.2, 2.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(g.title.toUpperCase(), M + 5, y - 1.6);
    y += 3.4;
    for (const l of g.lines) {
      line(l.detail ? `${l.name} — ${l.detail}` : l.name, l.value == null ? 'incl.' : fmt(l.value), { indent: 5 });
    }
  }

  y += 2;
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  y += 6;
  line(`Installation professionnelle (${Math.round(quote.installRate * 100)} %)`, fmt(quote.install));
  line('Livraison et manutention', fmt(quote.delivery));
  line('Sous-total', fmt(quote.subtotal), { bold: true });
  for (const t of quote.taxes) line(t.label, fmt(t.value), { small: true });
  y += 2;

  // total en encadré
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFillColor(...night);
  doc.roundedRect(M, y, W - M * 2, 16, 2, 2, 'F');
  doc.setTextColor(244, 239, 230);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', M + 6, y + 10);
  doc.setFontSize(15);
  doc.text(fmt(quote.total), W - M - 6, y + 10.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...hexRgb(tenant.accentBright));
  doc.text(`ou environ ${fmt(quote.monthly)}/mois sur ${quote.financingMonths} mois`, M + 6, y + 14.2);
  y += 24;

  // REQ-914 : le devis ramène vers le projet 3D — le client le rouvre et le modifie
  if (shareUrl) {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.setTextColor(...accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.textWithLink('▶  Rouvrir et modifier mon projet 3D en ligne', M, y, { url: shareUrl });
    y += 7;
  }

  doc.setTextColor(120, 112, 100);
  doc.setFontSize(7.5);
  const hasAppliances = Object.values(state.appliances).some(Boolean);
  const applianceNote = !tenant.business.sellAppliances && hasAppliances
    ? ' Les électroménagers illustrés servent à la planification et ne sont pas inclus au devis.'
    : '';
  doc.text(
    'Devis préliminaire généré à partir de votre configuration 3D. Prix indicatifs, sujets à une visite technique '
    + `et à la disponibilité des matériaux. Valide 30 jours.${applianceNote}`,
    M, y, { maxWidth: W - M * 2 }
  );

  doc.save(`devis-${tenant.key}-${num}.pdf`);
  return num;
}
