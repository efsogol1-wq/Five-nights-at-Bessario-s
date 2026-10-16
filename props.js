// Prop library for Bessario's Burgers: furniture, party clutter, kitchen gear, lamps...
import * as THREE from 'three';
import { Tex } from './textures.js';

const M = {};
const mat = (key, fn) => M[key] || (M[key] = fn());
export const Mats = {
  steel: () => mat('steel', () => new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.32, metalness: 0.85 })),
  steelDirty: () => mat('steelD', () => new THREE.MeshStandardMaterial({ color: 0x6a6c6c, roughness: 0.55, metalness: 0.7 })),
  dark: () => mat('dark', () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 })),
  black: () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 })),
  wood: () => mat('wood', () => new THREE.MeshStandardMaterial({ map: Tex.wood(), roughness: 0.75 })),
  tablecloth: () => mat('cloth', () => { const t = Tex.gingham().clone(); t.repeat.set(4, 2); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); }),
  plasticRed: () => mat('pr', () => new THREE.MeshStandardMaterial({ color: 0xa01c1c, roughness: 0.45 })),
  plasticYellow: () => mat('py', () => new THREE.MeshStandardMaterial({ color: 0xd8a820, roughness: 0.45 })),
  vinyl: () => mat('vinyl', () => new THREE.MeshStandardMaterial({ color: 0x7a1a18, roughness: 0.5 })),
  paper: () => mat('paper', () => new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.95 })),
  bulb: () => mat('bulb', () => new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffe0a0, emissiveIntensity: 2.5 })),
  bulbOff: () => mat('bulbOff', () => new THREE.MeshStandardMaterial({ color: 0x555048, roughness: 0.4 })),
  grease: () => mat('grease', () => new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.35, metalness: 0.4 })),
  rubber: () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })),
};

