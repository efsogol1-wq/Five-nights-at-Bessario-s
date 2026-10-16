// The rooms of Bessario's Burgers. Each camera room is its own scene (only the
// room on screen is ever rendered), plus the security office.
import * as THREE from 'three';
import { Tex } from './textures.js';
import {
  Mats, add, rnd, pick, partyTable, chair, balloon, streamer, confetti, poster, drawing, drawingsRow, hangingLamp, tubeLight,
  counter, grill, fryer, hood, pans, shelf, trashCan, mopBucket, speaker, doorway, wallClock, arcade, partyHat,
  dress, decal, extinguisher, conduit, vent, wallCam,
} from './props.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

// ------------------------------------------------------------ shell
function shell(scene, { w, d, h, hue = 'red', floorRep = null, wallMat = null, ceiling = true, floorTex = null }) {
  const fl = (floorTex || Tex.checker()).clone();
  fl.wrapS = fl.wrapT = THREE.RepeatWrapping;
  const rep = floorRep || [w / 2.4, d / 2.4];
  fl.repeat.set(rep[0], rep[1]); fl.needsUpdate = true;
  add(scene, new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: fl, bumpMap: fl, bumpScale: 1.6, roughness: 0.5, metalness: 0.05 }), 0, 0, 0, { rx: -Math.PI / 2, cast: false });
  const wallFor = (len) => {
    if (wallMat) return wallMat(len);
    const t = Tex.wall(hue).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 2.6, 1); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2.2, roughness: 0.85 });
  };
  const walls = [
    [w, 0, d / 2, Math.PI], [w, 0, -d / 2, 0], [d, -w / 2, 0, Math.PI / 2], [d, w / 2, 0, -Math.PI / 2],
  ];
  for (const [len, x, z, ry] of walls) add(scene, new THREE.PlaneGeometry(len, h), wallFor(len), x, h / 2, z, { ry, cast: false });
  if (ceiling) {
    const ct = Tex.ceiling().clone(); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(w / 1.2, d / 1.2); ct.needsUpdate = true;
    add(scene, new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: ct, bumpMap: ct, bumpScale: 3, roughness: 0.95 }), 0, h, 0, { rx: Math.PI / 2, cast: false });
  }
  // baseboard
  const bm = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.7 });
  add(scene, B(w, 0.12, 0.03), bm, 0, 0.06, -d / 2 + 0.015, { cast: false });
  add(scene, B(w, 0.12, 0.03), bm, 0, 0.06, d / 2 - 0.015, { cast: false });
  add(scene, B(0.03, 0.12, d), bm, -w / 2 + 0.015, 0.06, 0, { cast: false });
  add(scene, B(0.03, 0.12, d), bm, w / 2 - 0.015, 0.06, 0, { cast: false });
}

function baseScene(amb = 0.05) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  s.add(new THREE.HemisphereLight(0x8090a0, 0x201810, amb));
  return s;
}

// A camera-room record
function room(id, scene) {
  return { id, scene, cams: {}, spots: {}, lamps: [], flick: [], update: null, props: {} };
}

// flickering behaviour for a lamp/tube
function flickerer(l, { rate = 0.25, dead = false } = {}) {
  return { l, rate, dead, t: Math.random() * 5, on: true };
}
export function updateFlicker(list, dt) {
  for (const f of list) {
    f.t -= dt;
    if (f.t <= 0) {
      if (f.on) { f.on = Math.random() > f.rate; f.t = f.on ? 0.3 + Math.random() * 3 : 0.04 + Math.random() * 0.15; }
      else { f.on = true; f.t = 0.2 + Math.random() * 2; }
      const k = f.dead ? 0 : f.on ? 1 : 0.08;
      f.l.light.intensity = f.l.base * k;
      const bb = f.l.light.userData.bounce; if (bb) bb.intensity = f.l.light.intensity * 0.05;
      if (f.l.tubeMat) f.l.tubeMat.emissiveIntensity = 1.6 * k;
      if (f.l.bulb) f.l.bulb.material = k > 0.5 ? Mats.bulb() : Mats.bulbOff();
    }
  }
}

function cam(pos, look, { fov = 62, pan = 0.35, panSpeed = 0.12 } = {}) {
  const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.05, 60);
  c.position.set(...pos);
  const target = new THREE.Vector3(...look);
  c.lookAt(target);
  return { camera: c, target, pan, panSpeed, baseYaw: c.rotation.y, phase: Math.random() * 6 };
}

// spot helper: [x, z, ry, pose, y]
const sp = (x, z, ry = 0, pose = 'stand', y = 0) => ({ x, z, ry, pose, y });

