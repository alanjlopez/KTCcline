// audio.js — tiny WebAudio synthesizer. No sample files; every sound is
// generated. Safe to call before the audio context is unlocked (calls no-op
// until the first user gesture resumes it).
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const Audio = {
    ctx: null,
    master: null,
    muted: false,

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    },

    // Browsers require a gesture before audio plays; call on first click/key.
    unlock() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    volume: 0.35,
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : this.volume;
    },
    setVolume(v) {
      this.volume = v;
      if (this.master && !this.muted) this.master.gain.value = v;
    },

    _env(type, freq, dur, vol, sweep) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },

    _noise(dur, vol, filterFreq) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1800;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    },

    shoot(kind) {
      if (kind === 'shotgun') { this._noise(0.18, 0.6, 1400); this._env('square', 180, 0.18, 0.2, 60); }
      else if (kind === 'rifle') { this._noise(0.08, 0.4, 3000); this._env('square', 420, 0.09, 0.25, 120); }
      else if (kind === 'repeater') { this._noise(0.05, 0.25, 2600); this._env('square', 320, 0.05, 0.15, 140); }
      else { this._noise(0.09, 0.45, 2200); this._env('square', 260, 0.1, 0.22, 90); }
    },
    reload() { this._env('sine', 300, 0.05, 0.15, 500); setTimeout(() => this._env('sine', 500, 0.05, 0.12, 300), 90); },
    reloadDone() { this._env('triangle', 660, 0.08, 0.18, 880); },
    hit() { this._noise(0.06, 0.3, 1200); },
    enemyDie() { this._env('sawtooth', 200, 0.22, 0.22, 50); this._noise(0.12, 0.25, 900); },
    playerHurt() { this._env('sawtooth', 160, 0.28, 0.3, 40); },
    pickup() { this._env('triangle', 700, 0.08, 0.18, 1100); },
    coin() { this._env('triangle', 900, 0.06, 0.14, 1400); setTimeout(() => this._env('triangle', 1200, 0.05, 0.1, 1500), 50); },
    dodge() { this._noise(0.12, 0.2, 900); },
    extractTick() { this._env('sine', 520, 0.1, 0.16, 520); },
    // enemy telegraph cues
    chargeTick(freq) { this._env('sine', freq || 400, 0.08, 0.1, (freq || 400) * 1.15); },
    lockOn() { this._env('square', 980, 0.14, 0.16, 980); },
    bruteRoar() { this._env('sawtooth', 90, 0.5, 0.3, 45); this._noise(0.3, 0.2, 500); },
    // looting cues
    rustle() { this._noise(0.16, 0.18, 800); },
    denyFull() { this._env('square', 200, 0.09, 0.14, 150); setTimeout(() => this._env('square', 150, 0.12, 0.14, 110), 90); },
    // roguelike cues
    explosion() { this._noise(0.35, 0.6, 700); this._env('sawtooth', 120, 0.35, 0.3, 40); this._env('square', 70, 0.4, 0.25, 35); },
    zap() { this._env('square', 1400, 0.06, 0.14, 500); this._noise(0.05, 0.12, 4000); },
    trinket() { [660, 880, 1180].forEach((f, i) => setTimeout(() => this._env('triangle', f, 0.1, 0.18, f * 1.1), i * 70)); },
    showdown() { this._env('sawtooth', 320, 0.6, 0.28, 120); this._noise(0.5, 0.2, 600); setTimeout(() => this._env('triangle', 523, 0.3, 0.2, 784), 120); },
    // base / crafting cues
    craft() { this._env('square', 180, 0.06, 0.16, 140); setTimeout(() => this._noise(0.1, 0.2, 1600), 60); setTimeout(() => this._env('triangle', 660, 0.12, 0.16, 880), 120); },
    heartbeat() { this._env('sine', 90, 0.12, 0.3, 60); setTimeout(() => this._env('sine', 80, 0.14, 0.24, 55), 150); },
    perfect() { this._env('triangle', 880, 0.06, 0.18, 1320); setTimeout(() => this._env('triangle', 1320, 0.08, 0.16, 1600), 60); },
    extractDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._env('triangle', f, 0.16, 0.2, f), i * 90)); },
    death() { [330, 262, 196, 130].forEach((f, i) => setTimeout(() => this._env('sawtooth', f, 0.25, 0.22, f * 0.8), i * 130)); },
    click() { this._env('square', 220, 0.03, 0.1, 180); },
  };

  // ---- reactive music: layered, synthesized loops on a look-ahead scheduler ----
  // A slow bass/pad bed always plays; percussion and a lead fade in with the
  // raid's `intensity` (threat). Boss mode swaps in a darker, tenser bed. All
  // routed through a music gain under the master, so global mute/volume apply.
  const Music = {
    playing: false, mode: 'menu', intensity: 0, vol: 0.5, muted: false,
    gain: null, tempo: 104, step: 0, nextT: 0, timer: null, lookahead: 0.12,

    _ensure() {
      if (!Audio.ctx) return false;
      if (!this.gain) { this.gain = Audio.ctx.createGain(); this.gain.gain.value = this.muted ? 0 : this.vol; this.gain.connect(Audio.master); }
      return true;
    },
    start(mode) {
      if (mode) this.mode = mode;
      if (!this._ensure() || this.playing) return;
      this.playing = true; this.step = 0;
      this.nextT = Audio.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this._sched(), 25);
    },
    stop() { this.playing = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } },
    setMode(m) { this.mode = m; },
    setIntensity(x) { this.intensity = Math.max(0, Math.min(1, x)); },
    setVolume(v) { this.vol = v; if (this.gain) this.gain.gain.value = this.muted ? 0 : v; },
    setMuted(m) { this.muted = m; if (this.gain) this.gain.gain.value = m ? 0 : this.vol; },

    _note(type, freq, t, dur, vol, glideTo) {
      const c = Audio.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + dur + 0.03);
    },
    _hat(t, vol) {
      const c = Audio.ctx; if (!c) return;
      const n = Math.floor(c.sampleRate * 0.03), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.value = vol;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
      src.connect(f); f.connect(g); g.connect(this.gain); src.start(t);
    },
    _sched() {
      const c = Audio.ctx; if (!c || !this.playing) return;
      if (c.state !== 'running') { this.nextT = c.currentTime + 0.1; return; }
      const stepDur = 60 / this.tempo / 4;   // sixteenth notes
      while (this.nextT < c.currentTime + this.lookahead) {
        this._step(this.step, this.nextT, stepDur);
        this.nextT += stepDur; this.step = (this.step + 1) % 32;
      }
    },
    _step(s, t, dur) {
      const boss = this.mode === 'boss';
      const calm = this.mode === 'base' || this.mode === 'menu';
      // a wandering minor progression, one root per bar (8 sixteenths)
      const prog = boss ? [43.65, 46.25, 55.00, 51.91] : calm ? [65.41, 49.00, 73.42, 55.00] : [55.00, 65.41, 49.00, 73.42];
      const root = prog[Math.floor(s / 8) % 4];
      if (s % 4 === 0) this._note('triangle', root, t, dur * 3.6, 0.5, root);      // bassline
      if (s % 8 === 0) this._note('sine', root * 2, t, dur * 7, 0.16);            // pad
      if (boss && s % 8 === 4) this._note('sawtooth', root * 1.5, t, dur * 3, 0.16, root * 1.4);
      if (!calm) {
        const it = this.intensity;
        if (it > 0.12 && s % 4 === 0) this._note('sine', 58, t, 0.13, 0.55 * it, 30);   // kick
        if (it > 0.38 && s % 2 === 1) this._hat(t, 0.05 * it);                          // hat
        if (it > 0.62 && s % 8 === 6) this._note('square', root * 4, t, dur * 1.4, 0.11 * it, root * 4);  // lead
      }
    },
    // one-shot musical stings that duck under nothing (they ride the music bus)
    sting(name) {
      if (!this._ensure() || !Audio.ctx || Audio.ctx.state !== 'running') return;
      const t = Audio.ctx.currentTime;
      if (name === 'extract') [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._note('triangle', f, t + i * 0.09, 0.24, 0.32));
      else if (name === 'boss') [110, 116.5, 174.6].forEach((f, i) => this._note('sawtooth', f, t + i * 0.12, 0.5, 0.28));
    },
  };
  Audio.Music = Music;

  KTC.Audio = Audio;
})(window.KTC);
