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
      this.fireCd = 0;
      this.reloading = false;
      this.reloadT = 0;
      this.reloadTotal = 0;

      // dodge state
      this.rollT = 0;
      this.rollCd = 0;
      this.rollDir = 0;

      // timers
      this.hitInvulnT = 0;
      this.flashT = 0;
      this.footT = 0;
      this.recoil = 0;
    }

    applyStats(st) {
      this.maxHp = st.maxHp;
      this.hp = st.maxHp;
      this.speed = st.speed;
      this.reloadMult = st.reloadMult;
      this.dodgeCd = st.dodgeCd;
      this.magBonus = st.magBonus;
      this.setWeapon(st.weaponId || 'revolver');
    }

    weapon() { return KTC.Weapons.get(this.weaponId); }
    magSize() { return this.weapon().magSize + this.magBonus; }

    setWeapon(id) {
      this.weaponId = id;
      this.ammo = this.magSize();
      this.reloading = false; this.reloadT = 0; this.fireCd = 0;
    }

    invuln() { return this.rollT > ROLL_DUR - ROLL_IFRAME && this.rollT > 0 || this.hitInvulnT > 0; }
    rolling() { return this.rollT > 0; }

    update(dt, game) {
      if (this.dead) return;
      this.fireCd -= dt;
      if (this.rollCd > 0) this.rollCd -= dt;
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
      const mlen = Math.hypot(ix, iy) || 1;
      ix /= mlen; iy /= mlen;

      // dodge roll
      if (In.justPressed('Space') && this.rollT <= 0 && this.rollCd <= 0) {
        this.rollT = ROLL_DUR;
        this.rollDir = (ix || iy) ? Math.atan2(iy, ix) : this.aim;
        this.rollCd = ROLL_DUR + this.dodgeCd;
        KTC.Audio.dodge();
        game.particles.dust(this.x, this.y, 6);
      }

      if (this.rollT > 0) {
        this.rollT -= dt;
        const spd = ROLL_SPEED * (0.5 + this.rollT / ROLL_DUR);
        this.vx = Math.cos(this.rollDir) * spd;
        this.vy = Math.sin(this.rollDir) * spd;
        if (U.chance(dt * 30)) game.particles.dust(this.x, this.y, 1);
      } else {
        const target = this.speed;
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

      // weapon: reload
      const mag = this.magSize();
      if (In.justPressed('KeyR') && !this.reloading && this.ammo < mag) this.startReload();
      if (this.ammo <= 0 && !this.reloading) this.startReload();
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.reloading = false;
          this.ammo = mag;
          KTC.Audio.reloadDone();
          game.particles.text(this.x, this.y - this.hh - 6, 'RELOADED', '#cdbb9c', { life: 0.6, size: 6 });
        }
      }

      // shooting (blocked while reloading or mid-roll)
      if (!this.reloading && !this.rolling() && this.ammo > 0 && this.fireCd <= 0) {
        const w = this.weapon();
        const wantFire = w.auto ? In.mouse.down : In.mouse.clicked;
        if (wantFire) this.shoot(game);
      }
    }

    resolveWorld(game) {
      for (const s of game.level.solids) {
        if (s.container && s.container.opened) continue;   // looted = passable
        const push = U.circleRect(this.x, this.y, this.r, s.x, s.y, s.w, s.h);
        if (push) { this.x += push.x; this.y += push.y; }
      }
    }

    shoot(game) {
      const w = this.weapon();
      const mx = this.x + Math.cos(this.aim) * 16;
      const my = this.y - 11 + Math.sin(this.aim) * 16;
      for (let i = 0; i < w.pellets; i++) {
        const a = this.aim + U.rand(-w.spread, w.spread);
        game.projectiles.push(new KTC.Projectile(mx, my, a, {
          speed: w.proj.speed, damage: w.proj.damage, size: w.proj.size,
          team: 'player', range: w.proj.range, pierce: w.proj.pierce, color: '#f0d98a',
        }));
      }
      this.ammo--;
      this.fireCd = w.fireRate;
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

    startReload() {
      this.reloading = true;
      this.reloadTotal = this.weapon().reloadTime * this.reloadMult;
      this.reloadT = this.reloadTotal;
      KTC.Audio.reload();
    }

    hurt(dmg, game) {
      if (this.dead || this.invuln()) return;
      this.hp -= dmg;
      this.hitInvulnT = HIT_IFRAME;
      this.flashT = 0.1;
      game.onPlayerDamaged(dmg);
      game.particles.shake(7, 0.3);
      KTC.Audio.playerHurt();
      if (this.hp <= 0) { this.hp = 0; this.die(game); }
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
        gun: this.weapon().sprite,
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