export function add(parent, geo, material, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx; if (opts.ry) m.rotation.y = opts.ry; if (opts.rz) m.rotation.z = opts.rz;
  if (opts.s) m.scale.setScalar(opts.s);
  m.castShadow = opts.cast !== false; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

let seed = 1234;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------- party
const HAT_COLS = [0xc0392b, 0x2c5fa8, 0xe2a51b, 0x3b8a3e, 0x8e44ad, 0xd35400];
export function partyHat(parent, x, y, z, tip = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tip * (rnd() - 0.5), rnd() * 6, tip * (rnd() - 0.5));
  const c = pick(HAT_COLS);
  add(g, new THREE.ConeGeometry(0.07, 0.2, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }), 0, 0.1, 0);
  add(g, new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2e6c0, roughness: 0.9 }), 0, 0.21, 0);
  parent.add(g); return g;
}
export function plate(parent, x, y, z) {
  add(parent, C(0.12, 0.09, 0.02, 16), Mats.paper(), x, y + 0.01, z);
  if (rnd() < 0.5) { // burger leftovers
    add(parent, new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb87830, roughness: 0.7 }), x + 0.02, y + 0.03, z, { s: 1 });
  }
}
export function cup(parent, x, y, z) {
  const c = new THREE.Group(); c.position.set(x, y, z);
  add(c, C(0.045, 0.035, 0.15, 12), new THREE.MeshStandardMaterial({ color: pick([0xc0392b, 0xe8e2d2, 0x2c5fa8]), roughness: 0.6 }), 0, 0.075, 0);
  add(c, C(0.047, 0.047, 0.01, 12), Mats.paper(), 0, 0.155, 0);
  add(c, C(0.005, 0.005, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0xc81c30 }), 0.01, 0.2, 0, { rz: 0.15 });
  if (rnd() < 0.25) { c.rotation.z = Math.PI / 2; c.position.y += 0.045; }
  parent.add(c); return c;
}
export function confetti(parent, x0, z0, w, d, y, n = 120) {
  const g = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.025, 0.025), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    e.set(-Math.PI / 2 + (rnd() - 0.5) * 0.4, 0, rnd() * 6); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x0 + rnd() * w, y + 0.002, z0 + rnd() * d), q, new THREE.Vector3(1, 1, 1));
    g.setMatrixAt(i, m4); g.setColorAt(i, col.setHex(pick(HAT_COLS)));
  }
  g.receiveShadow = true;
  parent.add(g); return g;
}
export function partyTable(parent, x, z, len = 3, rot = 0, mess = 1) {
  const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = rot;
  add(t, B(len, 0.04, 0.95), Mats.tablecloth(), 0, 0.76, 0);
  add(t, B(len + 0.02, 0.22, 0.97), Mats.tablecloth(), 0, 0.66, 0, { cast: false });   // cloth drape
  for (const sx of [-1, 1]) add(t, B(0.06, 0.74, 0.7), Mats.steelDirty(), sx * (len / 2 - 0.2), 0.37, 0);
  const n = Math.floor(len / 0.6);
  for (let i = 0; i < n; i++) {
    const px = -len / 2 + 0.3 + i * (len - 0.6) / Math.max(1, n - 1);
    for (const sz of [-1, 1]) {
      if (rnd() < mess) partyHat(t, px + (rnd() - 0.5) * 0.15, 0.78, sz * 0.3, rnd() < 0.3 ? 2.8 : 0.3);
      if (rnd() < 0.8) plate(t, px, 0.78, sz * 0.22);
      if (rnd() < 0.6) cup(t, px + 0.15, 0.78, sz * 0.32);
      chair(t, px, sz * 0.75, sz > 0 ? Math.PI : 0);
    }
  }
  parent.add(t); return t;
}
export function chair(parent, x, z, ry = 0) {
  const c = new THREE.Group(); c.position.set(x + (rnd() - 0.5) * 0.12, 0, z + (rnd() - 0.5) * 0.1); c.rotation.y = ry + (rnd() - 0.5) * 0.4;
  const seat = pick([Mats.plasticRed(), Mats.plasticYellow(), Mats.vinyl()]);
  add(c, B(0.42, 0.05, 0.42), seat, 0, 0.45, 0);
  add(c, B(0.42, 0.42, 0.04), seat, 0, 0.72, -0.2, { rx: -0.08 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(c, C(0.012, 0.012, 0.45, 6), Mats.steel(), sx * 0.18, 0.225, sz * 0.18);
  if (rnd() < 0.08) { c.rotation.z = Math.PI / 2; c.position.y = 0.2; } // knocked over
  parent.add(c); return c;
}
export function balloon(parent, x, y, z, color) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  add(g, new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: color || pick(HAT_COLS), roughness: 0.25, metalness: 0.05 }), 0, 0, 0, { s: 1 }).scale.set(1, 1.18, 1);
  add(g, new THREE.ConeGeometry(0.025, 0.04, 8), new THREE.MeshStandardMaterial({ color: color || 0x888888 }), 0, -0.2, 0, { rx: Math.PI });
  const pts = []; for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(Math.sin(i) * 0.02, -0.22 - i * 0.12, Math.cos(i * 1.3) * 0.02));
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.002, 3), Mats.paper(), 0, 0, 0, { cast: false });
  parent.add(g); return g;
}
export function streamer(parent, a, b, color, sag = 0.4) {
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  add(parent, new THREE.TubeGeometry(curve, 24, 0.012, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }), 0, 0, 0, { cast: false });
  // little paper flags along it
  for (let i = 1; i < 10; i++) {
    const p = curve.getPoint(i / 10);
    add(parent, new THREE.ConeGeometry(0.06, 0.12, 3), new THREE.MeshStandardMaterial({ color: pick(HAT_COLS), roughness: 0.9, side: THREE.DoubleSide }), p.x, p.y - 0.06, p.z, { rx: Math.PI, cast: false }).scale.set(1, 1, 0.1);
  }
}

