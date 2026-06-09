// Interface : panneau de configuration guidé, devis animé, popover d'édition de module.
import { state, setState, subscribe } from './state.js';
import {
  CABINET_FINISHES, COUNTERS, BACKSPLASHES, FLOORS, WALLS, HANDLES,
  APPLIANCES, APPLIANCE_FINISHES, PRESETS,
} from './catalog.js';
import { fmt } from './pricing.js';
import { getBusiness } from './tenant.js';
import { resolveOpeningPos, wallLenOf as wallLenShared } from './openings.js';

const updaters = [];
function refresh() { for (const u of updaters) u(state); }

// ——— rendu CSS d'un échantillon de matière ———
function swatchCSS(sw) {
  if (!sw || sw === 'none') {
    return 'background: repeating-linear-gradient(45deg,#eee,#eee 4px,#ccc 4px,#ccc 8px)';
  }
  if (sw === 'match') {
    return 'background: conic-gradient(from 45deg, #f1efe9 0 50%, var(--brass) 50% 100%)';
  }
  const [kind, hex] = sw.includes(':') ? sw.split(':') : ['flat', sw];
  switch (kind) {
    case 'wood':
      return `background: repeating-linear-gradient(90deg, ${hex}, ${shade(hex, -22)} 3px, ${hex} 6px, ${shade(hex, 14)} 11px)`;
    case 'marble':
      return `background: linear-gradient(135deg, ${hex} 0%, ${shade(hex, -18)} 38%, ${hex} 42%, ${hex} 70%, ${shade(hex, -12)} 88%, ${hex} 100%)`;
    case 'speckle':
      return `background-color:${hex}; background-image: radial-gradient(${shade(hex, 60)} 9%, transparent 10%), radial-gradient(${shade(hex, -40)} 9%, transparent 10%); background-size: 7px 7px, 5px 5px; background-position: 0 0, 3px 2px`;
    case 'tile':
      return `background-color:${shade(hex, -30)}; background-image: linear-gradient(${hex}, ${hex}); background-size: 86% 40%; background-repeat: repeat; background-position: 2px 2px`;
    default:
      return `background:${hex}`;
  }
}
function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const cl = (x) => Math.max(0, Math.min(255, x + amt));
  return `rgb(${cl(v >> 16 & 255)},${cl(v >> 8 & 255)},${cl(v & 255)})`;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function section(num, title, note = '') {
  return el(`<div class="sec">
    <div class="sec-head"><span class="sec-num">${num}</span><span class="sec-title">${title}</span></div>
    ${note ? `<div class="sec-note">${note}</div>` : ''}
  </div>`);
}

// ——— nuancier générique ———
function swatchGroup(label, entries, get, set, { priceKey = null, columns = 5 } = {}) {
  const wrap = document.createElement('div');
  const lab = el(`<div class="swatch-label"><span>${label}</span><em></em></div>`);
  const grid = el(`<div class="swatches" style="grid-template-columns: repeat(${columns}, 1fr)"></div>`);
  wrap.append(lab, grid);
  for (const [key, def] of Object.entries(entries)) {
    const btn = el(`<button class="swatch" data-k="${key}" style="${swatchCSS(def.swatch)}">
      <span class="swatch-tip">${def.label}${priceKey && def[priceKey] ? ` · ${fmt(def[priceKey])}/pi²` : ''}</span>
    </button>`);
    btn.addEventListener('click', () => set(key));
    grid.append(btn);
  }
  updaters.push((s) => {
    const cur = get(s);
    lab.querySelector('em').textContent = entries[cur] ? entries[cur].label : '';
    grid.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.k === cur));
  });
  return wrap;
}

function segmented(options, get, set) {
  const seg = el('<div class="seg"></div>');
  for (const [key, label] of options) {
    const b = el(`<button data-k="${key}">${label}</button>`);
    b.addEventListener('click', () => set(key));
    seg.append(b);
  }
  updaters.push((s) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.k === get(s)));
  });
  return seg;
}

