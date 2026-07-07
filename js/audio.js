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

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.35;
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
    extractDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._env('triangle', f, 0.16, 0.2, f), i * 90)); },
    death() { [330, 262, 196, 130].forEach((f, i) => setTimeout(() => this._env('sawtooth', f, 0.25, 0.22, f * 0.8), i * 130)); },
    click() { this._env('square', 220, 0.03, 0.1, 180); },
  };

  KTC.Audio = Audio;
})(window.KTC);