// ---------------------------------------------------------------- wall stuff
export function poster(parent, kind, x, y, z, ry = 0, w = 0.6) {
  const m = add(parent, new THREE.PlaneGeometry(w, w * 1.5), new THREE.MeshStandardMaterial({ map: Tex.poster(kind), roughness: 0.85 }), x, y, z, { ry, cast: false });
  m.rotation.z = (rnd() - 0.5) * 0.05;
  // tape corners
  return m;
}
export function drawing(parent, s, x, y, z, ry = 0) {
  const m = add(parent, new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ map: Tex.drawing(s), roughness: 0.9 }), x, y, z, { ry, cast: false });
  m.rotation.z = (rnd() - 0.5) * 0.3;
  return m;
}
export function drawingsRow(parent, x0, x1, y, z, ry, n, s0 = 0) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + (x1 - x0) * t;
    const off = ry === 0 || Math.abs(ry - Math.PI) < 0.1 ? [x, z] : [z, x];
    drawing(parent, s0 + i, off[0], y + (rnd() - 0.5) * 0.25, off[1], ry);
  }
}

// hanging industrial lamp with an actual light
export function hangingLamp(parent, x, y, z, { intensity = 6, color = 0xffd9a0, dist = 9, shadow = false, cord = 0.6 } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  add(g, C(0.006, 0.006, cord, 4), Mats.dark(), 0, cord / 2, 0, { cast: false });
  const shade = add(g, C(0.06, 0.26, 0.2, 18, true), new THREE.MeshStandardMaterial({ color: 0x2c3a2c, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }), 0, -0.05, 0);
  const bulb = add(g, new THREE.SphereGeometry(0.05, 10, 8), Mats.bulb(), 0, -0.13, 0, { cast: false });
  // shadowed lamps are wide downward spots (one shadow pass instead of six for a point light)
  const L = shadow ? new THREE.SpotLight(color, intensity * 1.15, dist, 1.32, 0.85, 2) : new THREE.PointLight(color, intensity, dist, 2);
  L.position.set(0, -0.2, 0);
  if (shadow) {
    L.target.position.set(0, -3, 0); g.add(L.target);
    L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; L.shadow.radius = 2; L.userData.softRadius = 0.09;
    const fill = new THREE.PointLight(color, intensity * 0.18, dist * 0.6, 2); fill.position.set(0, -0.1, 0); g.add(fill);   // spill onto the ceiling
  }
  g.add(L);
  parent.add(g);
  return { group: g, light: L, bulb, shade, base: intensity };
}

// fluorescent ceiling fixture
export function tubeLight(parent, x, y, z, ry = 0, { intensity = 3, color = 0xd8f0d0, on = true } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  add(g, B(1.3, 0.06, 0.24), Mats.steelDirty(), 0, 0, 0, { cast: false });
  const tm = new THREE.MeshStandardMaterial({ color: 0xf0f6ee, emissive: color, emissiveIntensity: on ? 1.6 : 0 });
  add(g, C(0.022, 0.022, 1.2, 8), tm, 0, -0.04, 0.05, { rz: Math.PI / 2, cast: false });
  add(g, C(0.022, 0.022, 1.2, 8), tm, 0, -0.04, -0.05, { rz: Math.PI / 2, cast: false });
  const L = new THREE.RectAreaLight ? null : null; void L;
  const P = new THREE.PointLight(color, on ? intensity : 0, 7, 2); P.position.set(0, -0.3, 0); g.add(P);
  parent.add(g);
  return { group: g, light: P, tubeMat: tm, base: intensity };
}