function slider(label, min, max, get, set, fmtVal = (v) => `${v.toFixed(1)} m`) {
  const row = el(`<div class="slider-row">
    <div class="lab"><b>${label}</b><output></output></div>
    <input type="range" min="${min}" max="${max}" step="0.1" />
  </div>`);
  const input = row.querySelector('input');
  const out = row.querySelector('output');
  const paint = (v) => {
    out.textContent = fmtVal(v);
    input.style.setProperty('--fill', `${((v - input.min) / (input.max - input.min)) * 100}%`);
  };
  input.addEventListener('input', () => { paint(+input.value); set(+input.value); });
  updaters.push((s) => {
    const v = get(s);
    if (+input.value !== v) input.value = v;
    paint(v);
  });
  row._input = input;
  return row;
}

function switchRow(label, sub, get, set) {
  const row = el(`<div class="switch-row">
    <label>${label}${sub ? `<small>${sub}</small>` : ''}</label>
    <button class="switch" role="switch"></button>
  </div>`);
  const sw = row.querySelector('.switch');
  sw.addEventListener('click', () => set(!get(state)));
  updaters.push((s) => sw.classList.toggle('on', !!get(s)));
  return row;
}

// ————————————— contraintes de la pièce —————————————
const WALL_LABELS = { back: 'Mur principal', left: 'Mur gauche', right: 'Mur droit' };
const WALL_SHORT = { back: 'Principal', left: 'Gauche', right: 'Droit' };

function cabWallsOf(s) {
  return s.layout === 'u' ? ['back', 'left', 'right'] : s.layout === 'l' ? ['back', 'left'] : ['back'];
}
const wallLenOf = wallLenShared;

function wallChips(getWall, setWall, getAvail) {
  const wrap = el('<div class="chips"></div>');
  for (const k of ['back', 'left', 'right']) {
    const chip = el(`<button class="chip" data-k="${k}">${WALL_SHORT[k]}</button>`);
    chip.addEventListener('click', () => setWall(k));
    wrap.append(chip);
  }
  // synchronisation à la demande (pas d'updater global : les rangées sont reconstruites)
  wrap._sync = (s) => {
    const avail = getAvail(s);
    const cur = getWall(s);
    wrap.querySelectorAll('.chip').forEach((ch) => {
      ch.style.display = avail.includes(ch.dataset.k) ? '' : 'none';
      ch.classList.toggle('active', ch.dataset.k === cur);
    });
  };
  return wrap;
}

function miniSlider(label, min, max, step, get, set) {
  const row = el(`<div class="slider-row mini">
    <div class="lab"><b>${label}</b><output></output></div>
    <input type="range" min="${min}" max="${max}" step="${step}" />
  </div>`);
  const input = row.querySelector('input');
  const out = row.querySelector('output');
  const paint = (v) => {
    out.textContent = `${v.toFixed(2)} m`;
    const lo = +input.min, hi = +input.max;
    input.style.setProperty('--fill', `${((v - lo) / (hi - lo || 1)) * 100}%`);
  };
  input.addEventListener('input', () => { paint(+input.value); set(+input.value); });
  row._sync = (v, maxV) => {
    if (maxV != null && +input.max !== maxV) input.max = maxV;
    if (document.activeElement !== input && +input.value !== v) input.value = v;
    paint(v);
  };
  return row;
}

// entrée d'eau / prise de cuisinière : Auto ou position précise sur un mur à caissons
function fixtureControl(key, title, hint) {
  const wrap = el(`<div class="fixture">
    <div class="swatch-label"><span>${title}</span></div>
    <div class="sec-note" style="margin:0 0 10px">${hint}</div>
  </div>`);
  const get = () => state.constraints[key];
  const patch = (p) => setState({ constraints: { [key]: { ...get(), ...p } } });
  wrap.append(segmented(
    [['auto', 'Automatique'], ['manuel', 'Position précise']],
    (s) => (s.constraints[key].auto ? 'auto' : 'manuel'),
    (k) => patch({ auto: k === 'auto' })
  ));
  const detail = el('<div class="fixture-detail"></div>');
  const chips = wallChips(
    (s) => s.constraints[key].wall,
    (w) => patch({ wall: w, pos: Math.min(get().pos, wallLenOf(state, w) - 0.5) }),
    (s) => cabWallsOf(s)
  );
  detail.append(chips);
  const pos = miniSlider('Distance du coin', 0.5, 6, 0.05,
    (s) => s.constraints[key].pos, (v) => patch({ pos: v }));
  detail.append(pos);
  wrap.append(detail);
  updaters.push((s) => {
    detail.style.display = s.constraints[key].auto ? 'none' : '';
    chips._sync(s);
    pos._sync(s.constraints[key].pos, Math.max(1, wallLenOf(s, s.constraints[key].wall) - 0.4));
    if (!cabWallsOf(s).includes(s.constraints[key].wall) && !s.constraints[key].auto) {
      // mur disparu après changement de forme : retour au mur principal
      patch({ wall: 'back' });
    }
  });
  return wrap;
}

