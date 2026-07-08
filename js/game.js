// game.js — the glue: state machine (menu → camp → raid → extracted/dead),
// fixed-ish update loop, camera, world rendering, and the combat callbacks the
// other modules call into.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';
  const U = KTC.Util;
  const S = KTC.Sprites;
  const In = KTC.Input;

  const ZOOM = 3;
  const HOLD_TIME = 6;          // seconds to complete an extraction
  const EXTRACT_RADIUS = 48;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;

      this.state = 'menu';
      this.save = KTC.Save.load();
      this.raidsCleared = 0;
      this.HOLD_TIME = HOLD_TIME;
      this.diff = KTC.Tune.difficulty.outlaw;
      this._hitStop = 0;
      this.decals = [];
      this.damageDir = 0; this.damageDirT = 0;
      this._heartT = 0;
      KTC.Audio.setMuted(this.save.muted);
      this.applySettings();

      this.level = new KTC.Level();
      this.particles = new KTC.Particles();
      this.spawner = new KTC.Spawner();

      this.player = null;
      this.enemies = [];
      this.projectiles = [];
      this.pickups = [];

      // roguelike state
      this.mods = KTC.Trinkets.defaultMods();
      this.trinkets = [];               // trinket ids active this run
      this.enemyScale = 1;              // <1 slows crows during a showdown
      this.showdown = { meter: 0, active: false, t: 0 };

      this.camera = { x: this.level.w / 2, y: this.level.h / 2 };
      this.run = null;
      this.extract = null;              // extraction point currently being held
      this.extractionPoints = [];       // all extraction points in the world
      this.threat = 0;                  // rises with time + depth; drives spawns
      this._threatTier = 0;
      this.baseMenu = null;             // which bench menu is open in the base
      this.nearBench = null;
      this.damageFlash = 0;
      this.menuPan = 0;

      this.ui = new KTC.UI(this);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('blur', () => { if (this.state === 'raid') this.setState('paused'); });

      this.level.generateWorld();  // backdrop for the menu
      this._last = performance.now();
      this.setState('menu');
      requestAnimationFrame((t) => this.frame(t));
    }

    resize() {
      const dpr = 1;
      this.canvas.width = Math.floor(window.innerWidth * dpr);
      this.canvas.height = Math.floor(window.innerHeight * dpr);
      this.ctx.imageSmoothingEnabled = false;
    }

    setState(s) {
      this.state = s;
      this.ui.onState(s);
      In.clear();
    }

    // mirror saved settings into the live systems
    applySettings() {
      const st = this.save.settings || {};
      KTC.Audio.setVolume(st.volume == null ? 0.35 : st.volume);
      KTC.Particles.shakeMul = st.shake == null ? 1 : st.shake;
      document.documentElement.classList.toggle('colorblind', !!st.colorblind);
      if (st.keys) Object.assign(KTC.Input.binds, st.keys);
    }

    // brief world freeze for punch on kills/explosions
    hitStop(sec) { if (sec > this._hitStop) this._hitStop = sec; }

    // capped persistent ground marks (blood / scorch)
    addDecal(x, y, type) {
      this.decals.push({ x, y, type, r: type === 'scorch' ? U.rand(14, 22) : U.rand(4, 8), rot: U.rand(0, U.TAU), a: type === 'scorch' ? 0.5 : 0.55 });
      if (this.decals.length > KTC.Tune.feel.decalMax) this.decals.shift();
    }

    renderDecals(ctx) {
      for (const d of this.decals) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.globalAlpha = d.a;
        if (d.type === 'scorch') {
          ctx.fillStyle = '#1a1512';
          ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.6, 0, 0, U.TAU); ctx.fill();
        } else {
          ctx.fillStyle = S.PAL.bloodDark;
          ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.7, 0, 0, U.TAU); ctx.fill();
          ctx.fillStyle = S.PAL.blood;
          ctx.beginPath(); ctx.ellipse(-d.r * 0.3, 0, d.r * 0.4, d.r * 0.3, 0, 0, U.TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // ---------------- base hub ----------------
    enterBase() {
      KTC.Audio.unlock();
      this.level.generateBase();
      this.trinkets = [];
      this.recomputeMods();
      this.player = new KTC.Player(this.level.spawn.x, this.level.spawn.y);
      this.player.applyStats(KTC.Save.deriveStats(this.save));
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.particles.clear();
      this.run = null;
      this.extract = null;
      this.extractionPoints = [];
      this.threat = 0;
      this.baseMenu = null;
      this.nearBench = null;
      this.showdown = { meter: 0, active: false, t: 0 };
      this.enemyScale = 1;
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
      this.setState('base');
      if (!this.save.tutorialSeen) this.ui.toast('Welcome to camp — walk to a bench and press E. Deploy at the Map Table.');
    }

    openBench(type) {
      this.baseMenu = type;
      KTC.Audio.click();
      this.ui.showBench(type);
    }

    closeBench() {
      this.baseMenu = null;
      this.ui.onState('base');
    }

    // ---------------- run lifecycle ----------------
    startRun() {
      KTC.Audio.unlock();
      this.diff = KTC.Tune.difficulty[this.save.settings.difficulty] || KTC.Tune.difficulty.outlaw;
      this.level.generateWorld();
      // trinkets you brought from the base (your insured loadout)
      this.trinkets = (this.save.loadout || []).filter((id) => KTC.Trinkets.get(id) && this.save.trinkets[id]);
      this.recomputeMods();

      const stats = KTC.Save.deriveStats(this.save);
      stats.maxHp += this.mods.maxHpBonus;
      this.player = new KTC.Player(this.level.spawn.x, this.level.spawn.y);
      this.player.applyStats(stats);

      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.particles.clear();
      this.spawner.reset();
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
      this.run = {
        gold: 0,
        satchel: [],                    // [{name, value}] — limited slots
        cap: stats.satchelCap,
        materials: { scrap: 0, iron: 0, relic: 0 },
        kills: 0, time: 0, combo: 0, comboT: 0, comboMax: 0,
        foundTrinkets: [],              // trinkets/guns picked up THIS run
        foundWeapons: [],
        killsSinceHeal: 0,
      };
      this.extractionPoints = this.level.extractionPoints;
      for (const ex of this.extractionPoints) { ex.progress = 0; ex.holding = false; ex.glow = U.rand(0, 6); }
      this.extract = null;
      this.threat = 0; this._threatTier = 0;
      this.showdown = { meter: 0, active: false, t: 0 };
      this.enemyScale = 1;
      this.damageFlash = 0; this.damageDirT = 0; this._heartT = 0; this._hitStop = 0;
      this.decals.length = 0;
      this._fullToastT = 0;
      this.baseMenu = null;
      this.emit('raidstart');
      this.setState('raid');
      if (!this.save.tutorialSeen) { this.save.tutorialSeen = true; KTC.Save.save(this.save); this.ui.toast('Loot with E · reach a stagecoach to extract · Q for showdown'); }
    }

    // materials feed the crafting benches; banked on extract, lost on death
    addMaterial(type, amount, x, y) {
      if (!this.run.materials) return;
      amount = Math.max(1, Math.round(amount * this.diff.rewardMul));
      this.run.materials[type] = (this.run.materials[type] || 0) + amount;
      const m = KTC.Zones.MATERIALS[type] || { icon: '?', color: '#fff' };
      this.particles.text(x, y - 10, m.icon + '+' + amount, m.color, { life: 0.7, size: 6 });
      KTC.Audio.pickup();
    }

    // ---------------- roguelike engine ----------------
    // Fold active trinkets (loadout + found this raid) into the shared mods.
    recomputeMods() {
      this.mods = KTC.Trinkets.aggregate(this.trinkets);
    }

    // Fire an event to every active trinket's hook of that name.
    emit(evt, data) {
      for (const id of this.trinkets) {
        const t = KTC.Trinkets.get(id);
        if (t && t.on && t.on[evt]) t.on[evt](this, data);
      }
    }

    gainGold(v) { if (this.run) this.run.gold += Math.max(0, Math.round(v * this.mods.goldMult * this.diff.rewardMul)); }
    healPlayer(n) {
      const p = this.player;
      if (p && !p.dead && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + n);
        this.particles.text(p.x, p.y - p.hh - 6, '+' + n + ' HP', '#c6533f', { life: 0.8 });
      }
    }

    // AoE that one-shots every crow in range (chain-reacts through Powder Keg).
    explode(x, y, radius, crit) {
      this.particles.burst(x, y, 22, { color: ['#f6e0a0', '#f0c060', '#e07a3a', '#6b5a45'], speedMin: 40, speedMax: 220, lifeMin: 0.2, lifeMax: 0.55, size: 3, grav: 40 });
      this.particles.spawn(x, y, { vx: 0, vy: 0, life: 0.18, size: radius * 1.6, color: 'rgba(255,220,150,0.5)', drag: 1 });
      this.particles.shake(5, 0.22);
      this.hitStop(KTC.Tune.feel.hitStopBoss);
      this.addDecal(x, y, 'scorch');
      KTC.Audio.explosion();
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (U.dist(x, y, e.x, e.y - e.hh * 0.4) < radius + e.r) {
          e.hurt(1, U.angle(x, y, e.x, e.y), this, crit);
        }
      }
    }

    // Lightning that forks from a point to the nearest untouched crows.
    chainLightning(x, y, jumps, exclude, crit) {
      let fromX = x, fromY = y;
      for (let j = 0; j < jumps; j++) {
        let best = null, bd = 130 * 130;
        for (const e of this.enemies) {
          if (e.dead || exclude.has(e)) continue;
          const d = U.dist2(fromX, fromY, e.x, e.y - e.hh * 0.4);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        exclude.add(best);
        this.particles.bolt(fromX, fromY, best.x, best.y - best.hh * 0.4);
        const bx = best.x, by = best.y - best.hh * 0.4;
        best.hurt(1, U.angle(fromX, fromY, best.x, best.y), this, crit);
        KTC.Audio.zap();
        fromX = bx; fromY = by;
      }
    }

    // ---------------- combat callbacks ----------------
    onEnemyKilled(e, crit) {
      const r = this.run;
      r.kills++;
      r.combo++;
      r.comboT = 3;
      r.comboMax = Math.max(r.comboMax, r.combo);
      this.hitStop(KTC.Tune.feel.hitStopKill);
      this.addDecal(e.x, e.y, 'blood');

      // showdown meter builds on kills (faster with combo + Deadeye Battery)
      if (!this.showdown.active) {
        this.showdown.meter = Math.min(1, this.showdown.meter +
          (0.07 + Math.min(0.06, r.combo * 0.004)) * this.mods.showdownGainMult);
      }

      // chaining kills pays a small bounty
      const bonus = Math.floor(r.combo / 3);
      if (bonus > 0) {
        this.gainGold(bonus);
        if (this.save.settings.damageNumbers) this.particles.text(e.x, e.y - e.hh - 6, `x${r.combo}`, '#e3c06a', { life: 0.7, size: 7 });
      }

      // on-kill effects — Twin Fang runs them twice
      const reps = this.mods.doubleOnKill ? 2 : 1;
      for (let i = 0; i < reps; i++) {
        if (this.mods.goldPerKill > 0) this.gainGold(this.mods.goldPerKill);
        if (this.mods.onKillExplode > 0) this.explode(e.x, e.y - e.hh * 0.4, this.mods.onKillExplode, crit);
        if (this.mods.lifestealKills > 0) {
          if (++r.killsSinceHeal >= this.mods.lifestealKills) { r.killsSinceHeal = 0; this.healPlayer(1); }
        }
        this.emit('kill', e);
      }
      if (crit) {
        this.gainGold(6);
        this.particles.text(e.x, e.y - e.hh - 14, 'GOLD!', '#e3c06a', { life: 0.7, size: 6 });
        this.particles.spark(e.x, e.y - e.hh * 0.4, 0);
      }
    }

    // gold is a weightless counter, carried loose in your pockets
    addGold(value, x, y) {
      const v = Math.max(0, Math.round(value * this.mods.goldMult * this.diff.rewardMul));
      this.run.gold += v;
      this.particles.text(x, y - 10, '+' + v, '#e3c06a', { life: 0.7, size: 6 });
    }

    // ---------------- found items (roguelike pickups) ----------------
    addTrinket(id, x, y) {
      const t = KTC.Trinkets.get(id);
      if (!t) return;
      this.trinkets.push(id);
      this.run.foundTrinkets.push(id);
      this.recomputeMods();
      // a fresh Iron Hide should grant its heart immediately
      if (t.stats) {
        const before = this.player.maxHp;
        const base = KTC.Save.deriveStats(this.save).maxHp;
        this.player.maxHp = base + this.mods.maxHpBonus;
        const gained = this.player.maxHp - before;
        if (gained > 0) this.player.hp += gained;
      }
      this.particles.text(x, y - 18, t.icon + ' ' + t.name, '#c9a2ff', { life: 1.4, size: 7 });
      KTC.Audio.trinket();
    }

    equipFoundWeapon(id, x, y) {
      if (!KTC.Weapons.get(id)) return;
      this.player.setWeapon(id);
      if (!this.run.foundWeapons.includes(id)) this.run.foundWeapons.push(id);
      this.particles.text(x, y - 18, KTC.Weapons.get(id).name, '#8ecfd4', { life: 1.4, size: 7 });
      KTC.Audio.trinket();
    }

    // ---------------- showdown ----------------
    tryShowdown() {
      const sd = this.showdown;
      if (sd.active || sd.meter < 1 || this.player.dead) return;
      sd.active = true;
      sd.meter = 0;
      sd.t = 3 + this.mods.showdownDurationBonus;
      this.enemyScale = 0.28;
      this.particles.shake(6, 0.3);
      KTC.Audio.showdown();
      this.emit('showdown');
    }

    updateShowdown(dt) {
      const sd = this.showdown;
      if (!sd.active) return;
      sd.t -= dt;
      // smoothly ease the world back to full speed as it ends
      this.enemyScale = sd.t < 0.5 ? U.lerp(1, 0.28, sd.t / 0.5) : 0.28;
      if (sd.t <= 0) { sd.active = false; sd.t = 0; this.enemyScale = 1; }
    }

    // valuables occupy satchel slots; returns false when the bag is full
    addValuable(name, value, x, y) {
      const r = this.run;
      if (r.satchel.length >= r.cap) {
        if (this._fullToastT <= 0) {
          this._fullToastT = 1.5;
          this.ui.toast('Satchel full!');
          KTC.Audio.denyFull();
        }
        return false;
      }
      r.satchel.push({ name, value });
      this.particles.text(x, y - 16, name, '#8ecfd4', { life: 1.1, size: 6 });
      this.particles.text(x, y - 8, '+' + value, '#e3c06a', { life: 0.9, size: 7 });
      return true;
    }

    satchelFull() {
      return this.run && this.run.satchel.length >= this.run.cap;
    }

    // everything the run is worth if you make it out alive
    runValue() {
      const r = this.run;
      return r.gold + r.satchel.reduce((sum, it) => sum + it.value, 0);
    }

    onPlayerDamaged(dmg, sx, sy) {
      this.damageFlash = 0.5;
      this.run.combo = 0;
      if (sx != null) { this.damageDir = U.angle(this.player.x, this.player.y, sx, sy); this.damageDirT = 1.2; }
    }

    onPlayerDeath() {
      const s = this.save;
      s.stats.deaths++;
      s.stats.raids++;
      s.stats.kills += this.run.kills;
      KTC.Save.save(s);
      this._deathT = 1.4;   // brief slow-mo before the screen
    }

    extractSuccess(ex) {
      if (ex) ex.done = true;
      this._extractDone = true;
      const s = this.save;
      const haul = this.runValue();
      s.gold += haul;
      s.stats.extractions++;
      s.stats.raids++;
      s.stats.kills += this.run.kills;
      s.stats.bestLoot = Math.max(s.stats.bestLoot, haul);
      // materials, trinkets & guns found this run are kept only because you got out
      for (const k in this.run.materials) s.materials[k] = (s.materials[k] || 0) + this.run.materials[k];
      for (const id of this.run.foundTrinkets) s.trinkets[id] = true;
      for (const id of this.run.foundWeapons) s.weapons[id] = true;
      KTC.Save.save(s);
      this.raidsCleared++;
      KTC.Audio.extractDone();
      this.setState('extracted');
    }

    // ---------------- loop ----------------
    frame(t) {
      let dt = (t - this._last) / 1000;
      this._last = t;
      if (dt > 0.05) dt = 0.05;         // clamp big hitches / tab-outs
      In.pollGamepad();
      // hit-stop: freeze the sim (still render) for a couple of frames of punch.
      // Don't clear input edges here — buffered presses should survive the freeze.
      if (this._hitStop > 0 && this.state === 'raid') {
        this._hitStop -= dt;
        this.render();
        requestAnimationFrame((n) => this.frame(n));
        return;
      }
      this.update(dt);
      this.render();
      In.endFrame();
      requestAnimationFrame((n) => this.frame(n));
    }

    update(dt) {
      this.menuPan += dt;
      if (this.state === 'menu' || this.state === 'extracted' || this.state === 'dead') {
        // gentle drifting backdrop
        this.camera.x = this.level.w / 2 + Math.cos(this.menuPan * 0.15) * this.level.w * 0.18;
        this.camera.y = this.level.h / 2 + Math.sin(this.menuPan * 0.12) * this.level.h * 0.16;
        this.particles.update(dt);
        return;
      }
      if (this.state === 'base') { this.updateBase(dt); return; }
      if (this.state === 'paused') return;
      if (this.state !== 'raid') return;

      if (In.actPressed('pause')) { this.setState('paused'); return; }

      // camera + world-space mouse (computed before player so aim is current)
      this.updateCamera(dt);
      const camLeft = this.camera.x - (this.canvas.width / ZOOM) / 2;
      const camTop = this.camera.y - (this.canvas.height / ZOOM) / 2;
      In.mouse.wx = camLeft + In.mouse.sx / ZOOM;
      In.mouse.wy = camTop + In.mouse.sy / ZOOM;

      const p = this.player;
      // gamepad right-stick aim overrides the mouse point
      if (In.pad.active && In.pad.aimMag > 0.35) {
        In.mouse.wx = p.x + In.pad.aimX * 140;
        In.mouse.wy = p.y - p.hh * 0.4 + In.pad.aimY * 140;
      }

      // death slow-mo → show screen
      if (p.dead) {
        this.particles.update(dt);
        this._deathT -= dt;
        if (this._deathT <= 0) this.setState('dead');
        this.damageFlash = U.approach(this.damageFlash, 0, dt);
        return;
      }

      this.run.time += dt;
      if (this.run.comboT > 0) { this.run.comboT -= dt; if (this.run.comboT <= 0) this.run.combo = 0; }
      if (this.damageFlash > 0) this.damageFlash = U.approach(this.damageFlash, 0, dt * 1.6);

      // threat climbs with time, faster in deeper/deadlier zones — the longer
      // you linger and the farther you push, the more crows pour in
      const zone = this.level.zoneAt(p.x, p.y);
      const zt = zone ? KTC.Zones.biome(zone.biome).threat : 0.3;
      this.threat += dt * (KTC.Tune.threat.base + zt * KTC.Tune.threat.zoneMul) * this.diff.threatMul;
      const tier = Math.floor(this.threat / KTC.Tune.threat.milestone);
      if (tier > this._threatTier) { this._threatTier = tier; this.ui.toast('The crows are closing in…'); this.particles.shake(3, 0.3); }

      // low-HP heartbeat + fading directional damage indicator
      if (this.damageDirT > 0) this.damageDirT -= dt;
      if (p.hp <= 2 && !p.dead) { this._heartT -= dt; if (this._heartT <= 0) { this._heartT = 0.85; KTC.Audio.heartbeat(); } }
      else this._heartT = 0;

      // showdown: trigger with Q or right-click, then slow the crows
      if (In.actPressed('showdown') || In.mouse.rclicked) this.tryShowdown();
      this.updateShowdown(dt);
      const es = this.enemyScale;

      p.update(dt, this);                          // player stays at full speed
      this.spawner.update(dt * es, this);
      for (const e of this.enemies) e.update(dt * es, this);
      for (const pr of this.projectiles) pr.update(dt, this);   // scales itself by team
      for (const pk of this.pickups) pk.update(dt, this);
      // loot channels drain fast when abandoned (they don't hard-reset)
      const channeling = p.looting ? p.nearContainer : null;
      for (const c of this.level.containers) {
        if (c !== channeling && c.lootProgress > 0 && !c.opened) {
          c.lootProgress = Math.max(0, c.lootProgress - dt * 2);
        }
      }
      if (this._fullToastT > 0) this._fullToastT -= dt;
      this.particles.update(dt);
      this.updateExtract(dt);

      // reap dead
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.projectiles = this.projectiles.filter((pr) => !pr.dead);
      this.pickups = this.pickups.filter((pk) => !pk.dead);

      this.ui.updateHUD();
    }

    // Any of the world's extraction points can be held; whichever you're
    // standing on charges, the rest bleed back down.
    updateExtract(dt) {
      const p = this.player;
      let active = null;
      for (const ex of this.extractionPoints) {
        ex.glow += dt;
        const inRange = !p.dead && U.dist(p.x, p.y, ex.x, ex.y) < EXTRACT_RADIUS;
        if (inRange && !active) {
          active = ex;
          const before = ex.progress;
          ex.holding = true;
          ex.progress += dt;
          if (Math.floor(ex.progress) !== Math.floor(before)) KTC.Audio.extractTick();
          if (ex.progress >= HOLD_TIME) { this.extractSuccess(ex); return; }
        } else {
          ex.holding = false;
          ex.progress = Math.max(0, ex.progress - dt * 1.5);
        }
      }
      this.extract = active;   // drives the spawn frenzy + HUD readout
    }

    // ---------------- base hub loop ----------------
    updateBase(dt) {
      this.updateCamera(dt);
      const camLeft = this.camera.x - (this.canvas.width / ZOOM) / 2;
      const camTop = this.camera.y - (this.canvas.height / ZOOM) / 2;
      In.mouse.wx = camLeft + In.mouse.sx / ZOOM;
      In.mouse.wy = camTop + In.mouse.sy / ZOOM;

      // find the nearest bench in reach
      this.nearBench = null;
      let bd = 1e9;
      for (const bn of this.level.benches) {
        const d = U.dist(this.player.x, this.player.y, bn.x, bn.y);
        if (d < bn.r && d < bd) { bd = d; this.nearBench = bn; }
      }

      if (this.baseMenu) {
        if (In.actPressed('pause')) this.closeBench();
      } else {
        this.player.update(dt, this);           // walk around (combat is disabled in base)
        if (this.nearBench && In.actPressed('loot')) this.openBench(this.nearBench.type);
      }
      this.particles.update(dt);
      this.ui.updateBaseHUD();
    }

    updateCamera(dt) {
      const vw = this.canvas.width / ZOOM, vh = this.canvas.height / ZOOM;
      let cx = this.player.x, cy = this.player.y - 8;
      // lead the camera toward the crosshair so you see where you're aiming
      if (this.state === 'raid') {
        const lead = KTC.Tune.feel.camLead;
        cx += U.clamp(In.mouse.wx - this.player.x, -vw * 0.28, vw * 0.28) * lead;
        cy += U.clamp(In.mouse.wy - this.player.y, -vh * 0.28, vh * 0.28) * lead;
      }
      cx = this.level.w > vw ? U.clamp(cx, vw / 2, this.level.w - vw / 2) : this.level.w / 2;
      cy = this.level.h > vh ? U.clamp(cy, vh / 2, this.level.h - vh / 2) : this.level.h / 2;
      const k = 1 - Math.pow(0.0001, dt);
      this.camera.x = U.lerp(this.camera.x, cx, k);
      this.camera.y = U.lerp(this.camera.y, cy, k);
    }

    // ---------------- render ----------------
    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#20201c';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const vw = this.canvas.width / ZOOM, vh = this.canvas.height / ZOOM;
      const camLeft = Math.round(this.camera.x - vw / 2);
      const camTop = Math.round(this.camera.y - vh / 2);
      const sx = this.particles.shakeX, sy = this.particles.shakeY;

      ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
      ctx.translate(-camLeft + sx, -camTop + sy);

      this.level.renderBackground(ctx);
      if (this.decals.length) this.renderDecals(ctx);

      // gather y-sorted drawables
      const draw = [];
      for (const pr of this.level.props) draw.push(pr);
      for (const bn of this.level.benches) draw.push(bn);
      for (const c of this.level.containers) draw.push(c);
      for (const pk of this.pickups) draw.push(pk);
      for (const e of this.enemies) draw.push(e);
      const showP = this.player && !this.player.dead && (this.state === 'raid' || this.state === 'paused' || this.state === 'base');
      if (showP) draw.push(this.player);
      for (const ex of this.extractionPoints) draw.push({ y: ex.y, render: (c) => this.renderExtract(c, ex) });
      draw.sort((a, b) => a.y - b.y);
      for (const d of draw) d.render(ctx);

      // dead player corpse
      if (this.player && this.player.dead && this.state !== 'menu' && this.state !== 'base') {
        ctx.save();
        ctx.translate(this.player.x, this.player.y);
        ctx.rotate(Math.PI / 2);
        ctx.globalAlpha = 0.9;
        S.player(ctx, { aim: 0, walk: 0, gun: this.player.weapon().sprite });
        ctx.restore();
      }

      for (const pr of this.projectiles) pr.render(ctx);
      this.particles.render(ctx);
      this.particles.renderBolts(ctx);
      if (this.state === 'raid' || this.state === 'paused') this.renderLootPrompts(ctx);
      if (this.state === 'base') this.renderBasePrompt(ctx);
      this.particles.renderText(ctx);

      // ---- screen-space overlays ----
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.renderPostFX(ctx);
      if (this.state === 'raid' || this.state === 'paused') {
        this.renderExtractArrow(ctx, camLeft, camTop);
        this.renderMinimap(ctx);
        this.renderCrosshair(ctx);
      }
      if (this.state === 'menu' || this.state === 'extracted' || this.state === 'dead') {
        // darken backdrop so DOM overlays read clearly
        ctx.fillStyle = 'rgba(20,18,14,0.55)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    // "PRESS E" over the nearest base bench (world space)
    renderBasePrompt(ctx) {
      const bn = this.nearBench;
      if (!bn || this.baseMenu) return;
      ctx.font = '6px "Courier New", monospace';
      ctx.textAlign = 'center';
      const ty = bn.y - 26 + Math.sin(performance.now() / 300) * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText('E  ' + bn.label, bn.x + 0.6, ty + 0.6);
      ctx.fillStyle = '#e3c06a';
      ctx.fillText('E  ' + bn.label, bn.x, ty);
      ctx.textAlign = 'left';
    }

    // corner minimap: organic biome regions, roads, extractions, player, threat
    renderMinimap(ctx) {
      const L = this.level.zones;
      if (!L || !L.cores) return;
      const size = 150, pad = 14;
      const mx = this.canvas.width - size - pad, my = pad + 40;
      const sc = size / Math.max(L.w, L.h);
      const ox = mx + (size - L.w * sc) / 2, oy = my + (size - L.h * sc) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(14,12,9,0.8)';
      ctx.fillRect(mx - 4, my - 4, size + 8, size + 8);
      ctx.strokeStyle = '#4a4030'; ctx.lineWidth = 2; ctx.strokeRect(mx - 4, my - 4, size + 8, size + 8);
      // paint regions by sampling nearest core on a coarse grid
      const NX = 46, NY = Math.max(1, Math.round(NX * L.h / L.w));
      const cw = L.w / NX * sc + 1, ch = L.h / NY * sc + 1;
      for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
        const wx = (ix + 0.5) / NX * L.w, wy = (iy + 0.5) / NY * L.h;
        ctx.fillStyle = KTC.Zones.biome(L.cores[KTC.Zones.nearestCore(L.cores, wx, wy).i].biome).minimap;
        ctx.fillRect(ox + wx * sc - cw / 2, oy + wy * sc - ch / 2, cw, ch);
      }
      // roads
      ctx.strokeStyle = 'rgba(20,16,12,0.6)'; ctx.lineWidth = 1.5;
      for (const [a, c] of L.edges) {
        ctx.beginPath(); ctx.moveTo(ox + L.cores[a].x * sc, oy + L.cores[a].y * sc); ctx.lineTo(ox + L.cores[c].x * sc, oy + L.cores[c].y * sc); ctx.stroke();
      }
      // extraction points
      for (const ex of this.extractionPoints) {
        ctx.fillStyle = ex.holding ? '#fff2c0' : '#e3c06a';
        const ex2 = ox + ex.x * sc, ey2 = oy + ex.y * sc;
        ctx.beginPath(); ctx.moveTo(ex2, ey2 - 3); ctx.lineTo(ex2 + 3, ey2 + 2); ctx.lineTo(ex2 - 3, ey2 + 2); ctx.closePath(); ctx.fill();
      }
      // enemies as faint dots
      ctx.fillStyle = 'rgba(181,67,58,0.8)';
      for (const e of this.enemies) ctx.fillRect(ox + e.x * sc - 1, oy + e.y * sc - 1, 2, 2);
      // player
      if (this.player) {
        ctx.fillStyle = '#efe6d2';
        ctx.beginPath(); ctx.arc(ox + this.player.x * sc, oy + this.player.y * sc, 2.5, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
    }

    // "HOLD E" prompt on the nearest closed container + progress rings on any
    // container mid-channel (drawn in world space, so they track the camera)
    renderLootPrompts(ctx) {
      const p = this.player;
      if (!p || p.dead) return;
      const near = p.nearContainer;
      if (near && !near.opened && near.lootProgress <= 0) {
        ctx.font = '6px "Courier New", monospace';
        ctx.textAlign = 'center';
        const ty = near.y - near.hh - 6 + Math.sin(performance.now() / 300) * 1.2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText('HOLD E', near.x + 0.6, ty + 0.6);
        ctx.fillStyle = '#e8e0cf';
        ctx.fillText('HOLD E', near.x, ty);
        ctx.textAlign = 'left';
      }
      for (const c of this.level.containers) {
        if (c.opened || c.lootProgress <= 0) continue;
        ctx.save();
        ctx.translate(c.x, c.y - 8);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, U.TAU); ctx.stroke();
        ctx.strokeStyle = '#e3c06a';
        ctx.beginPath();
        ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + U.TAU * (c.lootProgress / c.channelTime));
        ctx.stroke();
        ctx.restore();
      }
    }

    renderExtract(ctx, ex) {
      ctx.save();
      ctx.translate(ex.x, ex.y);
      S.stagecoach(ctx, ex.done ? 0 : ex.glow);
      ctx.restore();
      // hold progress ring
      if (!ex.done && ex.progress > 0) {
        ctx.save();
        ctx.translate(ex.x, ex.y - 14);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, U.TAU); ctx.stroke();
        ctx.strokeStyle = ex.holding ? '#e3c06a' : '#9a8a5a';
        ctx.beginPath(); ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + U.TAU * (ex.progress / HOLD_TIME)); ctx.stroke();
        ctx.restore();
      }
    }

    renderPostFX(ctx) {
      const w = this.canvas.width, h = this.canvas.height;
      // vignette + haze
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(20,18,14,0)');
      g.addColorStop(1, 'rgba(14,12,9,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // low-hp danger vignette
      if (this.player && this.state === 'raid' && this.player.hp <= 2 && !this.player.dead) {
        const pulse = 0.18 + 0.12 * Math.sin(performance.now() / 200);
        ctx.fillStyle = `rgba(120,20,20,${pulse})`;
        ctx.fillRect(0, 0, w, h);
      }
      // damage flash
      if (this.damageFlash > 0) {
        ctx.fillStyle = `rgba(150,30,25,${this.damageFlash * 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }

      // directional damage indicator — an arc at the screen edge toward the hit
      if (this.damageDirT > 0) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(this.damageDir);
        ctx.globalAlpha = U.clamp(this.damageDirT, 0, 1) * 0.8;
        ctx.strokeStyle = '#e0483a';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(w, h) * 0.42, -0.5, 0.5);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // showdown: warm gold wash + pulsing edges + banner
      if (this.showdown && this.showdown.active) {
        const fade = Math.min(1, this.showdown.t);
        ctx.fillStyle = `rgba(120,88,20,${0.14 * fade})`;
        ctx.fillRect(0, 0, w, h);
        const eg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
        eg.addColorStop(0, 'rgba(0,0,0,0)');
        eg.addColorStop(1, `rgba(150,110,30,${0.35 * fade})`);
        ctx.fillStyle = eg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#e3c06a';
        ctx.font = 'bold 34px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('S H O W D O W N', w / 2, 96);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    renderExtractArrow(ctx, camLeft, camTop) {
      if (!this.player || this.player.dead || !this.extractionPoints.length) return;
      // point at the nearest extraction (or the one being held)
      let ex = this.extract, bd = 1e12;
      if (!ex) for (const e of this.extractionPoints) { const d = U.dist2(this.player.x, this.player.y, e.x, e.y); if (d < bd) { bd = d; ex = e; } }
      if (!ex) return;
      const esx = (ex.x - camLeft) * ZOOM, esy = (ex.y - camTop) * ZOOM;
      const w = this.canvas.width, h = this.canvas.height;
      const margin = 60;
      const onScreen = esx > 0 && esx < w && esy > 0 && esy < h;
      if (onScreen) return;
      const cx = w / 2, cy = h / 2;
      const a = Math.atan2(esy - cy, esx - cx);
      const ax = U.clamp(cx + Math.cos(a) * (w / 2 - margin), margin, w - margin);
      const ay = U.clamp(cy + Math.sin(a) * (h / 2 - margin), margin, h - margin);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = ex.holding ? '#e3c06a' : 'rgba(227,192,106,0.9)';
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#e3c06a';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXTRACT', ax, ay - 16);
      ctx.textAlign = 'left';
    }

    renderCrosshair(ctx) {
      const x = In.mouse.sx, y = In.mouse.sy;
      ctx.strokeStyle = 'rgba(240,232,207,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, U.TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y);
      ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y);
      ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4);
      ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12);
      ctx.stroke();
    }
  }

  KTC.Game = Game;
})(window.KTC);
