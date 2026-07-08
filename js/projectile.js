// projectile.js — bullets for the player and enemies, rendered as fast tapered
// tracer trails (à la the original). One bullet kills one crow, but behaviors
// granted by weapons AND trinket mods — pierce, ricochet, explosive, homing,
// chain lightning — let a single shot do a lot more. These stack, which is the
// whole point of the roguelike layer.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;

  const TRAIL_MAX = 7;

  class Projectile {
    constructor(x, y, angle, opts) {
      this.x = x; this.y = y;
      this.angle = angle;
      this.speed = opts.speed;
      this.vx = Math.cos(angle) * opts.speed;
      this.vy = Math.sin(angle) * opts.speed;
      this.dmg = opts.damage || 1;
      this.size = opts.size || 3;
      this.team = opts.team;                  // 'player' | 'enemy'
      this.range = opts.range || 500;
      this.traveled = 0;
      this.dead = false;

      // behaviors (0/false = off) — the fun stuff
      this.pierce = opts.pierce || 0;
      this.bounces = opts.bounces || 0;
      this.explosive = opts.explosive || 0;   // blast radius on impact
      this.homing = opts.homing || 0;         // steering rate (rad/sec)
      this.chain = opts.chain || 0;           // lightning jumps on hit
      this.knockback = opts.knockback || 0;   // shove survivors (shielders/boss)
      this.burn = opts.burn || 0;             // ignite the crow (seconds)
      this.mark = opts.mark || 0;             // brand it: amplified, richer kill
      this.crit = opts.crit || false;

      this.hits = new Set();                  // enemies already struck
      this.trail = [{ x, y }];
      this.color = opts.color || (this.team === 'player' ? '#f6e2a0' : '#e07a5f');
    }

    update(dt, game) {
      // enemy bullets crawl during a showdown; player bullets never slow
      const scale = this.team === 'enemy' ? game.enemyScale : 1;
      const step = dt * scale;

      // homing: steer toward the nearest live crow
      if (this.homing > 0 && this.team === 'player') {
        const t = this.nearestEnemy(game, 260);
        if (t) {
          const want = U.angle(this.x, this.y, t.x, t.y - t.hh * 0.4);
          const d = U.angleDiff(this.angle, want);
          this.angle += U.clamp(d, -this.homing * step, this.homing * step);
          this.vx = Math.cos(this.angle) * this.speed;
          this.vy = Math.sin(this.angle) * this.speed;
        }
      }

      const dx = this.vx * step, dy = this.vy * step;
      this.x += dx; this.y += dy;
      this.traveled += Math.hypot(dx, dy);

      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > TRAIL_MAX) this.trail.shift();

      if (this.traveled > this.range) { this.expire(game); return; }
      if (this.x < 0 || this.y < 0 || this.x > game.level.w || this.y > game.level.h) {
        this.expire(game); return;
      }

      // solid props / closed containers — reflect if we can bounce, else stop
      for (const s of game.level.solids) {
        if (s.container ? s.container.opened : !s.blocksBullets) continue;
        if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + s.h) {
          if (this.bounces > 0 && !this.explosive) {
            this.bounces--;
            // reflect off whichever face we crossed
            if (this.x - this.vx * step <= s.x || this.x - this.vx * step >= s.x + s.w) this.vx = -this.vx;
            else this.vy = -this.vy;
            this.angle = Math.atan2(this.vy, this.vx);
            this.x += this.vx * step; this.y += this.vy * step;
            game.particles.spark(this.x, this.y, this.angle);
            return;
          }
          game.particles.spark(this.x, this.y, this.angle);
          game.particles.dust(this.x, this.y, 3);
          this.expire(game); return;
        }
      }

      if (this.team === 'player') {
        for (const e of game.enemies) {
          if (e.dead || this.hits.has(e)) continue;
          if (U.circleHit(this.x, this.y, this.size + 1, e.x, e.y - e.hh * 0.4, e.r)) {
            this.onEnemyHit(e, game);
            if (this.dead) return;
          }
        }
      } else {
        const p = game.player;
        if (!p.dead && !p.invuln() &&
            U.circleHit(this.x, this.y, this.size + 1, p.x, p.y - p.hh * 0.4, p.r)) {
          p.hurt(this.dmg, game, this.x, this.y);
          game.particles.blood(this.x, this.y, this.angle);
          this.dead = true;
        }
      }
    }

    onEnemyHit(e, game) {
      this.hits.add(e);
      if (this.explosive > 0) {
        game.explode(this.x, this.y, this.explosive, this.crit, this.knockback);
        this.dead = true;
        return;
      }
      // brand / ignite BEFORE the killing blow so the death carries the status
      if (this.mark > 0) e.applyStatus('mark', this.mark);
      if (this.burn > 0) e.applyStatus('burn', this.burn);
      e.hurt(this.dmg, this.angle, game, this.crit);
      // knockback only reads on survivors — shielders blocking, bosses, the rival
      if (this.knockback > 0 && !e.dead) {
        const kb = this.knockback / (e.s.mass || 1);
        e.x += Math.cos(this.angle) * kb; e.y += Math.sin(this.angle) * kb;
      }
      game.particles.blood(this.x, this.y, this.angle);
      if (this.chain > 0) game.chainLightning(e.x, e.y - e.hh * 0.4, this.chain, this.hits, this.crit);

      if (this.pierce > 0) { this.pierce--; return; }          // keep going
      if (this.bounces > 0) {                                    // seek a new mark
        const t = this.nearestEnemy(game, 240, this.hits);
        if (t) {
          this.bounces--;
          this.angle = U.angle(this.x, this.y, t.x, t.y - t.hh * 0.4);
          this.vx = Math.cos(this.angle) * this.speed;
          this.vy = Math.sin(this.angle) * this.speed;
          return;
        }
      }
      this.dead = true;
    }

    expire(game) {
      if (this.explosive > 0 && this.team === 'player') game.explode(this.x, this.y, this.explosive, this.crit);
      this.dead = true;
    }

    nearestEnemy(game, maxDist, exclude) {
      let best = null, bd = maxDist * maxDist;
      for (const e of game.enemies) {
        if (e.dead || (exclude && exclude.has(e))) continue;
        const d = U.dist2(this.x, this.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    render(ctx) {
      // tapered fading tracer along the recent path
      const tr = this.trail;
      const n = tr.length;
      for (let i = 1; i < n; i++) {
        const a = i / n;
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * a * 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
      // hot head
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.crit ? '#fff' : '#fff7e0';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (this.crit ? 1.1 : 0.85), 0, U.TAU);
      ctx.fill();
      if (this.crit) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#e3c06a';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size + 1.5, 0, U.TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }
  }

  KTC.Projectile = Projectile;
})(window.KTC);