let openingSeq = 100;
function patchOpening(id, p) {
  setState({
    constraints: {
      openings: state.constraints.openings.map((o) => (o.id === id ? { ...o, ...p } : o)),
    },
  });
}

function openingsEditor(type, title, addLabel, widthMin, widthMax, defWidth, max) {
  const wrap = el(`<div class="fixture"><div class="swatch-label"><span>${title}</span></div></div>`);
  const list = el('<div></div>');
  const addBtn = el(`<button class="btn-add">+ ${addLabel}</button>`);
  wrap.append(list, addBtn);
  addBtn.addEventListener('click', () => {
    // premier emplacement libre parmi les murs, à partir du centre
    for (const wall of ['back', 'left', 'right']) {
      const pos = resolveOpeningPos(state, wall, defWidth, wallLenOf(state, wall) / 2);
      if (pos == null) continue;
      setState({
        constraints: {
          openings: [...state.constraints.openings, { id: ++openingSeq, type, wall, pos, width: defWidth }],
        },
      });
      return;
    }
  });
  let sig = null;
  let rowSync = [];
  function rebuild(items) {
    list.innerHTML = '';
    rowSync = [];
    items.forEach((o, idx) => {
      const row = el(`<div class="row-card">
        <div class="row-head">
          <b>${type === 'fenetre' ? 'Fenêtre' : 'Porte'} ${idx + 1}</b>
          <button class="row-del" aria-label="Retirer">✕</button>
        </div>
      </div>`);
      row.querySelector('.row-del').addEventListener('click', () => {
        setState({ constraints: { openings: state.constraints.openings.filter((x) => x.id !== o.id) } });
      });
      const find = (s) => s.constraints.openings.find((x) => x.id === o.id) || o;
      const chips = wallChips(
        (s) => find(s).wall,
        (w) => {
          const cur = find(state);
          const p = resolveOpeningPos(state, w, cur.width, cur.pos, o.id);
          if (p != null) patchOpening(o.id, { wall: w, pos: p }); // sinon : pas de place sur ce mur
        },
        () => ['back', 'left', 'right']
      );
      const pos = miniSlider('Position', 0.4, 6, 0.05, (s) => find(s).pos, (v) => {
        const cur = find(state);
        const p = resolveOpeningPos(state, cur.wall, cur.width, v, o.id);
        if (p != null) patchOpening(o.id, { pos: p });
      });
      const wid = miniSlider('Largeur', widthMin, widthMax, 0.05, (s) => find(s).width, (v) => {
        const cur = find(state);
        const p = resolveOpeningPos(state, cur.wall, v, cur.pos, o.id);
        if (p != null) patchOpening(o.id, { width: v, pos: p }); // l'élargissement s'arrête à la voisine
      });
      row.append(chips, pos, wid);
      list.append(row);
      rowSync.push((s) => {
        const cur = find(s);
        chips._sync(s);
        pos._sync(cur.pos, Math.max(1, wallLenOf(s, cur.wall) - 0.3));
        wid._sync(cur.width, null);
      });
    });
  }
  updaters.push((s) => {
    const items = s.constraints.openings.filter((o) => o.type === type);
    const ns = items.map((o) => o.id).join('|');
    if (ns !== sig) { sig = ns; rebuild(items); }
    rowSync.forEach((u) => u(s));
    addBtn.style.display = items.length >= max ? 'none' : '';
  });
  return wrap;
}

