// Five Nights at Bessario's — boot, intro, input and the main loop.
import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { AudioEngine } from './audio/audio.js';
import { setEnvironment } from './chars/animatronic.js';
import { World, KINDS } from './world/world.js';
import { OFFICE } from './world/office.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { Save } from './save.js';
import { lineup } from './lineup.js';

const bootMsg = document.getElementById('bootMsg'), bootFill = document.getElementById('bootFill');
const progress = (p, m) => { bootFill.style.width = Math.round(p * 100) + '%'; if (m != null) bootMsg.textContent = m; };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get('only')) { lineup(q); return; }
  const save = new Save();
  const renderer = new Renderer(document.getElementById('c'));
  const isPhone = Math.min(screen.width, screen.height) < 600;
  renderer.setQuality(save.d.settings.quality || q.get('q') || (isPhone ? 'medium' : 'high'));
  setEnvironment(renderer.gl);
  progress(0.1, 'Building the restaurant…'); await frame();
  const audio = new AudioEngine();
  const tW = performance.now();
  const world = new World(renderer);
  console.log('[boot] world', Math.round(performance.now() - tW));
  progress(0.6, 'Waking the animatronics…'); await frame();
  const ui = new UI({ root: document.getElementById('ui'), audio, save });
  const game = new Game({ world, audio, ui, save });
  // title scene: one of them, close up, in the dark
  const title = buildTitleScene();
  progress(0.75, 'Compiling shaders…'); await frame();
  const tP = performance.now();
  try { world.prewarm(renderer); } catch (e) { console.warn('prewarm', e); }
  console.log('[boot] prewarm', Math.round(performance.now() - tP));
  progress(0.95, ''); await frame();

  // ---------------------------------------------------------- flow
  const toTitle = () => {
    game.mode = 'menu'; game.paused = false;
    world.view = 'office'; world.endScare();
    audio.staticLevel = 0; audio.lightLevel = 0; audio.setTension(0.12);
    ui.showTitle();
    title.show(world);
  };
  const runNight = async (n, custom = null) => {
    title.hide(world);
    game.mode = 'card';
    await ui.showCard(n > 6 ? 7 : n);
    game.startNight(n, custom);
  };
  ui.on('new', () => { save.d.night = 1; save.write(); ui.showPaper(); game.mode = 'paper'; });
  ui.on('paperDone', () => runNight(1));
  ui.on('continue', () => runNight(save.d.night));
  ui.on('night6', () => runNight(6));
  const customLevels = [5, 5, 5, 5, 1];
  ui.on('custom', () => { if (!ui.portraits) { ui.portraits = makePortraits(renderer, world); title.show(world); } ui.showCustom(customLevels); });
  ui.on('customGo', (lv) => runNight(7, lv));
  ui.on('settings', () => { if (game.mode === 'menu' && ui.settingsS.classList.contains('hidden')) ui.showSettings(save, renderer); audio.setVolumes({ master: save.d.settings.volume }); });
  ui.on('back', () => toTitle());
  ui.on('door', (s) => game.toggleDoor(s));
  ui.on('hatch', () => game.toggleHatch());
  ui.on('light', (s) => game.toggleLight(s));
  ui.on('cam', () => game.toggleCam());
  ui.on('selectCam', (id) => game.selectCam(id));
  ui.on('relock', (on) => game.setRelock(on));
  ui.on('mute', () => game.muteCall());
  ui.on('pause', (on) => game.pause(on));
  ui.on('quit', () => { game.pause(false); toTitle(); });
  ui.on('overDone', () => toTitle());
  ui.on('winDone', () => {
    if (game.custom || game.night >= 5) toTitle();
    else runNight(game.night + 1);
  });

  // ---------------------------------------------------------- input
  const canvas = renderer.canvas;
  let drag = null, edge = 0, mouseX = -1;
  const look = (dx) => { world.yaw += dx * 0.0042 * (save.d.settings.sens || 1); };
  canvas.addEventListener('pointerdown', (e) => { if (game.mode === 'playing' && !game.camUp) { drag = { x: e.clientX, id: e.pointerId }; } });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') mouseX = e.clientX / innerWidth;
    if (drag && e.pointerId === drag.id) { look(e.clientX - drag.x); drag.x = e.clientX; }
  });
  window.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
  window.addEventListener('pointercancel', () => { drag = null; });
  document.addEventListener('mouseleave', () => { mouseX = -1; });
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (game.mode !== 'playing') { if (e.code === 'Escape' && game.paused) game.pause(false); return; }
    const k = e.code;
    if (k === 'KeyQ') game.toggleDoor('left');
    else if (k === 'KeyE') game.toggleDoor('right');
    else if (k === 'KeyZ') game.toggleLight('left');
    else if (k === 'KeyC') game.toggleLight('right');
    else if (k === 'KeyW') game.toggleHatch();
    else if (k === 'KeyS') game.toggleLight('hatch');
    else if (k === 'Space' || k === 'Tab') { e.preventDefault(); game.toggleCam(); }
    else if (k === 'KeyR') game.setRelock(true);
    else if (k === 'Escape' || k === 'KeyP') game.pause(!game.paused);
    else if (k === 'KeyM') game.muteCall();
    const camKeys = { Digit1: '1A', Digit2: '1B', Digit3: '2', Digit4: '3', Digit5: '4A', Digit6: '4B', Digit7: '5A', Digit8: '5B', Digit9: '6', Digit0: '7' };
    if (camKeys[k]) game.selectCam(camKeys[k]);
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyR') game.setRelock(false); });
  // gamepad (consoles' browsers / PC controllers)
  const pad = { prev: {} };
  const camOrder = ['1A', '1B', '7', '3', '6', '2', '4A', '4B', '5A', '5B'];
  const pollPad = (dt) => {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g) : null;
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const pressed = (i) => { const now = b(i), was = pad.prev[i]; pad.prev[i] = now; return now && !was; };
    const ax = Math.abs(gp.axes[0] || 0) > 0.18 ? gp.axes[0] : 0;
    if (game.mode === 'playing' && !game.camUp) world.yaw -= ax * dt * 1.6;
    if (game.mode === 'menu') { if (pressed(0)) ui.emit(save.d.night > 1 ? 'continue' : 'new'); return; }
    if (game.mode === 'paper' && pressed(0)) { ui.emit('paperDone'); return; }
    if (game.mode !== 'playing') return;
    if (pressed(4)) game.toggleDoor('left'); if (pressed(5)) game.toggleDoor('right');
    if (pressed(6)) game.toggleLight('left'); if (pressed(7)) game.toggleLight('right');
    if (pressed(3)) game.toggleHatch(); if (pressed(2)) game.toggleLight('hatch');
    if (pressed(0)) game.toggleCam(); if (pressed(9)) game.pause(!game.paused);
    game.setRelock(b(1));
    if (game.camUp) {
      const i = camOrder.indexOf(game.camId);
      if (pressed(15) || pressed(13)) game.selectCam(camOrder[(i + 1) % camOrder.length]);
      if (pressed(14) || pressed(12)) game.selectCam(camOrder[(i + camOrder.length - 1) % camOrder.length]);
    }
  };

  // ---------------------------------------------------------- window
  const resize = () => renderer.resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'playing') game.pause(true); });
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  progress(1, '');
  toTitle();
  const bootEl = document.getElementById('boot');
  const removeBoot = () => { bootEl.classList.add('hide'); setTimeout(() => bootEl.remove(), 900); };
  if (navigator.webdriver) { removeBoot(); document.getElementById('intro').remove(); }
  else {
    bootEl.classList.add('ready');
    const start = () => { bootEl.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); audio.unlock(); audio.setVolumes({ master: save.d.settings.volume }); bootEl.remove(); playIntro(audio); };
    bootEl.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  // ---------------------------------------------------------- loop
  const P = renderer.post;
  const eye = OFFICE.eye.clone();
  let last = performance.now(), fpsT = 0, stepped = false;
  const tick = (dt, draw = true) => {
    pollPad(dt);
    // FNAF-style edge panning with a mouse, arrow keys on keyboards
    if (game.mode === 'playing' && !game.camUp) {
      if (mouseX >= 0 && !drag) { edge = mouseX < 0.12 ? (0.12 - mouseX) / 0.12 : mouseX > 0.88 ? -(mouseX - 0.88) / 0.12 : 0; world.yaw += edge * dt * 1.4; }
      if (keys.ArrowLeft || keys.KeyA) world.yaw += dt * 1.3;
      if (keys.ArrowRight || keys.KeyD) world.yaw -= dt * 1.3;
    }
    game.update(dt);
    // characters close to you stare; the rest hold still for the cameras
    for (const k of KINDS) {
      const a = world.chars[k];
      if (!a.root.parent) continue;
      const inOffice = a.root.parent === world.office.scene && !world.scareChar;
      if (world.scareChar && world.scareChar.kind === k) a.setMode('scare', eye);
      else a.setMode(inOffice ? 'stare' : 'still', eye);
    }
    world.update(dt, { powerOn: game.powerOn !== false, power: game.power ?? 100, outT: game.out ? game.out.t : 0, lebron: game.mode === 'playing' || game.mode === 'scare' ? game.A && game.A.lebron : null });
    ui.update(game, world);
    let f;
    if (game.mode === 'menu' || game.mode === 'paper') { f = title.frame(renderer, dt); presetTitle(P, title); }
    else if (game.mode === 'over') {
      game.overT = Math.max((game.overT || 0) + dt, (performance.now() - (game.overStart || performance.now())) / 1000);
      if (game.overT < 3.2 && game.scareKind !== 'victor') { // FNAF-style: the feed dissolves into static
        world.view = 'office'; f = world.frame(renderer); presetOffice(P, game);
        P.static = Math.min(1, 0.75 + Math.random() * 0.25); P.distort = 0.3; P.fade = Math.max(0, game.overT - 2.4) / 0.8;
        audio.staticLevel = 0.12 * (1 - game.overT / 3.2);
      } else { f = null; audio.staticLevel = 0; P.fade = 0; }
    }
    else if (game.mode === 'card') { f = null; }
    else {
      f = world.frame(renderer);
      if (world.view === 'cam') presetCam(P, game); else presetOffice(P, game);
      P.fade = 0;
      if (world.scareChar) {
        const S = world.scareChar, st = S.t;
        P.distort = S.kind === 'victor' ? 0.5 + Math.random() * 0.5 : st < 0.12 ? 0 : 0.06 + Math.random() * 0.12;
        P.ca = 0.004 + Math.random() * 0.006; P.exposure = S.kind === 'victor' ? 1.1 + Math.random() * 0.6 : 1.45; P.vignette = 0.85; P.static = S.kind === 'victor' ? 0.12 : 0.015;
        P.flash = st < 0.04 && !save.d.settings.reduceFlash ? 0.25 : 0;
      }
    }
    audio.update(dt, { power: game.powerOn === false ? 0 : 1, danger: 0 });
    if (!draw) return;
    if (f) renderer.render(f.scene, f.camera, dt, { still: f.still, key: f.key, motionBlur: f.motionBlur || 0 });
    else { renderer.gl.setRenderTarget(null); renderer.gl.setClearColor(0x000000); renderer.gl.clear(); }
    renderer.trackFps(dt);
    fpsT += dt;
    if (!stepped && !save.d.settings.quality && fpsT > 10 && game.mode === 'playing' && renderer.fps < 24) {
      stepped = true; const next = renderer.qualityName === 'high' ? 'medium' : 'low';
      if (next !== renderer.qualityName) { renderer.setQuality(next); ui.toast('GRAPHICS: ' + next.toUpperCase()); }
    }
  };
  const manual = q.has('manual');   // tests: render only when NS.tick() is called
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (manual) { last = now; return; }
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    if (window.NS && window.NS.timeScale) dt *= window.NS.timeScale;
    tick(dt);
  };
  requestAnimationFrame(loop);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const embedded = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
    if (!embedded) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // test hooks
  const sim = async (seconds, step = 0.1) => {
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) { if (window.NS.bot) window.NS.bot(step); game.update(step); world.update(step, { powerOn: game.powerOn, power: game.power, lebron: game.A && game.A.lebron }); if (game.mode !== 'playing') break; }
    return { mode: game.mode, time: Math.round(game.time), power: Math.round(game.power), night: game.night, scare: game.scareKind };
  };
  window.NS = { game, world, renderer, audio, ui, save, THREE, sim, tick, step: (dt, n = 1) => { for (let i = 0; i < n; i++) tick(dt, false); }, ready: true, timeScale: 1, title };
}