// ======================================================================
// SHOW STAGE  (CAM 1A)
// ======================================================================
function buildStage() {
  const S = baseScene(0.04), R = room('stage', S);
  const w = 12, d = 10, h = 4.6;
  shell(S, { w, d, h, hue: 'red' });
  dress(S, { w, d, h, floor: 12, walls: 9, ceil: 5 });
  // stage platform
  const st = new THREE.Group(); S.add(st);
  add(st, B(9.4, 0.9, 3.2), Mats.wood(), 0, 0.45, -3.4);
  add(st, B(9.4, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.4, metalness: 0.6 }), 0, 0.84, -1.78);
  add(st, B(9.4, 0.78, 0.03), new THREE.MeshStandardMaterial({ map: Tex.curtain('#2a1a3a'), roughness: 0.9 }), 0, 0.4, -1.78, { cast: false });
  // marquee bulbs along the stage lip (some dead)
  R.marquee = [];
  for (let i = 0; i < 30; i++) {
    const on = rnd() > 0.22;
    const b = add(st, new THREE.SphereGeometry(0.035, 8, 6), on ? Mats.bulb() : Mats.bulbOff(), -4.5 + i * 0.31, 0.72, -1.74, { cast: false });
    R.marquee.push(b);
  }
  // curtains
  const ct = Tex.curtain('#6a0e18').clone(); ct.repeat.set(5, 1); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.needsUpdate = true;
  const cm = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.92, side: THREE.DoubleSide });
  add(S, new THREE.PlaneGeometry(10, 4.4, 40, 1), cm, 0, 2.6, -4.95, { cast: false });
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1.6, 3.7, 24, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.12);
    g.computeVertexNormals();
    add(S, g, cm, sx * 4.2, 2.75, -2.0, { cast: false });
  }
  // valance
  add(S, new THREE.PlaneGeometry(10, 0.9, 40, 1), cm, 0, 4.15, -1.95, { cast: false });
  // sign
  const sm = new THREE.MeshStandardMaterial({ map: Tex.sign("BESSARIO'S", 'BURGERS & FUN'), emissive: 0xffffff, emissiveMap: Tex.sign("BESSARIO'S", 'BURGERS & FUN'), emissiveIntensity: 0.55, roughness: 0.6 });
  add(S, new THREE.PlaneGeometry(4.4, 1.1), sm, 0, 3.6, -4.85, { cast: false });
  // speakers + big cardboard burger
  speaker(S, -4.4, 1.3, -3.6, 0.3); speaker(S, 4.4, 1.3, -3.6, -0.3);
  const burger = new THREE.Group(); burger.position.set(3.4, 0.9, -4.4); S.add(burger);
  add(burger, C(0.55, 0.55, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0xc8892a, roughness: 0.8 }), 0, 0.15, 0);
  add(burger, C(0.58, 0.58, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x4a2410, roughness: 0.8 }), 0, 0.27, 0);
  add(burger, C(0.6, 0.6, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0x3a8a2a, roughness: 0.8 }), 0, 0.34, 0);
  add(burger, new THREE.SphereGeometry(0.56, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8892a, roughness: 0.8 }), 0, 0.36, 0, { s: 1 }).scale.set(1, 0.6, 1);
  // drum-kit-ish stool + mic stand
  add(S, C(0.012, 0.012, 1.5, 6), Mats.steel(), 0.7, 1.65, -2.6);
  add(S, new THREE.SphereGeometry(0.04, 8, 6), Mats.dark(), 0.7, 2.42, -2.6);
  // truss with stage cans
  add(S, B(9, 0.12, 0.12), Mats.steelDirty(), 0, 4.2, -1.2);
  R.stageLights = [];
  for (const [x, tx] of [[-2.6, -2.2], [0, 0], [2.6, 2.2]]) {
    add(S, C(0.11, 0.14, 0.28, 12), Mats.dark(), x, 4.0, -1.2, { rx: 0.9 });
    const L = new THREE.SpotLight(x === 0 ? 0xffe0b8 : 0xffd0a0, x === 0 ? 150 : 90, 14, 0.42, 0.55, 2);
    L.position.set(x, 3.95, -0.6); L.target.position.set(tx, 1.9, -3.3);
    if (x === 0) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.0015; }
    S.add(L, L.target); R.stageLights.push(L);
  }
  // house lights: dim
  const l1 = hangingLamp(S, -3, 3.6, 2.5, { intensity: 16, cord: 0.9 }); const l2 = hangingLamp(S, 3, 3.6, 2.5, { intensity: 16, cord: 0.9 });
  const fill = new THREE.PointLight(0xff9a70, 14, 9, 2); fill.position.set(0, 3.0, -4.2); S.add(fill);
  const face = new THREE.PointLight(0xffe0c0, 6, 6, 2); face.position.set(0.5, 2.9, -1.2); S.add(face);
  R.flick.push(flickerer(l2, { rate: 0.18 }));
  void l1;
  // tables + clutter
  partyTable(S, -2.5, 1.6, 3.2, 0, 0.8); partyTable(S, 2.6, 2.4, 3.2, 0.05, 0.8);
  confetti(S, -5.5, -1.5, 11, 6, 0, 240);
  for (let i = 0; i < 4; i++) balloon(S, -5.4 + rnd() * 0.4, 2.2 + rnd() * 0.4, -1.2 + i * 0.25);
  poster(S, 'main', 5.97, 2.0, 2.0, -Math.PI / 2, 0.7); poster(S, 'rules', 5.97, 2.0, 0.5, -Math.PI / 2, 0.6);
  drawingsRow(S, 1.5, 4.0, 1.7, -5.97 + 0.0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 6; i++) drawing(S, 10 + i, -5.97, 1.5 + (i % 2) * 0.4, 1.0 + i * 0.5, Math.PI / 2);
  doorway(S, -5.98, -0.2, Math.PI / 2, 1.4, 2.4, { sign: 'EXIT' });
  wallClock(S, 5.97, 3.3, -1, -Math.PI / 2);
  R.cams['1A'] = cam([0.9, 2.5, 0.5], [0, 1.75, -3.4], { fov: 56, pan: 0.2 });
  R.spots = {
    bessario: [sp(0, -3.3, 0, 'perform', 0.9)],
    kiril: [sp(-2.3, -3.1, 0.15, 'basket', 0.9)],
    kira: [sp(2.3, -3.1, -0.15, 'tray', 0.9)],
  };
  return R;
}

