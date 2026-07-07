// projectile.js — bullets for both the player and enemies. Movement + collision
// (world props, enemies, player) are resolved here against the live game state.
// One bullet kills one crow, so a hit always removes the bullet.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;

  class Projectile {
    constructor(x, y, angle, opts) {
      this.x = x; this.y = y;
      this.vx = Math.cos(angle) * opts.speed;
      this.vy = Math.sin(angle) * opts.speed;
      this.angle = angle;
      this.dmg = opts.damage || 1;
      this.size = opts.size || 3;
      this.team = opts.team;                  // 'player' | 'enemy'
      this.range = opts.range || 500;
      this.traveled = 0;
      this.dead = false;
      this.color = opts.color || (this.team === 'player' ? '#f0d98a' : '#e07a5f');
    }

    update(dt, game) {
      const dx = this.vx * dt, dy = this.vy * dt;
      this.x += dx; this.y += dy;
      this.traveled += Math.hypot(dx, dy);
      if (this.traveled > this.range) { this.dead = true; return; }

      // world bounds
      if (this.x < 0 || this.y < 0 || this.x > game.level.w || this.y > game.level.h) {
        this.dead = true; return;
      }
      // solid props and closed containers are chest-high cover that eats bullets
      for (const s of game.level.solids) {
        if (s.container ? s.container.opened : !s.blocksBullets) continue;
        if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + s.h) {
          game.particles.spark(this.x, this.y, this.angle);
          game.particles.dust(this.x, this.y, 3);
          this.dead = true; return;
        }
      }

      if (this.team === 'player') {
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (U.circleHit(this.x, this.y, this.size, e.x, e.y - e.hh * 0.4, e.r)) {
            e.hurt(this.dmg, this.angle, game);
            game.particles.blood(this.x, this.y, this.angle);
            this.dead = true; return;
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