// ————————————— construction du panneau —————————————
export function buildPanel() {
  const root = document.getElementById('panelScroll');
  root.innerHTML = '';

  // 1 · FORME
  const s1 = section('01', 'La forme', 'Choisissez l’agencement — tout le reste s’adapte automatiquement.');
  const shapes = el('<div class="shape-grid"></div>');
  const shapeDefs = [
    ['lineaire', 'Linéaire', '<rect x="6" y="6" width="36" height="9" rx="2"/>'],
    ['l', 'En L', '<path d="M6 6h36v9H15v21H6z"/>'],
    ['u', 'En U', '<path d="M6 6h36v30h-9V15H15v21H6z"/>'],
  ];
  for (const [key, label, path] of shapeDefs) {
    const card = el(`<button class="shape-card" data-k="${key}">
      <svg width="48" height="42" viewBox="0 0 48 42" style="fill: rgba(var(--brass-rgb), .85)">${path}</svg>
      <span>${label}</span>
    </button>`);
    card.addEventListener('click', () => {
      const patch = { layout: key, preset: state.preset };
      // garde-fous dimensionnels selon la forme
      const minA = key === 'u' ? 4.3 : key === 'l' ? 3.4 : 3.6;
      if (state.dims.a < minA) patch.dims = { a: minA };
      setState(patch);
    });
    shapes.append(card);
  }
  updaters.push((s) => shapes.querySelectorAll('.shape-card').forEach((b) => b.classList.toggle('active', b.dataset.k === s.layout)));
  s1.append(shapes);
  s1.append(switchRow('Îlot central', 'Comptoir cascade + tabourets + suspensions', (s) => s.island, (v) => setState({ island: v })));
  root.append(s1);

  // 2 · DIMENSIONS
  const s2 = section('02', 'Les dimensions', 'Mesurez vos murs, glissez — c’est tout.');
  const slA = slider('Mur principal', 3.4, 6.4, (s) => s.dims.a, (v) => setState({ dims: { a: v } }));
  const slB = slider('Mur gauche', 2.7, 4.6, (s) => s.dims.b, (v) => setState({ dims: { b: v } }));
  const slC = slider('Mur droit', 2.6, 4.6, (s) => s.dims.c, (v) => setState({ dims: { c: v } }));
  s2.append(slA, slB, slC);
  updaters.push((s) => {
    slB.style.display = s.layout !== 'lineaire' ? '' : 'none';
    slC.style.display = s.layout === 'u' ? '' : 'none';
    slA._input.min = s.layout === 'u' ? 4.3 : 3.4;
  });
  root.append(s2);

  // 3 · VOTRE PIÈCE (contraintes réelles)
  const s2b = section('03', 'Votre pièce', 'Reproduisez la réalité : plomberie, fenêtres, portes. La cuisine se replanifie autour.');
  s2b.append(fixtureControl('water', 'Entrée d’eau (évier)', 'L’évier se place sur la plomberie existante.'));
  s2b.append(fixtureControl('stove', 'Prise de cuisinière (240 V)', 'La cuisinière et sa hotte suivent la prise.'));
  s2b.append(openingsEditor('fenetre', 'Fenêtres', 'Ajouter une fenêtre', 0.6, 2.4, 1.25, 3));
  s2b.append(openingsEditor('porte', 'Portes et passages', 'Ajouter une porte', 0.7, 1.8, 0.85, 2));
  root.append(s2b);

  // 4 · STYLE
  const s3 = section('04', 'Le style', 'Une ambiance complète en un clic. Personnalisez ensuite chaque détail.');
  const presets = el('<div class="preset-grid"></div>');
  for (const [key, p] of Object.entries(PRESETS)) {
    const card = el(`<button class="preset-card" data-k="${key}">
      <span class="preset-strip">${p.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <span>${p.label}</span>
    </button>`);
    card.addEventListener('click', () => {
      const ap = p.apply;
      setState({
        preset: key, cabinetFinish: ap.cabinetFinish, islandFinish: ap.islandFinish,
        doorStyle: ap.doorStyle, handle: ap.handle, counter: ap.counter,
        backsplash: ap.backsplash, floor: ap.floor, wall: ap.wall,
      });
    });
    presets.append(card);
  }
  updaters.push((s) => presets.querySelectorAll('.preset-card').forEach((b) => b.classList.toggle('active', b.dataset.k === s.preset)));
  s3.append(presets);
  root.append(s3);

  // 5 · ARMOIRES
  const s4 = section('05', 'Les armoires');
  s4.append(segmented([['plate', 'Façade plane'], ['shaker', 'Façade shaker']], (s) => s.doorStyle, (k) => setState({ doorStyle: k, preset: null })));
  s4.append(swatchGroup('Finition des armoires', CABINET_FINISHES, (s) => s.cabinetFinish, (k) => setState({ cabinetFinish: k, preset: null })));
  const islSw = swatchGroup('Finition de l’îlot', CABINET_FINISHES, (s) => s.islandFinish || s.cabinetFinish, (k) => setState({ islandFinish: k, preset: null }));
  s4.append(islSw);
  updaters.push((s) => { islSw.style.display = s.island ? '' : 'none'; });
  s4.append(swatchGroup('Poignées', HANDLES, (s) => s.handle, (k) => setState({ handle: k, preset: null }), { columns: 4 }));
  root.append(s4);

  // 6 · SURFACES
  const s5 = section('06', 'Les surfaces');
  s5.append(swatchGroup('Comptoir', COUNTERS, (s) => s.counter, (k) => setState({ counter: k, preset: null }), { priceKey: 'price' }));
  s5.append(swatchGroup('Dosseret', BACKSPLASHES, (s) => s.backsplash, (k) => setState({ backsplash: k, preset: null }), { priceKey: 'price' }));
  s5.append(swatchGroup('Plancher', FLOORS, (s) => s.floor, (k) => setState({ floor: k, preset: null }), { priceKey: 'price', columns: 4 }));
  s5.append(swatchGroup('Murs', WALLS, (s) => s.wall, (k) => setState({ wall: k, preset: null })));
  root.append(s5);

  // 7 · ÉLECTROMÉNAGERS
  const selling = getBusiness().sellAppliances;
  const s6 = section('07', 'Les électroménagers',
    selling ? '' : 'Pour planifier votre aménagement — non inclus au devis.');
  s6.append(segmented(
    Object.entries(APPLIANCE_FINISHES).map(([k, v]) => [k, v.label]),
    (s) => s.applianceFinish, (k) => setState({ applianceFinish: k })
  ));
  for (const [key, def] of Object.entries(APPLIANCES)) {
    const row = el(`<div class="opt-row">
      <div><div class="opt-name">${def.label}</div>${selling ? `<div class="opt-price">${fmt(def.price)}</div>` : ''}</div>
      <button class="switch" role="switch"></button>
    </div>`);
    const sw = row.querySelector('.switch');
    sw.addEventListener('click', () => setState({ appliances: { [key]: !state.appliances[key] } }));
    updaters.push((s) => sw.classList.toggle('on', !!s.appliances[key]));
    s6.append(row);
  }
  root.append(s6);

  refresh();
  subscribe(() => refresh());
}

