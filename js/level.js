// level.js — two kinds of map:
//   generateWorld() — a large procedurally-generated run map carved into a grid
//     of biome zones (see zones.js). Tier grows with distance from the entry, so
//     difficulty, loot, materials, and threat all radiate outward. Every zone
//     has its own extraction point.
//   generateBase() — the small walkable home hub with upgradeable benches you
//     approach and use (deploy, workbench, gunsmith).
// Ground is pre-rendered once to an offscreen canvas; tall props / containers /
// benches are y-sorted with the actors each frame.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;
  const Z = KTC.Zones;

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
      else if (this.kind === 'tent') S.tent(ctx, o.tint);
      else if (this.kind === 'campfire') S.campfire(ctx);
      else if (this.kind === 'gate') S.gate(ctx);
      ctx.restore();
    }
  }

  class Bench {
    constructor(x, y, type, label) { this.x = x; this.y = y; this.type = type; this.label = label; this.r = 40; }
    render(ctx) { ctx.save(); ctx.translate(this.x, this.y); S.bench(ctx, this.type); ctx.restore(); }
  }

  class Level {
    constructor() {
      this.mode = 'world';
      this.w = 2400; this.h = 1700;
      this.solids = [];
      this.props = [];
      this.containers = [];
      this.benches = [];
      this.extractionPoints = [];
      this.zones = null;
      this.bg = null;
      this.spawn = { x: this.w / 2, y: this.h * 0.62 };
    }

    addSolid(x, y, w, h, blocksBullets, container) {
      this.solids.push({ x, y, w, h, blocksBullets: blocksBullets !== false, container: container || null });
    }

    addContainer(x, y, type, biome, richness) {
      const c = new KTC.Loot.Container(x, y, type);
      c.biome = biome || 'ghost';
      c.richness = richness || 1;
      this.containers.push(c);
      const bw = type === 'well' ? 30 : type === 'wagon' ? 34 : type === 'barrel' ? 12 : 14;
      const bh = type === 'well' ? 14 : type === 'wagon' ? 12 : type === 'barrel' ? 13 : 12;
      this.addSolid(x - bw / 2, y - bh, bw, bh, false, c);
      return c;
    }

    zoneAt(x, y) {
      const L = this.zones;
      if (!L) return null;
      const gx = U.clamp(Math.floor(x / L.cell), 0, L.cols - 1);
      const gy = U.clamp(Math.floor(y / L.cell), 0, L.rows - 1);
      return L.cells[gy * L.cols + gx];
    }

    _reset() { this.solids = []; this.props = []; this.containers = []; this.benches = []; this.extractionPoints = []; }

    // ================= WORLD =================
    generateWorld() {
      this._reset();
      this.mode = 'world';
      const L = Z.buildLayout(3, 2, 1200);
      this.w = L.w; this.h = L.h; this.zones = L;
      this._paintWorld(L);
      for (const cell of L.cells) this._populateZone(cell);
      this.spawn = { x: L.entry.cx, y: L.entry.cy + 40 };
    }

    _paintWorld(L) {
      const bg = document.createElement('canvas');
      bg.width = this.w; bg.height = this.h;
      const g = bg.getContext('2d');
      const T = 8;
      for (const cell of L.cells) {
        const b = Z.biome(cell.biome);
        for (let y = cell.y; y < cell.y + cell.h; y += T) {
          for (let x = cell.x; x < cell.x + cell.w; x += T) {
            const pal = Math.random() < 0.34 ? b.dirt : b.grass;
            g.fillStyle = pal[(Math.random() * pal.length) | 0];
            g.fillRect(x, y, T, T);
            if (Math.random() < 0.12) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + ((Math.random() * T) | 0), y + ((Math.random() * T) | 0), 2, 2); }
          }
        }
        // scatter debris in the zone's tint
        const debris = Math.floor(90 * b.density);
        for (let i = 0; i < debris; i++) {
          const x = U.rand(cell.x, cell.x + cell.w), y = U.rand(cell.y, cell.y + cell.h);
          const roll = Math.random();
          if (roll < 0.6) S.tuft(g, x, y, U.pick(b.tuft));
          else if (roll < 0.82) S.rock(g, x, y, U.randInt(2, 4));
          else S.plank(g, x, y, U.randInt(8, 16), U.rand(0, U.TAU));
        }
      }
      // darken the seams between zones so regions read as distinct
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let gx = 1; gx < L.cols; gx++) g.fillRect(gx * L.cell - 3, 0, 6, this.h);
      for (let gy = 1; gy < L.rows; gy++) g.fillRect(0, gy * L.cell - 3, this.w, 6);
      this.bg = bg;
    }

    _populateZone(cell) {
      const b = Z.biome(cell.biome);
      const tints = ['#5a4c3c', '#544636', '#63513e', '#4d4030'];
      const inCell = (mx, my) => ({ x: U.rand(cell.x + mx, cell.x + cell.w - mx), y: U.rand(cell.y + my, cell.y + cell.h - my) });

      // buildings (fewer, they're big) — kept off the zone edges
      const nBuild = U.randInt(1, 3);
      for (let i = 0; i < nBuild; i++) {
        const p = inCell(90, 90);
        const w = U.randInt(64, 110), h = U.randInt(44, 68);
        this.props.push(new Prop(p.x, p.y, 'building', { w, h, tint: U.pick(tints) }));
        this.addSolid(p.x - w / 2, p.y - 14, w, 16, true);
      }
      // cover: fences, logs, poles
      for (let i = 0; i < Math.round(4 * b.density); i++) {
        const p = inCell(40, 40); const len = U.randInt(40, 84);
        const roll = Math.random();
        if (roll < 0.4) { this.props.push(new Prop(p.x, p.y, 'log', { len })); this.addSolid(p.x - len / 2, p.y - 8, len, 9, true); }
        else if (roll < 0.75) this.props.push(new Prop(p.x, p.y, 'fence', { len }));
        else this.props.push(new Prop(p.x, p.y, 'pole', {}));
      }
      // lootable containers, scaled by richness/density
      const nCont = Math.round(9 * b.density);
      for (let i = 0; i < nCont; i++) {
        const p = inCell(40, 40);
        const t = U.chance(0.55) ? 'crate' : 'barrel';
        this.addContainer(p.x, p.y, t, cell.biome, b.richness);
      }
      if (U.chance(0.7)) { const p = inCell(60, 60); this.addContainer(p.x, p.y, U.chance(0.5) ? 'well' : 'wagon', cell.biome, b.richness); }
      // roguelike caches + a weapon rack — more common the deeper you go
      const cacheChance = 0.35 + cell.tier * 0.2;
      if (U.chance(cacheChance)) { const p = inCell(60, 60); this.addContainer(p.x, p.y, 'cache', cell.biome, b.richness); }
      if (U.chance(0.4 + cell.tier * 0.1)) { const p = inCell(60, 60); this.addContainer(p.x, p.y, 'weaponrack', cell.biome, b.richness); }

      // one extraction point per zone, nudged clear of any solid
      let ex = { x: cell.cx + U.rand(-120, 120), y: cell.cy + U.rand(-120, 120) };
      for (let tries = 0; tries < 12; tries++) {
        let clear = true;
        for (const s of this.solids) if (ex.x > s.x - 20 && ex.x < s.x + s.w + 20 && ex.y > s.y - 20 && ex.y < s.y + s.h + 20) { clear = false; break; }
        if (clear) break;
        ex = { x: cell.cx + U.rand(-140, 140), y: cell.cy + U.rand(-140, 140) };
      }
      this.extractionPoints.push({ x: ex.x, y: ex.y, biome: cell.biome, tier: cell.tier, progress: 0, holding: false });
    }

    // ================= BASE HUB =================
    generateBase() {
      this._reset();
      this.mode = 'base';
      this.zones = null;
      this.w = 1200; this.h = 880;
      this._paintBase();
      // perimeter fences with a gap up top
      for (let x = 60; x < this.w - 60; x += 40) {
        if (x > this.w * 0.4 && x < this.w * 0.6) continue;   // gate gap
        this.props.push(new Prop(x, 70, 'fence', { len: 40 }));
      }
      this.props.push(new Prop(this.w * 0.5, 66, 'gate', {}));
      // flavor props
      this.props.push(new Prop(this.w * 0.5, this.h * 0.82, 'campfire', {}));
      this.props.push(new Prop(this.w * 0.16, this.h * 0.42, 'tent', { tint: '#6a5238' }));
      this.props.push(new Prop(this.w * 0.85, this.h * 0.42, 'tent', { tint: '#5a4a38' }));

      // benches — the interactive heart of the base, clustered so you can see
      // them the moment you spawn in
      this.benches = [
        new Bench(this.w * 0.5, this.h * 0.44, 'deploy', 'MAP TABLE'),
        new Bench(this.w * 0.37, this.h * 0.56, 'workbench', 'WORKBENCH'),
        new Bench(this.w * 0.63, this.h * 0.56, 'gunsmith', 'GUNSMITH'),
      ];
      for (const bn of this.benches) this.addSolid(bn.x - 14, bn.y - 10, 28, 12, true);

      this.spawn = { x: this.w * 0.5, y: this.h * 0.68 };
    }

    _paintBase() {
      const bg = document.createElement('canvas');
      bg.width = this.w; bg.height = this.h;
      const g = bg.getContext('2d');
      const T = 8;
      const dirt = ['#4a4238', '#524a3e', '#453e34', '#403a30'];
      const grass = ['#454a38', '#4e5240', '#3e4234'];
      for (let y = 0; y < this.h; y += T) {
        for (let x = 0; x < this.w; x += T) {
          // packed-dirt clearing in the middle, grass toward the edges
          const edge = Math.min(x, y, this.w - x, this.h - y);
          const pal = edge < 90 ? grass : (Math.random() < 0.7 ? dirt : grass);
          g.fillStyle = pal[(Math.random() * pal.length) | 0];
          g.fillRect(x, y, T, T);
          if (Math.random() < 0.1) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x, y, 2, 2); }
        }
      }
      // a worn path from the gate down to the benches
      g.fillStyle = 'rgba(30,26,20,0.4)';
      g.fillRect(this.w * 0.5 - 26, 70, 52, this.h - 120);
      for (let i = 0; i < 200; i++) S.tuft(g, U.rand(0, this.w), U.rand(0, this.h), U.pick(grass));
      this.bg = bg;
    }

    renderBackground(ctx) { ctx.drawImage(this.bg, 0, 0); }
  }

  KTC.Level = Level;
})(window.KTC);
