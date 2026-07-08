// player.js — the gunslinger. Movement, mouse aim, dodge-roll with i-frames,
// shooting, and the reload window that is the core of the Kill-the-Crows loop.
// Per-run stats (max HP, speed, reload, etc.) are injected from saved upgrades.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;
  const In = KTC.Input;

  const ROLL_DUR = 0.34;
  const ROLL_IFRAME = 0.27;
  const ROLL_SPEED = 340;
  const HIT_IFRAME = 0.7;

  class Player {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.r = 6; this.hh = 19;
      this.aim = 0;
      this.walk = 0;
      this.dead = false;

      // stats (overwritten by applyStats)
      this.maxHp = 5; this.hp = 5;
      this.speed = 150;
      this.reloadMult = 1;
      this.dodgeCd = 0.7;
      this.magBonus = 0;

      // weapon state
      this.weaponId = 'revolver';
      this.ammo = 6;
      this.magBonusMods = 0;        // live capacity from trinket mods
      this.fireCd = 0;
      this.reloading = false;
      this.reloadT = 0;
      this.reloadTotal = 0;

      // dodge state
      this.rollT = 0;
      this.rollCd = 0;
      this.rollDir = 0;

      // loot channel state (hold E next to a container)
      this.nearContainer = null;
      this.looting = false;
      this.lootStunT = 0;           // brief lockout after taking damage

      // timers
      this.hitInvulnT = 0;
      this.flashT = 0;
      this.footT = 0;
      this.recoil = 0;
      this.cheatUsed = false;       // Snake Oil: one save per raid
      this.grudge = false;          // Grudge: next shot is a guaranteed explosive crit
      this.stillT = 0;              // time held stationary (rifle marksman charge)
      this.marksmanReady = false;   // rifle: next shot is a marked, piercing called shot
      this.heat = 0;                // repeater overheat gauge (0..1)
      this.overheated = false;      // repeater: locked out until it cools
      this.perfectBuffT = 0;        // active-reload speed buff
      this.item = null;             // equipped active item id
      this.itemCharges = 0;
      this.maxItemCharges = 2;
      this.hat = 'hat_default';     // cosmetic
    }

    applyStats(st) {
      this.maxHp = st.maxHp;
      this.hp = st.maxHp;
      this.speed = st.speed;
      this.reloadMult = st.reloadMult;
      this.dodgeCd = st.dodgeCd;
      this.magBonus = st.magBonus;
      this.cheatUsed = false;
      this.setWeapon(st.weaponId || 'revolver');
    }

    weapon() { return KTC.Weapons.get(this.weaponId); }
    magSize() { return this.weapon().magSize + this.magBonus + this.magBonusMods; }

    setWeapon(id) {
      this.weaponId = id;
      this.ammo = this.magSize();
      this.reloading = false; this.reloadT = 0; this.fireCd = 0;
    }

    invuln() { return this.rollT > ROLL_DUR - ROLL_IFRAME && this.rollT > 0 || this.hitInvulnT > 0; }
    rolling() { return this.rollT > 0; }

    update(dt, game) {
      if (this.dead) return;
      this.magBonusMods = game.mods ? game.mods.magBonus : 0;
      this.fireCd -= dt;
      if (this.rollCd > 0) this.rollCd -= dt;
      if (this.perfectBuffT > 0) this.perfectBuffT -= dt;
      if (this.hitInvulnT > 0) this.hitInvulnT -= dt;
      if (this.flashT > 0) this.flashT -= dt;
      this.recoil = U.approach(this.recoil, 0, dt * 40);

      // aim toward mouse (world space filled by game)
      this.aim = U.angle(this.x, this.y - this.hh * 0.4, In.mouse.wx, In.mouse.wy);

      // movement input
      let ix = 0, iy = 0;
      if (In.anyDown(['KeyA', 'ArrowLeft'])) ix -= 1;
      if (In.anyDown(['KeyD', 'ArrowRight'])) ix += 1;
      if (In.anyDown(['KeyW', 'ArrowUp'])) iy -= 1;
      if (In.anyDown(['KeyS', 'ArrowDown'])) iy += 1;
      if (In.pad.active) { ix += In.pad.mx; iy += In.pad.my; }
      const mlen = Math.hypot(ix, iy) || 1;
      ix /= mlen; iy /= mlen;

      // dodge roll
      if (In.actPressed('dodge') && this.rollT <= 0 && this.rollCd <= 0) {
        this.rollT = ROLL_DUR;
        this.rollDir = (ix || iy) ? Math.atan2(iy, ix) : this.aim;
        this.rollCd = ROLL_DUR + this.dodgeCd * game.mods.dodgeCdMult;
        KTC.Audio.dodge();
        game.particles.dust(this.x, this.y, 6);
        game.emit('dodge');
      }

      if (this.rollT > 0) {
        this.rollT -= dt;
        const spd = ROLL_SPEED * (0.5 + this.rollT / ROLL_DUR);
        this.vx = Math.cos(this.rollDir) * spd;
        this.vy = Math.sin(this.rollDir) * spd;
        if (U.chance(dt * 30)) game.particles.dust(this.x, this.y, 1);
      } else {
        const target = this.speed * game.mods.moveMult;
        this.vx = U.approach(this.vx, ix * target, target * 12 * dt);
        this.vy = U.approach(this.vy, iy * target, target * 12 * dt);
        // footstep dust
        if ((ix || iy)) {
          this.walk += dt * 11;
          this.footT -= dt;
          if (this.footT <= 0) { this.footT = 0.28; game.particles.dust(this.x, this.y, 1); }
        } else {
          this.walk = U.approach(this.walk, 0, dt * 20);
        }
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.resolveWorld(game);
      this.x = U.clamp(this.x, 6, game.level.w - 6);
      this.y = U.clamp(this.y, 6, game.level.h - 6);

      // in the home base you only walk around — no shooting, reloading, or looting
      if (game.state === 'base') return;

      // ---- gun quirks: marksman stand-still charge + repeater heat cooldown ----
      const wq = this.weapon();
      const moving = !!(ix || iy) || this.rolling();
      if (wq.quirk === 'marksman' && !moving && !this.reloading) this.stillT += dt; else this.stillT = 0;
      this.marksmanReady = wq.quirk === 'marksman' && this.stillT >= 0.5 && this.ammo > 0;
      if (this.heat > 0) this.heat = Math.max(0, this.heat - dt * 0.6);
      if (this.overheated && this.heat <= 0.35) this.overheated = false;

      // ---- looting: stand still next to a container and hold E ----
      if (this.lootStunT > 0) this.lootStunT -= dt;
      this.nearContainer = null;
      let bestD2 = 32 * 32;
      for (const c of game.level.containers) {
        if (c.opened) continue;
        const d2 = U.dist2(this.x, this.y, c.x, c.y - 4);
        if (d2 < bestD2) { bestD2 = d2; this.nearContainer = c; }
      }
      this.looting = false;
      if (this.nearContainer && In.actDown('loot') && !this.rolling() &&
          !(ix || iy) && this.lootStunT <= 0) {
        const c = this.nearContainer;
        this.looting = true;
        if (c.lootProgress === 0) KTC.Audio.rustle();
        c.lootProgress += dt;
        if (c.lootProgress >= c.channelTime) c.open(game);
      }

      // weapon: reload (blocked while rummaging through a container).
      // A showdown keeps the cylinder topped up so you never stop to reload.
      const mag = this.magSize();
      const showdown = game.showdown && game.showdown.active;
      if (showdown) { this.ammo = mag; this.reloading = false; }
      if (this.reloading && In.actPressed('reload')) {
        // active reload — tap R inside the sweet spot for an instant, buffed reload
        const frac = 1 - this.reloadT / this.reloadTotal;
        const W = KTC.Tune.reload;
        if (frac >= W.windowStart && frac <= W.windowEnd) {
          this.reloadT = 0; this.perfectBuffT = 3;
          KTC.Audio.perfect();
          game.particles.text(this.x, this.y - this.hh - 6, 'PERFECT!', '#e3c06a', { life: 0.7, size: 7 });
        } else {
          this.reloadT = Math.min(this.reloadTotal, this.reloadT + this.reloadTotal * 0.3);  // jam
          KTC.Audio.hit();
        }
      } else if (In.actPressed('reload') && !this.reloading && !this.looting && this.ammo < mag) this.startReload(game);
      if (this.ammo <= 0 && !this.reloading && !this.looting && !showdown) this.startReload(game);
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.reloading = false;
          this.ammo = mag;
          KTC.Audio.reloadDone();
          game.particles.text(this.x, this.y - this.hh - 6, 'RELOADED', '#cdbb9c', { life: 0.6, size: 6 });
          game.emit('reload');
        }
      }

      // shooting (blocked while reloading, mid-roll, looting, or overheated)
      if (!this.reloading && !this.rolling() && !this.looting && (showdown || (this.ammo > 0 && !this.overheated)) && this.fireCd <= 0) {
        const w = this.weapon();
        const padShoot = In.pad.shoot;
        const wantFire = (w.auto || showdown || padShoot) ? (In.mouse.down || padShoot) : In.mouse.clicked;
        if (wantFire) this.shoot(game, showdown);
      }

      // active item (F)
      if (In.actPressed('item') && this.item && this.itemCharges > 0 && !this.rolling() && !this.looting) {
        if (game.useItem(this)) this.itemCharges--;
      }
    }

    resolveWorld(game) {
      for (const s of game.level.solids) {
        if (s.container && s.container.opened) continue;   // looted = passable
        const push = U.circleRect(this.x, this.y, this.r, s.x, s.y, s.w, s.h);
        if (push) { this.x += push.x; this.y += push.y; }
      }
    }

    shoot(game, free) {
      const w = this.weapon();
      const m = game.mods;
      const p = w.proj;
      const grudge = this.grudge;   // Grudge: this shot is a guaranteed explosive crit
      this.grudge = false;
      // ---- gun quirks that shape THIS shot ----
      const lastRound = w.quirk === 'lastround' && !free && this.ammo === 1;   // revolver's final chamber
      const marksman = this.marksmanReady && !free;                            // rifle called shot
      if (marksman) { this.marksmanReady = false; this.stillT = 0; game.particles.text(this.x, this.y - this.hh - 6, 'AIMED', '#ff7a5a', { life: 0.6, size: 7 }); }
      const mx = this.x + Math.cos(this.aim) * 16;
      const my = this.y - 11 + Math.sin(this.aim) * 16;
      const pellets = w.pellets + m.extraProjectiles;
      const spread = w.spread + m.spreadBonus;
      for (let i = 0; i < pellets; i++) {
        const a = this.aim + U.rand(-spread, spread);
        const crit = grudge || lastRound || marksman || Math.random() < m.critChance;
        game.projectiles.push(new KTC.Projectile(mx, my, a, {
          speed: p.speed, damage: 1, size: p.size, team: 'player', range: p.range * m.rangeMul,
          pierce: (p.pierce || 0) + m.pierce + (marksman ? 1 : 0),
          bounces: (p.bounces || 0) + m.bounces,
          explosive: Math.max(p.explosive || 0, m.explosive, grudge ? 30 : 0),
          homing: Math.max(p.homing || 0, m.homing),
          chain: (p.chain || 0) + m.chain,
          knockback: p.knockback || 0,
          burn: p.burn || 0,
          mark: (marksman || p.mark) ? 4 : 0,
          crit,
        }));
      }
      if (!free) this.ammo--;
      // repeater cooks the barrel; hold too long and it jams until it cools
      if (w.quirk === 'overheat' && !free) {
        this.heat = Math.min(1, this.heat + 0.085);
        if (this.heat >= 1 && !this.overheated) { this.overheated = true; KTC.Audio.hit(); game.particles.text(this.x, this.y - this.hh - 6, 'OVERHEAT!', '#ff5a4a', { life: 0.8, size: 7 }); }
      }
      const hot = m.hotStreak && game.run.combo >= 5 ? 0.7 : 1;
      const perfect = this.perfectBuffT > 0 ? 0.82 : 1;
      this.fireCd = w.fireRate * m.fireRateMult * hot * perfect * (free ? 0.6 : 1);
      this.flashT = 0.05;
      this.recoil = w.kick;
      game.particles.spark(mx, my, this.aim);
      game.particles.burst(mx, my, 3, { color: ['#6b6153', '#8a7f6b'], speedMin: 10, speedMax: 40, lifeMin: 0.2, lifeMax: 0.4, size: 2 });
      game.particles.shake(w.kick * 0.4, 0.12);
      KTC.Audio.shoot(w.sprite);
      // slight recoil pushback
      this.vx -= Math.cos(this.aim) * w.kick * 3;
      this.vy -= Math.sin(this.aim) * w.kick * 3;
    }

    startReload(game) {
      this.reloading = true;
      const rm = game ? game.mods.reloadMult : 1;
      this.reloadTotal = this.weapon().reloadTime * this.reloadMult * rm;
      this.reloadT = this.reloadTotal;
      KTC.Audio.reload();
    }

    hurt(dmg, game, sx, sy) {
      if (this.dead || this.invuln()) return;
      this.hp -= dmg;
      this.hitInvulnT = HIT_IFRAME;
      this.flashT = 0.1;
      this.lootStunT = 0.6;         // getting hit interrupts any loot channel
      game.onPlayerDamaged(dmg, sx, sy);
      game.emit('hurt', { dmg });   // Grudge & friends react to taking a hit
      game.particles.shake(7, 0.3);
      KTC.Audio.playerHurt();
      if (this.hp <= 0) {
        // Snake Oil — cheat death once per raid
        if (game.mods.cheatDeath && !this.cheatUsed) {
          this.cheatUsed = true;
          this.hp = 1;
          this.hitInvulnT = 1.4;
          game.particles.text(this.x, this.y - this.hh - 8, 'CHEATED DEATH!', '#e3c06a', { life: 1.2, size: 8 });
          game.particles.burst(this.x, this.y - 8, 20, { color: ['#e3c06a', '#fff'], speedMin: 40, speedMax: 160, lifeMin: 0.3, lifeMax: 0.7, size: 2 });
          game.particles.shake(9, 0.4);
          return;
        }
        this.hp = 0; this.die(game);
      }
    }

    die(game) {
      this.dead = true;
      game.particles.blood(this.x, this.y - this.hh * 0.4, U.rand(0, U.TAU));
      game.particles.shake(10, 0.5);
      KTC.Audio.death();
      game.onPlayerDeath();
    }

    render(ctx) {
      if (this.dead) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      // blink during i-frames
      if (this.hitInvulnT > 0 && Math.floor(this.hitInvulnT * 20) % 2 === 0) ctx.globalAlpha = 0.45;
      if (this.rolling()) {
        // squash + spin dust already handled; tilt into the roll
        ctx.rotate(Math.sin((ROLL_DUR - this.rollT) / ROLL_DUR * Math.PI) * (Math.cos(this.rollDir) < 0 ? 0.5 : -0.5));
        ctx.scale(1, 0.82);
      }
      const rec = this.aim; // recoil handled by pushing arm slightly (kept simple)
      S.player(ctx, {
        aim: this.aim, walk: this.walk,
        gun: this.weapon().sprite, hat: this.hat,
      });
      // muzzle flash
      if (this.flashT > 0) {
        ctx.save();
        ctx.translate(Math.cos(this.aim) * 16, -11 + Math.sin(this.aim) * 16);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, U.TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  KTC.Player = Player;
})(window.KTC);