// ------------------------------------------------------------ post presets
function presetOffice(P, game) {
  const out = game.powerOn === false;
  Object.assign(P, { bloom: 0.3, vignette: 1.0, grain: 0.042, ca: 0.0016, exposure: out ? 0.9 : 1.6, saturation: 0.74, contrast: 1.16, static: 0, distort: 0, scan: 0, cctv: 0, gamma: 1.0 });
  P.tint.setRGB(1.0, 0.95, 0.84); P.lift.setRGB(0.004, 0.006, 0.004);
  P.flash = game.flash && game.victor && game.victor.state === 'office' ? 0.12 : 0;
}
function presetCam(P, game) {
  const st = game.camStatic > 0 ? Math.min(1, game.camStatic * 1.1) : 0;
  Object.assign(P, { bloom: 0.3, vignette: 1.15, grain: 0.1, ca: 0.0032, exposure: 1.55, saturation: 0.6, contrast: 1.2, scan: 0.06, cctv: 1, distort: st > 0.5 ? 0.25 : 0, gamma: 1.0 });
  P.static = Math.max(0.022 + Math.random() * 0.016, st * 0.85);
  P.tint.setRGB(0.93, 1.0, 0.9); P.lift.setRGB(0.006, 0.01, 0.007);
  P.flash = 0;
}
function presetTitle(P, title) {
  Object.assign(P, { bloom: 0.4, vignette: 1.2, grain: 0.09, ca: 0.004, exposure: 1.3, saturation: 0.55, contrast: 1.25, scan: 0.05, cctv: 0.6, distort: title.glitch > 0 ? 0.5 : 0, gamma: 1.0, flash: 0 });
  P.static = title.glitch > 0 ? 0.4 : 0.06 + Math.random() * 0.03;
  P.tint.setRGB(1, 0.96, 0.9); P.lift.setRGB(0, 0, 0);
}

