// util.js — math, RNG, and collision helpers shared across the game.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  const TAU = Math.PI * 2;

  const Util = {
    TAU,

    clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    // Move `a` toward `b` by at most `step`.
    approach(a, b, step) {
      if (a < b) return Math.min(a + step, b);
      if (a > b) return Math.max(a - step, b);
      return a;
    },

    dist(ax, ay, bx, by) {
      return Math.hypot(bx - ax, by - ay);
    },

    dist2(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      return dx * dx + dy * dy;
    },

    angle(ax, ay, bx, by) {
      return Math.atan2(by - ay, bx - ax);
    },

    // Shortest signed difference between two angles.
    angleDiff(a, b) {
      let d = (b - a) % TAU;
      if (d < -Math.PI) d += TAU;
      if (d > Math.PI) d -= TAU;
      return d;
    },

    // Seeded RNG (mulberry32). Returns a function() -> [0,1). Used so a daily
    // seed reproduces the same world/loot. `Util.rng` points at the active
    // source (Math.random by default) so existing rand/randInt/pick stay seeded.
    makeRNG(seed) {
      let a = (seed >>> 0) || 1;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // Hash a string to a 32-bit seed (for daily codes etc.).
    hashSeed(str) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    rng: Math.random,               // active random source
    useSeed(seed) { Util.rng = seed == null ? Math.random : Util.makeRNG(seed); },

    // Smooth value noise in [0,1] over a hashed integer lattice.
    noise2D(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const h = (a, b) => {
        let n = Math.imul((a & 0xffff) ^ 0x9e37, 0x85eb) ^ Math.imul((b & 0xffff) ^ 0xc2b2, 0x27d4);
        n = (n ^ (n >>> 13)) >>> 0;
        return (n & 0xffff) / 0xffff;
      };
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return Util.lerp(Util.lerp(a, b, u), Util.lerp(c, d, u), v);
    },

    rand(min, max) {
      return min + Util.rng() * (max - min);
    },

    randInt(min, max) {
      return Math.floor(min + Util.rng() * (max - min + 1));
    },

    pick(arr) {
      return arr[Math.floor(Util.rng() * arr.length)];
    },

    chance(p) {
      return Util.rng() < p;
    },

    // Circle vs circle overlap.
    circleHit(ax, ay, ar, bx, by, br) {
      const r = ar + br;
      return Util.dist2(ax, ay, bx, by) < r * r;
    },

    // Circle (px,py,pr) vs axis-aligned rect (rx,ry,rw,rh). Returns push-out
    // vector {x,y} if overlapping, else null.
    circleRect(px, py, pr, rx, ry, rw, rh) {
      const cx = Util.clamp(px, rx, rx + rw);
      const cy = Util.clamp(py, ry, ry + rh);
      const dx = px - cx, dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= pr * pr) return null;
      const d = Math.sqrt(d2) || 0.0001;
      const overlap = pr - d;
      // If the center is inside the rect, push out the shallowest axis.
      if (d2 < 0.0001) {
        const left = px - rx, right = rx + rw - px;
        const top = py - ry, bottom = ry + rh - py;
        const m = Math.min(left, right, top, bottom);
        if (m === left) return { x: -pr, y: 0 };
        if (m === right) return { x: pr, y: 0 };
        if (m === top) return { x: 0, y: -pr };
        return { x: 0, y: pr };
      }
      return { x: (dx / d) * overlap, y: (dy / d) * overlap };
    },

    formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    },
  };

  KTC.Util = Util;
})(window.KTC);
