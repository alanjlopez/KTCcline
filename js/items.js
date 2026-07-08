// items.js — active items / consumables. You carry ONE equipped active (chosen
// at the base, bought at the gunsmith) with a few charges that refill each raid;
// caches can top a charge up. Used with the "item" key (default F). Effects are
// resolved by game.js so they can reuse explode / fire zones / cover / traps.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const ITEMS = {
    medkit:   { name: 'Medkit', icon: '✚', color: '#c6533f', price: 120, kind: 'self',
      desc: 'Patch up — heal 2 hearts.' },
    dynamite: { name: 'Dynamite', icon: '✸', color: '#e07a3a', price: 150, kind: 'throw', blast: 46,
      desc: 'Lob a bundle that bursts on impact.' },
    molotov:  { name: 'Molotov', icon: '❂', color: '#f0a040', price: 170, kind: 'throw', fire: true,
      desc: 'Firebomb that leaves burning ground for a while.' },
    barricade:{ name: 'Barricade', icon: '▤', color: '#8a7350', price: 130, kind: 'deploy', deploy: 'cover',
      desc: 'Drop temporary cover that blocks bullets.' },
    beartrap: { name: 'Bear Trap', icon: '☒', color: '#8a8d94', price: 110, kind: 'deploy', deploy: 'trap',
      desc: 'Set a trap that kills the first crow to step on it.' },
  };

  const ORDER = ['medkit', 'dynamite', 'molotov', 'barricade', 'beartrap'];

  KTC.Items = {
    defs: ITEMS, order: ORDER, get: (id) => ITEMS[id],
    MAX_CHARGES: 2,
  };
})(window.KTC);
