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
      if (!L || !L.cores) return null;
      return L.cores[Z.nearestCore(L.cores, x, y).i];
    }

    _reset() { this.solids = []; this.props = []; this.containers = []; this.benches = []; this.extractionPoints = []; }

    // ================= WORLD =================
    // `seed` (optional) makes the whole world deterministic (daily runs). We
    // seed the shared RNG for the duration of generation, then restore it.
    generateWorld(seed) {
      this._reset();
      this.mode = 'world';
      const prevRng = U.rng;
      if (seed != null) U.useSeed(seed >>> 0);
      const L = Z.buildOrganicLayout();
      this.w = L.w; this.h = L.h; this.zones = L;
      this._paintWorld(L);
      for (const core of L.cores) this._populateCore(core, L);
      this.spawn = { x: L.entry.x, y: L.entry.y + 40 };
      U.rng = prevRng;
    }

    _paintWorld(L) {
      const bg = document.createElement('canvas');
      bg.width = this.w; bg.height = this.h;
      const g = bg.getContext('2d');
      const T = 8;
      const cores = L.cores;
      for (let y = 0; y < this.h; y += T) {
        for (let x = 0; x < this.w; x += T) {
          const nc = Z.nearestCore(cores, x, y);
          let b = Z.biome(cores[nc.i].biome);
          // blend the border: near the boundary, sometimes use the neighbour's
          // palette so regions bleed together instead of hard-seaming
          if (nc.i2 >= 0 && (nc.d2 - nc.d) < 60 && U.rng() < 0.5 - (nc.d2 - nc.d) / 120) b = Z.biome(cores[nc.i2].biome);
          // organic dirt/grass patches via value noise
          const n = KTC.Util.noise2D(x / 240, y / 240);
          const pal = n < 0.44 ? b.dirt : b.grass;
          g.fillStyle = pal[(U.rng() * pal.length) | 0];
          g.fillRect(x, y, T, T);
          if (U.rng() < 0.12) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + ((U.rng() * T) | 0), y + ((U.rng() * T) | 0), 2, 2); }
        }
      }
      // roads connecting neighbouring cores (routes + chokepoints)
      g.lineCap = 'round';
      for (const [a, c] of L.edges) {
        const pa = cores[a], pc = cores[c];
        const mid = { x: (pa.x + pc.x) / 2 + U.rand(-200, 200), y: (pa.y + pc.y) / 2 + U.rand(-200, 200) };
        g.strokeStyle = 'rgba(40,34,26,0.5)'; g.lineWidth = 26;
        g.beginPath(); g.moveTo(pa.x, pa.y); g.quadraticCurveTo(mid.x, mid.y, pc.x, pc.y); g.stroke();
        g.strokeStyle = Z.biome('ghost').road[0]; g.lineWidth = 18;
        g.beginPath(); g.moveTo(pa.x, pa.y); g.quadraticCurveTo(mid.x, mid.y, pc.x, pc.y); g.stroke();
      }
      // ground debris tinted per nearest biome
      for (let i = 0; i < 1400; i++) {
        const x = U.rand(0, this.w), y = U.rand(0, this.h);
        const b = Z.biome(cores[Z.nearestCore(cores, x, y).i].biome);
        const roll = U.rng();
        if (roll < 0.6) S.tuft(g, x, y, U.pick(b.tuft));
        else if (roll < 0.82) S.rock(g, x, y, U.randInt(2, 4));
        else S.plank(g, x, y, U.randInt(8, 16), U.rand(0, U.TAU));
      }
      this.bg = bg;
    }

    // populate one biome region — sample points around the core and keep those
    // whose nearest core is this one (so props stay inside the irregular blob)
    _populateCore(core, L) {
      const b = Z.biome(core.biome);
      const tints = ['#5a4c3c', '#544636', '#63513e', '#4d4030'];
      const R = 720;
      const inRegion = (margin) => {
        for (let t = 0; t < 16; t++) {
          const a = U.rand(0, U.TAU), r = U.rand(60, R);
          const x = U.clamp(core.x + Math.cos(a) * r, margin, this.w - margin);
          const y = U.clamp(core.y + Math.sin(a) * r, margin, this.h - margin);
          if (Z.nearestCore(L.cores, x, y).i === core.i) return { x, y };
        }
        return { x: core.x, y: core.y };
      };

      const nBuild = U.randInt(1, 3);
      for (let i = 0; i < nBuild; i++) {
        const p = inRegion(100);
        const w = U.randInt(64, 110), h = U.randInt(44, 68);
        this.props.push(new Prop(p.x, p.y, 'building', { w, h, tint: U.pick(tints) }));
        this.addSolid(p.x - w / 2, p.y - 14, w, 16, true);
      }
      for (let i = 0; i < Math.round(6 * b.density); i++) {
        const p = inRegion(50); const len = U.randInt(40, 84);
        const roll = U.rng();
        if (roll < 0.4) { this.props.push(new Prop(p.x, p.y, 'log', { len })); this.addSolid(p.x - len / 2, p.y - 8, len, 9, true); }
        else if (roll < 0.75) this.props.push(new Prop(p.x, p.y, 'fence', { len }));
        else this.props.push(new Prop(p.x, p.y, 'pole', {}));
      }
      const nCont = Math.round(11 * b.density);
      for (let i = 0; i < nCont; i++) { const p = inRegion(40); this.addContainer(p.x, p.y, U.chance(0.55) ? 'crate' : 'barrel', core.biome, b.richness); }
      if (U.chance(0.8)) { const p = inRegion(60); this.addContainer(p.x, p.y, U.chance(0.5) ? 'well' : 'wagon', core.biome, b.richness); }
      if (U.chance(0.35 + core.tier * 0.2)) { const p = inRegion(60); this.addContainer(p.x, p.y, 'cache', core.biome, b.richness); }
      if (U.chance(0.4 + core.tier * 0.1)) { const p = inRegion(60); this.addContainer(p.x, p.y, 'weaponrack', core.biome, b.richness); }

      // extraction at the core, nudged clear of solids
      let ex = { x: core.x, y: core.y };
      for (let tries = 0; tries < 14; tries++) {
        let clear = true;
        for (const s of this.solids) if (ex.x > s.x - 20 && ex.x < s.x + s.w + 20 && ex.y > s.y - 20 && ex.y < s.y + s.h + 20) { clear = false; break; }
        if (clear) break;
        ex = { x: core.x + U.rand(-120, 120), y: core.y + U.rand(-120, 120) };
      }
      this.extractionPoints.push({ x: ex.x, y: ex.y, biome: core.biome, tier: core.tier, progress: 0, holding: false });
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
