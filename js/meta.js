// meta.js — replayability metadata: achievements, unlockable cosmetics, and
// codex text for the bestiary. Pure data + tiny helpers; game.js drives unlocks.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const ACHIEVEMENTS = {
    first_extract: { name: 'Blood Money', desc: 'Extract for the first time.' },
    first_boss:    { name: 'Undertaker Undertaken', desc: 'Defeat the Undertaker.', reward: 'hat_top' },
    deep_extract:  { name: 'Into the Badlands', desc: 'Extract while in a tier-3 zone.', reward: 'hat_star' },
    centurion:     { name: 'Hundred Crows', desc: 'Kill 100 crows in total.' },
    tycoon:        { name: 'Frontier Tycoon', desc: 'Hold 500 gold in your stash.' },
    collector:     { name: 'Charmed', desc: 'Own 6 different trinkets.' },
  };

  const COSMETICS = {
    hat_default: { name: 'Gambler Hat' },
    hat_star:    { name: 'Sheriff Hat' },
    hat_top:     { name: 'Top Hat' },
  };

  const ENEMY_INFO = {
    rusher:   { name: 'Crow Rusher', desc: 'Rushes in and swings a knife after a brief raised-blade windup.' },
    gunman:   { name: 'Crow Gunman', desc: 'Stops and charges ~3s behind a glowing aim line, then fires one slow shot.' },
    sniper:   { name: 'Crow Sniper', desc: 'Charges ~5s; the laser locks for the final beat before a near-instant shot.' },
    brute:    { name: 'Crow Brute', desc: 'Leans back, then shoulder-charges in a straight line for two hearts.' },
    shielder: { name: 'Shielder', desc: 'A plank shield blocks bullets from the front — flank it or dodge around.' },
    bomber:   { name: 'Bomber', desc: 'Sprints in and detonates on contact; also explodes when shot.' },
    coyote:   { name: 'Coyote', desc: 'A fast beast that hunts in packs of three.' },
    boss:     { name: 'The Undertaker', desc: 'A hulking boss that summons crows and sweeps buckshot. Drops a guaranteed rare.' },
    hunter:   { name: 'Bounty Hunter', desc: 'A rival gunslinger with real HP who strafes, dodges and fires aimed shots. Rides in as the bounty on you climbs; drops premium spoils.' },
  };

  const ENEMY_ORDER = ['rusher', 'gunman', 'sniper', 'brute', 'shielder', 'bomber', 'coyote', 'boss', 'hunter'];

  KTC.Meta = {
    ACHIEVEMENTS, COSMETICS, ENEMY_INFO, ENEMY_ORDER,
    achOrder: Object.keys(ACHIEVEMENTS),
    // today's daily-run seed
    dailyCode() { return new Date().toISOString().slice(0, 10); },
    dailySeed() { return KTC.Util.hashSeed('KTC-' + KTC.Meta.dailyCode()); },
  };
})(window.KTC);