// ======================================================================
// DINING AREA (CAM 1B)
// ======================================================================
function buildDining() {
  const S = baseScene(0.035), R = room('dining', S);
  const w = 14, d = 12, h = 4;
  shell(S, { w, d, h, hue: 'red' });
  dress(S, { w, d, h, floor: 16, walls: 10, ceil: 6 });
  extinguisher(S, -6.97, 4.0, Math.PI / 2);
  partyTable(S, -3.6, -2.5, 4.4, 0, 1); partyTable(S, -3.6, 1.4, 4.4, 0, 1);
  partyTable(S, 2.4, -2.5, 4.4, 0, 1); partyTable(S, 2.4, 1.4, 4.4, 0, 0.9);
  confetti(S, -6.5, -5.5, 13, 11, 0, 400);
  // ceiling streamers
  const cols = [0xc0392b, 0x2c5fa8, 0xe2a51b, 0x3b8a3e];
  for (let i = 0; i < 6; i++) streamer(S, new THREE.Vector3(-6.9, 3.8, -5 + i * 2), new THREE.Vector3(6.9, 3.8, -4 + i * 1.6), cols[i % 4], 0.5);
  for (let i = 0; i < 10; i++) balloon(S, -6 + rnd() * 12, 1.6 + rnd() * 0.7, -5 + rnd() * 9);
  // lights
  R.tubes = [];
  for (const [x, z] of [[-3.5, -2.5], [2.5, -2.5], [-3.5, 1.4], [2.5, 1.4]]) {
    const t = tubeLight(S, x, h - 0.04, z, 0, { intensity: 18, color: 0xe8f0d8 });
    R.tubes.push(t);
  }
  R.flick.push(flickerer(R.tubes[1], { rate: 0.3 }), flickerer(R.tubes[2], { dead: true }));
  updateFlicker(R.flick, 999);
  const lamp = hangingLamp(S, 0, h - 0.6, 4.6, { intensity: 14, shadow: true, cord: 0.5 });
  void lamp;
  // walls: posters, drawings, arcades, doorways
  poster(S, 'celebrate', -2, 2.1, -5.97, 0, 0.9); poster(S, 'kira', 1.5, 2.0, -5.97, 0, 0.65); poster(S, 'kiril', 4, 2.0, -5.97, 0, 0.65);
  drawingsRow(S, -6.2, -3.6, 1.55, -5.97, 0, 6, 20);
  arcade(S, 6.4, -4.2, -Math.PI / 2, 0x2a3a8a); arcade(S, 6.4, -3.3, -Math.PI / 2, 0x8a2a2a); arcade(S, 6.4, -2.4, -Math.PI / 2, 0x2a6a3a);
  doorway(S, -6.98, -1, Math.PI / 2, 1.6, 2.5);                 // to west hall
  doorway(S, 6.98, 2.2, -Math.PI / 2, 1.6, 2.5);                // to east hall
  doorway(S, 0, -5.98, 0, 2.2, 2.6, { frame: 0x5a1010 });        // to stage
  poster(S, 'menu', -6.97, 2.1, 2.8, Math.PI / 2, 0.8);
  trashCan(S, -6.3, 4.8); trashCan(S, 6.3, 4.8);
  wallClock(S, 0, 3.3, 5.97, Math.PI);
  R.cams['1B'] = cam([5.2, 3.4, 5.5], [-1.2, 0.9, -2.4], { fov: 62, pan: 0.3 });
  const near = hangingLamp(S, 2.4, 3.3, 2.2, { intensity: 12, cord: 0.6 }); R.flick.push(flickerer(near, { rate: 0.12 }));
  const back = new THREE.SpotLight(0xffd8b0, 18, 9, 0.6, 0.7, 2); back.position.set(0, 3.7, -2.5); back.target.position.set(0, 0.8, -5.2); S.add(back, back.target);
  R.spots = {
    bessario: [sp(-0.4, -4.6, 0.2, 'stare'), sp(-5.8, 3.6, 2.2, 'stand')],
    kiril: [sp(2.3, 2.9, 0.9, 'stand'), sp(-5.6, -0.9, 1.4, 'stare'), sp(4.6, -0.6, -0.4, 'peek')],
    kira: [sp(0.6, 0.3, 0.8, 'stand'), sp(1.0, 3.6, 0.7, 'tray'), sp(5.0, 3.2, -2.2, 'stare')],
  };
  return R;
}

