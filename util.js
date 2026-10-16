// Small math / timing helpers shared everywhere.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const DEG = Math.PI / 180;

// Frame-rate independent damping
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Seeded RNG (mulberry32) so procedural content is reproducible.
export function makeRng(seed = 1234567) {
  let s = seed >>> 0;
  const r = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return r;
}
export const rng = makeRng((Date.now() ^ 0x5f3759df) >>> 0);

// Value noise 1D for organic flicker / sway
const NP = new Float32Array(512);
{
  const r = makeRng(99);
  for (let i = 0; i < 512; i++) NP[i] = r();
}
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = NP[i & 511], b = NP[(i + 1) & 511];
  return lerp(a, b, smooth(f));
}

// Simple tween manager driven by the game loop.
export class Tweens {
  constructor() { this.list = []; }
  add(duration, onUpdate, { ease = easeInOut, delay = 0, onDone = null } = {}) {
    const t = { duration, onUpdate, ease, delay, onDone, time: 0, dead: false };
    this.list.push(t);
    return t;
  }
  wait(seconds) {
    return new Promise((res) => this.add(seconds, () => {}, { onDone: res, ease: (x) => x }));
  }
  update(dt) {
    for (const t of this.list) {
      if (t.dead) continue;
      if (t.delay > 0) { t.delay -= dt; continue; }
      t.time += dt;
      const k = clamp(t.time / t.duration, 0, 1);
      t.onUpdate(t.ease(k), k);
      if (k >= 1) { t.dead = true; t.onDone && t.onDone(); }
    }
    if (this.list.length > 64) this.list = this.list.filter((t) => !t.dead);
  }
  clear() { this.list.forEach((t) => (t.dead = true)); this.list = []; }
}

// Timer helpers for async scripted sequences that respect pause.
export class Clock {
  constructor() { this.time = 0; this.waiters = []; this.paused = false; }
  update(dt) {
    if (this.paused) return;
    this.time += dt;
    if (!this.waiters.length) return;
    const now = this.time;
    const ready = this.waiters.filter((w) => w.at <= now);
    if (ready.length) {
      this.waiters = this.waiters.filter((w) => w.at > now);
      ready.forEach((w) => w.res());
    }
  }
  wait(sec) {
    return new Promise((res) => this.waiters.push({ at: this.time + sec, res }));
  }
  until(fn, timeout = Infinity) {
    // polls every frame-ish via short waits
    const start = this.time;
    return new Promise((res) => {
      const check = () => {
        if (fn()) return res(true);
        if (this.time - start > timeout) return res(false);
        this.waiters.push({ at: this.time + 0.05, res: check });
      };
      check();
    });
  }
  cancelAll() { this.waiters = []; }
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const m = Array.isArray(o.material) ? o.material : [o.material];
      m.forEach((mm) => mm.dispose && mm.dispose());
    }
  });
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function formatClock(minutesSinceMidnight) {
  const m = Math.floor(minutesSinceMidnight);
  let h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${mm.toString().padStart(2, '0')} ${ampm}`;
}