// ---------------------------------------------------------------- kitchen
export function counter(parent, x, z, w, d = 0.7, ry = 0, top = Mats.steel()) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  add(g, B(w, 0.86, d), Mats.steelDirty(), 0, 0.43, 0);
  add(g, B(w + 0.04, 0.05, d + 0.04), top, 0, 0.885, 0);
  for (let i = 0; i < Math.floor(w / 0.6); i++) add(g, B(0.5, 0.65, 0.01), Mats.steel(), -w / 2 + 0.3 + i * 0.6, 0.42, d / 2 + 0.005, { cast: false });
  parent.add(g); return g;
}
export function grill(parent, x, z, ry = 0) {
  const g = counter(parent, x, z, 1.4, 0.8, ry, Mats.grease());
  add(g, B(1.3, 0.02, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.3, metalness: 0.7 }), 0, 0.92, 0);
  add(g, B(1.4, 0.3, 0.05), Mats.steel(), 0, 1.05, -0.38);
  for (let i = 0; i < 6; i++) add(g, C(0.05, 0.05, 0.015, 12), new THREE.MeshStandardMaterial({ color: 0x3a1c0c, roughness: 0.6 }), -0.5 + (i % 3) * 0.25, 0.94, -0.15 + Math.floor(i / 3) * 0.3);
  for (let i = 0; i < 4; i++) add(g, C(0.025, 0.025, 0.04, 10), Mats.dark(), -0.45 + i * 0.3, 0.65, 0.42, { rx: Math.PI / 2 });
  return g;
}
export function fryer(parent, x, z, ry = 0) {
  const g = counter(parent, x, z, 0.9, 0.8, ry, Mats.steel());
  for (const sx of [-1, 1]) {
    add(g, B(0.32, 0.02, 0.45), new THREE.MeshStandardMaterial({ color: 0x5a3a10, roughness: 0.15, metalness: 0.3 }), sx * 0.2, 0.9, 0);
    const bk = add(g, B(0.28, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x9a9a96, metalness: 0.8, roughness: 0.4, wireframe: true }), sx * 0.2, 1.05, -0.1);
    add(g, C(0.012, 0.012, 0.35, 6), Mats.rubber(), sx * 0.2, 1.1, 0.12, { rx: Math.PI / 2.4 });
    void bk;
  }
  return g;
}
export function hood(parent, x, y, z, w = 3, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  add(g, B(w, 0.5, 1.1), Mats.steelDirty(), 0, 0, 0);
  add(g, B(w - 0.1, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.4, metalness: 0.6 }), 0, -0.26, 0);
  for (let i = 0; i < 3; i++) { const p = hangingLamp(g, -w / 2 + 0.6 + i * (w - 1.2) / 2, -0.28, 0.2, { intensity: 0, cord: 0.02 }); p.light.intensity = 0; p.shade.visible = false; }
  parent.add(g); return g;
}
export function pans(parent, x, y, z, n = 5) {
  add(parent, C(0.01, 0.01, n * 0.32, 6), Mats.steel(), x, y, z, { rz: Math.PI / 2 });
  for (let i = 0; i < n; i++) {
    const p = new THREE.Group(); p.position.set(x - n * 0.16 + 0.16 + i * 0.32, y - 0.03, z);
    const r = 0.1 + rnd() * 0.06;
    add(p, C(0.008, 0.008, 0.25, 5), Mats.steelDirty(), 0, -0.12, 0);
    add(p, C(r, r * 0.85, 0.05, 16), Mats.steelDirty(), 0, -0.26 - r, 0, { rx: Math.PI / 2 });
    p.rotation.z = (rnd() - 0.5) * 0.1;
    parent.add(p);
  }
}
export function shelf(parent, x, z, w = 1.2, h = 1.8, ry = 0, fill = 'boxes') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, B(0.03, h, 0.03), Mats.steel(), sx * w / 2, h / 2, sz * 0.22);
  for (let i = 0; i < 4; i++) {
    const y = 0.15 + i * (h - 0.2) / 3;
    add(g, B(w, 0.02, 0.46), Mats.steel(), 0, y, 0);
    let px = -w / 2 + 0.05;
    while (px < w / 2 - 0.15) {
      const bw = 0.15 + rnd() * 0.25, bh = 0.12 + rnd() * 0.25;
      if (rnd() < 0.85) {
        if (fill === 'boxes') add(g, B(bw, bh, 0.36), new THREE.MeshStandardMaterial({ color: pick([0x9a7a4a, 0x8a6a3a, 0xb09060, 0x7a5a30]), roughness: 0.9 }), px + bw / 2, y + bh / 2 + 0.01, 0);
        else add(g, C(0.06, 0.06, bh, 10), new THREE.MeshStandardMaterial({ color: pick([0xb8221a, 0xd8a820, 0xe8e2d2, 0x2a6a2a]), roughness: 0.5 }), px + 0.06, y + bh / 2 + 0.01, (rnd() - 0.5) * 0.2);
      }
      px += bw + 0.03;
    }
  }
  parent.add(g); return g;
}
export function trashCan(parent, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  add(g, C(0.22, 0.19, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.7 }), 0, 0.35, 0);
  add(g, C(0.23, 0.23, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.6 }), 0, 0.72, 0);
  add(g, B(0.2, 0.02, 0.08), Mats.paper(), 0.05, 0.75, 0.05, { ry: 0.6 });
  parent.add(g); return g;
}
export function mopBucket(parent, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  add(g, B(0.42, 0.34, 0.32), Mats.plasticYellow(), 0, 0.2, 0);
  add(g, C(0.012, 0.012, 1.4, 6), Mats.wood(), 0.1, 0.8, -0.05, { rz: 0.25 });
  add(g, new THREE.SphereGeometry(0.12, 8, 6), Mats.paper(), -0.06, 0.15, 0, { s: 1 }).scale.set(1, 0.6, 1);
  // wet floor sign
  const s = new THREE.Group(); s.position.set(0.55, 0, 0.1);
  add(s, B(0.3, 0.6, 0.02), Mats.plasticYellow(), 0, 0.3, 0.08, { rx: -0.25 });
  add(s, B(0.3, 0.6, 0.02), Mats.plasticYellow(), 0, 0.3, -0.08, { rx: 0.25 });
  g.add(s);
  parent.add(g); return g;
}
export function speaker(parent, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  add(g, B(0.5, 0.8, 0.4), Mats.dark(), 0, 0, 0);
  add(g, C(0.16, 0.16, 0.02, 20), Mats.rubber(), 0, -0.12, 0.205, { rx: Math.PI / 2 });
  add(g, C(0.07, 0.07, 0.02, 16), Mats.rubber(), 0, 0.22, 0.205, { rx: Math.PI / 2 });
  parent.add(g); return g;
}
export function doorway(parent, x, z, ry, w = 1.2, h = 2.3, { frame = 0x3a2a1a, sign = null } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  add(g, new THREE.PlaneGeometry(w, h), Mats.black(), 0, h / 2, 0.005, { cast: false });
  const fm = new THREE.MeshStandardMaterial({ color: frame, roughness: 0.6 });
  add(g, B(0.08, h + 0.08, 0.1), fm, -w / 2 - 0.04, h / 2, 0.03);
  add(g, B(0.08, h + 0.08, 0.1), fm, w / 2 + 0.04, h / 2, 0.03);
  add(g, B(w + 0.16, 0.08, 0.1), fm, 0, h + 0.04, 0.03);
  if (sign) add(g, new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshStandardMaterial({ map: Tex.label(sign, { w: 512, h: 128, bg: '#1a3a1a', fg: '#9be89b', size: 80 }), emissive: 0x4a8a4a, emissiveMap: Tex.label(sign, { w: 512, h: 128, bg: '#1a3a1a', fg: '#9be89b', size: 80 }), emissiveIntensity: 0.8 }), 0, h + 0.22, 0.05, { cast: false });
  parent.add(g); return g;
}
export function wallClock(parent, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  add(g, C(0.18, 0.18, 0.05, 24), Mats.dark(), 0, 0, 0, { rx: Math.PI / 2 });
  add(g, C(0.16, 0.16, 0.01, 24), Mats.paper(), 0, 0, 0.03, { rx: Math.PI / 2 });
  add(g, B(0.01, 0.11, 0.005), Mats.dark(), 0, 0.04, 0.04, { rz: 0.6 });
  add(g, B(0.012, 0.08, 0.005), Mats.dark(), 0, 0.03, 0.042, { rz: -1.9 });
  parent.add(g); return g;
}
export function arcade(parent, x, z, ry = 0, color = 0x2a3a8a) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  add(g, B(0.7, 1.75, 0.75), cm, 0, 0.875, 0);
  add(g, B(0.55, 0.42, 0.04), new THREE.MeshStandardMaterial({ color: 0x0a120a, emissive: 0x0a2a18, emissiveIntensity: 0.6, roughness: 0.2 }), 0, 1.3, 0.37, { rx: -0.2 });
  add(g, B(0.7, 0.12, 0.35), cm, 0, 0.98, 0.45);
  add(g, B(0.6, 0.2, 0.05), new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xff9020, emissiveIntensity: 0.5 }), 0, 1.65, 0.38);
  add(g, C(0.015, 0.015, 0.08, 6), Mats.dark(), -0.15, 1.08, 0.48);
  add(g, new THREE.SphereGeometry(0.025, 8, 6), Mats.plasticRed(), -0.15, 1.13, 0.48);
  parent.add(g); return g;
}

