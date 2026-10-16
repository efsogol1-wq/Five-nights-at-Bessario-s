// Five Nights at Bessario's — the animatronics.
// Heads, torsos, hands, feet and tails are sculpted as smooth SDF skins (see sdf.js);
// limbs are lathed; details (eyes, lids, teeth, hats, bolts, props) are separate parts.
// Characters face +Z; their left side is +X.
import * as THREE from 'three';
import { Tex } from '../world/textures.js';
import { V, sd, Sculpt, meshSculpt } from './sdf.js';

export const CHAR_INFO = {
  bessario: { name: 'BESSARIO', title: 'The Head Chef', color: '#a0612c', desc: 'Won\'t move while you watch him. Comes down the East Hall to your right door. Listen for the laugh.' },
  kiril: { name: 'KIRIL', title: 'The Fry Cook', color: '#5f8a3e', desc: 'Prowls the West Hall to your left door. Check the left light.' },
  kira: { name: 'KIRA', title: 'The Carhop', color: '#d68ab4', desc: 'Skates through the Kitchen to the order hatch in front of you.' },
  lebron: { name: 'LEBRON', title: 'The Drive-Thru Bull', color: '#a8432a', desc: 'Locked in the Freezer. Re-lock it on CAM 3 or he breaks out and charges the left door.' },
  victor: { name: 'VICTOR', title: '???', color: '#d4a93a', desc: 'He is not supposed to be here. Don\'t look at him for long.' },
};

const col = (h) => new THREE.Color(h);

