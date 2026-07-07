// enemy.js — the crows. Every crow dies to a single bullet; the danger comes
// from volume and from slow, heavily telegraphed attacks you must read and
// dodge. Four archetypes:
//   rusher — knife melee, 0.55s raised-blade windup with a flash cue
//   gunman — stops and charges ~3s (glowing aim line), fires one slow bullet
//   sniper — hangs far back, ~5s charge with a tracking laser that LOCKS for
//            the final 0.8s (your dodge window), then a near-instant shot
//   brute  — big charger: 0.9s lean-back telegraph, then a straight-line
//            shoulder rush that hits for 2 hearts
// Plus the wave director that ramps spawn pressure with raid time and goes
// into a frenzy while the player is holding the extraction point.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;

  const STATS = {
    rusher: { speed: 86, r: 6, hh: 18, dmg: 1, windup: 0.55, reach: 20, cd: 0.9, gold: [1, 3] },
    gunman: { speed: 58, r: 6, hh: 18, keep: 190, charge: 3.0, recover: 1.5, ps: 260, pd: 1, gold: [2, 4] },
    sniper: { speed: 50, r: 6, hh: 18, keep: 340, charge: 5.0, lock: 0.8, recover: 2.0, ps: 900, pd: 1, gold: [3, 6] },
    brute:  { speed: 44, r: 9, hh: 24, dmg: 2, tele: 0.9, chargeSpeed: 250, chargeDur: 0.85, cd: 1.6, gold: [4, 8] },
  };

  class Enemy {
    constructor(x, y, type, tier) {
      const s = STATS[type];
      this.type = type;
      this.s = s;
      this.x = x; this.y = y;
      this.r = s.r; this.hh = s.hh;
      this.tier = tier || 1;
      this.aim = 0;
      this.walk = U.rand(0, U.TAU);
      this.dead = false;
      this.hurtT = 0;

      // shared attack-cycle state
      this.state = type === 'rusher' ? 'chase' : type === 'brute' ? 'stalk' : 'move';
      this.stateT = U.rand(0.4, 1.4);   // time left in the current state
      this.chargeP = 0;                 // 0..1 telegraph progress (ranged)
      this.lineX = 0; this.lineY = 0;   // aim-line endpoint (gunman/sniper)
      this.lastTick = -1;               // audio tick bookkeeping
      this.swing = 0;                   // rusher knife pose
      this.cdT = U.rand(0, 0.5);
      this.chargeDir = 0;               // brute rush direction
      this.hitDone = false;             // brute: one hit per rush
      this.strafeDir = U.chance(0.5) ? 1 : -1;

      // richer crows carry more; tier feeds loot, never durability
      this.goldDrop = U.randInt(s.gold[0], s.gold[1]) + Math.max(0, this.tier - 1);
      this.valuableChance = { sniper: 0.15, brute: 0.18 }[type] || 0.05;
    }

    // One bullet is always lethal.
    hurt(dmg, angle, game) {
      if (this.dead) return;
      KTC.Audio.hit();
      this.die(game, angle);
    }

    die(game, angle) {
      this.dead = true;
      const a = angle == null ? this.aim + Math.PI : angle;
      game.particles.blood(this.x, this.y - this.hh * 0.4, a);
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
      if (this.cdT > 0) this.cdT -= dt;

      const p = game.player;
      const d = U.dist(this.x, this.y, p.x, p.y);
      const canAct = !p.dead;
      let mvx = 0, mvy = 0, sp = this.s.speed;

      // charging attackers stand and face their mark; everyone else re-aims
      if (this.state !== 'charging') this.aim = U.angle(this.x, this.y, p.x, p.y);

      switch (this.type) {
        case 'rusher': ({ mvx, mvy } = this.updateRusher(dt, game, p, d, canAct)); break;
        case 'gunman': ({ mvx, mvy } = this.updateRanged(dt, game, p, d, canAct, false)); break;
        case 'sniper': ({ mvx, mvy } = this.updateRanged(dt, game, p, d, canAct, true)); break;
        case 'brute': ({ mvx, mvy, sp } = this.updateBrute(dt, game, p, d, canAct)); break;
      }

      // separation so crows don't stack into one point
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

      if (!canAct) { mvx = 0; mvy = 0; }
      this.x += mvx * sp * dt;
      this.y += mvy * sp * dt;
      if (mvx || mvy) this.walk += dt * 9;

      const bumped = this.resolveWorld(game);
      if (bumped && this.state === 'charging') this.endCharge(game, true);
      this.x = U.clamp(this.x, 8, game.level.w - 8);
      this.y = U.clamp(this.y, 8, game.level.h - 8);
    }

    // ---- rusher: chase → raised-knife windup → strike ----
    updateRusher(dt, game, p, d, canAct) {
      let mvx = 0, mvy = 0;
      if (this.state === 'chase') {
        if (canAct) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
        if (canAct && d < this.s.reach && this.cdT <= 0) {
          this.state = 'wind'; this.stateT = this.s.windup; this.swing = 0;
        }
      } else { // wind
        this.stateT -= dt;
        this.swing = 1 - this.stateT / this.s.windup;
        if (this.stateT <= 0) {
          // lunge + strike
          this.x += Math.cos(this.aim) * 6;
          this.y += Math.sin(this.aim) * 6;
          if (!p.dead && !p.invuln() && U.dist(this.x, this.y, p.x, p.y) < this.s.reach + p.r + 5) {
            p.hurt(this.s.dmg, game);
          }
          game.particles.dust(this.x + Math.cos(this.aim) * 12, this.y + Math.sin(this.aim) * 12, 3);
          this.state = 'chase'; this.cdT = this.s.cd; this.swing = 0;
        }
      }
      return { mvx, mvy };
    }

    // ---- gunman & sniper: reposition → standing charge → fire → recover ----
    updateRanged(dt, game, p, d, canAct, isSniper) {
      const s = this.s;
      let mvx = 0, mvy = 0;

      if (this.state === 'move' || this.state === 'recover') {
        // hold preferred distance, strafing when comfortable
        if (canAct) {
          if (d > s.keep + 40) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
          else if (d < s.keep - 40) { mvx = -Math.cos(this.aim); mvy = -Math.sin(this.aim); }
          else {
            mvx = Math.cos(this.aim + Math.PI / 2) * this.strafeDir;
            mvy = Math.sin(this.aim + Math.PI / 2) * this.strafeDir;
          }
          if (U.chance(dt * 0.4)) this.strafeDir *= -1;
        }
        this.stateT -= dt;
        if (this.stateT <= 0) {
          if (this.state === 'recover') {
            this.state = 'move'; this.stateT = U.rand(0.8, 1.6);
          } else if (canAct && d < s.keep + 160) {
            // begin the long, readable charge
            this.state = 'charge'; this.stateT = s.charge;
            this.chargeP = 0; this.lastTick = -1;
          } else {
            this.stateT = 0.5; // not in position yet, try again shortly
          }
        }
      } else if (this.state === 'charge') {
        // stand dead still — that stillness IS the tell
        this.stateT -= dt;
        this.chargeP = 1 - this.stateT / s.charge;

        const locking = isSniper && this.stateT <= s.lock;
        if (!locking) {
          // aim line tracks the player until the lock
          this.lineX = p.x; this.lineY = p.y - p.hh * 0.4;
        } else if (this.lastTick !== 'locked') {
          this.lastTick = 'locked';
          KTC.Audio.lockOn();       // the line freezes: dodge NOW
        }

        // rising ticks once per second of charge
        const tick = Math.floor(this.chargeP * s.charge);
        if (this.lastTick !== 'locked' && tick !== this.lastTick) {
          this.lastTick = tick;
          KTC.Audio.chargeTick(300 + 120 * tick + (isSniper ? 100 : 0));
        }

        if (this.stateT <= 0) {
          this.fire(game, isSniper);
          this.state = 'recover'; this.stateT = s.recover;
          this.chargeP = 0;
        }
      }
      return { mvx, mvy };
    }

    fire(game, isSniper) {
      const s = this.s;
      const oy = this.y - this.hh * 0.4;
      const a = U.angle(this.x, oy, this.lineX, this.lineY);
      const mx = this.x + Math.cos(a) * 12, my = oy + Math.sin(a) * 12;
      game.projectiles.push(new KTC.Projectile(mx, my, a, {
        speed: s.ps, damage: s.pd, size: isSniper ? 2.5 : 3, team: 'enemy',
        range: isSniper ? 760 : 460, color: isSniper ? '#ff6a55' : '#e07a5f',
      }));
      game.particles.spark(mx, my, a);
      KTC.Audio.shoot(isSniper ? 'rifle' : 'revolver');
    }

    // ---- brute: stalk → lean-back telegraph → straight-line rush ----
    updateBrute(dt, game, p, d, canAct) {
      let mvx = 0, mvy = 0, sp = this.s.speed;

      if (this.state === 'stalk') {
        if (canAct) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
        if (canAct && d < 190 && this.cdT <= 0) {
          this.state = 'tele'; this.stateT = this.s.tele;
          KTC.Audio.bruteRoar();
        }
      } else if (this.state === 'tele') {
        this.stateT -= dt;
        // kicked-up dust behind him while he digs in
        if (U.chance(dt * 18)) {
          game.particles.dust(this.x - Math.cos(this.aim) * 8, this.y - Math.sin(this.aim) * 4, 1);
        }
        if (this.stateT <= 0) {
          this.chargeDir = U.angle(this.x, this.y, p.x, p.y);  // locks at launch
          this.state = 'charging'; this.stateT = this.s.chargeDur;
          this.hitDone = false;
          game.particles.dust(this.x, this.y, 6);
        }
      } else if (this.state === 'charging') {
        this.stateT -= dt;
        this.aim = this.chargeDir;
        mvx = Math.cos(this.chargeDir); mvy = Math.sin(this.chargeDir);
        sp = this.s.chargeSpeed;
        if (U.chance(dt * 30)) game.particles.dust(this.x, this.y, 1);
        if (!this.hitDone && !p.dead && !p.invuln() &&
            U.circleHit(this.x, this.y, this.r + 3, p.x, p.y, p.r)) {
          this.hitDone = true;
          p.hurt(this.s.dmg, game);
        }
        if (this.stateT <= 0) this.endCharge(game, false);
      } else { // stagger
        this.stateT -= dt;
        if (this.stateT <= 0) { this.state = 'stalk'; this.cdT = this.s.cd; }
      }
      return { mvx, mvy, sp };
    }

    endCharge(game, slammed) {
      if (this.state !== 'charging') return;
      this.state = 'stagger';
      this.stateT = slammed ? 0.7 : 0.4;
      if (slammed) {
        game.particles.dust(this.x + Math.cos(this.chargeDir) * 8, this.y, 8);
        game.particles.shake(4, 0.2);
        KTC.Audio.hit();
      }
    }

    resolveWorld(game) {
      let bumped = false;
      for (const s of game.level.solids) {
        if (s.container && s.container.opened) continue;
        const push = U.circleRect(this.x, this.y, this.r, s.x, s.y, s.w, s.h);
        if (push) { this.x += push.x; this.y += push.y; bumped = true; }
      }
      return bumped;
    }

    render(ctx) {
      // telegraph aim line (gunman: amber, sniper: red laser), world space
      if (this.state === 'charge') {
        const s = this.s;
        const isSniper = this.type === 'sniper';
        const locking = isSniper && (1 - this.chargeP) * s.charge <= s.lock;
        let alpha = 0.10 + 0.4 * this.chargeP;
        if (locking && Math.floor(performance.now() / 60) % 2 === 0) alpha = 0.9;
        const oy = this.y - this.hh * 0.4;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = isSniper ? '#d13a2e' : '#d99a4e';
        ctx.lineWidth = isSniper ? 1 : 1.6;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(this.aim) * 12, oy + Math.sin(this.aim) * 12);
        ctx.lineTo(this.lineX, this.lineY);
        ctx.stroke();
        // muzzle glow grows with the charge
        ctx.globalAlpha = 0.3 + 0.5 * this.chargeP;
        ctx.fillStyle = isSniper ? '#ff8a70' : '#f0c070';
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(this.aim) * 12, oy + Math.sin(this.aim) * 12, 1 + 2.5 * this.chargeP, 0, U.TAU);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(this.x, this.y);
      const flip = Math.cos(this.aim) < 0 ? -1 : 1;
      if (this.type === 'brute') {
        if (this.state === 'tele') ctx.rotate(-0.14 * flip);       // lean back
        else if (this.state === 'charging') ctx.rotate(0.2 * flip); // lean in
      }
      // white flash right before a rusher strike
      if (this.type === 'rusher' && this.state === 'wind' && this.stateT < 0.16) {
        ctx.filter = 'brightness(2.6)';
      } else if (this.hurtT > 0) {
        ctx.filter = 'brightness(2.2) saturate(0.4)';
      }
      S.crow(ctx, {
        type: this.type, aim: this.aim, walk: this.walk,
        knife: this.type === 'rusher',
        gun: this.type === 'gunman' ? 'revolver' : this.type === 'sniper' ? 'sniper' : undefined,
        swing: this.swing * -0.9,
      });
      ctx.restore();
    }
  }

  // ---- wave director ----
  class Spawner {
    constructor() { this.t = 0; this.timer = 0.8; this.frenzy = false; }

    reset() { this.t = 0; this.timer = 0.8; this.frenzy = false; }

    difficulty() { return 1 + this.t / 45; }        // grows ~1 tier / 45s

    maxAlive(game) {
      const base = 6 + Math.floor(this.t / 16);
      return Math.min(this.frenzy ? base + 8 : base, 28) + game.raidsCleared;
    }

    pickType(game) {
      const d = this.difficulty();
      const r = Math.random();
      if (this.frenzy) return r < 0.7 ? 'rusher' : 'gunman';   // swarm favors pressure
      const snipers = game.enemies.filter((e) => e.type === 'sniper' && !e.dead).length;
      if (d > 1.8 && snipers < 2 && r < 0.14) return 'sniper';
      if (d > 2.4 && r < 0.26) return 'brute';
      if (d > 1.2 && r < 0.42) return 'gunman';
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
      this.frenzy = game.extract && game.extract.active !== false && !game.extract.done && game.extract.holding;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (game.enemies.length < this.maxAlive(game)) {
          const pt = this.spawnPoint(game);
          if (pt) {
            const type = this.pickType(game);
            const tier = Math.floor(this.difficulty());
            game.enemies.push(new Enemy(pt.x, pt.y, type, tier));
          }
        }
        let base = U.clamp(2.0 - this.t / 40, 0.5, 2.0);
        if (this.frenzy) base *= 0.4;
        this.timer = base * U.rand(0.7, 1.2);
      }
    }
  }

  KTC.Enemy = Enemy;
  KTC.Spawner = Spawner;
})(window.KTC);
