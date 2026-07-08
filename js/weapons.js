// weapons.js — data-driven guns. One bullet kills one crow, so guns differ by
// HANDLING (fire rate, range, spread, mag, reload) and by PROJECTILE BEHAVIOR
// (pierce / bounces / explosive / homing / chain). Those behavior fields stack
// with the same fields granted by trinket mods, so a Bouncer + Ricochet Rounds
// bounces three times, etc.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const WEAPONS = {
    revolver: {
      id: 'revolver', name: 'Revolver', sprite: 'revolver', mech: '',
      magSize: 6, fireRate: 0.26, reloadTime: 1.15, spread: 0.03, pellets: 1,
      auto: false, kick: 4, price: 0, owned: true,
      proj: { speed: 620, range: 520, size: 3 },
      desc: 'Trusty six-shooter. One shot, one crow. Reliable at any range that matters.',
    },
    shotgun: {
      id: 'shotgun', name: 'Sawn-off', sprite: 'shotgun', mech: 'spread',
      magSize: 2, fireRate: 0.5, reloadTime: 1.5, spread: 0.3, pellets: 6,
      auto: false, kick: 9, price: 140,
      proj: { speed: 520, range: 220, size: 3 },
      desc: 'Six pellets, six dead crows if they bunch up. Useless past spitting distance.',
    },
    rifle: {
      id: 'rifle', name: 'Lever Rifle', sprite: 'rifle', mech: '',
      magSize: 5, fireRate: 0.42, reloadTime: 1.35, spread: 0.008, pellets: 1,
      auto: false, kick: 5, price: 190,
      proj: { speed: 920, range: 820, size: 3 },
      desc: 'Reaches across the whole street. Slow between shots — make each one count.',
    },
    repeater: {
      id: 'repeater', name: 'Repeater', sprite: 'repeater', mech: 'auto',
      magSize: 14, fireRate: 0.11, reloadTime: 1.9, spread: 0.1, pellets: 1,
      auto: true, kick: 2.5, price: 260,
      proj: { speed: 680, range: 400, size: 2 },
      desc: 'Hold the trigger and hose them down. Sloppy aim, hungry cylinder, long reload.',
    },
    // ---- behavior guns (found in raids, or bought at a premium) ----
    bouncer: {
      id: 'bouncer', name: 'Bouncer', sprite: 'revolver', mech: 'ricochet ×2',
      magSize: 6, fireRate: 0.3, reloadTime: 1.2, spread: 0.04, pellets: 1,
      auto: false, kick: 4, price: 240,
      proj: { speed: 560, range: 560, size: 3, bounces: 2 },
      desc: 'Trick rounds that skip off crows and cover. Bank a shot around a wall.',
    },
    hex: {
      id: 'hex', name: 'Hex Pistol', sprite: 'revolver', mech: 'homing',
      magSize: 6, fireRate: 0.34, reloadTime: 1.3, spread: 0.02, pellets: 1,
      auto: false, kick: 3, price: 260,
      proj: { speed: 480, range: 520, size: 3, homing: 3.0 },
      desc: 'Cursed lead that curves after the nearest crow. Point in the vague direction.',
    },
    tesla: {
      id: 'tesla', name: 'Arc Coil', sprite: 'repeater', mech: 'chain ⚡',
      magSize: 10, fireRate: 0.16, reloadTime: 1.8, spread: 0.06, pellets: 1,
      auto: true, kick: 3, price: 300,
      proj: { speed: 700, range: 380, size: 2, chain: 2 },
      desc: 'Every hit forks lightning into two more crows. Loves a crowd.',
    },
    buffalo: {
      id: 'buffalo', name: 'Buffalo Rifle', sprite: 'rifle', mech: 'pierces all',
      magSize: 3, fireRate: 0.6, reloadTime: 1.6, spread: 0.004, pellets: 1,
      auto: false, kick: 8, price: 280,
      proj: { speed: 1100, range: 900, size: 4, pierce: 99 },
      desc: 'Punches a hole clean through a whole line of crows. Slow, heavy, glorious.',
    },
    boomstick: {
      id: 'boomstick', name: 'Boomstick', sprite: 'shotgun', mech: 'explosive',
      magSize: 2, fireRate: 0.7, reloadTime: 1.7, spread: 0.02, pellets: 1,
      auto: false, kick: 12, price: 320,
      proj: { speed: 440, range: 300, size: 4, explosive: 34 },
      desc: 'Lobs a dynamite slug that bursts on impact. Mind your own boots.',
    },
  };

  // shop sells everything; weapon pickups in raids roll from the fun ones
  const ORDER = ['revolver', 'shotgun', 'rifle', 'repeater', 'bouncer', 'hex', 'tesla', 'buffalo', 'boomstick'];
  const FIND = ['shotgun', 'rifle', 'repeater', 'bouncer', 'hex', 'tesla', 'buffalo', 'boomstick'];

  // Attachments, crafted with materials at the gunsmith, per weapon. Their
  // effects fold into the same `mods` object as trinkets, so they stack.
  const ATTACH = {
    scope:      { name: 'Scope', icon: '◎', desc: 'Longer range, tighter spread.', cost: { scrap: 6, iron: 2 }, mods: (m) => { m.spreadBonus -= 0.02; m.rangeMul *= 1.3; } },
    mag:        { name: 'Extended Mag', icon: '▮', desc: '+3 cylinder capacity.', cost: { scrap: 8, iron: 3 }, mods: (m) => { m.magBonus += 3; } },
    hollow:     { name: 'Hollow Points', icon: '⦿', desc: 'Rounds pierce +1 crow.', cost: { scrap: 6, iron: 2 }, mods: (m) => { m.pierce += 1; } },
    ricochet:   { name: 'Ricochet Kit', icon: '⟳', desc: 'Rounds ricochet +1.', cost: { scrap: 6, iron: 3 }, mods: (m) => { m.bounces += 1; } },
    incendiary: { name: 'Incendiary Rounds', icon: '✷', desc: 'Shots burst on impact.', cost: { scrap: 6, iron: 2, relic: 1 }, mods: (m) => { m.explosive = Math.max(m.explosive, 16); } },
  };
  const ATTACH_ORDER = ['scope', 'mag', 'hollow', 'ricochet', 'incendiary'];

  KTC.Weapons = {
    defs: WEAPONS, order: ORDER, find: FIND, get: (id) => WEAPONS[id],
    ATTACH, ATTACH_ORDER,
    rollFind: () => FIND[Math.floor(Math.random() * FIND.length)],
  };
})(window.KTC);
