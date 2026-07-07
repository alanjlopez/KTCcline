// weapons.js — data-driven gun definitions. Firing itself lives in player.js so
// the same stats can be reused by any shooter. Reload times are scaled by the
// player's reload upgrade at fire time.
//
// One bullet kills one crow, so guns differ by HANDLING, not damage: fire rate,
// range, spread, pellet count, magazine size, and reload time.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  // fireRate: seconds between shots. spread: radians of random cone.
  // proj: {speed,range,size}. pellets: projectiles per trigger pull.
  const WEAPONS = {
    revolver: {
      id: 'revolver', name: 'Revolver', sprite: 'revolver',
      magSize: 6, fireRate: 0.26, reloadTime: 1.15, spread: 0.03, pellets: 1,
      auto: false, kick: 4, price: 0, owned: true,
      proj: { speed: 620, range: 520, size: 3 },
      desc: 'Trusty six-shooter. One shot, one crow. Reliable at any range that matters.',
    },
    shotgun: {
      id: 'shotgun', name: 'Sawn-off', sprite: 'shotgun',
      magSize: 2, fireRate: 0.5, reloadTime: 1.5, spread: 0.3, pellets: 6,
      auto: false, kick: 9, price: 140,
      proj: { speed: 520, range: 220, size: 3 },
      desc: 'Six pellets, six dead crows if they bunch up. Useless past spitting distance.',
    },
    rifle: {
      id: 'rifle', name: 'Lever Rifle', sprite: 'rifle',
      magSize: 5, fireRate: 0.42, reloadTime: 1.35, spread: 0.008, pellets: 1,
      auto: false, kick: 5, price: 190,
      proj: { speed: 920, range: 820, size: 3 },
      desc: 'Reaches across the whole street. Slow between shots — make each one count.',
    },
    repeater: {
      id: 'repeater', name: 'Repeater', sprite: 'repeater',
      magSize: 14, fireRate: 0.11, reloadTime: 1.9, spread: 0.1, pellets: 1,
      auto: true, kick: 2.5, price: 260,
      proj: { speed: 680, range: 400, size: 2 },
      desc: 'Hold the trigger and hose them down. Sloppy aim, hungry cylinder, long reload.',
    },
  };

  const ORDER = ['revolver', 'shotgun', 'rifle', 'repeater'];

  KTC.Weapons = { defs: WEAPONS, order: ORDER, get: (id) => WEAPONS[id] };
})(window.KTC);
