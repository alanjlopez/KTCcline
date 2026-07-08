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
    // v2 archetypes
    shielder: { speed: 50, r: 7, hh: 20, dmg: 1, windup: 0.5, reach: 22, cd: 1.0, turn: 1.7, gold: [3, 6] },  // frontal shield — must flank
    bomber:   { speed: 98, r: 6, hh: 15, dmg: 2, fuse: 0.75, blast: 42, gold: [2, 4] },                       // kamikaze, explodes on death
    coyote:   { speed: 132, r: 5, hh: 11, dmg: 1, windup: 0.24, reach: 15, cd: 0.6, gold: [1, 2] },           // fast beast, hunts in packs
    boss:     { speed: 42, r: 14, hh: 34, dmg: 2, hp: 18, gold: [40, 60], mass: 4 },                          // the exception to one-shot
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
      this.facing = U.rand(0, U.TAU);   // shielder shield direction (turns slowly)
      this._boomed = false;             // bomber detonation guard

      // status effects (timers, seconds). stun freezes AI; burn/mark are wired
      // further in the status pass. Trinkets/attacks apply these via applyStatus.
      this.status = { burn: 0, stun: 0, mark: 0 };
      this._burnTick = 0;

      // bosses are the one exception to one-shot kills
      this.boss = type === 'boss';
      if (this.boss) { this.maxHp = s.hp + (this.tier - 1) * 3; this.hp = this.maxHp; this.bossT = 2; this.r = s.r; }
      if (type === 'bomber') this.state = 'chase';
      if (type === 'coyote') this.state = 'chase';
      if (type === 'shielder') this.state = 'chase';
      if (this.boss) this.state = 'boss';

      // richer crows carry more; tier feeds loot, never durability
      this.goldDrop = U.randInt(s.gold[0], s.gold[1]) + Math.max(0, this.tier - 1);
      this.valuableChance = { sniper: 0.15, brute: 0.18, shielder: 0.1, boss: 1 }[type] || 0.05;
    }

    // One bullet is lethal — except a shielder hit from the front (blocked) or
    // a boss (real HP).
    hurt(dmg, angle, game, crit) {
      if (this.dead) return;
      if (this.type === 'shielder' && angle != null) {
        const fromDir = angle + Math.PI;   // direction the shot came from
        if (Math.abs(U.angleDiff(this.facing, fromDir)) < 1.0) {
          this.hurtT = 0.06;
          game.particles.spark(this.x + Math.cos(this.facing) * 12, this.y - this.hh * 0.4 + Math.sin(this.facing) * 12, this.facing);
          KTC.Audio.hit();
          return;                          // blocked — flank it
        }
      }
      if (this.boss) {
        this.hp -= dmg; this.hurtT = 0.09; KTC.Audio.hit();
        if (this.hp <= 0) this.die(game, angle, crit);
        return;
      }
      KTC.Audio.hit();
      this.die(game, angle, crit);
    }

    die(game, angle, crit) {
      this.dead = true;
      const a = angle == null ? this.aim + Math.PI : angle;
      // a crow that dies on fire sets its neighbours alight — fire spreads
      if (this._wasBurning) this.igniteNeighbours(game);
      // a bomber detonates when it dies (guard against the blast re-killing it)
      if (this.type === 'bomber' && !this._boomed) { this._boomed = true; game.explode(this.x, this.y - this.hh * 0.4, this.s.blast, false); }
      game.particles.blood(this.x, this.y - this.hh * 0.4, a);
      game.particles.burst(this.x, this.y - 6, this.boss ? 26 : 10, {
        color: [S.PAL.blood, S.PAL.bloodDark], speedMin: 20, speedMax: this.boss ? 200 : 120,
        lifeMin: 0.25, lifeMax: 0.6, size: 2, grav: 200,
      });
      game.particles.shake(this.boss ? 11 : this.type === 'brute' ? 6 : 2.5, this.boss ? 0.6 : 0.18);
      KTC.Audio.enemyDie();
      if (this.boss) {
        // guaranteed rare trinket + a haul of materials
        const rares = KTC.Trinkets.order.filter((id) => KTC.Trinkets.get(id).rarity === 'rare');
        game.pickups.push(new KTC.Loot.Pickup(this.x, this.y - 8, 'trinket', 0, U.pick(rares)));
        for (let i = 0; i < 4; i++) game.pickups.push(new KTC.Loot.Pickup(this.x + U.rand(-14, 14), this.y + U.rand(-8, 8), 'material', i < 2 ? 1 : 2, i < 2 ? 'relic' : 'iron'));
        game.pickups.push(new KTC.Loot.Pickup(this.x, this.y - 8, 'valuable', U.randInt(120, 200), 'Boss Bounty'));
        if (game.boss === this) game.boss = null;
        game.ui.toast('The Undertaker falls — grab the spoils!');
      } else {
        KTC.Loot.dropFromEnemy(game, this.x, this.y, this);
      }
      game.onEnemyKilled(this, !!crit);
    }

    // start / refresh a status effect. Bosses shrug off stun.
    applyStatus(kind, dur, data) {
      if (this.dead) return;
      if (kind === 'stun' && this.boss) return;
      this.status[kind] = Math.max(this.status[kind] || 0, dur);
      if (kind === 'burn') this._wasBurning = true;   // so a burning death spreads
      if (kind === 'mark' && data && data.by) this.status.markBy = data.by;
    }

    // fire jumps to living crows huddled nearby (bounded — the flame burns out)
    igniteNeighbours(game) {
      for (const o of game.enemies) {
        if (o === this || o.dead || o.boss) continue;
        if (o.status.burn > 0) continue;   // already alight — don't refresh forever
        if (U.dist(this.x, this.y, o.x, o.y) < 40 + o.r) {
          o.applyStatus('burn', 1.1);
          game.particles.spawn(o.x, o.y - o.hh * 0.5, { vx: 0, vy: -30, life: 0.4, size: 2, color: '#f0a040' });
        }
      }
    }

    tickStatus(dt, game) {
      const st = this.status;
      if (st.stun > 0) st.stun -= dt;
      if (st.mark > 0) st.mark -= dt;
      if (st.burn > 0) {
        const was = st.burn;
        st.burn -= dt;
        if (game && U.chance(dt * 26)) game.particles.spawn(this.x + U.rand(-4, 4), this.y - this.hh * U.rand(0.3, 0.9), { vx: U.rand(-8, 8), vy: -46, life: 0.45, size: 2.5, color: U.pick(['#f6d060', '#f0a040', '#e0642a']) });
        if (was > 0 && st.burn <= 0) this._burnedOut = true;   // fire finished it off
      }
    }

    update(dt, game) {
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.cdT > 0) this.cdT -= dt;
      this.tickStatus(dt, game);

      // fire that outlasts its victim: a burned-out crow drops and spreads
      if (this._burnedOut && !this.dead && !this.boss) { this.die(game, null, false); return; }

      const p = game.player;
      const d = U.dist(this.x, this.y, p.x, p.y);
      const stunned = this.status.stun > 0;
      const canAct = !p.dead;
      let mvx = 0, mvy = 0, sp = this.s.speed;

      // charging attackers stand and face their mark; everyone else re-aims
      if (this.state !== 'charging' && !stunned) this.aim = U.angle(this.x, this.y, p.x, p.y);

      // a staggered crow can't chase or attack — it just reels
      if (stunned) {
        if (U.chance(dt * 7)) game.particles.spawn(this.x + U.rand(-4, 4), this.y - this.hh * U.rand(0.5, 0.9), { vx: U.rand(-10, 10), vy: -22, life: 0.35, size: 1.6, color: '#dfe2ee' });
      } else switch (this.type) {
        case 'rusher': case 'coyote': ({ mvx, mvy } = this.updateRusher(dt, game, p, d, canAct)); break;
        case 'gunman': ({ mvx, mvy } = this.updateRanged(dt, game, p, d, canAct, false)); break;
        case 'sniper': ({ mvx, mvy } = this.updateRanged(dt, game, p, d, canAct, true)); break;
        case 'brute': ({ mvx, mvy, sp } = this.updateBrute(dt, game, p, d, canAct)); break;
        case 'shielder': ({ mvx, mvy } = this.updateShielder(dt, game, p, d, canAct)); break;
        case 'bomber': ({ mvx, mvy } = this.updateBomber(dt, game, p, d, canAct)); break;
        case 'boss': ({ mvx, mvy } = this.updateBoss(dt, game, p, d, canAct)); break;
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
            p.hurt(this.s.dmg, game, this.x, this.y);
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

    // ---- shielder: turns its shield toward the player only slowly, so a quick
    // strafe or dodge around it exposes the flank ----
    updateShielder(dt, game, p, d, canAct) {
      let mvx = 0, mvy = 0;
      const want = U.angle(this.x, this.y, p.x, p.y);
      this.facing += U.clamp(U.angleDiff(this.facing, want), -this.s.turn * dt, this.s.turn * dt);
      if (this.state === 'wind') {
        this.stateT -= dt; this.swing = 1 - this.stateT / this.s.windup;
        if (this.stateT <= 0) {
          if (!p.dead && !p.invuln() && U.dist(this.x, this.y, p.x, p.y) < this.s.reach + p.r + 5) p.hurt(this.s.dmg, game, this.x, this.y);
          this.state = 'chase'; this.cdT = this.s.cd; this.swing = 0;
        }
      } else {
        if (canAct) { mvx = Math.cos(this.facing); mvy = Math.sin(this.facing); }
        if (canAct && d < this.s.reach && this.cdT <= 0) { this.state = 'wind'; this.stateT = this.s.windup; this.swing = 0; }
      }
      return { mvx, mvy };
    }

    // ---- bomber: sprints in, lights a fuse, detonates (also on death) ----
    updateBomber(dt, game, p, d, canAct) {
      let mvx = 0, mvy = 0;
      if (this.state === 'fuse') {
        this.stateT -= dt;
        if (U.chance(dt * 22)) game.particles.spawn(this.x, this.y - this.hh, { vx: U.rand(-12, 12), vy: -34, life: 0.4, size: 2, color: '#e07a3a' });
        if (this.stateT <= 0) this.die(game);
        return { mvx, mvy };
      }
      if (canAct) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
      if (canAct && d < 42) { this.state = 'fuse'; this.stateT = this.s.fuse; KTC.Audio.bruteRoar(); }
      return { mvx, mvy };
    }

    // ---- boss: keeps mid-range, alternates a shotgun sweep and summoning ----
    updateBoss(dt, game, p, d, canAct) {
      let mvx = 0, mvy = 0;
      if (!canAct) return { mvx, mvy };
      if (d > 260) { mvx = Math.cos(this.aim); mvy = Math.sin(this.aim); }
      else if (d < 170) { mvx = -Math.cos(this.aim); mvy = -Math.sin(this.aim); }
      else { mvx = Math.cos(this.aim + Math.PI / 2) * this.strafeDir; mvy = Math.sin(this.aim + Math.PI / 2) * this.strafeDir; if (U.chance(dt * 0.5)) this.strafeDir *= -1; }
      this.bossT -= dt;
      if (this.bossT <= 0) {
        this.bossT = U.rand(2.0, 2.8);
        const oy = this.y - this.hh * 0.4;
        if (U.chance(0.55)) {
          const base = U.angle(this.x, oy, p.x, p.y - p.hh * 0.4);
          for (let k = -3; k <= 3; k++) game.projectiles.push(new KTC.Projectile(this.x, oy, base + k * 0.15, { speed: 300, damage: 1, team: 'enemy', range: 620, size: 3, color: '#e07a5f' }));
          game.particles.spark(this.x, oy, base); KTC.Audio.shoot('shotgun');
        } else {
          for (let k = 0; k < 2; k++) game.enemies.push(new Enemy(this.x + U.rand(-30, 30), this.y + U.rand(-30, 30), 'rusher', this.tier));
          game.particles.burst(this.x, oy, 14, { color: ['#7c2f2c', '#3a3025'], speedMin: 20, speedMax: 100, lifeMin: 0.3, lifeMax: 0.6, size: 2 });
          KTC.Audio.bruteRoar();
        }
      }
      return { mvx, mvy };
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

      // coyote uses its own beast sprite
      if (this.type === 'coyote') {
        ctx.save(); ctx.translate(this.x, this.y);
        if (this.hurtT > 0) ctx.filter = 'brightness(2.2)';
        S.coyote(ctx, { aim: this.aim, walk: this.walk });
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.translate(this.x, this.y);
      const flip = Math.cos(this.aim) < 0 ? -1 : 1;
      if (this.type === 'brute') {
        if (this.state === 'tele') ctx.rotate(-0.14 * flip);       // lean back
        else if (this.state === 'charging') ctx.rotate(0.2 * flip); // lean in
      }
      if (this.boss) ctx.scale(1.9, 1.9);
      // bomber flashes red while its fuse burns
      if (this.type === 'bomber' && this.state === 'fuse' && Math.floor(performance.now() / 80) % 2 === 0) {
        ctx.filter = 'brightness(2.4) sepia(1) saturate(4) hue-rotate(-20deg)';
      } else if (this.type === 'rusher' && this.state === 'wind' && this.stateT < 0.16) {
        ctx.filter = 'brightness(2.6)';                            // pre-strike flash
      } else if (this.hurtT > 0) {
        ctx.filter = 'brightness(2.2) saturate(0.4)';
      } else if (this.status.burn > 0) {
        ctx.filter = 'brightness(1.5) sepia(0.7) saturate(3) hue-rotate(-18deg)';  // alight
      }
      S.crow(ctx, {
        type: this.boss ? 'brute' : this.type === 'shielder' || this.type === 'bomber' ? 'rusher' : this.type,
        aim: this.aim, walk: this.walk,
        knife: this.type === 'rusher' || this.type === 'shielder',
        gun: this.type === 'gunman' ? 'revolver' : this.type === 'sniper' ? 'sniper' : this.boss ? 'shotgun' : undefined,
        swing: this.swing * -0.9,
      });
      // bomber's satchel charge
      if (this.type === 'bomber') { S.px(ctx, -3, -6, 6, 6, '#2a2a2e'); S.px(ctx, -1, -8, 2, 2, this.state === 'fuse' ? '#ff6a3a' : '#8a8a3a'); }
      ctx.restore();

      // shielder's plank shield, on its (slowly turning) facing side
      if (this.type === 'shielder') {
        ctx.save();
        ctx.translate(this.x + Math.cos(this.facing) * 9, this.y - this.hh * 0.4 + Math.sin(this.facing) * 9);
        ctx.rotate(this.facing + Math.PI / 2);
        S.px(ctx, -7, -2, 14, 4, S.PAL.woodDark);
        S.px(ctx, -7, -2, 14, 1.5, S.PAL.wood);
        S.px(ctx, -1, -2, 2, 4, S.PAL.metal);
        ctx.restore();
      }

      // boss health bar floats above
      if (this.boss && !this.dead) {
        const w = 44, top = this.y - this.hh * 1.9 - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x - w / 2 - 1, top - 1, w + 2, 5);
        ctx.fillStyle = '#b5433a'; ctx.fillRect(this.x - w / 2, top, w * (this.hp / this.maxHp), 3);
      }

      // marked: a thin reticle brackets the crow (its kill pays double)
      if (this.status.mark > 0 && !this.dead) {
        const my = this.y - this.hh * 0.5, rr = this.r + 5;
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(performance.now() / 120);
        ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1;
        for (let q = 0; q < 4; q++) {
          const ax = q < 2 ? -1 : 1, ay = q % 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(this.x + ax * rr, my + ay * rr - ay * 3);
          ctx.lineTo(this.x + ax * rr, my + ay * rr);
          ctx.lineTo(this.x + ax * rr - ax * 3, my + ay * rr);
          ctx.stroke();
        }
        ctx.restore();
      }

      // stagger: little stars circle the crow's head
      if (this.status.stun > 0 && !this.dead) {
        const cy = this.y - this.hh - 4, t = performance.now() / 200;
        ctx.fillStyle = '#f2e79a';
        for (let k = 0; k < 3; k++) {
          const a = t + k * (U.TAU / 3);
          ctx.globalAlpha = 0.55 + 0.35 * Math.sin(a * 2);
          ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * 7, cy + Math.sin(a) * 2.4, 1.4, 0, U.TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---- wave director ----
  // Pressure is driven by game.threat (which climbs with time and depth) and by
  // the biome the player is standing in: deeper/richer zones spawn more, and
  // deadlier, crows. That's the "stay longer / go deeper = more danger" stake.
  class Spawner {
    constructor() { this.timer = 0.8; this.frenzy = false; }
    reset() { this.timer = 0.8; this.frenzy = false; }

    maxAlive(game) {
      const T = KTC.Tune.spawn;
      const base = (T.capBase + Math.floor(game.threat * T.capPerThreat) + game.raidsCleared) * (game.diff ? game.diff.spawnMul : 1);
      return Math.min(Math.round(base), T.capMax) + (this.frenzy ? 8 : 0);
    }

    spawnPoint(game) {
      const p = game.player;
      for (let tries = 0; tries < 24; tries++) {
        const x = U.rand(30, game.level.w - 30);
        const y = U.rand(30, game.level.h - 30);
        if (U.dist(x, y, p.x, p.y) < 260 || U.dist(x, y, p.x, p.y) > 620) continue; // ring around player
        let blocked = false;
        for (const s of game.level.solids) {
          if (x > s.x - 6 && x < s.x + s.w + 6 && y > s.y - 6 && y < s.y + s.h + 6) { blocked = true; break; }
        }
        if (!blocked) return { x, y };
      }
      return null;
    }

    pickType(game, biome) {
      if (this.frenzy && Math.random() < 0.6) return Math.random() < 0.75 ? 'rusher' : 'gunman';
      let type = KTC.Zones.rollEnemy(biome);
      if (type === 'sniper' && game.enemies.filter((e) => e.type === 'sniper' && !e.dead).length >= 2) type = 'gunman';
      return type;
    }

    update(dt, game) {
      this.frenzy = !!(game.extract && game.extract.holding);
      const zone = game.level.zoneAt(game.player.x, game.player.y);
      const biome = zone ? zone.biome : 'ghost';
      const bio = KTC.Zones.biome(biome);
      this.timer -= dt;
      if (this.timer <= 0) {
        if (game.enemies.length < this.maxAlive(game)) {
          const pt = this.spawnPoint(game);
          if (pt) {
            const type = this.pickType(game, biome);
            const tier = (zone ? zone.tier : 0) + Math.floor(game.threat / 4) + 1;
            game.enemies.push(new Enemy(pt.x, pt.y, type, tier));
            // coyotes run in packs
            if (type === 'coyote') for (let k = 0; k < 2; k++) game.enemies.push(new Enemy(pt.x + U.rand(-40, 40), pt.y + U.rand(-40, 40), 'coyote', tier));
          }
        }
        // interval shortens as threat climbs and in denser biomes
        let base = U.clamp(2.4 - game.threat * 0.11, 0.4, 2.4) / (bio.density || 1);
        if (this.frenzy) base *= 0.45;
        this.timer = base * U.rand(0.7, 1.2);
      }
    }
  }

  KTC.Enemy = Enemy;
  KTC.Spawner = Spawner;
})(window.KTC);
