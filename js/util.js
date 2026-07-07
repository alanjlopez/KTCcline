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

    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    randInt(min, max) {
      return Math.floor(min + Math.random() * (max - min + 1));
    },

    pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },

    chance(p) {
      return Math.random() < p;
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
