// DOM interface: title screen, newspaper, night cards, office HUD, camera monitor, endings.
import { CAMS } from '../world/rooms.js';
import { CHAR_INFO } from '../chars/animatronic.js';
import { HOUR, NIGHTS } from '../game/game.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

// map layout (viewBox 0 0 300 250): rooms + where each camera button sits
const MAP_ROOMS = [
  ['SHOW STAGE', 100, 8, 100, 38], ['DINING', 78, 52, 144, 66], ['PARTY', 18, 56, 54, 48], ['STORAGE', 18, 112, 54, 50],
  ['RESTROOMS', 228, 40, 54, 44], ['KITCHEN', 126, 126, 68, 54], ['W.HALL', 84, 124, 32, 108], ['E.HALL', 204, 124, 32, 108], ['', 126, 192, 68, 40],
];
const MAP_CAMS = { '1A': [150, 26], '1B': [150, 92], '7': [46, 80], '3': [46, 140], '6': [256, 62], '2': [160, 150], '4A': [100, 146], '4B': [100, 210], '5A': [220, 146], '5B': [220, 210] };

export class UI {
  constructor({ root, audio, save }) {
    this.root = root; this.audio = audio; this.save = save;
    this.handlers = {};
    root.innerHTML = '';
    this.build();
  }
  on(name, fn) { this.handlers[name] = fn; }
  emit(name, ...a) { const f = this.handlers[name]; if (f) f(...a); }