export function syncPanel() { refresh(); }

// ————————————— devis —————————————
let lastTotal = 0;
let countAnim = null;

export function renderQuote(q) {
  const lines = document.getElementById('quoteLines');
  let html = '';
  for (const g of q.groups) {
    html += `<div class="qgroup">${g.title}</div>`;
    for (const l of g.lines) {
      html += `<div class="qline">
        <span class="n">${l.name}${l.detail ? ` <small>· ${l.detail}</small>` : ''}</span>
        <span class="v">${l.value == null ? 'incl.' : fmt(l.value)}</span>
      </div>`;
    }
  }
  html += `<div class="qgroup">Services</div>
    <div class="qline"><span class="n">Installation professionnelle <small>· ${Math.round(q.installRate * 100)} %</small></span><span class="v">${fmt(q.install)}</span></div>
    <div class="qline"><span class="n">Livraison et manutention</span><span class="v">${fmt(q.delivery)}</span></div>
    <div class="qline sub"><span class="n">Sous-total</span><span class="v">${fmt(q.subtotal)}</span></div>`;
  for (const t of q.taxes) {
    html += `<div class="qline tax"><span class="n">${t.label}</span><span class="v">${fmt(t.value)}</span></div>`;
  }
  lines.innerHTML = html;

  // total animé
  const totalEl = document.getElementById('quoteTotal');
  const monthlyEl = document.getElementById('quoteMonthly');
  monthlyEl.innerHTML = `ou environ <b>${fmt(q.monthly)}/mois</b> sur ${q.financingMonths} mois`;
  const from = lastTotal, to = q.total;
  lastTotal = to;
  if (countAnim) cancelAnimationFrame(countAnim);
  if (Math.abs(to - from) < 1) { totalEl.textContent = fmt(to); return; }
  totalEl.classList.remove('bump');
  void totalEl.offsetWidth;
  totalEl.classList.add('bump');
  const t0 = performance.now(), dur = 450;
  const step = (t) => {
    const f = Math.min((t - t0) / dur, 1);
    const e = 1 - Math.pow(1 - f, 3);
    totalEl.textContent = fmt(from + (to - from) * e);
    if (f < 1) countAnim = requestAnimationFrame(step);
  };
  countAnim = requestAnimationFrame(step);
}

