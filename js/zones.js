// zones.js — biome definitions and the procedural world layout. The run world
// is one large map carved into a grid of zones; a zone's tier (distance from the
// entry) drives its biome, enemy mix, loot/material richness, and baseline
// threat. Deeper = deadlier, but the good scrap lives out there.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;

  // materials found on runs; banked on extract, lost on death
  const MATERIALS = {
    scrap: { name: 'Scrap', icon: '⚙️', color: '#9a8f7e' },
    iron:  { name: 'Iron', icon: '⛓️', color: '#8a9099' },
    relic: { name: 'Relic', icon: '🔮', color: '#9a6fd0' },
  };

  // Each biome: ground palettes + a debris accent + who lives there + how rich
  // the loot is + how many materials of each kind + baseline threat pressure.
  const BIOMES = {
    ghost: {
      name: 'Ghost Town',
      dirt: ['#3c372f', '#453f35', '#4f473b', '#39342c'],
      grass: ['#4a4e3c', '#525640', '#454a38', '#3e4234'],
      road: ['#443d35', '#4b433a', '#3d372f'],
      tuft: ['#565a44', '#4a4e3a', '#606552'],
      enemies: { rusher: 0.82, gunman: 0.18, sniper: 0, brute: 0 },
      threat: 0.35, richness: 1.0, density: 1.0,
      mats: { scrap: 1.0 }, minimap: '#5b6a4a',
    },
    flats: {
      name: 'Dust Flats',
      dirt: ['#5a4f3a', '#645736', '#6d6144', '#54492f'],
      grass: ['#6a5f42', '#746636', '#5f5636', '#6d6448'],
      road: ['#584c34', '#63563a', '#4d422c'],
      tuft: ['#8a7a4a', '#766634', '#9a8a52'],
      enemies: { rusher: 0.5, gunman: 0.32, sniper: 0.06, brute: 0.06, coyote: 0.06 },
      threat: 0.7, richness: 1.35, density: 1.1,
      mats: { scrap: 0.7, iron: 0.3 }, minimap: '#8a7a4a',
    },
    wood: {
      name: 'Deadwood',
      dirt: ['#33372a', '#3a4030', '#2e3427', '#3f4634'],
      grass: ['#3b4a30', '#42563a', '#354a30', '#2e3e28'],
      road: ['#33372a', '#3a4030', '#2b3024'],
      tuft: ['#4e6a3a', '#3a5a30', '#5a7a44'],
      enemies: { rusher: 0.42, gunman: 0.24, sniper: 0.1, brute: 0.1, shielder: 0.09, bomber: 0.05 },
      threat: 1.0, richness: 1.7, density: 1.2,
      mats: { scrap: 0.5, iron: 0.38, relic: 0.12 }, minimap: '#3f5a34',
    },
    badlands: {
      name: 'The Badlands',
      dirt: ['#4a2f28', '#54372c', '#3f2822', '#5c3d30'],
      grass: ['#43302a', '#4e372e', '#3a2824', '#523a30'],
      road: ['#3f2822', '#4a2f28', '#331f1a'],
      tuft: ['#7a4a3a', '#6a3a30', '#8a5a44'],
      enemies: { rusher: 0.3, gunman: 0.2, sniper: 0.13, brute: 0.12, shielder: 0.1, bomber: 0.09, coyote: 0.06 },
      threat: 1.45, richness: 2.3, density: 1.35,
      mats: { scrap: 0.35, iron: 0.4, relic: 0.25 }, minimap: '#6a3a30',
    },
  };

  const TIER_BIOME = ['ghost', 'flats', 'wood', 'badlands'];

  // Build the zone grid for a world. Entry is the bottom-left cell (tier 0);
  // tier grows with grid distance, so difficulty radiates outward.
  function buildLayout(cols, rows, cell) {
    cols = cols || 3; rows = rows || 2; cell = cell || 1200;
    const entryGx = 0, entryGy = rows - 1;
    const cells = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const tier = Math.abs(gx - entryGx) + Math.abs(gy - entryGy);
        const biome = TIER_BIOME[Math.min(tier, TIER_BIOME.length - 1)];
        cells.push({
          gx, gy, tier, biome,
          x: gx * cell, y: gy * cell, w: cell, h: cell,
          cx: gx * cell + cell / 2, cy: gy * cell + cell / 2,
          entry: gx === entryGx && gy === entryGy,
        });
      }
    }
    return {
      w: cols * cell, h: rows * cell, cell, cols, rows,
      cells,
      entry: cells.find((c) => c.entry),
    };
  }

  // Organic layout: scatter biome "cores" (Voronoi seeds) with min spacing;
  // difficulty tier radiates outward from the entry core. Regions become
  // irregular blobs instead of a grid. Uses Util's (possibly seeded) RNG.
  function buildOrganicLayout() {
    const w = 4000, h = 2800, N = 8, minD = 860;
    const entry = { x: w * 0.15, y: h * 0.8 };
    const cores = [{ x: entry.x, y: entry.y }];
    let guard = 0;
    while (cores.length < N && guard++ < 800) {
      const c = { x: U.rand(w * 0.08, w * 0.92), y: U.rand(h * 0.08, h * 0.92) };
      if (cores.every((o) => U.dist(o.x, o.y, c.x, c.y) > minD)) cores.push(c);
    }
    let maxD = 1;
    for (const c of cores) maxD = Math.max(maxD, U.dist(entry.x, entry.y, c.x, c.y));
    cores.forEach((c, i) => {
      const d = U.dist(entry.x, entry.y, c.x, c.y);
      c.tier = i === 0 ? 0 : Math.min(3, 1 + Math.floor(d / maxD * 2.6));
      c.biome = TIER_BIOME[c.tier];
      c.i = i;
    });
    // connect each core to its two nearest neighbours (for roads between zones)
    const edges = [];
    const seen = new Set();
    for (let i = 0; i < cores.length; i++) {
      const near = cores.map((c, j) => ({ j, d: U.dist2(cores[i].x, cores[i].y, c.x, c.y) }))
        .filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
      for (const o of near) { const key = Math.min(i, o.j) + '_' + Math.max(i, o.j); if (!seen.has(key)) { seen.add(key); edges.push([i, o.j]); } }
    }
    return { w, h, cores, edges, entry: cores[0] };
  }

  // nearest + second-nearest core to a point (for lookup + border blending)
  function nearestCore(cores, x, y) {
    let i = 0, d = 1e18, i2 = -1, d2 = 1e18;
    for (let k = 0; k < cores.length; k++) {
      const dd = U.dist2(x, y, cores[k].x, cores[k].y);
      if (dd < d) { d2 = d; i2 = i; d = dd; i = k; }
      else if (dd < d2) { d2 = dd; i2 = k; }
    }
    return { i, i2, d: Math.sqrt(d), d2: Math.sqrt(d2) };
  }

  KTC.Zones = {
    MATERIALS, BIOMES, TIER_BIOME, buildLayout, buildOrganicLayout, nearestCore,
    biome: (id) => BIOMES[id],
    matOrder: ['scrap', 'iron', 'relic'],
    // roll a material kind from a biome's weighted table
    rollMat(biome) {
      const w = BIOMES[biome].mats;
      const keys = Object.keys(w);
      let total = 0; for (const k of keys) total += w[k];
      let r = Math.random() * total;
      for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
      return keys[0];
    },
    // roll an enemy type from a biome's weighted table
    rollEnemy(biome) {
      const w = BIOMES[biome].enemies;
      const keys = Object.keys(w);
      let total = 0; for (const k of keys) total += w[k];
      let r = Math.random() * total;
      for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
      return 'rusher';
    },
  };
})(window.KTC);
