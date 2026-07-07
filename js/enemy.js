// enemy.js — the crows. Three archetypes (melee rusher, ranged gunman, heavy
// brute) plus a wave director that ramps spawn pressure with raid time and goes
// into a frenzy while the player is holding the extraction point.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;

  const STATS = {
    rusher: { hp: 42, speed: 82, r: 6, hh: 18, dmg: 1, windup: 0.34, reach: 20, cd: 0.9, gold: [1, 3], mass: 1 },
    gunman: { hp: 30, speed: 58, r: 6, hh: 18, dmg: 1, keep: 190, fire: 1.7, ps: 250, pd: 1, gold: [2, 4], mass: 1 },
    brute:  { hp: 130, speed: 44, r: 9, hh: 24, dmg: 2, windup: 0.5, reach: 26, cd: 1.3, gold: [4, 8], mass: 2.4, val: 0.18 },
  };

  class Enemy {
    constructor(x, y, type, tier) {
      const s = STATS[type];
      this.type = type;
      this.x = x; this.y = y;
      this.r = s.r; this.hh = s.hh;
      this.tier = tier || 1;
      this.maxHp = Math.round(s.hp * (1 + (this.tier - 1) * 0.18));
      this.hp = this.maxHp;
      this.speed = s.speed;
      this.dmg = s.dmg;
      this.s = s;
      this.aim = 0;
      this.walk = U.rand(0, U.TAU);
      this.dead = false;
      this.hurtT = 0;
      this.kbx = 0; this.kby = 0;             // knockback velocity
      this.state = 'chase';
      this.windT = 0;
      this.cdT = U.rand(0, 0.5);
      this.swing = 0;
      this.goldDrop = U.randInt(s.gold[0], s.gold[1]);
      this.valuableChance = s.val || 0.05;
      this.strafeDir = U.chance(0.5) ? 1 : -1;
      this.flashScore = 10;
    }

    hurt(dmg, angle, game) {
      if (this.dead) return;
      this.hp -= dmg;
      this.hurtT = 0.09;
      const kb = 120 / this.s.mass;
      this.kbx += Math.cos(angle) * kb;
      this.kby += Math.sin(angle) * kb;
      KTC.Audio.hit();
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      this.dead = true;
      game.particles.blood(this.x, this.y - this.hh * 0.4, this.aim);
      game.particles.burst(this.x, this.y - 6, 10, {
        color: [S.PAL.blood, S.PAL.bloodDark], speedMin: 20, speedMax: 120,
        lifeMin: 0.25, lifeMax: 0.6, size: 2, grav: 200,
      });
      game.particles.shake(this.type === 'brute' ? 6 : 2.5, 0.18);
      KTC.Audio.enemyDie();
      KTC.Loot.dropFromEnemy(game, this.x, this.y, this);
      game.onEnemyKilled(this);
    }

    update(dt, game) {
      if (this.hurtT > 0) this.hurtT -= dt;
      // apply + decay knockback
      this.x += this.kbx * dt; this.y += this.kby * dt;
      this.kbx *= Math.pow(0.02, dt); this.kby *= Math.pow(0.02, dt);

      const p = game.player;
      const d = U.dist(this.x, this.y, p.x, p.y);
      this.aim = U.angle(this.x, this.y, p.x, p.y);

      let mvx = 0, mvy = 0;
      const canAct = !p.dead;

      if (this.type === 'gunman') {
        // strafe to keep preferred distance and take pot-shots
        if (canAct) {
          if (d > this.s.keep + 30) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
          else if (d < this.s.keep - 30) { mvx = -Math.cos(this.aim); mvy = -Math.sin(this.aim); }
          else {
            mvx = Math.cos(this.aim + Math.PI / 2) * this.strafeDir;
            mvy = Math.sin(this.aim + Math.PI / 2) * this.strafeDir;
          }
          this.cdT -= dt;
          if (this.cdT <= 0 && d < 420) {
            this.cdT = this.s.fire * U.rand(0.85, 1.15);
            this.fire(game, p);
          }
          if (U.chance(dt * 0.4)) this.strafeDir *= -1;
        }
      } else {
        // melee: close in, wind up, strike
        if (this.state === 'chase') {
          if (canAct) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
          if (canAct && d < this.s.reach && this.cdT <= 0) {
            this.state = 'wind'; this.windT = this.s.windup; this.swing = 0;
          }
        } else if (this.state === 'wind') {
          this.windT -= dt;
          this.swing = 1 - this.windT / this.s.windup;
          mvx = Math.cos(this.aim) * 0.25; mvy = Math.sin(this.aim) * 0.25;
          if (this.windT <= 0) {
            // strike
            if (!p.dead && !p.invuln() && U.dist(this.x, this.y, p.x, p.y) < this.s.reach + p.r + 4) {
              p.hurt(this.dmg, game);
            }
            game.particles.dust(this.x + Math.cos(this.aim) * 12, this.y + Math.sin(this.aim) * 12, 3);
            this.state = 'chase'; this.cdT = this.s.cd; this.swing = 0;
          }
        }
      }
      if (this.cdT > 0) this.cdT -= dt;

      // separation from other enemies so they don't stack into a single point
      for (const o of game.enemies) {
        if (o === this || o.dead) continue;
        const dd = U.dist2(this.x, this.y, o.x, o.y);
        const min = this.r + o.r;
        if (dd < min * min && dd > 0.001) {
          const dist = Math.sqrt(dd);
          const push = (min - dist) / dist;
          this.x += (this.x - o.x) * push * 0.5;
          this.y += (this.y - o.y) * push * 0.5;
        }
      }

      const sp = this.speed * (canAct ? 1 : 0);
      this.x += mvx * sp * dt;
      this.y += mvy * sp * dt;
      if (mvx || mvy) this.walk += dt * 9;

      this.resolveWorld(game);
      // keep in bounds
      this.x = U.clamp(this.x, 8, game.level.w - 8);
      this.y = U.clamp(this.y, 8, game.level.h - 8);
    }

    resolveWorld(game) {
      for (const s of game.level.solids) {
        if (s.container && s.container.opened) continue;
        const push = U.circleRect(this.x, this.y, this.r, s.x, s.y, s.w, s.h);
        if (push) { this.x += push.x; this.y += push.y; }
      }
    }

    fire(game, p) {
      const lead = 0.12;
      const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
      const a = U.angle(this.x, this.y - this.hh * 0.4, tx, ty - p.hh * 0.4) + U.rand(-0.06, 0.06);
      game.projectiles.push(new KTC.Projectile(this.x, this.y - this.hh * 0.4, a, {
        speed: this.s.ps, damage: this.s.pd, size: 3, team: 'enemy', range: 460, color: '#e07a5f',
      }));
      game.particles.spark(this.x + Math.cos(a) * 10, this.y - this.hh * 0.4 + Math.sin(a) * 10, a);
      KTC.Audio.shoot('rifle');
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.hurtT > 0) ctx.filter = 'brightness(2.2) saturate(0.4)';
      S.crow(ctx, { type: this.type, aim: this.aim, walk: this.walk, knife: this.type !== 'gunman', gun: this.type === 'gunman' ? 'rifle' : undefined, swing: this.swing * -0.9 });
      ctx.restore();

      // health pip for tougher enemies
      if (!this.dead && this.hp < this.maxHp && this.type !== 'rusher') {
        const w = this.type === 'brute' ? 22 : 14;
        const top = this.y - this.hh - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(this.x - w / 2 - 1, top - 1, w + 2, 4);
        ctx.fillStyle = '#7c2f2c';
        ctx.fillRect(this.x - w / 2, top, w * (this.hp / this.maxHp), 2);
      }
    }
  }

  // ---- wave director ----
  class Spawner {
    constructor() { this.t = 0; this.timer = 1.2; this.frenzy = false; }

    reset() { this.t = 0; this.timer = 1.2; this.frenzy = false; }

    difficulty() { return 1 + this.t / 45; }        // grows ~1 tier / 45s

    maxAlive(game) {
      const base = 5 + Math.floor(this.t / 18);
      return Math.min(this.frenzy ? base + 8 : base, 26) + game.raidsCleared;
    }

    pickType() {
      const d = this.difficulty();
      const r = Math.random();
      if (d > 2.2 && r < 0.16) return 'brute';
      if (d > 1.3 && r < 0.45) return 'gunman';
      return 'rusher';
    }

    spawnPoint(game) {
      const p = game.player;
      for (let tries = 0; tries < 24; tries++) {
        const x = U.rand(30, game.level.w - 30);
        const y = U.rand(30, game.level.h - 30);
        if (U.dist(x, y, p.x, p.y) < 260) continue;      // not on top of player
        let blocked = false;
        for (const s of game.level.solids) {
          if (x > s.x - 6 && x < s.x + s.w + 6 && y > s.y - 6 && y < s.y + s.h + 6) { blocked = true; break; }
        }
        if (!blocked) return { x, y };
      }
      return null;
    }

    update(dt, game) {
      this.t += dt;
      this.frenzy = game.extract && game.extract.active && game.extract.holding;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (game.enemies.length < this.maxAlive(game)) {
          const pt = this.spawnPoint(game);
          if (pt) {
            const type = this.pickType();
            const tier = Math.floor(this.difficulty());
            game.enemies.push(new Enemy(pt.x, pt.y, type, tier));
          }
        }
        let base = U.clamp(2.2 - this.t / 40, 0.55, 2.2);
        if (this.frenzy) base *= 0.4;
        this.timer = base * U.rand(0.7, 1.2);
      }
    }
  }

  KTC.Enemy = Enemy;
  KTC.Spawner = Spawner;
})(window.KTC);
