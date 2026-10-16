// Procedural WebAudio sound design: ambience, SFX, voices, adaptive horror score.
import { clamp, lerp } from '../engine/util.js';

const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.9, music: 0.7, sfx: 0.9, voice: 0.85, amb: 0.8 };
    this.listener = { x: 5, z: 2.4, yaw: 0 };
    this.loops = {};
    this.musicLevel = 0;      // 0..1 tension
    this.musicTarget = 0.15;
    this.power = 1;
    this.muffle = 0;
  }

  // must be called from a user gesture
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
    try {
      const el = document.createElement('audio');
      el.src = SILENT_WAV; el.loop = true; el.setAttribute('playsinline', ''); el.volume = 0.01;
      el.play().catch(() => {});
      this.silentEl = el;
    } catch (_) {}
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
    this.build();
    this.ready = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.bus = {};
    for (const k of ['music', 'sfx', 'voice', 'amb']) {
      const g = ctx.createGain(); g.gain.value = this.vol[k]; g.connect(this.master); this.bus[k] = g;
    }
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(1.6, 2.6);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.35;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.bigReverb = ctx.createConvolver(); this.bigReverb.buffer = this.makeIR(4.0, 2.2);
    const bg = ctx.createGain(); bg.gain.value = 0.5; this.bigReverb.connect(bg); bg.connect(this.master);
    // noise buffers
    this.noise = this.makeNoise(3, 'white');
    this.pink = this.makeNoise(4, 'pink');
    this.brown = this.makeNoise(4, 'brown');
    this.distCurve = this.makeDist(40);
    this.startAmbience();
    this.startMusic();
  }

  makeIR(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
    return buf;
  }
  makeNoise(seconds, type) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }
  makeDist(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
    return c;
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    for (const k of Object.keys(this.bus)) this.bus[k].gain.value = this.vol[k];
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // spatial helpers: returns { pan, gain } relative to listener
  spatial(pos) {
    if (!pos) return { pan: 0, gain: 1 };
    const L = this.listener;
    const dx = pos.x - L.x, dz = pos.z - L.z;
    const dist = Math.hypot(dx, dz);
    // listener facing: yaw 0 => -x ; right vector => -z
    const fx = -Math.cos(L.yaw), fz = Math.sin(L.yaw);
    const rx = -fz, rz = fx; // right = rotate forward -90°
    const side = dist > 0.01 ? (dx * rx + dz * rz) / dist : 0;
    return { pan: clamp(side * 0.85, -1, 1), gain: clamp(1.6 / (1 + dist * 0.45), 0.04, 1.2), dist };
  }

  out(bus, pos, { reverb = 0.25, big = false } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    const sp = this.spatial(pos);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); node = p;
    }
    const v = ctx.createGain(); v.gain.value = sp.gain;
    node.connect(v); v.connect(this.bus[bus]);
    if (reverb > 0) { const s = ctx.createGain(); s.gain.value = reverb; v.connect(s); s.connect(big ? this.bigReverb : this.reverb); }
    return g;
  }

  osc(type, freq, t0, dur, dest, { gain = 0.3, attack = 0.005, release = null, detune = 0, freqEnd = null, curve = 'exp' } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    else { g.gain.setValueAtTime(gain, t0 + dur - (release || 0.05)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  noiseBurst(t0, dur, dest, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.002, buffer = null, freqEnd = null, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buffer || this.noise; src.playbackRate.value = rate;
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 2); src.stop(t0 + dur + 0.05);
    return { src, f, g };
  }

  // ------------------------------------------------------------ AMBIENCE
  startAmbience() {
    const ctx = this.ctx;
    const amb = this.bus.amb;
    // fluorescent hum
    const hum = ctx.createGain(); hum.gain.value = 0.0; hum.connect(amb);
    const humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 900; humFilter.connect(hum);
    for (const [f, g, type] of [[60, 0.05, 'sine'], [120, 0.035, 'sine'], [180, 0.012, 'triangle'], [240, 0.008, 'sawtooth']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(humFilter); o.start();
    }
    const buzzSrc = ctx.createBufferSource(); buzzSrc.buffer = this.noise; buzzSrc.loop = true;
    const buzzF = ctx.createBiquadFilter(); buzzF.type = 'bandpass'; buzzF.frequency.value = 3200; buzzF.Q.value = 4;
    const buzzG = ctx.createGain(); buzzG.gain.value = 0.0;
    buzzSrc.connect(buzzF); buzzF.connect(buzzG); buzzG.connect(amb); buzzSrc.start();
    this.loops.hum = hum; this.loops.buzz = buzzG;
    // fridge compressor drone
    const fr = ctx.createBufferSource(); fr.buffer = this.brown; fr.loop = true;
    const frf = ctx.createBiquadFilter(); frf.type = 'lowpass'; frf.frequency.value = 140;
    const frg = ctx.createGain(); frg.gain.value = 0.0;
    fr.connect(frf); frf.connect(frg); frg.connect(amb); fr.start();
    const fo = ctx.createOscillator(); fo.frequency.value = 49; const fog = ctx.createGain(); fog.gain.value = 0.015; fo.connect(fog); fog.connect(frg); fo.start();
    this.loops.fridge = frg;
    // desk fan: soft whoosh with blade pulse
    const fn = ctx.createBufferSource(); fn.buffer = this.pink; fn.loop = true;
    const fnf = ctx.createBiquadFilter(); fnf.type = 'bandpass'; fnf.frequency.value = 700; fnf.Q.value = 0.6;
    const fng = ctx.createGain(); fng.gain.value = 0.0;
    const flfo = ctx.createOscillator(); flfo.frequency.value = 18; const flg = ctx.createGain(); flg.gain.value = 0.012; flfo.connect(flg); flg.connect(fng.gain); flfo.start();
    fn.connect(fnf); fnf.connect(fng); fng.connect(amb); fn.start();
    this.loops.fan = fng;
    // camera static (monitor up)
    const st = ctx.createBufferSource(); st.buffer = this.noise; st.loop = true;
    const stf = ctx.createBiquadFilter(); stf.type = 'bandpass'; stf.frequency.value = 3000; stf.Q.value = 0.4;
    const stg = ctx.createGain(); stg.gain.value = 0;
    st.connect(stf); stf.connect(stg); stg.connect(this.bus.sfx); st.start();
    this.loops.static = stg;
    // light buzz (door lights)
    const lb = ctx.createOscillator(); lb.type = 'sawtooth'; lb.frequency.value = 120;
    const lbf = ctx.createBiquadFilter(); lbf.type = 'bandpass'; lbf.frequency.value = 1800; lbf.Q.value = 3;
    const lbg = ctx.createGain(); lbg.gain.value = 0;
    lb.connect(lbf); lbf.connect(lbg); lbg.connect(this.bus.sfx); lb.start();
    this.loops.lightBuzz = lbg;
    // power-out hum vanishes; deep room tone stays
    const rt = ctx.createBufferSource(); rt.buffer = this.brown; rt.loop = true;
    const rtf = ctx.createBiquadFilter(); rtf.type = 'lowpass'; rtf.frequency.value = 90;
    const rtg = ctx.createGain(); rtg.gain.value = 0.25; rt.connect(rtf); rtf.connect(rtg); rtg.connect(amb); rt.start();
    // fade ambience in
    const t = ctx.currentTime;
    hum.gain.linearRampToValueAtTime(0.55, t + 3);
    frg.gain.linearRampToValueAtTime(0.35, t + 3);
    fng.gain.linearRampToValueAtTime(0.03, t + 3);
    this.dripT = 2;
  }

  // ------------------------------------------------------------ MUSIC (adaptive drone)
  startMusic() {
    const ctx = this.ctx;
    const mbus = this.bus.music;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2;
    const mg = ctx.createGain(); mg.gain.value = 0;
    lp.connect(mg); mg.connect(mbus);
    const send = ctx.createGain(); send.gain.value = 0.6; mg.connect(send); send.connect(this.bigReverb);
    this.music = { lp, gain: mg, voices: [] };
    this.setMusicKey(55);
    // high eerie layer
    const hg = ctx.createGain(); hg.gain.value = 0; hg.connect(mbus);
    const hsend = ctx.createGain(); hsend.gain.value = 0.9; hg.connect(hsend); hsend.connect(this.bigReverb);
    for (const f of [1318, 1396]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13 + Math.random() * 0.1;
      const lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency); lfo.start();
      const og = ctx.createGain(); og.gain.value = 0.02; o.connect(og); og.connect(hg); o.start();
    }
    this.music.high = hg;
    // pulse (heartbeat-like sub hits) scheduled in update
    this.pulseT = 0;
  }

  setMusicKey(root) {
    const ctx = this.ctx;
    if (!this.music) return;
    for (const v of this.music.voices) { try { v.stop(ctx.currentTime + 2); } catch (_) {} }
    this.music.voices = [];
    const notes = [root, root * 1.5, root * 2, root * 2.38]; // root, fifth, octave, minor-ish third up
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = n; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = 0.05;
        o.connect(g); g.connect(this.music.lp); o.start();
        this.music.voices.push(o);
      }
    }
    // dissonant layer (minor second) controlled by tension
    const dg = ctx.createGain(); dg.gain.value = 0; dg.connect(this.music.lp);
    for (const n of [root * 1.06, root * 2.12]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = n;
      const g = ctx.createGain(); g.gain.value = 0.06; o.connect(g); g.connect(dg); o.start();
      this.music.voices.push(o);
    }
    this.music.diss = dg;
  }

  setTension(v) { this.musicTarget = clamp(v, 0, 1); }

  update(dt, { power = 1, flicker = 0, listener = null, danger = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (listener) this.listener = listener;
    this.musicLevel = lerp(this.musicLevel, this.musicTarget, 1 - Math.exp(-dt * 0.8));
    const m = this.musicLevel;
    const M = this.music;
    M.gain.gain.setTargetAtTime(0.25 + m * 0.75, t, 0.5);
    M.lp.frequency.setTargetAtTime(220 + m * 1400 + Math.sin(t * 0.21) * 120, t, 0.5);
    M.diss.gain.setTargetAtTime(Math.max(0, m - 0.35) * 1.2, t, 0.6);
    M.high.gain.setTargetAtTime(Math.max(0, m - 0.5) * 1.3, t, 1.0);
    // ambience follows power
    this.loops.hum.gain.setTargetAtTime(0.5 * power, t, 0.05);
    this.loops.fridge.gain.setTargetAtTime(0.25 * power, t, 0.2);
    this.loops.buzz.gain.setTargetAtTime(flicker * 0.05 * power, t, 0.02);
    this.loops.fan.gain.setTargetAtTime(0.035 * power, t, 0.6);
    this.loops.static.gain.setTargetAtTime(this.staticLevel || 0, t, 0.03);
    this.loops.lightBuzz.gain.setTargetAtTime((this.lightLevel || 0) * 0.025, t, 0.02);
    // heartbeat pulse with danger
    if (danger > 0.25) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = lerp(1.0, 0.42, danger);
        this.heartbeat(danger);
      }
    }
    // random drips/ticks
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 3 + Math.random() * 9;
      if (power > 0.5) this.play('tick');
    }
  }

  // ------------------------------------------------------------ SFX
  play(name, opts = {}) {
    if (!this.ready) return;
    const fn = this['sfx_' + name];
    if (fn) { try { return fn.call(this, opts); } catch (e) { console.warn('sfx', name, e); } }
  }

  sfx_chime({ pos } = {}) {
    const t = this.t, d = this.out('sfx', pos || { x: 1.3, z: 4.9 }, { reverb: 0.5 });
    const ding = (f, t0) => {
      this.osc('sine', f, t0, 1.6, d, { gain: 0.18 });
      this.osc('sine', f * 2.76, t0, 0.5, d, { gain: 0.03 });
      this.osc('sine', f * 5.4, t0, 0.2, d, { gain: 0.012 });
    };
    ding(659.3, t); ding(523.3, t + 0.42);
  }
  sfx_chimeBroken({ pos } = {}) {
    const t = this.t, d = this.out('sfx', pos || { x: 1.3, z: 4.9 }, { reverb: 0.6 });
    this.osc('sine', 659, t, 1.8, d, { gain: 0.16, freqEnd: 440 });
    this.osc('sine', 523, t + 0.5, 2.2, d, { gain: 0.14, freqEnd: 300 });
  }
  sfx_doorSlide({ pos, open = true } = {}) {
    const t = this.t, d = this.out('sfx', pos || { x: 1.3, z: 4.9 }, { reverb: 0.2 });
    this.noiseBurst(t, 0.9, d, { type: 'bandpass', freq: open ? 500 : 900, freqEnd: open ? 1100 : 450, q: 2, gain: 0.07, attack: 0.1 });
    this.osc('sawtooth', 70, t, 0.9, d, { gain: 0.02, attack: 0.1 });
    this.noiseBurst(t + 0.85, 0.1, d, { type: 'lowpass', freq: 400, gain: 0.08 });
  }
  sfx_step({ pos, heavy = 1, wet = 0 } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.15 });
    const f = 120 + Math.random() * 60;
    this.osc('sine', f, t, 0.08, d, { gain: 0.09 * heavy, freqEnd: f * 0.5 });
    this.noiseBurst(t, 0.07, d, { type: 'bandpass', freq: 1800 + Math.random() * 1500, q: 1.5, gain: 0.035 * heavy });
    if (wet) this.noiseBurst(t + 0.01, 0.12, d, { type: 'highpass', freq: 3000, gain: 0.03 * wet });
  }
  sfx_click() { const t = this.t, d = this.out('sfx', null, { reverb: 0 }); this.osc('square', 2200, t, 0.025, d, { gain: 0.04 }); }
  sfx_key() {
    const t = this.t, d = this.out('sfx', { x: 4.3, z: 1.6 }, { reverb: 0.05 });
    this.noiseBurst(t, 0.03, d, { type: 'bandpass', freq: 3000 + Math.random() * 800, q: 3, gain: 0.08 });
    this.osc('square', 1400, t, 0.02, d, { gain: 0.012 });
  }
  sfx_logo() { // studio sting: a low, warm chord with a music-box ping
    const t = this.t, d = this.out('sfx', null, { reverb: 0.7, big: true });
    [110, 164.8, 220, 261.6, 329.6].forEach((f, i) => this.osc(i < 2 ? 'triangle' : 'sine', f, t + i * 0.03, 3.6, d, { gain: i < 2 ? 0.07 : 0.045, attack: 0.25 }));
    [1318.5, 1975.5].forEach((f, i) => this.osc('sine', f, t + 0.55 + i * 0.32, 1.8, d, { gain: 0.03, attack: 0.005 }));
    this.noiseBurst(t, 2.5, d, { type: 'lowpass', freq: 220, gain: 0.05, attack: 0.4, buffer: this.brown });
  }
  sfx_tap({ pos } = {}) { // fingertip on the laminate counter
    const t = this.t, d = this.out('sfx', pos || { x: 3.8, z: 2.6 }, { reverb: 0.08 });
    this.noiseBurst(t, 0.025, d, { type: 'bandpass', freq: 1100 + Math.random() * 500, q: 2.5, gain: 0.05 });
    this.osc('sine', 260 + Math.random() * 60, t, 0.03, d, { gain: 0.03, freqEnd: 140 });
  }
  sfx_beep({ ok = true } = {}) {
    const t = this.t, d = this.out('sfx', { x: 4.2, z: 1.5 }, { reverb: 0.1 });
    this.osc('square', ok ? 1850 : 1200, t, 0.09, d, { gain: 0.05, curve: 'lin' });
    if (ok) this.osc('square', 2350, t + 0.1, 0.08, d, { gain: 0.04, curve: 'lin' });
  }
  sfx_scan() {
    const t = this.t, d = this.out('sfx', { x: 4.1, z: 2.0 }, { reverb: 0.1 });
    this.osc('square', 2600, t, 0.12, d, { gain: 0.05, curve: 'lin' });
  }
  sfx_error() {
    const t = this.t, d = this.out('sfx', { x: 4.2, z: 1.5 }, { reverb: 0.1 });
    this.osc('sawtooth', 140, t, 0.45, d, { gain: 0.06, curve: 'lin' });
    this.osc('sawtooth', 147, t, 0.45, d, { gain: 0.05, curve: 'lin' });
  }
  sfx_alarm() {
    const t = this.t, d = this.out('sfx', { x: 4.2, z: 1.5 }, { reverb: 0.2 });
    for (let i = 0; i < 3; i++) this.osc('square', 880, t + i * 0.25, 0.15, d, { gain: 0.05, curve: 'lin' });
  }
  sfx_register() {
    const t = this.t, d = this.out('sfx', { x: 4.2, z: 3.4 }, { reverb: 0.3 });
    this.noiseBurst(t, 0.15, d, { type: 'bandpass', freq: 2500, q: 2, gain: 0.08 });
    this.osc('sine', 2093, t + 0.12, 0.9, d, { gain: 0.07 });
    this.osc('sine', 2637, t + 0.14, 0.7, d, { gain: 0.05 });
    this.noiseBurst(t + 0.2, 0.25, d, { type: 'lowpass', freq: 600, gain: 0.08 });
  }
  sfx_bag() { const t = this.t, d = this.out('sfx', { x: 4, z: 2.6 }, { reverb: 0.1 }); for (let i = 0; i < 5; i++) this.noiseBurst(t + i * 0.06 + Math.random() * 0.03, 0.08, d, { type: 'highpass', freq: 2500, gain: 0.05 }); }
  sfx_card() { const t = this.t, d = this.out('sfx', { x: 4, z: 2.3 }, { reverb: 0.05 }); this.noiseBurst(t, 0.18, d, { type: 'bandpass', freq: 4000, q: 1, gain: 0.04, freqEnd: 2500 }); this.osc('sine', 300, t + 0.17, 0.04, d, { gain: 0.04 }); }
  sfx_cardFlip() { const t = this.t, d = this.out('sfx', null, { reverb: 0 }); this.noiseBurst(t, 0.1, d, { type: 'bandpass', freq: 3000, q: 1, gain: 0.03 }); }
  sfx_tick() { const t = this.t, d = this.out('amb', { x: -5 + Math.random() * 10, z: -4 + Math.random() * 8 }, { reverb: 0.4 }); this.osc('sine', 1800 + Math.random() * 1500, t, 0.05, d, { gain: 0.01 }); }
  sfx_phoneRing() {
    const t = this.t, d = this.out('sfx', { x: 4.3, z: 1.0 }, { reverb: 0.25 });
    for (let i = 0; i < 2; i++) {
      const t0 = t + i * 0.4;
      const o1 = this.ctx.createOscillator(); o1.frequency.value = 440;
      const o2 = this.ctx.createOscillator(); o2.frequency.value = 480;
      const am = this.ctx.createOscillator(); am.type = 'square'; am.frequency.value = 20;
      const amg = this.ctx.createGain(); amg.gain.value = 0.5; am.connect(amg);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 0.01); g.gain.setValueAtTime(0.035, t0 + 0.33); g.gain.linearRampToValueAtTime(0, t0 + 0.35);
      amg.connect(g.gain);
      o1.connect(g); o2.connect(g); g.connect(d);
      [o1, o2, am].forEach((o) => { o.start(t0); o.stop(t0 + 0.4); });
    }
  }
  sfx_phonePick() { const t = this.t, d = this.out('sfx', { x: 4.3, z: 1.0 }); this.noiseBurst(t, 0.08, d, { type: 'lowpass', freq: 800, gain: 0.12 }); this.osc('sine', 200, t, 0.05, d, { gain: 0.06 }); }
  sfx_phoneLine() { // line static under phone voice
    const t = this.t, d = this.out('voice', null, { reverb: 0 });
    return this.noiseBurst(t, 0.6, d, { type: 'bandpass', freq: 2000, q: 0.7, gain: 0.015 });
  }
  sfx_hangup() { const t = this.t, d = this.out('sfx', { x: 4.3, z: 1.0 }); this.noiseBurst(t, 0.06, d, { type: 'lowpass', freq: 500, gain: 0.15 }); this.osc('sine', 425, t + 0.3, 1.2, d, { gain: 0.03, curve: 'lin' }); }
  sfx_cabinet({ open = true } = {}) {
    const t = this.t, d = this.out('sfx', { x: 6.4, z: 2.3 }, { reverb: 0.2 });
    // creak: resonant filter sweep over noise + glass rattle
    this.noiseBurst(t, 0.5, d, { type: 'bandpass', freq: open ? 700 : 1100, freqEnd: open ? 1300 : 600, q: 12, gain: 0.07, attack: 0.04 });
    this.noiseBurst(t + 0.02, 0.12, d, { type: 'highpass', freq: 5000, gain: 0.04 });
    if (!open) this.osc('sine', 180, t + 0.45, 0.1, d, { gain: 0.1 });
  }
  sfx_unlock() { const t = this.t, d = this.out('sfx', { x: 6.4, z: 2.3 }); this.osc('square', 3000, t, 0.02, d, { gain: 0.03 }); this.noiseBurst(t + 0.05, 0.06, d, { type: 'bandpass', freq: 2500, q: 4, gain: 0.07 }); }
  sfx_gunGrab() { const t = this.t, d = this.out('sfx', null, { reverb: 0.1 }); this.noiseBurst(t, 0.2, d, { type: 'bandpass', freq: 900, q: 1, gain: 0.08 }); this.osc('sine', 120, t + 0.15, 0.08, d, { gain: 0.08 }); }
  sfx_pump() {
    const t = this.t, d = this.out('sfx', null, { reverb: 0.15 });
    const clack = (t0, f) => { this.noiseBurst(t0, 0.06, d, { type: 'bandpass', freq: f, q: 3, gain: 0.22 }); this.osc('square', f / 4, t0, 0.03, d, { gain: 0.04 }); };
    clack(t, 1800); this.noiseBurst(t + 0.04, 0.12, d, { type: 'bandpass', freq: 1200, q: 1, gain: 0.05 }); clack(t + 0.2, 2400);
  }
  sfx_shellDrop() { const t = this.t + 0.4, d = this.out('sfx', { x: 5.2, z: 2.6 }, { reverb: 0.2 }); for (let i = 0; i < 3; i++) this.osc('sine', 3200 + Math.random() * 600, t + i * 0.09 * (1 - i * 0.2), 0.12, d, { gain: 0.03 / (i + 1) }); }
  sfx_shotgun() {
    const ctx = this.ctx, t = this.t;
    const d = this.out('sfx', null, { reverb: 0.7, big: true });
    const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(d);
    this.noiseBurst(t, 0.6, ws, { type: 'lowpass', freq: 5000, freqEnd: 300, gain: 1.0, attack: 0.001, buffer: this.noise });
    this.noiseBurst(t, 0.12, d, { type: 'highpass', freq: 2000, gain: 0.6, attack: 0.001 });
    this.osc('sine', 110, t, 0.5, d, { gain: 0.9, freqEnd: 35, attack: 0.002 });
    this.osc('triangle', 60, t, 0.9, d, { gain: 0.5, freqEnd: 28, attack: 0.002 });
    // ear ringing
    this.osc('sine', 3900, t + 0.05, 3.5, this.out('sfx', null, { reverb: 0 }), { gain: 0.012, attack: 0.3 });
  }
  sfx_dryFire() { const t = this.t, d = this.out('sfx', null, { reverb: 0.1 }); this.noiseBurst(t, 0.04, d, { type: 'bandpass', freq: 2500, q: 4, gain: 0.2 }); }
  sfx_knock({ count = 3, pos = { x: 6.6, z: -0.35 }, hard = 1 } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.5 });
    for (let i = 0; i < count; i++) {
      const t0 = t + i * (0.32 + Math.random() * 0.08);
      this.osc('sine', 95 + Math.random() * 20, t0, 0.18, d, { gain: 0.35 * hard, freqEnd: 60 });
      this.noiseBurst(t0, 0.06, d, { type: 'lowpass', freq: 900, gain: 0.2 * hard });
    }
  }
  sfx_glassKnock({ pos = { x: 0, z: 5 }, count = 3 } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.4 });
    for (let i = 0; i < count; i++) { const t0 = t + i * 0.28; this.osc('sine', 1100, t0, 0.07, d, { gain: 0.08 }); this.noiseBurst(t0, 0.04, d, { type: 'bandpass', freq: 2400, q: 3, gain: 0.12 }); }
  }
  sfx_breaker() { const t = this.t, d = this.out('sfx', { x: 6.5, z: 4.5 }, { reverb: 0.3 }); this.noiseBurst(t, 0.08, d, { type: 'lowpass', freq: 1200, gain: 0.3 }); this.osc('square', 80, t, 0.06, d, { gain: 0.1 }); }
  sfx_powerDown() {
    const t = this.t, d = this.out('sfx', null, { reverb: 0.6, big: true });
    this.osc('sawtooth', 120, t, 1.8, d, { gain: 0.12, freqEnd: 25, attack: 0.01 });
    this.noiseBurst(t, 0.15, d, { type: 'lowpass', freq: 600, gain: 0.4 });
    this.osc('sine', 50, t, 0.4, d, { gain: 0.4, freqEnd: 30 });
  }
  sfx_powerUp() {
    const t = this.t, d = this.out('sfx', null, { reverb: 0.3 });
    for (let i = 0; i < 8; i++) this.noiseBurst(t + i * 0.12 + Math.random() * 0.06, 0.03, d, { type: 'bandpass', freq: 3000, q: 2, gain: 0.08 });
    this.osc('sawtooth', 40, t, 1.4, d, { gain: 0.05, freqEnd: 120, attack: 0.5 });
  }
  sfx_flashlight({ on = true } = {}) { const t = this.t, d = this.out('sfx', null, { reverb: 0 }); this.osc('square', on ? 1600 : 1200, t, 0.02, d, { gain: 0.05 }); this.noiseBurst(t, 0.03, d, { type: 'bandpass', freq: 2000, q: 4, gain: 0.08 }); }
  sfx_heartbeat(level = 0.5) { this.heartbeat(level); }
  heartbeat(level) {
    const t = this.t, d = this.out('sfx', null, { reverb: 0 });
    const g = 0.18 + level * 0.4;
    // sub thump + audible harmonics (phone speakers can't reproduce 55 Hz on its own)
    for (const [dt, k] of [[0, 1], [0.22, 0.7]]) {
      this.osc('sine', 55, t + dt, 0.16, d, { gain: g * k, freqEnd: 38 });
      this.osc('sine', 118, t + dt, 0.1, d, { gain: g * k * 0.55, freqEnd: 80 });
      this.osc('triangle', 230, t + dt, 0.05, d, { gain: g * k * 0.18, freqEnd: 150 });
      this.noiseBurst(t + dt, 0.05, d, { type: 'lowpass', freq: 900, gain: g * k * 0.25, buffer: this.brown });
    }
  }
  sfx_stinger({ intensity = 1 } = {}) {
    const t = this.t, d = this.out('music', null, { reverb: 0.8, big: true });
    // dissonant brass-like cluster + shriek + boom
    for (const f of [110, 116.5, 220, 233, 349, 466, 494]) this.osc('sawtooth', f, t, 2.6, d, { gain: 0.07 * intensity, attack: 0.008 });
    this.noiseBurst(t, 1.6, d, { type: 'bandpass', freq: 3200, freqEnd: 500, q: 1.6, gain: 0.22 * intensity });
    this.osc('sine', 40, t, 1.6, d, { gain: 0.45 * intensity, freqEnd: 25 });
    this.osc('triangle', 160, t, 1.0, d, { gain: 0.2 * intensity, freqEnd: 60 });
    this.noiseBurst(t, 0.35, d, { type: 'lowpass', freq: 2000, freqEnd: 300, gain: 0.35 * intensity, buffer: this.brown });
  }
  sfx_screech({ pos = null, len = 1.2, pitch = 1 } = {}) {
    const ctx = this.ctx, t = this.t;
    const d = this.out('sfx', pos, { reverb: 0.6, big: true });
    const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(d);
    const car = ctx.createOscillator(); car.type = 'sawtooth';
    car.frequency.setValueAtTime(700 * pitch, t);
    car.frequency.exponentialRampToValueAtTime(1500 * pitch, t + len * 0.3);
    car.frequency.exponentialRampToValueAtTime(380 * pitch, t + len);
    const mod = ctx.createOscillator(); mod.frequency.value = 93 * pitch;
    const mg = ctx.createGain(); mg.gain.value = 900 * pitch; mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    car.connect(g); g.connect(ws);
    car.start(t); mod.start(t); car.stop(t + len + 0.1); mod.stop(t + len + 0.1);
    this.noiseBurst(t, len, d, { type: 'bandpass', freq: 2500, freqEnd: 900, q: 1.5, gain: 0.25 });
  }
  sfx_jumpscare() {
    this.sfx_screech({ len: 1.6, pitch: 1.1 });
    const t = this.t, d = this.out('sfx', null, { reverb: 0.5, big: true });
    this.osc('sine', 70, t, 1.2, d, { gain: 0.9, freqEnd: 25, attack: 0.002 });
    this.noiseBurst(t, 0.8, d, { type: 'lowpass', freq: 3000, freqEnd: 200, gain: 0.7, attack: 0.002 });
    for (const f of [233, 247, 466, 494]) this.osc('sawtooth', f, t, 1.5, d, { gain: 0.06 });
  }
  sfx_growl({ pos = null, len = 1.4 } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.4 });
    const ws = this.ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(d);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(65, t); o.frequency.linearRampToValueAtTime(48, t + len);
    const am = this.ctx.createOscillator(); am.frequency.value = 23; const amg = this.ctx.createGain(); amg.gain.value = 0.12; am.connect(amg);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    amg.connect(g.gain);
    o.connect(g); g.connect(ws);
    o.start(t); am.start(t); o.stop(t + len + 0.1); am.stop(t + len + 0.1);
    this.noiseBurst(t, len, d, { type: 'bandpass', freq: 300, q: 2, gain: 0.12, attack: 0.2 });
  }
  sfx_breath({ pos = null, heavy = 1 } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.2 });
    this.noiseBurst(t, 0.9, d, { type: 'bandpass', freq: 900, freqEnd: 600, q: 1.2, gain: 0.05 * heavy, attack: 0.4 });
    this.noiseBurst(t + 1.0, 0.7, d, { type: 'bandpass', freq: 1300, freqEnd: 800, q: 1.2, gain: 0.04 * heavy, attack: 0.1 });
  }
  sfx_whisper({ pos = null, len = 1.8 } = {}) {
    const t = this.t, d = this.out('voice', pos, { reverb: 0.6 });
    let tt = t;
    while (tt < t + len) {
      const sl = 0.06 + Math.random() * 0.12;
      this.noiseBurst(tt, sl, d, { type: 'bandpass', freq: 1500 + Math.random() * 3000, q: 6, gain: 0.08 + Math.random() * 0.06, attack: 0.02 });
      tt += sl + Math.random() * 0.05;
    }
  }
  sfx_static({ len = 1.0, gain = 0.1 } = {}) {
    const t = this.t, d = this.out('sfx', null, { reverb: 0 });
    this.noiseBurst(t, len, d, { type: 'bandpass', freq: 2500, q: 0.5, gain, attack: 0.01 });
    for (let i = 0; i < 12; i++) this.noiseBurst(t + Math.random() * len, 0.02, d, { type: 'highpass', freq: 4000, gain: gain * 1.5 });
  }
  sfx_radio({ len = 3 } = {}) {
    const t = this.t, d = this.out('sfx', { x: 4.55, z: 3.6 }, { reverb: 0.15 });
    this.noiseBurst(t, len, d, { type: 'bandpass', freq: 1800, q: 1, gain: 0.04, attack: 0.05 });
  }
  sfx_thunder() {
    const t = this.t, d = this.out('amb', null, { reverb: 0.8, big: true });
    const k = 0.7 + Math.random() * 0.5;
    // crack, then a long rolling rumble with some mid content so it carries on phone speakers
    this.noiseBurst(t, 0.6, d, { type: 'bandpass', freq: 1400, freqEnd: 300, q: 0.7, gain: 0.32 * k, attack: 0.004 });
    this.noiseBurst(t + 0.05, 4.5, d, { type: 'lowpass', freq: 380, freqEnd: 70, gain: 0.9 * k, attack: 0.08, buffer: this.brown });
    this.noiseBurst(t + 0.3, 3.2, d, { type: 'lowpass', freq: 900, freqEnd: 160, gain: 0.35 * k, attack: 0.25, buffer: this.brown });
    this.noiseBurst(t + 1.2, 2.5, d, { type: 'lowpass', freq: 500, freqEnd: 90, gain: 0.4 * k, attack: 0.4, buffer: this.brown });
  }
  sfx_carPass({ pos } = {}) {
    const t = this.t, d = this.out('amb', pos || { x: 0, z: 25 }, { reverb: 0.3 });
    const len = 4.5;
    const n = this.noiseBurst(t, len, d, { type: 'bandpass', freq: 300, q: 0.7, gain: 0.0001, attack: 0.01, buffer: this.pink });
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(0.0001, t); n.g.gain.exponentialRampToValueAtTime(0.12, t + len * 0.5); n.g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.f.frequency.setValueAtTime(500, t); n.f.frequency.exponentialRampToValueAtTime(900, t + len * 0.45); n.f.frequency.exponentialRampToValueAtTime(260, t + len);
    // tyres on wet road
    this.noiseBurst(t + len * 0.3, len * 0.4, d, { type: 'highpass', freq: 2500, gain: 0.05, attack: 0.5 });
  }
  sfx_carDoor({ pos } = {}) { // muffled car door slam out in the lot
    const t = this.t, d = this.out('amb', pos || { x: 0, z: 9 }, { reverb: 0.5 });
    this.osc('sine', 110, t, 0.18, d, { gain: 0.16, freqEnd: 55 });
    this.noiseBurst(t, 0.12, d, { type: 'lowpass', freq: 900, gain: 0.14 });
    this.noiseBurst(t + 0.02, 0.05, d, { type: 'bandpass', freq: 2200, q: 2, gain: 0.03 });
  }
  sfx_engine({ pos, off = false } = {}) { // idle rumble: starting up or shutting down
    const t = this.t, d = this.out('amb', pos || { x: 0, z: 9 }, { reverb: 0.4 });
    const len = off ? 0.9 : 2.2;
    const o = this.osc('sawtooth', off ? 52 : 38, t, len, d, { gain: 0.035, attack: off ? 0.01 : 0.25, freqEnd: off ? 30 : 48 });
    void o;
    this.noiseBurst(t, len, d, { type: 'lowpass', freq: 240, gain: 0.08, attack: off ? 0.01 : 0.3, buffer: this.brown });
  }
  sfx_skitter({ pos } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.3 });
    for (let i = 0; i < 10; i++) this.noiseBurst(t + i * 0.05 + Math.random() * 0.02, 0.02, d, { type: 'bandpass', freq: 2500 + Math.random() * 2000, q: 5, gain: 0.08 });
  }
  sfx_thud({ pos } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.4 });
    this.osc('sine', 90, t, 0.25, d, { gain: 0.3, freqEnd: 40 });
    this.noiseBurst(t, 0.15, d, { type: 'lowpass', freq: 1500, gain: 0.25 });
    for (let i = 0; i < 3; i++) this.noiseBurst(t + 0.15 + i * 0.1, 0.05, d, { type: 'bandpass', freq: 2000, q: 2, gain: 0.08 / (i + 1) });
  }
  sfx_fridgeDoor({ pos } = {}) { const t = this.t, d = this.out('sfx', pos || { x: -6, z: 0 }, { reverb: 0.4 }); this.noiseBurst(t, 0.4, d, { type: 'bandpass', freq: 400, q: 3, gain: 0.08, attack: 0.05 }); this.osc('sine', 60, t, 0.3, d, { gain: 0.08 }); }
  sfx_body() {
    const t = this.t, d = this.out('sfx', { x: 3, z: 2.4 }, { reverb: 0.4 });
    this.osc('sine', 70, t, 0.4, d, { gain: 0.5, freqEnd: 35 });
    this.noiseBurst(t, 0.3, d, { type: 'lowpass', freq: 800, gain: 0.4 });
  }
  sfx_dissolve({ pos } = {}) {
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.6, big: true });
    this.noiseBurst(t, 2.5, d, { type: 'bandpass', freq: 1500, freqEnd: 200, q: 3, gain: 0.15, attack: 0.05 });
    this.osc('sawtooth', 300, t, 2.2, d, { gain: 0.04, freqEnd: 40 });
  }
  sfx_siren() {
    const ctx = this.ctx, t = this.t, d = this.out('sfx', { x: 1, z: 10 }, { reverb: 0.6, big: true });
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    for (let i = 0; i < 8; i++) { o.frequency.setValueAtTime(700, t + i * 1.0); o.frequency.linearRampToValueAtTime(1300, t + i * 1.0 + 0.5); o.frequency.linearRampToValueAtTime(700, t + i * 1.0 + 1.0); }
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 2); g.gain.setValueAtTime(0.16, t + 7); g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
    o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 8.1);
  }
  sfx_typewriter() { const t = this.t, d = this.out('sfx', null, { reverb: 0 }); this.noiseBurst(t, 0.025, d, { type: 'bandpass', freq: 3500, q: 3, gain: 0.05 }); }
  sfx_uiOpen() { const t = this.t, d = this.out('sfx', null, { reverb: 0.1 }); this.osc('sine', 600, t, 0.08, d, { gain: 0.04, freqEnd: 900 }); }
  sfx_uiBack() { const t = this.t, d = this.out('sfx', null, { reverb: 0.1 }); this.osc('sine', 800, t, 0.08, d, { gain: 0.035, freqEnd: 500 }); }
  sfx_crtOn() { const t = this.t, d = this.out('sfx', { x: 4.2, z: 1.4 }, { reverb: 0.1 }); this.osc('sine', 15000, t, 0.8, d, { gain: 0.01 }); this.noiseBurst(t, 0.2, d, { type: 'highpass', freq: 3000, gain: 0.04 }); }
  sfx_dawn() {
    const t = this.t, d = this.out('music', null, { reverb: 0.8, big: true });
    for (const [f, dl] of [[261.6, 0], [329.6, 0.4], [392, 0.8], [523.3, 1.2]]) this.osc('sine', f, t + dl, 5, d, { gain: 0.06, attack: 1.2 });
    for (let i = 0; i < 6; i++) this.osc('sine', 2000 + Math.random() * 1500, t + 2 + i * 0.7, 0.15, d, { gain: 0.01, freqEnd: 2600 + Math.random() * 1000 });
  }


  // ------------------------------------------------------------ FIVE NIGHTS AT BESSARIO'S
  sfx_doorShut({ open = false, side = 0 } = {}) { // heavy steel shutter
    const t = this.t, d = this.out('sfx', { x: side * 2.5, z: 0 }, { reverb: 0.3 });
    this.noiseBurst(t, 0.22, d, { type: 'bandpass', freq: open ? 900 : 500, freqEnd: open ? 1600 : 300, q: 1.5, gain: 0.12, attack: 0.02 });
    if (!open) {
      this.osc('sine', 75, t + 0.18, 0.35, d, { gain: 0.45, freqEnd: 40 });
      this.noiseBurst(t + 0.18, 0.25, d, { type: 'lowpass', freq: 1400, gain: 0.35 });
      for (const f of [310, 467, 733]) this.osc('triangle', f, t + 0.18, 0.5, d, { gain: 0.03 });
    } else this.noiseBurst(t + 0.15, 0.08, d, { type: 'lowpass', freq: 900, gain: 0.12 });
  }
  sfx_btn() { const t = this.t, d = this.out('sfx', null, { reverb: 0.05 }); this.osc('square', 900, t, 0.03, d, { gain: 0.04 }); this.noiseBurst(t, 0.03, d, { type: 'bandpass', freq: 2500, q: 3, gain: 0.08 }); }
  sfx_denied() { const t = this.t, d = this.out('sfx', null, { reverb: 0.05 }); this.osc('square', 180, t, 0.12, d, { gain: 0.05, curve: 'lin' }); this.osc('square', 140, t + 0.13, 0.15, d, { gain: 0.05, curve: 'lin' }); }
  sfx_camUp() { const t = this.t, d = this.out('sfx', null, { reverb: 0.05 }); this.noiseBurst(t, 0.25, d, { type: 'bandpass', freq: 1200, freqEnd: 3000, q: 1, gain: 0.08 }); this.osc('sine', 9000, t + 0.15, 0.3, d, { gain: 0.006 }); }
  sfx_camDown() { const t = this.t, d = this.out('sfx', null, { reverb: 0.05 }); this.noiseBurst(t, 0.22, d, { type: 'bandpass', freq: 2600, freqEnd: 900, q: 1, gain: 0.07 }); }
  sfx_camSwitch() { const t = this.t, d = this.out('sfx', null, { reverb: 0 }); this.osc('square', 1500, t, 0.03, d, { gain: 0.03 }); this.noiseBurst(t, 0.18, d, { type: 'highpass', freq: 2000, gain: 0.07 }); }
  sfx_laugh({ pos = null, far = 1 } = {}) { // deep, slow, mechanical "ho... ho... ho"
    const voice = { pitch: 78, kind: 'impostor', wrongness: 0.12, timbre: 'sawtooth', gain: 1.3 * far, formantShift: 0.75 };
    [0, 0.42, 0.84].forEach((dl) => setTimeout(() => this.syllable(voice, 1, pos), dl * 1000));
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.7, big: true });
    this.osc('sawtooth', 58, t, 1.4, d, { gain: 0.04 * far, freqEnd: 50 });
  }
  sfx_clang({ pos = null } = {}) { // pots and pans in the kitchen
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.6, big: true });
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * (0.15 + Math.random() * 0.3), b = 300 + Math.random() * 500;
      for (const k of [1, 2.76, 5.4, 8.9]) this.osc('sine', b * k, t0, 0.6 / k + 0.2, d, { gain: 0.06 / k });
      this.noiseBurst(t0, 0.05, d, { type: 'highpass', freq: 3000, gain: 0.08 });
    }
  }
  sfx_bang({ side = -1, hard = 1 } = {}) { // something hammering the steel door
    const t = this.t, d = this.out('sfx', { x: side * 2.6, z: 0 }, { reverb: 0.5 });
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 0.22;
      this.osc('sine', 70, t0, 0.3, d, { gain: 0.6 * hard, freqEnd: 38 });
      this.noiseBurst(t0, 0.18, d, { type: 'lowpass', freq: 1800, gain: 0.45 * hard });
      for (const f of [287, 431, 690]) this.osc('triangle', f, t0, 0.4, d, { gain: 0.04 * hard });
    }
  }
  sfx_run({ side = -1 } = {}) { // heavy fast footsteps getting closer
    const t = this.t, d = this.out('sfx', { x: side * 3, z: -2 }, { reverb: 0.35 });
    for (let i = 0; i < 9; i++) {
      const t0 = t + i * 0.17, g = 0.12 + i * 0.04;
      this.osc('sine', 95, t0, 0.12, d, { gain: g, freqEnd: 50 });
      this.noiseBurst(t0, 0.06, d, { type: 'bandpass', freq: 1200, q: 1, gain: g * 0.4 });
    }
  }
  sfx_freezerCreak() { const t = this.t, d = this.out('sfx', null, { reverb: 0.4 }); this.noiseBurst(t, 0.9, d, { type: 'bandpass', freq: 420, freqEnd: 260, q: 14, gain: 0.08, attack: 0.1 }); }
  sfx_ratchet() { const t = this.t, d = this.out('sfx', null, { reverb: 0.1 }); for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.05, 0.02, d, { type: 'bandpass', freq: 2200, q: 5, gain: 0.08 }); }
  sfx_freezerBreak() {
    const t = this.t, d = this.out('sfx', null, { reverb: 0.7, big: true });
    this.osc('sine', 60, t, 0.6, d, { gain: 0.6, freqEnd: 30 });
    this.noiseBurst(t, 0.4, d, { type: 'lowpass', freq: 2500, freqEnd: 300, gain: 0.5 });
    for (let i = 0; i < 6; i++) this.osc('sine', 2500 + Math.random() * 2000, t + 0.1 + i * 0.05, 0.25, d, { gain: 0.03 }); // chain links
  }
  sfx_sting() { // window-scare hit when you light up someone at the door
    const t = this.t, d = this.out('music', null, { reverb: 0.6, big: true });
    for (const f of [146.8, 155.6, 293.7, 311.1]) this.osc('sawtooth', f, t, 1.2, d, { gain: 0.05, attack: 0.005 });
    this.noiseBurst(t, 0.5, d, { type: 'bandpass', freq: 2500, freqEnd: 600, q: 1.2, gain: 0.12 });
  }
  sfx_musicBox() { // a tinny, slightly broken little tune (power out)
    const t = this.t, d = this.out('sfx', { x: 2.6, z: -0.3 }, { reverb: 0.6, big: true });
    const N = [523, 659, 784, 659, 587, 523, 587, 659, 523, 392, 440, 523, 494, 440, 392, 0, 523, 659, 784, 880, 784, 659, 587, 523];
    N.forEach((f, i) => { if (!f) return; const det = (Math.random() - 0.5) * 18; this.osc('sine', f, t + i * 0.32, 0.5, d, { gain: 0.05, detune: det }); this.osc('sine', f * 3.01, t + i * 0.32, 0.18, d, { gain: 0.012, detune: det }); });
    return N.length * 0.32;
  }
  sfx_chime6() { // 6 AM: bells + distant kids cheering
    const t = this.t, d = this.out('music', null, { reverb: 0.7, big: true });
    for (let i = 0; i < 6; i++) { const t0 = t + i * 0.7; for (const k of [1, 2.4, 3.9]) this.osc('sine', 880 * k * (i % 2 ? 0.75 : 1), t0, 1.8 / k, d, { gain: 0.07 / k }); }
    const c = this.out('sfx', null, { reverb: 0.6, big: true });
    for (let i = 0; i < 40; i++) {
      const t0 = t + 1.5 + Math.random() * 3.5;
      this.noiseBurst(t0, 0.25 + Math.random() * 0.3, c, { type: 'bandpass', freq: 1500 + Math.random() * 1800, q: 6, gain: 0.03 + Math.random() * 0.03, attack: 0.05 });
    }
    for (let i = 0; i < 3; i++) this.osc('sine', 2200, t + 2 + i * 0.6, 0.4, c, { gain: 0.02, freqEnd: 3200 }); // party blowers
  }
  sfx_scream({ kind = 'bessario' } = {}) { // the jumpscare shriek: starts at full force on the first frame
    const ctx = this.ctx, t = this.t;
    const pitch = { bessario: 0.82, kiril: 1.0, kira: 1.22, lebron: 0.9, victor: 0.6 }[kind] || 1;
    const len = kind === 'victor' ? 2.2 : 1.45;
    const d = this.out('sfx', null, { reverb: 0.25 });
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 12; lim.attack.value = 0.001; lim.release.value = 0.1;
    const vol = ctx.createGain(); vol.gain.value = 0.85; lim.connect(vol); vol.connect(d);
    const ws = ctx.createWaveShaper(); ws.curve = this.makeDist(220); ws.connect(lim);
    // screaming carrier: FM'd sawtooth swept up then down
    const car = ctx.createOscillator(); car.type = 'sawtooth';
    car.frequency.setValueAtTime(820 * pitch, t); car.frequency.exponentialRampToValueAtTime(1350 * pitch, t + 0.25); car.frequency.exponentialRampToValueAtTime(520 * pitch, t + len);
    const mod = ctx.createOscillator(); mod.type = 'square'; mod.frequency.value = 71 * pitch;
    const mg = ctx.createGain(); mg.gain.value = 620 * pitch; mod.connect(mg); mg.connect(car.frequency);
    const cg = ctx.createGain(); cg.gain.setValueAtTime(0.5, t); cg.gain.setValueAtTime(0.5, t + len - 0.2); cg.gain.linearRampToValueAtTime(0.0001, t + len);
    car.connect(cg); cg.connect(ws);
    // metallic buzz: ring-modulated low sawtooth
    const bz = ctx.createOscillator(); bz.type = 'sawtooth'; bz.frequency.value = 52 * pitch;
    const rm = ctx.createGain(); rm.gain.value = 0; const rmo = ctx.createOscillator(); rmo.frequency.value = 33; const rmg = ctx.createGain(); rmg.gain.value = 0.9;
    rmo.connect(rmg); rmg.connect(rm.gain); bz.connect(rm);
    const bg = ctx.createGain(); bg.gain.setValueAtTime(0.6, t); bg.gain.linearRampToValueAtTime(0.0001, t + len); rm.connect(bg); bg.connect(ws);
    // shriek noise + impact
    this.noiseBurst(t, len, ws, { type: 'bandpass', freq: 2600 * pitch, freqEnd: 1100, q: 1.3, gain: 0.45, attack: 0.001 });
    this.osc('sine', 62, t, 0.7, lim, { gain: 0.8, freqEnd: 28, attack: 0.001 });
    this.noiseBurst(t, 0.25, lim, { type: 'lowpass', freq: 3000, freqEnd: 400, gain: 0.6, attack: 0.001 });
    for (const o of [car, mod, bz, rmo]) { o.start(t); o.stop(t + len + 0.05); }
  }
  sfx_victor() { // low choir + whisper when he's in the office
    const t = this.t, d = this.out('voice', null, { reverb: 0.9, big: true });
    for (const f of [55, 58.3, 82.4, 110]) this.osc('sawtooth', f, t, 2.5, d, { gain: 0.06, attack: 0.3 });
    this.sfx_whisper({ len: 2.2 });
  }
  sfx_gameOverStatic() { this.sfx_static({ len: 4, gain: 0.12 }); }
  sfx_powerOutHum() { const t = this.t, d = this.out('sfx', null, { reverb: 0.8, big: true }); this.osc('sine', 40, t, 4, d, { gain: 0.15, freqEnd: 30, attack: 0.5 }); }
  sfx_footsteps({ side = 1 } = {}) { const t = this.t, d = this.out('sfx', { x: side * 3.5, z: -1 }, { reverb: 0.4 }); for (let i = 0; i < 4; i++) { const t0 = t + i * 0.55; this.osc('sine', 80, t0, 0.15, d, { gain: 0.2, freqEnd: 45 }); this.noiseBurst(t0, 0.07, d, { type: 'bandpass', freq: 900, q: 1, gain: 0.08 }); } }
  sfx_skate({ pos = null } = {}) { const t = this.t, d = this.out('sfx', pos, { reverb: 0.4 }); this.noiseBurst(t, 1.2, d, { type: 'bandpass', freq: 500, freqEnd: 900, q: 2, gain: 0.05, attack: 0.3 }); }
  sfx_breathe({ pos = null } = {}) { this.sfx_breath({ pos, heavy: 1.4 }); }


  sfx_kidsLaugh() { // faint children's laughter somewhere in the building
    const pos = { x: (Math.random() - 0.5) * 16, z: -6 - Math.random() * 6 };
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) setTimeout(() => this.syllable({ pitch: 300 + Math.random() * 120, kind: 'human', timbre: 'triangle', gain: 0.22, formantShift: 1.5 }, 0.6, pos), i * (110 + Math.random() * 60));
  }
  sfx_pipeKnock() { this.sfx_knock({ count: 2 + Math.floor(Math.random() * 3), pos: { x: (Math.random() - 0.5) * 10, z: -5 }, hard: 0.18 }); }
  sfx_distantMusic() { // a few notes of the stage show, far away
    const t = this.t, d = this.out('sfx', { x: (Math.random() - 0.5) * 8, z: -12 }, { reverb: 0.9, big: true });
    const N = [392, 440, 494, 523, 494, 440];
    N.forEach((f, i) => { this.osc('triangle', f * 0.5, t + i * 0.42, 0.5, d, { gain: 0.012 }); this.osc('sine', f, t + i * 0.42, 0.35, d, { gain: 0.01 }); });
  }
  sfx_ventRattle() { const t = this.t, d = this.out('sfx', { x: (Math.random() - 0.5) * 4, z: -1 }, { reverb: 0.3 }); for (let i = 0; i < 14; i++) this.noiseBurst(t + i * 0.045 + Math.random() * 0.02, 0.03, d, { type: 'bandpass', freq: 700 + Math.random() * 400, q: 4, gain: 0.03 }); }
  sfx_servo({ pos = null } = {}) { // an animatronic's motors whining
    const t = this.t, d = this.out('sfx', pos, { reverb: 0.3 });
    this.osc('sawtooth', 180 + Math.random() * 60, t, 0.45, d, { gain: 0.02, freqEnd: 320 + Math.random() * 80, attack: 0.05 });
    this.noiseBurst(t, 0.45, d, { type: 'bandpass', freq: 2400, q: 6, gain: 0.02, attack: 0.05 });
  }
  sfx_lampBuzz() { const t = this.t, d = this.out('sfx', { x: 0, z: -0.5 }, { reverb: 0.1 }); this.osc('sawtooth', 120, t, 0.5, d, { gain: 0.03 }); this.noiseBurst(t, 0.4, d, { type: 'bandpass', freq: 3000, q: 2, gain: 0.04 }); }

  // ------------------------------------------------------------ VOICES
  // Per-syllable babble with formant filters. voice = { pitch, rate, kind: 'human'|'impostor'|'phone', timbre }
  syllable(voice, amp = 1, pos = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = this.t;
    const phone = voice.kind === 'phone';
    const d = this.out('voice', phone ? null : pos, { reverb: phone ? 0 : 0.18 });
    let dest = d;
    if (phone) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      hp.connect(lp); lp.connect(d); dest = hp;
    }
    const dur = 0.09 + Math.random() * 0.08;
    const p = voice.pitch * (0.9 + Math.random() * 0.22);
    const o = ctx.createOscillator(); o.type = voice.timbre || 'sawtooth';
    o.frequency.setValueAtTime(p * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(p * (0.92 + Math.random() * 0.06), t + dur);
    let src = o;
    if (voice.kind === 'impostor' && (voice.wrongness || 0) > 0.02) {
      // pitch wobble + ring modulation: subtly wrong
      const lfo = ctx.createOscillator(); lfo.frequency.value = 7 + Math.random() * 6;
      const lg = ctx.createGain(); lg.gain.value = p * (voice.wrongness || 0.08); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
      const rm = ctx.createGain(); rm.gain.value = 0;
      const rmo = ctx.createOscillator(); rmo.frequency.value = 30 + Math.random() * 40;
      const rmg = ctx.createGain(); rmg.gain.value = 0.6 * (voice.wrongness || 0.08) * 6; rmo.connect(rmg); rmg.connect(rm.gain);
      o.connect(rm); src = rm; rmo.start(t); rmo.stop(t + dur + 0.05);
      const dry = ctx.createGain(); dry.gain.value = 0.7; o.connect(dry); dry.connect(dest);
    }
    const vowels = [[800, 1200], [400, 2000], [300, 2300], [500, 900], [350, 800], [600, 1700]];
    const v = vowels[Math.floor(Math.random() * vowels.length)];
    const sh = voice.formantShift || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * amp * (voice.gain || 1), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, gg] of [[v[0] * sh, 6, 1], [v[1] * sh, 8, 0.6]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = gg;
      src.connect(bp); bp.connect(bg); bg.connect(g);
    }
    // breathiness
    this.noiseBurst(t, dur, g, { type: 'bandpass', freq: 2500 * sh, q: 1, gain: 0.08 * amp });
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
