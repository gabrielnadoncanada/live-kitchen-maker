// Textures procédurales générées sur canvas — aucune ressource externe.
// Chaque fabrique retourne { map, bumpMap?, roughnessMap? } prêtes pour MeshPhysicalMaterial.
import * as THREE from 'three';

const cache = new Map();

function canvas(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Bruit fractal simple basé sur valeurs aléatoires lissées
function noiseGrid(n, rng) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x) % n, yi = Math.floor(y) % n;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const s = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));
    const i = (xx, yy) => g[((yy % n + n) % n) * n + ((xx % n + n) % n)];
    return s(s(i(xi, yi), i(xi + 1, yi), xf), s(i(xi, yi + 1), i(xi + 1, yi + 1), xf), yf);
  };
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ———— BOIS (armoires, plancher, boucher) ————
export function woodTexture({ base = '#9a6b42', dark = '#6e4527', light = '#b98a5c', seed = 7, ringScale = 38, vertical = true } = {}) {
  const key = `wood|${base}|${dark}|${light}|${seed}|${ringScale}|${vertical}`;
  if (cache.has(key)) return cache.get(key);
  const rng = mulberry(seed);
  const noise = noiseGrid(64, rng);
  const S = 1024;
  const [c, ctx] = canvas(S);
  const [cb, ctxB] = canvas(S);
  const img = ctx.createImageData(S, S);
  const imgB = ctxB.createImageData(S, S);
  const cBase = hex(base), cDark = hex(dark), cLight = hex(light);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = vertical ? x : y, v = vertical ? y : x;
      // veinage : ondulation légère du grain le long de la planche
      const wob = noise(u / 90, v / 260) * 5 + noise(u / 22, v / 70) * 1.6;
      const ring = Math.sin((u + wob) / S * Math.PI * ringScale + noise(u / 200, v / 200) * 1.4);
      const fine = noise(u / 3, v / 110) * 0.26;
      let t = ring * 0.5 + 0.5;
      t = Math.pow(t, 1.6) + fine - 0.15;
      const f = Math.max(0, Math.min(1, t));
      const r = lerp3(cDark, cBase, cLight, f);
      const i = (y * S + x) * 4;
      img.data[i] = r[0]; img.data[i + 1] = r[1]; img.data[i + 2] = r[2]; img.data[i + 3] = 255;
      const b = 120 + (f - 0.5) * 140 + (rng() - 0.5) * 14;
      imgB.data[i] = imgB.data[i + 1] = imgB.data[i + 2] = b; imgB.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctxB.putImageData(imgB, 0, 0);
  const out = { map: tex(c), bumpMap: tex(cb, { srgb: false }) };
  cache.set(key, out);
  return out;
}

