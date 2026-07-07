# Kill the Crows — HTML edition

A browser game that is **mainly [Kill the Crows]** — a top-down western gunslinger
where **one bullet kills one crow**, and the revolver's reload window is the moment
that gets you killed — blended with two other genres:

- **Enter the Gungeon** — a dodge-roll with invincibility frames, telegraphed
  projectiles to weave through, an arsenal of guns with distinct *behaviors*
  (with one-shot kills, guns differ by handling and trick rounds, not damage),
  and a **roguelike trinket** layer whose effects stack into wild synergies.
- **An extraction shooter** — you don't play for score, you play for *loot*.
  Rummage containers to fill a limited **satchel** with valuables, crack glowing
  caches for trinkets, then reach the stagecoach and hold it to **extract**. Get
  gunned down first and the dirt keeps everything you were carrying. Bank what you
  escape with, spend it in camp.

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
| Loot | **hold E** next to a crate / barrel / wagon / well / cache |
| Showdown | **Q** or **right-click** when the meter is full |
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

## Showdown

Kills feed a **Showdown** meter. When it's full, hit **Q** (or right-click) to
drop into a high-noon bullet-time: the Crows crawl, your cylinder never runs dry,
and you fan the hammer to clean house. Trinkets like *Deadeye Battery* (charges
faster) and *High Noon* (lasts longer) lean the whole build into it.

## Trinkets & builds (the roguelike layer)

Glowing **caches** in the raid cough up worn **trinkets** — passive charms that
stack and cross-pollinate, à la Balatro jokers. Weapon **racks** hand you
stranger irons: a **Bouncer** (ricochet), **Hex Pistol** (homing), **Arc Coil**
(chain lightning), **Buffalo Rifle** (pierces a whole line), **Boomstick**
(explosive slugs). Behaviors from guns and trinkets *add together*, so:

- **Powder Keg** (crows explode on death) + **Ricochet Rounds** / **Live Wire**
  (hits spread to more crows) → chain-reaction screen clears.
- **Twin Fang** doubles *every* on-kill effect — double explosions, double gold,
  double heals.
- **Gunslinger's Ledger** pays gold per trinket you carry, so a fat build pays
  itself off; stack **Prospector's Pact** and **Lucky Coin** for a gold engine.

**Insurance vs. risk:** the trinkets you equip in **camp** (up to your belt slots)
and your chosen iron are *insured* — kept even if you die. Trinkets and guns you
**find in a raid** are lost if you're killed, and only yours once you extract.
Buy trinkets and belt slots in the General Store, or gamble on finding them.

## The loop

```
CAMP ──► RAID ──► reach the stagecoach & hold ──► EXTRACTED (haul banked)
  ▲         │
  │         └──► gunned down ──────────────────► DEAD (haul lost)
  │                                                  │
  └──── spend banked gold in the General Store ◄─────┘
```

In the **General Store** you can buy new irons (from the Sawn-off up to the
behavior guns), **trinkets**, and permanent upgrades (max health, cylinder
capacity, faster reloads, shorter dodge cooldown, movement speed, satchel size,
trinket belt slots). The town, its loot, the caches, and the extraction point are
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
  weapons.js          data-driven gun table (handling + projectile behaviors)
  trinkets.js         roguelike passives: mods + event hooks + synergies
  particles.js        particles, screen shake, floating text, lightning bolts
  projectile.js       tracer bullets + behaviors (pierce/bounce/explode/home/chain)
  loot.js             pickups, containers, caches, hold-E channels, valuables
  enemy.js            crow AI (telegraphed attacks) + the wave director
  player.js           movement, dodge, shooting, reload, loot channel, mods
  level.js            hybrid town generation + collision
  save.js             persistent stash / trinkets / upgrades (localStorage)
  ui.js               DOM HUD, showdown meter, satchel, camp, shop, results
  game.js             state machine, camera, rendering, mods/events/showdown
  main.js             bootstrap
```

[Kill the Crows]: https://store.steampowered.com/app/1972440/Kill_The_Crows/
