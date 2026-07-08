// trinkets.js — the roguelike layer. Worn passives that fold into a shared
// `mods` object (projectile behaviors, handling, economy, sustain, showdown)
// and/or hook game events. They're designed to STACK and cross-pollinate:
// Powder Keg makes kills explode, Ricochet/Live Wire spread hits to more crows,
// Twin Fang doubles every on-kill effect, Gunslinger's Ledger pays out per
// trinket you carry — bring the right handful and a single shot cascades.
//
// Two extra layers of depth on top of the raw stat stacking:
//  · SETS — every trinket carries `tags` (lead/arcane/grit/showdown/gold); hit a
//    threshold of a tag and a *set bonus* folds into the same `mods` for free.
//  · EVENT HOOKS — beyond `on.kill`, trinkets react to dodge / reload / hurt /
//    loot, so how you *play* (not just what you shoot) drives the build.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  // Every stat a trinket (or shop upgrade) can move. Player + firing read this.
  function defaultMods() {
    return {
      fireRateMult: 1, reloadMult: 1, magBonus: 0, moveMult: 1, dodgeCdMult: 1, rangeMul: 1,
      extraProjectiles: 0, spreadBonus: 0,
      pierce: 0, bounces: 0, explosive: 0, homing: 0, chain: 0,
      critChance: 0, goldMult: 1, goldPerKill: 0,
      showdownGainMult: 1, showdownDurationBonus: 0,
      maxHpBonus: 0, lifestealKills: 0, onKillExplode: 0,
      doubleOnKill: false, cheatDeath: false, hotStreak: false,
    };
  }

  // id -> definition. stats(m) folds into mods; on{event} hooks fire live.
  // `tags` feed the SET system below.
  const T = {
    // ---- projectile / crowd-control lane ----
    hollowpoint: { name: 'Hollow Points', rarity: 'common', icon: '🎯', tags: ['lead'],
      desc: 'Bullets pierce +1 crow.', stats: (m) => { m.pierce += 1; } },
    ricochet: { name: 'Ricochet Rounds', rarity: 'uncommon', icon: '🪃', tags: ['lead'],
      desc: 'Bullets ricochet to +1 crow (or off cover).', stats: (m) => { m.bounces += 1; } },
    livewire: { name: 'Live Wire', rarity: 'uncommon', icon: '⚡', tags: ['arcane'],
      desc: 'Hits arc lightning to +1 nearby crow.', stats: (m) => { m.chain += 1; } },
    hexiron: { name: 'Hex Iron', rarity: 'rare', icon: '🌀', tags: ['arcane'],
      desc: 'Bullets curve toward crows.', stats: (m) => { m.homing += 2.6; } },
    powderkeg: { name: 'Powder Keg', rarity: 'rare', icon: '💥', tags: ['lead', 'arcane'],
      desc: 'Slain crows burst, killing others nearby.', stats: (m) => { m.onKillExplode = Math.max(m.onKillExplode, 34); } },

    // ---- handling lane ----
    hairtrigger: { name: 'Hair Trigger', rarity: 'common', icon: '🔥', tags: ['grit'],
      desc: 'Fire 22% faster.', stats: (m) => { m.fireRateMult *= 0.78; } },
    greased: { name: 'Greased Cylinder', rarity: 'uncommon', icon: '🛢️', tags: ['grit'],
      desc: 'Reload 30% faster.', stats: (m) => { m.reloadMult *= 0.7; } },
    bandolier: { name: 'Bandolier', rarity: 'common', icon: '🧷', tags: ['grit'],
      desc: '+2 cylinder capacity.', stats: (m) => { m.magBonus += 2; } },
    fanhammer: { name: 'Fan the Hammer', rarity: 'uncommon', icon: '✋', tags: ['lead'],
      desc: '+1 bullet per shot, wider spread.', stats: (m) => { m.extraProjectiles += 1; m.spreadBonus += 0.09; } },

    // ---- showdown lane ----
    battery: { name: 'Deadeye Battery', rarity: 'uncommon', icon: '🔋', tags: ['showdown'],
      desc: 'Showdown charges 70% faster.', stats: (m) => { m.showdownGainMult *= 1.7; } },
    highnoon: { name: 'High Noon', rarity: 'rare', icon: '🌞', tags: ['showdown'],
      desc: 'Showdowns last +2.5s.', stats: (m) => { m.showdownDurationBonus += 2.5; } },

    // ---- sustain lane ----
    ironhide: { name: 'Iron Hide', rarity: 'common', icon: '🛡️', tags: ['grit'],
      desc: '+1 max heart.', stats: (m) => { m.maxHpBonus += 1; } },
    vampfang: { name: 'Vampire Fang', rarity: 'uncommon', icon: '🩸', tags: ['grit'],
      desc: 'Every 12 kills, recover a heart.', stats: (m) => { m.lifestealKills = 12; } },
    snakeoil: { name: 'Snake Oil', rarity: 'rare', icon: '🐍', tags: ['grit'],
      desc: 'Cheat death once per raid.', stats: (m) => { m.cheatDeath = true; } },

    // ---- gold / economy lane ----
    fillings: { name: 'Gold Fillings', rarity: 'common', icon: '💰', tags: ['gold'],
      desc: '+2 gold per kill.', stats: (m) => { m.goldPerKill += 2; } },
    luckycoin: { name: 'Lucky Coin', rarity: 'uncommon', icon: '🪙', tags: ['gold'],
      desc: '22% of shots strike gold (bonus loot).', stats: (m) => { m.critChance += 0.22; } },
    prospector: { name: "Prospector's Pact", rarity: 'rare', icon: '⛏️', tags: ['gold'],
      desc: 'All gold worth +50%.', stats: (m) => { m.goldMult *= 1.5; } },

    // ---- synergy amplifiers (the Balatro jokers) ----
    hotstreak: { name: 'Hot Streak', rarity: 'uncommon', icon: '🌶️', tags: ['showdown'],
      desc: 'Fire much faster while your combo is hot (5+).', stats: (m) => { m.hotStreak = true; } },
    twinfang: { name: 'Twin Fang', rarity: 'rare', icon: '👯', tags: ['arcane'],
      desc: 'Every on-kill effect triggers twice.', stats: (m) => { m.doubleOnKill = true; } },
    ledger: { name: "Gunslinger's Ledger", rarity: 'rare', icon: '📖', tags: ['gold'],
      desc: 'Each kill pays +1 gold per trinket you carry.',
      on: { kill: (g) => g.gainGold(g.trinkets.length) } },

    // ---- event-hook trinkets (react to how you PLAY) ----
    smokebomb: { name: 'Smoke Bomb', rarity: 'uncommon', icon: '💨', tags: ['grit'],
      desc: 'Dodging staggers crows around you.',
      on: { dodge: (g) => g.staggerNear(g.player.x, g.player.y, 88, 1.1) } },
    fanmail: { name: 'Fan Mail', rarity: 'uncommon', icon: '✉️', tags: ['lead'],
      desc: 'Finishing a reload sprays a ring of lead.',
      on: { reload: (g) => g.burstRing(g.player.x, g.player.y, 9) } },
    grudge: { name: 'Grudge', rarity: 'rare', icon: '😤', tags: ['grit', 'lead'],
      desc: 'After you take a hit, your next shot is a guaranteed explosive crit.',
      on: { hurt: (g) => { if (g.player) g.player.grudge = true; } } },
    magpie: { name: 'Magpie', rarity: 'uncommon', icon: '🐦', tags: ['gold'],
      desc: '20% chance a looted valuable comes in a pair.',
      on: { loot: (g, d) => { if (d && d.kind === 'valuable' && Math.random() < 0.2) g.dupeValuable(d.name, d.value); } } },
  };

  // ---- SETS ----
  // Count how many of your trinkets share a tag; cross a threshold and its
  // bonuses fold into the same `mods`. Higher tiers stack ON TOP of lower ones,
  // so a fully-committed lane pays off big.
  const SETS = [
    { id: 'lead', tag: 'lead', name: 'Gunslinger', icon: '🔫',
      tiers: [
        { n: 3, desc: '+1 pierce · +8% gold-shot', apply: (m) => { m.pierce += 1; m.critChance += 0.08; } },
        { n: 5, desc: '+1 bullet per shot', apply: (m) => { m.extraProjectiles += 1; } },
      ] },
    { id: 'arcane', tag: 'arcane', name: 'Stormcaller', icon: '⚡',
      tiers: [
        { n: 3, desc: '+1 chain jump · stronger homing', apply: (m) => { m.chain += 1; m.homing += 1.6; } },
      ] },
    { id: 'grit', tag: 'grit', name: 'Frontier Grit', icon: '🛡️',
      tiers: [
        { n: 3, desc: '+1 max heart', apply: (m) => { m.maxHpBonus += 1; } },
        { n: 5, desc: 'Quicker dodge · faster on your feet', apply: (m) => { m.dodgeCdMult *= 0.78; m.moveMult *= 1.08; } },
      ] },
    { id: 'showdown', tag: 'showdown', name: 'Deadeye', icon: '🌞',
      tiers: [
        { n: 2, desc: 'Showdown charges +45%', apply: (m) => { m.showdownGainMult *= 1.45; } },
        { n: 3, desc: 'Showdowns last +2s', apply: (m) => { m.showdownDurationBonus += 2; } },
      ] },
    { id: 'gold', tag: 'gold', name: 'Gold Rush', icon: '💰',
      tiers: [
        { n: 3, desc: 'All gold worth +35%', apply: (m) => { m.goldMult *= 1.35; } },
        { n: 5, desc: '+2 gold/kill · +25% gold', apply: (m) => { m.goldMult *= 1.25; m.goldPerKill += 2; } },
      ] },
  ];

  // tally how many active trinkets carry each tag
  function tagCounts(ids) {
    const c = {};
    for (const id of ids) {
      const t = T[id];
      if (!t || !t.tags) continue;
      for (const tag of t.tags) c[tag] = (c[tag] || 0) + 1;
    }
    return c;
  }

  const ORDER = Object.keys(T);
  const PRICE = { common: 60, uncommon: 120, rare: 210 };
  const DROP_WEIGHT = { common: 5, uncommon: 3, rare: 1.4 };

  const Trinkets = {
    defs: T,
    order: ORDER,
    sets: SETS,
    get: (id) => T[id],
    price: (id) => PRICE[T[id].rarity],
    defaultMods,
    tagCounts,

    // fold a list of trinket ids' stat contributions into a fresh mods object
    aggregate(ids) {
      const m = defaultMods();
      for (const id of ids) {
        const t = T[id];
        if (t && t.stats) t.stats(m);
      }
      return m;
    },

    // apply set bonuses into an existing mods object; returns the active-set
    // descriptors (for the HUD / codex): { id, name, icon, count, tiers:[...] }
    applySets(ids, m) {
      const counts = tagCounts(ids);
      const active = [];
      for (const s of SETS) {
        const have = counts[s.tag] || 0;
        const got = [];
        for (const tier of s.tiers) {
          if (have >= tier.n) { tier.apply(m); got.push(tier); }
        }
        if (got.length) active.push({ id: s.id, name: s.name, icon: s.icon, count: have, tiers: got });
      }
      return active;
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
