// Procedurally painted canvas textures for Bessario's Burgers.
import * as THREE from 'three';
import { makeRng } from '../engine/util.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { repeat = null, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  t.generateMipmaps = mips;
  if (!mips) t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function grime(ctx, w, h, r, count, color, alphaMax, sizeMin, sizeMax) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, s = sizeMin + r() * (sizeMax - sizeMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(${color},${r() * alphaMax})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
}
function speckle(ctx, w, h, r, count, colors, size = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = r() * size + 0.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}
function drips(ctx, W, H, r, n, col = '90,70,40', a = 0.25) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, len = 40 + r() * H * 0.6, wd = 3 + r() * 10;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(x, 0, wd, len);
  }
}

const cache = {};
function cached(key, fn) { return cache[key] || (cache[key] = fn()); }

export const Tex = {
  // black & white checker diner floor, scuffed
  checker: () => cached('checker', () => {
    const S = 1024, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(5);
    const n = 8, ts = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dark = (x + y) % 2 === 1;
      const v = (r() - 0.5) * 16;
      const b = dark ? 26 + v : 168 + v;
      ctx.fillStyle = `rgb(${b},${b - 2},${b - 8})`;
      ctx.fillRect(x * ts, y * ts, ts, ts);
      if (!dark && r() < 0.18) { // cracked tile
        ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); let px = x * ts + r() * ts, py = y * ts;
        ctx.moveTo(px, py);
        for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 40; py += ts / 5; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
    speckle(ctx, S, S, r, 6000, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.08)'], 2);
    grime(ctx, S, S, r, 120, '40,32,20', 0.32, 30, 200);
    grime(ctx, S, S, r, 300, '30,24,16', 0.25, 4, 30);
    for (let i = 0; i < 40; i++) { ctx.strokeStyle = `rgba(15,12,8,${0.1 + r() * 0.2})`; ctx.lineWidth = 1 + r() * 2; const x = r() * S, y = r() * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 30); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(20,18,14,0.6)'; ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * ts, 0); ctx.lineTo(i * ts, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * ts); ctx.lineTo(S, i * ts); ctx.stroke();
    }
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  // lower wall: red/white diner tile band; upper: stained cream plaster
  wall: (hue = 'red') => cached('wall' + hue, () => {
    const W = 512, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(hue.length * 7 + 3);
    ctx.fillStyle = '#b8ad8c'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, r, 5000, ['rgba(110,96,70,0.25)', 'rgba(230,220,200,0.15)'], 1.8);
    grime(ctx, W, 300, r, 25, '90,74,48', 0.2, 20, 100);
    drips(ctx, W, H, r, 7, '90,70,40', 0.16);
    // tile band (bottom 40%)
    const top = H * 0.6, th = 32;
    const cols = hue === 'red' ? ['#8e1e1a', '#d9d2bf'] : hue === 'blue' ? ['#203a6a', '#d9d2bf'] : ['#2f5e34', '#d9d2bf'];
    for (let y = top, row = 0; y < H; y += th, row++) {
      for (let x = 0, col = 0; x < W; x += th, col++) {
        const pick = (row === 1 || row === 2) ? (col % 2 === row % 2 ? 0 : 1) : (row === 0 ? 0 : 1);
        ctx.fillStyle = cols[pick];
        ctx.fillRect(x + 1, y + 1, th - 2, th - 2);
        const v = r() * 0.2;
        ctx.fillStyle = `rgba(0,0,0,${v})`; ctx.fillRect(x + 1, y + 1, th - 2, th - 2);
      }
    }
    ctx.fillStyle = '#3a3226'; ctx.fillRect(0, top - 6, W, 6);
    grime(ctx, W, H, r, 40, '40,30,20', 0.25, 10, 60);
    const g2 = ctx.createLinearGradient(0, H - 80, 0, H);
    g2.addColorStop(0, 'rgba(30,22,14,0)'); g2.addColorStop(1, 'rgba(30,22,14,0.55)');
    ctx.fillStyle = g2; ctx.fillRect(0, H - 80, W, 80);
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  plaster: () => cached('plaster', () => {
    const W = 256, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(77);
    ctx.fillStyle = '#7a7466'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, r, 2500, ['rgba(40,36,30,0.3)', 'rgba(200,190,170,0.12)'], 1.8);
    grime(ctx, W, H, r, 30, '30,26,20', 0.3, 10, 60);
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  ceiling: () => cached('ceiling', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(31);
    ctx.fillStyle = '#5c5850'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, r, 4000, ['rgba(30,28,24,0.4)', 'rgba(140,135,120,0.3)'], 1.4);
    grime(ctx, S, S, r, 6, '80,60,30', 0.4, 20, 60); // water stains
    ctx.strokeStyle = '#2c2a26'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, S, S);
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  metal: () => cached('metal', () => {
    const W = 256, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(41);
    ctx.fillStyle = '#5d5f5c'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) { // roll-shutter slats
      const g = ctx.createLinearGradient(0, y, 0, y + 32);
      g.addColorStop(0, '#7a7c78'); g.addColorStop(0.5, '#565854'); g.addColorStop(1, '#30322f');
      ctx.fillStyle = g; ctx.fillRect(0, y, W, 32);
    }
    speckle(ctx, W, H, r, 2000, ['rgba(20,20,20,0.3)', 'rgba(150,110,70,0.25)'], 2);
    grime(ctx, W, H, r, 30, '90,55,25', 0.35, 6, 40); // rust
    // hazard stripes at the bottom
    ctx.save(); ctx.beginPath(); ctx.rect(0, H - 50, W, 50); ctx.clip();
    for (let x = -60; x < W + 60; x += 40) {
      ctx.fillStyle = '#c9a21a'; ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 20, H); ctx.lineTo(x + 70, H - 50); ctx.lineTo(x + 50, H - 50); ctx.fill();
      ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.moveTo(x + 20, H); ctx.lineTo(x + 40, H); ctx.lineTo(x + 90, H - 50); ctx.lineTo(x + 70, H - 50); ctx.fill();
    }
    ctx.restore();
    grime(ctx, W, H, r, 10, '20,16,10', 0.3, 20, 60);
    return canvasTexture(c);
  }),

  wood: () => cached('wood', () => {
    const W = 512, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(51);
    for (let y = 0; y < H; y += 32) {
      const v = (r() - 0.5) * 20;
      ctx.fillStyle = `rgb(${92 + v},${58 + v * 0.7},${34 + v * 0.5})`; ctx.fillRect(0, y, W, 32);
      for (let i = 0; i < 20; i++) {
        ctx.strokeStyle = `rgba(40,22,10,${0.1 + r() * 0.2})`; ctx.lineWidth = 1;
        ctx.beginPath(); const yy = y + r() * 32; ctx.moveTo(0, yy);
        ctx.bezierCurveTo(W * 0.3, yy + (r() - 0.5) * 8, W * 0.6, yy + (r() - 0.5) * 8, W, yy); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20,10,4,0.7)'; ctx.fillRect(0, y, W, 2);
    }
    grime(ctx, W, H, r, 20, '20,12,6', 0.3, 10, 50);
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  curtain: (col = '#5a1018') => cached('curtain' + col, () => {
    const W = 256, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(61);
    for (let x = 0; x < W; x++) {
      const k = 0.55 + 0.45 * Math.sin((x / W) * Math.PI * 8);
      ctx.fillStyle = col; ctx.fillRect(x, 0, 1, H);
      ctx.fillStyle = `rgba(0,0,0,${0.55 - k * 0.5})`; ctx.fillRect(x, 0, 1, H);
    }
    // stars pattern
    ctx.fillStyle = 'rgba(220,180,80,0.5)';
    for (let i = 0; i < 26; i++) star(ctx, r() * W, r() * H, 4 + r() * 4);
    grime(ctx, W, H, r, 12, '0,0,0', 0.3, 10, 60);
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  // felt-like fur with fine noise; tinted by material color
  fur: () => cached('fur', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(71);
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      const l = 150 + r() * 100;
      ctx.strokeStyle = `rgba(${l},${l},${l},0.35)`; ctx.lineWidth = 1;
      const x = r() * S, y = r() * S, a = r() * 0.6 + 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); ctx.stroke();
    }
    grime(ctx, S, S, r, 30, '40,30,20', 0.35, 6, 40);
    speckle(ctx, S, S, r, 400, ['rgba(30,20,10,0.4)'], 2);
    return canvasTexture(c, { repeat: [2, 2] });
  }),


  scales: () => cached('scales', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(171);
    ctx.fillStyle = '#b8b8b8'; ctx.fillRect(0, 0, S, S);
    const sz = 16;
    for (let y = 0; y < S + sz; y += sz * 0.75) for (let x = 0; x < S + sz; x += sz) {
      const ox = (Math.round(y / (sz * 0.75)) % 2) * sz / 2;
      const l = 150 + r() * 80;
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.beginPath(); ctx.ellipse(x + ox, y, sz * 0.48, sz * 0.4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,40,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    grime(ctx, S, S, r, 30, '30,30,20', 0.35, 6, 40);
    return canvasTexture(c, { repeat: [2, 2] });
  }),

  stripes: (a = '#b81c24', b = '#ece4d2') => cached('stripes' + a + b, () => {
    const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(181);
    for (let y = 0; y < S; y += 16) { ctx.fillStyle = (y / 16) % 2 ? a : b; ctx.fillRect(0, y, S, 16); }
    grime(ctx, S, S, r, 20, '50,30,20', 0.35, 6, 30);
    return canvasTexture(c, { repeat: [4, 2] });
  }),

  gingham: () => cached('gingham', () => {
    const S = 64, c = makeCanvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#efe6d6'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(170,20,24,0.6)'; for (let i = 0; i < S; i += 16) { ctx.fillRect(i, 0, 8, S); ctx.fillRect(0, i, S, 8); }
    return canvasTexture(c, { repeat: [3, 3] });
  }),

  // white cloth with grease and old stains (chef coat, aprons)
  cloth: (seed = 1) => cached('cloth' + seed, () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(seed * 31 + 7);
    ctx.fillStyle = '#e4ddcc'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 3) { ctx.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`; ctx.fillRect(0, i, S, 1); }
    grime(ctx, S, S, r, 18, '120,80,30', 0.4, 8, 40); // grease
    grime(ctx, S, S, r, 6, '90,20,15', 0.35, 4, 18);  // ketchup... probably
    grime(ctx, S, S, r, 30, '50,40,30', 0.25, 4, 30);
    return canvasTexture(c, { repeat: [1, 1] });
  }),

  crt: () => cached('crt', () => {
    const W = 128, H = 96, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(5);
    ctx.fillStyle = '#06140a'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { ctx.fillStyle = `rgba(60,160,90,${0.08 + r() * 0.1})`; ctx.fillRect(0, y, W, 1); }
    ctx.fillStyle = '#5ad08a'; ctx.font = '12px "VT323", monospace';
    ['CAM SYS v1.4', '> 10 FEEDS OK', '> PWR: MAIN', '> FREEZER: LOCK', '_'].forEach((l, i) => ctx.fillText(l, 6, 16 + i * 15));
    return canvasTexture(c);
  }),

  // irregular grime / water stain with alpha (for decals)
  stain: (seed, kind = 'dirt') => cached('stain' + seed + kind, () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(seed * 131 + kind.length);
    ctx.clearRect(0, 0, S, S);
    const col = { dirt: '28,22,14', water: '70,52,26', soda: '60,18,10', soot: '8,8,8', rust: '90,44,16' }[kind] || '28,22,14';
    if (kind === 'drip') {
      for (let i = 0; i < 8; i++) {
        const x = 30 + r() * 196, w = 4 + r() * 14, len = 60 + r() * 190;
        const g = ctx.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(60,44,24,0.55)'); g.addColorStop(1, 'rgba(60,44,24,0)');
        ctx.fillStyle = g; ctx.fillRect(x, 0, w, len);
      }
      return canvasTexture(c);
    }
    for (let i = 0; i < 26; i++) {
      const x = S / 2 + (r() - 0.5) * S * 0.55, y = S / 2 + (r() - 0.5) * S * 0.55, rad = 12 + r() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${col},${0.25 + r() * 0.35})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (kind === 'water') { // tide-mark ring
      ctx.strokeStyle = 'rgba(80,58,28,0.45)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2, rr = 80 + Math.sin(t * 5 + seed) * 14 + r() * 6; ctx.lineTo(S / 2 + Math.cos(t) * rr, S / 2 + Math.sin(t) * rr); }
      ctx.stroke();
    }
    // fade to the edges so it never shows a square
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = m; ctx.fillRect(0, 0, S, S);
    return canvasTexture(c);
  }),

  web: () => cached('web', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(9);
    ctx.strokeStyle = 'rgba(210,205,190,0.45)'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * S * 1.1, Math.sin(a) * S * 1.1); ctx.stroke(); }
    for (let k = 1; k < 9; k++) { ctx.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2, rr = k * 26 + r() * 6; const sag = i % 1 ? 0 : 4; ctx.lineTo(Math.cos(a) * rr + sag, Math.sin(a) * rr + sag); } ctx.stroke(); }
    ctx.fillStyle = 'rgba(200,195,180,0.08)'; ctx.fillRect(0, 0, S * 0.4, S * 0.4);
    return canvasTexture(c);
  }),

  vent: () => cached('vent', () => {
    const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(19);
    ctx.fillStyle = '#7a7a72'; ctx.fillRect(0, 0, S, S);
    for (let y = 10; y < S - 8; y += 9) { ctx.fillStyle = '#121212'; ctx.fillRect(8, y, S - 16, 5); ctx.fillStyle = '#9a9a90'; ctx.fillRect(8, y + 5, S - 16, 1); }
    ctx.strokeStyle = '#3a3a36'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, S - 4, S - 4);
    grime(ctx, S, S, r, 20, '30,24,14', 0.5, 6, 30);
    return canvasTexture(c);
  }),

  // tileable grunge for the weathering shader: light with darker blotches, streaks, scratches
  grunge: () => cached('grunge', () => {
    const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(303);
    ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, S, S);
    const blot = (n, a, s0, s1, col) => { for (let i = 0; i < n; i++) { const x = r() * S, y = r() * S, rad = s0 + r() * (s1 - s0);
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); g.addColorStop(0, `rgba(${col},${a * r()})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2); } } };
    blot(40, 0.35, 40, 140, '60,50,40');
    blot(220, 0.3, 4, 26, '40,34,26');
    blot(20, 0.25, 30, 90, '255,250,240');
    ctx.lineCap = 'round';
    for (let i = 0; i < 160; i++) { ctx.strokeStyle = `rgba(${r() < 0.5 ? '30,26,20' : '250,245,235'},${0.08 + r() * 0.2})`; ctx.lineWidth = 0.6 + r() * 1.4; const x = r() * S, y = r() * S, a = r() * 6.3, l = 6 + r() * 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
    speckle(ctx, S, S, r, 9000, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.12)'], 1.6);
    return canvasTexture(c, { repeat: [1, 1], srgb: false });
  }),

  glow: () => cached('glow', () => {
    const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return canvasTexture(c, { srgb: false });
  }),

  // wall poster: "BESSARIO'S BURGERS" with a crude bear
  poster: (kind = 'main') => cached('poster' + kind, () => {
    const W = 256, H = 384, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(kind.length * 13 + 5);
    const bg = { main: '#d8b14a', celebrate: '#2a4f8a', kira: '#b8457a', kiril: '#3d6b4a', lebron: '#9a3b1c', victor: '#d9b13a', rules: '#e6dcc4', menu: '#1a1a1a' }[kind] || '#d8b14a';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (kind === 'rules') {
      ctx.fillStyle = '#7a1414'; ctx.font = 'bold 30px "Bebas Neue", Impact, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('RULES FOR SAFETY', W / 2, 44);
      ctx.fillStyle = '#2a2420'; ctx.font = '15px "Special Elite", serif'; ctx.textAlign = 'left';
      ['1. No running.', '2. Don\'t yell.', '3. Don\'t hit.', '4. Respect others.', '5. Stay close.', '6. Don\'t touch', '   the grill.', '7. Have fun!', '8. Wash hands.', '9. If lost, find', '   an employee.'].forEach((l, i) => ctx.fillText(l, 22, 86 + i * 25));
    } else if (kind === 'menu') {
      ctx.fillStyle = '#e8c04a'; ctx.font = '34px "Bebas Neue", Impact, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('MENU', W / 2, 46);
      ctx.font = '18px "Bebas Neue", Impact, sans-serif'; ctx.textAlign = 'left';
      [['BESSARIO BURGER', '2.99'], ['DOUBLE BEAR', '3.99'], ['KIRA FRIES', '1.29'], ['KIRIL CHILI DOG', '2.49'], ['LEBRON SHAKE', '1.99'], ['KIDS MEAL', '2.49'], ['PARTY PACK', '19.99']].forEach(([n, p], i) => {
        ctx.fillStyle = '#efe6d0'; ctx.fillText(n, 18, 92 + i * 38); ctx.fillStyle = '#e8c04a'; ctx.textAlign = 'right'; ctx.fillText('$' + p, W - 18, 92 + i * 38); ctx.textAlign = 'left';
      });
    } else {
      // sunburst
      ctx.save(); ctx.translate(W / 2, H * 0.45);
      for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -400); ctx.lineTo(30, -400); ctx.fill(); }
      ctx.restore();
      const face = { main: 'bear', celebrate: 'group', kira: 'cat', kiril: 'wolf', lebron: 'bull', victor: 'gold' }[kind];
      if (face === 'group') {
        drawFace(ctx, W * 0.5, H * 0.43, 58, 'bear');
        drawFace(ctx, W * 0.2, H * 0.5, 38, 'wolf');
        drawFace(ctx, W * 0.8, H * 0.5, 38, 'cat');
      } else drawFace(ctx, W / 2, H * 0.45, 80, face);
      ctx.textAlign = 'center';
      const title = { main: "BESSARIO'S", celebrate: 'CELEBRATE!', kira: 'KIRA SAYS HI!', kiril: 'ROCK WITH KIRIL', lebron: 'LEBRON\'S DRIVE-THRU', victor: 'VICTOR' }[kind];
      ctx.fillStyle = '#1c1206'; ctx.font = `${kind === 'lebron' ? 30 : 40}px "Bebas Neue", Impact, sans-serif`;
      ctx.fillText(title, W / 2 + 2, 62); ctx.fillStyle = '#fff3d6'; ctx.fillText(title, W / 2, 60);
      ctx.font = '22px "Bebas Neue", Impact, sans-serif'; ctx.fillStyle = '#1c1206';
      const sub = { main: 'BURGERS & FUN', celebrate: 'BESSARIO\'S BURGERS', kira: 'BEST FRIES IN TOWN', kiril: 'EVERY SATURDAY', lebron: 'TEMPORARILY CLOSED', victor: '' }[kind];
      ctx.fillText(sub, W / 2, H - 30);
    }
    // wear
    grime(ctx, W, H, r, 25, '60,40,20', 0.3, 10, 60);
    speckle(ctx, W, H, r, 800, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.1)'], 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3);
    return canvasTexture(c);
  }),

  // kids' crayon drawings, taped to the wall
  drawing: (seed) => cached('draw' + seed, () => {
    const W = 192, H = 144, c = makeCanvas(W, H), ctx = c.getContext('2d'), r = makeRng(seed * 97 + 1);
    ctx.fillStyle = '#efeadc'; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const crayons = ['#c0392b', '#2c5fa8', '#e2a51b', '#3b8a3e', '#6b3a1e', '#8e44ad', '#222'];
    // ground + sun
    ctx.strokeStyle = '#3b8a3e'; ctx.beginPath(); ctx.moveTo(0, H - 18); for (let x = 0; x < W; x += 12) ctx.lineTo(x, H - 18 + (r() - 0.5) * 6); ctx.stroke();
    if (r() < 0.6) { ctx.strokeStyle = '#e2a51b'; ctx.beginPath(); ctx.arc(W - 26, 24, 12, 0, 7); ctx.stroke(); }
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = 30 + (i + 0.5) * (W - 60) / n, y = H - 60;
      ctx.strokeStyle = crayons[Math.floor(r() * crayons.length)];
      ctx.beginPath(); ctx.arc(x, y - 18, 14, 0, 7); ctx.stroke(); // head
      ctx.beginPath(); ctx.arc(x - 12, y - 32, 5, 0, 7); ctx.arc(x + 12, y - 32, 5, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 22); ctx.moveTo(x - 14, y + 6); ctx.lineTo(x + 14, y + 6);
      ctx.moveTo(x, y + 22); ctx.lineTo(x - 8, y + 38); ctx.moveTo(x, y + 22); ctx.lineTo(x + 8, y + 38); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.fillRect(x - 6, y - 22, 3, 3); ctx.fillRect(x + 4, y - 22, 3, 3);
    }
    if (seed % 4 === 3) { // a creepy one: a small figure crying, big shape behind
      ctx.strokeStyle = '#6b3a1e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(W / 2, 50, 30, 0, 7); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.fillRect(W / 2 - 14, 42, 8, 8); ctx.fillRect(W / 2 + 6, 42, 8, 8);
    }
    return canvasTexture(c);
  }),

  // big neon-style sign over the stage
  sign: (text, sub, col = '#ffcc33') => cached('sign' + text + sub, () => {
    const W = 1024, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#140c08'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#6b4a1a'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '150px "Bebas Neue", Impact, sans-serif';
    ctx.shadowColor = col; ctx.shadowBlur = 30; ctx.fillStyle = col;
    ctx.fillText(text, W / 2, sub ? H * 0.42 : H / 2);
    if (sub) { ctx.font = '54px "Bebas Neue", Impact, sans-serif'; ctx.fillStyle = '#ff5a3a'; ctx.shadowColor = '#ff3a1a'; ctx.fillText(sub, W / 2, H * 0.82); }
    // a few dead bulbs
    ctx.shadowBlur = 0;
    for (let x = 30; x < W; x += 48) { ctx.fillStyle = Math.random() < 0.2 ? '#3a2a1a' : '#ffe9a8'; ctx.beginPath(); ctx.arc(x, 22, 6, 0, 7); ctx.arc(x, H - 22, 6, 0, 7); ctx.fill(); }
    return canvasTexture(c);
  }),

  label: (text, { w = 512, h = 128, bg = '#1a1a1a', fg = '#e8e0c8', font = 'Bebas Neue', size = 80 } = {}) => cached('lbl' + text + bg + fg + w, () => {
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${size}px "${font}", Impact, sans-serif`;
    ctx.fillText(text, w / 2, h / 2 + 4);
    return canvasTexture(c);
  }),

  frost: () => cached('frost', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = makeRng(91);
    ctx.fillStyle = '#9fb3bd'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, r, 5000, ['rgba(255,255,255,0.35)', 'rgba(60,80,90,0.2)'], 2);
    grime(ctx, S, S, r, 20, '255,255,255', 0.4, 10, 50);
    grime(ctx, S, S, r, 10, '90,60,30', 0.25, 10, 40);
    return canvasTexture(c);
  }),
};

function star(ctx, x, y, s) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.fill();
}

// crude 2D cartoon faces for posters
export function drawFace(ctx, x, y, s, kind) {
  const col = { bear: '#7a4a24', wolf: '#6f7f8e', cat: '#d9a0c0', bull: '#8a3a1e', gold: '#c9a032' }[kind];
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col; ctx.strokeStyle = '#1c1206'; ctx.lineWidth = s * 0.05;
  // ears
  if (kind === 'bear' || kind === 'gold') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * s * 0.72, -s * 0.72, s * 0.3, 0, 7); ctx.fill(); ctx.stroke(); } }
  if (kind === 'wolf' || kind === 'cat') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.35, -s * 0.7); ctx.lineTo(sx * s * 0.8, -s * 1.25); ctx.lineTo(sx * s * 0.9, -s * 0.35); ctx.fill(); ctx.stroke(); } }
  if (kind === 'bull') { ctx.fillStyle = '#e8dcc0'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.6, -s * 0.5); ctx.quadraticCurveTo(sx * s * 1.4, -s * 0.7, sx * s * 1.1, -s * 1.3); ctx.lineTo(sx * s * 0.8, -s * 0.75); ctx.fill(); ctx.stroke(); } ctx.fillStyle = col; }
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.95, s * 0.9, 0, 0, 7); ctx.fill(); ctx.stroke();
  // muzzle
  ctx.fillStyle = kind === 'bull' ? '#d9a28a' : '#e8d4b0';
  ctx.beginPath(); ctx.ellipse(0, s * 0.35, s * 0.5, s * 0.38, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1c1206'; ctx.beginPath(); ctx.ellipse(0, s * 0.18, s * 0.16, s * 0.1, 0, 0, 7); ctx.fill();
  // eyes
  for (const sx of [-1, 1]) {
    ctx.fillStyle = kind === 'gold' ? '#000' : '#fff';
    ctx.beginPath(); ctx.ellipse(sx * s * 0.34, -s * 0.22, s * 0.17, s * 0.2, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (kind !== 'gold') { ctx.fillStyle = kind === 'cat' ? '#9a2a6a' : '#3a6aa8'; ctx.beginPath(); ctx.arc(sx * s * 0.32, -s * 0.2, s * 0.08, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx * s * 0.34, -s * 0.22, s * 0.025, 0, 7); ctx.fill(); }
  }
  // smile
  ctx.strokeStyle = '#1c1206'; ctx.lineWidth = s * 0.06;
  ctx.beginPath(); ctx.arc(0, s * 0.35, s * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  if (kind === 'bear') { // chef hat + mustache
    ctx.fillStyle = '#f2efe6'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); ctx.rect(-s * 0.5, -s * 1.2, s, s * 0.35); ctx.fill(); ctx.stroke();
    for (const [dx, dy, rr] of [[-0.35, -1.35, 0.3], [0, -1.5, 0.36], [0.35, -1.35, 0.3]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, rr * s, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#1c1206';
    ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.bezierCurveTo(-s * 0.2, s * 0.15, -s * 0.5, s * 0.5, -s * 0.6, s * 0.25); ctx.bezierCurveTo(-s * 0.45, s * 0.38, -s * 0.2, s * 0.3, 0, s * 0.38);
    ctx.bezierCurveTo(s * 0.2, s * 0.3, s * 0.45, s * 0.38, s * 0.6, s * 0.25); ctx.bezierCurveTo(s * 0.5, s * 0.5, s * 0.2, s * 0.15, 0, s * 0.3); ctx.fill();
  }
  ctx.restore();
}