// ======================================================================
// KITCHEN (CAM 2)  — the order hatch to the office is on the far wall
// ======================================================================
function buildKitchen() {
  const S = baseScene(0.03), R = room('kitchen', S);
  const w = 8, d = 7, h = 3.4;
  shell(S, { w, d, h, hue: 'green' });
  dress(S, { w, d, h, floor: 12, walls: 10, ceil: 5, stains: ['dirt', 'soda', 'soot', 'water'] });
  extinguisher(S, -3.97, 2.0, Math.PI / 2);
  grill(S, -2.5, -2.95, 0); fryer(S, -0.9, -2.95, 0);
  hood(S, -1.9, 2.6, -2.95, 2.8);
  counter(S, 2.4, -3.05, 2.4, 0.6, 0);                         // pass counter under the hatch
  // the hatch: opening into the office (dark), heat lamp, ticket rail
  add(S, new THREE.PlaneGeometry(1.5, 0.85), Mats.black(), 2.4, 1.48, -3.49, { cast: false });
  const fm = Mats.steelDirty();
  add(S, B(1.62, 0.06, 0.12), fm, 2.4, 1.94, -3.44); add(S, B(1.62, 0.06, 0.12), fm, 2.4, 1.03, -3.44);
  add(S, B(0.06, 0.9, 0.12), fm, 1.62, 1.48, -3.44); add(S, B(0.06, 0.9, 0.12), fm, 3.18, 1.48, -3.44);
  add(S, B(1.4, 0.02, 0.02), Mats.steel(), 2.4, 2.1, -3.38);
  for (let i = 0; i < 5; i++) add(S, new THREE.PlaneGeometry(0.1, 0.18), Mats.paper(), 1.9 + i * 0.25, 2.0, -3.37, { cast: false }).rotation.z = (rnd() - 0.5) * 0.2;
  const heat = new THREE.PointLight(0xff6a30, 2.5, 4, 2); heat.position.set(2.4, 2.25, -3.0); S.add(heat);
  add(S, C(0.08, 0.14, 0.16, 12, true), new THREE.MeshStandardMaterial({ color: 0x3a1a10, side: THREE.DoubleSide, emissive: 0x6a1a00, emissiveIntensity: 0.5 }), 2.4, 2.35, -3.0);
  add(S, new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshStandardMaterial({ map: Tex.label('ORDER UP', { w: 512, h: 128, bg: '#7a1010', fg: '#f0e0c0', size: 84 }), roughness: 0.6 }), 2.4, 2.55, -3.48, { cast: false });
  // prep counter + clutter
  counter(S, 3.6, 0.2, 2.6, 0.7, -Math.PI / 2);
  shelf(S, -3.7, 0.8, 1.4, 1.9, Math.PI / 2, 'cans');
  pans(S, 0.6, 2.85, 0.2, 6);
  mopBucket(S, -2.8, 2.6);
  for (let i = 0; i < 4; i++) add(S, B(0.3, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.9 }), 3.4 + (i % 2) * 0.32, 0.125 + Math.floor(i / 2) * 0.25, 2.8);
  // buns on the counter, a knocked over bottle
  for (let i = 0; i < 5; i++) add(S, new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc08030 }), 3.5, 0.93, -0.6 + i * 0.18);
  add(S, C(0.04, 0.04, 0.22, 10), Mats.plasticRed(), 3.4, 0.95, 0.6, { rz: Math.PI / 2 });
  add(S, B(0.5, 0.01, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a0a08, roughness: 0.2 }), 3.0, 0.002, 0.7, { cast: false });
  const tube = tubeLight(S, 0, h - 0.04, 0.3, 0, { intensity: 22, color: 0xd8ecd0 });
  hangingLamp(S, -1.6, 2.9, -1.4, { intensity: 14, cord: 0.3, shadow: true });
  R.flick.push(flickerer(tube, { rate: 0.4 }));
  doorway(S, -3.98, -1.6, Math.PI / 2, 1.2, 2.3);
  doorway(S, 0.5, 3.48, Math.PI, 1.1, 2.2, { frame: 0x6a6a6a });
  R.cams['2'] = cam([3.5, 2.9, 3.1], [-0.8, 1.0, -2.4], { fov: 66, pan: 0.25 });
  R.spots = {
    kira: [sp(-1.4, -0.9, 0.4, 'stand'), sp(2.4, -2.55, Math.PI, 'hatch')],
    bessario: [sp(-2.6, 1.0, 1.2, 'stare')],
    kiril: [sp(1.0, 1.6, -2.4, 'stand')],
  };
  return R;
}

