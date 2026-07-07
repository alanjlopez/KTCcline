// input.js — keyboard + mouse state. World-space mouse is filled in each frame
// by the game once the camera is known.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const Input = {
    keys: Object.create(null),        // physical code -> bool
    pressed: Object.create(null),     // edge: true on the frame first pressed
    mouse: { sx: 0, sy: 0, wx: 0, wy: 0, down: false, clicked: false, rdown: false, rclicked: false },
    // rebindable single-key actions (movement stays WASD/arrows)
    binds: { reload: 'KeyR', dodge: 'Space', loot: 'KeyE', showdown: 'KeyQ', pause: 'Escape', satchel: 'Tab', item: 'KeyF' },
    pad: { active: false, mx: 0, my: 0, aimX: 0, aimY: 0, aimMag: 0, shoot: false, _prev: [] },
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

    // action-level helpers (honour rebinds)
    actDown(a) { return !!this.keys[this.binds[a]]; },
    actPressed(a) { return !!this.pressed[this.binds[a]]; },

    // Poll gamepad into `pad` + synthesize key edges / aim so the rest of the
    // game keeps reading mouse+keys. Basic: left stick moves, right stick aims,
    // RT shoots, A dodge, X reload, B loot/use, RB showdown, Start pause.
    pollGamepad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (const g of pads) if (g) { gp = g; break; }
      const p = this.pad;
      if (!gp) { p.active = false; p.mx = 0; p.my = 0; p.aimMag = 0; p.shoot = false; return; }
      const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
      p.mx = dz(gp.axes[0] || 0); p.my = dz(gp.axes[1] || 0);
      p.aimX = dz(gp.axes[2] || 0); p.aimY = dz(gp.axes[3] || 0);
      p.aimMag = Math.hypot(p.aimX, p.aimY);
      p.active = !!(p.mx || p.my || p.aimMag || gp.buttons.some((b) => b.pressed));
      const b = gp.buttons.map((x) => x.pressed);
      const prev = p._prev;
      const edge = (i) => b[i] && !prev[i];
      p.shoot = !!(b[7] || b[5]);
      if (edge(0)) this.pressed[this.binds.dodge] = true;
      if (edge(2)) this.pressed[this.binds.reload] = true;
      if (edge(1)) this.pressed[this.binds.loot] = true;
      if (b[1]) this.keys[this.binds.loot] = true; else if (prev[1]) this.keys[this.binds.loot] = false;
      if (edge(4) || edge(6)) this.pressed[this.binds.showdown] = true;
      if (edge(3)) this.pressed[this.binds.item] = true;
      if (edge(9)) this.pressed[this.binds.pause] = true;
      p._prev = b;
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