// ---------------------------------------------------------------- grime + dressing
const decalMats = {};
export function decal(parent, tex, x, y, z, rx, ry, w, h, { opacity = 1, glossy = false, rz = 0 } = {}) {
  const key = tex.uuid + opacity + glossy;
  const m = decalMats[key] || (decalMats[key] = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: glossy ? 0.12 : 0.95, metalness: 0, color: 0xffffff }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz, 'YXZ');
  mesh.receiveShadow = true; mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}
export function wallCam(parent, x, y, z, ry, pitch = 0.5) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  add(g, B(0.08, 0.12, 0.06), Mats.steelDirty(), 0, 0, -0.03);
  add(g, C(0.012, 0.012, 0.16, 6), Mats.steelDirty(), 0, -0.06, 0.06, { rx: Math.PI / 2 });
  const body = new THREE.Group(); body.position.set(0, -0.08, 0.14); body.rotation.x = pitch; g.add(body);
  add(body, B(0.1, 0.09, 0.24), new THREE.MeshStandardMaterial({ color: 0xc8c4b8, roughness: 0.6 }), 0, 0, 0);
  add(body, B(0.12, 0.012, 0.28), new THREE.MeshStandardMaterial({ color: 0xb8b4a8, roughness: 0.6 }), 0, 0.052, 0.02);
  add(body, C(0.028, 0.028, 0.02, 14), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.5 }), 0, 0, 0.125, { rx: Math.PI / 2 });
  add(body, new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 2 }), 0.035, 0.025, 0.12, { cast: false });
  return g;
}
export function outlet(parent, x, y, z, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  add(g, B(0.08, 0.12, 0.012), new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.7 }), 0, 0, 0.006, { cast: false });
  for (const dy of [-0.025, 0.025]) add(g, B(0.03, 0.03, 0.004), Mats.dark(), 0, dy, 0.013, { cast: false });
  return g;
}
export function vent(parent, x, y, z, rx, ry, w = 0.6, h = 0.35) {
  const m = new THREE.MeshStandardMaterial({ map: Tex.vent(), roughness: 0.6, metalness: 0.4 });
  const v = add(parent, new THREE.PlaneGeometry(w, h), m, x, y, z, { cast: false });
  v.rotation.set(rx, ry, 0, 'YXZ');
  return v;
}
export function extinguisher(parent, x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0.9, z); g.rotation.y = ry; parent.add(g);
  add(g, C(0.075, 0.075, 0.46, 14), new THREE.MeshStandardMaterial({ color: 0x8a0e0e, roughness: 0.35, metalness: 0.2 }), 0, 0, 0.08);
  add(g, new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a0e0e, roughness: 0.35 }), 0, 0.23, 0.08);
  add(g, C(0.02, 0.02, 0.08, 8), Mats.dark(), 0, 0.3, 0.08);
  add(g, B(0.1, 0.02, 0.06), Mats.dark(), 0.03, 0.34, 0.08);
  add(g, C(0.01, 0.01, 0.3, 6), Mats.rubber(), -0.08, 0.12, 0.08, { rz: 0.2 });
  add(g, B(0.16, 0.5, 0.02), Mats.steelDirty(), 0, 0.05, 0.0);
  return g;
}
export function conduit(parent, pts, r = 0.015) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05);
  return add(parent, new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 6), Mats.steelDirty(), 0, 0, 0, { cast: true });
}