// ------------------------------------------------------------ title scene
function buildTitleScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0);
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 30);
  const key = new THREE.SpotLight(0xffe2c0, 40, 8, 0.5, 0.6, 2); key.position.set(-0.5, 1.35, 1.7);
  const fill = new THREE.PointLight(0xb0a090, 2.2, 5, 2); fill.position.set(0.6, 2.4, 1.6); scene.add(fill);
  const rim = new THREE.PointLight(0x8090b0, 3, 6, 2); rim.position.set(-1.4, 2.2, -0.8);
  scene.add(key, key.target, rim);
  const T = { scene, cam, key, glitch: 0, who: 'bessario', t: 0, swapT: 7 };
  T.show = (world) => {
    T.world = world;
    const a = world.chars[T.who];
    if (a.root.parent) a.root.parent.remove(a.root);
    scene.add(a.root);
    a.root.position.set(0, 0, 0); a.root.rotation.y = -0.35;
    a.setPose('stare', true);
    const h = a.J.head.getWorldPosition(new THREE.Vector3());
    key.target.position.copy(h);
    cam.position.set(h.x - 0.45, h.y + 0.22, h.z + 1.95); cam.lookAt(h.x - 0.58, h.y + 0.1, h.z);
  };
  T.hide = (world) => { const a = world.chars[T.who]; if (a.root.parent === scene) scene.remove(a.root); };
  T.frame = (r, dt) => {
    T.t += dt; T.glitch -= dt;
    const world = T.world;
    if (world) {
      const a = world.chars[T.who];
      a.setMode('alive', cam.position); a.update(dt);
      key.intensity = 30 * (Math.random() < 0.03 ? 0.3 : 1);
      T.swapT -= dt;
      if (T.swapT <= 0) { // occasionally flicker to someone else's face
        T.glitch = 0.25;
        T.hide(world);
        T.who = T.who === 'bessario' ? ['kiril', 'kira', 'lebron'][Math.floor(Math.random() * 3)] : 'bessario';
        T.show(world);
        T.swapT = T.who === 'bessario' ? 6 + Math.random() * 6 : 0.4;
      }
    }
    r.setRenderScale(1, 1);
    cam.aspect = r.cssW / r.cssH; cam.updateProjectionMatrix();
    r.view = { mode: 0, center: 0, width: 1, tanHalf: 1, vscale: 1 };
    return { scene, camera: cam, still: false, key: '' };
  };
  return T;
}

