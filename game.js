// Five Nights at Bessario's — night logic: power, doors, cameras, and the animatronics' AI.
import { CAMS } from '../world/rooms.js';
import { CALLS } from './calls.js';
import { PhoneVoice } from './voice.js';

export const HOUR = 62;          // seconds per in-game hour (12 AM -> 6 AM = 6 hours)
const PASSIVE = [0, 0, 0.01, 0.018, 0.024, 0.03, 0.04, 0.04];

// AI levels per night: [bessario, kiril, kira, lebron, victor]
export const NIGHTS = {
  1: [0, 3, 2, 1, 0],
  2: [0, 5, 4, 3, 0],
  3: [1, 7, 6, 5, 1],
  4: [3, 10, 9, 8, 2],
  5: [5, 13, 12, 11, 3],
  6: [12, 17, 16, 15, 5],
};
const ORDER = ['bessario', 'kiril', 'kira', 'lebron', 'victor'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Game {
  constructor({ world, audio, ui, save }) {
    this.world = world; this.audio = audio; this.ui = ui; this.save = save;
    this.mode = 'menu';
    this.paused = false;
    this.voice = new PhoneVoice(audio);
  }

  // ------------------------------------------------------------ night setup
  startNight(night, customAI = null) {
    const W = this.world, O = W.office;
    this.night = night;
    this.custom = !!customAI;
    const lv = customAI || NIGHTS[Math.min(night, 6)];
    this.ai = {}; ORDER.forEach((k, i) => (this.ai[k] = lv[i]));
    this.time = 0; this.hour = 0;
    this.power = 100; this.powerOn = true; this.usage = 1;
    this.camUp = false; this.camId = this.lastCam || '1A';
    this.camStatic = 0; this.camSwitchT = 0;
    this.doors = { left: false, right: false }; this.hatch = false;
    this.lights = { left: false, right: false, hatch: false };
    this.disabled = { left: false, right: false, hatch: false };
    this.relocking = false;
    this.seenAtDoor = {};
    this.out = null;
    this.scareT = 0;
    this.victor = { state: 'none', t: 0, cool: 30 };
    this.ambT = 6 + Math.random() * 6;
    this.flash = 0;
    // animatronics
    this.A = {
      bessario: { loc: 'stage', t: 0, int: 3.02, inside: 0 },
      kiril: { loc: 'stage', t: 0, int: 4.97, inside: 0, doorT: 0 },
      kira: { loc: 'stage', t: 0, int: 4.98, inside: 0, doorT: 0 },
      lebron: { loc: 'freezer', phase: 'locked', lock: 100, t: 0, bangs: 0 },
    };
    for (const k of ['bessario', 'kiril', 'kira', 'lebron']) W.place(k, this.A[k].loc);
    W.place('victor', 'none');
    W.setPoster(false);
    for (const s of ['left', 'right']) { O.doors[s].closed = false; O.lights[s].on = false; O.doors[s].mesh.position.y = O.doors[s].yOpen; }
    O.hatch.closed = false; O.hatch.mesh.position.y = O.hatch.yOpen; O.lights.hatch.on = false;
    W.view = 'office'; W.yaw = 0;
    W.endScare();
    O.doorGlow.intensity = 0; O.scareLight.intensity = 0;
    this.mode = 'playing';
    // phone call (nights 1-5)
    this.call = !this.custom && CALLS[night] ? { lines: CALLS[night], i: -1, t: 3.2, ringing: 2, muted: false } : null;
    this.ui.onNightStart(this);
  }

  // ------------------------------------------------------------ player actions
  toggleDoor(side) {
    if (this.mode !== 'playing' || !this.powerOn) return;
    if (this.disabled[side]) { this.audio.play('denied'); return; }
    this.doors[side] = !this.doors[side];
    this.world.office.doors[side].closed = this.doors[side];
    this.audio.play('doorShut', { open: !this.doors[side], side: side === 'left' ? -1 : 1 });
  }
  toggleHatch() {
    if (this.mode !== 'playing' || !this.powerOn) return;
    if (this.disabled.hatch) { this.audio.play('denied'); return; }
    this.hatch = !this.hatch;
    this.world.office.hatch.closed = this.hatch;
    this.audio.play('doorShut', { open: !this.hatch, side: 0 });
  }
  toggleLight(side) {
    if (this.mode !== 'playing' || !this.powerOn) return;
    if (this.disabled[side]) { this.audio.play('denied'); return; }
    const on = !this.lights[side];
    for (const s of ['left', 'right', 'hatch']) { this.lights[s] = false; this.world.office.lights[s].on = false; }
    this.lights[side] = on; this.world.office.lights[side].on = on;
    this.audio.play('btn');
    if (on) this.checkWindowScare(side);
  }
  setLight(side, on) { if (this.lights[side] !== on) this.toggleLight(side); }
  toggleCam() {
    if (this.mode !== 'playing' || !this.powerOn) return;
    this.camUp = !this.camUp;
    for (const s of ['left', 'right', 'hatch']) { this.lights[s] = false; this.world.office.lights[s].on = false; }
    this.audio.play(this.camUp ? 'camUp' : 'camDown');
    this.ui.onCam(this.camUp);
    if (this.camUp) { this.camStatic = 0.35; this.viewCam(this.camId); }
    else this.onCamDown();
    this.world.view = this.camUp ? 'cam' : 'office';
  }
  selectCam(id) {
    if (!this.camUp || !CAMS[id] || id === this.camId) return;
    this.audio.play('camSwitch');
    this.camStatic = 0.3;
    this.viewCam(id);
  }
  viewCam(id) {
    this.camId = id; this.lastCam = id; this.world.camId = id;
    // sometimes whoever is in the room is already looking straight at the camera
    for (const k of ['bessario', 'kiril', 'kira']) {
      if (this.world.camRoomHas(id, k) && Math.random() < (k === 'bessario' ? 0.55 : 0.35)) this.world.lookAtCam(k, id);
    }
    // Victor's poster on CAM 7
    if (id === '7') {
      const ch = this.ai.victor > 0 && this.victor.cool <= 0 ? this.ai.victor * 0.012 : 0;
      if (this.victor.state === 'none' && Math.random() < ch) { this.world.setPoster(true); this.victor.state = 'poster'; }
    } else if (this.victor.state === 'poster') {
      this.world.setPoster(false);
    }
  }
  setRelock(on) { this.relocking = on && this.camUp && this.camId === '3' && this.powerOn; }

  onCamDown() {
    this.relocking = false;
    // whoever is inside gets you now
    for (const k of ['kiril', 'kira']) if (this.A[k].loc === 'inside') { this.scareSoon(k, 0.25); return; }
    // Victor appears after you saw his poster
    if (this.victor.state === 'poster') {
      this.world.setPoster(false);
      this.victor.state = 'office'; this.victor.t = 0;
      this.world.place('victor', 'office');
      this.audio.play('victor');
      this.ui.victorFlash(true);
    }
  }

  checkWindowScare(side) {
    const at = side === 'left' ? (this.A.kiril.loc === 'door' ? 'kiril' : this.A.lebron.loc === 'door' ? 'lebron' : null)
      : side === 'right' ? null : (this.A.kira.loc === 'hatch' ? 'kira' : null);
    if (at && !this.seenAtDoor[at]) { this.seenAtDoor[at] = true; this.audio.play('sting'); }
  }

  // ------------------------------------------------------------ main update
  update(dt) {
    if (this.mode === 'scare') {
      this.scareT += dt;
      this.world.updateScare(dt);
      if (this.scareT > 1.35 || performance.now() - this.scareStart > 1500) this.gameOver();
      return;
    }
    if (this.mode !== 'playing' || this.paused) return;
    this.time += dt;
    const hour = Math.floor(this.time / HOUR);
    if (hour !== this.hour) {
      this.hour = hour;
      if (!this.custom) {
        if (hour === 2) this.ai.kiril++;
        if (hour === 3 || hour === 4) { this.ai.kiril++; this.ai.kira++; this.ai.lebron++; }
      }
      if (hour >= 6) { this.win(); return; }
    }
    this.updatePower(dt);
    this.updateCall(dt);
    if (this.camStatic > 0) this.camStatic -= dt;
    this.victor.cool -= dt;
    this.updateAmbience(dt);
    if (this.powerOn) {
      this.tickAI('kiril', dt); this.tickAI('kira', dt); this.tickAI('bessario', dt);
      this.updateLebron(dt);
      this.updateInside(dt);
      this.updateVictor(dt);
    } else this.updatePowerOut(dt);
    if (this.pendingScare) { this.pendingScare.t -= dt; if (this.pendingScare.t <= 0) { const k = this.pendingScare.kind; this.pendingScare = null; this.scare(k); return; } }
    // sound mix
    this.audio.staticLevel = this.camUp ? (this.camStatic > 0 ? 0.05 : 0.008) : 0;
    this.audio.lightLevel = (this.lights.left || this.lights.right || this.lights.hatch) && this.powerOn ? 1 : 0;
    const danger = ['kiril', 'kira'].some((k) => this.A[k].loc === 'door' || this.A[k].loc === 'hatch' || this.A[k].loc === 'inside') || this.A.bessario.loc === 'eastCorner' || this.A.lebron.phase === 'out' ? 0.6 : 0.1;
    this.audio.setTension(this.powerOn ? 0.15 + this.hour * 0.06 + danger * 0.3 : 0.05);
  }

  // the building is never quiet: distant sounds, more of them the closer they get
  updateAmbience(dt) {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    const A = this.A;
    const close = ['westHall', 'westCorner', 'door', 'eastHall', 'eastCorner', 'kitchen', 'hatch'].filter((l) => [A.kiril.loc, A.kira.loc, A.bessario.loc].includes(l)).length;
    this.ambT = Math.max(4, 14 - close * 3 - this.hour) + Math.random() * 10;
    if (!this.powerOn) { if (Math.random() < 0.5) this.audio.play('breathe', { pos: { x: 2.5, z: -0.5 } }); return; }
    const r = Math.random();
    if (A.kiril.loc === 'westCorner' && r < 0.5) this.audio.play('footsteps', { side: -1 });
    else if (A.bessario.loc === 'eastHall' && r < 0.4) this.audio.play('servo', { pos: { x: 4, z: -3 } });
    else if (r < 0.18) this.audio.play('kidsLaugh');
    else if (r < 0.34) this.audio.play('pipeKnock');
    else if (r < 0.48) this.audio.play('distantMusic');
    else if (r < 0.6) this.audio.play('ventRattle');
    else if (r < 0.72) this.audio.play('freezerCreak');
    else if (r < 0.84) { this.audio.play('lampBuzz'); this.world.office.lamp.light.intensity = this.world.office.lamp.base * 0.15; }
    else this.audio.play('servo', { pos: { x: (Math.random() - 0.5) * 10, z: -6 } });
  }

  updatePower(dt) {
    if (!this.powerOn) return;
    let u = 1;
    if (this.doors.left) u++; if (this.doors.right) u++; if (this.hatch) u++;
    if (this.lights.left || this.lights.right || this.lights.hatch) u++;
    if (this.camUp) u++;
    if (this.relocking) u++;
    this.usage = u;
    this.power -= dt * (u * 0.1 + PASSIVE[Math.min(this.night, 7)]);
    if (this.power <= 0) { this.power = 0; this.startPowerOut(); }
  }

  updateCall(dt) {
    const C = this.call; if (!C || C.done) return;
    C.t -= dt;
    if (C.ringing > 0) {
      if (C.t <= 0) { this.audio.play('phoneRing'); C.ringing--; C.t = 1.6; this.world.office.phoneLed.material.emissiveIntensity = 2; }
      if (C.ringing === 0) { C.t = 1.0; }
      return;
    }
    if (C.i === -1) {
      if (C.t <= 0 && !C.starting) {
        C.starting = true;
        this.audio.play('phonePick');
        this.ui.showCallButton(true);
        // the recorded voice sets the pace; without a recording the subtitles run at reading speed
        this.voice.play(this.night).then((dur) => {
          if (C.done) { this.voice.stop(); return; }
          const tail = dur > 0 && this.night === 4 ? 9.2 : 0;     // the music box after "Yoooo"
          const total = C.lines.reduce((n, l) => n + l.length, 0);
          C.times = C.lines.map((l) => (dur > 0 ? (dur - tail) * (l.length / total) : Math.max(2.6, l.length * 0.062)));
          if (tail) { C.lines = C.lines.concat(['♪ ♪ ♪']); C.times.push(tail); }
          C.i = 0; C.t = 0; C.hasVoice = dur > 0;
        });
      }
      return;
    }
    if (C.t <= 0) {
      if (C.i >= C.lines.length || C.muted) {
        if (this.night === 4 && !C.muted) { this.voice.stop(); this.audio.play('static', { len: 0.8, gain: 0.25 }); }
        this.endCall(); return;
      }
      this.ui.subtitle(C.lines[C.i]);
      C.t = C.times[C.i];
      C.i++;
    }
  }
  muteCall() { if (this.call) { this.call.muted = true; this.voice.stop(); this.endCall(); } }
  endCall() {
    const C = this.call; if (!C || C.done) return;
    C.done = true; this.voice.stop(); this.audio.play('hangup'); this.ui.subtitle(null); this.ui.showCallButton(false);
    this.world.office.phoneLed.material.emissiveIntensity = 0;
  }

  watching(room) { return this.camUp && CAMS[this.camId].room === room; }

  move(kind, to) {
    const from = this.A[kind].loc;
    const W = this.world;
    // static on the monitor if someone leaves or enters the room you're watching
    if (this.camUp) {
      const r = CAMS[this.camId].room;
      const wasHere = W.camRoomHas(this.camId, kind);
      this.A[kind].loc = to; W.place(kind, to);
      const isHere = W.camRoomHas(this.camId, kind);
      if (wasHere || isHere) { this.camStatic = 1.2; this.audio.play('static', { len: 0.8, gain: 0.08 }); }
      void r;
    } else { this.A[kind].loc = to; W.place(kind, to); }
    // audio cues
    if (to === 'door' && kind === 'kiril') this.audio.play('footsteps', { side: -1 });
    if (to === 'hatch') { this.audio.play('skate', { pos: { x: 0, z: -3 } }); setTimeout(() => this.audio.play('breathe', { pos: { x: 0, z: -2.5 } }), 900); }
    if (kind === 'bessario') this.audio.play('laugh', { far: to === 'eastCorner' ? 1.2 : 0.6 });
    if (to === 'kitchen' && kind === 'kira') this.audio.play('clang', { pos: { x: 0, z: -4 } });
    if (from === 'door' || from === 'hatch') this.seenAtDoor[kind] = false;
  }

  tickAI(kind, dt) {
    const a = this.A[kind];
    if (a.loc === 'inside') return;
    a.t += dt;
    if (a.t < a.int) return;
    a.t = 0;
    const lvl = this.ai[kind];
    if (lvl <= 0 || Math.floor(Math.random() * 20) + 1 > lvl) return;
    const L = a.loc;
    if (kind === 'kiril') {
      const next = { stage: ['dining'], dining: ['party', 'westHall', 'diningWest'], diningWest: ['westHall', 'party'], party: ['westHall', 'dining'], westHall: ['westCorner', 'westCorner', 'party'], westCorner: ['door', 'door', 'westHall'] }[L];
      if (L === 'door') {
        if (this.doors.left) { this.move(kind, pick(['dining', 'party'])); this.audio.play('footsteps', { side: -1 }); }
        else this.goInside(kind);
        return;
      }
      if (next) this.move(kind, pick(next));
    } else if (kind === 'kira') {
      const next = { stage: ['dining'], dining: ['restrooms', 'kitchen', 'diningTray'], diningTray: ['kitchen', 'restrooms'], restrooms: ['kitchen', 'dining'], party: ['dining'], kitchen: ['hatch', 'hatch', 'restrooms'] }[L];
      if (L === 'hatch') {
        if (this.hatch) this.move(kind, pick(['dining', 'restrooms']));
        else this.goInside(kind);
        return;
      }
      if (L === 'kitchen' && Math.random() < 0.5) this.audio.play('clang', { pos: { x: 0, z: -4 } });
      if (next) this.move(kind, pick(next));
    } else if (kind === 'bessario') {
      if (L === 'stage' && (this.A.kiril.loc === 'stage' || this.A.kira.loc === 'stage')) return;
      if (this.watching(this.world.roomOfCam(this.camId).id) && this.world.camRoomHas(this.camId, 'bessario')) return; // frozen while watched
      const next = { stage: 'dining', dining: 'restrooms', restrooms: 'kitchen', kitchen: 'eastHall', eastHall: 'eastCorner' }[L];
      if (L === 'eastCorner') {
        if (this.doors.right) { this.move(kind, 'eastHall'); return; }
        if (this.camUp) this.goInside(kind);
        return;
      }
      if (next) this.move(kind, next);
    }
  }

  goInside(kind) {
    const a = this.A[kind];
    const W = this.world;
    a.loc = 'inside'; a.inside = 0;
    W.place(kind, 'inside');
    if (kind === 'kiril') { this.disabled.left = true; this.lights.left = false; W.office.lights.left.on = false; }
    if (kind === 'kira') { this.disabled.hatch = true; this.lights.hatch = false; W.office.lights.hatch.on = false; }
    if (kind === 'bessario') this.audio.play('laugh', { far: 1.5 });
    this.audio.play('breathe', { pos: { x: 0, z: 0.4 } });
  }

  updateInside(dt) {
    for (const k of ['kiril', 'kira', 'bessario']) {
      const a = this.A[k];
      if (a.loc !== 'inside' || this.pendingScare) continue;
      a.inside += dt;
      if (k === 'bessario') {
        // attacks while you're staring at the tablet
        if (this.camUp && Math.random() < dt * 0.35) { this.scare('bessario'); return; }
        if (a.inside > 14) { this.scare('bessario'); return; }
      } else if (a.inside > 24) { this.scare(k); return; }
    }
  }

  updateLebron(dt) {
    const L = this.A.lebron;
    if (L.phase === 'locked') {
      const lvl = this.ai.lebron;
      let drain = lvl * 0.26;
      if (this.watching('freezer')) drain *= 0.4;
      L.lock -= drain * dt;
      if (this.relocking) { L.lock += 32 * dt; if (Math.random() < dt * 8) this.audio.play('ratchet'); }
      L.lock = Math.min(100, L.lock);
      if (L.lock < 30 && Math.random() < dt * 0.15) this.audio.play('freezerCreak');
      if (L.lock <= 0) {
        L.lock = 0; L.phase = 'out'; L.t = 0;
        this.audio.play('freezerBreak');
        this.move('lebron', 'running');
        L.runTime = 3.2;
      }
    } else if (L.phase === 'out') {
      L.t += dt;
      if (this.watching('westHall') && L.t < L.runTime) L.runTime = Math.min(L.runTime, L.t + 1.1); // spotted: he sprints
      if (L.t > L.runTime * 0.55 && this.A.lebron.loc === 'running') { this.move('lebron', 'runningNear'); this.audio.play('run', { side: -1 }); }
      if (L.t >= L.runTime) {
        if (this.doors.left) {
          L.bangs++;
          this.move('lebron', 'door');
          this.audio.play('bang', { side: -1 });
          this.power = Math.max(0, this.power - (1 + L.bangs * 2));
          L.phase = 'banging'; L.t = 0;
        } else { this.scare('lebron'); }
      }
    } else if (L.phase === 'banging') {
      L.t += dt;
      if (L.t > 1.4) { L.phase = 'locked'; L.lock = 65; this.move('lebron', 'freezer'); }
    }
  }

  updateVictor(dt) {
    const V = this.victor;
    if (V.state === 'office') {
      V.t += dt;
      this.flash = Math.random() < 0.1 ? 1 : 0;
      const SL = this.world.office.scareLight; SL.intensity = Math.random() < 0.15 ? 1.5 : 8;
      SL.target.position.copy(this.world.chars.victor.J.head.getWorldPosition(SL.target.position));
      if (this.camUp) { // you looked away in time
        V.state = 'none'; V.cool = 45; this.world.place('victor', 'none'); this.ui.victorFlash(false); this.world.office.scareLight.intensity = 0;
      } else if (V.t > 2.4) {
        V.state = 'none'; this.ui.victorFlash(false); this.scare('victor');
      }
    }
  }

  // ------------------------------------------------------------ power out
  startPowerOut() {
    const W = this.world;
    this.powerOn = false;
    if (this.camUp) { this.camUp = false; W.view = 'office'; this.ui.onCam(false); }
    for (const s of ['left', 'right']) { if (this.doors[s]) this.audio.play('doorShut', { open: true, side: s === 'left' ? -1 : 1 }); this.doors[s] = false; W.office.doors[s].closed = false; }
    this.hatch = false; W.office.hatch.closed = false;
    for (const s of ['left', 'right', 'hatch']) { this.lights[s] = false; W.office.lights[s].on = false; }
    this.audio.play('powerDown');
    this.out = { phase: 'wait', t: 0, next: 4 + Math.random() * 12 };
    // everyone else freezes; Bessario comes for you
    for (const k of ['kiril', 'kira']) if (this.A[k].loc === 'inside') W.place(k, 'none');
    this.ui.onPowerOut();
  }
  updatePowerOut(dt) {
    const O = this.out, W = this.world;
    O.t += dt;
    W.outT = O.t;
    if (O.phase === 'wait' && O.t > O.next) {
      O.phase = 'song'; O.t = 0;
      this.A.bessario.loc = 'powerOut'; W.place('bessario', 'powerOut');
      O.songLen = this.audio.play('musicBox') || 7.5;
      O.next = Math.min(O.songLen, 5 + Math.random() * 9);
    } else if (O.phase === 'song') {
      const on = Math.sin(O.t * 9) > 0.2;
      W.chars.bessario.setGlow(on ? 1 : 0);
      W.office.doorGlow.intensity = on ? 2.2 : 0.15;
      if (O.t > O.next) { O.phase = 'dark'; O.t = 0; W.place('bessario', 'none'); W.office.doorGlow.intensity = 0; O.next = 2 + Math.random() * 6; this.ui.blackout(true); }
    } else if (O.phase === 'dark' && O.t > O.next) {
      this.ui.blackout(false);
      this.scare('bessario');
    }
  }

  // ------------------------------------------------------------ outcomes
  scareSoon(kind, t) { if (!this.pendingScare) this.pendingScare = { kind, t }; }
  scare(kind) {
    if (this.mode !== 'playing') return;
    this.mode = 'scare'; this.scareT = 0; this.scareStart = performance.now();
    this.endCall();
    if (this.camUp) { this.camUp = false; this.ui.onCam(false); }
    this.world.view = 'office';
    this.world.place(kind, 'none');
    this.world.startScare(kind);
    this.scareKind = kind;
    this.audio.play('scream', { kind });
    this.audio.staticLevel = 0; this.audio.lightLevel = 0;
    this.ui.onScare(kind);
  }
  gameOver() {
    this.mode = 'over'; this.overT = 0; this.overStart = performance.now();
    this.world.endScare();
    if (this.scareKind === 'victor') { this.ui.crash(); return; }
    this.audio.play('gameOverStatic');
    this.ui.showGameOver(this);
  }
  win() {
    this.mode = 'win';
    this.endCall();
    this.camUp = false; this.ui.onCam(false); this.world.view = 'office';
    this.audio.staticLevel = 0; this.audio.lightLevel = 0;
    this.audio.play('chime6');
    const S = this.save.d;
    if (!this.custom) {
      if (this.night >= 5) S.beat5 = true;
      if (this.night >= 6) S.beat6 = true;
      S.night = Math.max(S.night, Math.min(this.night + 1, 6));
    } else {
      S.beatCustom = true;
      if (Object.values(this.ai).every((v, i) => i === 4 || v >= 20)) S.maxMode = true;
    }
    this.save.write();
    this.ui.showWin(this);
  }

  pause(on) {
    if (this.mode !== 'playing') return;
    this.paused = on; this.ui.onPause(on);
    const ctx = this.audio.ctx; if (ctx) { if (on) ctx.suspend(); else ctx.resume(); }
  }
}
