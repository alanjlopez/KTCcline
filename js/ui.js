// ui.js — DOM HUD + overlay screens. The base is walkable (rendered on canvas),
// but its benches open HTML menus (deploy / workbench / gunsmith). Run HUD shows
// ammo, hearts, loot, materials, showdown, threat; the minimap is drawn on the
// canvas by game.js. Screens are rebuilt from the current save each time.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const MAT = () => KTC.Zones.MATERIALS;

  function el(tag, props, kids) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') e.className = props[k];
      else if (k === 'html') e.innerHTML = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    if (kids) for (const c of kids) if (c) e.appendChild(c);
    return e;
  }

  const WORKBENCH_MAX = 4;
  function matCost(level) { return { scrap: 5 + level * 4, iron: level >= 2 ? level : 0, relic: level >= 4 ? 1 : 0 }; }
  function benchCost(wl) { return { scrap: 12 * wl, iron: 4 * wl, relic: wl >= 3 ? 2 : 1 }; }

  class UI {
    constructor(game) {
      this.game = game;
      this.root = document.getElementById('overlays');
      this.hud = document.getElementById('hud');
      this._pipCount = -1;
      this._heartMax = -1;
      this._toastT = 0;
      this.buildStaticHud();
    }

    // ---------------- material helpers ----------------
    matHtml(mats, onlyNonZero) {
      const M = MAT();
      return KTC.Zones.matOrder
        .filter((k) => !onlyNonZero || mats[k] > 0)
        .map((k) => `<span class="mat" style="color:${M[k].color}">${M[k].icon} ${mats[k] || 0}</span>`)
        .join(' ');
    }
    costHtml(cost) {
      const M = MAT();
      return KTC.Zones.matOrder.filter((k) => cost[k]).map((k) => `<span style="color:${M[k].color}">${M[k].icon}${cost[k]}</span>`).join(' ');
    }
    canAfford(cost) { const m = this.game.save.materials; return KTC.Zones.matOrder.every((k) => !cost[k] || (m[k] || 0) >= cost[k]); }
    spend(cost) { const m = this.game.save.materials; for (const k in cost) m[k] = (m[k] || 0) - cost[k]; }

    buildStaticHud() {
      this.hud.innerHTML = '';
      this.gunBadge = el('canvas', { class: 'gun-badge', width: 40, height: 26 });
      this.ammoRow = el('div', { class: 'ammo-row' });
      this.reloadFill = el('div', { class: 'reload-fill' });
      this.reloadMark = el('div', { class: 'reload-mark' });
      const RW = KTC.Tune.reload;
      this.reloadMark.style.left = (RW.windowStart * 100) + '%';
      this.reloadMark.style.width = ((RW.windowEnd - RW.windowStart) * 100) + '%';
      this.reloadBar = el('div', { class: 'reload-bar' }, [this.reloadFill, this.reloadMark]);
      this.weaponName = el('div', { class: 'weapon-name' });
      this.heatFill = el('div', { class: 'heat-fill' });
      this.heatBar = el('div', { class: 'heat-bar hidden' }, [this.heatFill]);
      const wpanel = el('div', { class: 'hud-panel weapon-panel' }, [
        this.gunBadge,
        el('div', { class: 'ammo-wrap' }, [this.ammoRow, this.reloadBar, this.heatBar, this.weaponName]),
      ]);

      this.killsEl = el('div', { class: 'hud-kills', text: '0' });
      this.comboEl = el('div', { class: 'hud-combo hidden' });
      this.threatFill = el('div', { class: 'threat-fill' });
      this.threatWrap = el('div', { class: 'threat-wrap' }, [
        el('div', { class: 'threat-label', text: 'THREAT' }),
        el('div', { class: 'threat-bar' }, [this.threatFill]),
      ]);
      this.timerEl = el('div', { class: 'hud-timer', text: '00:00' });
      this.lootEl = el('div', { class: 'hud-loot', html: '<span class="coin">◉</span> 0' });
      this.matsEl = el('div', { class: 'hud-mats' });
      this.heartsEl = el('div', { class: 'hud-hearts' });
      this.extractEl = el('div', { class: 'hud-extract hidden' });
      this.trinketRow = el('div', { class: 'trinket-row' });
      this.setsRow = el('div', { class: 'sets-row' });
      this._trinketStamp = '';
      this.sdFill = el('div', { class: 'sd-fill' });
      this.sdLabel = el('div', { class: 'sd-label' });
      this.showdownEl = el('div', { class: 'showdown-meter hidden' }, [el('div', { class: 'sd-bar' }, [this.sdFill]), this.sdLabel]);

      this.satchelPanel = el('div', { class: 'satchel-panel hidden' });
      this._satchelStamp = '';
      this.itemEl = el('div', { class: 'hud-item hidden' });
      // all run-only HUD in one wrapper so the base HUD/toast can stay visible
      this.runHud = el('div', { class: 'run-hud hidden' }, [
        wpanel, this.trinketRow, this.setsRow,
        el('div', { class: 'hud-top-center' }, [this.killsEl, this.comboEl, this.threatWrap]),
        el('div', { class: 'hud-top-right' }, [this.timerEl, this.lootEl, this.matsEl]),
        this.heartsEl, this.itemEl, this.showdownEl, this.extractEl, this.satchelPanel,
      ]);
      this.hud.appendChild(this.runHud);

      this.toastEl = el('div', { class: 'toast hidden' });
      this.hud.appendChild(this.toastEl);

      // base HUD (shown while walking the home base)
      this.baseMats = el('div', { class: 'base-mats' });
      this.baseHud = el('div', { class: 'base-hud hidden' }, [
        el('div', { class: 'base-title', text: 'HOME BASE' }),
        this.baseMats,
        el('div', { class: 'base-hint', text: 'WASD to walk · approach a bench and press E' }),
      ]);
      this.hud.appendChild(this.baseHud);

      this.drawGunBadge();
    }

    drawGunBadge() {
      const c = this.gunBadge.getContext('2d');
      c.clearRect(0, 0, 40, 26);
      c.save(); c.translate(6, 15); c.scale(1.2, 1.2);
      c.fillStyle = '#d8c7a6';
      c.fillRect(0, -2, 14, 4); c.fillRect(9, -4, 5, 4); c.fillRect(2, 1, 4, 6);
      c.beginPath(); c.arc(8, 0, 3, 0, U.TAU); c.fill();
      c.fillStyle = '#20201c'; c.beginPath(); c.arc(8, 0, 1.2, 0, U.TAU); c.fill();
      c.restore();
    }

    onState(s) {
      this.root.querySelectorAll('.screen').forEach((n) => n.remove());
      this.runHud.classList.toggle('hidden', !(s === 'raid' || s === 'paused'));
      this.baseHud.classList.toggle('hidden', s !== 'base');
      if (s === 'menu') this.renderMenu();
      else if (s === 'dead') this.renderResult(false);
      else if (s === 'extracted') this.renderResult(true);
      else if (s === 'paused') this.renderPause();
    }

    screen(cls, kids) { const s = el('div', { class: 'screen ' + cls }, kids); this.root.appendChild(s); return s; }
    goldLine() { return el('div', { class: 'gold-line', html: `<span class="coin">◉</span> ${this.game.save.gold} banked &nbsp; ${this.matHtml(this.game.save.materials)}` }); }

    // ---------------- title ----------------
    renderMenu() {
      const g = this.game, st = g.save.stats;
      this.screen('menu', [
        el('div', { class: 'title-wrap' }, [
          el('h1', { class: 'game-title', text: 'KILL THE CROWS' }),
          el('div', { class: 'subtitle', text: 'a frontier extraction roguelike' }),
        ]),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('PLAY', () => { KTC.Audio.click(); g.enterBase(); }),
          this.btn('RECORDS', () => { KTC.Audio.click(); this.openRecords(); }),
          this.btn('SETTINGS', () => { KTC.Audio.click(); this.openSettings(false); }),
          this.btn(g.save.muted ? 'SOUND: OFF' : 'SOUND: ON', (b) => {
            g.save.muted = !g.save.muted; KTC.Audio.setMuted(g.save.muted);
            KTC.Save.save(g.save); b.textContent = g.save.muted ? 'SOUND: OFF' : 'SOUND: ON';
          }),
        ]),
        el('div', { class: 'stat-row', html: `Extractions <b>${st.extractions}</b> · Deaths <b>${st.deaths}</b> · Kills <b>${st.kills}</b> · Best haul <b>${st.bestLoot}</b>` }),
        el('div', { class: 'controls-help', html: '<b>WASD</b> move · <b>Mouse</b> aim · <b>Click</b> shoot · <b>R</b> reload · <b>Space</b> dodge · <b>E</b> loot · <b>F</b> item · <b>Q/RMB</b> showdown · <b>Tab</b> satchel' }),
        el('div', { class: 'blurb', text: 'From your camp, deploy into a large frontier of biome zones — the deeper you push, the deadlier the crows and the richer the scrap. Loot, gun down crows, gather materials, and reach any stagecoach to extract. Die and you lose everything you carried. Back home, spend materials at the workbench and gold at the gunsmith to come back harder.' }),
      ]);
    }

    // ---------------- bench menus ----------------
    showBench(type) {
      this.root.querySelectorAll('.screen').forEach((n) => n.remove());
      if (type === 'deploy') this.renderDeploy();
      else if (type === 'workbench') this.renderWorkbench();
      else if (type === 'gunsmith') this.renderGunsmith();
    }
    reBench() { this.showBench(this.game.baseMenu); }
    closeRow() { return el('div', { class: 'menu-buttons' }, [this.bigBtn('CLOSE', () => { KTC.Audio.click(); this.game.closeBench(); })]); }

    renderDeploy() {
      const g = this.game;
      const owned = KTC.Weapons.order.filter((id) => g.save.weapons[id]);
      const loadout = el('div', { class: 'loadout' }, owned.map((id) => {
        const w = KTC.Weapons.get(id);
        return el('button', { class: 'weap-chip' + (g.save.equipped === id ? ' sel' : ''),
          onclick: () => { KTC.Audio.click(); g.save.equipped = id; KTC.Save.save(g.save); this.reBench(); } }, [el('span', { text: w.name })]);
      }));
      const slots = KTC.Save.deriveStats(g.save).trinketSlots;
      g.save.loadout = (g.save.loadout || []).filter((id) => g.save.trinkets[id]).slice(0, slots);
      const ownedT = KTC.Trinkets.order.filter((id) => g.save.trinkets[id]);
      const chips = ownedT.length ? ownedT.map((id) => {
        const t = KTC.Trinkets.get(id), on = g.save.loadout.includes(id);
        return el('button', { class: 'trinket-item rar-' + t.rarity + (on ? ' sel' : ''), title: t.name + ' — ' + t.desc,
          onclick: () => { KTC.Audio.click(); const L = g.save.loadout; const i = L.indexOf(id);
            if (i >= 0) L.splice(i, 1); else if (L.length < slots) L.push(id); else this.toast('Trinket belt full — upgrade it at the workbench.');
            KTC.Save.save(g.save); this.reBench(); } }, [el('span', { class: 'ti', text: t.icon }), el('span', { class: 'tn', text: t.name })]);
      }) : [el('div', { class: 'hint', text: 'None owned. Crack glowing caches out in the field, then extract to keep them.' })];

      this.screen('camp', [
        el('h2', { class: 'screen-title', text: 'DEPLOY' }),
        el('div', { class: 'hint', text: 'A frontier of 6 zones — the far corner is the deadliest and richest. Extract at any stagecoach.' }),
        el('div', { class: 'section-label', text: 'IRON' }), loadout,
        el('div', { class: 'section-label', text: `TRINKETS — equip up to ${slots} (${g.save.loadout.length}/${slots})` }),
        el('div', { class: 'loadout trinket-loadout' }, chips),
        el('div', { class: 'section-label', text: 'ACTIVE ITEM (F)' }),
        el('div', { class: 'loadout' }, [
          el('button', { class: 'weap-chip' + (!g.save.activeEquipped ? ' sel' : ''), onclick: () => { KTC.Audio.click(); g.save.activeEquipped = null; KTC.Save.save(g.save); this.reBench(); } }, [el('span', { text: 'None' })]),
          ...KTC.Items.order.filter((id) => g.save.items[id]).map((id) => {
            const it = KTC.Items.get(id);
            return el('button', { class: 'weap-chip' + (g.save.activeEquipped === id ? ' sel' : ''), title: it.desc, onclick: () => { KTC.Audio.click(); g.save.activeEquipped = id; KTC.Save.save(g.save); this.reBench(); } }, [el('span', { html: `${it.icon} ${it.name}` })]);
          }),
        ]),
        el('div', { class: 'menu-buttons row' }, [
          this.bigBtn('DEPLOY', () => { KTC.Audio.click(); g.startRun(); }),
          this.btn('DAILY RUN', () => { KTC.Audio.click(); g.startRun(KTC.Meta.dailySeed()); }),
          this.btn('CLOSE', () => { KTC.Audio.click(); g.closeBench(); }),
        ]),
        el('div', { class: 'hint', html: `Daily Run seeds the world from today (${KTC.Meta.dailyCode()}) — same map for everyone. Best: <span class="coin">◉</span> ${g.save.dailyBest[KTC.Meta.dailyCode()] || 0}` }),
        el('div', { class: 'hint', text: 'Your equipped iron & trinkets are insured. Loot, materials, and items found in the field are lost if you die.' }),
      ]);
    }

    renderWorkbench() {
      const g = this.game;
      const wl = g.save.benches.workbench;
      const rows = [];
      // bench level + upgrade
      const bcost = benchCost(wl);
      const benchAction = wl >= WORKBENCH_MAX ? el('span', { class: 'tag equipped', text: 'MAX' })
        : el('button', { class: 'btn buy', html: this.costHtml(bcost), onclick: () => {
            if (!this.canAfford(bcost)) return this.denyMat();
            this.spend(bcost); g.save.benches.workbench++; KTC.Save.save(g.save); KTC.Audio.craft(); this.reBench();
          } });
      rows.push(el('div', { class: 'shop-row bench-head' }, [
        el('div', { class: 'shop-info' }, [
          el('div', { class: 'shop-name', text: 'Upgrade Workbench · Lv ' + wl }),
          el('div', { class: 'shop-desc', text: 'A better bench unlocks higher upgrade tiers.' }),
        ]), benchAction,
      ]));
      // upgrade tracks, gated by bench level, paid in materials
      for (const key in KTC.Save.UPGRADES) {
        const u = KTC.Save.UPGRADES[key];
        const lvl = g.save.upgrades[key];
        const cap = Math.min(u.max, wl + 1);
        const dots = el('div', { class: 'dots' }, Array.from({ length: u.max }, (_, i) => el('span', { class: 'dot' + (i < lvl ? ' on' : '') })));
        let action;
        if (lvl >= u.max) action = el('span', { class: 'tag equipped', text: 'MAX' });
        else if (lvl >= cap) action = el('span', { class: 'tag', text: 'Needs Bench Lv ' + (lvl + 1) });
        else {
          const cost = matCost(lvl);
          action = el('button', { class: 'btn buy', html: this.costHtml(cost), onclick: () => {
            if (!this.canAfford(cost)) return this.denyMat();
            this.spend(cost); g.save.upgrades[key]++; KTC.Save.save(g.save); KTC.Audio.craft(); this.reBench();
          } });
        }
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [el('div', { class: 'shop-name', text: u.name }), el('div', { class: 'shop-desc', text: u.desc }), dots]),
          action,
        ]));
      }
      // relic table — spend materials to craft a random trinket you don't own
      rows.push(el('div', { class: 'section-label', text: 'RELIC TABLE — gamble materials for a trinket' }));
      const craftCost = { scrap: 6, iron: 3, relic: 2 };
      rows.push(el('div', { class: 'shop-row' }, [
        el('div', { class: 'shop-info' }, [
          el('div', { class: 'shop-name', text: 'Craft Random Trinket' }),
          el('div', { class: 'shop-desc', text: 'Forge a random trinket you don\'t yet own.' }),
        ]),
        el('button', { class: 'btn buy', html: this.costHtml(craftCost), onclick: () => {
          const unowned = KTC.Trinkets.order.filter((id) => !g.save.trinkets[id]);
          if (!unowned.length) return this.toast('You already own every trinket!');
          if (!this.canAfford(craftCost)) return this.denyMat();
          this.spend(craftCost);
          const id = KTC.Trinkets.roll(new Set(Object.keys(g.save.trinkets).filter((k) => g.save.trinkets[k])));
          g.save.trinkets[id] = true; KTC.Save.save(g.save); KTC.Audio.trinket();
          this.toast('Forged: ' + KTC.Trinkets.get(id).name + '!'); this.reBench();
        } }),
      ]));

      this.screen('shop', [
        el('h2', { class: 'screen-title', text: 'WORKBENCH' }),
        el('div', { class: 'gold-line', html: this.matHtml(g.save.materials) }),
        el('div', { class: 'shop-list' }, rows),
        this.closeRow(),
      ]);
    }

    renderGunsmith() {
      const g = this.game;
      const rows = [];
      rows.push(el('div', { class: 'section-label', text: 'IRON — buy & equip (gold)' }));
      for (const id of KTC.Weapons.order) {
        const w = KTC.Weapons.get(id);
        const owned = !!g.save.weapons[id], equipped = g.save.equipped === id;
        let action;
        if (equipped) action = el('span', { class: 'tag equipped', text: 'EQUIPPED' });
        else if (owned) action = this.smallBtn('EQUIP', () => { g.save.equipped = id; KTC.Save.save(g.save); this.reBench(); });
        else action = this.buyBtn(w.price, () => { if (g.save.gold < w.price) return this.deny(); g.save.gold -= w.price; g.save.weapons[id] = true; g.save.equipped = id; KTC.Save.save(g.save); KTC.Audio.coin(); this.reBench(); });
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', html: `${w.name}${w.mech ? ' <span class="mech">· ' + w.mech + '</span>' : ''}` }),
            el('div', { class: 'shop-desc', text: w.desc }),
            el('div', { class: 'shop-stats', text: `mag ${w.magSize} · ${w.pellets > 1 ? w.pellets + ' pellets' : 'range ' + w.proj.range} · ${w.auto ? 'auto' : 'semi'} · reload ${w.reloadTime}s` }),
          ]), action,
        ]));
      }
      // attachments for the currently equipped iron — crafted with materials
      const wid = g.save.equipped;
      rows.push(el('div', { class: 'section-label', text: `ATTACHMENTS — for your ${KTC.Weapons.get(wid).name} (materials)` }));
      const owned = g.save.attachments[wid] || {};
      for (const id of KTC.Weapons.ATTACH_ORDER) {
        const a = KTC.Weapons.ATTACH[id];
        const has = !!owned[id];
        const action = has ? el('span', { class: 'tag equipped', text: 'INSTALLED' })
          : el('button', { class: 'btn buy', html: this.costHtml(a.cost), onclick: () => {
              if (!this.canAfford(a.cost)) return this.denyMat();
              this.spend(a.cost); (g.save.attachments[wid] = g.save.attachments[wid] || {})[id] = true;
              KTC.Save.save(g.save); KTC.Audio.craft(); this.reBench();
            } });
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', html: `<span class="ii">${a.icon}</span> ${a.name}` }),
            el('div', { class: 'shop-desc', text: a.desc }),
          ]), action,
        ]));
      }

      rows.push(el('div', { class: 'section-label', text: 'ACTIVE ITEMS — one equipped, used with F (gold)' }));
      for (const id of KTC.Items.order) {
        const it = KTC.Items.get(id);
        const owned = !!g.save.items[id];
        const action = owned
          ? (g.save.activeEquipped === id ? el('span', { class: 'tag equipped', text: 'EQUIPPED' })
            : this.smallBtn('EQUIP', () => { g.save.activeEquipped = id; KTC.Save.save(g.save); this.reBench(); }))
          : this.buyBtn(it.price, () => { if (g.save.gold < it.price) return this.deny(); g.save.gold -= it.price; g.save.items[id] = true; g.save.activeEquipped = id; KTC.Save.save(g.save); KTC.Audio.coin(); this.reBench(); });
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', html: `<span class="ii" style="color:${it.color}">${it.icon}</span> ${it.name}` }),
            el('div', { class: 'shop-desc', text: it.desc }),
          ]), action,
        ]));
      }

      rows.push(el('div', { class: 'section-label', text: 'TRINKETS — worn charms (gold)' }));
      for (const id of KTC.Trinkets.order) {
        const t = KTC.Trinkets.get(id);
        const owned = !!g.save.trinkets[id], price = KTC.Trinkets.price(id);
        const action = owned ? el('span', { class: 'tag equipped', text: 'OWNED' })
          : this.buyBtn(price, () => { if (g.save.gold < price) return this.deny(); g.save.gold -= price; g.save.trinkets[id] = true; KTC.Save.save(g.save); KTC.Audio.trinket(); this.reBench(); });
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', html: `<span class="rar-${t.rarity} ti">${t.icon}</span> ${t.name}` }),
            el('div', { class: 'shop-desc', text: t.desc }),
            el('div', { class: 'shop-stats', text: t.rarity }),
          ]), action,
        ]));
      }
      this.screen('shop', [
        el('h2', { class: 'screen-title', text: 'GUNSMITH' }),
        this.goldLine(),
        el('div', { class: 'shop-list' }, rows),
        this.closeRow(),
      ]);
    }

    // ---------------- results ----------------
    renderResult(win) {
      const g = this.game, r = g.run;
      const total = g.runValue();
      const lines = [`Kills <b>${r.kills}</b>`, `Best combo <b>x${r.comboMax}</b>`, `Time <b>${U.formatTime(r.time)}</b>`];
      const itemRows = r.satchel.map((it) => el('div', { class: 'haul-row', html: `<span>${it.name}</span><span class="coin">◉ ${it.value}</span>` }));
      if (r.gold > 0) itemRows.push(el('div', { class: 'haul-row', html: `<span>Loose gold</span><span class="coin">◉ ${r.gold}</span>` }));
      const matTotal = KTC.Zones.matOrder.reduce((s, k) => s + (r.materials[k] || 0), 0);
      if (matTotal > 0) itemRows.push(el('div', { class: 'haul-row', html: `<span>Materials</span><span>${this.matHtml(r.materials, true)}</span>` }));

      const foundChips = [];
      for (const id of r.foundTrinkets) { const t = KTC.Trinkets.get(id); if (t) foundChips.push(el('div', { class: 'trinket-chip rar-' + t.rarity, title: t.name }, [el('span', { class: 'ti', text: t.icon })])); }
      for (const id of r.foundWeapons) { const w = KTC.Weapons.get(id); if (w) foundChips.push(el('div', { class: 'trinket-chip', title: w.name }, [el('span', { class: 'ti', text: '🔫' })])); }
      const foundBlock = foundChips.length ? el('div', { class: 'found-block' }, [
        el('div', { class: 'section-label', text: win ? 'ITEMS KEPT' : 'ITEMS LOST' }),
        el('div', { class: 'trinket-row center' + (win ? '' : ' lost') }, foundChips),
      ]) : null;

      this.screen('result ' + (win ? 'win' : 'lose'), [
        el('h1', { class: 'result-title', text: win ? 'EXTRACTED' : 'YOU DIED' }),
        el('div', { class: 'result-loot', html: win ? `<span class="coin">◉</span> ${total} banked` : `<span class="coin">◉</span> ${total} lost in the dirt` }),
        itemRows.length ? el('div', { class: 'haul-list' + (win ? '' : ' lost') }, itemRows) : null,
        foundBlock,
        el('div', { class: 'result-stats', html: lines.join(' &nbsp;·&nbsp; ') }),
        el('div', { class: 'gold-line', html: `Stash: <span class="coin">◉</span> ${g.save.gold} &nbsp; ${this.matHtml(g.save.materials)}` }),
        el('div', { class: 'menu-buttons' }, [this.bigBtn('BACK TO BASE', () => { KTC.Audio.click(); g.enterBase(); })]),
      ]);
    }

    renderPause() {
      const g = this.game;
      this.screen('pause', [
        el('h2', { class: 'screen-title', text: 'PAUSED' }),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('RESUME', () => { KTC.Audio.click(); g.setState('raid'); }),
          this.btn('SETTINGS', () => { KTC.Audio.click(); this.openSettings(true); }),
          this.btn('ABANDON RUN', () => { KTC.Audio.click(); g.save.stats.raids++; KTC.Save.save(g.save); g.enterBase(); }),
        ]),
        el('div', { class: 'hint', text: 'Abandoning leaves everything you were carrying in the field.' }),
      ]);
    }

    // ---------------- settings ----------------
    openSettings(fromPause) { this.root.querySelectorAll('.screen').forEach((n) => n.remove()); this.renderSettings(fromPause); }
    reSettings(fromPause) { this.root.querySelectorAll('.screen').forEach((n) => n.remove()); this.renderSettings(fromPause); }
    startRebind(a, fromPause) {
      this._rebind = a; this.reSettings(fromPause);
      const handler = (e) => {
        e.preventDefault(); window.removeEventListener('keydown', handler, true);
        KTC.Input.binds[a] = e.code;
        const s = this.game.save.settings; s.keys = Object.assign({}, s.keys, { [a]: e.code });
        KTC.Save.save(this.game.save); this._rebind = null; this.reSettings(fromPause);
      };
      window.addEventListener('keydown', handler, true);
    }
    renderSettings(fromPause) {
      const g = this.game, st = g.save.settings;
      const persist = () => { KTC.Save.save(g.save); g.applySettings(); this.reSettings(fromPause); };
      const stepRow = (label, dec, fmt) => el('div', { class: 'set-row' }, [
        el('span', { class: 'set-label', text: label }),
        el('div', { class: 'set-ctl' }, [
          this.smallBtn('−', () => { dec(-1); persist(); }),
          el('span', { class: 'set-val', text: fmt() }),
          this.smallBtn('+', () => { dec(1); persist(); }),
        ]),
      ]);
      const toggleRow = (label, key) => el('div', { class: 'set-row' }, [
        el('span', { class: 'set-label', text: label }),
        this.smallBtn(st[key] ? 'ON' : 'OFF', () => { st[key] = !st[key]; persist(); }),
      ]);
      const diffs = ['rookie', 'outlaw', 'legend'];
      const rebinds = Object.keys(KTC.Input.binds).map((a) => el('div', { class: 'set-row rebind' }, [
        el('span', { class: 'set-label', text: a }),
        this.smallBtn(this._rebind === a ? 'press…' : KTC.Input.binds[a], () => this.startRebind(a, fromPause)),
      ]));
      this.screen('settings', [
        el('h2', { class: 'screen-title', text: 'SETTINGS' }),
        el('div', { class: 'set-list' }, [
          stepRow('Volume', (d) => { st.volume = U.clamp(+(st.volume + d * 0.1).toFixed(2), 0, 1); }, () => Math.round(st.volume * 100) + '%'),
          stepRow('Screen shake', (d) => { st.shake = U.clamp(+(st.shake + d * 0.5).toFixed(1), 0, 2); }, () => st.shake.toFixed(1)),
          stepRow('Difficulty', (d) => { let i = diffs.indexOf(st.difficulty); st.difficulty = diffs[(i + d + 3) % 3]; }, () => KTC.Tune.difficulty[st.difficulty].name),
          toggleRow('Colorblind palette', 'colorblind'),
          toggleRow('Combat text', 'damageNumbers'),
        ]),
        el('div', { class: 'section-label', text: 'REBIND KEYS (movement stays WASD/arrows)' }),
        el('div', { class: 'rebind-grid' }, rebinds),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('BACK', () => { KTC.Audio.click(); this._rebind = null; if (fromPause) g.setState('paused'); else g.setState('menu'); }),
        ]),
      ]);
    }

    // ---------------- records (bestiary / achievements / cosmetics) ----------------
    openRecords() { this.root.querySelectorAll('.screen').forEach((n) => n.remove()); this.renderRecords(); }
    renderRecords() {
      const g = this.game, s = g.save;
      const rows = [];

      rows.push(el('div', { class: 'section-label', text: 'ACHIEVEMENTS' }));
      for (const id of KTC.Meta.achOrder) {
        const a = KTC.Meta.ACHIEVEMENTS[id]; const got = !!s.achievements[id];
        rows.push(el('div', { class: 'shop-row' + (got ? '' : ' locked') }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', html: (got ? '★ ' : '☆ ') + a.name }),
            el('div', { class: 'shop-desc', text: got ? a.desc : '???' }),
          ]),
          el('span', { class: 'tag' + (got ? ' equipped' : ''), text: got ? 'DONE' : 'LOCKED' }),
        ]));
      }

      rows.push(el('div', { class: 'section-label', text: 'HATS — pick your look' }));
      const hats = el('div', { class: 'loadout' }, Object.keys(KTC.Meta.COSMETICS).map((id) => {
        const owned = !!(s.cosmetics.owned && s.cosmetics.owned[id]);
        const sel = s.cosmetics.equipped === id;
        return el('button', {
          class: 'weap-chip' + (sel ? ' sel' : '') + (owned ? '' : ' locked'),
          onclick: () => { if (!owned) return this.toast('Locked — earn it via achievements.'); KTC.Audio.click(); s.cosmetics.equipped = id; KTC.Save.save(s); this.openRecords(); },
        }, [el('span', { text: owned ? KTC.Meta.COSMETICS[id].name : '🔒 ' + KTC.Meta.COSMETICS[id].name })]);
      }));
      rows.push(hats);

      // trinket set bonuses — how many of a tag you must carry to trigger each
      rows.push(el('div', { class: 'section-label', text: 'SET BONUSES — carry trinkets that share a tag' }));
      for (const set of KTC.Trinkets.sets) {
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', text: set.icon + ' ' + set.name }),
            el('div', { class: 'shop-desc', text: set.tiers.map((t) => t.n + '× → ' + t.desc).join('  ·  ') }),
          ]),
        ]));
      }

      const trOwn = KTC.Trinkets.order.filter((id) => s.trinkets[id]).length;
      const wpOwn = KTC.Weapons.order.filter((id) => s.weapons[id]).length;
      rows.push(el('div', { class: 'section-label', text: `BESTIARY · trinkets ${trOwn}/${KTC.Trinkets.order.length} · irons ${wpOwn}/${KTC.Weapons.order.length}` }));
      for (const id of KTC.Meta.ENEMY_ORDER) {
        const seen = !!s.discovered.enemies[id]; const info = KTC.Meta.ENEMY_INFO[id];
        rows.push(el('div', { class: 'shop-row' + (seen ? '' : ' locked') }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', text: seen ? info.name : '??? — undiscovered' }),
            el('div', { class: 'shop-desc', text: seen ? info.desc : 'Encounter it in the field.' }),
          ]),
        ]));
      }

      this.screen('shop', [
        el('h2', { class: 'screen-title', text: 'RECORDS' }),
        el('div', { class: 'stat-row', html: `Extractions <b>${s.stats.extractions}</b> · Deaths <b>${s.stats.deaths}</b> · Kills <b>${s.stats.kills}</b> · Best haul <b>${s.stats.bestLoot}</b>` }),
        el('div', { class: 'shop-list' }, rows),
        el('div', { class: 'menu-buttons' }, [this.bigBtn('BACK', () => { KTC.Audio.click(); g.setState('menu'); })]),
      ]);
    }

    // ---------------- buttons ----------------
    bigBtn(label, fn) { return el('button', { class: 'btn big', text: label, onclick: (e) => fn(e.currentTarget) }); }
    btn(label, fn) { return el('button', { class: 'btn', text: label, onclick: (e) => fn(e.currentTarget) }); }
    smallBtn(label, fn) { return el('button', { class: 'btn small', text: label, onclick: (e) => fn(e.currentTarget) }); }
    buyBtn(price, fn) { return el('button', { class: 'btn buy', html: `<span class="coin">◉</span> ${price}`, onclick: (e) => fn(e.currentTarget) }); }
    toast(msg) { this.toastEl.textContent = msg; this.toastEl.classList.remove('hidden'); this._toastT = 2.2; }
    deny() { KTC.Audio.hit(); this.toast('Not enough gold, partner.'); }
    denyMat() { KTC.Audio.hit(); this.toast('Not enough materials.'); }

    // ---------------- base HUD ----------------
    updateBaseHUD() {
      this.baseMats.innerHTML = `<span class="coin">◉</span> ${this.game.save.gold} &nbsp; ${this.matHtml(this.game.save.materials)}`;
      if (this._toastT > 0) { this._toastT -= 1 / 60; if (this._toastT <= 0) this.toastEl.classList.add('hidden'); }
    }

    // ---------------- run HUD ----------------
    updateHUD() {
      const g = this.game, p = g.player, r = g.run;
      if (!p || !r) return;

      const mag = p.magSize();
      if (this._pipCount !== mag) {
        this._pipCount = mag; this.ammoRow.innerHTML = '';
        for (let i = 0; i < mag; i++) this.ammoRow.appendChild(el('div', { class: 'pip' }));
      }
      const pips = this.ammoRow.children;
      for (let i = 0; i < pips.length; i++) pips[i].className = 'pip' + (i < p.ammo ? ' on' : '');
      if (p.reloading) { this.reloadBar.classList.add('show'); this.reloadFill.style.width = (100 * (1 - p.reloadT / p.reloadTotal)) + '%'; }
      else this.reloadBar.classList.remove('show');
      const wdef = p.weapon();
      // repeater heat gauge — only shown for the overheating iron
      if (wdef.quirk === 'overheat') {
        this.heatBar.classList.remove('hidden');
        this.heatFill.style.width = (100 * p.heat) + '%';
        this.heatBar.classList.toggle('over', p.overheated);
      } else this.heatBar.classList.add('hidden');
      const marks = p.marksmanReady ? ' — AIMED' : '';
      this.weaponName.textContent = wdef.name + (wdef.mech ? ' · ' + wdef.mech : '') + (p.reloading ? ' — RELOADING' : (p.overheated ? ' — OVERHEATED' : (p.ammo === 0 ? ' — EMPTY' : marks)));

      const tstamp = g.trinkets.join(',');
      if (tstamp !== this._trinketStamp) {
        this._trinketStamp = tstamp; this.trinketRow.innerHTML = '';
        const counts = {}; for (const id of g.trinkets) counts[id] = (counts[id] || 0) + 1;
        for (const id in counts) {
          const t = KTC.Trinkets.get(id); if (!t) continue;
          const chip = el('div', { class: 'trinket-chip rar-' + t.rarity, title: t.name + ' — ' + t.desc }, [el('span', { class: 'ti', text: t.icon })]);
          if (counts[id] > 1) chip.appendChild(el('span', { class: 'tx', text: '×' + counts[id] }));
          this.trinketRow.appendChild(chip);
        }
        // active set bonuses (derive from the same trinket loadout)
        this.setsRow.innerHTML = '';
        for (const s of (g.activeSets || [])) {
          const tip = s.name + ' (' + s.count + ') — ' + s.tiers.map((t) => t.desc).join(' · ');
          this.setsRow.appendChild(el('div', { class: 'set-chip set-' + s.id, title: tip }, [
            el('span', { class: 'si', text: s.icon }),
            el('span', { class: 'sn', text: s.name }),
            el('span', { class: 'sc', text: '×' + s.count }),
          ]));
        }
      }

      const sd = g.showdown;
      this.showdownEl.classList.remove('hidden');
      this.sdFill.style.width = (100 * (sd.active ? sd.t / (3 + g.mods.showdownDurationBonus) : sd.meter)) + '%';
      this.showdownEl.classList.toggle('active', sd.active);
      this.showdownEl.classList.toggle('ready', !sd.active && sd.meter >= 1);
      this.sdLabel.textContent = sd.active ? 'SHOWDOWN!' : (sd.meter >= 1 ? 'SHOWDOWN READY — Q / RMB' : 'SHOWDOWN');

      if (this._heartMax !== p.maxHp) {
        this._heartMax = p.maxHp; this.heartsEl.innerHTML = '';
        for (let i = 0; i < p.maxHp; i++) this.heartsEl.appendChild(el('div', { class: 'heart' }));
      }
      const hearts = this.heartsEl.children;
      for (let i = 0; i < hearts.length; i++) hearts[i].className = 'heart' + (i < p.hp ? ' on' : '');

      // active item slot
      if (p.item) {
        const it = KTC.Items.get(p.item);
        this.itemEl.classList.remove('hidden');
        this.itemEl.classList.toggle('empty', p.itemCharges <= 0);
        this.itemEl.innerHTML = `<span class="ii" style="color:${it.color}">${it.icon}</span> ${it.name} <b>×${p.itemCharges}</b> <span class="key">[F]</span>`;
      } else this.itemEl.classList.add('hidden');

      this.killsEl.textContent = r.kills;
      this.timerEl.textContent = U.formatTime(r.time);
      this.lootEl.innerHTML = `<span class="coin">◉</span> ${r.gold} <span class="val">✦ ${r.satchel.length}/${r.cap}</span>` + (r.keys > 0 ? ` <span class="keys">🔑 ${r.keys}</span>` : '');
      this.matsEl.innerHTML = this.matHtml(r.materials, true);

      // threat bar (0..~20 mapped to full, colour shifts to red)
      const tv = U.clamp(g.threat / 20, 0, 1);
      this.threatFill.style.width = (tv * 100) + '%';
      this.threatFill.style.background = `hsl(${U.lerp(90, 0, tv)}, 60%, 45%)`;

      // zone label on the threat readout
      const zone = g.level.zoneAt(p.x, p.y);
      this.threatWrap.querySelector('.threat-label').textContent = (zone ? KTC.Zones.biome(zone.biome).name.toUpperCase() : 'THREAT');

      if (KTC.Input.actDown('satchel')) {
        const stamp = r.satchel.length + '/' + r.cap + this.matHtml(r.materials);
        if (stamp !== this._satchelStamp) {
          this._satchelStamp = stamp;
          const rows = r.satchel.map((it) => `<div class="satchel-row"><span>${it.name}</span><span class="coin">◉ ${it.value}</span></div>`);
          const total = r.satchel.reduce((s, it) => s + it.value, 0);
          this.satchelPanel.innerHTML =
            `<div class="satchel-title">SATCHEL ${r.satchel.length}/${r.cap}</div>` +
            (rows.length ? rows.join('') : '<div class="satchel-row empty">empty — loot containers (hold E)</div>') +
            `<div class="satchel-row total"><span>Valuables</span><span class="coin">◉ ${total}</span></div>` +
            `<div class="satchel-row"><span>Loose gold</span><span class="coin">◉ ${r.gold}</span></div>` +
            `<div class="satchel-row"><span>Materials</span><span>${this.matHtml(r.materials, true) || '—'}</span></div>`;
        }
        this.satchelPanel.classList.remove('hidden');
      } else { this.satchelPanel.classList.add('hidden'); this._satchelStamp = ''; }

      if (r.combo >= 3) { this.comboEl.classList.remove('hidden'); this.comboEl.textContent = 'COMBO x' + r.combo; }
      else this.comboEl.classList.add('hidden');

      const ex = g.extract;
      if (ex && ex.progress > 0) {
        this.extractEl.classList.remove('hidden');
        const remain = Math.ceil(g.HOLD_TIME - ex.progress);
        this.extractEl.textContent = ex.holding ? `EXTRACTING… ${remain}` : 'STAY WITH THE COACH!';
        this.extractEl.classList.toggle('warn', !ex.holding);
      } else this.extractEl.classList.add('hidden');

      if (this._toastT > 0) { this._toastT -= 1 / 60; if (this._toastT <= 0) this.toastEl.classList.add('hidden'); }
    }
  }

  KTC.UI = UI;
})(window.KTC);
