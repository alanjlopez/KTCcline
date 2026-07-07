# Kill the Crows — HTML edition

A browser game that is **mainly [Kill the Crows]** — a top-down western gunslinger
with a limited-ammo revolver and reload-timing pressure against waves of masked
"crow" bandits — blended with two other genres:

- **Enter the Gungeon** — a dodge-roll with invincibility frames, bullet-hell
  projectiles to weave through, and a small arsenal of guns that each feel
  different.
- **An extraction shooter** — you don't play for score, you play for *loot*.
  Everything you pick up in a raid only becomes yours if you reach the stagecoach
  and hold it long enough to **extract**. Get gunned down first and you lose the
  whole run's haul. Bank what you escape with, then spend it in camp to come back
  deadlier.

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
| Pause | **Esc** |

Break crates, barrels, wagons and the old well for loot, gun down the Crows for
gold, then follow the **EXTRACT** arrow to the stagecoach and stand your ground on
it until the counter fills. The reload window is your most dangerous moment — a
frenzy of Crows swarms in while you're extracting, so pick your reloads and rolls
carefully.

## The loop

```
CAMP ──► RAID ──► reach the stagecoach & hold ──► EXTRACTED (loot banked)
  ▲         │
  │         └──► gunned down ──────────────────► DEAD (loot lost)
  │                                                  │
  └──── spend banked gold in the General Store ◄─────┘
```

In the **General Store** you can buy new irons (Sawn-off, Lever Rifle, Repeater)
and permanent upgrades (max health, cylinder capacity, faster reloads, shorter
dodge cooldown, movement speed). The town, its loot, and the extraction point are
re-seeded every raid, and enemy pressure ramps the longer you linger.

## Project layout

```
index.html            page + ordered <script> includes (classic scripts, window.KTC)
css/style.css         HUD + menu/shop styling
js/
  util.js             math, RNG, collision helpers
  input.js            keyboard + mouse
  sprites.js          palette + all procedural pixel art
  audio.js            WebAudio-synthesized sound effects
  weapons.js          data-driven gun table
  particles.js        particles, screen shake, floating text
  projectile.js       bullets + collision resolution
  loot.js             pickups, containers, the run bag
  enemy.js            crow AI + the wave director
  player.js           movement, dodge, shooting, reload, health
  level.js            hybrid town generation + collision
  save.js             persistent stash / upgrades (localStorage)
  ui.js               DOM HUD, menus, camp, shop, result screens
  game.js             state machine, camera, world rendering
  main.js             bootstrap
```

[Kill the Crows]: https://store.steampowered.com/app/1972440/Kill_The_Crows/
