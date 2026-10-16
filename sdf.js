// Signed-distance-field sculpting: smooth-blended primitives polygonised with
// surface nets. Gives organic, single-skin shapes (heads, torsos, hands) with
// baked ambient occlusion and per-region vertex colours.
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// ---------- primitives (each returns distance at p) ----------
export const sd = {
  sphere: (c, r) => (p) => len3(p.x - c.x, p.y - c.y, p.z - c.z) - r,
  // approximate ellipsoid (iq)
  ellipsoid: (c, rx, ry, rz) => (p) => {
    const x = (p.x - c.x) / rx, y = (p.y - c.y) / ry, z = (p.z - c.z) / rz;
    const k0 = len3(x, y, z);
    const k1 = len3(x / rx, y / ry, z / rz);
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  },
  capsule: (a, b, r) => (p) => {
    const pax = p.x - a.x, pay = p.y - a.y, paz = p.z - a.z;
    const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  },
  // capsule with different radii at each end
  cone: (a, b, ra, rb) => (p) => {
    const pax = p.x - a.x, pay = p.y - a.y, paz = p.z - a.z;
    const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
  },
  box: (c, hx, hy, hz, r = 0) => (p) => {
    const qx = Math.abs(p.x - c.x) - hx + r, qy = Math.abs(p.y - c.y) - hy + r, qz = Math.abs(p.z - c.z) - hz + r;
    return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  },
  // torus lying in the XZ plane (axis Y)
  torusY: (c, R, r) => (p) => { const qx = Math.hypot(p.x - c.x, p.z - c.z) - R; return Math.hypot(qx, p.y - c.y) - r; },
  // torus around Z axis (ring facing forward)
  torusZ: (c, R, r) => (p) => { const qx = Math.hypot(p.x - c.x, p.y - c.y) - R; return Math.hypot(qx, p.z - c.z) - r; },
};

export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }

// Build a shape description: list of ops applied in order.
// ops: { f, k, mode: 'add'|'sub'|'int', mat }
export class Sculpt {
  constructor() { this.ops = []; this.paint = []; }
  add(f, k = 0.02, mat = 0) { this.ops.push({ f, k, mode: 'add', mat }); return this; }
  sub(f, k = 0.01) { this.ops.push({ f, k, mode: 'sub' }); return this; }
  // paint regions: a distance function and a material id; nearest painted region inside 'w' wins
  region(f, mat, w = 0.0) { this.paint.push({ f, mat, w }); return this; }
  dist(p) {
    let d = 1e9;
    for (const o of this.ops) {
      const v = o.f(p);
      if (o.mode === 'add') d = o.k > 0 ? smin(d, v, o.k) : Math.min(d, v);
      else if (o.mode === 'sub') d = o.k > 0 ? smax(d, -v, o.k) : Math.max(d, -v);
    }
    return d;
  }
  mat(p) {
    // regions override, else the closest additive op's material
    for (const r of this.paint) if (r.f(p) < r.w) return r.mat;
    let best = 1e9, m = 0;
    for (const o of this.ops) if (o.mode === 'add') { const v = o.f(p); if (v < best) { best = v; m = o.mat; } }
    return m;
  }
}

// Polygonise with naive surface nets.
// palette: array of THREE.Color per material id. opts: bounds {min,max}, res (cells on longest axis)
export function meshSculpt(sc, { min, max, res = 56, palette, ao = true, noise = 0.06, grime = 0.0, seed = 1 }) {
  const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
  const h = Math.max(sx, sy, sz) / res;
  const nx = Math.ceil(sx / h) + 2, ny = Math.ceil(sy / h) + 2, nz = Math.ceil(sz / h) + 2;
  const ox = min.x - h, oy = min.y - h, oz = min.z - h;
  const field = new Float32Array(nx * ny * nz);
  const P = { x: 0, y: 0, z: 0 };
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    P.x = ox + i * h; P.y = oy + j * h; P.z = oz + k * h;
    field[idx(i, j, k)] = sc.dist(P);
  }
  const vidx = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cornerOff = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const o = cornerOff[c];
      cv[c] = field[idx(i + o[0], j + o[1], k + o[2])];
      if (cv[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let ax = 0, ay = 0, az = 0, n = 0;
    for (const [a, b] of E) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = cornerOff[a], B = cornerOff[b];
      ax += A[0] + (B[0] - A[0]) * t; ay += A[1] + (B[1] - A[1]) * t; az += A[2] + (B[2] - A[2]) * t; n++;
    }
    vidx[idx(i, j, k)] = pos.length / 3;
    pos.push(ox + (i + ax / n) * h, oy + (j + ay / n) * h, oz + (k + az / n) * h);
  }
  const ind = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[idx(i, j, k)] < 0;
    if (i < nx - 1 && v0 !== (field[idx(i + 1, j, k)] < 0))
      quad(vidx[idx(i, j - 1, k - 1)], vidx[idx(i, j, k - 1)], vidx[idx(i, j, k)], vidx[idx(i, j - 1, k)], !v0);
    if (j < ny - 1 && v0 !== (field[idx(i, j + 1, k)] < 0))
      quad(vidx[idx(i - 1, j, k - 1)], vidx[idx(i - 1, j, k)], vidx[idx(i, j, k)], vidx[idx(i, j, k - 1)], !v0);
    if (k < nz - 1 && v0 !== (field[idx(i, j, k + 1)] < 0))
      quad(vidx[idx(i - 1, j - 1, k)], vidx[idx(i, j - 1, k)], vidx[idx(i, j, k)], vidx[idx(i - 1, j, k)], !v0);
  }
  // normals from field gradient, colours from material + AO + noise
  const nv = pos.length / 3;
  const nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const e = h * 0.5;
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const tmp = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    P.x = x + e; P.y = y; P.z = z; const dx1 = sc.dist(P); P.x = x - e; const dx0 = sc.dist(P);
    P.x = x; P.y = y + e; const dy1 = sc.dist(P); P.y = y - e; const dy0 = sc.dist(P);
    P.y = y; P.z = z + e; const dz1 = sc.dist(P); P.z = z - e; const dz0 = sc.dist(P);
    let gx = dx1 - dx0, gy = dy1 - dy0, gz = dz1 - dz0;
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
    P.x = x; P.y = y; P.z = z;
    const m = sc.mat(P);
    tmp.copy(palette[m] || palette[0]);
    let k = 1;
    if (ao) { // crevice darkening
      let occ = 0;
      for (let st = 1; st <= 4; st++) {
        const dd = st * 0.012;
        P.x = x + gx * dd; P.y = y + gy * dd; P.z = z + gz * dd;
        occ += (dd - sc.dist(P)) / Math.pow(2, st);
      }
      k *= Math.max(0.35, 1 - occ * 18);
    }
    k *= 1 - noise + rnd() * noise * 2;
    // grime collects lower down and in random blotches
    if (grime > 0) k *= 1 - grime * (0.5 + 0.5 * Math.sin(x * 37 + Math.sin(z * 23) * 3) * Math.sin(y * 41 + x * 13));
    col[v * 3] = tmp.r * k; col[v * 3 + 1] = tmp.g * k; col[v * 3 + 2] = tmp.b * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(ind);
  g.computeBoundingSphere();
  return g;
}