// triplanar detail texture (fur / scales) for meshes without UVs
function skinMat({ color = 0xffffff, vertexColors = false, roughness = 0.85, metalness = 0, detail = null, scale = 6, strength = 0.55, sheen = 0.7 } = {}) {
  // physical material with sheen: the soft rim highlight of felt / faux fur on old animatronic suits
  const m = new THREE.MeshPhysicalMaterial({ color, vertexColors, roughness, metalness, sheen, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x9a8a78) });
  if (detail) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tDetail = { value: detail };
      sh.uniforms.uDetScale = { value: scale };
      sh.uniforms.uDetStr = { value: strength };
      sh.vertexShader = 'varying vec3 vTriPos;\nvarying vec3 vTriNor;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = position; vTriNor = normal;');
      sh.fragmentShader = 'uniform sampler2D tDetail;\nuniform float uDetScale;\nuniform float uDetStr;\nvarying vec3 vTriPos;\nvarying vec3 vTriNor;\n' +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(normalize(vTriNor)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-5);
        vec3 tp = vTriPos * uDetScale;
        float dtl = texture2D(tDetail, tp.yz).r * bw.x + texture2D(tDetail, tp.xz).r * bw.y + texture2D(tDetail, tp.xy).r * bw.z;
        diffuseColor.rgb *= mix(1.0, dtl * 1.45, uDetStr);`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.6 + dtl * 0.8, uDetStr), 0.05, 1.0);`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 tq = vTriPos * uDetScale; float e = 0.004;
          float h0 = texture2D(tDetail, tq.xy).r; float hx = texture2D(tDetail, tq.xy + vec2(e, 0.0)).r; float hy = texture2D(tDetail, tq.xy + vec2(0.0, e)).r;
          normal = normalize(normal + (vec3(h0 - hx, h0 - hy, 0.0)) * uDetStr * 1.6); }`);
    };
    m.customProgramCacheKey = () => 'tri' + scale + strength;
  }
  return m;
}

function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function pivot(parent, x = 0, y = 0, z = 0, name = '') {
  const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g;
}
const sph = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt, rb, h, s = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const box = (w, h, d, a, b, c) => new THREE.BoxGeometry(w, h, d, a, b, c);

// limb lathed along -Y. profile: [[radius, t(0..1)], ...] from top (t=0) to bottom
function limb(profile, length, segs = 18) {
  const pts = profile.slice().reverse().map(([r, t]) => new THREE.Vector2(Math.max(0.001, r), -t * length));
  return new THREE.LatheGeometry(pts, segs);
}

// find the surface along a ray starting inside a sculpt
function surface(sc, from, dir, maxD = 0.6) {
  let t = 0; const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 120; i++) {
    p.x = from.x + dir.x * t; p.y = from.y + dir.y * t; p.z = from.z + dir.z * t;
    const d = sc.dist(p);
    if (d > -0.0005 && t > 0.01) break;
    t += Math.max(0.002, Math.abs(d) * 0.5);
    if (t > maxD) break;
  }
  return new THREE.Vector3(p.x, p.y, p.z);
}

function mustacheGeo(scale = 1) {
  const s = new THREE.Shape();
  const P = (x, y) => [(x - 100) / 200 * scale, -(y - 30) / 200 * scale];
  s.moveTo(...P(100, 30));
  s.bezierCurveTo(...P(93, 18), ...P(74, 16), ...P(60, 26)); s.bezierCurveTo(...P(48, 35), ...P(36, 44), ...P(22, 38));
  s.bezierCurveTo(...P(11, 33), ...P(11, 18), ...P(24, 17)); s.bezierCurveTo(...P(18, 22), ...P(20, 30), ...P(29, 30));
  s.bezierCurveTo(...P(40, 30), ...P(46, 17), ...P(63, 12)); s.bezierCurveTo(...P(79, 8), ...P(93, 15), ...P(100, 22));
  s.bezierCurveTo(...P(107, 15), ...P(121, 8), ...P(137, 12)); s.bezierCurveTo(...P(154, 17), ...P(160, 30), ...P(171, 30));
  s.bezierCurveTo(...P(180, 30), ...P(182, 22), ...P(176, 17)); s.bezierCurveTo(...P(189, 18), ...P(189, 33), ...P(178, 38));
  s.bezierCurveTo(...P(164, 44), ...P(152, 35), ...P(140, 26)); s.bezierCurveTo(...P(126, 16), ...P(107, 18), ...P(100, 30));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02 * scale, bevelEnabled: true, bevelThickness: 0.012 * scale, bevelSize: 0.01 * scale, bevelSegments: 3, curveSegments: 14 });
  g.center();
  return g;
}

// a dim "room" environment for glossy reflections in eyes, teeth and metal
let ENV = null;
export function setEnvironment(renderer) {
  if (ENV) return ENV;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#1a1814'); g.addColorStop(0.5, '#0b0a08'); g.addColorStop(1, '#050404');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  for (const [px, py, r, a] of [[64, 22, 10, 1], [190, 26, 7, 0.8], [128, 12, 14, 0.9], [30, 60, 20, 0.15], [220, 64, 24, 0.12]]) {
    const rg = x.createRadialGradient(px, py, 0, px, py, r); rg.addColorStop(0, `rgba(255,236,200,${a})`); rg.addColorStop(1, 'rgba(255,236,200,0)');
    x.fillStyle = rg; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  ENV = pm.fromEquirectangular(tex).texture;
  pm.dispose();
  return ENV;
}
const irisCache = {};
function irisTex(hex, kind) {
  if (irisCache[kind]) return irisCache[kind];
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), base = new THREE.Color(hex);
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  const rgb = (k) => `rgb(${Math.round(base.r * 255 * k)},${Math.round(base.g * 255 * k)},${Math.round(base.b * 255 * k)})`;
  const g = x.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S / 2);
  g.addColorStop(0, rgb(1.3)); g.addColorStop(0.55, rgb(1.0)); g.addColorStop(0.9, rgb(0.45)); g.addColorStop(1, '#050505');
  x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, 7); x.fill();
  for (let i = 0; i < 140; i++) { // fibres
    const a = Math.random() * Math.PI * 2, r0 = 10 + Math.random() * 14, r1 = 40 + Math.random() * 22;
    x.strokeStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.35)' : rgb(1.6).replace('rgb', 'rgba').replace(')', ',0.35)');
    x.lineWidth = 1 + Math.random(); x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); x.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); x.stroke();
  }
  x.strokeStyle = 'rgba(0,0,0,0.85)'; x.lineWidth = 5; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 3, 0, 7); x.stroke(); // limbal ring
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (irisCache[kind] = t);
}

const geoCache = {};
const cachedGeo = (key, fn) => geoCache[key] || (geoCache[key] = fn());

function handGeo(key, palette, { fat = 1, claws = false, bare = false } = {}) {
  return cachedGeo('hand' + key, () => {
    const sc = new Sculpt();
    const f = fat;
    sc.add(sd.ellipsoid(V(0, -0.06, 0), 0.06 * f, 0.07, 0.035 * f), 0, 0);
    sc.add(sd.capsule(V(0, -0.01, 0), V(0, -0.05, 0), 0.03), 0.03, 0);
    const fingers = [[-0.036, -0.13, 0.95], [-0.012, -0.135, 1.0], [0.012, -0.133, 1.0], [0.036, -0.125, 0.9]];
    for (const [x, y, l] of fingers) {
      const a = V(x * f, -0.11, 0.005), b = V(x * f * 1.05, y - 0.03 * l, 0.03), c = V(x * f * 1.05, y - 0.055 * l, 0.07);
      sc.add(sd.capsule(a, b, (bare ? 0.011 : 0.017) * f), 0.012, 0);
      sc.add(sd.capsule(b, c, (bare ? 0.01 : 0.015) * f), 0.008, 0);
      if (claws) sc.add(sd.cone(c, V(c.x, c.y - 0.012, c.z + 0.035), 0.01, 0.002), 0.004, 2);
      sc.sub(sd.sphere(V(x * f * 1.05, y - 0.028 * l, 0.052), 0.006), 0.004);
    }
    sc.add(sd.capsule(V(-0.05 * f, -0.06, 0.02), V(-0.075 * f, -0.1, 0.06), (bare ? 0.011 : 0.017) * f), 0.015, 0);
    return meshSculpt(sc, { min: V(-0.12, -0.25, -0.07), max: V(0.12, 0.02, 0.14), res: 44, palette, noise: bare ? 0.02 : 0.08 });
  });
}

function footGeo(key, palette, { skates = false, big = 1 } = {}) {
  return cachedGeo('foot' + key, () => {
    const sc = new Sculpt();
    const b = big;
    sc.add(sd.ellipsoid(V(0, -0.04, 0.09 * b), 0.1 * b, 0.065, 0.16 * b), 0, 0);
    sc.add(sd.ellipsoid(V(0, -0.03, -0.03), 0.08 * b, 0.07, 0.08), 0.06, 0);
    sc.add(sd.capsule(V(0, 0.0, 0), V(0, 0.06, 0), 0.06), 0.04, 0);
    for (const x of [-0.05, 0, 0.05]) sc.sub(sd.capsule(V(x * b, -0.02, 0.245 * b), V(x * b, -0.06, 0.245 * b), 0.006), 0.006);
    sc.sub(sd.box(V(0, -0.15, 0.05), 0.2, 0.05, 0.3), 0.005);
    if (skates) sc.region(sd.box(V(0, 0.0, 0.05), 0.2, 0.2, 0.3), 1);
    return meshSculpt(sc, { min: V(-0.14, -0.11, -0.13), max: V(0.14, 0.09, 0.27 * b + 0.02), res: 40, palette, noise: 0.06 });
  });
}

// ======================================================================
// HEADS. Head pivot sits at the top of the neck; the face points +Z.
// ======================================================================
function headBear() {
  const sc = new Sculpt();
  sc.add(sd.ellipsoid(V(0, 0.2, -0.01), 0.25, 0.235, 0.235), 0, 0);
  for (const s of [-1, 1]) sc.add(sd.ellipsoid(V(s * 0.13, 0.08, 0.07), 0.13, 0.11, 0.12), 0.07, 0);
  sc.add(sd.capsule(V(-0.1, 0.3, 0.165), V(0.1, 0.3, 0.165), 0.045), 0.05, 0);
  sc.add(sd.ellipsoid(V(0, 0.105, 0.2), 0.15, 0.085, 0.125), 0.045, 1);
  sc.add(sd.ellipsoid(V(0, 0.16, 0.315), 0.058, 0.038, 0.038), 0.012, 2);
  for (const s of [-1, 1]) {
    sc.add(sd.ellipsoid(V(s * 0.205, 0.38, -0.04), 0.085, 0.085, 0.04), 0.035, 0);
    sc.sub(sd.sphere(V(s * 0.205, 0.38, 0.0), 0.05), 0.02);
    sc.region(sd.sphere(V(s * 0.205, 0.38, 0.0), 0.068), 3);
    sc.sub(sd.ellipsoid(V(s * 0.095, 0.235, 0.215), 0.062, 0.058, 0.045), 0.015);
    sc.region(sd.ellipsoid(V(s * 0.095, 0.235, 0.215), 0.07, 0.066, 0.055), 4);
  }
  sc.sub(sd.box(V(0, 0.025, 0.2), 0.15, 0.028, 0.16), 0.012);
  sc.region(sd.box(V(0, 0.05, 0.2), 0.16, 0.03, 0.17), 4);
  sc.sub(sd.capsule(V(0, 0.44, -0.18), V(0, 0.43, 0.08), 0.005), 0.003);
  const jaw = new Sculpt();
  jaw.add(sd.ellipsoid(V(0, -0.03, 0.15), 0.135, 0.05, 0.13), 0, 1);
  jaw.add(sd.ellipsoid(V(0, -0.05, 0.19), 0.08, 0.04, 0.08), 0.04, 1);
  jaw.sub(sd.ellipsoid(V(0, 0.018, 0.14), 0.11, 0.022, 0.1), 0.01);
  jaw.region(sd.ellipsoid(V(0, 0.018, 0.14), 0.115, 0.027, 0.105), 4);
  return {
    sc, bounds: { min: V(-0.32, -0.06, -0.28), max: V(0.32, 0.5, 0.38) },
    eyes: [-1, 1].map((s) => ({ x: s * 0.095, y: 0.235, z: 0.205, r: 0.052 })),
    teeth: { y: 0.052, cz: 0.2, rx: 0.13, rz: 0.11, n: 10, h: 0.04 },
    jaw: { pivot: V(0, 0.0, 0.03), sc: jaw, bounds: { min: V(-0.17, -0.13, -0.05), max: V(0.17, 0.05, 0.33) }, teeth: { y: 0.012, cz: 0.15, rx: 0.11, rz: 0.1, n: 9, h: 0.03 } },
  };
}

function headCroc() {
  const sc = new Sculpt();
  sc.add(sd.ellipsoid(V(0, 0.17, -0.05), 0.2, 0.17, 0.21), 0, 0);
  sc.add(sd.ellipsoid(V(0, 0.115, 0.22), 0.135, 0.07, 0.25), 0.08, 0);
  sc.add(sd.ellipsoid(V(0, 0.11, 0.42), 0.105, 0.062, 0.075), 0.06, 0);
  for (const s of [-1, 1]) {
    sc.add(sd.ellipsoid(V(s * 0.09, 0.27, 0.09), 0.068, 0.062, 0.07), 0.045, 0);
    sc.sub(sd.sphere(V(s * 0.09, 0.28, 0.135), 0.046), 0.012);
    sc.region(sd.sphere(V(s * 0.09, 0.28, 0.135), 0.056), 4);
    sc.add(sd.sphere(V(s * 0.035, 0.168, 0.45), 0.024), 0.02, 0);
    sc.sub(sd.sphere(V(s * 0.035, 0.18, 0.462), 0.01), 0.004);
    for (let i = 0; i < 5; i++) sc.add(sd.sphere(V(s * (0.12 - i * 0.003), 0.16, 0.36 - i * 0.07), 0.016), 0.02, 0);
  }
  for (let i = 0; i < 7; i++) sc.add(sd.ellipsoid(V(0, 0.33 - i * 0.012, 0.02 - i * 0.06), 0.022, 0.035, 0.025), 0.02, 2);
  for (let i = 0; i < 9; i++) sc.add(sd.sphere(V((i % 3 - 1) * 0.045, 0.235 + Math.sin(i) * 0.01, 0.06 + Math.floor(i / 3) * 0.08), 0.017), 0.015, 0);
  sc.sub(sd.box(V(0, 0.04, 0.24), 0.135, 0.03, 0.27), 0.01);
  sc.region(sd.box(V(0, 0.07, 0.24), 0.14, 0.025, 0.28), 4);
  sc.region((p) => p.y - 0.09, 1);
  const jaw = new Sculpt();
  jaw.add(sd.ellipsoid(V(0, -0.035, 0.2), 0.125, 0.045, 0.26), 0, 1);
  jaw.add(sd.ellipsoid(V(0, -0.03, 0.38), 0.095, 0.04, 0.07), 0.05, 1);
  jaw.sub(sd.ellipsoid(V(0, 0.01, 0.2), 0.1, 0.02, 0.23), 0.01);
  jaw.region(sd.ellipsoid(V(0, 0.01, 0.2), 0.105, 0.025, 0.235), 5);
  return {
    sc, bounds: { min: V(-0.27, -0.06, -0.3), max: V(0.27, 0.42, 0.52) },
    eyes: [-1, 1].map((s) => ({ x: s * 0.09, y: 0.28, z: 0.13, r: 0.042, reptile: true })),
    teeth: { y: 0.07, cz: 0.2, rx: 0.12, rz: 0.27, n: 18, h: 0.05, fang: true },
    jaw: { pivot: V(0, 0.015, 0.0), sc: jaw, bounds: { min: V(-0.17, -0.1, -0.1), max: V(0.17, 0.04, 0.48) }, teeth: { y: 0.012, cz: 0.2, rx: 0.105, rz: 0.24, n: 16, h: 0.044, fang: true } },
  };
}

function headCat() {
  const sc = new Sculpt();
  sc.add(sd.ellipsoid(V(0, 0.2, 0), 0.235, 0.215, 0.215), 0, 0);
  for (const s of [-1, 1]) {
    sc.add(sd.ellipsoid(V(s * 0.15, 0.08, 0.07), 0.125, 0.095, 0.1), 0.06, 1);
    sc.add(sd.cone(V(s * 0.22, 0.08, 0.04), V(s * 0.32, 0.03, 0.0), 0.05, 0.008), 0.03, 1);
    sc.add(sd.cone(V(s * 0.21, 0.12, 0.03), V(s * 0.3, 0.13, -0.02), 0.04, 0.006), 0.03, 1);
    sc.add(sd.cone(V(s * 0.13, 0.36, -0.02), V(s * 0.21, 0.54, -0.04), 0.075, 0.012), 0.04, 0);
    sc.sub(sd.cone(V(s * 0.13, 0.37, 0.02), V(s * 0.2, 0.5, 0.0), 0.05, 0.006), 0.012);
    sc.region(sd.cone(V(s * 0.13, 0.37, 0.02), V(s * 0.2, 0.5, 0.0), 0.06, 0.012), 3);
    sc.add(sd.ellipsoid(V(s * 0.045, 0.11, 0.195), 0.06, 0.048, 0.05), 0.03, 1);
    sc.sub(sd.ellipsoid(V(s * 0.1, 0.24, 0.19), 0.07, 0.065, 0.05), 0.015);
    sc.region(sd.ellipsoid(V(s * 0.1, 0.24, 0.19), 0.078, 0.073, 0.06), 4);
  }
  sc.add(sd.ellipsoid(V(0, 0.15, 0.245), 0.032, 0.022, 0.02), 0.01, 3);
  sc.add(sd.capsule(V(-0.1, 0.31, 0.17), V(0.1, 0.31, 0.17), 0.035), 0.05, 0);  // brow ridge
  sc.sub(sd.ellipsoid(V(0.13, 0.12, 0.17), 0.05, 0.035, 0.05), 0.008);          // torn cheek
  sc.region(sd.ellipsoid(V(0.13, 0.12, 0.17), 0.06, 0.045, 0.06), 6);
  sc.sub(sd.box(V(0, 0.03, 0.18), 0.1, 0.022, 0.12), 0.01);
  sc.region(sd.box(V(0, 0.05, 0.18), 0.11, 0.025, 0.13), 4);
  const jaw = new Sculpt();
  jaw.add(sd.ellipsoid(V(0, -0.03, 0.12), 0.09, 0.045, 0.1), 0, 1);
  jaw.sub(sd.ellipsoid(V(0, 0.0, 0.11), 0.07, 0.02, 0.08), 0.01);
  jaw.region(sd.ellipsoid(V(0, 0.0, 0.11), 0.075, 0.025, 0.085), 4);
  return {
    sc, bounds: { min: V(-0.36, -0.05, -0.25), max: V(0.36, 0.58, 0.32) },
    eyes: [-1, 1].map((s) => ({ x: s * 0.1, y: 0.24, z: 0.18, r: 0.058, lashes: true })),
    teeth: { y: 0.051, cz: 0.17, rx: 0.08, rz: 0.08, n: 8, h: 0.03 },
    jaw: { pivot: V(0, 0.008, 0.03), sc: jaw, bounds: { min: V(-0.12, -0.09, -0.02), max: V(0.12, 0.03, 0.25) }, teeth: { y: 0.008, cz: 0.115, rx: 0.07, rz: 0.075, n: 7, h: 0.026 } },
  };
}

function headBull() {
  const sc = new Sculpt();
  sc.add(sd.ellipsoid(V(0, 0.21, -0.02), 0.27, 0.24, 0.24), 0, 0);
  sc.add(sd.capsule(V(-0.13, 0.32, 0.18), V(0.13, 0.32, 0.18), 0.05), 0.06, 0);
  sc.add(sd.ellipsoid(V(0, 0.09, 0.22), 0.2, 0.11, 0.14), 0.06, 1);
  for (const s of [-1, 1]) {
    sc.sub(sd.ellipsoid(V(s * 0.065, 0.11, 0.355), 0.03, 0.04, 0.03), 0.01);
    sc.region(sd.ellipsoid(V(s * 0.065, 0.11, 0.355), 0.04, 0.05, 0.04), 2);
    sc.add(sd.ellipsoid(V(s * 0.31, 0.28, -0.03), 0.095, 0.04, 0.055), 0.03, 0);
    sc.sub(sd.ellipsoid(V(s * 0.33, 0.28, 0.0), 0.06, 0.02, 0.03), 0.01);
    sc.region(sd.ellipsoid(V(s * 0.33, 0.28, 0.0), 0.07, 0.03, 0.04), 3);
    sc.sub(sd.ellipsoid(V(s * 0.11, 0.25, 0.2), 0.062, 0.055, 0.045), 0.015);
    sc.region(sd.ellipsoid(V(s * 0.11, 0.25, 0.2), 0.07, 0.063, 0.055), 4);
  }
  sc.sub(sd.sphere(V(-0.14, 0.38, 0.13), 0.055), 0.01);
  sc.region(sd.sphere(V(-0.14, 0.38, 0.13), 0.07), 6);
  sc.sub(sd.box(V(0, 0.0, 0.22), 0.17, 0.03, 0.15), 0.012);
  sc.region(sd.box(V(0, 0.025, 0.22), 0.18, 0.03, 0.16), 4);
  const jaw = new Sculpt();
  jaw.add(sd.ellipsoid(V(0, -0.04, 0.13), 0.17, 0.06, 0.14), 0, 1);
  jaw.sub(sd.ellipsoid(V(0, 0.0, 0.12), 0.14, 0.025, 0.11), 0.01);
  jaw.region(sd.ellipsoid(V(0, 0.0, 0.12), 0.145, 0.03, 0.115), 4);
  return {
    sc, bounds: { min: V(-0.43, -0.05, -0.3), max: V(0.43, 0.5, 0.42) },
    eyes: [-1, 1].map((s) => ({ x: s * 0.11, y: 0.25, z: 0.19, r: 0.05 })),
    teeth: { y: 0.03, cz: 0.22, rx: 0.15, rz: 0.12, n: 10, h: 0.042 },
    jaw: { pivot: V(0, -0.025, 0.04), sc: jaw, bounds: { min: V(-0.2, -0.12, -0.05), max: V(0.2, 0.03, 0.3) }, teeth: { y: 0.012, cz: 0.13, rx: 0.14, rz: 0.11, n: 9, h: 0.034 } },
  };
}

function headLion() {
  const sc = new Sculpt();
  sc.add(sd.ellipsoid(V(0, 0.19, 0), 0.235, 0.225, 0.215), 0, 0);
  sc.add(sd.capsule(V(-0.1, 0.29, 0.16), V(0.1, 0.29, 0.16), 0.04), 0.05, 0);
  for (const s of [-1, 1]) {
    sc.add(sd.ellipsoid(V(s * 0.055, 0.1, 0.2), 0.085, 0.065, 0.075), 0.035, 1);
    sc.sub(sd.ellipsoid(V(s * 0.095, 0.235, 0.2), 0.064, 0.06, 0.06), 0.012);
    sc.region(sd.ellipsoid(V(s * 0.095, 0.235, 0.2), 0.072, 0.068, 0.07), 4);
  }
  sc.add(sd.ellipsoid(V(0, 0.155, 0.258), 0.058, 0.036, 0.032), 0.012, 2);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 0.28 + (i % 2) * 0.03;
    sc.add(sd.ellipsoid(V(Math.cos(a) * r, 0.19 + Math.sin(a) * r * 1.02, -0.05), 0.085, 0.085, 0.12), 0.05, 5);
    const r2 = 0.24;
    sc.add(sd.ellipsoid(V(Math.cos(a + 0.13) * r2, 0.19 + Math.sin(a + 0.13) * r2, -0.17), 0.09, 0.09, 0.1), 0.05, 5);
  }
  for (const s of [-1, 1]) sc.add(sd.ellipsoid(V(s * 0.17, 0.42, 0.02), 0.06, 0.06, 0.03), 0.02, 0);
  for (let i = 0; i < 5; i++) sc.sub(sd.capsule(V(-0.18 + i * 0.08, 0.35 - (i % 2) * 0.05, 0.16), V(-0.14 + i * 0.075, 0.25 - (i % 3) * 0.04, 0.2), 0.004), 0.002);
  sc.sub(sd.box(V(0, 0.025, 0.2), 0.12, 0.026, 0.14), 0.012);
  sc.region(sd.box(V(0, 0.05, 0.2), 0.13, 0.03, 0.15), 4);
  const jaw = new Sculpt();
  jaw.add(sd.ellipsoid(V(0, -0.04, 0.12), 0.12, 0.05, 0.12), 0, 1);
  jaw.sub(sd.ellipsoid(V(0, 0.0, 0.11), 0.095, 0.022, 0.095), 0.01);
  jaw.region(sd.ellipsoid(V(0, 0.0, 0.11), 0.1, 0.027, 0.1), 4);
  return {
    sc, bounds: { min: V(-0.45, -0.18, -0.32), max: V(0.45, 0.56, 0.33) },
    eyes: [-1, 1].map((s) => ({ x: s * 0.095, y: 0.235, z: 0.2, r: 0.05, hollow: true })),
    teeth: { y: 0.05, cz: 0.2, rx: 0.11, rz: 0.1, n: 10, h: 0.04, broken: true },
    jaw: { pivot: V(0, 0.0, 0.03), sc: jaw, bounds: { min: V(-0.16, -0.11, -0.03), max: V(0.16, 0.03, 0.27) }, teeth: { y: 0.012, cz: 0.12, rx: 0.1, rz: 0.1, n: 9, h: 0.032, broken: true } },
  };
}

// ======================================================================
// TORSOS (spine-local; spine pivot at the top of the hips)
// ======================================================================
function torso(kind, g) {
  const sc = new Sculpt();
  if (kind === 'kira') {
    sc.add(sd.ellipsoid(V(0, 0.02, 0), 0.25 * g, 0.16, 0.2), 0, 0);
    sc.add(sd.ellipsoid(V(0, 0.22, 0.01), 0.22 * g, 0.2, 0.18), 0.12, 0);
    sc.add(sd.ellipsoid(V(0, 0.44, 0.02), 0.29 * g, 0.18, 0.21), 0.12, 0);
    for (const s of [-1, 1]) sc.add(sd.ellipsoid(V(s * 0.29 * g, 0.5, 0), 0.1, 0.09, 0.1), 0.07, 0);
    sc.add(sd.capsule(V(0, 0.55, 0), V(0, 0.64, 0), 0.065), 0.04, 0);
    sc.add(sd.cone(V(0, 0.08, 0), V(0, -0.14, 0), 0.26, 0.37), 0.04, 6);
    sc.region((p) => p.y - 0.06, 6);
    sc.region((p) => (p.y > 0.6 ? 1 : Math.max(0.07 - p.y, -Math.sin(p.y * 62))), 5);
    sc.region((p) => (p.y > 0.6 ? 1 : -1), 4);
  } else {
    const belly = kind === 'bessario' || kind === 'victor' ? 1.12 : kind === 'lebron' ? 1.05 : 0.92;
    sc.add(sd.ellipsoid(V(0, 0.02, 0), 0.27 * g, 0.18, 0.22), 0, 0);
    sc.add(sd.ellipsoid(V(0, 0.25, 0.04 * belly), 0.31 * g * belly, 0.29, 0.27 * belly), 0.1, 1);
    sc.add(sd.ellipsoid(V(0, 0.47, 0.0), 0.3 * g, 0.18, 0.21), 0.12, 0);
    for (const s of [-1, 1]) sc.add(sd.ellipsoid(V(s * 0.31 * g, 0.51, 0), 0.115, 0.1, 0.11), 0.08, 0);
    sc.add(sd.capsule(V(0, 0.55, 0), V(0, 0.64, 0), 0.075), 0.04, 0);
    sc.sub(sd.torusY(V(0, -0.02, 0.0), 0.27 * g, 0.006), 0.004);
    if (kind === 'bessario') {
      sc.region((p) => (p.y > 0.58 ? 1 : -1), 4);
      sc.sub(sd.capsule(V(0.0, 0.58, 0.2), V(0.12 * g, -0.02, 0.33), 0.004), 0.003);
    }
    if (kind === 'kiril') {
      sc.region((p) => Math.max(-(p.z - 0.1), -(p.y + 0.02), p.y - 0.42), 4);
      sc.sub(sd.capsule(V(-0.2, 0.42, 0.24), V(0.2, 0.42, 0.24), 0.004), 0.003);
    }
    if (kind === 'lebron') {
      sc.sub(sd.ellipsoid(V(-0.13, 0.38, 0.2), 0.07, 0.09, 0.08), 0.01);
      sc.region(sd.ellipsoid(V(-0.13, 0.38, 0.2), 0.08, 0.1, 0.09), 6);
      sc.sub(sd.ellipsoid(V(0.18, 0.12, 0.2), 0.05, 0.04, 0.06), 0.01);
      sc.region(sd.ellipsoid(V(0.18, 0.12, 0.2), 0.06, 0.05, 0.07), 6);
      sc.region((p) => Math.max(-(p.y - 0.06), p.y - 0.5), 5);
    }
    if (kind === 'victor') {
      sc.sub(sd.capsule(V(-0.05, 0.15, 0.3), V(0.06, 0.35, 0.28), 0.012), 0.004);
      sc.region(sd.capsule(V(-0.05, 0.15, 0.3), V(0.06, 0.35, 0.28), 0.02), 6);
    }
  }
  return { sc, bounds: { min: V(-0.48, -0.2, -0.32), max: V(0.48, 0.7, 0.4) } };
}

const SPEC = {
  bessario: { head: headBear, girth: 1.14, height: 1.06, fur: '#4e3220', light: '#8f7254', dark: '#100a08', inner: '#5a3a28', cloth: '#a89c82', accent: '#a0161a', armCloth: true, detail: 'fur' },
  kiril: { head: headCroc, girth: 1.0, height: 1.1, fur: '#2e3e22', light: '#7e7a52', dark: '#141c10', inner: '#5a2020', cloth: '#a49c86', accent: '#7a2a2a', detail: 'scales', tail: true, claws: true },
  kira: { head: headCat, girth: 0.92, height: 1.04, fur: '#7e4a62', light: '#b6929e', dark: '#24100e', inner: '#8a5a66', cloth: '#b4aa96', accent: '#7a1a1c', hair: '#3a1a3a', skirt: '#1e5656', detail: 'fur', skates: true },
  lebron: { head: headBull, girth: 1.26, height: 1.12, fur: '#45190e', light: '#86604e', dark: '#120604', inner: '#5a2a1e', cloth: '#a49c86', accent: '#8a7016', detail: 'fur', damaged: true },
  victor: { head: headLion, girth: 1.08, height: 1.08, fur: '#6e5212', light: '#8a7032', dark: '#0c0604', inner: '#5a4012', cloth: '#5a4012', accent: '#3a2408', mane: '#4e2e0a', detail: 'fur', hollow: true },
};

// ======================================================================
export function buildAnimatronic(kind) {
  const S = SPEC[kind];
  const root = new THREE.Group(); root.name = kind;
  const det = S.detail === 'scales' ? Tex.scales() : Tex.fur();
  const metal = kind === 'victor' ? 0.35 : 0;
  // palette ids: 0 fur, 1 light fur, 2 dark/nose, 3 inner ear, 4 cavity/cloth, 5 accent/hair, 6 torn/dark
  const headPal = [col(S.fur), col(S.light), col(S.dark), col(S.inner), col('#050404'), col(S.hair || S.mane || S.dark), col('#1a1816')];
  if (kind === 'kiril') headPal[5] = col('#6a2020');
  const torsoPal = [col(S.fur), col(S.light), col(S.dark), col(S.inner), col(S.cloth), col(S.accent), col(kind === 'kira' ? S.skirt : '#141210')];
  const mats = {
    skin: skinMat({ vertexColors: true, detail: det, scale: S.detail === 'scales' ? 5 : 7, strength: 0.6, roughness: 0.82, metalness: metal }),
    cloth: skinMat({ vertexColors: true, detail: Tex.fur(), scale: 9, strength: 0.25, roughness: 0.9, metalness: metal * 0.5 }),
    fur: skinMat({ color: S.fur, detail: det, scale: S.detail === 'scales' ? 5 : 7, strength: 0.6, roughness: 0.84, metalness: metal }),
    sleeve: skinMat({ color: S.armCloth ? S.cloth : S.fur, detail: Tex.fur(), scale: 8, strength: 0.35, roughness: 0.9 }),
    endo: new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 0.34, metalness: 0.9, envMap: ENV, envMapIntensity: 0.9 }),
    endoDark: new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.45, metalness: 0.85, envMap: ENV, envMapIntensity: 0.7 }),
    teeth: new THREE.MeshPhysicalMaterial({ color: kind === 'victor' ? 0x7a6a48 : 0xa0906a, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3, envMap: ENV, envMapIntensity: 0.5 }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: 0xa89e86, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, envMap: ENV, envMapIntensity: 0.8 }),
    iris: new THREE.MeshPhysicalMaterial({ map: null, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.05, envMap: ENV, envMapIntensity: 0.5, emissive: 0xffffff, emissiveIntensity: 0.04 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0 }),
    cornea: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, transparent: true, opacity: 0.05, envMap: ENV, envMapIntensity: 1.0, depthWrite: false }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x030202, roughness: 1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0e0b0a, roughness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.6 }),
    white: skinMat({ color: 0x8a8474, detail: Tex.cloth(kind.length), scale: 4, strength: 0.6, roughness: 0.9 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9982a, roughness: 0.3, metalness: 0.85 }),
    wire: [0x8a1010, 0x103a8a, 0x8a7a10, 0x111111].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  };
  const irisHex = { bessario: 0x3a6ab8, kiril: 0xc89a10, kira: 0x9a2a6a, lebron: 0xb02010, victor: 0x000000 }[kind];
  mats.iris.map = irisTex(irisHex, kind); mats.iris.emissiveMap = mats.iris.map;
  const g = S.girth, H = S.height;
  const J = {};

  // ---- skeleton + torso
  J.hips = pivot(root, 0, 0.95 * H, 0, 'hips');
  J.spine = pivot(J.hips, 0, 0.04, 0, 'spine');
  const T = torso(kind, g);
  const tg = cachedGeo('torso' + kind, () => meshSculpt(T.sc, { ...T.bounds, res: 60, palette: torsoPal, noise: 0.08, grime: 0.3, seed: 3 }));
  mesh(tg, kind === 'bessario' || kind === 'kira' ? mats.cloth : mats.skin, 0, 0, 0, J.spine, 1, H, 1);
  J.chest = pivot(J.spine, 0, 0.52 * H, 0, 'chest');
  J.neck = pivot(J.chest, 0, 0.08, 0.01, 'neck');
  mesh(cyl(0.045, 0.055, 0.14, 10), mats.endo, 0, 0.04, 0, J.neck);
  for (const sx of [-1, 1]) mesh(cyl(0.008, 0.008, 0.16, 5), mats.wire[sx > 0 ? 0 : 3], sx * 0.045, 0.04, 0.03, J.neck);
  J.head = pivot(J.neck, 0, 0.09, 0, 'head');

  // ---- head
  const HD = S.head();
  const hg = cachedGeo('head' + kind, () => meshSculpt(HD.sc, { ...HD.bounds, res: 72, palette: headPal, noise: 0.09, grime: 0.24, seed: 5 }));
  mesh(hg, mats.skin, 0, 0, 0, J.head);
  J.head.scale.setScalar(0.88);
  J.pupils = []; J.eyes = []; J.balls = [];
  for (const e of HD.eyes) {
    const ep = pivot(J.head, e.x, e.y, e.z);
    if (e.hollow) {
      mesh(sph(e.r * 0.9, 14, 10), mats.mouth, 0, 0, -e.r * 0.4, ep);   // deep empty socket
      const ball = pivot(ep, 0, 0, 0);
      J.pupils.push(mesh(sph(0.008, 8, 6), mats.pupil, 0, 0, e.r * 0.2, ball));
      J.balls.push(ball);
    } else {
      mesh(sph(e.r * 1.05, 14, 10), mats.mouth, 0, 0, -e.r * 0.35, ep);  // dark socket behind the ball
      const ball = pivot(ep, 0, 0, 0);
      mesh(sph(e.r, 28, 20), mats.eyeWhite, 0, 0, 0, ball);
      const iris = mesh(new THREE.SphereGeometry(e.r * 1.004, 24, 8, 0, Math.PI * 2, 0, 0.62), mats.iris, 0, 0, 0, ball); iris.rotation.x = Math.PI / 2; iris.castShadow = false;
      const pg = e.reptile ? new THREE.SphereGeometry(e.r * 1.008, 12, 6, 0, Math.PI * 2, 0, 0.2) : new THREE.SphereGeometry(e.r * 1.008, 16, 6, 0, Math.PI * 2, 0, 0.24);
      const p = mesh(pg, mats.pupil, 0, 0, 0, ball); p.rotation.x = Math.PI / 2; p.castShadow = false;
      if (e.reptile) p.scale.set(0.35, 1, 1.0);
      J.pupils.push(p);
      const cornea = mesh(new THREE.SphereGeometry(e.r * 1.03, 20, 10, 0, Math.PI * 2, 0, 0.75), mats.cornea, 0, 0, 0, ball); cornea.rotation.x = Math.PI / 2; cornea.castShadow = false;
      J.balls.push(ball);
      const lid = mesh(new THREE.SphereGeometry(e.r * 1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mats.fur, 0, 0, 0, ep, 1, 1.05, 0.95);
      lid.rotation.x = 0.12 + (kind === 'kiril' || kind === 'lebron' ? 0.16 : 0);
      lid.rotation.z = (e.x > 0 ? 1 : -1) * (kind === 'kira' ? 0.2 : 0.38);
      mesh(new THREE.TorusGeometry(e.r * 1.06, e.r * 0.09, 6, 24, Math.PI * 0.9), mats.black, 0, 0, e.r * 0.15, ep).rotation.set(lid.rotation.x - 1.2, 0, lid.rotation.z + Math.PI * 0.05); // lid edge seam
      mesh(new THREE.SphereGeometry(e.r * 1.08, 18, 8, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32), mats.fur, 0, 0, 0, ep, 1, 1.05, 0.95);
      if (e.lashes) for (let i = 0; i < 2; i++) {
        const l = mesh(box(0.006, 0.04, 0.005), mats.black, Math.sign(e.x) * (0.012 + i * 0.016), e.r * 0.95 - i * 0.004, e.r * 0.5, ep);
        l.rotation.z = -Math.sign(e.x) * (0.15 + i * 0.32); l.rotation.x = -0.4;
      }
    }
    J.eyes.push(ep);
  }
  const toothGeo = cachedGeo('tooth', () => { const t = cyl(0.011, 0.014, 1, 6); t.translate(0, -0.5, 0); return t; });
  const fangGeo = cachedGeo('fang', () => { const t = new THREE.ConeGeometry(0.012, 1, 6); t.rotateX(Math.PI); t.translate(0, -0.5, 0); return t; });
  const teethRow = (parent, T2, up) => {
    for (let i = 0; i < T2.n; i++) {
      if (T2.broken && (i === 2 || i === 7)) continue;
      const a = (i / (T2.n - 1) - 0.5) * (T2.fang ? 2.9 : 2.3);
      let xx, zz;
      if (T2.fang) { // along the long snout: down both sides
        const side = Math.sign(a) || 1, u = Math.abs(a) / 1.45;
        xx = side * T2.rx * Math.min(1, 0.35 + u * 0.9);
        zz = T2.cz + T2.rz * (1 - u * 1.6);
      } else { xx = Math.sin(a) * T2.rx; zz = T2.cz + Math.cos(a) * T2.rz; }
      const hh = T2.h * (T2.fang ? 0.7 + ((i * 7) % 5) * 0.12 : 0.8 + ((i * 7) % 4) * 0.12);
      const t = mesh(T2.fang ? fangGeo : toothGeo, mats.teeth, xx, T2.y, zz, parent, 1, hh, T2.fang ? 1 : 0.65);
      t.rotation.y = a;
      if (up) t.rotation.x = Math.PI;
      t.castShadow = false;
    }
  };
  teethRow(J.head, HD.teeth, false);
  J.jaw = pivot(J.head, HD.jaw.pivot.x, HD.jaw.pivot.y, HD.jaw.pivot.z, 'jaw');
  const jg = cachedGeo('jaw' + kind, () => meshSculpt(HD.jaw.sc, { ...HD.jaw.bounds, res: 48, palette: headPal, noise: 0.05, seed: 7 }));
  mesh(jg, mats.skin, 0, 0, 0, J.jaw);
  teethRow(J.jaw, HD.jaw.teeth, true);
  const jx = { bessario: 0.17, kiril: 0.15, kira: 0.12, lebron: 0.2, victor: 0.15 }[kind];
  const JP = HD.jaw.pivot, TT = HD.teeth;
  // dark mouth cavity so an open jaw shows a black throat, not the inside of the head
  mesh(sph(1, 16, 10), mats.mouth, 0, TT.y - 0.03, TT.cz - TT.rz * 0.3, J.head, TT.rx * 0.95, 0.05, TT.rz * 0.9);
  // endoskeleton teeth set behind the suit teeth (the FNAF tell)
  const endoT = { ...TT, rx: TT.rx * 0.78, rz: TT.rz * 0.72, h: TT.h * 0.8, n: Math.max(6, TT.n - 3), broken: false };
  const endoTeeth = new THREE.Group(); J.head.add(endoTeeth);
  for (let i = 0; i < endoT.n; i++) {
    const aa = (i / (endoT.n - 1) - 0.5) * 2.0;
    const t = mesh(toothGeo, mats.endo, Math.sin(aa) * endoT.rx, TT.y - 0.005, endoT.cz + Math.cos(aa) * endoT.rz * (TT.fang ? 0.6 : 1) - (TT.fang ? 0.05 : 0), endoTeeth, 0.8, endoT.h, 0.6);
    t.rotation.y = aa; t.castShadow = false;
  }
  mesh(box(TT.rx * 1.5, 0.012, 0.03), mats.endoDark, 0, TT.y + 0.004, TT.cz - TT.rz * 0.2, J.head);      // upper endo plate
  mesh(box(HD.jaw.teeth.rx * 1.5, 0.012, HD.jaw.teeth.rz * 1.6), mats.endoDark, 0, HD.jaw.teeth.y - 0.012, HD.jaw.teeth.cz - 0.02, J.jaw); // lower jaw plate
  for (const sx of [-1, 1]) {
    const b = mesh(cyl(0.024, 0.024, 0.022, 12), mats.endo, sx * jx, JP.y, JP.z, J.head); b.rotation.z = Math.PI / 2;
    const bc = mesh(cyl(0.011, 0.011, 0.034, 6), mats.endoDark, sx * (jx + 0.012), JP.y, JP.z, J.head); bc.rotation.z = Math.PI / 2;
    // hinge arm on the jaw + piston up into the head
    mesh(box(0.014, 0.024, 0.11), mats.endo, sx * (jx - 0.012), -0.012, 0.045, J.jaw).rotation.x = 0.2;
    const pist = new THREE.Group(); pist.position.set(sx * (jx - 0.02), JP.y + 0.09, JP.z - 0.05); J.head.add(pist);
    mesh(cyl(0.011, 0.011, 0.08, 8), mats.endoDark, 0, 0, 0, pist);
    const rod = mesh(cyl(0.006, 0.006, 0.08, 6), mats.endo, 0, -0.06, 0, pist);
    J['piston' + (sx > 0 ? 'L' : 'R')] = { group: pist, rod };
  }

  // ---- head accessories
  if (kind === 'bessario') {
    const hat = pivot(J.head, 0, 0.41, -0.03);
    hat.rotation.x = -0.14; hat.rotation.z = 0.08;
    const hs = new Sculpt();
    hs.add(sd.capsule(V(0, 0.0, 0), V(0, 0.1, 0), 0.165), 0, 0);
    for (const [x, y, z, r] of [[0, 0.24, 0, 0.17], [-0.12, 0.2, 0.06, 0.12], [0.12, 0.21, 0.04, 0.12], [0, 0.2, -0.12, 0.12], [0.03, 0.21, 0.12, 0.11], [-0.1, 0.22, -0.08, 0.1]]) hs.add(sd.sphere(V(x, y, z), r), 0.05, 0);
    hs.sub(sd.box(V(0, -0.1, 0), 0.3, 0.1, 0.3), 0.01);
    hs.sub(sd.torusY(V(0, 0.115, 0), 0.172, 0.008), 0.004);
    const hatG = cachedGeo('hat', () => meshSculpt(hs, { min: V(-0.3, -0.02, -0.3), max: V(0.3, 0.45, 0.3), res: 44, palette: [col('#c9c1ae')], noise: 0.05, grime: 0.3 }));
    mesh(hatG, mats.cloth, 0, 0, 0, hat);
    const mu = mesh(mustacheGeo(0.42), mats.black, 0, 0.135, 0.3, J.head);
    mu.rotation.x = -0.3;
    J.stache = mu;
  }
  if (kind === 'kiril') {
    const capG = pivot(J.head, 0, 0.31, -0.05); capG.rotation.z = 0.12; capG.rotation.x = -0.1;
    const cs = new THREE.Shape(); cs.moveTo(-0.17, 0); cs.lineTo(0.17, 0); cs.lineTo(0.13, 0.11); cs.quadraticCurveTo(0, 0.14, -0.13, 0.11); cs.lineTo(-0.17, 0);
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.2, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
    cg.translate(0, 0, -0.1); cg.rotateY(Math.PI / 2);
    mesh(cg, mats.white, 0, 0, 0, capG);
    mesh(box(0.012, 0.03, 0.18), mats.wire[0], 0.0, 0.03, 0, capG).rotation.y = Math.PI / 2;
  }
  if (kind === 'kira') {
    const hb = mesh(new THREE.TorusGeometry(0.228, 0.014, 6, 28, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a8a8a, roughness: 0.5 }), 0, 0.2, -0.04, J.head);
        mesh(cyl(0.025, 0.025, 0.008, 14), mats.gold, 0.16, 0.38, 0.1, J.head).rotation.set(1.2, 0, -0.6);
  }
  if (kind === 'lebron') {
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([[sx * 0.22, 0.37, 0], [sx * 0.38, 0.43, 0.03], [sx * 0.47, 0.58, 0.08], [sx * 0.43, 0.71, 0.13]].map((p) => new THREE.Vector3(...p)));
      const tg2 = new THREE.TubeGeometry(curve, 16, 0.036, 10, false);
      const pos = tg2.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = Math.floor(i / 11) / 16, c = curve.getPoint(Math.min(1, t)), k = 1 - t * 0.85;
        pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
      }
      tg2.computeVertexNormals();
      mesh(tg2, new THREE.MeshStandardMaterial({ color: sx > 0 ? 0xd6c8a4 : 0xb8a888, roughness: 0.45 }), 0, 0, 0, J.head);
      mesh(new THREE.TorusGeometry(0.036, 0.008, 6, 12), mats.endoDark, sx * 0.3, 0.405, 0.015, J.head).rotation.y = Math.PI / 2 + sx * 0.4;
    }
    const ring = mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 20), mats.gold, 0, 0.06, 0.37, J.head); ring.rotation.x = 0.2;
    mesh(new THREE.TorusGeometry(0.3, 0.014, 6, 24, Math.PI), mats.rubber, 0, 0.2, -0.03, J.head);
    mesh(cyl(0.065, 0.065, 0.045, 14), mats.rubber, 0.31, 0.2, -0.03, J.head).rotation.z = Math.PI / 2;
    const mic = mesh(cyl(0.008, 0.008, 0.24, 6), mats.rubber, 0.29, 0.13, 0.1, J.head); mic.rotation.set(1.25, 0, 0.45);
    mesh(sph(0.018), mats.rubber, 0.2, 0.07, 0.21, J.head);
    mesh(sph(0.04, 10, 8), mats.endo, -0.14, 0.37, 0.1, J.head);
  }

  // ---- body costume details
  const bodySurf = (x, y) => surface(T.sc, { x, y, z: 0 }, { x: 0, y: 0, z: 1 });
  if (kind === 'bessario') {
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      const y = 0.42 - i * 0.14, x = (0.07 + i * 0.012) * sx + 0.03;
      const p = bodySurf(x, y);
      mesh(cyl(0.022, 0.022, 0.014, 12), mats.black, p.x, p.y * H, p.z, J.spine).rotation.x = Math.PI / 2 - 0.3;
    }
    const nkMat = skinMat({ color: 0xffffff, detail: Tex.gingham(), scale: 12, strength: 1 });
    const nk = mesh(new THREE.TorusGeometry(0.11, 0.035, 10, 24), nkMat, 0, 0.05, 0.03, J.chest);
    nk.rotation.x = Math.PI / 2 + 0.2;
    const knot = mesh(new THREE.ConeGeometry(0.07, 0.14, 4), nkMat, 0, -0.04, 0.17, J.chest); knot.rotation.x = Math.PI + 0.3;
    const pk = bodySurf(-0.17, 0.46);
    mesh(box(0.008, 0.11, 0.008), mats.endo, pk.x, pk.y * H + 0.03, pk.z + 0.005, J.spine).rotation.z = 0.15;
  }
  if (kind === 'kiril') {
    const strap = mesh(new THREE.TorusGeometry(0.15, 0.012, 4, 20, Math.PI), mats.white, 0, 0.0, 0.08, J.chest); strap.rotation.x = -0.4;
    const pk = bodySurf(0.0, 0.18); mesh(box(0.2, 0.1, 0.012), mats.white, pk.x, pk.y * H, pk.z + 0.003, J.spine).rotation.x = -0.15;
  }
  if (kind === 'lebron') {
    const num = mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: Tex.label('9', { w: 128, h: 128, bg: '#c8a020', fg: '#3a1408', size: 110 }), roughness: 0.9 }), 0, 0, 0, J.spine);
    const np = bodySurf(0.09, 0.26); num.position.set(np.x, np.y * H, np.z + 0.004);
    for (let i = 0; i < 5; i++) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.13 + i * 0.012, 0.4 * H, 0.18), new THREE.Vector3(-0.15 + i * 0.03, 0.33 * H, 0.27), new THREE.Vector3(-0.1 + i * 0.02, 0.22 * H, 0.3 + (i % 2) * 0.02)]);
      mesh(new THREE.TubeGeometry(curve, 8, 0.006, 5, false), mats.wire[i % 4], 0, 0, 0, J.spine);
    }
    mesh(cyl(0.035, 0.035, 0.08, 10), mats.endo, -0.13, 0.38 * H, 0.17, J.spine).rotation.x = Math.PI / 2;
  }

  // ---- arms
  const armR = { bessario: 0.075, kiril: 0.068, kira: 0.06, lebron: 0.088, victor: 0.075 }[kind];
  const upperGeo = cachedGeo('upper' + kind, () => limb([[armR * 1.25, 0], [armR * 1.2, 0.15], [armR * 1.08, 0.5], [armR * 0.95, 0.85], [armR * 0.7, 0.96], [0.02, 1]], 0.31));
  const foreGeo = cachedGeo('fore' + kind, () => limb([[armR * 0.75, 0], [armR * 1.02, 0.12], [armR * 1.05, 0.4], [armR * 0.85, 0.85], [armR * 0.6, 0.97], [0.02, 1]], 0.3));
  const handPal = [col(S.fur), col(S.light), col('#e0d6c0')];
  const handMat = skinMat({ vertexColors: true, detail: det, scale: 8, strength: 0.5, roughness: 0.85, metalness: metal });
  const buildArm = (sx) => {
    const sh = pivot(J.chest, sx * 0.33 * g, -0.03, 0, (sx > 0 ? 'l' : 'r') + 'Shoulder');
    mesh(sph(0.055, 12, 10), mats.endo, 0, 0, 0, sh);
    mesh(upperGeo, S.armCloth ? mats.sleeve : mats.fur, 0, -0.02, 0, sh);
    mesh(new THREE.TorusGeometry(armR * 1.2, 0.006, 5, 18), mats.black, 0, -0.06, 0, sh).rotation.x = Math.PI / 2;
    const el = pivot(sh, 0, -0.34, 0);
    mesh(sph(0.04, 10, 8), mats.endo, 0, 0, 0, el);
    mesh(cyl(0.015, 0.015, 0.09, 6), mats.endoDark, 0, 0.02, 0, el).rotation.z = Math.PI / 2;
    const bare = S.damaged && sx < 0;
    if (bare) {
      for (const dx of [-0.02, 0.02]) mesh(cyl(0.017, 0.017, 0.3, 8), mats.endo, dx, -0.16, 0, el);
      for (let i = 0; i < 3; i++) mesh(cyl(0.004, 0.004, 0.28, 4), mats.wire[i], 0.0, -0.15, 0.022 + i * 0.006, el);
      mesh(box(0.06, 0.02, 0.04), mats.endoDark, 0, -0.06, 0, el);
    } else mesh(foreGeo, mats.fur, 0, -0.02, 0, el);
    const wr = pivot(el, 0, -0.33, 0);
    mesh(cyl(0.022, 0.026, 0.05, 8), mats.endo, 0, 0.015, 0, wr);
    const hand = pivot(wr, 0, -0.01, 0);
    const hgeo = handGeo(kind + (bare ? 'bare' : ''), bare ? [col('#55534f'), col('#55534f'), col('#55534f')] : handPal, { fat: kind === 'lebron' ? 1.2 : 1, claws: S.claws, bare });
    const hm = mesh(hgeo, bare ? mats.endo : handMat, 0, 0, 0, hand);
    if (sx < 0) hm.scale.x = -1;
    return { sh, el, wr, hand };
  };
  const L = buildArm(1), R = buildArm(-1);
  J.lShoulder = L.sh; J.lElbow = L.el; J.lHand = L.hand;
  J.rShoulder = R.sh; J.rElbow = R.el; J.rHand = R.hand;

  // ---- legs
  const legR = 0.105 * g * (kind === 'kira' ? 0.85 : 1);
  const thighGeo = cachedGeo('thigh' + kind, () => limb([[legR * 1.15, 0], [legR * 1.2, 0.2], [legR * 1.05, 0.6], [legR * 0.85, 0.92], [0.03, 1]], 0.42 * H));
  const shinGeo = cachedGeo('shin' + kind, () => limb([[legR * 0.75, 0], [legR * 1.0, 0.15], [legR * 0.95, 0.5], [legR * 0.72, 0.9], [0.03, 1]], 0.38 * H));
  const footPal = [col(S.fur), col(kind === 'kira' ? '#e8e2d4' : S.light)];
  const footMat = skinMat({ vertexColors: true, detail: det, scale: 8, strength: S.skates ? 0.15 : 0.5, roughness: 0.8, metalness: metal });
  const buildLeg = (sx) => {
    const hp = pivot(J.hips, sx * 0.15 * g, -0.05, 0);
    mesh(thighGeo, mats.fur, 0, -0.02, 0, hp);
    if (S.damaged && sx > 0) { mesh(sph(0.045, 10, 8), mats.black, 0.0, -0.22, legR * 0.95, hp, 1, 1.2, 0.5); mesh(cyl(0.012, 0.012, 0.12, 6), mats.endo, 0, -0.22, legR * 0.85, hp); }
    const kn = pivot(hp, 0, -0.44 * H, 0);
    mesh(sph(0.045, 10, 8), mats.endo, 0, 0, 0, kn);
    mesh(cyl(0.016, 0.016, 0.1, 6), mats.endoDark, 0, 0, 0, kn).rotation.z = Math.PI / 2;
    mesh(shinGeo, mats.fur, 0, -0.03, 0, kn);
    const an = pivot(kn, 0, -0.41 * H, 0);
    mesh(cyl(0.026, 0.03, 0.05, 8), mats.endo, 0, 0.03, 0, an);
    const fg = footGeo(kind, footPal, { skates: S.skates, big: kind === 'lebron' ? 1.12 : 1 });
    const ft = mesh(fg, footMat, 0, -0.02, 0, an);
    if (sx < 0) ft.scale.x = -1;
    if (S.skates) {
      mesh(box(0.08, 0.02, 0.32), mats.endo, 0, -0.115, 0.06, an);
      const wm = new THREE.MeshStandardMaterial({ color: 0xd04a8a, roughness: 0.4 });
      for (const z of [-0.06, 0.18]) for (const x of [-0.05, 0.05]) { const w = mesh(cyl(0.032, 0.032, 0.03, 14), wm, x, -0.145, z, an); w.rotation.z = Math.PI / 2; }
      mesh(sph(0.025, 8, 6), wm, 0, -0.12, 0.28, an);
    }
    return { hp, kn, an };
  };
  const LL = buildLeg(1), RL = buildLeg(-1);
  J.lHip = LL.hp; J.lKnee = LL.kn; J.lAnkle = LL.an;
  J.rHip = RL.hp; J.rKnee = RL.kn; J.rAnkle = RL.an;

  // ---- tail (croc)
  if (S.tail) {
    const ts = new Sculpt();
    let prev = V(0, 0, -0.1);
    for (let i = 1; i <= 7; i++) {
      const p = V(Math.sin(i * 0.5) * 0.04, -0.1 * i - i * i * 0.008, -0.1 - i * 0.1);
      ts.add(sd.cone(prev, p, 0.15 - (i - 1) * 0.019, 0.15 - i * 0.019), 0.04, 0);
      if (i < 7) ts.add(sd.ellipsoid(V(p.x, p.y + 0.12 - i * 0.017, p.z), 0.02, 0.03, 0.03), 0.02, 2);
      prev = p;
    }
    const tgeo = cachedGeo('tail', () => meshSculpt(ts, { min: V(-0.2, -0.95, -0.95), max: V(0.2, 0.2, 0.08), res: 52, palette: [col(S.fur), col(S.light), col(S.dark)], noise: 0.06 }));
    J.tail = pivot(J.hips, 0, -0.05, -0.12);
    mesh(tgeo, mats.skin, 0, 0, 0, J.tail);
  }

  // ---- props
  if (kind === 'bessario') {
    const sp = pivot(J.rHand, 0, -0.08, 0.04);
    mesh(cyl(0.017, 0.017, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.6 }), 0, -0.08, 0, sp);
    mesh(cyl(0.012, 0.01, 0.1, 8), mats.endo, 0, -0.26, 0, sp);
    const blade = mesh(box(0.15, 0.19, 0.008), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.35, metalness: 0.85 }), 0, -0.4, 0.015, sp);
    blade.rotation.x = 0.25;
    for (let i = 0; i < 3; i++) mesh(box(0.012, 0.12, 0.01), mats.black, -0.04 + i * 0.04, -0.4, 0.02, sp).rotation.x = 0.25;
    sp.rotation.x = Math.PI / 2;
    J.prop = sp;
  }
  if (kind === 'kiril') {
    const fb = pivot(J.rHand, 0, -0.12, 0.08);
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x8c8c88, metalness: 0.8, roughness: 0.4, wireframe: true });
    mesh(box(0.2, 0.12, 0.16, 6, 4, 5), wireMat, 0, -0.04, 0.12, fb);
    mesh(box(0.2, 0.004, 0.16), new THREE.MeshStandardMaterial({ color: 0x555550, metalness: 0.7, roughness: 0.5 }), 0, -0.1, 0.12, fb);
    const fryMat = new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.7 });
    let s = 7; const rr = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 26; i++) { const f = mesh(box(0.014, 0.12, 0.014), fryMat, (rr() - 0.5) * 0.17, -0.02 + rr() * 0.04, 0.12 + (rr() - 0.5) * 0.13, fb); f.rotation.set((rr() - 0.5) * 0.8, rr() * 3, (rr() - 0.5) * 0.8); f.castShadow = false; }
    mesh(cyl(0.012, 0.012, 0.16, 8), mats.rubber, 0, 0, 0, fb).rotation.x = Math.PI / 2;
    J.prop = fb;
  }
  if (kind === 'kira') {
    const tr = pivot(J.lHand, 0, -0.1, 0.07);
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.75, roughness: 0.3 });
    mesh(cyl(0.17, 0.17, 0.014, 24), steel, 0, 0, 0, tr);
    mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 28), steel, 0, 0.007, 0, tr).rotation.x = Math.PI / 2;
    mesh(cyl(0.05, 0.032, 0.17, 18), new THREE.MeshStandardMaterial({ color: 0xe8a0b8, roughness: 0.25 }), 0.02, 0.09, 0, tr);
    mesh(sph(0.055, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 }), 0.02, 0.19, 0, tr, 1, 0.75, 1);
    mesh(sph(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9a0a14, roughness: 0.3 }), 0.02, 0.24, 0, tr);
    const straw = mesh(cyl(0.006, 0.006, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xc81c30 }), 0.04, 0.24, 0.01, tr); straw.rotation.z = -0.25;
    J.prop = tr;
  }

  const ch = new Animatronic(kind, root, J, mats);
  ch.setPose('stand', true);
  return ch;
}

// joint rotation presets  [x, y, z]
export const POSES = {
  stand: {
    head: [0.14, 0, 0], lShoulder: [0.08, 0, -0.16], rShoulder: [0.08, 0, 0.16], lElbow: [-0.3, 0, 0], rElbow: [-0.3, 0, 0],
    lHip: [0, 0, 0], rHip: [0, 0, 0], lKnee: [0.05, 0, 0], rKnee: [0.05, 0, 0], lAnkle: [-0.05, 0, 0], rAnkle: [-0.05, 0, 0], jaw: [0.12, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], tail: [0.3, 0, 0], hips: [0, 0, 0],
  },
  perform: { head: [0.1, 0.12, 0.05], rShoulder: [-0.75, 0.2, 0.25], rElbow: [-1.1, 0, 0], lShoulder: [-0.2, 0, -0.35], lElbow: [-1.0, 0, 0], jaw: [0.12, 0, 0] },
  basket: { head: [0.15, -0.15, -0.04], rShoulder: [-0.45, 0, 0.12], rElbow: [-1.0, 0, 0], lShoulder: [0.05, 0, -0.25], lElbow: [-0.4, 0, 0], jaw: [0.18, 0, 0] },
  tray: { head: [0.08, 0.2, 0.12], lShoulder: [-0.25, 0, -0.42], lElbow: [-1.5, 0, 0], rShoulder: [0.1, 0, 0.3], rElbow: [-0.2, 0, 0], spine: [0, 0, -0.04] },
  slump: {
    spine: [0.3, 0, 0], chest: [0.2, 0, 0.05], head: [0.5, 0.3, 0.35], jaw: [0.35, 0, 0],
    lShoulder: [0.2, 0, -0.05], rShoulder: [0.25, 0, 0.1], lElbow: [-0.2, 0, 0], rElbow: [-0.1, 0, 0],
    lHip: [-1.5, 0.25, 0.12], rHip: [-1.5, -0.25, -0.12], lKnee: [1.4, 0, 0], rKnee: [1.45, 0, 0], lAnkle: [0.1, 0, 0], rAnkle: [0.1, 0, 0], tail: [1.2, 0, 0],
  },
  stare: { head: [0.0, 0, 0], neck: [0.05, 0, 0], lShoulder: [0.02, 0, -0.08], rShoulder: [0.02, 0, 0.08], lElbow: [-0.15, 0, 0], rElbow: [-0.15, 0, 0], jaw: [0.06, 0, 0] },
  lean: { spine: [0.12, 0, 0.08], chest: [0.12, 0, 0.06], head: [0.18, -0.25, 0.25], neck: [0.1, 0, 0], lShoulder: [-0.4, 0, -0.2], lElbow: [-0.6, 0, 0], rShoulder: [0.1, 0, 0.15], rElbow: [-0.2, 0, 0], jaw: [0.2, 0, 0] },
  peek: { spine: [0.2, 0, 0], chest: [0.15, 0, 0], head: [0.25, 0, 0.4], jaw: [0.1, 0, 0] },
  hatch: { spine: [0.35, 0, 0], chest: [0.25, 0, 0], head: [-0.25, 0, 0.18], jaw: [0.25, 0, 0], lShoulder: [-0.9, 0, -0.1], rShoulder: [-0.9, 0, 0.1], lElbow: [-0.5, 0, 0], rElbow: [-0.5, 0, 0] },
  run: { spine: [0.45, 0, 0], chest: [0.2, 0, 0], head: [-0.3, 0, 0], lShoulder: [-1.1, 0, -0.3], rShoulder: [0.8, 0, 0.3], lElbow: [-1.2, 0, 0], rElbow: [-1.0, 0, 0], lHip: [-1.0, 0, 0], rHip: [0.6, 0, 0], lKnee: [0.6, 0, 0], rKnee: [1.3, 0, 0], jaw: [0.6, 0, 0] },
  lunge: {
    spine: [0.18, 0, 0], chest: [0.12, 0, 0], neck: [-0.1, 0, 0], head: [-0.32, 0, 0.1], jaw: [0.85, 0, 0],
    lShoulder: [-1.4, 0, -0.5], rShoulder: [-1.4, 0, 0.5], lElbow: [-0.6, 0, 0], rElbow: [-0.6, 0, 0],
  },
  freezer: { spine: [0.1, 0, 0], head: [0.4, 0.5, 0.2], jaw: [0.5, 0, 0], lShoulder: [0.15, 0, -0.1], rShoulder: [-0.2, 0, 0.2], rElbow: [-1.0, 0, 0] },
  bang: { spine: [0.15, 0, 0], head: [0.1, 0, 0], jaw: [0.5, 0, 0], lShoulder: [-2.4, 0, -0.2], rShoulder: [-2.4, 0, 0.2], lElbow: [-0.6, 0, 0], rElbow: [-0.6, 0, 0] },
};

const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow', 'lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle', 'tail'];

// Animation: poses are blended per joint; on top of that run independent, mechanical layers —
// servo-like head motion, eyes that saccade and lock on, a hinged jaw that clacks, pupils that dilate.
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
export class Animatronic {
  constructor(kind, root, joints, mats) {
    this.kind = kind; this.root = root; this.J = joints; this.mats = mats;
    this.target = {}; this.base = {}; this.t = Math.random() * 10;
    this.glow = 0; this.hipY = joints.hips.position.y;
    this.poseName = 'stand';
    this.jitter = 0;
    this.mode = 'still';          // still | alive | stare | scare
    this.lookAt = null;           // world position to stare at (camera)
    this.head = { cur: [0, 0, 0], vel: [0, 0, 0], tgt: [0, 0, 0], next: 1 + Math.random() * 2 };
    this.eyes = (joints.balls || []).map((b, i) => ({ ball: b, cur: [0, 0], tgt: [0, 0], next: Math.random() * 2, lag: i * 0.06 }));
    this.jaw = { cur: 0, tgt: 0, next: 2 + Math.random() * 4, hold: 0 };
    this.pupil = { cur: 1, tgt: 1, next: 1 };
  }
  setPose(name, instant = false) {
    const base = POSES.stand, p = POSES[name] || {};
    this.poseName = name;
    for (const j of JOINTS) {
      const r = p[j] || base[j] || [0, 0, 0];
      this.target[j] = r;
      if (instant || !this.base[j]) { this.base[j] = r.slice(); if (this.J[j]) this.J[j].rotation.set(r[0], r[1], r[2]); }
    }
    this.hipTarget = name === 'slump' ? this.hipY * 0.42 : name === 'run' ? this.hipY * 0.9 : this.hipY;
    if (instant) { this.J.hips.position.y = this.hipTarget; this.head.cur = [0, 0, 0]; this.head.vel = [0, 0, 0]; this.jaw.cur = 0; for (const e of this.eyes) { e.tgt = [0, 0]; e.cur = [0, 0]; e.ball.rotation.set(0, 0, 0); } }
  }
  setGlow(v) {
    this.glow = v;
    this.mats.pupil.emissiveIntensity = v * 4;
    this.mats.pupil.color.setHex(v > 0 ? 0xffffff : 0x020202);
  }
  setMode(m, lookAt = null) { this.mode = m; this.lookAt = lookAt; }
  // a snapshot number that changes whenever the pose changes (for the renderer's still-image cache)
  sig() {
    let s = 0;
    for (const j of JOINTS) { const n = this.J[j]; if (n) s += n.rotation.x * 1.3 + n.rotation.y * 1.7 + n.rotation.z * 1.9; }
    for (const e of this.eyes) s += e.ball.rotation.x * 2.3 + e.ball.rotation.y * 2.9;
    return s + this.glow * 3 + this.pupil.cur;
  }
  // make the eyes snap to look at something right now (used on cameras: they look at you)
  glance(worldPos) {
    for (const e of this.eyes) { const a = this.eyeAngles(e.ball, worldPos); e.tgt = a; e.cur = a.slice(); }
  }
  eyeAngles(ball, worldPos) {
    ball.parent.updateWorldMatrix(true, false);
    _m.copy(ball.parent.matrixWorld).invert();
    _v.copy(worldPos).applyMatrix4(_m).sub(ball.position).normalize();
    const yaw = Math.atan2(_v.x, _v.z), pitch = -Math.asin(Math.max(-1, Math.min(1, _v.y)));
    return [Math.max(-0.5, Math.min(0.5, pitch)), Math.max(-0.55, Math.min(0.55, yaw))];
  }
  update(dt, speed = 10) {
    this.t += dt;
    const k = 1 - Math.exp(-speed * dt);
    const live = this.mode !== 'still';
    // --- pose blend
    for (const j of JOINTS) {
      const r = this.target[j], b = this.base[j];
      if (!r || !b) continue;
      b[0] += (r[0] - b[0]) * k; b[1] += (r[1] - b[1]) * k; b[2] += (r[2] - b[2]) * k;
    }
    this.J.hips.position.y += (this.hipTarget - this.J.hips.position.y) * k;
    // --- head servo layer: holds still, then moves fast to a new angle and stops with a tiny overshoot
    const H = this.head;
    if (live) {
      H.next -= dt;
      if (H.next <= 0) {
        const amp = this.mode === 'scare' ? 0.25 : this.mode === 'stare' ? 0.06 : 0.12;
        H.tgt = [(Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 1.6, (Math.random() - 0.5) * amp * 0.8];
        if (this.mode !== 'scare' && Math.random() < 0.25) H.tgt[2] += (Math.random() < 0.5 ? -1 : 1) * 0.12; // creepy tilt
        H.next = this.mode === 'scare' ? 0.05 + Math.random() * 0.08 : 1.2 + Math.random() * 3.5;
      }
    } else H.tgt = [0, 0, 0];
    const stiff = this.mode === 'scare' ? 900 : 260, damp = this.mode === 'scare' ? 30 : 24;
    for (let i = 0; i < 3; i++) {
      const acc = (H.tgt[i] - H.cur[i]) * stiff - H.vel[i] * damp;
      H.vel[i] += acc * dt; H.cur[i] += H.vel[i] * dt;
      if (!live && Math.abs(H.cur[i]) < 1e-4) { H.cur[i] = 0; H.vel[i] = 0; }
    }
    // --- jaw layer: hangs, occasionally clacks open and shut
    const Jw = this.jaw;
    if (this.mode === 'scare') { Jw.tgt = 0.25 + Math.random() * 0.35; }
    else if (live) {
      Jw.next -= dt;
      if (Jw.next <= 0) { Jw.tgt = 0.12 + Math.random() * 0.25; Jw.hold = 0.12 + Math.random() * 0.25; Jw.next = 3 + Math.random() * 6; }
      if (Jw.hold > 0) { Jw.hold -= dt; if (Jw.hold <= 0) Jw.tgt = 0; }
    } else Jw.tgt = 0;
    Jw.cur += (Jw.tgt - Jw.cur) * Math.min(1, dt * (this.mode === 'scare' ? 40 : 18));
    // --- apply
    for (const j of JOINTS) {
      const n = this.J[j], b = this.base[j];
      if (!n || !b) continue;
      let x = b[0], y = b[1], z = b[2];
      if (j === 'head') { x += H.cur[0]; y += H.cur[1]; z += H.cur[2]; }
      if (j === 'jaw') x += Jw.cur;
      n.rotation.set(x, y, z);
    }
    if (this.jitter > 0) {
      const a = this.jitter;
      this.J.head.rotation.x += (Math.random() - 0.5) * 0.18 * a;
      this.J.head.rotation.z += (Math.random() - 0.5) * 0.18 * a;
      this.J.jaw.rotation.x += Math.random() * 0.2 * a;
    }
    // jaw pistons follow the jaw
    for (const key of ['pistonL', 'pistonR']) { const P = this.J[key]; if (P) P.rod.position.y = -0.05 - this.J.jaw.rotation.x * 0.06; }
    // --- eyes: each one saccades on its own; in stare/scare they lock onto the target
    for (const e of this.eyes) {
      if (live) {
        e.next -= dt;
        if ((this.mode === 'stare' || this.mode === 'scare') && this.lookAt) {
          if (e.next <= 0) {
            const a = this.eyeAngles(e.ball, this.lookAt);
            const wob = this.mode === 'scare' ? 0.08 : 0.025;
            e.tgt = [a[0] + (Math.random() - 0.5) * wob, a[1] + (Math.random() - 0.5) * wob];
            e.next = (this.mode === 'scare' ? 0.06 : 0.6 + Math.random() * 1.6) + e.lag;
          }
        } else if (e.next <= 0) {
          e.tgt = [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8];
          e.next = 0.8 + Math.random() * 2.5 + e.lag;
        }
      }
      // saccade: very fast snap
      const sk = Math.min(1, dt * 28);
      e.cur[0] += (e.tgt[0] - e.cur[0]) * sk; e.cur[1] += (e.tgt[1] - e.cur[1]) * sk;
      e.ball.rotation.set(e.cur[0], e.cur[1], 0);
    }
    // --- pupils dilate / constrict
    const Pu = this.pupil;
    if (this.mode === 'scare') Pu.tgt = 0.45;
    else if (live) { Pu.next -= dt; if (Pu.next <= 0) { Pu.tgt = 0.75 + Math.random() * 0.6; Pu.next = 1.5 + Math.random() * 3; } }
    Pu.cur += (Pu.tgt - Pu.cur) * Math.min(1, dt * 6);
    if (this.kind !== 'victor') for (const p of this.J.pupils) { const sx = this.kind === 'kiril' ? 0.35 : 1; p.scale.set(Pu.cur * sx, 1, Pu.cur); }
  }
}
