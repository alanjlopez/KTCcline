// main.js — bootstrap. Wires input + audio to the canvas and starts the game.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game');
    KTC.Audio.init();
    KTC.Input.init(canvas);

    // Unlock WebAudio on the first user gesture (browser autoplay policy).
    const unlock = () => { KTC.Audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    KTC.game = new KTC.Game(canvas);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.KTC);
