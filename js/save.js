// save.js — persistent stash between raids. Stores banked gold, owned/equipped
// weapons, upgrade levels, and lifetime stats in localStorage (with an
// in-memory fallback if storage is unavailable, e.g. some file:// contexts).
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const KEY = 'ktc_save_v1';

  // Upgrade tracks: level 0..max. `apply` folds the level into derived stats.
  const UPGRADES = {
    maxHp:  { name: 'Iron Constitution', desc: '+1 max health', max: 5, base: 60, step: 45 },
    ammo:   { name: 'Deep Pockets',      desc: '+1 cylinder capacity', max: 5, base: 55, step: 40 },
    reload: { name: 'Quick Hands',       desc: 'Faster reloads', max: 4, base: 70, step: 55 },
    dodge:  { name: 'Cat Reflexes',      desc: 'Shorter dodge cooldown', max: 4, base: 70, step: 55 },
    speed:  { name: 'Trail Legs',        desc: 'Faster movement', max: 5, base: 55, step: 45 },
    satchel:{ name: 'Bigger Satchel',    desc: '+1 valuable slot', max: 4, base: 50, step: 40 },
    slots:  { name: 'Trinket Belt',      desc: '+1 equipped trinket slot', max: 3, base: 90, step: 80 },
  };

  function defaults() {
    return {
      gold: 0,
      materials: { scrap: 0, iron: 0, relic: 0 },   // crafting stockpile
      benches: { workbench: 1, gunsmith: 1 },        // bench levels (base hub)
      weapons: { revolver: true },
      equipped: 'revolver',
      trinkets: {},                 // owned trinket ids
      loadout: [],                  // equipped trinkets brought into a raid
      items: {},                    // owned active items
      activeEquipped: null,         // equipped active item id
      attachments: {},              // per-weapon: { weaponId: { attachId: true } }
      upgrades: { maxHp: 0, ammo: 0, reload: 0, dodge: 0, speed: 0, satchel: 0, slots: 0 },
      stats: { extractions: 0, raids: 0, deaths: 0, bestLoot: 0, kills: 0 },
      discovered: { enemies: {}, trinkets: {}, weapons: {} },
      achievements: {},
      cosmetics: { equipped: 'hat_default', owned: { hat_default: true } },
      dailyBest: {},
      settings: { volume: 0.35, music: true, shake: 1, colorblind: false, damageNumbers: true, difficulty: 'outlaw' },
      muted: false,
    };
  }

  const Save = {
    UPGRADES,
    _mem: null,

    upgradePrice(key, level) {
      const u = UPGRADES[key];
      return Math.round(u.base + u.step * level);
    },

    load() {
      let data = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) data = JSON.parse(raw);
      } catch (e) { /* storage blocked */ }
      if (!data) data = this._mem || defaults();
      // Merge in any newly-added default fields. Sub-objects must be merged
      // against pristine defaults BEFORE the top-level assign, which replaces
      // the defaults' references with the stored ones.
      const d = defaults();
      const upgrades = Object.assign({}, d.upgrades, data.upgrades || {});
      const stats = Object.assign({}, d.stats, data.stats || {});
      const weapons = Object.assign({ revolver: true }, data.weapons || {});
      const trinkets = Object.assign({}, data.trinkets || {});
      const items = Object.assign({}, data.items || {});
      const loadout = Array.isArray(data.loadout) ? data.loadout : [];
      const materials = Object.assign({}, d.materials, data.materials || {});
      const benches = Object.assign({}, d.benches, data.benches || {});
      const attachments = Object.assign({}, data.attachments || {});
      const discovered = Object.assign({ enemies: {}, trinkets: {}, weapons: {} }, data.discovered || {});
      const achievements = Object.assign({}, data.achievements || {});
      const cosmetics = Object.assign({ equipped: 'hat_default', owned: { hat_default: true } }, data.cosmetics || {});
      const dailyBest = Object.assign({}, data.dailyBest || {});
      const settings = Object.assign({}, d.settings, data.settings || {});
      data = Object.assign(d, data);
      data.upgrades = upgrades;
      data.stats = stats;
      data.weapons = weapons;
      data.trinkets = trinkets;
      data.items = items;
      data.loadout = loadout;
      data.materials = materials;
      data.benches = benches;
      data.attachments = attachments;
      data.discovered = discovered;
      data.achievements = achievements;
      data.cosmetics = cosmetics;
      data.dailyBest = dailyBest;
      data.settings = settings;
      this._mem = data;
      return data;
    },

    save(data) {
      this._mem = data;
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    },

    reset() {
      const d = defaults();
      this.save(d);
      return d;
    },

    // Fold saved upgrades into the concrete stats a Player consumes.
    deriveStats(data) {
      const u = data.upgrades;
      return {
        maxHp: 5 + u.maxHp,
        magBonus: u.ammo,
        reloadMult: Math.max(0.4, 1 - u.reload * 0.14),
        dodgeCd: Math.max(0.25, 0.7 - u.dodge * 0.11),
        speed: 150 + u.speed * 11,
        satchelCap: 6 + u.satchel,
        trinketSlots: 2 + u.slots,
        weaponId: data.weapons[data.equipped] ? data.equipped : 'revolver',
      };
    },
  };

  KTC.Save = Save;
})(window.KTC);
