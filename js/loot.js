// loot.js — pickups (gold, valuables, bandages), destructible/lootable
// containers, and the helpers that drop loot from enemies and containers.
// Loot collected during a raid lives in game.run.loot and is only banked on a
// successful extraction — dying drops it all.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;

  const VALUABLE_NAMES = ['Pocket Watch', 'Gold Tooth', 'Silver Locket', 'Bounty Ring', 'Whiskey Flask', 'Deputy Badge'];

  class Pickup {
    constructor(x, y, kind, value, name) {
      this.x = x; this.y = y;
      this.kind = kind;             // 'gold' | 'valuable' | 'health'
      this.value = value || 0;
      this.name = name || '';
      this.vx = U.rand(-40, 40);
      this.vy = U.rand(-70, -30);
      this.z = 6;                   // little hop
      this.vz = U.rand(40, 90);
      this.grounded = false;
      this.bob = U.rand(0, U.TAU);
      this.life = 26;               // despawn safety
      this.dead = false;
      this.magnet = kind === 'gold' ? 70 : 40;
    }

    update(dt, game) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.bob += dt * 4;

      if (!this.grounded) {
        this.vz -= 260 * dt;
        this.z += this.vz * dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.z <= 0) { this.z = 0; this.grounded = true; game.particles.dust(this.x, this.y, 2); }
      }

      const p = game.player;
      if (p.dead) return;
      const d = U.dist(this.x, this.y, p.x, p.y);
      if (this.grounded && d < this.magnet) {
        const a = U.angle(this.x, this.y, p.x, p.y);
        const pull = U.lerp(240, 60, d / this.magnet);
        this.x += Math.cos(a) * pull * dt;
        this.y += Math.sin(a) * pull * dt;
      }
      if (d < p.r + 6) this.collect(game);
    }

    collect(game) {
      this.dead = true;
      if (this.kind === 'health') {
        if (game.player.hp < game.player.maxHp) {
          game.player.hp++;
          game.particles.text(this.x, this.y - 14, '+1 HP', '#c6533f');
          KTC.Audio.pickup();
        } else {
          // convert to a little gold if already full
          game.addLoot(8, this.x, this.y);
        }
        return;
      }
      if (this.kind === 'valuable') {
        game.addLoot(this.value, this.x, this.y, this.name);
        KTC.Audio.coin();
      } else {
        game.addLoot(this.value, this.x, this.y);
        KTC.Audio.coin();
      }
    }

    render(ctx) {
      const y = this.y - this.z;
      // shadow on the ground
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(this.x, this.y, 4, 1.8, 0, 0, U.TAU); ctx.fill();
      const fb = Math.sin(this.bob) * 1.2;
      if (this.kind === 'gold') {
        S.px(ctx, this.x - 2, y - 2 + fb, 4, 4, S.PAL.gold);
        S.px(ctx, this.x - 2, y - 2 + fb, 4, 1, S.PAL.goldLight);
      } else if (this.kind === 'valuable') {
        ctx.fillStyle = S.PAL.gem;
        ctx.beginPath();
        ctx.moveTo(this.x, y - 4 + fb); ctx.lineTo(this.x + 3, y - 1 + fb);
        ctx.lineTo(this.x, y + 3 + fb); ctx.lineTo(this.x - 3, y - 1 + fb);
        ctx.closePath(); ctx.fill();
        S.px(ctx, this.x - 1, y - 2 + fb, 1, 1, '#cdeef0');
      } else { // health / bandage
        S.px(ctx, this.x - 3, y - 3 + fb, 6, 6, '#c7bfae');
        S.px(ctx, this.x - 3, y - 1 + fb, 6, 2, '#c6533f');
        S.px(ctx, this.x - 1, y - 3 + fb, 2, 6, '#c6533f');
      }
    }
  }

  class Container {
    constructor(x, y, type) {
      this.x = x; this.y = y;
      this.type = type;             // 'crate' | 'barrel' | 'well' | 'wagon'
      this.opened = false;
      this.hp = type === 'well' ? 40 : type === 'wagon' ? 34 : 20;
      this.r = type === 'crate' ? 9 : type === 'barrel' ? 8 : 16;
      this.hh = type === 'well' ? 34 : 15;
      this.hurtT = 0;
    }

    hurt(dmg, angle, game) {
      if (this.opened) return;
      this.hp -= dmg;
      this.hurtT = 0.08;
      game.particles.spark(this.x, this.y - 8, angle);
      if (this.hp <= 0) this.open(game, true);
    }

    open(game, broke) {
      if (this.opened) return;
      this.opened = true;
      if (broke) {
        game.particles.burst(this.x, this.y - 8, 14, {
          color: ['#5a4c3c', '#3a3025', '#6d5c47'], speedMin: 30, speedMax: 130,
          lifeMin: 0.3, lifeMax: 0.7, size: 3,
        });
        game.particles.shake(4, 0.2);
      }
      KTC.Audio.hit();
      const drops = this.lootTable();
      for (const d of drops) {
        game.pickups.push(new Pickup(this.x + U.rand(-6, 6), this.y + U.rand(-4, 4), d.kind, d.value, d.name));
      }
      game.particles.text(this.x, this.y - this.hh - 4, 'LOOTED', '#e3c06a', { life: 0.8 });
    }

    lootTable() {
      const out = [];
      const goldChunks = { crate: 2, barrel: 1, well: 3, wagon: 3 }[this.type] || 2;
      for (let i = 0; i < goldChunks; i++) out.push({ kind: 'gold', value: U.randInt(6, 16) });
      const valChance = { crate: 0.18, barrel: 0.1, well: 0.5, wagon: 0.45 }[this.type] || 0.15;
      if (U.chance(valChance)) {
        out.push({ kind: 'valuable', value: U.randInt(35, 85), name: U.pick(VALUABLE_NAMES) });
      }
      if (U.chance(0.22)) out.push({ kind: 'health', value: 1 });
      return out;
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.hurtT > 0) ctx.filter = 'brightness(1.8)';
      if (this.opened && this.type !== 'well' && this.type !== 'wagon') {
        // broken remains
        ctx.globalAlpha = 0.85;
        S.px(ctx, -7, -3, 14, 3, S.PAL.woodDark);
        S.plank(ctx, -6, -2, 8, 0.3);
        S.plank(ctx, 1, -1, 6, -0.4);
      } else if (this.type === 'well') {
        S.well(ctx);
      } else if (this.type === 'wagon') {
        S.wagon(ctx);
        if (this.opened) { ctx.globalAlpha = 0.5; S.px(ctx, -10, -12, 20, 2, '#1c150d'); }
      } else if (this.type === 'barrel') {
        S.barrel(ctx);
      } else {
        S.crate(ctx, this.hurtT > 0);
      }
      ctx.restore();
    }
  }

  function dropFromEnemy(game, x, y, enemy) {
    const n = enemy.goldDrop || U.randInt(1, 3);
    for (let i = 0; i < n; i++) {
      game.pickups.push(new Pickup(x, y - 8, 'gold', U.randInt(3, 9)));
    }
    if (U.chance(enemy.valuableChance || 0.06)) {
      game.pickups.push(new Pickup(x, y - 8, 'valuable', U.randInt(30, 70), U.pick(VALUABLE_NAMES)));
    }
    if (U.chance(0.08)) game.pickups.push(new Pickup(x, y - 8, 'health', 1));
  }

  KTC.Loot = { Pickup, Container, dropFromEnemy, VALUABLE_NAMES };
})(window.KTC);