// ———— PLANCHER À PLANCHES ————
export function plankFloorTexture({ base = '#a8794e', dark = '#7c5430', light = '#c79a6b', seed = 21, planks = 6 } = {}) {
  const key = `floor|${base}|${seed}|${planks}`;
  if (cache.has(key)) return cache.get(key);
  const S = 1024;
  const [c, ctx] = canvas(S);
  const [cb, ctxB] = canvas(S);
  const rng = mulberry(seed);
  const pw = S / planks;
  ctxB.fillStyle = '#808080';
  ctxB.fillRect(0, 0, S, S);
  for (let p = 0; p < planks; p++) {
    const y0 = p * pw;
    // fond de planche, teinte propre à chaque lame
    ctx.fillStyle = shade(base, (rng() - 0.5) * 30);
    ctx.fillRect(0, y0, S, pw);
    // fil du bois : longues stries horizontales légèrement ondulées
    for (let i = 0; i < 110; i++) {
      const y = y0 + rng() * pw;
      const useDark = rng() > 0.45;
      ctx.strokeStyle = useDark ? dark : light;
      ctx.globalAlpha = 0.05 + rng() * 0.16;
      ctx.lineWidth = 0.6 + rng() * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S * 0.33, y + (rng() - 0.5) * 7, S * 0.66, y + (rng() - 0.5) * 7, S, y + (rng() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // quelques nœuds discrets
    if (rng() > 0.45) {
      const kx = rng() * S, ky = y0 + pw * (0.3 + rng() * 0.4);
      const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, 9 + rng() * 8);
      grad.addColorStop(0, dark);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(kx, ky, 18, 0, 7); ctx.fill();
    }
    // joints entre lames + joints en bout décalés
    ctx.fillStyle = 'rgba(30,20,12,0.5)';
    ctx.fillRect(0, y0 - 1, S, 2);
    ctxB.fillStyle = '#3a3a3a';
    ctxB.fillRect(0, y0 - 1.5, S, 3);
    const segs = 1 + Math.floor(rng() * 2);
    for (let sgi = 0; sgi < segs; sgi++) {
      const x = rng() * S;
      ctx.fillRect(x, y0, 2, pw);
      ctxB.fillRect(x, y0, 2.5, pw);
    }
  }
  const out = { map: tex(c, { repeat: [2.5, 2.5] }), bumpMap: tex(cb, { srgb: false, repeat: [2.5, 2.5] }) };
  cache.set(key, out);
  return out;
}

// ———— MARBRE / QUARTZ VEINÉ ————
export function marbleTexture({ bg = '#f1efe9', vein = '#9a958c', vein2 = '#c9c3b6', density = 5, seed = 3, contrast = 1 } = {}) {
  const key = `marble|${bg}|${vein}|${density}|${seed}|${contrast}`;
  if (cache.has(key)) return cache.get(key);
  const S = 1024;
  const [c, ctx] = canvas(S);
  const rng = mulberry(seed);
  const noise = noiseGrid(48, rng);
  // fond légèrement nuagé
  const img = ctx.createImageData(S, S);
  const cBg = hex(bg);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x / 160, y / 160) * 0.5 + noise(x / 40, y / 40) * 0.18;
    const f = 1 - n * 0.12 * contrast;
    const i = (y * S + x) * 4;
    img.data[i] = cBg[0] * f; img.data[i + 1] = cBg[1] * f; img.data[i + 2] = cBg[2] * f; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // veines : marches aléatoires diagonales avec ramifications
  const drawVein = (x, y, ang, len, w, col, alpha) => {
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    let px = x, py = y, a = ang;
    for (let i = 0; i < len; i++) {
      a += (noise(px / 60 + 9, py / 60) - 0.5) * 0.9;
      const nx = px + Math.cos(a) * 9, ny = py + Math.sin(a) * 9;
      ctx.globalAlpha = alpha * (0.5 + noise(px / 30, py / 30) * 0.8);
      ctx.lineWidth = w * (0.4 + noise(px / 18, py / 18));
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      if (rng() < 0.04 && w > 1.2) drawVein(px, py, a + (rng() - 0.5) * 1.6, len * 0.4, w * 0.5, col, alpha * 0.8);
      px = nx; py = ny;
    }
    ctx.globalAlpha = 1;
  };
  for (let v = 0; v < density; v++) {
    const ang = -0.7 + (rng() - 0.5) * 0.8;
    drawVein(rng() * S, rng() * S, ang, 90 + rng() * 80, 2.5 + rng() * 3, vein, 0.5 * contrast);
    drawVein(rng() * S, rng() * S, ang + 0.2, 60, 1.2, vein2, 0.45 * contrast);
  }
  // micro-grain de roughness
  const [cr, ctxR] = canvas(256);
  const ir = ctxR.createImageData(256, 256);
  for (let i = 0; i < ir.data.length; i += 4) {
    const v = 110 + rng() * 26;
    ir.data[i] = ir.data[i + 1] = ir.data[i + 2] = v; ir.data[i + 3] = 255;
  }
  ctxR.putImageData(ir, 0, 0);
  const out = { map: tex(c), roughnessMap: tex(cr, { srgb: false }) };
  cache.set(key, out);
  return out;
}

