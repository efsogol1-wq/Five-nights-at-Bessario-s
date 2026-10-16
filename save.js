// Save data (localStorage, guarded so private mode still works)
const KEY = 'fnab_save_v1';
export const DEFAULTS = { night: 1, beat5: false, beat6: false, beatCustom: false, maxMode: false, settings: { volume: 0.9, quality: null, sens: 1, reduceFlash: false } };

export class Save {
  constructor() {
    this.d = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const x = JSON.parse(raw); this.d = { ...this.d, ...x, settings: { ...this.d.settings, ...(x.settings || {}) } }; }
    } catch (_) { /* ignore */ }
  }
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (_) { /* ignore */ } }
  get stars() { return (this.d.beat5 ? 1 : 0) + (this.d.beat6 ? 1 : 0) + (this.d.maxMode ? 1 : 0); }
}