// dress a box room with grime, cobwebs, a vent, outlets, a security camera, conduit
export function dress(S, { w, d, h, floor = 10, walls = 8, ceil = 4, webs = 3, cam = true, ventPos = null, outlets = 3, stains = ['dirt', 'water', 'soda'] }) {
  const kinds = stains;
  for (let i = 0; i < floor; i++) {
    const k = pick(kinds), s = 0.6 + rnd() * 1.6;
    decal(S, Tex.stain(i + 3, k), (rnd() - 0.5) * (w - s), 0.003 + i * 0.0004, (rnd() - 0.5) * (d - s), -Math.PI / 2, 0, s, s * (0.6 + rnd() * 0.8), { glossy: k === 'soda' || (k === 'water' && rnd() < 0.5), rz: rnd() * 6 });
  }
  const wallsList = [[0, d / 2 - 0.006, Math.PI, w], [0, -d / 2 + 0.006, 0, w], [-w / 2 + 0.006, 0, Math.PI / 2, d], [w / 2 - 0.006, 0, -Math.PI / 2, d]];
  for (let i = 0; i < walls; i++) {
    const [wx, wz, ry, len] = pick(wallsList);
    const along = (rnd() - 0.5) * (len - 1);
    const x = ry === 0 || ry === Math.PI ? along : wx, z = ry === 0 || ry === Math.PI ? wz : along;
    const drip = rnd() < 0.5;
    const sw = drip ? 0.6 + rnd() * 0.8 : 0.5 + rnd() * 1.2, sh = drip ? 1.2 + rnd() * 1.2 : sw * (0.6 + rnd() * 0.6);
    decal(S, Tex.stain(i + 40, drip ? 'drip' : pick(['dirt', 'soot', 'water'])), x, drip ? h - sh / 2 - rnd() * 0.3 : 0.2 + sh / 2 + rnd() * (h * 0.6), z, 0, ry, sw, sh, { opacity: 0.9 });
  }
  for (let i = 0; i < ceil; i++) {
    const s = 0.6 + rnd() * 1.2;
    decal(S, Tex.stain(i + 70, 'water'), (rnd() - 0.5) * (w - s), h - 0.004, (rnd() - 0.5) * (d - s), Math.PI / 2, 0, s, s, { rz: rnd() * 6 });
  }
  // cobwebs in the upper corners
  const corners = [[-w / 2, -d / 2, 0], [w / 2, -d / 2, -Math.PI / 2], [w / 2, d / 2, Math.PI], [-w / 2, d / 2, Math.PI / 2]];
  const wm = new THREE.MeshBasicMaterial({ map: Tex.web(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.7 });
  for (let i = 0; i < webs; i++) {
    const [cx, cz, ry] = corners[i % 4];
    const g = new THREE.Group(); g.position.set(cx, h, cz); g.rotation.y = ry; S.add(g);
    const sz = 0.45 + rnd() * 0.35;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), wm); m.position.set(sz / 2 * 0.7, -sz / 2 * 0.7, sz * 0.35); m.rotation.set(0, Math.PI / 4, Math.PI); g.add(m);
  }
  // outlets low on the walls
  for (let i = 0; i < outlets; i++) {
    const [wx, wz, ry, len] = wallsList[i % 4];
    const along = (rnd() - 0.5) * (len - 1.2);
    outlet(S, ry === 0 || ry === Math.PI ? along : wx, 0.32, ry === 0 || ry === Math.PI ? wz : along, ry);
  }
  // ceiling vent
  const vp = ventPos || [(rnd() - 0.5) * (w - 1.5), (rnd() - 0.5) * (d - 1.5)];
  vent(S, vp[0], h - 0.005, vp[1], Math.PI / 2, 0, 0.6, 0.6);
  // conduit running along the top of the back wall and down to a junction box
  const cy = h - 0.15, bz = -d / 2 + 0.05, x0 = -w / 2 + 0.3, x1 = -w / 2 + Math.min(w * 0.6, 4);
  conduit(S, [[x0, cy, bz], [x1, cy, bz], [x1 + 0.05, cy - 0.05, bz], [x1 + 0.05, 1.5, bz]]);
  add(S, B(0.18, 0.22, 0.08), Mats.steelDirty(), x1 + 0.05, 1.4, bz + 0.03);
  // a security camera in a corner, looking into the room
  if (cam) wallCam(S, w / 2 - 0.12, h - 0.12, -d / 2 + 0.12, -Math.PI * 0.75, 0.55);
}
