// loot.js — pickups (gold, valuables, bandages), lootable containers, and the
// helpers that drop loot from enemies. Containers are looted by standing next
// to them and holding E — a channel that leaves you unable to shoot, mirroring
// the reload-window tension. Gold is a weightless counter; valuables are items
// that occupy limited satchel slots (see game.addValuable) and are only yours
// once you extract.
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
      this.fullT = 0;               // valuable: retry delay when satchel is full
      this.magnet = kind === 'gold' ? 70 : 40;
    }

    update(dt, game) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.bob += dt * 4;
      if (this.fullT > 0) this.fullT -= dt;

      if (!this.grounded) {
        this.vz -= 260 * dt;
        this.z += this.vz * dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.z <= 0) { this.z = 0; this.grounded = true; game.particles.dust(this.x, this.y, 2); }
      }

      const p = game.player;
      if (p.dead) return;
      // a valuable that found the satchel full waits on the ground for a while
      const blocked = this.kind === 'valuable' && (this.fullT > 0 || game.satchelFull());
      const d = U.dist(this.x, this.y, p.x, p.y);
      if (this.grounded && d < this.magnet && !blocked) {
        const a = U.angle(this.x, this.y, p.x, p.y);
        const pull = U.lerp(240, 60, d / this.magnet);
        this.x += Math.cos(a) * pull * dt;
        this.y += Math.sin(a) * pull * dt;
      }
      if (d < p.r + 6 && !blocked) this.collect(game);
    }

    collect(game) {
      if (this.kind === 'health') {
        this.dead = true;
        if (game.player.hp < game.player.maxHp) {
          game.player.hp++;
          game.particles.text(this.x, this.y - 14, '+1 HP', '#c6533f');
          KTC.Audio.pickup();
        } else {
          // convert to a little gold if already full
          game.addGold(8, this.x, this.y);
        }
        return;
      }
      if (this.kind === 'valuable') {
        if (game.addValuable(this.name, this.value, this.x, this.y)) {
          this.dead = true;
          KTC.Audio.coin();
        } else {
          this.fullT = 1.2;       // stays on the ground; try again later
        }
        return;
      }
      if (this.kind === 'trinket') { this.dead = true; game.addTrinket(this.name, this.x, this.y); return; }
      if (this.kind === 'weapon') { this.dead = true; game.equipFoundWeapon(this.name, this.x, this.y); return; }
      this.dead = true;
      game.addGold(this.value, this.x, this.y);
      KTC.Audio.coin();
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
      } else if (this.kind === 'trinket') {
        // glowing amulet — pulses to draw the eye
        const gl = 0.5 + 0.5 * Math.sin(this.bob * 1.6);
        ctx.globalAlpha = 0.35 + 0.3 * gl;
        ctx.fillStyle = '#b98bff';
        ctx.beginPath(); ctx.arc(this.x, y + fb, 7, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#d9c2ff';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * (U.TAU / 5);
          const r = i % 1 === 0 ? 4 : 2;
          ctx[i ? 'lineTo' : 'moveTo'](this.x + Math.cos(a) * 4, y + fb + Math.sin(a) * 4);
        }
        ctx.closePath(); ctx.fill();
        S.px(ctx, this.x - 1, y - 1 + fb, 2, 2, '#fff');
      } else if (this.kind === 'weapon') {
        S.px(ctx, this.x - 5, y - 2 + fb, 10, 3, S.PAL.metal);
        S.px(ctx, this.x - 5, y - 2 + fb, 4, 3, S.PAL.woodDark);
        S.px(ctx, this.x - 4, y + 1 + fb, 2, 3, S.PAL.woodDark);
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.bob * 2);
        ctx.fillStyle = '#8ecfd4';
        ctx.beginPath(); ctx.arc(this.x, y + fb, 8, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
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
      // hold-E channel length: richer caches take longer (more exposure)
      this.channelTime = { crate: 0.9, barrel: 0.9, wagon: 1.6, well: 2.0, cache: 1.6, weaponrack: 1.4 }[type] || 0.9;
      this.lootProgress = 0;
      this.r = type === 'well' ? 16 : type === 'wagon' ? 16 : 9;
      this.hh = type === 'well' ? 34 : type === 'weaponrack' ? 18 : 15;
    }

    open(game) {
      if (this.opened) return;
      this.opened = true;
      this.lootProgress = 0;
      game.particles.burst(this.x, this.y - 8, 10, {
        color: ['#5a4c3c', '#3a3025', '#6d5c47'], speedMin: 20, speedMax: 90,
        lifeMin: 0.3, lifeMax: 0.6, size: 2,
      });
      // special caches yield roguelike items instead of gold
      if (this.type === 'cache') {
        game.pickups.push(new Pickup(this.x, this.y - 4, 'trinket', 0, KTC.Trinkets.roll(new Set(game.trinkets))));
        game.particles.text(this.x, this.y - this.hh - 4, 'TRINKET!', '#c9a2ff', { life: 1 });
        KTC.Audio.trinket();
        return;
      }
      if (this.type === 'weaponrack') {
        game.pickups.push(new Pickup(this.x, this.y - 4, 'weapon', 0, KTC.Weapons.rollFind()));
        game.particles.text(this.x, this.y - this.hh - 4, 'NEW IRON!', '#8ecfd4', { life: 1 });
        KTC.Audio.trinket();
        return;
      }
      KTC.Audio.pickup();
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
      const valChance = { crate: 0.22, barrel: 0.12, well: 0.65, wagon: 0.55 }[this.type] || 0.2;
      if (U.chance(valChance)) {
        out.push({ kind: 'valuable', value: U.randInt(35, 85), name: U.pick(VALUABLE_NAMES) });
      }
      if (U.chance(0.22)) out.push({ kind: 'health', value: 1 });
      return out;
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.lootProgress > 0 && !this.opened) ctx.filter = 'brightness(1.25)';
      if (this.type === 'cache') {
        S.cache(ctx, this.opened);
      } else if (this.type === 'weaponrack') {
        S.weaponrack(ctx, this.opened);
      } else if (this.opened && this.type !== 'well' && this.type !== 'wagon') {
        // emptied crate/barrel: pried-open remains
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
        S.crate(ctx, false);
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
