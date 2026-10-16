// The Phone Guy's recorded voice: real audio files (processed to sound like an old phone line),
// embedded in the build as data URIs. Played through WebAudio so it works on iPhone Safari.
export class PhoneVoice {
  constructor(audio) { this.audio = audio; this.buffers = {}; this.src = null; }
  has(night) { return !!(window.__VOICE && window.__VOICE[night]); }
  async load(night) {
    if (this.buffers[night]) return this.buffers[night];
    const A = this.audio; if (!A.ctx || !this.has(night)) return null;
    try {
      const b64 = window.__VOICE[night].split(',')[1];
      const bin = atob(b64), arr = new ArrayBuffer(bin.length), u8 = new Uint8Array(arr);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const buf = await new Promise((ok, bad) => A.ctx.decodeAudioData(arr, ok, bad)); // callback form for older Safari
      this.buffers[night] = buf;
      return buf;
    } catch (e) { console.warn('voice load', e); return null; }
  }
  // returns the clip duration (seconds) or 0 if there is no recording
  async play(night) {
    const A = this.audio, buf = await this.load(night);
    if (!buf) return 0;
    this.stop();
    const ctx = A.ctx;
    const s = ctx.createBufferSource(); s.buffer = buf;
    // the desk phone's little speaker: a touch of room and a slight upper-mid bump
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1800; peak.Q.value = 0.8; peak.gain.value = 3;
    const g = ctx.createGain(); g.gain.value = 1.15;
    s.connect(peak); peak.connect(g);
    const out = A.out('voice', { x: 0, z: -0.8 }, { reverb: 0.12 });
    g.connect(out);
    s.start();
    this.src = s;
    return buf.duration;
  }
  stop() { if (this.src) { try { this.src.stop(); } catch (_) { /* already stopped */ } this.src = null; } }
}
