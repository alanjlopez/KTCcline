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
      KTC.Audio.setMuted(this.save.muted);

      this.level = new KTC.Level();
      this.particles = new KTC.Particles();
      this.spawner = new KTC.Spawner();

      this.player = null;
      this.enemies = [];
      this.projectiles = [];
      this.pickups = [];

      this.camera = { x: this.level.w / 2, y: this.level.h / 2 };
      this.run = null;
      this.extract = null;
      this.damageFlash = 0;
      this.menuPan = 0;
      this.lastMoveMsg = 0;

      this.ui = new KTC.UI(this);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('blur', () => { if (this.state === 'raid') this.setState('paused'); });

      this.level.generate();  // backdrop for the menu
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

    // ---------------- raid lifecycle ----------------
    startRaid() {
      KTC.Audio.unlock();
      this.level.generate();
      this.player = new KTC.Player(this.level.spawn.x, this.level.spawn.y);
      this.player.applyStats(KTC.Save.deriveStats(this.save));
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.particles.clear();
      this.spawner.reset();
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
      const stats = KTC.Save.deriveStats(this.save);
      this.run = {
        gold: 0,
        satchel: [],                    // [{name, value}] — limited slots
        cap: stats.satchelCap,
        kills: 0, time: 0, combo: 0, comboT: 0, comboMax: 0,
      };
      this.damageFlash = 0;
      this._fullToastT = 0;

      // place the extraction stagecoach at the candidate farthest from spawn
      let best = this.level.extractCandidates[0], bd = -1;
      for (const c of this.level.extractCandidates) {
        const d = U.dist(c.x, c.y, this.player.x, this.player.y);
        if (d > bd) { bd = d; best = c; }
      }
      this.extract = { x: best.x, y: best.y, progress: 0, holding: false, done: false, moveT: 26, glow: 0 };
      this.setState('raid');
    }

    relocateExtract() {
      const cands = this.level.extractCandidates.filter(
        (c) => U.dist(c.x, c.y, this.extract.x, this.extract.y) > 200 &&
               U.dist(c.x, c.y, this.player.x, this.player.y) > 300);
      if (!cands.length) return;
      const c = U.pick(cands);
      this.particles.burst(this.extract.x, this.extract.y - 10, 18, {
        color: ['#6b6153', '#8a7f6b'], speedMin: 20, speedMax: 90, lifeMin: 0.3, lifeMax: 0.7, size: 3,
      });
      this.extract.x = c.x; this.extract.y = c.y;
      this.extract.moveT = 26;
      this.ui.toast('The stagecoach moved on!');
    }

    // ---------------- combat callbacks ----------------
    onEnemyKilled(e) {
      const r = this.run;
      r.kills++;
      r.combo++;
      r.comboT = 3;
      r.comboMax = Math.max(r.comboMax, r.combo);
      // chaining kills pays a small bounty
      const bonus = Math.floor(r.combo / 3);
      if (bonus > 0) {
        r.gold += bonus;
        this.particles.text(e.x, e.y - e.hh - 6, `x${r.combo}`, '#e3c06a', { life: 0.7, size: 7 });
      }
    }

    // gold is a weightless counter, carried loose in your pockets
    addGold(value, x, y) {
      this.run.gold += value;
      this.particles.text(x, y - 10, '+' + value, '#e3c06a', { life: 0.7, size: 6 });
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

    onPlayerDamaged() {
      this.damageFlash = 0.5;
      this.run.combo = 0;
    }

    onPlayerDeath() {
      const s = this.save;
      s.stats.deaths++;
      s.stats.raids++;
      s.stats.kills += this.run.kills;
      KTC.Save.save(s);
      this._deathT = 1.4;   // brief slow-mo before the screen
    }

    extractSuccess() {
      this.extract.done = true;
      const s = this.save;
      const haul = this.runValue();
      s.gold += haul;
      s.stats.extractions++;
      s.stats.raids++;
      s.stats.kills += this.run.kills;
      s.stats.bestLoot = Math.max(s.stats.bestLoot, haul);
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
      this.update(dt);
      this.render();
      In.endFrame();
      requestAnimationFrame((n) => this.frame(n));
    }

    update(dt) {
      this.menuPan += dt;
      if (this.state === 'menu' || this.state === 'camp' || this.state === 'extracted' || this.state === 'dead') {
        // gentle drifting backdrop
        this.camera.x = this.level.w / 2 + Math.cos(this.menuPan * 0.15) * this.level.w * 0.18;
        this.camera.y = this.level.h / 2 + Math.sin(this.menuPan * 0.12) * this.level.h * 0.16;
        this.particles.update(dt);
        return;
      }
      if (this.state === 'paused') return;
      if (this.state !== 'raid') return;

      if (In.justPressed('Escape')) { this.setState('paused'); return; }

      // camera + world-space mouse (computed before player so aim is current)
      this.updateCamera(dt);
      const camLeft = this.camera.x - (this.canvas.width / ZOOM) / 2;
      const camTop = this.camera.y - (this.canvas.height / ZOOM) / 2;
      In.mouse.wx = camLeft + In.mouse.sx / ZOOM;
      In.mouse.wy = camTop + In.mouse.sy / ZOOM;

      const p = this.player;

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

      p.update(dt, this);
      this.spawner.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      for (const pr of this.projectiles) pr.update(dt, this);
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

    updateExtract(dt) {
      const ex = this.extract;
      if (ex.done) return;
      ex.glow += dt;
      const p = this.player;
      const d = U.dist(p.x, p.y, ex.x, ex.y);
      const inRange = d < EXTRACT_RADIUS && !p.dead;
      if (inRange) {
        const before = ex.progress;
        ex.holding = true;
        ex.progress += dt;
        if (Math.floor(ex.progress) !== Math.floor(before)) KTC.Audio.extractTick();
        if (ex.progress >= HOLD_TIME) this.extractSuccess();
      } else {
        ex.holding = false;
        ex.progress = Math.max(0, ex.progress - dt * 1.5);
        if (ex.progress <= 0.01) {
          ex.moveT -= dt;
          if (ex.moveT <= 0) this.relocateExtract();
        }
      }
    }

    updateCamera(dt) {
      const vw = this.canvas.width / ZOOM, vh = this.canvas.height / ZOOM;
      let cx = this.player.x, cy = this.player.y - 8;
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

      // gather y-sorted drawables
      const draw = [];
      for (const pr of this.level.props) draw.push(pr);
      for (const c of this.level.containers) draw.push(c);
      for (const pk of this.pickups) draw.push(pk);
      for (const e of this.enemies) draw.push(e);
      if (this.player && !this.player.dead && (this.state === 'raid' || this.state === 'paused')) draw.push(this.player);
      if (this.extract) draw.push({ y: this.extract.y, render: (c) => this.renderExtract(c) });
      draw.sort((a, b) => a.y - b.y);
      for (const d of draw) d.render(ctx);

      // dead player corpse
      if (this.player && this.player.dead && this.state !== 'menu' && this.state !== 'camp') {
        ctx.save();
        ctx.translate(this.player.x, this.player.y);
        ctx.rotate(Math.PI / 2);
        ctx.globalAlpha = 0.9;
        S.player(ctx, { aim: 0, walk: 0, gun: this.player.weapon().sprite });
        ctx.restore();
      }

      for (const pr of this.projectiles) pr.render(ctx);
      this.particles.render(ctx);
      if (this.state === 'raid' || this.state === 'paused') this.renderLootPrompts(ctx);
      this.particles.renderText(ctx);

      // ---- screen-space overlays ----
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.renderPostFX(ctx);
      if (this.state === 'raid' || this.state === 'paused') {
        this.renderExtractArrow(ctx, camLeft, camTop);
        this.renderCrosshair(ctx);
      }
      if (this.state === 'menu' || this.state === 'camp' || this.state === 'extracted' || this.state === 'dead') {
        // darken backdrop so DOM overlays read clearly
        ctx.fillStyle = 'rgba(20,18,14,0.55)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
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

    renderExtract(ctx) {
      const ex = this.extract;
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
    }

    renderExtractArrow(ctx, camLeft, camTop) {
      if (!this.extract || this.extract.done || !this.player) return;
      const ex = this.extract;
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