// ————————————— popover module —————————————
const MODULE_TYPES = [
  ['portes', 'Portes', '▢▢'],
  ['tiroirs', 'Tiroirs', '☰'],
  ['ouvert', 'Niche ouverte', '▤'],
];

export function showPopover(x, y, moduleId, current, width) {
  const pop = document.getElementById('popover');
  const opts = document.getElementById('popoverOpts');
  document.getElementById('popoverTitle').textContent = `Caisson · ${Math.round(width * 100)} cm`;
  opts.innerHTML = '';
  for (const [key, label, ico] of MODULE_TYPES) {
    const b = el(`<button class="${key === current ? 'active' : ''}"><span class="ico">${ico}</span>${label}</button>`);
    b.addEventListener('click', () => {
      setState({ moduleOverrides: { [moduleId]: key } });
      hidePopover();
    });
    opts.append(b);
  }
  pop.hidden = false;
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8)}px`;
  pop.style.top = `${Math.min(Math.max(8, y - r.height - 18), window.innerHeight - r.height - 8)}px`;
}

export function hidePopover() {
  document.getElementById('popover').hidden = true;
}

// ————————————— recommandations NKBA (validateur doux) —————————————
export function renderNkba(warnings) {
  let chip = document.getElementById('nkbaChip');
  if (!chip) {
    chip = el(`<div id="nkbaChip" class="nkba-chip" hidden>
      <button class="nkba-head"></button>
      <div class="nkba-list" hidden></div>
    </div>`);
    document.getElementById('app').appendChild(chip);
    chip.querySelector('.nkba-head').addEventListener('click', () => {
      const l = chip.querySelector('.nkba-list');
      l.hidden = !l.hidden;
    });
  }
  chip.hidden = warnings.length === 0;
  if (!warnings.length) return;
  chip.querySelector('.nkba-head').textContent =
    `⚠ ${warnings.length} recommandation${warnings.length > 1 ? 's' : ''} d'ergonomie`;
  chip.querySelector('.nkba-list').innerHTML = warnings
    .map((w) => `<div class="nkba-item"><b>${w.id}</b> ${w.msg}</div>`)
    .join('');
}

// menu contextuel générique (utilisé par l'éditeur de plan)
export function showMenu(x, y, title, options) {
  const pop = document.getElementById('popover');
  const opts = document.getElementById('popoverOpts');
  document.getElementById('popoverTitle').textContent = title;
  opts.innerHTML = '';
  for (const o of options) {
    const b = el(`<button><span class="ico">${o.ico || ''}</span>${o.label}</button>`);
    b.addEventListener('click', () => {
      hidePopover();
      o.onPick();
    });
    opts.append(b);
  }
  pop.hidden = false;
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8)}px`;
  pop.style.top = `${Math.min(Math.max(8, y - r.height - 18), window.innerHeight - r.height - 8)}px`;
}
