// input.js — keyboard + mouse state. World-space mouse is filled in each frame
// by the game once the camera is known.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const Input = {
    keys: Object.create(null),        // physical code -> bool
    pressed: Object.create(null),     // edge: true on the frame first pressed
    mouse: { sx: 0, sy: 0, wx: 0, wy: 0, down: false, clicked: false, rdown: false, rclicked: false },
    _canvas: null,

    init(canvas) {
      this._canvas = canvas;

      window.addEventListener('keydown', (e) => {
        if (!this.keys[e.code]) this.pressed[e.code] = true;
        this.keys[e.code] = true;
        // Stop space/arrows from scrolling and Tab from moving focus while playing.
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
          e.preventDefault();
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      window.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.sx = (e.clientX - r.left) * (canvas.width / r.width);
        this.mouse.sy = (e.clientY - r.top) * (canvas.height / r.height);
      });

      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
        if (e.button === 2) { this.mouse.rdown = true; this.mouse.rclicked = true; }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.down = false;
        if (e.button === 2) this.mouse.rdown = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    // True only on the first frame a key went down.
    justPressed(code) {
      return !!this.pressed[code];
    },

    anyDown(codes) {
      for (const c of codes) if (this.keys[c]) return true;
      return false;
    },

    // Clear per-frame edge state. Called at the end of each frame.
    endFrame() {
      this.pressed = Object.create(null);
      this.mouse.clicked = false;
      this.mouse.rclicked = false;
    },

    // Reset held state (used on focus loss / state changes).
    clear() {
      this.keys = Object.create(null);
      this.pressed = Object.create(null);
      this.mouse.down = false;
    },
  };

  KTC.Input = Input;
})(window.KTC);