// ======================================================================
// BACK STORAGE + FREEZER (CAM 3)  — LeBron
// ======================================================================
function buildFreezer() {
  const S = baseScene(0.03), R = room('freezer', S);
  const w = 6.5, d = 6, h = 3.2;
  const conc = (len) => { const t = Tex.plaster().clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 1.5, 2); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); };
  const fl = Tex.plaster();
  shell(S, { w, d, h, wallMat: conc, floorTex: fl, floorRep: [3, 3] });
  dress(S, { w, d, h, floor: 10, walls: 8, ceil: 4, stains: ['dirt', 'water', 'rust'] });
  // freezer wall section (steel panels around the door)
  const panel = new THREE.MeshStandardMaterial({ map: Tex.frost(), roughness: 0.45, metalness: 0.55, color: 0xb8c4c8 });
  add(S, B(3.2, 3.2, 0.2), panel, -0.4, 1.6, -2.92);
  // door frame + freezer interior (dark, cold light)
  add(S, B(1.5, 2.35, 0.25), Mats.black(), -0.4, 1.175, -2.95, { cast: false });
  const inner = new THREE.PointLight(0x7ab8ff, 0, 5, 2); inner.position.set(-0.4, 1.8, -3.6); S.add(inner);
  R.props.innerLight = inner;
  // the door (hinged on the left)
  const hinge = new THREE.Group(); hinge.position.set(-1.12, 0, -2.78); S.add(hinge);
  const door = new THREE.Group(); door.position.set(0.72, 0, 0); hinge.add(door);
  add(door, B(1.44, 2.3, 0.12), panel, 0, 1.15, 0);
  // porthole
  add(door, new THREE.TorusGeometry(0.17, 0.03, 8, 24), Mats.steel(), 0, 1.6, 0.07);
  const glass = add(door, new THREE.CircleGeometry(0.16, 24), new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 }), 0, 1.6, 0.065, { cast: false });
  void glass;
  // eyes behind the porthole (shown at lock stages)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const eyes = new THREE.Group(); eyes.position.set(0, 1.62, -0.06); door.add(eyes);
  add(eyes, new THREE.SphereGeometry(0.018, 8, 6), eyeMat, -0.05, 0, 0, { cast: false }); add(eyes, new THREE.SphereGeometry(0.018, 8, 6), eyeMat, 0.05, 0, 0, { cast: false });
  eyes.visible = false;
  // handle, lock wheel, chain and padlock, signs
  add(door, B(0.06, 0.4, 0.08), Mats.steel(), 0.58, 1.15, 0.1);
  const wheel = new THREE.Group(); wheel.position.set(0.25, 1.1, 0.09); door.add(wheel);
  add(wheel, new THREE.TorusGeometry(0.16, 0.022, 8, 24), Mats.plasticRed(), 0, 0, 0);
  for (let i = 0; i < 3; i++) add(wheel, B(0.32, 0.03, 0.03), Mats.plasticRed(), 0, 0, 0, { rz: i * Math.PI / 3 });
  const chain = new THREE.Group(); chain.position.set(0.0, 1.0, 0.11); door.add(chain);
  for (let i = 0; i < 14; i++) add(chain, new THREE.TorusGeometry(0.03, 0.008, 6, 10), Mats.steelDirty(), -0.62 + i * 0.09, Math.sin(i / 13 * Math.PI) * -0.1, 0, { ry: i % 2 ? Math.PI / 2 : 0 });
  add(chain, B(0.09, 0.11, 0.04), Mats.plasticYellow(), 0.0, -0.17, 0.02);
  add(door, new THREE.PlaneGeometry(0.8, 0.32), new THREE.MeshStandardMaterial({ map: Tex.label('OUT OF ORDER', { w: 512, h: 160, bg: '#d8c890', fg: '#7a1010', size: 74 }), roughness: 0.9 }), 0, 0.55, 0.065, { cast: false }).rotation.z = 0.06;
  add(S, new THREE.PlaneGeometry(1.4, 0.28), new THREE.MeshStandardMaterial({ map: Tex.label('WALK-IN FREEZER', { w: 512, h: 100, bg: '#1a2a3a', fg: '#c8d8e8', size: 64 }), roughness: 0.7 }), -0.4, 2.65, -2.8, { cast: false });
  R.props.hinge = hinge; R.props.door = door; R.props.eyes = eyes; R.props.chain = chain; R.props.wheel = wheel;
  // lock gauge on the wall (shows the lock state)
  const gauge = new THREE.Group(); gauge.position.set(1.5, 1.5, -2.8); S.add(gauge);
  add(gauge, B(0.34, 0.5, 0.08), Mats.steelDirty(), 0, 0, 0);
  const lamps = [];
  for (let i = 0; i < 4; i++) lamps.push(add(gauge, new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000 }), 0, -0.15 + i * 0.1, 0.05, { cast: false }));
  R.props.gaugeLamps = lamps;
  // storage clutter
  shelf(S, 2.6, -1.2, 1.4, 2.0, -Math.PI / 2, 'boxes');
  shelf(S, 2.6, 1.0, 1.4, 2.0, -Math.PI / 2, 'boxes');
  shelf(S, -3.0, 0.2, 1.4, 2.0, Math.PI / 2, 'cans');
  for (let i = 0; i < 7; i++) add(S, B(0.45, 0.35, 0.45), new THREE.MeshStandardMaterial({ color: pick([0x9a7a4a, 0x8a6a3a, 0xb09060]), roughness: 0.9 }), -2.6 + (i % 3) * 0.5, 0.175 + Math.floor(i / 3) * 0.35, 2.3 + (i % 2) * 0.1, { ry: rnd() * 0.3 });
  // broken drive-thru menu board leaning on the wall
  const mb = add(S, B(1.4, 0.9, 0.05), new THREE.MeshStandardMaterial({ map: Tex.poster('menu'), roughness: 0.8 }), 1.4, 0.55, 2.7, { rx: -0.2, ry: Math.PI });
  void mb;
  poster(S, 'lebron', -2.5, 1.9, -2.98, 0, 0.6);
  const bulb = hangingLamp(S, -0.4, 2.9, -2.0, { intensity: 18, cord: 0.2, shadow: true });
  hangingLamp(S, 1.8, 2.9, 0.8, { intensity: 7, cord: 0.2 });
  R.flick.push(flickerer(bulb, { rate: 0.15 }));
  R.cams['3'] = cam([2.2, 2.65, 2.4], [-0.6, 1.3, -2.8], { fov: 60, pan: 0.15 });
  R.spots = {
    lebron: [sp(-0.4, -3.75, 0, 'freezer')],
  };
  return R;
}

