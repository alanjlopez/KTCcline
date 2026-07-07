// weapons.js — data-driven gun definitions. Firing itself lives in player.js so
// the same stats can be reused by any shooter. Reload times are scaled by the
// player's reload upgrade at fire time.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  // fireRate: seconds between shots. spread: radians of random cone.
  // proj: {speed,damage,range,size,pierce}. pellets: shots per trigger pull.
  const WEAPONS = {
    revolver: {
      id: 'revolver', name: 'Revolver', sprite: 'revolver',
      magSize: 6, fireRate: 0.28, reloadTime: 1.15, spread: 0.03, pellets: 1,
      auto: false, kick: 4, price: 0, owned: true,
      proj: { speed: 620, damage: 26, range: 520, size: 3, pierce: 0 },
      desc: 'Trusty six-shooter. Reliable, accurate, and always in your holster.',
    },
    shotgun: {
      id: 'shotgun', name: 'Sawn-off', sprite: 'shotgun',
      magSize: 2, fireRate: 0.55, reloadTime: 1.5, spread: 0.28, pellets: 6,
      auto: false, kick: 9, price: 140,
      proj: { speed: 520, damage: 12, range: 240, size: 3, pierce: 0 },
      desc: 'Two barrels of close-range devastation. Devastating up close, useless far.',
    },
    rifle: {
      id: 'rifle', name: 'Lever Rifle', sprite: 'rifle',
      magSize: 5, fireRate: 0.32, reloadTime: 1.35, spread: 0.012, pellets: 1,
      auto: false, kick: 5, price: 190,
      proj: { speed: 820, damage: 42, range: 760, size: 3, pierce: 1 },
      desc: 'Long, accurate, and hard-hitting. Punches through the first crow it meets.',
    },
    repeater: {
      id: 'repeater', name: 'Repeater', sprite: 'repeater',
      magSize: 14, fireRate: 0.09, reloadTime: 1.9, spread: 0.08, pellets: 1,
      auto: true, kick: 2.5, price: 260,
      proj: { speed: 700, damage: 14, range: 480, size: 2, pierce: 0 },
      desc: 'Hold the trigger and let the lead fly. Chews ammo fast — mind the reload.',
    },
  };

  const ORDER = ['revolver', 'shotgun', 'rifle', 'repeater'];

  KTC.Weapons = { defs: WEAPONS, order: ORDER, get: (id) => WEAPONS[id] };
})(window.KTC);
