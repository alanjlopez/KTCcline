// ui.js — DOM HUD + menu / camp / shop / result screens, plus toasts. Canvas
// draws the world; everything text-heavy lives in HTML overlays so it stays
// crisp at any resolution. The shop and camp screens are rendered from the
// current save each time they open.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;

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

    buildStaticHud() {
      this.hud.innerHTML = '';
      // weapon panel (top-left) — mirrors the reference HUD
      this.gunBadge = el('canvas', { class: 'gun-badge', width: 40, height: 26 });
      this.ammoRow = el('div', { class: 'ammo-row' });
      this.reloadBar = el('div', { class: 'reload-bar' }, [el('div', { class: 'reload-fill' })]);
      this.reloadFill = this.reloadBar.firstChild;
      this.weaponName = el('div', { class: 'weapon-name' });
      const wpanel = el('div', { class: 'hud-panel weapon-panel' }, [
        this.gunBadge,
        el('div', { class: 'ammo-wrap' }, [this.ammoRow, this.reloadBar, this.weaponName]),
      ]);

      this.killsEl = el('div', { class: 'hud-kills', text: '0' });
      this.comboEl = el('div', { class: 'hud-combo hidden' });
      this.timerEl = el('div', { class: 'hud-timer', text: '00:00' });
      this.lootEl = el('div', { class: 'hud-loot', html: '<span class="coin">◉</span> 0' });
      this.heartsEl = el('div', { class: 'hud-hearts' });
      this.extractEl = el('div', { class: 'hud-extract hidden' });

      this.hud.appendChild(wpanel);
      this.hud.appendChild(el('div', { class: 'hud-top-center' }, [this.killsEl, this.comboEl]));
      this.hud.appendChild(el('div', { class: 'hud-top-right' }, [this.timerEl, this.lootEl]));
      this.hud.appendChild(this.heartsEl);
      this.hud.appendChild(this.extractEl);

      this.toastEl = el('div', { class: 'toast hidden' });
      this.hud.appendChild(this.toastEl);

      // satchel contents panel, shown while Tab is held
      this.satchelPanel = el('div', { class: 'satchel-panel hidden' });
      this.hud.appendChild(this.satchelPanel);
      this._satchelStamp = '';

      this.drawGunBadge();
    }

    drawGunBadge() {
      const c = this.gunBadge.getContext('2d');
      c.clearRect(0, 0, 40, 26);
      c.save();
      c.translate(6, 15);
      c.scale(1.2, 1.2);
      // minimal revolver silhouette
      c.fillStyle = '#d8c7a6';
      c.fillRect(0, -2, 14, 4);         // barrel
      c.fillRect(9, -4, 5, 4);          // hammer housing
      c.fillRect(2, 1, 4, 6);           // grip
      c.beginPath(); c.arc(8, 0, 3, 0, U.TAU); c.fill();  // cylinder
      c.fillStyle = '#20201c';
      c.beginPath(); c.arc(8, 0, 1.2, 0, U.TAU); c.fill();
      c.restore();
    }

    onState(s) {
      // hide all overlay screens, then show the relevant one
      this.root.querySelectorAll('.screen').forEach((n) => n.remove());
      this.hud.classList.toggle('hidden', !(s === 'raid' || s === 'paused'));
      if (s === 'menu') this.renderMenu();
      else if (s === 'camp') this.renderCamp();
      else if (s === 'shop') this.renderShop();
      else if (s === 'dead') this.renderResult(false);
      else if (s === 'extracted') this.renderResult(true);
      else if (s === 'paused') this.renderPause();
    }

    screen(cls, kids) {
      const s = el('div', { class: 'screen ' + cls }, kids);
      this.root.appendChild(s);
      return s;
    }

    goldLine() {
      return el('div', { class: 'gold-line', html: `<span class="coin">◉</span> ${this.game.save.gold} banked` });
    }

    // ---------------- main menu ----------------
    renderMenu() {
      const g = this.game;
      const st = g.save.stats;
      this.screen('menu', [
        el('div', { class: 'title-wrap' }, [
          el('h1', { class: 'game-title', text: 'KILL THE CROWS' }),
          el('div', { class: 'subtitle', text: 'a dust-and-lead extraction run' }),
        ]),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('ENTER TOWN', () => { KTC.Audio.click(); g.setState('camp'); }),
          this.btn(g.save.muted ? 'SOUND: OFF' : 'SOUND: ON', (b) => {
            g.save.muted = !g.save.muted; KTC.Audio.setMuted(g.save.muted);
            KTC.Save.save(g.save); b.textContent = g.save.muted ? 'SOUND: OFF' : 'SOUND: ON';
          }),
        ]),
        el('div', { class: 'stat-row', html:
          `Extractions <b>${st.extractions}</b> · Deaths <b>${st.deaths}</b> · Kills <b>${st.kills}</b> · Best haul <b>${st.bestLoot}</b>` }),
        el('div', { class: 'controls-help', html:
          '<b>WASD</b> move · <b>Mouse</b> aim · <b>Click</b> shoot · <b>R</b> reload · <b>Space</b> dodge-roll · <b>E</b> loot · <b>Tab</b> satchel · <b>Esc</b> pause' }),
        el('div', { class: 'blurb', text:
          'One bullet, one dead Crow — theirs take longer, so watch for the tells: a raised knife, a glowing aim line, a sniper\'s laser that locks before the shot. Rummage containers (hold E) to fill your satchel, then reach the stagecoach and hold it to escape with the haul. Die and the dirt keeps everything. Bank what you extract; spend it in camp to come back deadlier.' }),
      ]);
    }

    // ---------------- camp (hub between raids) ----------------
    renderCamp() {
      const g = this.game;
      const owned = KTC.Weapons.order.filter((id) => g.save.weapons[id]);
      const loadout = el('div', { class: 'loadout' }, owned.map((id) => {
        const w = KTC.Weapons.get(id);
        const sel = g.save.equipped === id;
        return el('button', {
          class: 'weap-chip' + (sel ? ' sel' : ''),
          onclick: () => { KTC.Audio.click(); g.save.equipped = id; KTC.Save.save(g.save); this.renderCamp2(); },
        }, [el('span', { text: w.name })]);
      }));
      this._campScreen = this.screen('camp', [
        el('h2', { class: 'screen-title', text: 'CAMP' }),
        this.goldLine(),
        el('div', { class: 'section-label', text: 'LOADOUT — pick your iron' }),
        loadout,
        el('div', { class: 'menu-buttons row' }, [
          this.bigBtn('START RAID', () => { KTC.Audio.click(); g.startRaid(); }),
          this.btn('GENERAL STORE', () => { KTC.Audio.click(); g.setState('shop'); }),
          this.btn('TITLE', () => { KTC.Audio.click(); g.setState('menu'); }),
        ]),
        el('div', { class: 'hint', text: 'Loot you carry is only yours once you EXTRACT. Die and it stays in the dirt.' }),
      ]);
    }
    // re-render camp in place (after equip)
    renderCamp2() { this.root.querySelectorAll('.screen').forEach((n) => n.remove()); this.renderCamp(); }

    // ---------------- shop ----------------
    renderShop() {
      const g = this.game;
      const rows = [];

      rows.push(el('div', { class: 'section-label', text: 'IRON — buy & equip' }));
      for (const id of KTC.Weapons.order) {
        const w = KTC.Weapons.get(id);
        const owned = !!g.save.weapons[id];
        const equipped = g.save.equipped === id;
        let action;
        if (equipped) action = el('span', { class: 'tag equipped', text: 'EQUIPPED' });
        else if (owned) action = this.smallBtn('EQUIP', () => { g.save.equipped = id; KTC.Save.save(g.save); this.reShop(); });
        else action = this.buyBtn(w.price, () => {
          if (g.save.gold < w.price) return this.deny();
          g.save.gold -= w.price; g.save.weapons[id] = true; g.save.equipped = id;
          KTC.Save.save(g.save); KTC.Audio.coin(); this.reShop();
        });
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', text: w.name }),
            el('div', { class: 'shop-desc', text: w.desc }),
            el('div', { class: 'shop-stats', text:
              `mag ${w.magSize} · ${w.pellets > 1 ? w.pellets + ' pellets' : 'range ' + w.proj.range} · ${w.auto ? 'auto' : 'semi'} · reload ${w.reloadTime}s` }),
          ]),
          action,
        ]));
      }

      rows.push(el('div', { class: 'section-label', text: 'UPGRADES — permanent' }));
      for (const key in KTC.Save.UPGRADES) {
        const u = KTC.Save.UPGRADES[key];
        const lvl = g.save.upgrades[key];
        const maxed = lvl >= u.max;
        const price = KTC.Save.upgradePrice(key, lvl);
        const dots = el('div', { class: 'dots' }, Array.from({ length: u.max }, (_, i) =>
          el('span', { class: 'dot' + (i < lvl ? ' on' : '') })));
        let action;
        if (maxed) action = el('span', { class: 'tag equipped', text: 'MAX' });
        else action = this.buyBtn(price, () => {
          if (g.save.gold < price) return this.deny();
          g.save.gold -= price; g.save.upgrades[key]++; KTC.Save.save(g.save); KTC.Audio.coin(); this.reShop();
        });
        rows.push(el('div', { class: 'shop-row' }, [
          el('div', { class: 'shop-info' }, [
            el('div', { class: 'shop-name', text: u.name }),
            el('div', { class: 'shop-desc', text: u.desc }),
            dots,
          ]),
          action,
        ]));
      }

      this.screen('shop', [
        el('h2', { class: 'screen-title', text: 'GENERAL STORE' }),
        this.goldLine(),
        el('div', { class: 'shop-list' }, rows),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('BACK TO CAMP', () => { KTC.Audio.click(); this.game.setState('camp'); }),
        ]),
      ]);
    }
    reShop() { this.root.querySelectorAll('.screen').forEach((n) => n.remove()); this.renderShop(); }
    deny() { KTC.Audio.hit(); this.toast('Not enough gold, partner.'); }

    // ---------------- result screens ----------------
    renderResult(win) {
      const g = this.game, r = g.run;
      const total = g.runValue();
      const lines = [
        `Kills <b>${r.kills}</b>`,
        `Best combo <b>x${r.comboMax}</b>`,
        `Time <b>${U.formatTime(r.time)}</b>`,
      ];
      // itemize the haul — what you banked, or exactly what the dirt kept
      const itemRows = r.satchel.map((it) =>
        el('div', { class: 'haul-row', html: `<span>${it.name}</span><span class="coin">◉ ${it.value}</span>` }));
      if (r.gold > 0) {
        itemRows.push(el('div', { class: 'haul-row', html: `<span>Loose gold</span><span class="coin">◉ ${r.gold}</span>` }));
      }
      this.screen('result ' + (win ? 'win' : 'lose'), [
        el('h1', { class: 'result-title', text: win ? 'EXTRACTED' : 'YOU DIED' }),
        el('div', { class: 'result-loot', html: win
          ? `<span class="coin">◉</span> ${total} banked`
          : `<span class="coin">◉</span> ${total} lost in the dirt` }),
        itemRows.length ? el('div', { class: 'haul-list' + (win ? '' : ' lost') }, itemRows) : null,
        el('div', { class: 'result-stats', html: lines.join(' &nbsp;·&nbsp; ') }),
        el('div', { class: 'gold-line', html: `Stash: <span class="coin">◉</span> ${g.save.gold}` }),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('BACK TO CAMP', () => { KTC.Audio.click(); g.setState('camp'); }),
        ]),
      ]);
    }

    renderPause() {
      const g = this.game;
      this.screen('pause', [
        el('h2', { class: 'screen-title', text: 'PAUSED' }),
        el('div', { class: 'menu-buttons' }, [
          this.bigBtn('RESUME', () => { KTC.Audio.click(); g.setState('raid'); }),
          this.btn('ABANDON RAID', () => {
            KTC.Audio.click();
            // abandoning forfeits the run bag, like dying but without a death
            g.save.stats.raids++; KTC.Save.save(g.save); g.setState('camp');
          }),
        ]),
        el('div', { class: 'hint', text: 'Abandoning leaves your carried loot behind.' }),
      ]);
    }

    // ---------------- buttons ----------------
    bigBtn(label, fn) { return el('button', { class: 'btn big', text: label, onclick: (e) => fn(e.currentTarget) }); }
    btn(label, fn) { return el('button', { class: 'btn', text: label, onclick: (e) => fn(e.currentTarget) }); }
    smallBtn(label, fn) { return el('button', { class: 'btn small', text: label, onclick: (e) => fn(e.currentTarget) }); }
    buyBtn(price, fn) { return el('button', { class: 'btn buy', html: `<span class="coin">◉</span> ${price}`, onclick: (e) => fn(e.currentTarget) }); }

    toast(msg) {
      this.toastEl.textContent = msg;
      this.toastEl.classList.remove('hidden');
      this._toastT = 2.2;
    }

    // ---------------- per-frame HUD ----------------
    updateHUD() {
      const g = this.game, p = g.player, r = g.run;
      if (!p) return;

      // ammo pips
      const mag = p.magSize();
      if (this._pipCount !== mag) {
        this._pipCount = mag;
        this.ammoRow.innerHTML = '';
        for (let i = 0; i < mag; i++) this.ammoRow.appendChild(el('div', { class: 'pip' }));
      }
      const pips = this.ammoRow.children;
      for (let i = 0; i < pips.length; i++) pips[i].className = 'pip' + (i < p.ammo ? ' on' : '');
      if (p.reloading) {
        this.reloadBar.classList.add('show');
        this.reloadFill.style.width = (100 * (1 - p.reloadT / p.reloadTotal)) + '%';
      } else {
        this.reloadBar.classList.remove('show');
      }
      this.weaponName.textContent = p.weapon().name + (p.reloading ? ' — RELOADING' : (p.ammo === 0 ? ' — EMPTY' : ''));

      // hearts
      if (this._heartMax !== p.maxHp) {
        this._heartMax = p.maxHp;
        this.heartsEl.innerHTML = '';
        for (let i = 0; i < p.maxHp; i++) this.heartsEl.appendChild(el('div', { class: 'heart' }));
      }
      const hearts = this.heartsEl.children;
      for (let i = 0; i < hearts.length; i++) hearts[i].className = 'heart' + (i < p.hp ? ' on' : '');

      // counters
      this.killsEl.textContent = r.kills;
      this.timerEl.textContent = U.formatTime(r.time);
      this.lootEl.innerHTML =
        `<span class="coin">◉</span> ${r.gold} <span class="val">✦ ${r.satchel.length}/${r.cap}</span>`;

      // satchel panel while Tab is held (game keeps running)
      if (KTC.Input.keys['Tab']) {
        const stamp = r.satchel.length + '/' + r.cap;
        if (stamp !== this._satchelStamp) {
          this._satchelStamp = stamp;
          const rows = r.satchel.map((it) =>
            `<div class="satchel-row"><span>${it.name}</span><span class="coin">◉ ${it.value}</span></div>`);
          const total = r.satchel.reduce((s, it) => s + it.value, 0);
          this.satchelPanel.innerHTML =
            `<div class="satchel-title">SATCHEL ${r.satchel.length}/${r.cap}</div>` +
            (rows.length ? rows.join('') : '<div class="satchel-row empty">empty — loot containers (hold E)</div>') +
            `<div class="satchel-row total"><span>Valuables</span><span class="coin">◉ ${total}</span></div>` +
            `<div class="satchel-row"><span>Loose gold</span><span class="coin">◉ ${r.gold}</span></div>`;
        }
        this.satchelPanel.classList.remove('hidden');
      } else {
        this.satchelPanel.classList.add('hidden');
        this._satchelStamp = '';
      }

      if (r.combo >= 3) {
        this.comboEl.classList.remove('hidden');
        this.comboEl.textContent = 'COMBO x' + r.combo;
      } else this.comboEl.classList.add('hidden');

      // extraction status
      const ex = g.extract;
      if (ex && !ex.done && ex.progress > 0) {
        this.extractEl.classList.remove('hidden');
        const remain = Math.ceil(g.HOLD_TIME - ex.progress);
        this.extractEl.textContent = ex.holding ? `EXTRACTING… ${remain}` : 'STAY WITH THE COACH!';
        this.extractEl.classList.toggle('warn', !ex.holding);
      } else this.extractEl.classList.add('hidden');

      // toast decay
      if (this._toastT > 0) {
        this._toastT -= 1 / 60;
        if (this._toastT <= 0) this.toastEl.classList.add('hidden');
      }
    }
  }

  KTC.UI = UI;
})(window.KTC);