// ======================================================================
// HALLS (CAM 4A/4B west, 5A/5B east). The office door is at the +Z end.
// ======================================================================
function buildHall(side) {
  const S = baseScene(0.025), R = room(side === 'west' ? 'westHall' : 'eastHall', S);
  const w = 2.8, d = 16, h = 3.0;
  shell(S, { w, d, h, hue: side === 'west' ? 'red' : 'blue' });
  dress(S, { w, d, h, floor: 14, walls: 12, ceil: 6, webs: 4, cam: false });
  wallCam(S, side === 'west' ? -1.25 : 1.25, 2.85, -7.85, 0, 0.45);
  const flip = side === 'west' ? 1 : -1;
  // office door at +Z end (dark opening with the door frame)
  doorway(S, 0, 7.98, Math.PI, 1.3, 2.3, { frame: 0x3a3a3a });
  doorway(S, 0, -7.98, 0, 1.8, 2.5);                            // to dining
  // side door (staff / supply closet)
  doorway(S, flip * 1.38, -2.5, -flip * Math.PI / 2, 1.0, 2.2, { frame: 0x4a3a2a, sign: side === 'west' ? 'STAFF' : 'SUPPLY' });
  // posters & drawings
  const wx = flip * -1.39, ry = flip * Math.PI / 2;
  if (side === 'west') {
    poster(S, 'kiril', wx, 1.8, -5, ry, 0.6); poster(S, 'rules', wx, 1.8, 0.5, ry, 0.55); poster(S, 'celebrate', flip * 1.39, 1.9, 3.5, -ry, 0.6);
    for (let i = 0; i < 8; i++) drawing(S, 30 + i, wx, 1.4 + (i % 2) * 0.35, -3.5 + i * 0.45, ry);
    mopBucket(S, flip * 0.8, 1.5);
  } else {
    poster(S, 'main', wx, 1.8, -5, ry, 0.6); poster(S, 'kira', wx, 1.8, 0.5, ry, 0.55); poster(S, 'menu', flip * 1.39, 1.9, 3.5, -ry, 0.6);
    for (let i = 0; i < 8; i++) drawing(S, 40 + i, wx, 1.4 + (i % 2) * 0.35, -3.5 + i * 0.45, ry);
    trashCan(S, flip * 1.0, -6.5);
    // fallen party hat & a chair
    partyHat(S, -0.3, 0, 2.0, 2.5); chair(S, 0.7, -5.5, 1);
  }
  // wall pipes along the ceiling
  add(S, C(0.05, 0.05, d, 8), Mats.steelDirty(), flip * 1.2, 2.8, 0, { rx: Math.PI / 2 });
  add(S, C(0.03, 0.03, d, 8), new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.5, metalness: 0.6 }), flip * 1.05, 2.86, 0, { rx: Math.PI / 2 });
  // lights: three dim lamps, one flickering
  const la = hangingLamp(S, 0, 2.7, -5.5, { intensity: 6, cord: 0.25 });
  const lb = hangingLamp(S, 0, 2.7, -0.5, { intensity: 6, cord: 0.25, shadow: true });
  const lc = hangingLamp(S, 0, 2.7, 4.6, { intensity: 5, cord: 0.25 });
  R.flick.push(flickerer(side === 'west' ? lb : la, { rate: 0.35 }), flickerer(lc, { rate: 0.12 }));
  void la;
  const A = side === 'west' ? '4A' : '5A', Bc = side === 'west' ? '4B' : '5B';
  // xA: high at the office end looking down the hall; xB: by the office door looking at the corner
  R.cams[A] = cam([flip * -0.9, 2.75, 7.6], [flip * 0.2, 1.0, -6], { fov: 58, pan: 0.12 });
  // xB: from the ceiling just outside your door, looking down into the corner beside it (FNAF 2B style)
  R.cams[Bc] = cam([flip * -1.15, 2.78, 7.75], [flip * 0.95, 1.15, 5.3], { fov: 70, pan: 0.1 });
  poster(S, side === 'west' ? 'kira' : 'celebrate', flip * 1.385, 1.75, 5.0, -flip * Math.PI / 2, 0.55);
  const cornerLamp = hangingLamp(S, flip * 0.55, 2.75, 5.6, { intensity: 5, cord: 0.15, shadow: true });
  R.flick.push(flickerer(cornerLamp, { rate: 0.2 }));
  drawing(S, side === 'west' ? 90 : 91, flip * 1.385, 1.35, 6.1, -flip * Math.PI / 2);
  R.spots = side === 'west' ? {
    kiril: [sp(-0.2, -5.6, 0.1, 'stand'), sp(0.78, 5.7, -0.76, 'stare')],
    lebron: [sp(0, -6, 0, 'run'), sp(0, 4, 0, 'run')],
  } : {
    bessario: [sp(0.2, -5.4, -0.1, 'stare'), sp(-0.78, 5.7, 0.76, 'stare')],
  };
  return R;
}