  build() {
    const R = this.root;
    // ---------- title
    this.title = el('div', 'screen title hidden', `
      <div class="t-logo"><div class="t-l1">Five</div><div class="t-l1">Nights</div><div class="t-l1">at</div><div class="t-l1 t-big">Bessario's</div></div>
      <div class="t-menu">
        <button class="t-btn" data-act="new">&gt;&gt; New Game</button>
        <button class="t-btn" data-act="continue">&gt;&gt; Continue <span class="t-sub"></span></button>
        <button class="t-btn" data-act="night6">&gt;&gt; 6th Night</button>
        <button class="t-btn" data-act="custom">&gt;&gt; Custom Night</button>
      </div>
      <div class="t-stars"></div>
      <div class="t-foot">v1.0 &nbsp;·&nbsp; Bessario Games</div>
      <button class="t-gear" data-act="settings" aria-label="Settings">⚙</button>`);
    R.appendChild(this.title);
    this.title.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      this.audio.play('btn');
      this.emit(b.dataset.act);
    });
    // ---------- newspaper
    this.paper = el('div', 'screen paper hidden', `
      <div class="np">
        <div class="np-head">THE DAILY CLARION <span>·  CLASSIFIEDS</span></div>
        <div class="np-cols">
          <div class="np-ad">
            <div class="np-big">HELP WANTED</div>
            <div class="np-bear">
              <svg viewBox="0 0 200 70"><path d="M100 30 C93 18 74 16 60 26 C48 35 36 44 22 38 C11 33 11 18 24 17 C18 22 20 30 29 30 C40 30 46 17 63 12 C79 8 93 15 100 22 C107 15 121 8 137 12 C154 17 160 30 171 30 C180 30 182 22 176 17 C189 18 189 33 178 38 C164 44 152 35 140 26 C126 16 107 18 100 30 Z"/></svg>
            </div>
            <p><b>Bessario's Burgers</b>, a family restaurant and entertainment centre, is looking for a <b>night-time security guard</b>.</p>
            <p>12 AM to 6 AM. Monitor cameras. Make sure nothing gets damaged or stolen.</p>
            <p><b>$120 a week.</b> Bessario's Burgers is not responsible for injury or dismemberment.</p>
          </div>
          <div class="np-side"><p>LOCAL DINER STILL CLOSED AFTER "INCIDENT"</p><p>Health inspectors cite "smell coming from the costumes" ...</p><p>Burger chain denies all reports.</p></div>
        </div>
      </div>
      <div class="np-tap">tap to continue</div>`);
    R.appendChild(this.paper);
    this.paper.addEventListener('click', () => this.emit('paperDone'));
    // ---------- night card
    this.card = el('div', 'screen card hidden', '<div class="c-time">12:00 AM</div><div class="c-night">1st Night</div>');
    R.appendChild(this.card);
    // ---------- HUD
    this.hud = el('div', 'hud hidden', `
      <div class="h-time"><span class="h-clock">12 AM</span><div class="h-night">Night 1</div></div>
      <div class="h-power"><div>Power left: <b class="h-pct">100</b>%</div><div>Usage: <span class="h-bars"></span></div></div>
      <button class="h-mute hidden">MUTE CALL</button>
      <button class="h-pause" aria-label="Pause">II</button>
      <div class="h-panel h-left"><button class="pb door" data-a="door" data-s="left">DOOR</button><button class="pb light" data-a="light" data-s="left">LIGHT</button></div>
      <div class="h-panel h-right"><button class="pb door" data-a="door" data-s="right">DOOR</button><button class="pb light" data-a="light" data-s="right">LIGHT</button></div>
      <div class="h-panel h-front"><button class="pb door" data-a="door" data-s="hatch">HATCH</button><button class="pb light" data-a="light" data-s="hatch">LIGHT</button></div>
      <div class="h-sub hidden"></div>
      <div class="h-victor hidden">IT'S STILL HUNGRY</div>
      <div class="h-tip hidden"></div>
      <button class="h-cambar"><span>▲ ▲ ▲</span></button>`);
    R.appendChild(this.hud);
    this.hud.querySelectorAll('.pb').forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const s = b.dataset.s;
      if (b.dataset.a === 'door') this.emit(s === 'hatch' ? 'hatch' : 'door', s); else this.emit('light', s);
    }));
    $('.h-mute', this.hud).addEventListener('pointerdown', (e) => { e.stopPropagation(); this.emit('mute'); });
    $('.h-pause', this.hud).addEventListener('pointerdown', (e) => { e.stopPropagation(); this.emit('pause', true); });
    const bar = $('.h-cambar', this.hud);
    bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.emit('cam'); });
    // FNAF-style: hovering the bar with a mouse flips the monitor
    this.barArmed = true;
    bar.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && this.barArmed) { this.barArmed = false; this.emit('cam'); } });
    bar.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.barArmed = true; });
    // ---------- monitor
    this.mon = el('div', 'monitor hidden', `
      <div class="m-frame"></div>
      <div class="m-rec"><i></i> REC</div>
      <div class="m-name">SHOW STAGE</div>
      <div class="m-map"><svg viewBox="0 0 300 250"></svg></div>
      <div class="m-lock hidden"><div class="m-lock-lbl">FREEZER LOCK</div><div class="m-lock-bar"><i></i></div><button class="m-relock">HOLD TO RELOCK</button></div>
      <div class="m-out hidden">CAMERA DISABLED</div>`);
    R.appendChild(this.mon);
    this.buildMap();
    const rl = $('.m-relock', this.mon);
    const start = (e) => { e.preventDefault(); e.stopPropagation(); this.emit('relock', true); rl.classList.add('on'); };
    const stop = () => { this.emit('relock', false); rl.classList.remove('on'); };
    rl.addEventListener('pointerdown', start); rl.addEventListener('pointerup', stop); rl.addEventListener('pointerleave', stop); rl.addEventListener('pointercancel', stop);
    // ---------- overlays
    this.black = el('div', 'blackout hidden'); R.appendChild(this.black);
    this.over = el('div', 'screen over hidden', '<div class="o-txt">GAME OVER</div>'); R.appendChild(this.over);
    this.winS = el('div', 'screen win hidden', '<div class="w-clock"><div class="w-roll"><span>5</span><span>6</span></div><b>AM</b></div>'); R.appendChild(this.winS);
    this.check = el('div', 'screen check hidden'); R.appendChild(this.check);
    this.customS = el('div', 'screen custom hidden'); R.appendChild(this.customS);
    this.settingsS = el('div', 'screen settings hidden'); R.appendChild(this.settingsS);
    this.pauseS = el('div', 'screen pause hidden', '<div class="p-box"><div class="p-t">PAUSED</div><button data-p="resume">Resume</button><button data-p="quit">Quit to title</button></div>'); R.appendChild(this.pauseS);
    this.pauseS.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; this.emit(b.dataset.p === 'resume' ? 'pause' : 'quit', false); });
    this.toastEl = el('div', 'toast hidden'); R.appendChild(this.toastEl);
  }

  buildMap() {
    const svg = $('.m-map svg', this.mon);
    let h = '';
    for (const [n, x, y, w, hh] of MAP_ROOMS) h += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" class="mr"/>` + (n ? `<text x="${x + 3}" y="${y + 9}" class="mt">${n}</text>` : '');
    h += '<rect x="134" y="200" width="52" height="24" class="you"/><text x="160" y="216" class="yt">YOU</text>';
    for (const [id, [x, y]] of Object.entries(MAP_CAMS)) h += `<g class="mc" data-cam="${id}"><rect x="${x - 15}" y="${y - 9}" width="30" height="18" rx="2"/><text x="${x}" y="${y + 4}">CAM ${id}</text></g>`;
    svg.innerHTML = h;
    svg.querySelectorAll('.mc').forEach((g) => g.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.emit('selectCam', g.dataset.cam); }));
  }

  hideAll() { for (const s of [this.title, this.paper, this.card, this.hud, this.mon, this.over, this.winS, this.check, this.customS, this.settingsS, this.pauseS, this.black]) s.classList.add('hidden'); }

  // ------------------------------------------------------------ title
  showTitle() {
    this.hideAll();
    const S = this.save.d;
    this.title.classList.remove('hidden');
    $('[data-act="continue"] .t-sub', this.title).textContent = `Night ${S.night}`;
    $('[data-act="continue"]', this.title).classList.toggle('hidden', S.night <= 1);
    $('[data-act="night6"]', this.title).classList.toggle('hidden', !S.beat5);
    $('[data-act="custom"]', this.title).classList.toggle('hidden', !S.beat6);
    $('.t-stars', this.title).innerHTML = '★'.repeat(this.save.stars);
  }
  showPaper() { this.hideAll(); this.paper.classList.remove('hidden'); }
  showCard(night, ms = 2600) {
    this.hideAll();
    this.card.classList.remove('hidden');
    $('.c-night', this.card).textContent = night > 6 ? 'Custom Night' : `${ORD[night]} Night`;
    this.card.classList.remove('anim'); void this.card.offsetWidth; this.card.classList.add('anim');
    return new Promise((r) => setTimeout(r, ms));
  }

  // ------------------------------------------------------------ during a night
  onNightStart(game) {
    this.hideAll();
    this.hud.classList.remove('hidden');
    this.game = game;
    $('.h-night', this.hud).textContent = game.custom ? 'Custom Night' : `Night ${game.night}`;
    this.subtitle(null); this.showCallButton(false);
    this.victorFlash(false);
    const tip = $('.h-tip', this.hud);
    if (game.night === 1 && !game.custom) {
      const touch = matchMedia('(pointer: coarse)').matches;
      tip.innerHTML = touch ? 'DRAG to look left and right<br>Tap ▲▲▲ for the cameras · door buttons appear when you look at a door'
        : 'Move the mouse to the edges (or A/D) to look · SPACE cameras<br>Q / E doors · Z / C lights · W hatch · S hatch light · R relock freezer';
      tip.classList.remove('hidden'); clearTimeout(this.tipT); this.tipT = setTimeout(() => tip.classList.add('hidden'), 9000);
    } else tip.classList.add('hidden');
  }
  showCallButton(on) { $('.h-mute', this.hud).classList.toggle('hidden', !on); }
  subtitle(text) {
    const s = $('.h-sub', this.hud);
    if (!text) { s.classList.add('hidden'); return; }
    s.textContent = text; s.classList.remove('hidden');
  }
  victorFlash(on) { $('.h-victor', this.hud).classList.toggle('hidden', !on); }
  onCam(up) {
    this.mon.classList.toggle('hidden', !up);
    this.hud.classList.toggle('cam-up', up);
  }
  onPowerOut() { this.onCam(false); this.hud.classList.add('dark'); this.showCallButton(false); }
  blackout(on) { this.black.classList.toggle('hidden', !on); }
  onScare() { this.hud.classList.add('hidden'); this.mon.classList.add('hidden'); this.black.classList.add('hidden'); }
  onPause(on) { this.pauseS.classList.toggle('hidden', !on); }

  // per-frame HUD refresh
  update(game, world) {
    if (!game || game.mode !== 'playing') return;
    const hour = Math.min(6, Math.floor(game.time / HOUR));
    $('.h-clock', this.hud).textContent = `${hour === 0 ? 12 : hour} AM`;
    $('.h-pct', this.hud).textContent = Math.max(0, Math.ceil(game.power));
    const u = game.usage;
    $('.h-bars', this.hud).innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < u ? (u >= 4 ? 'r' : u >= 3 ? 'y' : 'g') : 'o'}"></i>`).join('');
    this.hud.classList.toggle('dark', !game.powerOn);
    // panels appear when you look toward them
    const y = world.yaw, ym = world.yawMax || 0.4;
    const left = y > ym * 0.45, right = y < -ym * 0.45, front = Math.abs(y) < ym * 0.6;
    $('.h-left', this.hud).classList.toggle('show', left && !game.camUp);
    $('.h-right', this.hud).classList.toggle('show', right && !game.camUp);
    $('.h-front', this.hud).classList.toggle('show', front && !game.camUp);
    for (const s of ['left', 'right', 'hatch']) {
      const p = $(s === 'hatch' ? '.h-front' : '.h-' + s, this.hud);
      $('.door', p).classList.toggle('on', s === 'hatch' ? game.hatch : game.doors[s]);
      $('.light', p).classList.toggle('on', game.lights[s]);
      p.classList.toggle('broken', game.disabled[s]);
    }
    if (game.camUp) {
      $('.m-name', this.mon).textContent = `CAM ${game.camId} · ${CAMS[game.camId].name}`;
      this.mon.querySelectorAll('.mc').forEach((g) => g.classList.toggle('sel', g.dataset.cam === game.camId));
      const on3 = game.camId === '3';
      $('.m-lock', this.mon).classList.toggle('hidden', !on3);
      if (on3) {
        const L = game.A.lebron;
        const v = L.phase === 'locked' ? L.lock : 0;
        const bar = $('.m-lock-bar i', this.mon);
        bar.style.width = v + '%'; bar.className = v < 30 ? 'r' : v < 60 ? 'y' : 'g';
        $('.m-lock-lbl', this.mon).textContent = L.phase === 'locked' ? 'FREEZER LOCK' : 'FREEZER: OPEN';
      }
      $('.m-out', this.mon).classList.toggle('hidden', !(game.camStatic > 0.6));
    }
  }

  // ------------------------------------------------------------ endings
  showGameOver() {
    this.hideAll();
    this.over.classList.remove('hidden');
    this.over.classList.remove('anim'); void this.over.offsetWidth; this.over.classList.add('anim');
    setTimeout(() => this.emit('overDone'), 5200);
  }
  crash() { this.hideAll(); this.black.classList.remove('hidden'); setTimeout(() => { this.black.classList.add('hidden'); this.emit('overDone'); }, 1800); }
  showWin(game) {
    this.hideAll();
    this.winS.classList.remove('hidden');
    this.winS.classList.remove('anim'); void this.winS.offsetWidth; this.winS.classList.add('anim');
    setTimeout(() => {
      if (!game.custom && game.night === 5) this.showCheck(120.50, 'Thank you for your hard work. Here is your pay for the week.');
      else if (!game.custom && game.night === 6) this.showCheck(0.5, 'Overtime for working the 6th night. Thank you!');
      else if (game.custom) this.showCheck(0, 'Custom night complete. We are watching your career with great interest.');
      else this.emit('winDone');
    }, 6500);
  }
  showCheck(amt, note) {
    this.hideAll();
    this.check.classList.remove('hidden');
    this.check.innerHTML = `<div class="ck"><div class="ck-h">BESSARIO'S BURGERS <span>Pay to the order of: Night Guard</span></div>
      <div class="ck-amt">$${amt.toFixed(2)}</div><div class="ck-note">${note}</div><div class="ck-sig">Bessario Games</div></div><div class="np-tap">tap to continue</div>`;
    const done = () => { this.check.removeEventListener('click', done); this.emit('winDone'); };
    setTimeout(() => this.check.addEventListener('click', done), 800);
  }

  // ------------------------------------------------------------ custom night
  showCustom(levels) {
    this.hideAll();
    const C = this.customS; C.classList.remove('hidden');
    const kinds = ['bessario', 'kiril', 'kira', 'lebron', 'victor'];
    const render = () => {
      C.innerHTML = `<div class="cu-t">Customize Night</div><div class="cu-row">` + kinds.map((k, i) => `
        <div class="cu-c" style="--c:${CHAR_INFO[k].color}">
          <div class="cu-face"><img alt="" src="${this.portraits && this.portraits[k] || ''}"></div>
          <div class="cu-n">${CHAR_INFO[k].name}</div><div class="cu-d">${CHAR_INFO[k].desc}</div>
          <div class="cu-lv"><button data-k="${i}" data-d="-1">◀</button><b>${levels[i]}</b><button data-k="${i}" data-d="1">▶</button></div>
        </div>`).join('') + `</div>
        <div class="cu-btns"><button data-p="easy">Easy</button><button data-p="hard">Hard</button><button data-p="max">20/20/20/20</button><button class="cu-go" data-p="go">READY</button><button data-p="back">Back</button></div>`;
    };
    render();
    C.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.audio.play('btn');
      if (b.dataset.k != null) { const i = +b.dataset.k; levels[i] = Math.max(0, Math.min(20, levels[i] + +b.dataset.d)); render(); return; }
      const p = b.dataset.p;
      if (p === 'easy') levels.splice(0, 5, 2, 4, 4, 3, 0);
      if (p === 'hard') levels.splice(0, 5, 10, 14, 14, 12, 4);
      if (p === 'max') levels.splice(0, 5, 20, 20, 20, 20, 5);
      if (p === 'go') { C.onclick = null; this.emit('customGo', levels.slice()); return; }
      if (p === 'back') { C.onclick = null; this.emit('back'); return; }
      render();
    };
  }

  // ------------------------------------------------------------ settings
  showSettings(save, renderer) {
    this.hideAll();
    const S = this.settingsS; S.classList.remove('hidden');
    const st = save.d.settings;
    const render = () => {
      S.innerHTML = `<div class="p-box"><div class="p-t">SETTINGS</div>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-s="volume"></label>
        <label>Look speed <input type="range" min="0.4" max="2" step="0.1" value="${st.sens}" data-s="sens"></label>
        <div class="seg">Graphics: ${['low', 'medium', 'high'].map((q) => `<button data-q="${q}" class="${renderer.qualityName === q ? 'on' : ''}">${q}</button>`).join('')}</div>
        <label class="ck2"><input type="checkbox" data-s="reduceFlash" ${st.reduceFlash ? 'checked' : ''}> Reduce flashing</label>
        <div class="seg"><button data-r="reset">Reset progress</button></div>
        <button data-p="back">Back</button></div>`;
    };
    render();
    S.oninput = (e) => { const s = e.target.dataset.s; if (!s) return; st[s] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value; save.write(); this.emit('settings'); };
    S.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.q) { st.quality = b.dataset.q; save.write(); renderer.setQuality(b.dataset.q); render(); }
      if (b.dataset.r === 'reset') { if (b.dataset.sure) { Object.assign(save.d, { night: 1, beat5: false, beat6: false, beatCustom: false, maxMode: false }); save.write(); b.textContent = 'Progress reset'; } else { b.dataset.sure = 1; b.textContent = 'Tap again to confirm'; } }
      if (b.dataset.p === 'back') { S.onclick = null; S.oninput = null; this.emit('back'); }
    };
  }

  toast(t) { const e = this.toastEl; e.textContent = t; e.classList.remove('hidden'); clearTimeout(this.tt); this.tt = setTimeout(() => e.classList.add('hidden'), 2000); }
}
export { NIGHTS };
