// projectile.js — bullets for both the player and enemies. Movement + collision
// (world props, enemies, player) are resolved here against the live game state.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;

  class Projectile {
    constructor(x, y, angle, opts) {
      this.x = x; this.y = y;
      this.px = x; this.py = y;               // previous, for segment checks
      this.vx = Math.cos(angle) * opts.speed;
      this.vy = Math.sin(angle) * opts.speed;
      this.angle = angle;
      this.dmg = opts.damage;
      this.size = opts.size || 3;
      this.team = opts.team;                  // 'player' | 'enemy'
      this.range = opts.range || 500;
      this.pierce = opts.pierce || 0;
      this.traveled = 0;
      this.dead = false;
      this.hits = null;
      this.color = opts.color || (this.team === 'player' ? '#f0d98a' : '#e07a5f');
      this.trail = [];
    }

    update(dt, game) {
      this.px = this.x; this.py = this.y;
      const dx = this.vx * dt, dy = this.vy * dt;
      this.x += dx; this.y += dy;
      this.traveled += Math.hypot(dx, dy);
      if (this.traveled > this.range) { this.dead = true; return; }

      // world bounds
      if (this.x < 0 || this.y < 0 || this.x > game.level.w || this.y > game.level.h) {
        this.dead = true; return;
      }
      // solid props / breakable containers block bullets (chest-high cover)
      for (const s of game.level.solids) {
        const inside = this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + s.h;
        if (s.container) {
          if (s.container.opened || !inside) continue;
          if (this.team === 'player') s.container.hurt(this.dmg, this.angle, game);
          else game.particles.spark(this.x, this.y, this.angle);
          this.dead = true; return;
        }
        if (!s.blocksBullets || !inside) continue;
        game.particles.spark(this.x, this.y, this.angle);
        game.particles.dust(this.x, this.y, 3);
        this.dead = true; return;
      }

      if (this.team === 'player') {
        for (const e of game.enemies) {
          if (e.dead || (this.hits && this.hits.has(e))) continue;
          if (U.circleHit(this.x, this.y, this.size, e.x, e.y - e.hh * 0.4, e.r)) {
            e.hurt(this.dmg, this.angle, game);
            game.particles.blood(this.x, this.y, this.angle);
            if (this.pierce > 0) {
              this.pierce--;
              (this.hits || (this.hits = new Set())).add(e);
            } else { this.dead = true; return; }
          }
        }
      } else {
        const p = game.player;
        if (!p.dead && !p.invuln() &&
            U.circleHit(this.x, this.y, this.size, p.x, p.y - p.hh * 0.4, p.r)) {
          p.hurt(this.dmg, game);
          game.particles.blood(this.x, this.y, this.angle);
          this.dead = true; return;
        }
      }
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      // glow streak
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = this.color;
      ctx.fillRect(-8, -this.size, 8, this.size * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
      ctx.fillStyle = '#fff7e0';
      ctx.fillRect(-this.size * 0.4, -this.size * 0.4, this.size * 0.8, this.size * 0.8);
      ctx.restore();
    }
  }

  KTC.Projectile = Projectile;
})(window.KTC);
