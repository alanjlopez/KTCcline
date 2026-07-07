// level.js — the hybrid town. A single open, camera-following map with a dirt
// crossroads, a row of main-street buildings, scattered cover, and lootable
// containers. Ground is pre-rendered once to an offscreen canvas; tall props and
// containers are y-sorted with the actors each frame. Layout is re-seeded per
// raid so no two raids feel identical.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;

  class Prop {
    constructor(x, y, kind, opts) { this.x = x; this.y = y; this.kind = kind; this.opts = opts || {}; }
    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const o = this.opts;
      if (this.kind === 'building') S.building(ctx, o.w, o.h, o.tint);
      else if (this.kind === 'log') S.log(ctx, o.len);
      else if (this.kind === 'fence') S.fence(ctx, o.len);
      else if (this.kind === 'pole') S.pole(ctx);
      ctx.restore();
    }
  }

  class Level {
    constructor() {
      this.w = 2400; this.h = 1700;
      this.solids = [];
      this.props = [];
      this.containers = [];
      this.extractCandidates = [];
      this.bg = null;
      this.spawn = { x: this.w / 2, y: this.h * 0.62 };
    }

    addSolid(x, y, w, h, blocksBullets, container) {
      this.solids.push({ x, y, w, h, blocksBullets: blocksBullets !== false, container: container || null });
    }

    addContainer(x, y, type) {
      const c = new KTC.Loot.Container(x, y, type);
      this.containers.push(c);
      // footprint used as a soft obstacle until it is opened
      const bw = type === 'well' ? 30 : type === 'wagon' ? 34 : type === 'barrel' ? 12 : 14;
      const bh = type === 'well' ? 14 : type === 'wagon' ? 12 : type === 'barrel' ? 13 : 12;
      this.addSolid(x - bw / 2, y - bh, bw, bh, false, c);
      return c;
    }

    generate() {
      this.solids = []; this.props = []; this.containers = []; this.extractCandidates = [];
      this._buildGround();
      this._buildTown();
      this.spawn = { x: this.w / 2 + U.rand(-40, 40), y: this.h * 0.6 };
      // candidate extraction spots near the map edges
      this.extractCandidates = [
        { x: this.w * 0.14, y: this.h * 0.16 },
        { x: this.w * 0.86, y: this.h * 0.2 },
        { x: this.w * 0.12, y: this.h * 0.84 },
        { x: this.w * 0.88, y: this.h * 0.82 },
        { x: this.w * 0.5, y: this.h * 0.12 },
      ];
    }

    _buildGround() {
      const bg = document.createElement('canvas');
      bg.width = this.w; bg.height = this.h;
      const g = bg.getContext('2d');
      const T = 8;

      const roadY0 = this.h * 0.34, roadY1 = this.h * 0.5;
      const roadX0 = this.w * 0.44, roadX1 = this.w * 0.56;

      for (let y = 0; y < this.h; y += T) {
        for (let x = 0; x < this.w; x += T) {
          const onRoad = (y > roadY0 && y < roadY1) || (x > roadX0 && x < roadX1);
          const pal = onRoad ? S.PAL.road : S.PAL.grass;
          g.fillStyle = pal[(Math.random() * pal.length) | 0];
          g.fillRect(x, y, T, T);
          // subtle dither speckle
          if (Math.random() < 0.14) {
            g.fillStyle = 'rgba(0,0,0,0.12)';
            g.fillRect(x + ((Math.random() * T) | 0), y + ((Math.random() * T) | 0), 2, 2);
          }
        }
      }

      // scatter ground debris onto the grass
      for (let i = 0; i < 420; i++) {
        const x = U.rand(0, this.w), y = U.rand(0, this.h);
        const onRoad = (y > roadY0 && y < roadY1) || (x > roadX0 && x < roadX1);
        if (onRoad) { if (U.chance(0.6)) continue; }
        const roll = Math.random();
        if (roll < 0.55) S.tuft(g, x, y, U.pick(['#565a44', '#4a4e3a', '#606552']));
        else if (roll < 0.8) S.rock(g, x, y, U.randInt(2, 4));
        else S.plank(g, x, y, U.randInt(8, 16), U.rand(0, U.TAU));
      }
      this.bg = bg;
    }

    _buildTown() {
      const tints = ['#5a4c3c', '#544636', '#63513e', '#4d4030'];
      // main-street buildings along the top
      let bx = this.w * 0.12;
      while (bx < this.w * 0.9) {
        const w = U.randInt(70, 120);
        const h = U.randInt(46, 74);
        const y = this.h * 0.2 + U.rand(-10, 20);
        this.props.push(new Prop(bx, y, 'building', { w, h, tint: U.pick(tints) }));
        this.addSolid(bx - w / 2, y - 14, w, 16, true);
        // stoop crates by some buildings
        if (U.chance(0.5)) this.addContainer(bx + U.rand(-w / 3, w / 3), y + U.rand(6, 16), U.chance(0.6) ? 'crate' : 'barrel');
        bx += w + U.randInt(60, 140);
      }

      // a couple of side buildings
      this.props.push(new Prop(this.w * 0.08, this.h * 0.55, 'building', { w: 90, h: 60, tint: U.pick(tints) }));
      this.addSolid(this.w * 0.08 - 45, this.h * 0.55 - 14, 90, 16, true);
      this.props.push(new Prop(this.w * 0.92, this.h * 0.62, 'building', { w: 96, h: 64, tint: U.pick(tints) }));
      this.addSolid(this.w * 0.92 - 48, this.h * 0.62 - 14, 96, 16, true);

      // telegraph poles down the road
      for (let i = 0; i < 6; i++) {
        this.props.push(new Prop(this.w * 0.47, this.h * (0.15 + i * 0.14), 'pole', {}));
      }

      // fences
      for (let i = 0; i < 7; i++) {
        const len = U.randInt(40, 90);
        this.props.push(new Prop(U.rand(this.w * 0.15, this.w * 0.85), U.rand(this.h * 0.3, this.h * 0.9), 'fence', { len }));
      }

      // fallen logs (cover)
      for (let i = 0; i < 6; i++) {
        const len = U.randInt(40, 80);
        const x = U.rand(this.w * 0.2, this.w * 0.85), y = U.rand(this.h * 0.35, this.h * 0.92);
        this.props.push(new Prop(x, y, 'log', { len }));
        this.addSolid(x - len / 2, y - 8, len, 9, true);
      }

      // the well + a wagon as high-value lootable landmarks
      this.addContainer(this.w * 0.78, this.h * 0.3, 'well');
      this.addContainer(this.w * 0.24, this.h * 0.74, 'wagon');
      this.addContainer(this.w * 0.62, this.h * 0.7, 'wagon');

      // scattered crates/barrels around the square
      for (let i = 0; i < 12; i++) {
        const x = U.rand(this.w * 0.14, this.w * 0.86);
        const y = U.rand(this.h * 0.3, this.h * 0.94);
        // keep off the immediate spawn
        if (U.dist(x, y, this.w / 2, this.h * 0.6) < 90) continue;
        this.addContainer(x, y, U.chance(0.55) ? 'crate' : 'barrel');
      }
    }

    renderBackground(ctx) {
      ctx.drawImage(this.bg, 0, 0);
    }
  }

  KTC.Level = Level;
})(window.KTC);