// ———— GRANIT / QUARTZ MOUCHETÉ ————
export function speckleTexture({ bg = '#2b2b2e', specks = ['#55555a', '#8e8e94', '#1a1a1c', '#b9b9bd'], seed = 11, count = 26000 } = {}) {
  const key = `speckle|${bg}|${specks.join()}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 1024;
  const [c, ctx] = canvas(S);
  const rng = mulberry(seed);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = specks[Math.floor(rng() * specks.length)];
    ctx.globalAlpha = 0.35 + rng() * 0.6;
    const r = 0.5 + rng() * rng() * 3.2;
    ctx.beginPath(); ctx.arc(rng() * S, rng() * S, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const out = { map: tex(c) };
  cache.set(key, out);
  return out;
}

// ———— CARRELAGE MÉTRO / ZELLIGE ————
export function tileTexture({ tile = '#f4f2ec', grout = '#c9c4ba', cols = 8, rows = 16, zellige = false, seed = 5 } = {}) {
  const key = `tile|${tile}|${grout}|${cols}|${rows}|${zellige}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 1024;
  const [c, ctx] = canvas(S);
  const [cb, ctxB] = canvas(S);
  const rng = mulberry(seed);
  ctx.fillStyle = grout; ctx.fillRect(0, 0, S, S);
  ctxB.fillStyle = '#3a3a3a'; ctxB.fillRect(0, 0, S, S);
  const tw = S / cols, th = S / rows, g = 3;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * tw * 0.5;
    for (let col = -1; col < cols + 1; col++) {
      const x = col * tw + off, y = r * th;
      const v = zellige ? (rng() - 0.5) * 38 : (rng() - 0.5) * 8;
      ctx.fillStyle = shade(tile, v);
      roundRect(ctx, x + g, y + g, tw - g * 2, th - g * 2, 3);
      ctx.fill();
      // reflet glacé en haut de chaque tuile
      const gr = ctx.createLinearGradient(0, y, 0, y + th);
      gr.addColorStop(0, `rgba(255,255,255,${zellige ? 0.34 : 0.18})`);
      gr.addColorStop(0.45, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      roundRect(ctx, x + g, y + g, tw - g * 2, th - g * 2, 3);
      ctx.fill();
      ctxB.fillStyle = `rgb(${200 + (zellige ? Math.floor((rng() - 0.5) * 70) : 0)},200,200)`;
      roundRect(ctxB, x + g, y + g, tw - g * 2, th - g * 2, 3);
      ctxB.fill();
    }
  }
  const out = { map: tex(c), bumpMap: tex(cb, { srgb: false }) };
  cache.set(key, out);
  return out;
}

// ———— MÉTAL BROSSÉ (inox) ————
export function brushedMetalTexture({ base = '#aeb0b3', seed = 17 } = {}) {
  const key = `brushed|${base}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = mulberry(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2400; i++) {
    const y = rng() * S;
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.055)';
    ctx.lineWidth = 0.7 + rng();
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(S, y + (rng() - 0.5) * 2);
    ctx.stroke();
  }
  const [cr, ctxR] = canvas(256);
  for (let i = 0; i < 1200; i++) {
    const y = rng() * 256;
    ctxR.strokeStyle = `rgba(${90 + rng() * 70},${90 + rng() * 70},${90 + rng() * 70},0.5)`;
    ctxR.beginPath(); ctxR.moveTo(0, y); ctxR.lineTo(256, y); ctxR.stroke();
  }
  const out = { map: tex(c), roughnessMap: tex(cr, { srgb: false }) };
  cache.set(key, out);
  return out;
}

// ———— BÉTON / ARDOISE ————
export function concreteTexture({ base = '#b6b1a8', seed = 9, dark = 0.18 } = {}) {
  const key = `concrete|${base}|${seed}|${dark}`;
  if (cache.has(key)) return cache.get(key);
  const S = 1024;
  const [c, ctx] = canvas(S);
  const rng = mulberry(seed);
  const noise = noiseGrid(56, rng);
  const img = ctx.createImageData(S, S);
  const cb = hex(base);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise(x / 130, y / 130) * 0.55 + noise(x / 34, y / 34) * 0.3 + rng() * 0.07;
    const f = 1 - n * dark;
    const i = (y * S + x) * 4;
    img.data[i] = cb[0] * f; img.data[i + 1] = cb[1] * f; img.data[i + 2] = cb[2] * f; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // quelques trous d'épingle
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = 'rgba(40,38,34,0.4)';
    ctx.beginPath(); ctx.arc(rng() * S, rng() * S, 0.6 + rng() * 1.4, 0, 7); ctx.fill();
  }
  const out = { map: tex(c) };
  cache.set(key, out);
  return out;
}

// ———— PEINTURE MURALE légèrement texturée ————
export function paintTexture({ base = '#e8e2d6', seed = 4 } = {}) {
  const key = `paint|${base}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = mulberry(seed);
  const noise = noiseGrid(40, rng);
  const img = ctx.createImageData(S, S);
  const cb = hex(base);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = 1 - (noise(x / 50, y / 50) * 0.05 + rng() * 0.02);
    const i = (y * S + x) * 4;
    img.data[i] = cb[0] * f; img.data[i + 1] = cb[1] * f; img.data[i + 2] = cb[2] * f; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const out = { map: tex(c, { repeat: [2, 2] }) };
  cache.set(key, out);
  return out;
}

// ———— utilitaires couleur ————
function hex(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function shade(h, amt) {
  const [r, g, b] = hex(h);
  const cl = (x) => Math.max(0, Math.min(255, Math.round(x + amt)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}
function lerp3(a, b, c, t) {
  const mix = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
  return t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