// ======================================================================
// RESTROOMS (CAM 6)
// ======================================================================
function buildRestrooms() {
  const S = baseScene(0.03), R = room('restrooms', S);
  const w = 5, d = 5, h = 3;
  const tile = (len) => { const t = Tex.wall('blue').clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 1.6, 1); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); };
  shell(S, { w, d, h, wallMat: tile });
  dress(S, { w, d, h, floor: 8, walls: 6, ceil: 3, stains: ['water', 'dirt'] });
  doorway(S, -1.2, -2.48, 0, 0.9, 2.1, { frame: 0x2a4a7a });
  doorway(S, 1.2, -2.48, 0, 0.9, 2.1, { frame: 0x7a2a5a });
  add(S, new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshStandardMaterial({ map: Tex.label('BOYS', { w: 256, h: 96, bg: '#2a4a7a', fg: '#ffffff', size: 64 }) }), -1.2, 2.35, -2.47, { cast: false });
  add(S, new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshStandardMaterial({ map: Tex.label('GIRLS', { w: 256, h: 96, bg: '#7a2a5a', fg: '#ffffff', size: 64 }) }), 1.2, 2.35, -2.47, { cast: false });
  add(S, B(0.3, 0.25, 0.15), Mats.steel(), 2.42, 1.3, 0.2, { ry: -Math.PI / 2 });   // hand dryer
  trashCan(S, 2.1, 1.3);
  add(S, B(0.45, 0.6, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.05, metalness: 0.9 }), -2.48, 1.6, 0.6, { ry: Math.PI / 2 }); // mirror
  drawing(S, 55, -2.47, 1.5, -1.0, Math.PI / 2);
  const l = tubeLight(S, 0, h - 0.04, 0, Math.PI / 2, { intensity: 9 });
  l.light.castShadow = true; l.light.shadow.mapSize.set(1024, 1024); l.light.shadow.bias = -0.003;
  R.flick.push(flickerer(l, { rate: 0.45 }));
  doorway(S, 0, 2.48, Math.PI, 1.4, 2.3);
  R.cams['6'] = cam([1.9, 2.7, 2.1], [-0.6, 1.0, -2.2], { fov: 68, pan: 0.2 });
  R.spots = {
    kira: [sp(1.2, -1.6, 0.4, 'stare')],
    bessario: [sp(-1.1, -1.7, 0.3, 'stare')],
    kiril: [sp(-0.4, 0.4, 0.9, 'peek')],
  };
  return R;
}

