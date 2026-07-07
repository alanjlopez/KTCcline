// trinkets.js — the roguelike layer. Worn passives that fold into a shared
// `mods` object (projectile behaviors, handling, economy, sustain, showdown)
// and/or hook game events. They're designed to STACK and cross-pollinate:
// Powder Keg makes kills explode, Ricochet/Live Wire spread hits to more crows,
// Twin Fang doubles every on-kill effect, Gunslinger's Ledger pays out per
// trinket you carry — bring the right handful and a single shot cascades.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  // Every stat a trinket (or shop upgrade) can move. Player + firing read this.
  function defaultMods() {
    return {
      fireRateMult: 1, reloadMult: 1, magBonus: 0, moveMult: 1, dodgeCdMult: 1,
      extraProjectiles: 0, spreadBonus: 0,
      pierce: 0, bounces: 0, explosive: 0, homing: 0, chain: 0,
      critChance: 0, goldMult: 1, goldPerKill: 0,
      showdownGainMult: 1, showdownDurationBonus: 0,
      maxHpBonus: 0, lifestealKills: 0, onKillExplode: 0,
      doubleOnKill: false, cheatDeath: false, hotStreak: false,
    };
  }

  // id -> definition. stats(m) folds into mods; on{event} hooks fire live.
  const T = {
    // ---- projectile / crowd-control lane ----
    hollowpoint: { name: 'Hollow Points', rarity: 'common', icon: '🎯',
      desc: 'Bullets pierce +1 crow.', stats: (m) => { m.pierce += 1; } },
    ricochet: { name: 'Ricochet Rounds', rarity: 'uncommon', icon: '🪃',
      desc: 'Bullets ricochet to +1 crow (or off cover).', stats: (m) => { m.bounces += 1; } },
    livewire: { name: 'Live Wire', rarity: 'uncommon', icon: '⚡',
      desc: 'Hits arc lightning to +1 nearby crow.', stats: (m) => { m.chain += 1; } },
    hexiron: { name: 'Hex Iron', rarity: 'rare', icon: '🌀',
      desc: 'Bullets curve toward crows.', stats: (m) => { m.homing += 2.6; } },
    powderkeg: { name: 'Powder Keg', rarity: 'rare', icon: '💥',
      desc: 'Slain crows burst, killing others nearby.', stats: (m) => { m.onKillExplode = Math.max(m.onKillExplode, 34); } },

    // ---- handling lane ----
    hairtrigger: { name: 'Hair Trigger', rarity: 'common', icon: '🔥',
      desc: 'Fire 22% faster.', stats: (m) => { m.fireRateMult *= 0.78; } },
    greased: { name: 'Greased Cylinder', rarity: 'uncommon', icon: '🛢️',
      desc: 'Reload 30% faster.', stats: (m) => { m.reloadMult *= 0.7; } },
    bandolier: { name: 'Bandolier', rarity: 'common', icon: '🧷',
      desc: '+2 cylinder capacity.', stats: (m) => { m.magBonus += 2; } },
    fanhammer: { name: 'Fan the Hammer', rarity: 'uncommon', icon: '✋',
      desc: '+1 bullet per shot, wider spread.', stats: (m) => { m.extraProjectiles += 1; m.spreadBonus += 0.09; } },

    // ---- showdown lane ----
    battery: { name: 'Deadeye Battery', rarity: 'uncommon', icon: '🔋',
      desc: 'Showdown charges 70% faster.', stats: (m) => { m.showdownGainMult *= 1.7; } },
    highnoon: { name: 'High Noon', rarity: 'rare', icon: '🌞',
      desc: 'Showdowns last +2.5s.', stats: (m) => { m.showdownDurationBonus += 2.5; } },

    // ---- sustain lane ----
    ironhide: { name: 'Iron Hide', rarity: 'common', icon: '🛡️',
      desc: '+1 max heart.', stats: (m) => { m.maxHpBonus += 1; } },
    vampfang: { name: 'Vampire Fang', rarity: 'uncommon', icon: '🩸',
      desc: 'Every 12 kills, recover a heart.', stats: (m) => { m.lifestealKills = 12; } },
    snakeoil: { name: 'Snake Oil', rarity: 'rare', icon: '🐍',
      desc: 'Cheat death once per raid.', stats: (m) => { m.cheatDeath = true; } },

    // ---- gold / economy lane ----
    fillings: { name: 'Gold Fillings', rarity: 'common', icon: '💰',
      desc: '+2 gold per kill.', stats: (m) => { m.goldPerKill += 2; } },
    luckycoin: { name: 'Lucky Coin', rarity: 'uncommon', icon: '🪙',
      desc: '22% of shots strike gold (bonus loot).', stats: (m) => { m.critChance += 0.22; } },
    prospector: { name: "Prospector's Pact", rarity: 'rare', icon: '⛏️',
      desc: 'All gold worth +50%.', stats: (m) => { m.goldMult *= 1.5; } },

    // ---- synergy amplifiers (the Balatro jokers) ----
    hotstreak: { name: 'Hot Streak', rarity: 'uncommon', icon: '🌶️',
      desc: 'Fire much faster while your combo is hot (5+).', stats: (m) => { m.hotStreak = true; } },
    twinfang: { name: 'Twin Fang', rarity: 'rare', icon: '👯',
      desc: 'Every on-kill effect triggers twice.', stats: (m) => { m.doubleOnKill = true; } },
    ledger: { name: "Gunslinger's Ledger", rarity: 'rare', icon: '📖',
      desc: 'Each kill pays +1 gold per trinket you carry.',
      on: { kill: (g) => g.gainGold(g.trinkets.length) } },
  };

  const ORDER = Object.keys(T);
  const PRICE = { common: 60, uncommon: 120, rare: 210 };
  const DROP_WEIGHT = { common: 5, uncommon: 3, rare: 1.4 };

  const Trinkets = {
    defs: T,
    order: ORDER,
    get: (id) => T[id],
    price: (id) => PRICE[T[id].rarity],
    defaultMods,

    // fold a list of trinket ids' stat contributions into a fresh mods object
    aggregate(ids) {
      const m = defaultMods();
      for (const id of ids) {
        const t = T[id];
        if (t && t.stats) t.stats(m);
      }
      return m;
    },

    // weighted-random id, optionally excluding some (for cache drops)
    roll(exclude) {
      const pool = ORDER.filter((id) => !exclude || !exclude.has(id));
      const src = pool.length ? pool : ORDER;
      let total = 0;
      for (const id of src) total += DROP_WEIGHT[T[id].rarity];
      let r = Math.random() * total;
      for (const id of src) { r -= DROP_WEIGHT[T[id].rarity]; if (r <= 0) return id; }
      return src[0];
    },
  };

  KTC.Trinkets = Trinkets;
})(window.KTC);
