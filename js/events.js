// events.js — per-run world modifiers ("zone events"). One is rolled from the
// run seed at deploy (so daily runs reproduce it), announced with a banner, and
// its knobs are read by the spawner, threat curve, loot payout, and post-FX
// tint. They stack ON TOP of the biome/threat systems — a Gold Rush pays double
// but pulls a bounty; a Blood Moon wakes the Undertaker early.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  // Each event: display + a set of multipliers/flags the game reads.
  //  tint   — rgb overlay wash in renderPostFX (atmosphere; Phase D lighting builds on dark)
  //  fog    — dusty visibility haze (0..1)
  //  dark   — darkness wash (0..1)
  //  spawnMul / threatMul / lootMul / wantedMul — scale the matching systems
  //  spawnBias — { type: weight } nudges the crow mix
  //  bossTier — the zone tier at which the Undertaker may appear (default 3)
  const EVENTS = {
    clear: {
      id: 'clear', name: 'Clear Skies', weight: 5.0, banner: null,
      desc: 'A still, ordinary day on the frontier.',
    },
    sandstorm: {
      id: 'sandstorm', name: 'Sandstorm', weight: 1.4, banner: 'A SANDSTORM ROLLS IN',
      desc: 'Blinding dust — the crows close to knife range.',
      tint: [201, 161, 90], fog: 0.5, threatMul: 1.05, spawnBias: { rusher: 2.4, coyote: 2.0 },
    },
    night: {
      id: 'night', name: 'Dead of Night', weight: 1.4, banner: 'NIGHT FALLS',
      desc: 'Darkness narrows your sight; snipers love it.',
      tint: [32, 48, 74], dark: 0.5, spawnBias: { sniper: 1.8 },
    },
    goldrush: {
      id: 'goldrush', name: 'Gold Rush', weight: 1.1, banner: 'GOLD RUSH!',
      desc: 'Every haul pays double — and everyone wants you dead.',
      tint: [224, 176, 64], lootMul: 2, threatMul: 1.2, wantedMul: 1.7,
    },
    deadcalm: {
      id: 'deadcalm', name: 'Dead Calm', weight: 1.1, banner: 'AN EERIE CALM',
      desc: 'Few crows about… for now.',
      tint: [106, 122, 106], spawnMul: 0.6, threatMul: 0.8,
    },
    bloodmoon: {
      id: 'bloodmoon', name: 'Blood Moon', weight: 0.8, banner: 'A BLOOD MOON RISES',
      desc: 'The Undertaker stirs early and the brutes roam.',
      tint: [122, 30, 30], dark: 0.28, threatMul: 1.25, bossTier: 2,
      spawnBias: { brute: 1.8, shielder: 1.6 }, wantedMul: 1.3,
    },
  };

  const ORDER = Object.keys(EVENTS);

  const Events = {
    defs: EVENTS,
    order: ORDER,
    get: (id) => EVENTS[id] || EVENTS.clear,

    // weighted pick using a supplied rng() (seeded so daily runs reproduce)
    roll(rng) {
      rng = rng || Math.random;
      let total = 0;
      for (const id of ORDER) total += EVENTS[id].weight;
      let r = rng() * total;
      for (const id of ORDER) { r -= EVENTS[id].weight; if (r <= 0) return EVENTS[id]; }
      return EVENTS.clear;
    },
  };

  KTC.Events = Events;
})(window.KTC);
