# Kill the Crows — HTML edition

A browser game that is **mainly [Kill the Crows]** — a top-down western gunslinger
where **one bullet kills one crow**, and the revolver's reload window is the moment
that gets you killed — blended with two other genres:

- **Enter the Gungeon** — a dodge-roll with invincibility frames, telegraphed
  projectiles to weave through, and a small arsenal of guns that each feel
  different (with one-shot kills, guns differ by *handling*, not damage).
- **An extraction shooter** — you don't play for score, you play for *loot*.
  Rummage containers to fill a limited **satchel** with valuables, then reach the
  stagecoach and hold it to **extract**. Get gunned down first and the dirt keeps
  everything you were carrying. Bank what you escape with, spend it in camp.

It's built with plain HTML5 canvas and vanilla JavaScript — **no build step, no
libraries, and no image/audio assets**. Every sprite is drawn from code and every
sound is synthesized with WebAudio, so the whole thing runs offline.

## Play it

Just open **`index.html`** in any modern browser (double-click it — it runs from
`file://`). Or serve the folder if you prefer:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Your stash, upgrades, and owned weapons are saved in the browser (localStorage).

## Controls

| Action | Key |
| --- | --- |
| Move | **W A S D** / arrow keys |
| Aim | **Mouse** |
| Shoot | **Left click** (hold for automatic guns) |
| Reload | **R** (also auto-reloads when empty) |
| Dodge roll | **Space** (i-frames + short cooldown) |
| Loot | **hold E** next to a crate / barrel / wagon / well |
| Satchel | **hold Tab** to see what you're carrying |
| Pause | **Esc** |

## Read the tells

Every crow dies to a single bullet — but so can you, if you ignore the wind-ups:

- **Rusher** — sprints at you and raises the knife for a beat (watch for the
  flash) before the strike.
- **Gunman** — stops dead and charges for **~3 seconds**: his aim line glows
  brighter until he fires a single slow bullet. Dodge it, or shoot him first —
  stillness is his weakness.
- **Sniper** — lurks at the edge of the fight behind a thin red laser. He charges
  for **~5 seconds**; for the final stretch the laser **locks in place and
  blinks** — that's your window to step out of the line before the near-instant
  shot. Hunt him early or keep moving.
- **Brute** — leans back, kicks up dust for a second, then shoulder-charges in a
  straight line for two hearts. Sidestep and he'll eat a wall.

## Looting

Containers aren't shot open — you **rummage** them: stand close, hold **E**, and
stay exposed while the ring fills (crates are quick; the wagon and the old well
are slow but rich). You can't shoot mid-rummage, moving cancels, and getting hit
interrupts — looting is a risk you *choose*, like reloading.

- **Loose gold** (from kills and containers) is weightless and just counts up.
- **Valuables** (Pocket Watch, Gold Tooth, Deputy Badge…) each take one slot in
  your satchel — **6 slots** to start, more with the *Bigger Satchel* upgrade.
  When the bag is full, the leftovers stay glittering in the dirt: extract now,
  or push your luck.
- **Extract** to bank the gold *and* every item in the satchel. **Die** and the
  death screen itemizes exactly what you lost.

## The loop

```
CAMP ──► RAID ──► reach the stagecoach & hold ──► EXTRACTED (haul banked)
  ▲         │
  │         └──► gunned down ──────────────────► DEAD (haul lost)
  │                                                  │
  └──── spend banked gold in the General Store ◄─────┘
```

In the **General Store** you can buy new irons (Sawn-off, Lever Rifle, Repeater)
and permanent upgrades (max health, cylinder capacity, faster reloads, shorter
dodge cooldown, movement speed, satchel size). The town, its loot, and the
extraction point are re-seeded every raid, and enemy pressure ramps the longer
you linger.

## Project layout

```
index.html            page + ordered <script> includes (classic scripts, window.KTC)
css/style.css         HUD + menu/shop styling
js/
  util.js             math, RNG, collision helpers
  input.js            keyboard + mouse
  sprites.js          palette + all procedural pixel art
  audio.js            WebAudio-synthesized sound effects
  weapons.js          data-driven gun table (handling-based, one-shot kills)
  particles.js        particles, screen shake, floating text
  projectile.js       bullets + collision resolution
  loot.js             pickups, containers, hold-E channels, valuables
  enemy.js            crow AI (telegraphed attacks) + the wave director
  player.js           movement, dodge, shooting, reload, loot channel
  level.js            hybrid town generation + collision
  save.js             persistent stash / upgrades (localStorage)
  ui.js               DOM HUD, satchel panel, menus, camp, shop, results
  game.js             state machine, camera, world rendering
  main.js             bootstrap
```

[Kill the Crows]: https://store.steampowered.com/app/1972440/Kill_The_Crows/
