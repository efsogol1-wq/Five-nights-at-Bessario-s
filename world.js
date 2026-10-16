// World: owns every scene (camera rooms + office), the animatronics, and what is on screen.
import * as THREE from 'three';
import { buildRooms, CAMS, updateFlicker } from './rooms.js';
import { buildOffice, OFFICE } from './office.js';
import { buildAnimatronic } from '../chars/animatronic.js';
import { Tex } from './textures.js';
import { weather } from './weather.js';

export const KINDS = ['bessario', 'kiril', 'kira', 'lebron', 'victor'];

// where each AI location puts a character: [roomId, spotIndex] or ['office', spotName]
export const LOCS = {
  bessario: { stage: ['stage', 0], dining: ['dining', 0], diningBack: ['dining', 1], restrooms: ['restrooms', 0], kitchen: ['kitchen', 0], party: ['party', 0], eastHall: ['eastHall', 0], eastCorner: ['eastHall', 1], inside: null, powerOut: ['office', 'powerOut'] },
  kiril: { stage: ['stage', 0], dining: ['dining', 0], diningWest: ['dining', 1], party: ['party', 0], restrooms: ['restrooms', 0], westHall: ['westHall', 0], westCorner: ['westHall', 1], door: ['office', 'left'], inside: null },
  kira: { stage: ['stage', 0], dining: ['dining', 0], diningTray: ['dining', 1], restrooms: ['restrooms', 0], kitchen: ['kitchen', 0], hatch: ['office', 'hatch'], party: ['party', 0], inside: null },
  lebron: { freezer: ['freezer', 0], running: ['westHall', 0], runningNear: ['westHall', 1], door: ['office', 'left'], gone: null },
  victor: { none: null, office: ['office', 'victor'] },
};

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.rooms = buildRooms();
    this.office = buildOffice();
    for (const R of Object.values(this.rooms)) weather(R.scene);
    weather(this.office.scene, { strength: 0.85 });
    this.chars = {};
    for (const k of KINDS) this.chars[k] = buildAnimatronic(k);
    this.officeCam = new THREE.PerspectiveCamera(64, 16 / 9, 0.05, 60);   // live view (jumpscares)
    this.officeCam.position.copy(OFFICE.eye);
    // wide panorama camera: 140 deg across, shown through a cylindrical warp like FNAF's office
    this.PANO = { tanH: Math.tan(70 * Math.PI / 180), tanV: 0.9 };
    this.panoCam = new THREE.PerspectiveCamera(2 * Math.atan(this.PANO.tanV) * 180 / Math.PI, this.PANO.tanH / this.PANO.tanV, 0.05, 60);
    this.panoCam.position.copy(OFFICE.eye); this.panoCam.rotation.set(-0.05, 0, 0, 'YXZ');
    this.yaw = 0; this.pitch = -0.05;
    this.view = 'office';
    this.camId = '1A';
    this.t = 0;
    this.shake = 0;
    this.scareChar = null;
    this.posterVictor = false;
    this.victorTex = Tex.poster('victor');
    this.mainTex = Tex.poster('main');
    this.locs = {};
  }

  // put a character somewhere (or hide)
  place(kind, loc) {
    const a = this.chars[kind];
    this.locs[kind] = loc;
    const def = LOCS[kind][loc];
    if (a.root.parent) a.root.parent.remove(a.root);
    a.setGlow(0);
    if (!def) return;
    const [where, idx] = def;
    let spot, scene;
    if (where === 'office') { spot = this.office.spots[idx]; scene = this.office.scene; }
    else {
      const R = this.rooms[where];
      const list = R.spots[kind] || [];
      spot = list[Math.min(idx, list.length - 1)];
      scene = R.scene;
      if (!spot) return;
    }
    a.root.position.set(spot.x, spot.y || 0, spot.z);
    a.root.rotation.y = spot.ry;
    let pose = spot.pose || 'stare';
    if (where === 'office') pose = idx === 'hatch' ? 'hatch' : idx === 'victor' ? 'slump' : idx === 'powerOut' ? 'stare' : 'lean';
    if (kind === 'lebron' && loc === 'door') pose = 'bang';
    const victorOffice = kind === 'victor' && loc === 'office';
    a.setPose(pose, true);
    if (victorOffice) { a.base.head = [-0.1, 0.25, 0.42]; a.target.head = a.base.head.slice(); a.update(0, 1); }
    // in the camera rooms no two visits look the same: a slightly different stance and head angle
    if (where !== 'office' && pose !== 'perform' && pose !== 'basket' && pose !== 'tray' && kind !== 'lebron') {
      const r = Math.random();
      if (r < 0.2) a.setPose('peek', true); else if (r < 0.35) a.setPose('lean', true);
      const hb = a.base.head; hb[1] += (Math.random() - 0.5) * 0.7; hb[2] += (Math.random() - 0.5) * 0.35;
      a.root.rotation.y += (Math.random() - 0.5) * 0.4;
      a.target.head = hb.slice();
      a.update(0, 1);
    }
    // dark halls: eyes glow
    if (where === 'westHall' || where === 'eastHall') a.setGlow(idx === 1 ? 0.35 : 0.6);
    scene.add(a.root);
  }

  roomOfCam(id) { return this.rooms[CAMS[id].room]; }
  // a character in the room turns its head and eyes toward the camera
  lookAtCam(kind, camId) {
    const a = this.chars[kind], R = this.roomOfCam(camId), cam = R.cams[camId].camera;
    if (!a.root.parent) return;
    a.root.updateMatrixWorld(true);
    const local = a.root.worldToLocal(cam.position.clone());
    const yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(local.x, local.z)));
    const hb = a.base.head; hb[1] = yaw; hb[0] = Math.max(-0.35, Math.min(0.3, -Math.atan2(local.y - 1.9, Math.hypot(local.x, local.z)) * 0.6));
    a.target.head = hb.slice();
    a.update(0, 1);
    a.glance(cam.position);
  }
  camRoomHas(id, kind) {
    const def = LOCS[kind][this.locs[kind]];
    return !!def && def[0] === CAMS[id].room;
  }

  // what to draw this frame, and how (configures the renderer's view)
  frame(r) {
    const asp = r.cssW / r.cssH;
    if (this.view === 'cam') {
      const R = this.roomOfCam(this.camId), C = R.cams[this.camId];
      const cam = C.camera;
      const wide = 1.3;                                   // render wider than the screen, then pan the crop
      r.setRenderScale(wide, 1);
      const fov0 = cam.userData.fov0 || (cam.userData.fov0 = cam.fov);
      cam.fov = asp < 1.2 ? fov0 * 1.25 : fov0;
      cam.aspect = asp * wide; cam.updateProjectionMatrix();
      cam.lookAt(C.target);
      const panK = 0.5 + 0.5 * Math.sin(C.phase);
      r.view = { mode: 0, center: (1 - 1 / wide) * panK, width: 1 / wide, tanHalf: 1, vscale: 1 };
      return { scene: R.scene, camera: cam, still: true, key: 'c' + this.camId + this.signature(R.scene) };
    }
    if (this.scareChar) {
      r.setRenderScale(1, 1);
      const c = this.officeCam; c.aspect = asp; c.fov = asp < 1.2 ? 80 : 66; c.updateProjectionMatrix();
      r.view = { mode: 0, center: 0, width: 1, tanHalf: 1, vscale: 1 };
      return { scene: this.office.scene, camera: c, still: false, key: 'scare', motionBlur: this.scareChar.kind === 'victor' ? 0 : 0.42 };
    }
    // office panorama
    const Vs = Math.min(0.55, 0.98 / asp);             // screen vertical half-extent (tan)
    const Wh = Vs * asp;                                 // visible half-angle (radians)
    this.yawMax = Math.max(0, Math.atan(this.PANO.tanH) - Wh - 0.02);
    this.yaw = Math.max(-this.yawMax, Math.min(this.yawMax, this.yaw));
    r.setRenderScale(this.PANO.tanH / Wh, this.PANO.tanV / Vs);
    this.panoCam.aspect = this.PANO.tanH / this.PANO.tanV; this.panoCam.updateProjectionMatrix();
    const sh = this.shake;
    r.view = { mode: 1, center: -this.yaw + (Math.random() - 0.5) * sh * 0.03, width: Wh, tanHalf: this.PANO.tanH, vscale: Vs / this.PANO.tanV };
    return { scene: this.office.scene, camera: this.panoCam, still: true, key: 'o' + this.signature(this.office.scene) };
  }

  // cheap fingerprint of everything that changes how a scene looks
  signature(scene) {
    let lights = scene.userData.lightList;
    if (!lights) { lights = []; scene.traverse((o) => { if (o.isLight) lights.push(o); }); scene.userData.lightList = lights; }
    let s = 0;
    for (let i = 0; i < lights.length; i++) s += lights[i].intensity * (i + 1) * 0.37;
    for (const k of KINDS) {
      const a = this.chars[k];
      if (a.root.parent !== scene) continue;
      const p = a.root.position; s += p.x * 3.1 + p.y * 5.3 + p.z * 7.7 + a.root.rotation.y * 11 + a.sig();
    }
    if (scene === this.office.scene) {
      const O = this.office; s += O.doors.left.mesh.position.y * 13 + O.doors.right.mesh.position.y * 17 + O.hatch.mesh.position.y * 19;
    } else if (scene === this.rooms.freezer.scene) {
      const P = this.rooms.freezer.props; s += P.hinge.rotation.y * 23 + (P.eyes.visible ? 29 : 0);
    } else if (scene === this.rooms.party.scene) s += this.posterVictor ? 31 : 0;
    return Math.round(s * 1000);
  }

  setAspect(a) {
    this.officeCam.aspect = a;
    // on narrow portrait screens widen the fov a bit so the doors still fit
    this.officeCam.fov = a < 1.2 ? 80 : 64;
    this.officeCam.updateProjectionMatrix();
    for (const R of Object.values(this.rooms)) for (const C of Object.values(R.cams)) { C.camera.aspect = a; C.camera.fov = a < 1.2 ? 75 : C.camera.userData.fov0 || (C.camera.userData.fov0 = C.camera.fov); C.camera.updateProjectionMatrix(); }
  }

  setPoster(victor) {
    this.posterVictor = victor;
    const m = this.rooms.party.props.posterMat;
    m.map = victor ? this.victorTex : this.mainTex; m.needsUpdate = true;
  }

  update(dt, state) {
    this.t += dt;
    const O = this.office;
    // office camera: yaw + shake
    const sh = this.shake > 0 ? this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.officeCam.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.06, (Math.random() - 0.5) * sh * 0.06, 0, 'YXZ');
    // doors + hatch slide
    for (const side of ['left', 'right']) {
      const d = O.doors[side];
      const target = d.closed ? d.yClosed : d.yOpen;
      d.mesh.position.y += (target - d.mesh.position.y) * Math.min(1, dt * 14);
    }
    const h = O.hatch;
    h.mesh.position.y += ((h.closed ? h.yClosed : h.yOpen) - h.mesh.position.y) * Math.min(1, dt * 12);
    // lights
    const power = state.powerOn;
    for (const side of ['left', 'right', 'hatch']) {
      const L = O.lights[side];
      let k = L.on && power ? 1 : 0;
      if (k && Math.random() < 0.04) k = 0.4; // buzzy flicker
      L.light.intensity = L.base * k;
    }
    // ceiling lamp: flickers more when power is low, dead when out
    const lowP = state.power < 15 ? 0.12 : 0.015;
    if (!power) O.lamp.light.intensity = 0;
    else if (Math.random() < lowP) O.lamp.light.intensity = O.lamp.base * (0.2 + Math.random() * 0.5);
    else O.lamp.light.intensity += (O.lamp.base - O.lamp.light.intensity) * Math.min(1, dt * 10);
    O.lamp.bulb.material.emissiveIntensity = (O.lamp.light.intensity / O.lamp.base) * 2.5;
    O.lampFill.intensity = O.lamp.light.intensity * 0.5;
    O.lights.monitor.light.intensity = power ? O.lights.monitor.base : 0;
    O.amb.intensity = power ? 0.06 : 0.006;
    for (const sp of O.spill) sp.intensity = power ? 0.5 : 0;
    O.deskLamp.light.intensity = power ? O.deskLamp.base * (O.lamp.light.intensity / O.lamp.base * 0.3 + 0.7) : 0;
    for (const s of O.screens) s.material.emissiveIntensity = power ? 0.55 : 0;
    if (!O.bounced) { O.bounced = []; O.scene.traverse((l) => { if (l.isLight && l.userData.bounce) O.bounced.push(l); }); }
    for (const l of O.bounced) l.userData.bounce.intensity = l.intensity * 0.05;
    if (power) O.fanBlades.rotation.z += dt * 22;
    else O.fanBlades.rotation.z += dt * Math.max(0, 22 - (state.outT || 0) * 8);
    // buttons glow when active
    for (const side of ['left', 'right', 'hatch']) {
      const b = O.buttons[side];
      const dOn = side === 'hatch' ? O.hatch.closed : O.doors[side].closed;
      b.door.material.emissive.setHex(dOn && power ? 0xff2020 : 0x200000);
      b.light.material.emissive.setHex(O.lights[side].on && power ? 0xffffff : 0x101010);
    }
    // camera rooms: only animate the one on screen
    if (this.view === 'cam') {
      const R = this.roomOfCam(this.camId);
      updateFlicker(R.flick, dt);
      const C = R.cams[this.camId];
      C.phase += dt * C.panSpeed;
    }
    for (const k of KINDS) {
      const a = this.chars[k];
      if (a.root.parent && !(this.scareChar && this.scareChar.kind === k)) a.update(dt);
    }
    // freezer door state follows LeBron's lock
    if (state.lebron) this.updateFreezer(state.lebron, dt);
  }

  updateFreezer(L, dt) {
    const P = this.rooms.freezer.props;
    const open = L.phase === 'out' ? 1.9 : L.lock < 30 ? 0.35 + (30 - L.lock) / 30 * 0.35 : 0;
    P.hinge.rotation.y += (open - P.hinge.rotation.y) * Math.min(1, dt * (L.phase === 'out' ? 10 : 3));
    P.eyes.visible = L.phase !== 'out' && L.lock < 66;
    P.chain.visible = L.lock >= 30 && L.phase !== 'out';
    P.innerLight.intensity = open > 0.1 ? 3 : 0;
    const lamps = P.gaugeLamps;
    const lv = Math.ceil(L.lock / 25);
    lamps.forEach((m, i) => { m.material.emissive.setHex(i < lv ? (lv <= 1 ? 0xff2010 : lv === 2 ? 0xffa010 : 0x30ff40) : 0x000000); m.material.emissiveIntensity = 1.4; });
    P.wheel.rotation.z = -L.lock / 100 * Math.PI * 2;
    // LeBron leans against the door from inside while it's ajar
    const a = this.chars.lebron;
    if (this.locs.lebron === 'freezer') {
      a.root.position.z = -3.75 + (L.lock < 30 ? 0.35 : 0);
      a.setGlow(L.lock < 66 ? 0.8 : 0);
    }
  }

  // jumpscare: the character lunges at the office camera
  // FNAF-1 style attacks: each one has its own timing and movement; the face ends up filling the screen.
  startScare(kind) {
    const a = this.chars[kind];
    if (a.root.parent) a.root.parent.remove(a.root);
    this.office.scene.add(a.root);
    a.setPose(kind === 'lebron' ? 'run' : 'lunge', true);
       // long snout: aim it at you
    if (a.J.prop) a.J.prop.visible = false;
    a.root.position.set(OFFICE.eye.x, 0, OFFICE.eye.z - 2.4);
    this.scareChar = { kind, t: 0, seed: Math.random() * 10 };
    this.office.scareLight.intensity = 14;
    a.jitter = 0;
    a.setGlow(kind === 'victor' ? 1 : 0.5);
    this.updateScare(0);
  }
  scareMotion(kind, t, seed) {
    const TAU = Math.PI * 2, n = (f, o = 0) => Math.sin(t * TAU * f + seed + o);
    const easeIn = (k) => k * k * k, easeOut = (k) => 1 - Math.pow(1 - k, 3);
    const c = (v) => Math.max(0, Math.min(1, v));
    let dist = 0.6, x = 0, y = -0.22, yaw = 0, pitch = 0, roll = 0, jaw = 0.9, pose = null;
    if (kind === 'bessario') {          // pops up right in your face and shakes his head violently
      dist = 0.84 - easeOut(c(t / 0.09)) * 0.2;
      yaw = n(8.5) * 0.17 * c((t - 0.05) / 0.05); pitch = n(12.5, 1) * 0.06; roll = n(6, 2) * 0.05;
      jaw = 0.55 + 0.45 * Math.abs(n(7));
    } else if (kind === 'kiril') {      // Bonnie-style lunge, croc-style: head twisted sideways, jaws snapping open
      const k = easeIn(c(t / 0.17));
      dist = 2.0 - k * 1.25 + (t > 0.17 ? Math.sin((t - 0.17) * 30) * 0.03 * Math.exp(-(t - 0.17) * 6) : 0);
      x = 0.12; y = -0.2;
      yaw = -0.55 * k + n(6) * 0.06; roll = 0.38 * k + n(9) * 0.05; pitch = -0.12 + n(11, 1) * 0.05;
      jaw = t < 0.09 ? 0.15 : 0.8 + n(14) * 0.1;
    } else if (kind === 'kira') {       // Chica-style: a beat of stillness, then the face thrusts forward, head cocked
      const k = c((t - 0.07) / 0.12);
      dist = 1.0 - easeOut(k) * 0.38; roll = -0.32 * easeOut(k) + n(10) * 0.04; pitch = -0.12 * k + n(13) * 0.04; yaw = n(7) * 0.06;
      jaw = 0.3 + 0.75 * k + Math.abs(n(16)) * 0.15;
    } else if (kind === 'lebron') {     // Foxy-style: charges in from the left door and slams into you
      const k = c(t / 0.32);
      x = -1.9 * (1 - easeOut(k)); dist = 2.3 - easeOut(k) * 1.66; y = -0.25 + Math.abs(Math.sin(t * 22)) * 0.05 * (1 - k);
      yaw = 0.6 * (1 - k) + n(9) * 0.07 * k; pitch = n(12) * 0.05; roll = n(6) * 0.08;
      jaw = 0.5 + 0.5 * k + Math.abs(n(15)) * 0.1;
      if (k >= 1 && !this.scareChar.lunged) { this.scareChar.lunged = true; this.chars.lebron.setPose('lunge'); }
    } else if (kind === 'victor') {     // simply THERE. a slow, wrong tremor
      dist = 0.66; yaw = n(1.3) * 0.03; pitch = n(0.9) * 0.03 + 0.05; roll = 0.2 + n(0.7) * 0.03; jaw = 0.35 + t * 0.4;
    }
    return { dist, x, y, yaw, pitch, roll, jaw, pose };
  }
  updateScare(dt) {
    const S = this.scareChar; if (!S) return;
    S.t += dt;
    const a = this.chars[S.kind], M = this.scareMotion(S.kind, S.t, S.seed);
    a.root.rotation.y = Math.abs(M.x) > 0.3 ? Math.atan2(-M.x, M.dist) * 0.6 : 0;   // turned toward you while charging
    a.setMode('scare', OFFICE.eye);
    a.update(dt, 30);
    // mechanical layers on top of the pose
    a.J.head.rotation.x += M.pitch; a.J.head.rotation.y += M.yaw; a.J.head.rotation.z += M.roll;
    a.J.jaw.rotation.x = M.jaw;
    if (a.J.stache) a.J.stache.rotation.z = Math.sin(S.t * 53) * 0.05 - M.yaw * 0.35;   // the mustache flaps with the shake
    for (const key of ['pistonL', 'pistonR']) { const P = a.J[key]; if (P) P.rod.position.y = -0.05 - M.jaw * 0.06; }
    // put the HEAD where the choreography wants it
    const want = new THREE.Vector3(OFFICE.eye.x + M.x, OFFICE.eye.y + M.y, OFFICE.eye.z - M.dist);
    a.root.updateMatrixWorld(true);
    const head = a.J.head.getWorldPosition(new THREE.Vector3());
    a.root.position.add(want.sub(head));
    this.office.scareLight.target.position.copy(head);
    this.shake = S.kind === 'victor' ? 0.15 : S.t > 0.06 ? 0.9 : 0.3;
  }
  endScare() {
    if (!this.scareChar) return;
    const a = this.chars[this.scareChar.kind];
    a.jitter = 0;
    if (a.J.prop) a.J.prop.visible = true;
    if (a.root.parent) a.root.parent.remove(a.root);
    this.scareChar = null;
    this.office.scareLight.intensity = 0;
    this.chars && Object.values(this.chars).forEach((c) => c.setMode('still'));
  }

  // compile every shader up front so nothing hitches mid-night
  prewarm(r) {
    const gl = r.gl;
    const all = Object.values(this.rooms);
    for (const R of all) {
      for (const k of KINDS) { const a = this.chars[k]; R.scene.add(a.root); a.root.position.set(0, 0, 0); }
      const C0 = Object.values(R.cams)[0]; gl.compile(R.scene, C0.camera);
      for (const k of KINDS) R.scene.remove(this.chars[k].root);
    }
    for (const k of KINDS) { const a = this.chars[k]; this.office.scene.add(a.root); a.root.position.set(0, 0, -1.5); }
    for (const side of ['left', 'right', 'hatch']) this.office.lights[side].light.intensity = 1;
    gl.compile(this.office.scene, this.panoCam);
    for (const k of KINDS) this.office.scene.remove(this.chars[k].root);
  }
}
