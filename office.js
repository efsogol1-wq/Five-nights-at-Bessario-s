// The security office: left door, right door, and the order hatch to the kitchen in front.
import * as THREE from 'three';
import { Tex } from './textures.js';
import { Mats, add, rnd, poster, drawing, partyHat, cup, dress, decal } from './props.js';
import { addBounce } from './rooms.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

export const OFFICE = {
  eye: new THREE.Vector3(0, 1.3, 1.55),
  w: 4.4, d: 4.2, h: 3,
  door: { width: 1.25, height: 2.3, z: -1.0 },
  hatch: { w: 1.6, y0: 1.05, y1: 1.95 },
};

export function buildOffice() {
  const S = new THREE.Scene(); S.background = new THREE.Color(0);
  const O = { scene: S, doors: {}, lights: {}, buttons: {}, spots: {} };
  const W = OFFICE.w, D = OFFICE.d, H = OFFICE.h;
  const x0 = -W / 2, x1 = W / 2, zf = -2.2, zb = 2.0;
  const amb = new THREE.HemisphereLight(0x6a7a8a, 0x1a140c, 0.06); S.add(amb); O.amb = amb;

  // ---------- floor / ceiling
  const fl = Tex.checker().clone(); fl.wrapS = fl.wrapT = THREE.RepeatWrapping; fl.repeat.set(2.4, 2); fl.needsUpdate = true;
  add(S, new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ map: fl, roughness: 0.55 }), 0, 0, 0, { rx: -Math.PI / 2, cast: false });
  const ct = Tex.ceiling().clone(); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(5, 4); ct.needsUpdate = true;
  add(S, new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.95 }), 0, H, (zf + zb) / 2, { rx: Math.PI / 2, cast: false });

  const wallMat = (len, hue = 'red') => { const t = Tex.wall(hue).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 2.6, 1); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); };
  // A wall with rectangular holes, built from boxes. holes: [{a0,a1,y0,y1}] along the wall's length axis
  const holedWall = (len, holes, mat, place) => {
    const g = new THREE.Group(); place(g); S.add(g);
    const cuts = [0, ...holes.flatMap((h) => [h.a0, h.a1]), len].sort((a, b) => a - b);
    // vertical strips between holes (full height) + above/below each hole
    const piece = (a0, a1, y0, y1) => {
      if (a1 - a0 < 0.001 || y1 - y0 < 0.001) return;
      const geo = new THREE.PlaneGeometry(a1 - a0, y1 - y0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (a0 + uv.getX(i) * (a1 - a0)) / 2.6, (y0 + uv.getY(i) * (y1 - y0)) / H);
      const m = new THREE.Mesh(geo, mat); m.position.set((a0 + a1) / 2 - len / 2, (y0 + y1) / 2, 0); m.receiveShadow = true; g.add(m);
    };
    let a = 0;
    for (const h of holes.sort((p, q) => p.a0 - q.a0)) {
      piece(a, h.a0, 0, H);
      piece(h.a0, h.a1, 0, h.y0);
      piece(h.a0, h.a1, h.y1, H);
      a = h.a1;
    }
    piece(a, len, 0, H);
    void cuts;
    return g;
  };
  const wm = wallMat(1, 'red'); wm.map.repeat.set(1, 1);
  const dz = OFFICE.door.z, dw = OFFICE.door.width, dh = OFFICE.door.height;
  // side walls: length runs from zb (a=0) to zf (a=D)
  const sideHoles = [
    { a0: zb - (dz + dw / 2), a1: zb - (dz - dw / 2), y0: 0, y1: dh },        // door
  ].map((h) => ({ a0: Math.min(h.a0, h.a1), a1: Math.max(h.a0, h.a1), y0: h.y0, y1: h.y1 }));
  holedWall(D, sideHoles.map((h) => ({ ...h })), wm, (g) => { g.position.set(x0, 0, (zf + zb) / 2); g.rotation.y = Math.PI / 2; });
  holedWall(D, sideHoles.map((h) => ({ a0: D - h.a1, a1: D - h.a0, y0: h.y0, y1: h.y1 })), wm, (g) => { g.position.set(x1, 0, (zf + zb) / 2); g.rotation.y = -Math.PI / 2; });
  // front wall with the hatch
  const hw = OFFICE.hatch.w;
  holedWall(W, [{ a0: W / 2 - hw / 2, a1: W / 2 + hw / 2, y0: OFFICE.hatch.y0, y1: OFFICE.hatch.y1 }], wm, (g) => { g.position.set(0, 0, zf); });
  add(S, new THREE.PlaneGeometry(W, H), wallMat(W, 'red'), 0, H / 2, zb, { ry: Math.PI, cast: false });

  // ---------- door frames, shutters, windows, vestibules
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.45, metalness: 0.7 });
  const shutterTex = Tex.metal();
  for (const side of ['left', 'right']) {
    const sx = side === 'left' ? -1 : 1, wx = sx * W / 2;
    // frame
    add(S, B(0.18, 0.1, dw + 0.24), frameMat, wx, dh + 0.05, dz);
    add(S, B(0.18, dh, 0.12), frameMat, wx, dh / 2, dz - dw / 2 - 0.06);
    add(S, B(0.18, dh, 0.12), frameMat, wx, dh / 2, dz + dw / 2 + 0.06);
    // shutter (slides down)
    const sm = new THREE.MeshStandardMaterial({ map: shutterTex, roughness: 0.5, metalness: 0.6 });
    const sh = add(S, B(0.06, dh + 0.1, dw + 0.06), sm, wx - sx * 0.02, dh + 1.4, dz);
    O.doors[side] = { mesh: sh, closed: false, t: 0, yOpen: dh / 2 + 2.45, yClosed: dh / 2 + 0.03 };
    sh.position.y = O.doors[side].yOpen;
    // vestibule beyond: dark hall corner
    const vx = wx + sx * 1.4;
    const vmat = new THREE.MeshStandardMaterial({ map: Tex.plaster(), color: 0x6a645a, roughness: 0.95 });
    add(S, new THREE.PlaneGeometry(2.8, H), vmat, wx + sx * 2.8, H / 2, -0.8, { ry: -sx * Math.PI / 2, cast: false });  // far wall
    add(S, new THREE.PlaneGeometry(2.8, H), vmat, vx, H / 2, -2.3, { cast: false });                                    // front wall
    add(S, new THREE.PlaneGeometry(2.8, 3.2), Mats.black(), vx, 1.6, 1.4, { ry: Math.PI, cast: false });               // back (hallway continues into darkness)
    add(S, new THREE.PlaneGeometry(2.8, 3.7), new THREE.MeshStandardMaterial({ map: Tex.ceiling(), roughness: 1 }), vx, H, -0.4, { rx: Math.PI / 2, cast: false });
    poster(S, side === 'left' ? 'kiril' : 'main', wx + sx * 2.78, 1.7, -1.4, -sx * Math.PI / 2, 0.55);
    // a faint spill from further down the hall so the doorway isn't a flat black hole
    const spill = new THREE.PointLight(0x9aa6a0, 0.5, 3.5, 2); spill.position.set(wx + sx * 1.6, 2.6, 0.6); S.add(spill);
    (O.spill = O.spill || []).push(spill);
    // door light: lights the vestibule
    const L = new THREE.SpotLight(0xfff0d0, 0, 7, 0.95, 0.6, 2);
    L.position.set(wx - sx * 0.1, 2.55, dz + 0.5); L.target.position.set(wx + sx * 0.6, 0.6, -1.6);
    L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.002;
    S.add(L, L.target);
    O.lights[side] = { light: L, on: false, base: 20 };
    // button panel next to the door (camera side)
    const panel = new THREE.Group(); panel.position.set(wx - sx * 0.015, 1.3, -1.92); panel.rotation.y = -sx * Math.PI / 2; S.add(panel);
    add(panel, B(0.24, 0.44, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5, metalness: 0.6 }), 0, 0, 0);
    const doorBtn = add(panel, C(0.05, 0.05, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0x300000, roughness: 0.4 }), 0, 0.1, 0.03, { rx: Math.PI / 2 });
    const lightBtn = add(panel, C(0.05, 0.05, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, emissive: 0x101010, roughness: 0.4 }), 0, -0.1, 0.03, { rx: Math.PI / 2 });
    O.buttons[side] = { door: doorBtn, light: lightBtn };
    // character spot just outside the door (visible through door + window when lit)
    O.spots[side] = { x: wx + sx * 0.55, z: -1.5, ry: -sx * 0.72 };
  }

  // ---------- the order hatch
  const hy0 = OFFICE.hatch.y0, hy1 = OFFICE.hatch.y1;
  add(S, B(hw + 0.2, 0.08, 0.5), Mats.steel(), 0, hy0 - 0.04, zf + 0.05);           // pass shelf
  add(S, B(hw + 0.2, 0.08, 0.16), frameMat, 0, hy1 + 0.04, zf + 0.02);
  add(S, B(0.1, hy1 - hy0 + 0.16, 0.16), frameMat, -hw / 2 - 0.05, (hy0 + hy1) / 2, zf + 0.02);
  add(S, B(0.1, hy1 - hy0 + 0.16, 0.16), frameMat, hw / 2 + 0.05, (hy0 + hy1) / 2, zf + 0.02);
  add(S, B(hw + 0.3, 0.22, 0.26), frameMat, 0, hy1 + 0.2, zf + 0.1);               // shutter box
  const hsm = new THREE.MeshStandardMaterial({ map: shutterTex, roughness: 0.5, metalness: 0.6 });
  const hs = add(S, B(hw, hy1 - hy0, 0.04), hsm, 0, 0, zf + 0.04);
  O.hatch = { mesh: hs, closed: false, yOpen: hy1 + (hy1 - hy0) / 2 + 0.05, yClosed: (hy0 + hy1) / 2 };
  hs.position.y = O.hatch.yOpen;
  // kitchen behind the hatch: dim tiles, a ticket rail, darkness
  const km = new THREE.MeshStandardMaterial({ map: Tex.wall('green'), roughness: 0.7 });
  add(S, new THREE.PlaneGeometry(4, 3), km, 0, 1.5, zf - 1.6, { cast: false });
  add(S, new THREE.PlaneGeometry(2.5, 3), km, -1.3, 1.5, zf - 0.8, { ry: Math.PI / 2, cast: false });
  add(S, new THREE.PlaneGeometry(2.5, 3), km, 1.3, 1.5, zf - 0.8, { ry: -Math.PI / 2, cast: false });
  add(S, new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ map: Tex.ceiling() }), 0, 3, zf - 0.8, { rx: Math.PI / 2, cast: false });
  for (let i = 0; i < 4; i++) add(S, B(0.3, 0.6, 0.3), Mats.steelDirty(), -0.9 + i * 0.6, 0.6 + (i % 2) * 0.1, zf - 1.35);
  add(S, B(1.4, 0.02, 0.02), Mats.steel(), 0, 2.2, zf - 0.25);
  for (let i = 0; i < 4; i++) add(S, new THREE.PlaneGeometry(0.1, 0.18), Mats.paper(), -0.4 + i * 0.27, 2.09, zf - 0.24, { cast: false }).rotation.z = (rnd() - 0.5) * 0.3;
  const HL = new THREE.SpotLight(0xffe8c8, 0, 5, 0.8, 0.6, 2);
  HL.position.set(0, 2.25, zf + 0.15); HL.target.position.set(0, 1.1, zf - 1.0);
  S.add(HL, HL.target);
  O.lights.hatch = { light: HL, on: false, base: 9 };
  const heat = new THREE.PointLight(0xff5a20, 0.9, 3.5, 2); heat.position.set(0, 2.3, zf - 0.8); S.add(heat);
  O.spots.hatch = { x: 0, z: zf - 0.75, ry: 0 };
  // hatch button panel: under the hatch on the desk side
  const hp = new THREE.Group(); hp.position.set(hw / 2 + 0.35, 1.25, zf + 0.02); S.add(hp);
  add(hp, B(0.24, 0.44, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5, metalness: 0.6 }), 0, 0, 0);
  O.buttons.hatch = {
    door: add(hp, C(0.05, 0.05, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x7a1010, emissive: 0x300000 }), 0, 0.1, 0.03, { rx: Math.PI / 2 }),
    light: add(hp, C(0.05, 0.05, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, emissive: 0x101010 }), 0, -0.1, 0.03, { rx: Math.PI / 2 }),
  };

  // ---------- desk + clutter
  const desk = new THREE.Group(); desk.position.set(0, 0, -1.25); S.add(desk);
  add(desk, B(3.0, 0.06, 0.85), new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 0.4, metalness: 0.5 }), 0, 0.8, 0);
  add(desk, B(2.96, 0.72, 0.04), new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.4 }), 0, 0.42, -0.4);
  for (const sx of [-1, 1]) add(desk, B(0.5, 0.76, 0.8), new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.4 }), sx * 1.2, 0.38, 0);
  // CRT monitors
  const crt = (x, z, ry, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0.83, z); g.rotation.y = ry; g.scale.setScalar(s); desk.add(g);
    add(g, B(0.5, 0.42, 0.45), new THREE.MeshStandardMaterial({ color: 0xbdb7a6, roughness: 0.7 }), 0, 0.21, 0);
    add(g, B(0.3, 0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.7 }), 0, 0.2, -0.3);
    const scr = add(g, new THREE.PlaneGeometry(0.4, 0.31), new THREE.MeshStandardMaterial({ color: 0x0c1810, emissive: 0xffffff, emissiveMap: Tex.crt(), emissiveIntensity: 0.55, roughness: 0.15 }), 0, 0.22, 0.228, { cast: false });
    return scr;
  };
  O.screens = [crt(-0.95, 0.0, 0.25), crt(-0.45, -0.05, 0.08, 0.85)];
  const glow = new THREE.PointLight(0x4aa070, 1.2, 2.5, 2); glow.position.set(-0.7, 1.15, -0.8); S.add(glow); O.lights.monitor = { light: glow, base: 1.2 };
  // desk fan (blades spin)
  const fan = new THREE.Group(); fan.position.set(0.95, 0.83, -0.05); fan.rotation.y = -0.5; desk.add(fan);
  add(fan, C(0.1, 0.12, 0.04, 16), Mats.dark(), 0, 0.02, 0);
  add(fan, C(0.015, 0.015, 0.3, 8), Mats.steel(), 0, 0.17, 0);
  const cage = add(fan, new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x777777, wireframe: true, metalness: 0.7 }), 0, 0.36, 0.02, { rx: Math.PI / 2, cast: false });
  cage.scale.set(1, 0.35, 1);
  const blades = new THREE.Group(); blades.position.set(0, 0.36, 0.04); fan.add(blades);
  for (let i = 0; i < 3; i++) add(blades, B(0.06, 0.13, 0.008), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 }), Math.cos(i * 2.09) * 0.07, Math.sin(i * 2.09) * 0.07, 0, { rz: i * 2.09 + Math.PI / 2 });
  O.fanBlades = blades;
  // papers, burger box, cup, phone, plush, party hat
  for (let i = 0; i < 6; i++) add(desk, B(0.21, 0.004, 0.29), Mats.paper(), 0.1 + rnd() * 0.5, 0.832 + i * 0.004, 0.1 + rnd() * 0.15, { ry: (rnd() - 0.5) * 0.8, cast: false });
  const bb = new THREE.Group(); bb.position.set(0.45, 0.83, -0.18); bb.rotation.y = 0.4; desk.add(bb);
  add(bb, B(0.2, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.8 }), 0, 0.04, 0);
  add(bb, B(0.2, 0.01, 0.18), new THREE.MeshStandardMaterial({ map: Tex.label("B", { w: 128, h: 128, bg: '#b8221a', fg: '#ffd84a', size: 100 }) }), 0, 0.12, -0.06, { rx: -1.1 });
  cup(desk, 0.25, 0.83, 0.2);
  const phone = new THREE.Group(); phone.position.set(-0.05, 0.83, 0.18); phone.rotation.y = 0.2; desk.add(phone);
  add(phone, B(0.2, 0.06, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }), 0, 0.03, 0);
  add(phone, C(0.025, 0.025, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }), 0, 0.08, 0, { rz: Math.PI / 2 });
  O.phoneLed = add(phone, new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff0000, emissiveIntensity: 0 }), 0.07, 0.065, 0.08, { cast: false });
  partyHat(desk, 1.25, 0.83, 0.1, 0.2);
  // little Bessario figurine on the desk
  const fig = new THREE.Group(); fig.position.set(1.25, 0.83, -0.2); fig.rotation.y = -0.3; desk.add(fig);
  add(fig, new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc9bfa8, roughness: 0.8 }), 0, 0.07, 0);
  add(fig, new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0x6e4424, roughness: 0.8 }), 0, 0.16, 0);
  add(fig, C(0.03, 0.03, 0.04, 10), Mats.paper(), 0, 0.22, 0);
  // chair (we sit in it, so just the arms show at the edges)
  // ---------- wall decor
  poster(S, 'celebrate', -1.4, 2.2, zf + 0.01, 0, 0.75);
  poster(S, 'rules', 1.55, 2.25, zf + 0.01, 0, 0.55);
  for (let i = 0; i < 5; i++) drawing(S, 70 + i, -1.75 + i * 0.32, 1.55 + (i % 2) * 0.28, zf + 0.012, 0);
  for (let i = 0; i < 4; i++) drawing(S, 80 + i, 1.0 + (i % 2) * 0.36, 1.45 + Math.floor(i / 2) * 0.33, zf + 0.012, 0);
  // wires along the ceiling
  for (let i = 0; i < 3; i++) {
    const pts = []; for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(-2.45 + k * 0.61, H - 0.08 - Math.sin(k / 8 * Math.PI) * (0.15 + i * 0.06), zf + 0.1 + i * 0.05));
    add(S, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 4), Mats.rubber(), 0, 0, 0, { cast: false });
  }
  // ---------- ceiling lamp (the only real light in here)
  const lampG = new THREE.Group(); lampG.position.set(0, H - 0.5, -0.55); S.add(lampG);
  add(lampG, C(0.006, 0.006, 0.5, 4), Mats.dark(), 0, 0.25, 0, { cast: false });
  add(lampG, C(0.06, 0.28, 0.22, 18, true), new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }), 0, -0.05, 0);
  const bulb = add(lampG, new THREE.SphereGeometry(0.05, 10, 8), Mats.bulb(), 0, -0.13, 0, { cast: false });
  const lamp = new THREE.SpotLight(0xffd9a0, 17, 9, 1.35, 0.85, 2); lamp.position.set(0, -0.22, 0); lamp.target.position.set(0, -3, 0.3); lampG.add(lamp.target); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.002; lamp.shadow.radius = 3;
  const lampFill = new THREE.PointLight(0xffd9a0, 2.5, 6, 2); lampFill.position.set(0, -0.1, 0); lampG.add(lampFill); O.lampFill = lampFill;
  lampG.add(lamp);
  O.lamp = { light: lamp, bulb, base: 15, group: lampG };
  lamp.userData.softRadius = 0.12;
  // gooseneck desk lamp: a warm pool of light on the desk
  const dl = new THREE.Group(); dl.position.set(0.62, 0.83, -1.45); S.add(dl);
  add(dl, C(0.08, 0.1, 0.03, 16), Mats.dark(), 0, 0.015, 0);
  add(dl, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.02, 0.2, 0.05), new THREE.Vector3(-0.05, 0.38, 0.15), new THREE.Vector3(-0.12, 0.42, 0.25)]), 16, 0.012, 6), Mats.dark(), 0, 0, 0);
  add(dl, C(0.03, 0.09, 0.12, 14, true), new THREE.MeshStandardMaterial({ color: 0x1e3a24, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }), -0.12, 0.4, 0.27, { rx: 0.7 });
  add(dl, new THREE.SphereGeometry(0.025, 8, 6), Mats.bulb(), -0.12, 0.37, 0.3, { cast: false });
  const deskL = new THREE.SpotLight(0xffd8a8, 2.6, 4, 0.85, 0.75, 2);
  deskL.position.set(0.5, 1.2, -1.15); deskL.target.position.set(0.3, 0.8, -1.1);
  deskL.castShadow = true; deskL.shadow.mapSize.set(1024, 1024); deskL.shadow.bias = -0.002; deskL.userData.softRadius = 0.05;
  S.add(deskL, deskL.target);
  O.deskLamp = { light: deskL, base: 2.6 };
  // jumpscare key light (always present so the shader never recompiles mid-scare)
  const scare = new THREE.SpotLight(0xffe2c4, 0, 5, 0.75, 0.55, 2);
  scare.position.set(0.35, OFFICE.eye.y + 0.75, OFFICE.eye.z - 0.1); scare.target.position.set(0, OFFICE.eye.y, OFFICE.eye.z - 0.8);
  scare.castShadow = true; scare.shadow.mapSize.set(1024, 1024); scare.shadow.bias = -0.0015; scare.shadow.camera.near = 0.1;
  S.add(scare, scare.target);
  O.scareLight = scare;
  // power-out: a glow in the right doorway that pulses with the music box
  const dglow = new THREE.PointLight(0xffd8a0, 0, 3, 2); dglow.position.set(W / 2 - 0.2, 2.0, OFFICE.door.z + 0.3); S.add(dglow);
  O.doorGlow = dglow;
  // Victor's spot: slumped on the floor in front of the desk
  O.spots.victor = { x: 0.1, z: -0.55, ry: 0.1 };
  // jumpscare spot: right in your face
  O.spots.scare = { x: 0, z: 0.2, ry: 0 };
  // power-out: Bessario in the right doorway
  O.spots.powerOut = { x: W / 2 + 0.35, z: dz, ry: -(Math.PI / 2 - 0.55) };
  addBounce(S);
  return O;
}
