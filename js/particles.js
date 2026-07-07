// particles.js — lightweight particle pool, floating combat text, and screen
// shake. All world-space; drawn by the game after the camera transform.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;

  class Particles {
    constructor() {
      this.list = [];
      this.texts = [];
      this.decals = [];     // permanent-ish blood/dust marks baked lazily
      this.shakeT = 0;
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    shake(mag, dur = 0.25) {
      // Take the stronger of current vs incoming so big hits still register.
      if (mag > this.shakeMag) this.shakeMag = mag;
      this.shakeT = Math.max(this.shakeT, dur);
    }

    spawn(x, y, opts) {
      this.list.push({
        x, y,
        vx: opts.vx || 0, vy: opts.vy || 0,
        life: opts.life || 0.4, max: opts.life || 0.4,
        size: opts.size || 2,
        color: opts.color || '#fff',
        drag: opts.drag == null ? 0.9 : opts.drag,
        grav: opts.grav || 0,
        fade: opts.fade !== false,
      });
    }

    burst(x, y, n, opts) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU);
        const s = U.rand(opts.speedMin || 20, opts.speedMax || 80);
        this.spawn(x, y, {
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: U.rand(opts.lifeMin || 0.2, opts.lifeMax || 0.5),
          size: opts.size || U.randInt(1, 3),
          color: Array.isArray(opts.color) ? U.pick(opts.color) : opts.color,
          drag: opts.drag, grav: opts.grav,
        });
      }
    }

    blood(x, y, dir) {
      this.burst(x, y, 8, {
        color: [KTC.Sprites.PAL.blood, KTC.Sprites.PAL.bloodDark, '#8a2a24'],
        speedMin: 30, speedMax: 130, lifeMin: 0.2, lifeMax: 0.55, size: 2,
      });
      // a couple of directional streaks
      for (let i = 0; i < 4; i++) {
        this.spawn(x, y, {
          vx: Math.cos(dir) * U.rand(60, 160) + U.rand(-20, 20),
          vy: Math.sin(dir) * U.rand(60, 160) + U.rand(-20, 20),
          life: U.rand(0.3, 0.6), size: 2, color: KTC.Sprites.PAL.blood,
        });
      }
    }

    dust(x, y, n = 5) {
      this.burst(x, y, n, {
        color: ['#6b6153', '#585044', '#7a6f5e'],
        speedMin: 8, speedMax: 45, lifeMin: 0.25, lifeMax: 0.55, size: 2, drag: 0.86,
      });
    }

    spark(x, y, dir) {
      this.burst(x, y, 6, {
        color: ['#e3c06a', '#f4e2a0', '#c98b3a'],
        speedMin: 40, speedMax: 150, lifeMin: 0.1, lifeMax: 0.3, size: 1,
      });
    }

    text(x, y, str, color = '#e8e0cf', opts = {}) {
      this.texts.push({
        x, y, str, color,
        life: opts.life || 0.9, max: opts.life || 0.9,
        vy: opts.vy || -26, size: opts.size || 7,
      });
    }

    update(dt) {
      // shake decay
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const m = this.shakeMag * Math.max(0, this.shakeT / 0.25);
        this.shakeX = U.rand(-m, m);
        this.shakeY = U.rand(-m, m);
        if (this.shakeT <= 0) { this.shakeMag = 0; this.shakeX = this.shakeY = 0; }
      }

      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) { this.list.splice(i, 1); continue; }
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        if (t.life <= 0) { this.texts.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.vy *= 0.92;
      }
    }

    render(ctx) {
      for (const p of this.list) {
        ctx.globalAlpha = p.fade ? U.clamp(p.life / p.max, 0, 1) : 1;
        ctx.fillStyle = p.color;
        const s = p.size;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    renderText(ctx) {
      for (const t of this.texts) {
        const a = U.clamp(t.life / t.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.font = `${t.size}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(t.str, t.x + 0.6, t.y + 0.6);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    clear() {
      this.list.length = 0;
      this.texts.length = 0;
      this.shakeT = 0; this.shakeMag = 0; this.shakeX = 0; this.shakeY = 0;
    }
  }

  KTC.Particles = Particles;
})(window.KTC);