// portraits for the custom night screen
function makePortraits(renderer, world) {
  const out = {};
  try {
    const S = 256, rt = new THREE.WebGLRenderTarget(S, S);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0806);
    const L = new THREE.SpotLight(0xffe8d0, 40, 8, 0.6, 0.6, 2); L.position.set(0.6, 2.6, 2); scene.add(L, L.target);
    scene.add(new THREE.HemisphereLight(0x8090a0, 0x100c08, 0.4));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    const gl = renderer.gl, px = new Uint8Array(S * S * 4);
    const c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d'); const img = ctx.createImageData(S, S);
    for (const k of KINDS) {
      const a = world.chars[k], prev = a.root.parent;
      if (prev) prev.remove(a.root);
      scene.add(a.root); a.root.position.set(0, 0, 0); a.root.rotation.y = 0; a.setPose('stare', true); a.update(0.016);
      const h = a.J.head.getWorldPosition(new THREE.Vector3());
      L.target.position.copy(h); cam.position.set(h.x, h.y + 0.05, h.z + 1.15); cam.lookAt(h.x, h.y, h.z);
      gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam); gl.readRenderTargetPixels(rt, 0, 0, S, S, px);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = ((S - 1 - y) * S + x) * 4, j = (y * S + x) * 4; img.data[j] = px[i]; img.data[j + 1] = px[i + 1]; img.data[j + 2] = px[i + 2]; img.data[j + 3] = 255; }
      ctx.putImageData(img, 0, 0); out[k] = c.toDataURL('image/jpeg', 0.8);
      scene.remove(a.root);
    }
    gl.setRenderTarget(null); rt.dispose();
  } catch (e) { console.warn('portraits', e); }
  return out;
}

// ------------------------------------------------------------ intro
function playIntro(audio) {
  const el = document.getElementById('intro');
  if (!el) return;
  el.classList.remove('hidden');
  const q = (c) => el.querySelector(c);
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  let done = false;
  const finish = () => { if (done) return; done = true; timers.forEach(clearTimeout); el.classList.add('out'); setTimeout(() => el.remove(), 950); };
  const t0 = performance.now();
  el.addEventListener('pointerdown', () => { if (performance.now() - t0 > 900) finish(); });
  at(250, () => { q('.in-studio').classList.add('show'); audio.play('logo'); });
  at(2900, () => q('.in-studio').classList.remove('show'));
  at(3700, () => q('.in-presents').classList.add('show'));
  at(5000, () => q('.in-presents').classList.remove('show'));
  at(5700, () => { q('.in-title').classList.add('show'); audio.play('stinger', { intensity: 0.7 }); audio.play('thunder'); });
  at(8800, finish);
}

boot().catch((e) => { console.error(e); bootMsg.textContent = 'Error: ' + (e && e.message); });
