// config.js — central tuning knobs so balance lives in one place instead of
// scattered magic numbers. Runtime-overridable bits (shake/volume) are mirrored
// from save.settings by the game; the rest are static defaults.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  KTC.Tune = {
    extract: { holdTime: 6, radius: 48 },
    threat: { base: 0.05, zoneMul: 0.05, milestone: 5 },
    spawn: { capBase: 6, capPerThreat: 1.1, capMax: 34 },
    feel: {
      hitStopKill: 0.03,      // seconds of freeze on a normal kill
      hitStopBoss: 0.11,      // on a boss/explosion
      camLead: 0.22,          // camera bias toward the crosshair (0..1)
      shakeMul: 1,            // overwritten from settings
      decalMax: 220,          // capped persistent ground marks
    },
    reload: { windowStart: 0.45, windowEnd: 0.72 },   // active-reload sweet spot (fraction of reload)
    audio: { volume: 0.35 },  // overwritten from settings
    difficulty: {
      rookie: { name: 'Rookie', threatMul: 0.7, rewardMul: 0.85, spawnMul: 0.8 },
      outlaw: { name: 'Outlaw', threatMul: 1.0, rewardMul: 1.0, spawnMul: 1.0 },
      legend: { name: 'Legend', threatMul: 1.4, rewardMul: 1.35, spawnMul: 1.3 },
    },
  };
})(window.KTC);