// ======================================================================
// PARTY ROOM (CAM 7) — ball pit, birthday table, and THE poster
// ======================================================================
function buildPartyRoom() {
  const S = baseScene(0.03), R = room('party', S);
  const w = 8, d = 7, h = 3.2;
  shell(S, { w, d, h, hue: 'green' });
  dress(S, { w, d, h, floor: 10, walls: 8, ceil: 4 });
  partyTable(S, 0.5, 0.6, 3.6, 0, 1);
  // presents
  for (let i = 0; i < 6; i++) {
    const c = pick([0xc0392b, 0x2c5fa8, 0xe2a51b, 0x8e44ad]), s = 0.25 + rnd() * 0.2;
    const p = add(S, B(s, s, s), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }), 2.8 + (i % 3) * 0.35, s / 2 + Math.floor(i / 3) * 0.3, -2.6 + rnd() * 0.3, { ry: rnd() });
    add(p, B(s * 1.02, s * 1.02, 0.04), Mats.plasticYellow(), 0, 0, 0, { cast: false });
  }
  // ball pit with netting
  const pit = new THREE.Group(); pit.position.set(-2.5, 0, -1.8); S.add(pit);
  add(pit, B(2.6, 0.6, 0.12), Mats.plasticRed(), 0, 0.3, 1.25); add(pit, B(2.6, 0.6, 0.12), Mats.plasticRed(), 0, 0.3, -1.25);
  add(pit, B(0.12, 0.6, 2.6), Mats.plasticRed(), 1.25, 0.3, 0); add(pit, B(0.12, 0.6, 2.6), Mats.plasticRed(), -1.25, 0.3, 0);
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.3 }), 420);
  const m4 = new THREE.Matrix4(), cc = new THREE.Color();
  for (let i = 0; i < 420; i++) {
    m4.makeTranslation((rnd() - 0.5) * 2.3, 0.07 + rnd() * 0.42, (rnd() - 0.5) * 2.3);
    balls.setMatrixAt(i, m4); balls.setColorAt(i, cc.setHex(pick([0xc0392b, 0x2c5fa8, 0xe2a51b, 0x3b8a3e])));
  }
  balls.castShadow = true; balls.receiveShadow = true; pit.add(balls);
  for (const [x, z] of [[1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25]]) add(pit, C(0.04, 0.04, 2.2, 8), Mats.plasticYellow(), x, 1.1, z);
  const net = new THREE.MeshStandardMaterial({ color: 0x222222, wireframe: true });
  add(pit, B(2.5, 1.6, 0.01, 1, 1, 1), net, 0, 1.4, 1.25, { cast: false });
  // balloons + banner
  for (let i = 0; i < 9; i++) balloon(S, 2.6 + rnd() * 0.6, 2.4 + rnd() * 0.4, 2.6 + rnd() * 0.5);
  add(S, new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshStandardMaterial({ map: Tex.label('HAPPY BIRTHDAY!', { w: 1024, h: 160, bg: '#2c5fa8', fg: '#ffd84a', size: 120 }), roughness: 0.8, side: THREE.DoubleSide }), 0.5, 2.7, -3.45, { cast: false });
  // THE poster: normally Bessario; sometimes... not.
  const pm = new THREE.MeshStandardMaterial({ map: Tex.poster('main'), roughness: 0.85 });
  const pst = add(S, new THREE.PlaneGeometry(0.75, 1.12), pm, 3.97, 1.8, 0.4, { ry: -Math.PI / 2, cast: false });
  R.props.poster = pst; R.props.posterMat = pm;
  drawingsRow(S, -3.5, -0.5, 1.6, 3.47, Math.PI, 6, 60);
  const lamp = hangingLamp(S, 0.5, 2.6, 0.6, { intensity: 16, shadow: true, cord: 0.6 });
  hangingLamp(S, 3.0, 2.8, -1.8, { intensity: 6, cord: 0.4 });
  R.flick.push(flickerer(lamp, { rate: 0.1 }));
  hangingLamp(S, -2.5, 2.7, -1.8, { intensity: 9, cord: 0.4 });
  doorway(S, -3.98, 2.2, Math.PI / 2, 1.3, 2.3);
  R.cams['7'] = cam([-3.3, 2.8, 3.0], [1.4, 1.1, -1.2], { fov: 64, pan: 0.22 });
  R.spots = {
    kiril: [sp(1.9, 2.3, -2.6, 'stare')],
    bessario: [sp(3.2, -0.8, -1.4, 'stare')],
    kira: [sp(-0.6, 2.0, 2.5, 'stand')],
  };
  return R;
}

// fake indirect light: a faint warm fill below every key light, as if bounced off the floor
export function addBounce(scene) {
  const keys = [];
  scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o.intensity > 5) keys.push(o); });
  for (const k of keys) {
    const p = k.getWorldPosition(new THREE.Vector3());
    const b = new THREE.PointLight(0xc89a6a, k.intensity * 0.05, 7, 1.6);
    b.position.set(p.x, 0.35, p.z);
    scene.add(b);
    k.userData.bounce = b;
  }
}

export function buildRooms() {
  const list = [buildStage(), buildDining(), buildKitchen(), buildFreezer(), buildHall('west'), buildHall('east'), buildRestrooms(), buildPartyRoom()];
  const rooms = {};
  for (const r of list) { rooms[r.id] = r; addBounce(r.scene); }
  return rooms;
}

// camera directory: id -> { room, name }
export const CAMS = {
  '1A': { room: 'stage', name: 'SHOW STAGE' },
  '1B': { room: 'dining', name: 'DINING AREA' },
  '2': { room: 'kitchen', name: 'KITCHEN' },
  '3': { room: 'freezer', name: 'BACK STORAGE' },
  '4A': { room: 'westHall', name: 'WEST HALL' },
  '4B': { room: 'westHall', name: 'W. HALL CORNER' },
  '5A': { room: 'eastHall', name: 'EAST HALL' },
  '5B': { room: 'eastHall', name: 'E. HALL CORNER' },
  '6': { room: 'restrooms', name: 'RESTROOMS' },
  '7': { room: 'party', name: 'PARTY ROOM' },
};
